// Requirements: 11.10
import * as cdk from 'aws-cdk-lib';

export interface ResourceTags {
  readonly Project: string;
  readonly Environment: string;
  readonly ManagedBy: string;
  readonly CostCenter: string;
}

/**
 * Returns the standard resource tags for the given environment stage.
 */
export function getResourceTags(stage: 'staging' | 'production'): ResourceTags {
  return {
    Project: 'solo-founder-launch-os',
    Environment: stage,
    ManagedBy: 'cdk',
    CostCenter: 'solo-founder-launch-os',
  };
}

/**
 * Applies standard resource tags to all resources within a CDK construct scope.
 */
export function applyTags(scope: cdk.App | cdk.Stack, stage: 'staging' | 'production'): void {
  const tags = getResourceTags(stage);

  cdk.Tags.of(scope).add('Project', tags.Project);
  cdk.Tags.of(scope).add('Environment', tags.Environment);
  cdk.Tags.of(scope).add('ManagedBy', tags.ManagedBy);
  cdk.Tags.of(scope).add('CostCenter', tags.CostCenter);
}
