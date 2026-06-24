// Requirements: 9.1, 9.4

import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { describe, it, beforeAll } from 'vitest';
import { DatabaseStack } from '../lib/stacks/database-stack.js';
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

describe('DatabaseStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();

    // Create a mock VPC stack to provide vpc and security group
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

    const rdsSecurityGroup = new ec2.SecurityGroup(vpcStack, 'RdsSecurityGroup', {
      vpc,
      description: 'Security group for RDS PostgreSQL',
      allowAllOutbound: false,
    });

    const stack = new DatabaseStack(app, 'TestDatabaseStack', {
      config: testConfig,
      vpc,
      rdsSecurityGroup,
      env: { account: testConfig.account, region: testConfig.region },
    });

    template = Template.fromStack(stack);
  });

  describe('RDS Instance Configuration', () => {
    it('creates exactly one RDS database instance', () => {
      template.resourceCountIs('AWS::RDS::DBInstance', 1);
    });

    it('has Multi-AZ enabled for high availability', () => {
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        MultiAZ: true,
      });
    });

    it('has backup retention period of 30 days', () => {
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        BackupRetentionPeriod: 30,
      });
    });

    it('has storage encryption enabled', () => {
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        StorageEncrypted: true,
      });
    });

    it('uses PostgreSQL 15 engine', () => {
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        Engine: 'postgres',
        EngineVersion: Match.stringLikeRegexp('^15'),
      });
    });

    it('is not publicly accessible', () => {
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        PubliclyAccessible: false,
      });
    });

    it('synthesizes a valid DBInstanceClass without a double db. prefix', () => {
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        DBInstanceClass: 'db.t3.micro',
      });
    });

    it('has preferred backup window set to 03:00-04:00 UTC', () => {
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        PreferredBackupWindow: '03:00-04:00',
      });
    });
  });

  describe('Secrets Manager', () => {
    it('creates a Secrets Manager secret for database credentials', () => {
      template.resourceCountIs('AWS::SecretsManager::Secret', 1);
    });

    it('secret has the correct name pattern for the environment', () => {
      template.hasResourceProperties('AWS::SecretsManager::Secret', {
        Name: `/solo-founder-launch-os/${testConfig.stage}/database/credentials`,
      });
    });

    it('secret generates a password with sufficient length', () => {
      template.hasResourceProperties('AWS::SecretsManager::Secret', {
        GenerateSecretString: Match.objectLike({
          GenerateStringKey: 'password',
          PasswordLength: 32,
        }),
      });
    });
  });

  describe('KMS Encryption', () => {
    it('creates a KMS key for database encryption', () => {
      template.resourceCountIs('AWS::KMS::Key', 1);
    });

    it('KMS key has key rotation enabled', () => {
      template.hasResourceProperties('AWS::KMS::Key', {
        EnableKeyRotation: true,
      });
    });
  });
});
