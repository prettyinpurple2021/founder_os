// Requirements: 11.7

import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import type { Construct } from 'constructs';
import type { EnvironmentConfig } from '../config/environments.js';

export interface NetworkStackProps extends cdk.StackProps {
  readonly config: EnvironmentConfig;
}

/**
 * Network stack defining VPC, subnets, and security groups for the
 * Solo Founder Launch OS production infrastructure.
 *
 * - Public subnets: ALB and NAT gateways
 * - Private subnets: ECS Fargate tasks (outbound via NAT)
 * - Isolated subnets: RDS (no internet access)
 */
export class NetworkStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;
  public readonly albSecurityGroup: ec2.SecurityGroup;
  public readonly ecsSecurityGroup: ec2.SecurityGroup;
  public readonly rdsSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props);

    const { config } = props;

    // VPC with 3 subnet tiers across 2 AZs
    this.vpc = new ec2.Vpc(this, 'Vpc', {
      vpcName: `solo-founder-${config.stage}-vpc`,
      ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
        {
          cidrMask: 24,
          name: 'Isolated',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
    });

    // ALB Security Group — allows inbound HTTPS (443) and HTTP (80) from anywhere
    this.albSecurityGroup = new ec2.SecurityGroup(this, 'AlbSecurityGroup', {
      vpc: this.vpc,
      securityGroupName: `solo-founder-${config.stage}-alb-sg`,
      description: 'Security group for the Application Load Balancer',
      allowAllOutbound: true,
    });

    this.albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'Allow HTTPS inbound from anywhere',
    );

    this.albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'Allow HTTP inbound from anywhere (for HTTPS redirect)',
    );

    // ECS Security Group — allows inbound only from ALB on container port
    this.ecsSecurityGroup = new ec2.SecurityGroup(this, 'EcsSecurityGroup', {
      vpc: this.vpc,
      securityGroupName: `solo-founder-${config.stage}-ecs-sg`,
      description: 'Security group for ECS Fargate tasks',
      allowAllOutbound: true,
    });

    this.ecsSecurityGroup.addIngressRule(
      this.albSecurityGroup,
      ec2.Port.tcp(3001),
      'Allow inbound from ALB on container port',
    );

    // RDS Security Group — allows inbound only from ECS on PostgreSQL port
    this.rdsSecurityGroup = new ec2.SecurityGroup(this, 'RdsSecurityGroup', {
      vpc: this.vpc,
      securityGroupName: `solo-founder-${config.stage}-rds-sg`,
      description: 'Security group for RDS PostgreSQL',
      allowAllOutbound: false,
    });

    this.rdsSecurityGroup.addIngressRule(
      this.ecsSecurityGroup,
      ec2.Port.tcp(5432),
      'Allow inbound from ECS on PostgreSQL port',
    );

    // Stack outputs for cross-stack references
    new cdk.CfnOutput(this, 'VpcId', {
      value: this.vpc.vpcId,
      description: 'VPC ID',
      exportName: `${config.stage}-VpcId`,
    });

    new cdk.CfnOutput(this, 'AlbSecurityGroupId', {
      value: this.albSecurityGroup.securityGroupId,
      description: 'ALB Security Group ID',
      exportName: `${config.stage}-AlbSecurityGroupId`,
    });

    new cdk.CfnOutput(this, 'EcsSecurityGroupId', {
      value: this.ecsSecurityGroup.securityGroupId,
      description: 'ECS Security Group ID',
      exportName: `${config.stage}-EcsSecurityGroupId`,
    });

    new cdk.CfnOutput(this, 'RdsSecurityGroupId', {
      value: this.rdsSecurityGroup.securityGroupId,
      description: 'RDS Security Group ID',
      exportName: `${config.stage}-RdsSecurityGroupId`,
    });
  }

  /** Returns the subnet selection for public subnets (ALB placement). */
  public get publicSubnets(): ec2.SubnetSelection {
    return { subnetType: ec2.SubnetType.PUBLIC };
  }

  /** Returns the subnet selection for private subnets (ECS task placement). */
  public get privateSubnets(): ec2.SubnetSelection {
    return { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS };
  }

  /** Returns the subnet selection for isolated subnets (RDS placement). */
  public get isolatedSubnets(): ec2.SubnetSelection {
    return { subnetType: ec2.SubnetType.PRIVATE_ISOLATED };
  }
}
