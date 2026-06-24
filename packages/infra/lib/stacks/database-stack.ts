// Requirements: 9.1, 9.2, 9.3, 9.4, 9.7, 11.3

import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import type { Construct } from 'constructs';
import type { EnvironmentConfig } from '../config/environments.js';

export interface DatabaseStackProps extends cdk.StackProps {
  readonly config: EnvironmentConfig;
  readonly vpc: ec2.IVpc;
  readonly rdsSecurityGroup: ec2.ISecurityGroup;
}

/**
 * Database stack provisioning RDS PostgreSQL with:
 * - Multi-AZ deployment (configurable per environment)
 * - Automated daily backups with 30-day retention
 * - Point-in-time recovery enabled
 * - Storage encryption via KMS
 * - Credentials stored in Secrets Manager
 * - Placement in isolated subnets (no public access)
 */
export class DatabaseStack extends cdk.Stack {
  public readonly dbInstance: rds.DatabaseInstance;
  public readonly dbSecret: secretsmanager.ISecret;
  public readonly encryptionKey: kms.Key;

  constructor(scope: Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props);

    const { config, vpc, rdsSecurityGroup } = props;

    // KMS key for encrypting RDS storage and backups
    this.encryptionKey = new kms.Key(this, 'DatabaseEncryptionKey', {
      alias: `solo-founder-${config.stage}-db-key`,
      description: `Encryption key for RDS storage - ${config.stage}`,
      enableKeyRotation: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Secrets Manager secret for DB credentials
    this.dbSecret = new secretsmanager.Secret(this, 'DatabaseSecret', {
      secretName: `/solo-founder-launch-os/${config.stage}/database/credentials`,
      description: `Database credentials for ${config.stage} environment`,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'solofounder' }),
        generateStringKey: 'password',
        excludePunctuation: true,
        passwordLength: 32,
      },
    });

    // Subnet group for isolated subnets
    const subnetGroup = new rds.SubnetGroup(this, 'DatabaseSubnetGroup', {
      vpc,
      description: `Subnet group for RDS in isolated subnets - ${config.stage}`,
      subnetGroupName: `solo-founder-${config.stage}-db-subnet-group`,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
    });

    // RDS PostgreSQL instance
    this.dbInstance = new rds.DatabaseInstance(this, 'DatabaseInstance', {
      instanceIdentifier: `solo-founder-${config.stage}-db`,
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_15,
      }),
      instanceType: new ec2.InstanceType(config.database.instanceClass.replace(/^db\./, '')),
      vpc,
      subnetGroup,
      securityGroups: [rdsSecurityGroup],
      credentials: rds.Credentials.fromSecret(this.dbSecret),
      databaseName: 'solofounder',
      allocatedStorage: config.database.allocatedStorage,
      maxAllocatedStorage: config.database.allocatedStorage * 2,
      storageEncrypted: true,
      storageEncryptionKey: this.encryptionKey,
      multiAz: config.database.multiAz,
      publiclyAccessible: false,

      // Backup configuration
      backupRetention: cdk.Duration.days(30),
      preferredBackupWindow: '03:00-04:00', // UTC
      deleteAutomatedBackups: false,

      // Maintenance window (outside backup window)
      preferredMaintenanceWindow: 'sun:05:00-sun:06:00',

      // Enable enhanced monitoring
      monitoringInterval: cdk.Duration.seconds(60),

      // Performance Insights
      enablePerformanceInsights: true,
      performanceInsightRetention: rds.PerformanceInsightRetention.DEFAULT,

      // Point-in-time recovery is enabled by default when backupRetention > 0
      // CloudWatch log exports
      cloudwatchLogsExports: ['postgresql'],

      // Auto minor version upgrade
      autoMinorVersionUpgrade: true,

      // Removal policy — retain in production, destroy in staging for cost savings
      removalPolicy:
        config.stage === 'production'
          ? cdk.RemovalPolicy.RETAIN
          : cdk.RemovalPolicy.DESTROY,
    });

    // Stack outputs for cross-stack references
    new cdk.CfnOutput(this, 'DatabaseEndpoint', {
      value: this.dbInstance.dbInstanceEndpointAddress,
      description: 'Database endpoint address',
      exportName: `${config.stage}-DatabaseEndpoint`,
    });

    new cdk.CfnOutput(this, 'DatabasePort', {
      value: this.dbInstance.dbInstanceEndpointPort,
      description: 'Database port',
      exportName: `${config.stage}-DatabasePort`,
    });

    new cdk.CfnOutput(this, 'DatabaseSecretArn', {
      value: this.dbSecret.secretArn,
      description: 'Database credentials secret ARN',
      exportName: `${config.stage}-DatabaseSecretArn`,
    });

    new cdk.CfnOutput(this, 'DatabaseEncryptionKeyArn', {
      value: this.encryptionKey.keyArn,
      description: 'Database encryption key ARN',
      exportName: `${config.stage}-DatabaseEncryptionKeyArn`,
    });
  }
}
