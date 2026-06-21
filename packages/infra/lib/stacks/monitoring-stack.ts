// Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6

import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import type { Construct } from 'constructs';
import type { EnvironmentConfig } from '../config/environments.js';

export interface MonitoringStackProps extends cdk.StackProps {
  readonly config: EnvironmentConfig;
  readonly ecsClusterName: string;
  readonly ecsServiceName: string;
  readonly loadBalancerFullName: string;
  readonly targetGroupFullName: string;
  readonly logGroupName: string;
}

/**
 * Monitoring stack providing CloudWatch alarms, SNS notifications, and a
 * dashboard for the Solo Founder Launch OS production environment.
 *
 * - SNS topic for alarm notifications with email subscription
 * - CloudWatch alarms: error rate, high latency, high CPU, DB connection saturation
 * - CloudWatch dashboard: request volume, error rates, latency, container health, DB metrics
 * - Log group with 90-day retention (references the container stack log group for alarms)
 */
export class MonitoringStack extends cdk.Stack {
  public readonly alarmTopic: sns.Topic;
  public readonly errorRateAlarm: cloudwatch.Alarm;
  public readonly highLatencyAlarm: cloudwatch.Alarm;
  public readonly highCpuAlarm: cloudwatch.Alarm;
  public readonly dbConnectionAlarm: cloudwatch.Alarm;
  public readonly dashboard: cloudwatch.Dashboard;

  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);

    const {
      config,
      ecsClusterName,
      ecsServiceName,
      loadBalancerFullName,
      targetGroupFullName,
      logGroupName,
    } = props;

    // --- SNS Topic for Alarm Notifications ---
    this.alarmTopic = new sns.Topic(this, 'AlarmTopic', {
      topicName: `solo-founder-${config.stage}-alarms`,
      displayName: `Solo Founder ${config.stage} Alarms`,
    });

    this.alarmTopic.addSubscription(
      new subscriptions.EmailSubscription(config.monitoring.alarmEmail),
    );

    // --- Metric Filter for 5xx Errors from ALB Logs ---
    // Use ALB metrics for error rate calculation
    const httpErrorCount = new cloudwatch.Metric({
      namespace: 'AWS/ApplicationELB',
      metricName: 'HTTPCode_Target_5XX_Count',
      dimensionsMap: {
        LoadBalancer: loadBalancerFullName,
        TargetGroup: targetGroupFullName,
      },
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
    });

    const requestCount = new cloudwatch.Metric({
      namespace: 'AWS/ApplicationELB',
      metricName: 'RequestCount',
      dimensionsMap: {
        LoadBalancer: loadBalancerFullName,
        TargetGroup: targetGroupFullName,
      },
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
    });

    // --- Error Rate Alarm (5xx > 5% over 5 minutes) ---
    const errorRateExpression = new cloudwatch.MathExpression({
      expression: '(errors / requests) * 100',
      usingMetrics: {
        errors: httpErrorCount,
        requests: requestCount,
      },
      period: cdk.Duration.minutes(5),
      label: 'Error Rate (%)',
    });

    this.errorRateAlarm = new cloudwatch.Alarm(this, 'ErrorRateAlarm', {
      alarmName: `solo-founder-${config.stage}-error-rate`,
      alarmDescription: `API error rate exceeds 5% over 5 minutes - ${config.stage}`,
      metric: errorRateExpression,
      threshold: 5,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    this.errorRateAlarm.addAlarmAction(new actions.SnsAction(this.alarmTopic));
    this.errorRateAlarm.addOkAction(new actions.SnsAction(this.alarmTopic));

    // --- High Latency Alarm (p95 > 2000ms over 5 minutes) ---
    const p95Latency = new cloudwatch.Metric({
      namespace: 'AWS/ApplicationELB',
      metricName: 'TargetResponseTime',
      dimensionsMap: {
        LoadBalancer: loadBalancerFullName,
        TargetGroup: targetGroupFullName,
      },
      statistic: 'p95',
      period: cdk.Duration.minutes(5),
    });

    this.highLatencyAlarm = new cloudwatch.Alarm(this, 'HighLatencyAlarm', {
      alarmName: `solo-founder-${config.stage}-high-latency`,
      alarmDescription: `API p95 latency exceeds 2 seconds over 5 minutes - ${config.stage}`,
      metric: p95Latency,
      threshold: 2, // ALB reports latency in seconds
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    this.highLatencyAlarm.addAlarmAction(new actions.SnsAction(this.alarmTopic));
    this.highLatencyAlarm.addOkAction(new actions.SnsAction(this.alarmTopic));

    // --- High CPU Alarm (ECS CPU > 80% over 10 minutes) ---
    const cpuUtilization = new cloudwatch.Metric({
      namespace: 'AWS/ECS',
      metricName: 'CPUUtilization',
      dimensionsMap: {
        ClusterName: ecsClusterName,
        ServiceName: ecsServiceName,
      },
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
    });

    this.highCpuAlarm = new cloudwatch.Alarm(this, 'HighCpuAlarm', {
      alarmName: `solo-founder-${config.stage}-high-cpu`,
      alarmDescription: `ECS CPU utilization exceeds 80% over 10 minutes - ${config.stage}`,
      metric: cpuUtilization,
      threshold: 80,
      evaluationPeriods: 2, // 2 x 5 min = 10 min
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    this.highCpuAlarm.addAlarmAction(new actions.SnsAction(this.alarmTopic));
    this.highCpuAlarm.addOkAction(new actions.SnsAction(this.alarmTopic));

    // --- DB Connection Saturation Alarm (> 80% of pool max over 5 minutes) ---
    // db.t3.micro has max_connections ~112, pool max is typically 80% = ~90
    // We alarm when active connections exceed 80% of pool max (i.e., ~72 connections)
    const dbConnections = new cloudwatch.Metric({
      namespace: 'AWS/RDS',
      metricName: 'DatabaseConnections',
      dimensionsMap: {
        DBInstanceIdentifier: `solo-founder-${config.stage}-db`,
      },
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
    });

    this.dbConnectionAlarm = new cloudwatch.Alarm(this, 'DbConnectionAlarm', {
      alarmName: `solo-founder-${config.stage}-db-connections`,
      alarmDescription: `Database connections exceed 80% of pool maximum over 5 minutes - ${config.stage}`,
      metric: dbConnections,
      threshold: 72, // 80% of ~90 pool max for db.t3.micro
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    this.dbConnectionAlarm.addAlarmAction(new actions.SnsAction(this.alarmTopic));
    this.dbConnectionAlarm.addOkAction(new actions.SnsAction(this.alarmTopic));

    // --- CloudWatch Dashboard ---
    this.dashboard = new cloudwatch.Dashboard(this, 'MonitoringDashboard', {
      dashboardName: `solo-founder-${config.stage}-dashboard`,
    });

    // Row 1: Request Volume and Error Rates
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Request Volume',
        left: [requestCount],
        width: 12,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'Error Rates',
        left: [
          httpErrorCount,
          new cloudwatch.Metric({
            namespace: 'AWS/ApplicationELB',
            metricName: 'HTTPCode_Target_4XX_Count',
            dimensionsMap: {
              LoadBalancer: loadBalancerFullName,
              TargetGroup: targetGroupFullName,
            },
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
        ],
        width: 12,
        height: 6,
      }),
    );

    // Row 2: Latency Percentiles and Container Health
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Latency Percentiles',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/ApplicationELB',
            metricName: 'TargetResponseTime',
            dimensionsMap: {
              LoadBalancer: loadBalancerFullName,
              TargetGroup: targetGroupFullName,
            },
            statistic: 'p50',
            period: cdk.Duration.minutes(1),
            label: 'p50',
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/ApplicationELB',
            metricName: 'TargetResponseTime',
            dimensionsMap: {
              LoadBalancer: loadBalancerFullName,
              TargetGroup: targetGroupFullName,
            },
            statistic: 'p95',
            period: cdk.Duration.minutes(1),
            label: 'p95',
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/ApplicationELB',
            metricName: 'TargetResponseTime',
            dimensionsMap: {
              LoadBalancer: loadBalancerFullName,
              TargetGroup: targetGroupFullName,
            },
            statistic: 'p99',
            period: cdk.Duration.minutes(1),
            label: 'p99',
          }),
        ],
        width: 12,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'Container Health (CPU & Memory)',
        left: [
          cpuUtilization,
          new cloudwatch.Metric({
            namespace: 'AWS/ECS',
            metricName: 'MemoryUtilization',
            dimensionsMap: {
              ClusterName: ecsClusterName,
              ServiceName: ecsServiceName,
            },
            statistic: 'Average',
            period: cdk.Duration.minutes(5),
          }),
        ],
        width: 12,
        height: 6,
      }),
    );

    // Row 3: Database Metrics
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Database Connections',
        left: [dbConnections],
        width: 12,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'Database Performance',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/RDS',
            metricName: 'ReadLatency',
            dimensionsMap: {
              DBInstanceIdentifier: `solo-founder-${config.stage}-db`,
            },
            statistic: 'Average',
            period: cdk.Duration.minutes(5),
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/RDS',
            metricName: 'WriteLatency',
            dimensionsMap: {
              DBInstanceIdentifier: `solo-founder-${config.stage}-db`,
            },
            statistic: 'Average',
            period: cdk.Duration.minutes(5),
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/RDS',
            metricName: 'FreeStorageSpace',
            dimensionsMap: {
              DBInstanceIdentifier: `solo-founder-${config.stage}-db`,
            },
            statistic: 'Average',
            period: cdk.Duration.minutes(5),
          }),
        ],
        width: 12,
        height: 6,
      }),
    );

    // Row 4: ECS Running Task Count and ALB Healthy Hosts
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'ECS Running Tasks',
        left: [
          new cloudwatch.Metric({
            namespace: 'ECS/ContainerInsights',
            metricName: 'RunningTaskCount',
            dimensionsMap: {
              ClusterName: ecsClusterName,
              ServiceName: ecsServiceName,
            },
            statistic: 'Average',
            period: cdk.Duration.minutes(1),
          }),
        ],
        width: 12,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'ALB Healthy/Unhealthy Hosts',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/ApplicationELB',
            metricName: 'HealthyHostCount',
            dimensionsMap: {
              LoadBalancer: loadBalancerFullName,
              TargetGroup: targetGroupFullName,
            },
            statistic: 'Average',
            period: cdk.Duration.minutes(1),
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/ApplicationELB',
            metricName: 'UnHealthyHostCount',
            dimensionsMap: {
              LoadBalancer: loadBalancerFullName,
              TargetGroup: targetGroupFullName,
            },
            statistic: 'Average',
            period: cdk.Duration.minutes(1),
          }),
        ],
        width: 12,
        height: 6,
      }),
    );

    // --- Stack Outputs ---
    new cdk.CfnOutput(this, 'AlarmTopicArn', {
      value: this.alarmTopic.topicArn,
      description: 'SNS topic ARN for alarm notifications',
      exportName: `${config.stage}-AlarmTopicArn`,
    });

    new cdk.CfnOutput(this, 'DashboardName', {
      value: this.dashboard.dashboardName,
      description: 'CloudWatch dashboard name',
      exportName: `${config.stage}-DashboardName`,
    });
  }
}
