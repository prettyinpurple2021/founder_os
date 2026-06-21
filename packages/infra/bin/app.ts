#!/usr/bin/env node
// Requirements: 11.11
import * as cdk from 'aws-cdk-lib';
import { environments } from '../lib/config/environments.js';
import { applyTags } from '../lib/config/tags.js';

const app = new cdk.App();

const stage = app.node.tryGetContext('stage') as 'staging' | 'production' ?? 'staging';
const config = environments[stage];

// Apply global tags to all resources in the app
applyTags(app, config.stage);

// Stacks will be added here as they are implemented
// Example:
// new NetworkStack(app, `${config.stage}-network`, { env: { account: config.account, region: config.region }, config });
// new DatabaseStack(app, `${config.stage}-database`, { env: { account: config.account, region: config.region }, config });
// new ContainerStack(app, `${config.stage}-container`, { env: { account: config.account, region: config.region }, config });
// new CdnStack(app, `${config.stage}-cdn`, { env: { account: config.account, region: config.region }, config });
// new MonitoringStack(app, `${config.stage}-monitoring`, { env: { account: config.account, region: config.region }, config });

app.synth();
