// Requirements: 8.4, 10.3, 10.6

import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { describe, it, expect, beforeAll } from 'vitest';
import { CdnStack } from '../lib/stacks/cdn-stack.js';
import type { EnvironmentConfig } from '../lib/config/environments.js';

const testConfig: EnvironmentConfig = {
  account: '123456789012',
  region: 'us-east-1',
  stage: 'production',
  domain: {
    api: 'api.solofounder.app',
    web: 'app.solofounder.app',
    zone: 'solofounder.app',
  },
  database: {
    instanceClass: 'db.t3.micro',
    allocatedStorage: 20,
    multiAz: true,
  },
  ecs: {
    cpu: 512,
    memory: 1024,
    minCapacity: 1,
    maxCapacity: 4,
    scaleOutCpuPercent: 70,
    scaleInCpuPercent: 30,
  },
  monitoring: {
    alarmEmail: 'test@example.com',
    logRetentionDays: 90,
  },
};

describe('CdnStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();

    const stack = new CdnStack(app, 'TestCdnStack', {
      config: testConfig,
      env: { account: testConfig.account, region: testConfig.region },
    });

    template = Template.fromStack(stack);
  });

  describe('S3 Bucket', () => {
    it('creates an S3 bucket for static assets', () => {
      template.resourceCountIs('AWS::S3::Bucket', 1);
    });

    it('configures bucket with BlockPublicAccess enabled', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
      });
    });

    it('configures bucket with S3 managed encryption', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        BucketEncryption: {
          ServerSideEncryptionConfiguration: [
            {
              ServerSideEncryptionByDefault: {
                SSEAlgorithm: 'AES256',
              },
            },
          ],
        },
      });
    });
  });

  describe('CloudFront Distribution', () => {
    it('creates a CloudFront distribution', () => {
      template.resourceCountIs('AWS::CloudFront::Distribution', 1);
    });

    it('enables compression (gzip/Brotli)', () => {
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: Match.objectLike({
          DefaultCacheBehavior: Match.objectLike({
            Compress: true,
          }),
        }),
      });
    });

    it('configures HTTPS-only viewer protocol policy', () => {
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: Match.objectLike({
          DefaultCacheBehavior: Match.objectLike({
            ViewerProtocolPolicy: 'https-only',
          }),
        }),
      });
    });

    it('configures custom error response for 403 → /index.html', () => {
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: Match.objectLike({
          CustomErrorResponses: Match.arrayWith([
            Match.objectLike({
              ErrorCode: 403,
              ResponseCode: 200,
              ResponsePagePath: '/index.html',
            }),
          ]),
        }),
      });
    });

    it('configures custom error response for 404 → /index.html', () => {
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: Match.objectLike({
          CustomErrorResponses: Match.arrayWith([
            Match.objectLike({
              ErrorCode: 404,
              ResponseCode: 200,
              ResponsePagePath: '/index.html',
            }),
          ]),
        }),
      });
    });

    it('sets default root object to index.html', () => {
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: Match.objectLike({
          DefaultRootObject: 'index.html',
        }),
      });
    });

    it('uses the web domain as an alias', () => {
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: Match.objectLike({
          Aliases: ['app.solofounder.app'],
        }),
      });
    });

    it('uses TLS 1.2 minimum protocol version', () => {
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: Match.objectLike({
          ViewerCertificate: Match.objectLike({
            MinimumProtocolVersion: 'TLSv1.2_2021',
          }),
        }),
      });
    });
  });

  describe('ACM Certificate', () => {
    it('creates a certificate for the web domain', () => {
      template.hasResourceProperties('AWS::CertificateManager::Certificate', {
        DomainName: 'app.solofounder.app',
        ValidationMethod: 'DNS',
      });
    });
  });

  describe('Stack Outputs', () => {
    it('exports the S3 bucket name', () => {
      template.hasOutput('BucketName', {
        Export: { Name: 'production-StaticAssetsBucketName' },
      });
    });

    it('exports the CloudFront distribution ID', () => {
      template.hasOutput('DistributionId', {
        Export: { Name: 'production-CloudFrontDistributionId' },
      });
    });

    it('exports the CloudFront distribution domain name', () => {
      template.hasOutput('DistributionDomainName', {
        Export: { Name: 'production-CloudFrontDomainName' },
      });
    });

    it('exports the certificate ARN', () => {
      template.hasOutput('CertificateArn', {
        Export: { Name: 'production-WebCertificateArn' },
      });
    });
  });
});
