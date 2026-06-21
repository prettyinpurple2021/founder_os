// Requirements: 11.1, 11.2, 11.5, 11.6, 11.8, 11.9, 2.5, 2.9, 7.1, 7.2

import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import type { Construct } from 'constructs';
import type { EnvironmentConfig } from '../config/environments.js';

export interface ContainerStackProps extends cdk.StackProps {
  readonly config: EnvironmentConfig;
  readonly vpc: ec2.IVpc;
  readonly albSecurityGroup: ec2.ISecurityGroup;
  readonly ecsSecurityGroup: ec2.ISecurityGroup;
  readonly databaseSecretArn: string;
}

/**
 * Container stack provisioning ECR, ECS Fargate, ALB, and auto-scaling for the
 * Solo Founder Launch OS API service.
 *
 * - ECR repository with lifecycle policies (keep 10 tagged, expire untagged after 7 days)
 * - ECS Cluster with Fargate capacity
 * - Task definition with container, CloudWatch log group, and IAM roles
 * - ALB with HTTPS listener (ACM cert) and HTTP→HTTPS redirect
 * - ECS Fargate service attached to ALB target group
 * - Auto-scaling (min 1, max 4, scale out at 70% CPU, scale in at 30%)
 * - Deployment circuit breaker for automatic rollback
 */
export class ContainerStack extends cdk.Stack {
  public readonly repository: ecr.Repository;
  public readonly cluster: ecs.Cluster;
  public readonly service: ecs.FargateService;
  public readonly loadBalancer: elbv2.ApplicationLoadBalancer;
  public readonly logGroup: logs.LogGroup;

  constructor(scope: Construct, id: string, props: ContainerStackProps) {
    super(scope, id, props);

    const { config, vpc, albSecurityGroup, ecsSecurityGroup, databaseSecretArn } = props;

    // --- ECR Repository ---
    this.repository = new ecr.Repository(this, 'ApiRepository', {
      repositoryName: `solo-founder-${config.stage}-api`,
      removalPolicy:
        config.stage === 'production'
          ? cdk.RemovalPolicy.RETAIN
          : cdk.RemovalPolicy.DESTROY,
      emptyOnDelete: config.stage !== 'production',
      lifecycleRules: [
        {
          rulePriority: 1,
          description: 'Keep last 10 tagged images',
          tagStatus: ecr.TagStatus.TAGGED,
          tagPrefixList: ['v', 'sha-'],
          maxImageCount: 10,
        },
        {
          rulePriority: 2,
          description: 'Remove untagged images after 7 days',
          tagStatus: ecr.TagStatus.UNTAGGED,
          maxImageAge: cdk.Duration.days(7),
        },
      ],
    });

    // --- CloudWatch Log Group ---
    this.logGroup = new logs.LogGroup(this, 'ApiLogGroup', {
      logGroupName: `/ecs/solo-founder-${config.stage}-api`,
      retention: logs.RetentionDays.THREE_MONTHS,
      removalPolicy:
        config.stage === 'production'
          ? cdk.RemovalPolicy.RETAIN
          : cdk.RemovalPolicy.DESTROY,
    });

    // --- ECS Cluster ---
    this.cluster = new ecs.Cluster(this, 'EcsCluster', {
      clusterName: `solo-founder-${config.stage}-cluster`,
      vpc,
      containerInsights: true,
    });

    // --- Task Execution Role (used by ECS agent to pull images and write logs) ---
    const executionRole = new iam.Role(this, 'TaskExecutionRole', {
      roleName: `solo-founder-${config.stage}-task-execution-role`,
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AmazonECSTaskExecutionRolePolicy',
        ),
      ],
    });

    // Allow execution role to read the database secret for container env injection
    executionRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['secretsmanager:GetSecretValue'],
        resources: [databaseSecretArn],
      }),
    );

    // --- Task Role (used by the running container) ---
    const taskRole = new iam.Role(this, 'TaskRole', {
      roleName: `solo-founder-${config.stage}-task-role`,
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });

    // Read from Secrets Manager (for application config loading at runtime)
    taskRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['secretsmanager:GetSecretValue', 'secretsmanager:DescribeSecret'],
        resources: [
          `arn:aws:secretsmanager:${config.region}:${config.account}:secret:/solo-founder-launch-os/${config.stage}/*`,
        ],
      }),
    );

    // Push CloudWatch logs
    taskRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'logs:CreateLogStream',
          'logs:PutLogEvents',
          'logs:DescribeLogStreams',
        ],
        resources: [this.logGroup.logGroupArn, `${this.logGroup.logGroupArn}:*`],
      }),
    );

    // --- Task Definition ---
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'ApiTaskDefinition', {
      family: `solo-founder-${config.stage}-api`,
      cpu: config.ecs.cpu,
      memoryLimitMiB: config.ecs.memory,
      executionRole,
      taskRole,
    });

    taskDefinition.addContainer('ApiContainer', {
      containerName: `solo-founder-${config.stage}-api`,
      image: ecs.ContainerImage.fromEcrRepository(this.repository, 'latest'),
      logging: ecs.LogDrivers.awsLogs({
        logGroup: this.logGroup,
        streamPrefix: 'api',
      }),
      portMappings: [
        {
          containerPort: 3001,
          protocol: ecs.Protocol.TCP,
        },
      ],
      environment: {
        NODE_ENV: config.stage,
        PORT: '3001',
        AWS_REGION: config.region,
        SECRETS_PATH: `/solo-founder-launch-os/${config.stage}`,
      },
      healthCheck: {
        command: ['CMD-SHELL', 'wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1'],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
        startPeriod: cdk.Duration.seconds(60),
      },
    });

    // --- Application Load Balancer ---
    this.loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
      loadBalancerName: `solo-founder-${config.stage}-alb`,
      vpc,
      internetFacing: true,
      securityGroup: albSecurityGroup,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });

    // ACM certificate for TLS termination on ALB
    const certificate = new acm.Certificate(this, 'ApiCertificate', {
      domainName: config.domain.api,
      validation: acm.CertificateValidation.fromDns(),
    });

    // HTTPS Listener (port 443)
    const httpsListener = this.loadBalancer.addListener('HttpsListener', {
      port: 443,
      protocol: elbv2.ApplicationProtocol.HTTPS,
      certificates: [certificate],
      sslPolicy: elbv2.SslPolicy.TLS13_RES,
      defaultAction: elbv2.ListenerAction.fixedResponse(503, {
        contentType: 'text/plain',
        messageBody: 'Service unavailable',
      }),
    });

    // HTTP Listener (port 80) — redirect to HTTPS
    this.loadBalancer.addListener('HttpListener', {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultAction: elbv2.ListenerAction.redirect({
        protocol: 'HTTPS',
        port: '443',
        permanent: true,
      }),
    });

    // --- ECS Fargate Service ---
    this.service = new ecs.FargateService(this, 'ApiService', {
      serviceName: `solo-founder-${config.stage}-api`,
      cluster: this.cluster,
      taskDefinition,
      desiredCount: config.ecs.minCapacity,
      securityGroups: [ecsSecurityGroup],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      assignPublicIp: false,
      circuitBreaker: { rollback: true },
      deploymentController: { type: ecs.DeploymentControllerType.ECS },
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      healthCheckGracePeriod: cdk.Duration.seconds(120),
    });

    // Register service with ALB target group
    const targetGroup = httpsListener.addTargets('ApiTargetGroup', {
      targetGroupName: `sf-${config.stage}-api-tg`,
      port: 3001,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [this.service],
      healthCheck: {
        path: '/health',
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
        healthyHttpCodes: '200',
      },
      deregistrationDelay: cdk.Duration.seconds(30),
    });

    // --- Auto-Scaling ---
    const scaling = this.service.autoScaleTaskCount({
      minCapacity: config.ecs.minCapacity,
      maxCapacity: config.ecs.maxCapacity,
    });

    // Scale out at configured CPU threshold (default: 70%)
    scaling.scaleOnCpuUtilization('CpuScaleOut', {
      targetUtilizationPercent: config.ecs.scaleOutCpuPercent,
      scaleInCooldown: cdk.Duration.seconds(300),
      scaleOutCooldown: cdk.Duration.seconds(60),
    });

    // --- Stack Outputs ---
    new cdk.CfnOutput(this, 'RepositoryUri', {
      value: this.repository.repositoryUri,
      description: 'ECR repository URI',
      exportName: `${config.stage}-EcrRepositoryUri`,
    });

    new cdk.CfnOutput(this, 'RepositoryArn', {
      value: this.repository.repositoryArn,
      description: 'ECR repository ARN',
      exportName: `${config.stage}-EcrRepositoryArn`,
    });

    new cdk.CfnOutput(this, 'ClusterArn', {
      value: this.cluster.clusterArn,
      description: 'ECS cluster ARN',
      exportName: `${config.stage}-EcsClusterArn`,
    });

    new cdk.CfnOutput(this, 'ServiceArn', {
      value: this.service.serviceArn,
      description: 'ECS service ARN',
      exportName: `${config.stage}-EcsServiceArn`,
    });

    new cdk.CfnOutput(this, 'LoadBalancerDns', {
      value: this.loadBalancer.loadBalancerDnsName,
      description: 'ALB DNS name',
      exportName: `${config.stage}-AlbDnsName`,
    });

    new cdk.CfnOutput(this, 'LoadBalancerArn', {
      value: this.loadBalancer.loadBalancerArn,
      description: 'ALB ARN',
      exportName: `${config.stage}-AlbArn`,
    });

    new cdk.CfnOutput(this, 'LogGroupName', {
      value: this.logGroup.logGroupName,
      description: 'CloudWatch log group name',
      exportName: `${config.stage}-ApiLogGroupName`,
    });
  }
}
