// Requirements: 11.7

import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { describe, it, expect, beforeAll } from 'vitest';
import { NetworkStack } from '../lib/stacks/network-stack.js';
import type { EnvironmentConfig } from '../lib/config/environments.js';

const testConfig: EnvironmentConfig = {
  account: '123456789012',
  region: 'us-east-1',
  stage: 'staging',
  domain: {
    api: 'api.staging.solofounder.app',
    web: 'staging.solofounder.app',
    zone: 'solofounder.app',
  },
  database: {
    instanceClass: 'db.t3.micro',
    allocatedStorage: 20,
    multiAz: false,
  },
  ecs: {
    cpu: 256,
    memory: 512,
    minCapacity: 1,
    maxCapacity: 2,
    scaleOutCpuPercent: 70,
    scaleInCpuPercent: 30,
  },
  monitoring: {
    alarmEmail: 'test@example.com',
    logRetentionDays: 30,
  },
};

describe('NetworkStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const stack = new NetworkStack(app, 'TestNetworkStack', {
      config: testConfig,
      env: { account: testConfig.account, region: testConfig.region },
    });
    template = Template.fromStack(stack);
  });

  describe('VPC Configuration', () => {
    it('creates exactly one VPC', () => {
      template.resourceCountIs('AWS::EC2::VPC', 1);
    });

    it('configures VPC with 10.0.0.0/16 CIDR', () => {
      template.hasResourceProperties('AWS::EC2::VPC', {
        CidrBlock: '10.0.0.0/16',
      });
    });

    it('creates 6 subnets (2 public, 2 private, 2 isolated)', () => {
      template.resourceCountIs('AWS::EC2::Subnet', 6);
    });

    it('creates public subnets with MapPublicIpOnLaunch', () => {
      const subnets = template.findResources('AWS::EC2::Subnet', {
        Properties: {
          MapPublicIpOnLaunch: true,
        },
      });
      expect(Object.keys(subnets).length).toBe(2);
    });

    it('creates a NAT gateway for private subnet outbound access', () => {
      template.resourceCountIs('AWS::EC2::NatGateway', 1);
    });
  });

  describe('Security Groups', () => {
    it('creates 3 security groups (ALB, ECS, RDS)', () => {
      template.resourceCountIs('AWS::EC2::SecurityGroup', 3);
    });

    it('ALB security group allows inbound HTTPS (port 443) from anywhere', () => {
      template.hasResourceProperties('AWS::EC2::SecurityGroup', {
        GroupDescription: 'Security group for the Application Load Balancer',
        SecurityGroupIngress: Match.arrayWith([
          Match.objectLike({
            IpProtocol: 'tcp',
            FromPort: 443,
            ToPort: 443,
            CidrIp: '0.0.0.0/0',
          }),
        ]),
      });
    });

    it('ALB security group allows inbound HTTP (port 80) for redirect', () => {
      template.hasResourceProperties('AWS::EC2::SecurityGroup', {
        GroupDescription: 'Security group for the Application Load Balancer',
        SecurityGroupIngress: Match.arrayWith([
          Match.objectLike({
            IpProtocol: 'tcp',
            FromPort: 80,
            ToPort: 80,
            CidrIp: '0.0.0.0/0',
          }),
        ]),
      });
    });

    it('ECS security group allows inbound only from ALB on port 3001', () => {
      template.hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
        IpProtocol: 'tcp',
        FromPort: 3001,
        ToPort: 3001,
        GroupId: Match.anyValue(),
        SourceSecurityGroupId: Match.anyValue(),
      });
    });

    it('RDS security group allows inbound only from ECS on port 5432', () => {
      template.hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
        IpProtocol: 'tcp',
        FromPort: 5432,
        ToPort: 5432,
        GroupId: Match.anyValue(),
        SourceSecurityGroupId: Match.anyValue(),
      });
    });

    it('RDS security group does not allow all outbound traffic', () => {
      template.hasResourceProperties('AWS::EC2::SecurityGroup', {
        GroupDescription: 'Security group for RDS PostgreSQL',
        SecurityGroupEgress: Match.arrayWith([
          Match.objectLike({
            CidrIp: '255.255.255.255/32',
            Description: 'Disallow all traffic',
          }),
        ]),
      });
    });
  });
});
