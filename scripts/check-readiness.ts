// Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8
// Deployment readiness checklist — runs automated checks and lists manual items.
// CLI: npx tsx scripts/check-readiness.ts --stage production [--json] [--category dns,secrets]

import { promises as dns } from 'node:dns';
import { execSync } from 'node:child_process';
import {
  DescribeStacksCommand,
} from '@aws-sdk/client-cloudformation';
import {
  GetSecretValueCommand,
  ResourceNotFoundException,
} from '@aws-sdk/client-secrets-manager';
import {
  DescribeServicesCommand,
} from '@aws-sdk/client-ecs';
import {
  DescribeLogGroupsCommand,
  GetLogEventsCommand,
  DescribeLogStreamsCommand,
} from '@aws-sdk/client-cloudwatch-logs';
import {
  ListCertificatesCommand,
  DescribeCertificateCommand,
} from '@aws-sdk/client-acm';
import {
  GetDistributionCommand,
  ListDistributionsCommand,
} from '@aws-sdk/client-cloudfront';
import {
  aggregateResults,
  type CheckResult,
  type CheckCategory,
  REMEDIATION_HINTS,
} from './lib/checks.js';
import { formatReadinessReport } from './lib/reporter.js';
import {
  getCloudFormationClient,
  getSecretsManagerClient,
  getECSClient,
  getCloudWatchLogsClient,
  getACMClient,
  getCloudFrontClient,
} from './lib/aws.js';

interface CliOptions {
  stage: string;
  json: boolean;
  categories: CheckCategory[] | null;
}

interface CheckDefinition {
  id: string;
  name: string;
  category: CheckCategory;
  automated: boolean;
  run?: () => Promise<Omit<CheckResult, 'id' | 'name' | 'category' | 'automated' | 'durationMs'>>;
}

// --- CLI Argument Parsing ---

function parseArgs(argv: string[]): CliOptions {
  const args = argv.slice(2);
  let stage: string | undefined;
  let json = false;
  let categories: CheckCategory[] | null = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--stage' && i + 1 < args.length) {
      stage = args[++i];
    } else if (arg === '--json') {
      json = true;
    } else if (arg === '--category' && i + 1 < args.length) {
      categories = args[++i]!.split(',').map((c) => c.trim()) as CheckCategory[];
    }
  }

  if (!stage) {
    console.error(
      'Usage: npx tsx scripts/check-readiness.ts --stage <stage> [--json] [--category dns,secrets]'
    );
    console.error('');
    console.error('Options:');
    console.error('  --stage      Required. Target environment (e.g., production, staging)');
    console.error('  --json       Optional. Output results as JSON');
    console.error('  --category   Optional. Comma-separated list of categories to check');
    process.exit(1);
  }

  return { stage, json, categories };
}

// --- Check Implementations ---

async function checkDnsResolution(domain: string): Promise<Omit<CheckResult, 'id' | 'name' | 'category' | 'automated' | 'durationMs'>> {
  try {
    const addresses = await dns.resolve(domain);
    if (addresses.length > 0) {
      return { status: 'pass', expected: 'DNS resolves', actual: `Resolved to ${addresses[0]}` };
    }
    return {
      status: 'fail',
      expected: 'DNS resolves to at least one address',
      actual: 'No addresses returned',
      remediation: REMEDIATION_HINTS.dns,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      status: 'fail',
      expected: 'DNS resolves',
      actual: `DNS resolution failed: ${message}`,
      remediation: REMEDIATION_HINTS.dns,
    };
  }
}

async function checkOidc(): Promise<Omit<CheckResult, 'id' | 'name' | 'category' | 'automated' | 'durationMs'>> {
  try {
    const output = execSync('aws sts get-caller-identity --output json', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const identity = JSON.parse(output) as { Arn: string; Account: string };
    return {
      status: 'pass',
      expected: 'Valid AWS identity',
      actual: `Assumed: ${identity.Arn}`,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      status: 'fail',
      expected: 'aws sts get-caller-identity succeeds',
      actual: `STS call failed: ${message}`,
      remediation: REMEDIATION_HINTS.oidc,
    };
  }
}

async function checkStacks(stage: string): Promise<Omit<CheckResult, 'id' | 'name' | 'category' | 'automated' | 'durationMs'>> {
  const cfClient = getCloudFormationClient();
  const stackTypes = ['network', 'database', 'container', 'cdn', 'monitoring'];
  const failedStacks: string[] = [];
  const validStatuses = new Set(['CREATE_COMPLETE', 'UPDATE_COMPLETE']);

  for (const stackType of stackTypes) {
    const stackName = `${stage}-${stackType}`;
    try {
      const response = await cfClient.send(
        new DescribeStacksCommand({ StackName: stackName })
      );
      const stack = response.Stacks?.[0];
      if (!stack || !stack.StackStatus || !validStatuses.has(stack.StackStatus)) {
        failedStacks.push(`${stackName}: ${stack?.StackStatus ?? 'NOT_FOUND'}`);
      }
    } catch {
      failedStacks.push(`${stackName}: NOT_FOUND`);
    }
  }

  if (failedStacks.length === 0) {
    return {
      status: 'pass',
      expected: 'All 5 stacks in CREATE_COMPLETE or UPDATE_COMPLETE',
      actual: 'All stacks healthy',
    };
  }

  return {
    status: 'fail',
    expected: 'All 5 stacks in CREATE_COMPLETE or UPDATE_COMPLETE',
    actual: `Failed: ${failedStacks.join(', ')}`,
    remediation: REMEDIATION_HINTS.stacks,
  };
}

async function checkSecrets(stage: string): Promise<Omit<CheckResult, 'id' | 'name' | 'category' | 'automated' | 'durationMs'>> {
  const smClient = getSecretsManagerClient();
  const secretPaths = [
    `/solo-founder-launch-os/${stage}/session/secret`,
    `/solo-founder-launch-os/${stage}/encryption/key`,
    `/solo-founder-launch-os/${stage}/github/client-id`,
    `/solo-founder-launch-os/${stage}/github/client-secret`,
    `/solo-founder-launch-os/${stage}/github/callback-url`,
  ];

  const missing: string[] = [];

  for (const path of secretPaths) {
    try {
      const response = await smClient.send(
        new GetSecretValueCommand({ SecretId: path })
      );
      if (!response.SecretString || response.SecretString.length === 0) {
        missing.push(`${path} (empty)`);
      }
    } catch (err: unknown) {
      if (err instanceof ResourceNotFoundException) {
        missing.push(`${path} (not found)`);
      } else {
        missing.push(`${path} (error)`);
      }
    }
  }

  if (missing.length === 0) {
    return {
      status: 'pass',
      expected: 'All secrets exist and are non-empty',
      actual: `${secretPaths.length} secrets validated`,
    };
  }

  return {
    status: 'fail',
    expected: 'All secrets exist and are non-empty',
    actual: `Missing/empty: ${missing.join(', ')}`,
    remediation: REMEDIATION_HINTS.secrets,
  };
}

async function checkEcs(stage: string): Promise<Omit<CheckResult, 'id' | 'name' | 'category' | 'automated' | 'durationMs'>> {
  const ecsClient = getECSClient();
  const clusterName = `solo-founder-${stage}-cluster`;
  const serviceName = `solo-founder-${stage}-api`;

  try {
    const response = await ecsClient.send(
      new DescribeServicesCommand({
        cluster: clusterName,
        services: [serviceName],
      })
    );

    const service = response.services?.[0];
    if (!service) {
      return {
        status: 'fail',
        expected: 'ECS service exists with ≥1 healthy task',
        actual: `Service ${serviceName} not found in cluster ${clusterName}`,
        remediation: 'Deploy the container stack first: npx tsx scripts/bootstrap.ts --stage ' + stage,
      };
    }

    const runningCount = service.runningCount ?? 0;
    if (runningCount >= 1) {
      return {
        status: 'pass',
        expected: '≥1 healthy task running',
        actual: `${runningCount} task(s) running`,
      };
    }

    return {
      status: 'fail',
      expected: '≥1 healthy task running',
      actual: `${runningCount} tasks running (desired: ${service.desiredCount ?? 0})`,
      remediation: 'Check ECS task logs and container health. Service may be starting up.',
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      status: 'fail',
      expected: 'ECS service accessible',
      actual: `ECS API error: ${message}`,
      remediation: 'Verify AWS credentials and that the ECS cluster exists.',
    };
  }
}

async function checkMonitoring(stage: string): Promise<Omit<CheckResult, 'id' | 'name' | 'category' | 'automated' | 'durationMs'>> {
  const cwlClient = getCloudWatchLogsClient();
  const logGroupName = `/solo-founder-launch-os/${stage}/api`;

  try {
    // Check log group exists
    const describeResponse = await cwlClient.send(
      new DescribeLogGroupsCommand({ logGroupNamePrefix: logGroupName })
    );

    const logGroup = describeResponse.logGroups?.find(
      (lg) => lg.logGroupName === logGroupName
    );

    if (!logGroup) {
      return {
        status: 'fail',
        expected: 'CloudWatch log group exists with recent events',
        actual: `Log group ${logGroupName} not found`,
        remediation: REMEDIATION_HINTS.monitoring,
      };
    }

    // Check for recent log streams
    const streamsResponse = await cwlClient.send(
      new DescribeLogStreamsCommand({
        logGroupName,
        orderBy: 'LastEventTime',
        descending: true,
        limit: 1,
      })
    );

    const latestStream = streamsResponse.logStreams?.[0];
    if (!latestStream || !latestStream.lastEventTimestamp) {
      return {
        status: 'fail',
        expected: 'Log group has recent events',
        actual: 'No log streams with events found',
        remediation: REMEDIATION_HINTS.monitoring,
      };
    }

    const fifteenMinutesAgo = Date.now() - 15 * 60 * 1000;
    if (latestStream.lastEventTimestamp < fifteenMinutesAgo) {
      return {
        status: 'fail',
        expected: 'Log events within last 15 minutes',
        actual: `Last event: ${new Date(latestStream.lastEventTimestamp).toISOString()}`,
        remediation: REMEDIATION_HINTS.monitoring,
      };
    }

    return {
      status: 'pass',
      expected: 'Log group exists with recent events',
      actual: `Last event: ${new Date(latestStream.lastEventTimestamp).toISOString()}`,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      status: 'fail',
      expected: 'CloudWatch log group accessible',
      actual: `CloudWatch Logs API error: ${message}`,
      remediation: REMEDIATION_HINTS.monitoring,
    };
  }
}

async function checkBundle(): Promise<Omit<CheckResult, 'id' | 'name' | 'category' | 'automated' | 'durationMs'>> {
  try {
    execSync('npx tsx scripts/check-bundle.ts --json', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd(),
    });
    return {
      status: 'pass',
      expected: 'Bundle size within 500KB gzipped limit',
      actual: 'Bundle check passed',
    };
  } catch (err: unknown) {
    const stderr = err instanceof Error && 'stderr' in err
      ? (err as Error & { stderr: string }).stderr
      : '';
    const stdout = err instanceof Error && 'stdout' in err
      ? (err as Error & { stdout: string }).stdout
      : '';
    return {
      status: 'fail',
      expected: 'Bundle size within 500KB gzipped limit',
      actual: `Bundle check failed: ${stderr || stdout || 'Unknown error'}`.slice(0, 200),
      remediation: REMEDIATION_HINTS.bundle,
    };
  }
}

async function checkTlsCertificate(domain: string): Promise<Omit<CheckResult, 'id' | 'name' | 'category' | 'automated' | 'durationMs'>> {
  const acmClient = getACMClient();
  const MIN_DAYS_REMAINING = 30;

  try {
    const listResponse = await acmClient.send(
      new ListCertificatesCommand({ CertificateStatuses: ['ISSUED'] })
    );

    const certificates = listResponse.CertificateSummaryList ?? [];
    const matchingCert = certificates.find(
      (cert) => cert.DomainName === domain || cert.DomainName === `*.${domain.split('.').slice(1).join('.')}`
    );

    if (!matchingCert || !matchingCert.CertificateArn) {
      return {
        status: 'fail',
        expected: `ACM certificate for ${domain} with > ${MIN_DAYS_REMAINING} days remaining`,
        actual: 'Certificate not found',
        remediation: REMEDIATION_HINTS.tls,
      };
    }

    const describeResponse = await acmClient.send(
      new DescribeCertificateCommand({ CertificateArn: matchingCert.CertificateArn })
    );

    const certificate = describeResponse.Certificate;
    if (!certificate || !certificate.NotAfter) {
      return {
        status: 'fail',
        expected: `Certificate valid with > ${MIN_DAYS_REMAINING} days remaining`,
        actual: 'Unable to determine certificate expiration',
        remediation: REMEDIATION_HINTS.tls,
      };
    }

    const now = new Date();
    const expiresAt = new Date(certificate.NotAfter);
    const daysRemaining = Math.floor(
      (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysRemaining > MIN_DAYS_REMAINING) {
      return {
        status: 'pass',
        expected: `> ${MIN_DAYS_REMAINING} days until expiration`,
        actual: `${daysRemaining} days remaining (expires ${expiresAt.toISOString().split('T')[0]})`,
      };
    }

    return {
      status: 'fail',
      expected: `> ${MIN_DAYS_REMAINING} days until expiration`,
      actual: `Only ${daysRemaining} days remaining (expires ${expiresAt.toISOString().split('T')[0]})`,
      remediation: REMEDIATION_HINTS.tls,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      status: 'fail',
      expected: `ACM certificate for ${domain} accessible`,
      actual: `ACM API error: ${message}`,
      remediation: REMEDIATION_HINTS.tls,
    };
  }
}

async function checkCloudFront(): Promise<Omit<CheckResult, 'id' | 'name' | 'category' | 'automated' | 'durationMs'>> {
  const cfClient = getCloudFrontClient();

  try {
    const listResponse = await cfClient.send(new ListDistributionsCommand({}));
    const distributions = listResponse.DistributionList?.Items ?? [];

    // Find the distribution that serves app.solo-founder.space
    const webDistribution = distributions.find(
      (d) => d.Aliases?.Items?.includes('app.solo-founder.space')
    );

    if (!webDistribution) {
      return {
        status: 'fail',
        expected: 'CloudFront distribution serving app.solo-founder.space',
        actual: 'No distribution found with alias app.solo-founder.space',
        remediation: 'Deploy the CDN stack and configure the CNAME alias.',
      };
    }

    if (webDistribution.Enabled && webDistribution.Status === 'Deployed') {
      return {
        status: 'pass',
        expected: 'CloudFront distribution enabled and deployed',
        actual: `Distribution ${webDistribution.Id} is ${webDistribution.Status}`,
      };
    }

    return {
      status: 'fail',
      expected: 'CloudFront distribution enabled and deployed',
      actual: `Distribution ${webDistribution.Id}: enabled=${webDistribution.Enabled}, status=${webDistribution.Status}`,
      remediation: 'Check CloudFront distribution status and ensure it is enabled.',
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      status: 'fail',
      expected: 'CloudFront distribution accessible',
      actual: `CloudFront API error: ${message}`,
      remediation: 'Verify AWS credentials and CloudFront permissions.',
    };
  }
}

// --- Check Definitions ---

function buildCheckDefinitions(stage: string): CheckDefinition[] {
  return [
    {
      id: 'dns-api',
      name: 'API DNS resolution (api.solo-founder.space)',
      category: 'dns',
      automated: true,
      run: () => checkDnsResolution('api.solo-founder.space'),
    },
    {
      id: 'dns-web',
      name: 'Web DNS resolution (app.solo-founder.space)',
      category: 'dns',
      automated: true,
      run: () => checkDnsResolution('app.solo-founder.space'),
    },
    {
      id: 'oidc',
      name: 'OIDC role assumption (aws sts get-caller-identity)',
      category: 'oidc',
      automated: true,
      run: () => checkOidc(),
    },
    {
      id: 'stacks',
      name: 'CloudFormation stacks status',
      category: 'stacks',
      automated: true,
      run: () => checkStacks(stage),
    },
    {
      id: 'secrets',
      name: 'Secrets Manager validation',
      category: 'secrets',
      automated: true,
      run: () => checkSecrets(stage),
    },
    {
      id: 'ecs',
      name: 'ECS service health',
      category: 'stacks',
      automated: true,
      run: () => checkEcs(stage),
    },
    {
      id: 'monitoring',
      name: 'CloudWatch log group and recent events',
      category: 'monitoring',
      automated: true,
      run: () => checkMonitoring(stage),
    },
    {
      id: 'bundle',
      name: 'Frontend bundle size compliance',
      category: 'bundle',
      automated: true,
      run: () => checkBundle(),
    },
    {
      id: 'tls-api',
      name: 'API TLS certificate validity (api.solo-founder.space)',
      category: 'tls',
      automated: true,
      run: () => checkTlsCertificate('api.solo-founder.space'),
    },
    {
      id: 'tls-web',
      name: 'Web TLS certificate validity (app.solo-founder.space)',
      category: 'tls',
      automated: true,
      run: () => checkTlsCertificate('app.solo-founder.space'),
    },
    {
      id: 'cloudfront',
      name: 'CloudFront distribution status',
      category: 'stacks',
      automated: true,
      run: () => checkCloudFront(),
    },
    // Manual verification items (not automated)
    {
      id: 'manual-email',
      name: 'Confirm alarm notification email received',
      category: 'monitoring',
      automated: false,
    },
    {
      id: 'manual-oauth',
      name: 'Test GitHub OAuth login flow end-to-end',
      category: 'oidc',
      automated: false,
    },
    {
      id: 'manual-domain',
      name: 'Verify domain registration is complete',
      category: 'dns',
      automated: false,
    },
  ];
}

// --- Main Execution ---

async function runChecks(definitions: CheckDefinition[]): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  for (const check of definitions) {
    if (!check.automated || !check.run) {
      // Manual items — add as skip result
      results.push({
        id: check.id,
        name: check.name,
        category: check.category,
        automated: false,
        status: 'skip',
        durationMs: 0,
      });
      continue;
    }

    const startTime = Date.now();
    try {
      const result = await check.run();
      const durationMs = Date.now() - startTime;
      results.push({
        id: check.id,
        name: check.name,
        category: check.category,
        automated: true,
        durationMs,
        ...result,
      });
    } catch (err: unknown) {
      const durationMs = Date.now() - startTime;
      const message = err instanceof Error ? err.message : 'Unknown error';
      results.push({
        id: check.id,
        name: check.name,
        category: check.category,
        automated: true,
        status: 'fail',
        expected: 'Check completes without error',
        actual: `Unexpected error: ${message}`,
        remediation: REMEDIATION_HINTS[check.category],
        durationMs,
      });
    }
  }

  return results;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv);
  let definitions = buildCheckDefinitions(options.stage);

  // Filter by category if --category provided
  if (options.categories) {
    const allowedCategories = new Set(options.categories);
    definitions = definitions.filter((d) => allowedCategories.has(d.category));
  }

  if (!options.json) {
    console.log(`Running deployment readiness checks for stage: ${options.stage}`);
    console.log('');
  }

  const results = await runChecks(definitions);
  const report = aggregateResults(results, options.stage);
  const format = options.json ? 'json' : 'human';
  const output = formatReadinessReport(report, { format });

  console.log(output);

  // Exit 0 if 'go', exit 1 if 'no-go'
  process.exit(report.recommendation === 'go' ? 0 : 1);
}

main().catch((err: unknown) => {
  console.error('Fatal error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
