#!/usr/bin/env node
// Requirements: 11.11
import * as cdk from 'aws-cdk-lib';
import { environments } from '../lib/config/environments.js';
import { applyTags } from '../lib/config/tags.js';

// Import your infrastructure stacks
import { NetworkStack } from '../lib/stacks/network-stack.js';
import { DatabaseStack } from '../lib/stacks/database-stack.js';
import { ContainerStack } from '../lib/stacks/container-stack.js';
import { CdnStack } from '../lib/stacks/cdn-stack.js';
import { MonitoringStack } from '../lib/stacks/monitoring-stack.js';

const app = new cdk.App();

const stage = app.node.tryGetContext('stage') as 'staging' | 'production' ?? 'staging';
const config = environments[stage];

// Apply global tags to all resources in the app
applyTags(app, config.stage);

// Activate the stacks
new NetworkStack(app, `${config.stage}-network`, { env: { account: config.account, region: config.region }, config });
new DatabaseStack(app, `${config.stage}-database`, { env: { account: config.account, region: config.region }, config });
new ContainerStack(app, `${config.stage}-container`, { env: { account: config.account, region: config.region }, config });
new CdnStack(app, `${config.stage}-cdn`, { env: { account: config.account, region: config.region }, config });
new MonitoringStack(app, `${config.stage}-monitoring`, { env: { account: config.account, region: config.region }, config });

app.synth();
