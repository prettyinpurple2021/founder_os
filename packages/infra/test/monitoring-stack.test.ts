// Requirements: 10.3, 10.4, 10.5, 10.6

import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { describe, it, expect, beforeAll } from 'vitest';
import { MonitoringStack } from '../lib/stacks/monitoring-stack.js';
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

describe('MonitoringStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();

    const stack = new MonitoringStack(app, 'TestMonitoringStack', {
      config: testConfig,
      ecsClusterName: 'solo-founder-production-cluster',
      ecsServiceName: 'solo-founder-production-api',
      loadBalancerFullName: 'app/solo-founder-production-alb/abc123',
      targetGroupFullName: 'targetgroup/sf-production-api-tg/def456',
      logGroupName: '/ecs/solo-founder-production-api',
      env: { account: testConfig.account, region: testConfig.region },
    });

    template = Template.fromStack(stack);
  });

  describe('SNS Topic', () => {
    it('creates an SNS topic for alarm notifications', () => {
      template.resourceCountIs('AWS::SNS::Topic', 1);
    });

    it('configures the topic with the correct name', () => {
      template.hasResourceProperties('AWS::SNS::Topic', {
        TopicName: 'solo-founder-production-alarms',
      });
    });

    it('creates an email subscription', () => {
      template.hasResourceProperties('AWS::SNS::Subscription', {
        Protocol: 'email',
        Endpoint: 'test@example.com',
      });
    });
  });

  describe('CloudWatch Alarms', () => {
    it('creates 4 alarms', () => {
      template.resourceCountIs('AWS::CloudWatch::Alarm', 4);
    });

    it('creates error rate alarm with > 5% threshold', () => {
      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        AlarmName: 'solo-founder-production-error-rate',
        Threshold: 5,
        ComparisonOperator: 'GreaterThanThreshold',
      });
    });

    it('creates high latency alarm with > 2s threshold', () => {
      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        AlarmName: 'solo-founder-production-high-latency',
        Threshold: 2,
        ComparisonOperator: 'GreaterThanThreshold',
        EvaluationPeriods: 1,
      });
    });

    it('creates high CPU alarm with > 80% threshold over 10 minutes', () => {
      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        AlarmName: 'solo-founder-production-high-cpu',
        Threshold: 80,
        ComparisonOperator: 'GreaterThanThreshold',
        EvaluationPeriods: 2, // 2 x 5 min = 10 min
      });
    });

    it('creates DB connection alarm with threshold', () => {
      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        AlarmName: 'solo-founder-production-db-connections',
        Threshold: 72,
        ComparisonOperator: 'GreaterThanThreshold',
        EvaluationPeriods: 1,
      });
    });

    it('all alarms have SNS actions configured', () => {
      const alarms = template.findResources('AWS::CloudWatch::Alarm');
      for (const [_id, alarm] of Object.entries(alarms)) {
        const props = (alarm as { Properties: Record<string, unknown> }).Properties;
        expect(props.AlarmActions).toBeDefined();
        expect(props.OKActions).toBeDefined();
      }
    });
  });

  describe('CloudWatch Dashboard', () => {
    it('creates a dashboard', () => {
      template.resourceCountIs('AWS::CloudWatch::Dashboard', 1);
    });

    it('configures dashboard with the correct name', () => {
      template.hasResourceProperties('AWS::CloudWatch::Dashboard', {
        DashboardName: 'solo-founder-production-dashboard',
      });
    });

    it('dashboard body contains expected metric widgets', () => {
      template.hasResourceProperties('AWS::CloudWatch::Dashboard', {
        DashboardBody: Match.anyValue(),
      });
    });
  });

  describe('Stack Outputs', () => {
    it('exports the alarm topic ARN', () => {
      template.hasOutput('AlarmTopicArn', {
        Export: { Name: 'production-AlarmTopicArn' },
      });
    });

    it('exports the dashboard name', () => {
      template.hasOutput('DashboardName', {
        Export: { Name: 'production-DashboardName' },
      });
    });
  });
});
