// Requirements: 3.1, 3.5, 9.1, 9.2
// Shared AWS SDK client factories for deployment readiness scripts

import { CloudFormationClient } from '@aws-sdk/client-cloudformation';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { CloudWatchClient } from '@aws-sdk/client-cloudwatch';
import { CloudWatchLogsClient } from '@aws-sdk/client-cloudwatch-logs';
import { ECSClient } from '@aws-sdk/client-ecs';
import { Route53Client } from '@aws-sdk/client-route-53';
import { ACMClient } from '@aws-sdk/client-acm';
import { CloudFrontClient } from '@aws-sdk/client-cloudfront';
import { S3Client } from '@aws-sdk/client-s3';

const DEFAULT_REGION = process.env['AWS_REGION'] ?? 'us-east-1';

export function getCloudFormationClient(region?: string): CloudFormationClient {
  return new CloudFormationClient({ region: region ?? DEFAULT_REGION });
}

export function getSecretsManagerClient(region?: string): SecretsManagerClient {
  return new SecretsManagerClient({ region: region ?? DEFAULT_REGION });
}

export function getCloudWatchClient(region?: string): CloudWatchClient {
  return new CloudWatchClient({ region: region ?? DEFAULT_REGION });
}

export function getCloudWatchLogsClient(region?: string): CloudWatchLogsClient {
  return new CloudWatchLogsClient({ region: region ?? DEFAULT_REGION });
}

export function getECSClient(region?: string): ECSClient {
  return new ECSClient({ region: region ?? DEFAULT_REGION });
}

export function getRoute53Client(region?: string): Route53Client {
  return new Route53Client({ region: region ?? DEFAULT_REGION });
}

export function getACMClient(region?: string): ACMClient {
  return new ACMClient({ region: region ?? DEFAULT_REGION });
}

export function getCloudFrontClient(region?: string): CloudFrontClient {
  return new CloudFrontClient({ region: region ?? DEFAULT_REGION });
}

export function getS3Client(region?: string): S3Client {
  return new S3Client({ region: region ?? DEFAULT_REGION });
}
