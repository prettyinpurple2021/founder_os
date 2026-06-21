// Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8
// CDK bootstrap + ordered stack deployment script.
// CLI: npx tsx scripts/bootstrap.ts --stage production [--skip-bootstrap] [--verbose] [--json]

import { execSync, type ExecSyncOptionsWithStringEncoding } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import {
  DescribeStacksCommand,
  DescribeStackEventsCommand,
  type StackEvent,
} from '@aws-sdk/client-cloudformation';
import { getCloudFormationClient } from './lib/aws.js';

export interface BootstrapOptions {
  stage: 'staging' | 'production';
  skipBootstrap?: boolean;
  verbose?: boolean;
  json?: boolean;
}

export interface DeploymentResult {
  stackName: string;
  status: 'CREATE_COMPLETE' | 'UPDATE_COMPLETE';
  outputs: Record<string, string>;
  duration: number; // ms
}

export interface BootstrapOutput {
  success: boolean;
  stacks: DeploymentResult[];
  resources: {
    albDnsName: string;
    cloudfrontDistributionId: string;
    ecrRepositoryUri: string;
    rdsEndpoint: string;
    ecsClusterArn: string;
  };
  smokeTest: { healthy: boolean; statusCode: number };
}

const STACK_ORDER = ['Network', 'Database', 'Container', 'Cdn', 'Monitoring'] as const;

const TERMINAL_STATUSES = new Set([
  'CREATE_COMPLETE',
  'UPDATE_COMPLETE',
  'DELETE_COMPLETE',
  'CREATE_FAILED',
  'UPDATE_FAILED',
  'DELETE_FAILED',
  'ROLLBACK_COMPLETE',
  'ROLLBACK_FAILED',
  'UPDATE_ROLLBACK_COMPLETE',
  'UPDATE_ROLLBACK_FAILED',
  'IMPORT_COMPLETE',
  'IMPORT_ROLLBACK_COMPLETE',
  'IMPORT_ROLLBACK_FAILED',
]);

const SUCCESS_STATUSES = new Set([
  'CREATE_COMPLETE',
  'UPDATE_COMPLETE',
  'IMPORT_COMPLETE',
]);

function getStackName(stackType: string, stage: string): string {
  const capitalizedStage = stage.charAt(0).toUpperCase() + stage.slice(1);
  return `SoloFounder${stackType}${capitalizedStage}`;
}

function parseArgs(argv: string[]): BootstrapOptions {
  const args = argv.slice(2);
  let stage: string | undefined;
  let skipBootstrap = false;
  let verbose = false;
  let json = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--stage' && i + 1 < args.length) {
      stage = args[++i];
    } else if (arg === '--skip-bootstrap') {
      skipBootstrap = true;
    } else if (arg === '--verbose') {
      verbose = true;
    } else if (arg === '--json') {
      json = true;
    }
  }

  if (!stage || (stage !== 'staging' && stage !== 'production')) {
    console.error(
      'Usage: npx tsx scripts/bootstrap.ts --stage <staging|production> [--skip-bootstrap] [--verbose] [--json]'
    );
    console.error('');
    console.error('Options:');
    console.error('  --stage           Required. Target environment: staging or production');
    console.error('  --skip-bootstrap  Optional. Skip cdk bootstrap (if already done)');
    console.error('  --verbose         Optional. Show detailed CDK output');
    console.error('  --json            Optional. Output results as JSON');
    process.exit(1);
  }

  return { stage: stage as 'staging' | 'production', skipBootstrap, verbose, json };
}

function getAccountAndRegion(): { account: string; region: string } {
  try {
    const identity = execSync('aws sts get-caller-identity --output json', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const parsed = JSON.parse(identity) as { Account: string };
    const region = process.env['AWS_REGION'] ?? process.env['AWS_DEFAULT_REGION'] ?? 'us-east-1';
    return { account: parsed.Account, region };
  } catch {
    console.error('Error: Unable to determine AWS account. Ensure AWS credentials are configured.');
    console.error('Run `aws configure` or set AWS_PROFILE environment variable.');
    process.exit(1);
  }
}

function runCdkBootstrap(account: string, region: string, verbose: boolean): void {
  const cmd = `npx cdk bootstrap aws://${account}/${region}`;
  const stdio: ExecSyncOptionsWithStringEncoding['stdio'] = verbose
    ? 'inherit'
    : ['pipe', 'pipe', 'pipe'];

  try {
    execSync(cmd, {
      encoding: 'utf-8',
      stdio,
      cwd: process.cwd(),
    });
  } catch (err: unknown) {
    console.error('Error: cdk bootstrap failed.');
    if (err instanceof Error && 'stderr' in err) {
      console.error((err as Error & { stderr: string }).stderr);
    }
    console.error('');
    console.error('Troubleshooting:');
    console.error('  - Verify IAM permissions allow CloudFormation stack creation');
    console.error('  - Check that the CDK toolkit stack is not in a failed state');
    console.error('  - Try running: aws cloudformation describe-stacks --stack-name CDKToolkit');
    process.exit(1);
  }
}

function deployCdkStack(stackName: string, stage: string, verbose: boolean): void {
  const cmd = `npx cdk deploy ${stackName} --require-approval never --context stage=${stage}`;
  const stdio: ExecSyncOptionsWithStringEncoding['stdio'] = verbose
    ? 'inherit'
    : ['pipe', 'pipe', 'pipe'];

  try {
    execSync(cmd, {
      encoding: 'utf-8',
      stdio,
      cwd: process.cwd(),
    });
  } catch (err: unknown) {
    // Don't exit here — we'll poll CloudFormation for the real status
    if (verbose && err instanceof Error && 'stderr' in err) {
      console.error((err as Error & { stderr: string }).stderr);
    }
  }
}

async function pollStackStatus(
  stackName: string,
  verbose: boolean
): Promise<{ status: string; outputs: Record<string, string> }> {
  const cfClient = getCloudFormationClient();
  const maxAttempts = 120; // 120 * 5s = 10 minutes max wait
  const pollInterval = 5000; // 5 seconds

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await cfClient.send(
        new DescribeStacksCommand({ StackName: stackName })
      );

      const stack = response.Stacks?.[0];
      if (!stack || !stack.StackStatus) {
        await sleep(pollInterval);
        continue;
      }

      if (verbose && attempt > 0) {
        process.stdout.write(`  Polling ${stackName}: ${stack.StackStatus}\r`);
      }

      if (TERMINAL_STATUSES.has(stack.StackStatus)) {
        const outputs: Record<string, string> = {};
        for (const output of stack.Outputs ?? []) {
          if (output.OutputKey && output.OutputValue) {
            outputs[output.OutputKey] = output.OutputValue;
          }
        }
        return { status: stack.StackStatus, outputs };
      }
    } catch {
      // Stack may not exist yet if deploy just started
    }

    await sleep(pollInterval);
  }

  return { status: 'TIMEOUT', outputs: {} };
}

async function getFailedStackEvents(stackName: string): Promise<StackEvent[]> {
  const cfClient = getCloudFormationClient();
  try {
    const response = await cfClient.send(
      new DescribeStackEventsCommand({ StackName: stackName })
    );

    return (response.StackEvents ?? []).filter(
      (event) =>
        event.ResourceStatus?.includes('FAILED') ||
        event.ResourceStatus?.includes('ROLLBACK')
    );
  } catch {
    return [];
  }
}

function printFailedEvents(stackName: string, events: StackEvent[]): void {
  console.error('');
  console.error(`  ✗ Stack ${stackName} failed. Error events:`);
  console.error('');

  for (const event of events.slice(0, 10)) {
    console.error(`    Resource: ${event.LogicalResourceId ?? 'unknown'}`);
    console.error(`    Status:   ${event.ResourceStatus ?? 'unknown'}`);
    if (event.ResourceStatusReason) {
      console.error(`    Reason:   ${event.ResourceStatusReason}`);
    }
    console.error('');
  }

  console.error('  Suggested rollback command:');
  console.error(`    npx cdk destroy ${stackName} --force`);
  console.error('');
}

async function runHealthCheck(albDnsName: string): Promise<{ healthy: boolean; statusCode: number }> {
  if (!albDnsName) {
    return { healthy: false, statusCode: 0 };
  }

  return new Promise((resolve) => {
    const protocol = albDnsName.startsWith('https') ? https : http;
    const url = albDnsName.startsWith('http')
      ? `${albDnsName}/health`
      : `http://${albDnsName}/health`;

    const request = protocol.get(url, { timeout: 10000 }, (res) => {
      resolve({ healthy: res.statusCode === 200, statusCode: res.statusCode ?? 0 });
      res.resume();
    });

    request.on('error', () => {
      resolve({ healthy: false, statusCode: 0 });
    });

    request.on('timeout', () => {
      request.destroy();
      resolve({ healthy: false, statusCode: 0 });
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractResources(stacks: DeploymentResult[]): BootstrapOutput['resources'] {
  const allOutputs: Record<string, string> = {};
  for (const stack of stacks) {
    Object.assign(allOutputs, stack.outputs);
  }

  return {
    albDnsName: allOutputs['AlbDnsName'] ?? allOutputs['LoadBalancerDnsName'] ?? '',
    cloudfrontDistributionId:
      allOutputs['CloudFrontDistributionId'] ?? allOutputs['DistributionId'] ?? '',
    ecrRepositoryUri: allOutputs['EcrRepositoryUri'] ?? allOutputs['RepositoryUri'] ?? '',
    rdsEndpoint: allOutputs['RdsEndpoint'] ?? allOutputs['DatabaseEndpoint'] ?? '',
    ecsClusterArn: allOutputs['EcsClusterArn'] ?? allOutputs['ClusterArn'] ?? '',
  };
}

function printHumanSummary(output: BootstrapOutput): void {
  console.log('');
  console.log('╭─────────────────────────────────────────────╮');
  console.log('│       Bootstrap Deployment Summary           │');
  console.log('╰─────────────────────────────────────────────╯');
  console.log('');

  for (const stack of output.stacks) {
    const icon = SUCCESS_STATUSES.has(stack.status) ? '✓' : '✗';
    const durationSec = (stack.duration / 1000).toFixed(1);
    console.log(`  ${icon} ${stack.stackName} — ${stack.status} (${durationSec}s)`);
  }

  console.log('');
  console.log('  Resources:');
  console.log(`    ALB DNS:         ${output.resources.albDnsName || '(not found)'}`);
  console.log(`    CloudFront ID:   ${output.resources.cloudfrontDistributionId || '(not found)'}`);
  console.log(`    ECR Repository:  ${output.resources.ecrRepositoryUri || '(not found)'}`);
  console.log(`    RDS Endpoint:    ${output.resources.rdsEndpoint || '(not found)'}`);
  console.log(`    ECS Cluster:     ${output.resources.ecsClusterArn || '(not found)'}`);
  console.log('');

  const healthIcon = output.smokeTest.healthy ? '✓' : '⚠';
  const healthStatus = output.smokeTest.healthy ? 'Healthy' : 'Not responding';
  console.log(`  Smoke Test: ${healthIcon} ${healthStatus} (HTTP ${output.smokeTest.statusCode})`);

  if (!output.smokeTest.healthy) {
    console.log('    Note: ALB may take a few minutes for ECS tasks to register and become healthy.');
  }

  console.log('');
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv);
  const { account, region } = getAccountAndRegion();

  if (!options.json) {
    console.log(`Bootstrap deployment for stage: ${options.stage}`);
    console.log(`Account: ${account}, Region: ${region}`);
    console.log('');
  }

  // Step 1: CDK Bootstrap
  if (!options.skipBootstrap) {
    if (!options.json) {
      console.log('  → Running cdk bootstrap...');
    }
    runCdkBootstrap(account, region, options.verbose ?? false);
    if (!options.json) {
      console.log('  ✓ cdk bootstrap complete');
      console.log('');
    }
  } else if (!options.json) {
    console.log('  ○ Skipping cdk bootstrap (--skip-bootstrap)');
    console.log('');
  }

  // Step 2: Deploy stacks sequentially
  const results: DeploymentResult[] = [];

  for (const stackType of STACK_ORDER) {
    const stackName = getStackName(stackType, options.stage);

    if (!options.json) {
      console.log(`  → Deploying ${stackName}...`);
    }

    const startTime = Date.now();
    deployCdkStack(stackName, options.stage, options.verbose ?? false);

    const { status, outputs } = await pollStackStatus(stackName, options.verbose ?? false);
    const duration = Date.now() - startTime;

    if (!SUCCESS_STATUSES.has(status)) {
      // Deployment failed
      const failedEvents = await getFailedStackEvents(stackName);
      if (!options.json) {
        printFailedEvents(stackName, failedEvents);
      } else {
        const errorOutput = {
          success: false,
          failedStack: stackName,
          status,
          events: failedEvents.map((e) => ({
            resource: e.LogicalResourceId,
            status: e.ResourceStatus,
            reason: e.ResourceStatusReason,
          })),
          suggestion: `Run: npx cdk destroy ${stackName} --force`,
        };
        console.log(JSON.stringify(errorOutput, null, 2));
      }
      process.exit(1);
    }

    results.push({
      stackName,
      status: status as 'CREATE_COMPLETE' | 'UPDATE_COMPLETE',
      outputs,
      duration,
    });

    if (!options.json) {
      const durationSec = (duration / 1000).toFixed(1);
      console.log(`  ✓ ${stackName} — ${status} (${durationSec}s)`);
    }
  }

  // Step 3: Extract resources and run smoke test
  const resources = extractResources(results);
  const smokeTest = await runHealthCheck(resources.albDnsName);

  const output: BootstrapOutput = {
    success: true,
    stacks: results,
    resources,
    smokeTest,
  };

  // Step 4: Output results
  if (options.json) {
    console.log(JSON.stringify(output, null, 2));
  } else {
    printHumanSummary(output);
  }

  if (!smokeTest.healthy && !options.json) {
    // Non-fatal: stacks deployed but health check didn't pass yet
    console.log('  Deployment complete. ALB health check did not pass yet.');
    console.log('  This is expected if ECS tasks are still starting.');
  }
}

main().catch((err: unknown) => {
  console.error('Fatal error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
