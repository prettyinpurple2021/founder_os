// Requirements: 11.2, 11.6

import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { describe, it, beforeAll } from 'vitest';
import { ContainerStack } from '../lib/stacks/container-stack.js';
import type { EnvironmentConfig } from '../lib/config/environments.js';

const testConfig: EnvironmentConfig = {
  account: '123456789012',
  region: 'us-east-1',
  stage: 'production',
  domain: {
    api: 'api.solo-founder.space',
    web: 'app.solo-founder.space',
    zone: 'solo-founder.space',
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

describe('ContainerStack', () => {
  let template: Template;

  beforeAll(() => {
    // Provide CDK context for Certificate.fromLookup which requires dummy cert ARN
    const app = new cdk.App({
      context: {
        [`aws:cdk:context-provider:${JSON.stringify({
          account: testConfig.account,
          region: testConfig.region,
          filter: { 'domain-name': testConfig.domain.api },
          provider: 'aws-cdk:certificate-provider',
        })}`]: {
          CertificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/test-cert-id',
        },
      },
    });

    // Create a mock VPC stack to provide vpc and security groups
    const vpcStack = new cdk.Stack(app, 'TestVpcStack', {
      env: { account: testConfig.account, region: testConfig.region },
    });

    const vpc = new ec2.Vpc(vpcStack, 'TestVpc', {
      maxAzs: 2,
      subnetConfiguration: [
        { name: 'Public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: 'Private', subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 24 },
        { name: 'Isolated', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });

    const albSecurityGroup = new ec2.SecurityGroup(vpcStack, 'AlbSecurityGroup', {
      vpc,
      description: 'Security group for the Application Load Balancer',
    });

    const ecsSecurityGroup = new ec2.SecurityGroup(vpcStack, 'EcsSecurityGroup', {
      vpc,
      description: 'Security group for ECS tasks',
    });

    const databaseSecretArn = `arn:aws:secretsmanager:${testConfig.region}:${testConfig.account}:secret:/solo-founder-launch-os/${testConfig.stage}/database/credentials-AbCdEf`;

    const stack = new ContainerStack(app, 'TestContainerStack', {
      config: testConfig,
      vpc,
      albSecurityGroup,
      ecsSecurityGroup,
      databaseSecretArn,
      databaseEndpointAddress: 'test-db.cluster-abcdefghijkl.us-east-1.rds.amazonaws.com',
      databaseEndpointPort: '5432',
      env: { account: testConfig.account, region: testConfig.region },
    });

    template = Template.fromStack(stack);
  });

  describe('ECS Auto-Scaling', () => {
    it('configures scalable target with minimum capacity of 1', () => {
      template.hasResourceProperties('AWS::ApplicationAutoScaling::ScalableTarget', {
        MinCapacity: 1,
      });
    });

    it('configures scalable target with maximum capacity of 4', () => {
      template.hasResourceProperties('AWS::ApplicationAutoScaling::ScalableTarget', {
        MaxCapacity: 4,
      });
    });

    it('creates an ECS service', () => {
      template.resourceCountIs('AWS::ECS::Service', 1);
    });
  });

  describe('ALB Health Check', () => {
    it('configures target group with health check on /health path', () => {
      template.hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
        HealthCheckPath: '/health',
      });
    });

    it('configures health check with healthy threshold count', () => {
      template.hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
        HealthyThresholdCount: 2,
        UnhealthyThresholdCount: 5,
      });
    });
  });

  describe('ECS Task Definition', () => {
    it('does not create a named ECR repository (uses CDK-managed bootstrap ECR)', () => {
      template.resourceCountIs('AWS::ECR::Repository', 0);
    });

    it('creates a Fargate task definition', () => {
      template.hasResourceProperties('AWS::ECS::TaskDefinition', {
        RequiresCompatibilities: ['FARGATE'],
      });
    });

    it('configures task definition with expected CPU', () => {
      template.hasResourceProperties('AWS::ECS::TaskDefinition', {
        Cpu: String(testConfig.ecs.cpu),
      });
    });

    it('configures task definition with expected memory', () => {
      template.hasResourceProperties('AWS::ECS::TaskDefinition', {
        Memory: String(testConfig.ecs.memory),
      });
    });

    it('injects the deployed runtime configuration into the container', () => {
      template.hasResourceProperties('AWS::ECS::TaskDefinition', {
        ContainerDefinitions: Match.arrayWith([
          Match.objectLike({
            Environment: Match.arrayWith([
              { Name: 'FRONTEND_URL', Value: 'https://app.solo-founder.space' },
              { Name: 'DATABASE_HOST', Value: 'test-db.cluster-abcdefghijkl.us-east-1.rds.amazonaws.com' },
              { Name: 'DATABASE_PORT', Value: '5432' },
              { Name: 'DATABASE_NAME', Value: 'solofounder' },
            ]),
            Secrets: Match.arrayWith([
              Match.objectLike({ Name: 'DATABASE_USER' }),
              Match.objectLike({ Name: 'DATABASE_PASSWORD' }),
            ]),
          }),
        ]),
      });
    });
  });
});
