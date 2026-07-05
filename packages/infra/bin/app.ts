#!/usr/bin/env node
// Requirements: 11.11
import * as cdk from 'aws-cdk-lib';
import { environments } from '../lib/config/environments.js';
import { applyTags } from '../lib/config/tags.js';

import { NetworkStack } from '../lib/stacks/network-stack.js';
import { DatabaseStack } from '../lib/stacks/database-stack.js';
import { ContainerStack } from '../lib/stacks/container-stack.js';
import { CdnStack } from '../lib/stacks/cdn-stack.js';
import { MonitoringStack } from '../lib/stacks/monitoring-stack.js';

// Use the default CDK synthesizer now that the CDK bootstrap stack is deployed.
const app = new cdk.App();

const stage = app.node.tryGetContext('stage') as 'staging' | 'production' ?? 'staging';
const config = environments[stage];

// Apply global tags to all resources in the app
applyTags(app, config.stage);

// 1. Build the Network Layer first and save it to a variable
const networkStack = new NetworkStack(app, `${config.stage}-network`, { 
  env: { account: config.account, region: config.region }, 
  config 
});

// 2. Build the Database Layer and plug in the Network connections
const databaseStack = new DatabaseStack(app, `${config.stage}-database`, { 
  env: { account: config.account, region: config.region }, 
  config,
  vpc: networkStack.vpc,
  rdsSecurityGroup: networkStack.rdsSecurityGroup
});

// 3. Container stack (ECS Fargate, ALB, ECR, auto-scaling)
const containerStack = new ContainerStack(app, `${config.stage}-container`, {
  env: { account: config.account, region: config.region },
  config,
  vpc: networkStack.vpc,
  albSecurityGroup: networkStack.albSecurityGroup,
  ecsSecurityGroup: networkStack.ecsSecurityGroup,
  databaseSecretArn: databaseStack.dbSecret.secretArn,
  databaseEndpointAddress: databaseStack.dbInstance.dbInstanceEndpointAddress,
  databaseEndpointPort: databaseStack.dbInstance.dbInstanceEndpointPort,
});
containerStack.addDependency(networkStack);
containerStack.addDependency(databaseStack);

// 4. CDN stack (CloudFront, S3)
const cdnStack = new CdnStack(app, `${config.stage}-cdn`, {
  env: { account: config.account, region: config.region },
  config,
});

// 5. Monitoring stack (CloudWatch alarms, dashboard, SNS)
const monitoringStack = new MonitoringStack(app, `${config.stage}-monitoring`, {
  env: { account: config.account, region: config.region },
  config,
  ecsClusterName: containerStack.cluster.clusterName,
  ecsServiceName: containerStack.service.serviceName,
  loadBalancerFullName: containerStack.loadBalancer.loadBalancerFullName,
  targetGroupFullName: containerStack.targetGroup.targetGroupFullName,
  logGroupName: containerStack.logGroup.logGroupName,
});
monitoringStack.addDependency(containerStack);

app.synth();
