// Requirements: 9.1, 9.3, 9.4, 9.5
// Readiness check definitions, types, and aggregation logic

export type CheckCategory =
  | 'dns'
  | 'oidc'
  | 'stacks'
  | 'secrets'
  | 'database'
  | 'monitoring'
  | 'bundle'
  | 'tls';

export interface CheckDefinition {
  id: string;
  name: string;
  category: CheckCategory;
  automated: boolean;
  run?: () => Promise<CheckResult>;
}

export interface CheckResult {
  id: string;
  name: string;
  category: CheckCategory;
  automated: boolean;
  status: 'pass' | 'fail' | 'skip';
  expected?: string;
  actual?: string;
  remediation?: string;
  durationMs: number;
}

export interface ReadinessReport {
  timestamp: string;
  stage: string;
  checks: CheckResult[];
  automatedPassed: number;
  automatedFailed: number;
  automatedTotal: number;
  manualItems: string[];
  recommendation: 'go' | 'no-go';
}

/**
 * Remediation hints keyed by check category.
 * Provides actionable guidance when a check fails.
 */
export const REMEDIATION_HINTS: Record<CheckCategory, string> = {
  dns: 'Verify Route 53 hosted zone and NS delegation',
  oidc: 'Check IAM trust policy and GitHub OIDC provider configuration',
  stacks: 'Review CloudFormation stack events for error details',
  secrets: 'Run setup-secrets script or manually populate in Secrets Manager',
  database: 'Check RDS instance status and security group rules',
  monitoring: 'Verify CloudWatch log group and metric filter configuration',
  bundle: 'Optimize bundle size - check for large dependencies or missing code splitting',
  tls: 'Verify ACM certificate exists in us-east-1 and DNS validation records are set',
};

/**
 * Aggregates individual check results into a ReadinessReport.
 *
 * Rules:
 * - recommendation is 'go' if and only if ALL automated checks have status 'pass'
 *   (vacuous truth: zero automated checks → 'go')
 * - If any automated check has status 'fail' or 'skip', recommendation is 'no-go'
 * - manualItems collects names of checks where automated is false
 * - automatedPassed counts automated checks with status 'pass'
 * - automatedFailed counts automated checks with status 'fail' or 'skip'
 * - automatedTotal counts all automated checks
 */
export function aggregateResults(
  checks: CheckResult[],
  stage = 'production'
): ReadinessReport {
  const automatedChecks = checks.filter((c) => c.automated);
  const manualChecks = checks.filter((c) => !c.automated);

  const automatedPassed = automatedChecks.filter(
    (c) => c.status === 'pass'
  ).length;
  const automatedFailed = automatedChecks.filter(
    (c) => c.status === 'fail' || c.status === 'skip'
  ).length;
  const automatedTotal = automatedChecks.length;

  const manualItems = manualChecks.map((c) => c.name);

  // 'go' iff all automated checks pass (vacuous truth for empty set)
  const recommendation: 'go' | 'no-go' =
    automatedFailed === 0 ? 'go' : 'no-go';

  return {
    timestamp: new Date().toISOString(),
    stage,
    checks,
    automatedPassed,
    automatedFailed,
    automatedTotal,
    manualItems,
    recommendation,
  };
}
