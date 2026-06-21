# First Deployment Runbook

This is the end-to-end guide for taking Solo Founder Launch OS from zero to production. It walks through every step from AWS account preparation through CDK bootstrap, secrets population, your first CI/CD run, DNS configuration, monitoring verification, and optional load testing.

**Expected total time:** 1–2 hours (plus DNS propagation wait)

---

## Prerequisites

Before starting, ensure you have:

- [ ] An AWS account with administrative access
- [ ] A GitHub repository containing the Solo Founder Launch OS codebase
- [ ] A registered domain (e.g., `solofounder.app`) — or willingness to register one
- [ ] Node.js 20+ installed locally
- [ ] AWS CLI v2 installed and configured (`aws configure`)
- [ ] npm packages installed (`npm ci` at repo root)

Verify your environment:

```bash
node --version        # v20.x or higher
aws --version         # aws-cli/2.x
aws sts get-caller-identity  # Confirms AWS credentials work
npm --version         # 9.x or higher
```

---

## Step 1: AWS Account Configuration

Configure your AWS account with GitHub OIDC federation and the deployment IAM role.

> **Detailed guide:** [aws-account-setup.md](./aws-account-setup.md)

### Summary of actions

1. Create the GitHub OIDC identity provider in your AWS account
2. Create the `github-actions-deploy` IAM role with the correct trust policy
3. Attach deployment permissions (ECR, ECS, S3, CloudFront, SecretsManager, CloudFormation, CloudWatch)
4. Configure GitHub repository secrets: `AWS_ACCOUNT_ID`, `AWS_REGION`, `CLOUDFRONT_DISTRIBUTION_ID`
5. Update the placeholder account ID in `packages/infra/lib/config/environments.ts`
6. Validate by running the test OIDC workflow

### Verification

```bash
# Confirm the OIDC provider exists
aws iam list-open-id-connect-providers

# Confirm the role exists and has the correct trust policy
aws iam get-role --role-name github-actions-deploy --query 'Role.AssumeRolePolicyDocument'
```

Once the test OIDC workflow succeeds in GitHub Actions, proceed to Step 2.

---

## Step 2: CDK Bootstrap and Stack Deployment

Deploy all 5 infrastructure stacks in the correct dependency order.

### 2a. Run CDK Bootstrap

The bootstrap command initializes the CDK toolkit stack in your AWS account:

```bash
npm run bootstrap -- --stage production
```

This command will:
1. Run `cdk bootstrap` in your account/region
2. Deploy stacks sequentially: **network → database → container → CDN → monitoring**
3. Wait for each stack to reach `CREATE_COMPLETE` before deploying the next
4. Run a smoke test against the ALB health endpoint

**Expected duration:** ~15–20 minutes for all 5 stacks.

### 2b. Verify Stack Deployment

After the bootstrap script completes, verify all stacks are deployed:

```bash
aws cloudformation list-stacks \
  --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE \
  --query "StackSummaries[?contains(StackName, 'solo-founder-production')].{Name:StackName,Status:StackStatus}" \
  --output table
```

You should see all 5 stacks:

| Stack Name | Status |
|------------|--------|
| `solo-founder-production-network` | CREATE_COMPLETE |
| `solo-founder-production-database` | CREATE_COMPLETE |
| `solo-founder-production-container` | CREATE_COMPLETE |
| `solo-founder-production-cdn` | CREATE_COMPLETE |
| `solo-founder-production-monitoring` | CREATE_COMPLETE |

### 2c. Record Key Outputs

The bootstrap script prints key resource identifiers. Save these for later steps:

```bash
# Get ALB DNS name
aws cloudformation describe-stacks \
  --stack-name solo-founder-production-container \
  --query "Stacks[0].Outputs[?contains(OutputKey,'AlbDns')].OutputValue" \
  --output text

# Get CloudFront distribution ID
aws cloudformation describe-stacks \
  --stack-name solo-founder-production-cdn \
  --query "Stacks[0].Outputs[?contains(OutputKey,'DistributionId')].OutputValue" \
  --output text

# Get ECR repository URI
aws cloudformation describe-stacks \
  --stack-name solo-founder-production-container \
  --query "Stacks[0].Outputs[?contains(OutputKey,'EcrRepository')].OutputValue" \
  --output text
```

### Troubleshooting

If a stack fails to deploy:

```bash
# View failure events
aws cloudformation describe-stack-events \
  --stack-name <FAILING_STACK_NAME> \
  --query "StackEvents[?ResourceStatus=='CREATE_FAILED'].{Resource:LogicalResourceId,Reason:ResourceStatusReason}" \
  --output table
```

Common issues:
- **Service quotas:** VPC or EIP limits reached — request increase via AWS console
- **IAM permissions:** Ensure your CLI user has `AdministratorAccess` or equivalent CDK deploy permissions
- **Region mismatch:** Confirm `AWS_DEFAULT_REGION` matches the region in `environments.ts`

To rollback a failed stack:

```bash
aws cloudformation delete-stack --stack-name <FAILING_STACK_NAME>
```

Then fix the issue and re-run `npm run bootstrap -- --stage production --skip-bootstrap`.

---

## Step 3: Secrets Population

Populate production secrets in AWS Secrets Manager.

### 3a. Run the Secrets Setup Script

```bash
npm run setup:secrets -- --stage production
```

This command:
- Generates a cryptographically secure session secret (256-bit random hex)
- Generates an AES-256 encryption key (256-bit base64)
- Stores both in Secrets Manager under `/solo-founder-launch-os/production/`
- Lists manual secrets that still need population

### 3b. Populate GitHub OAuth Credentials

Create a GitHub OAuth application:

1. Go to **GitHub** → **Settings** → **Developer settings** → **OAuth Apps** → **New OAuth App**
2. Set the callback URL to: `https://api.solofounder.app/auth/github/callback`
3. Note the **Client ID** and generate a **Client Secret**

Store the credentials in Secrets Manager:

```bash
aws secretsmanager put-secret-value \
  --secret-id /solo-founder-launch-os/production/github/client-id \
  --secret-string "<YOUR_GITHUB_CLIENT_ID>"

aws secretsmanager put-secret-value \
  --secret-id /solo-founder-launch-os/production/github/client-secret \
  --secret-string "<YOUR_GITHUB_CLIENT_SECRET>"

aws secretsmanager put-secret-value \
  --secret-id /solo-founder-launch-os/production/github/callback-url \
  --secret-string "https://api.solofounder.app/auth/github/callback"
```

### 3c. Validate All Secrets

Run the validation command to confirm all secrets are populated:

```bash
npm run setup:secrets -- --stage production --validate-only
```

Or manually check each path exists:

```bash
for path in database/url github/client-id github/client-secret github/callback-url session/secret encryption/key; do
  aws secretsmanager describe-secret \
    --secret-id "/solo-founder-launch-os/production/$path" \
    --query '{Name:Name,Created:CreatedDate}' \
    --output text 2>/dev/null && echo "✓ $path" || echo "✗ $path MISSING"
done
```

All 6 secrets should show `✓`.

> **Note:** The `database/url` secret is auto-generated by the database CDK stack — you don't need to create it manually.

---

## Step 4: Database Migration

Apply the Prisma schema to the production RDS instance.

### Option A: Via CI/CD (recommended)

The deployment workflow automatically runs migrations. Pushing to `main` in Step 5 will trigger the migration as part of the deploy pipeline.

### Option B: Manual Fallback

If you need to run migrations before the first CI/CD deploy, or if the pipeline migration step fails:

> **Detailed guide:** [manual-migration.md](./manual-migration.md)

Quick version:

```bash
# Run the migration ECS task manually
aws ecs run-task \
  --cluster solo-founder-production-cluster \
  --task-definition solo-founder-production-migration \
  --launch-type FARGATE \
  --network-configuration '{
    "awsvpcConfiguration": {
      "subnets": ["<PRIVATE_SUBNET_1>", "<PRIVATE_SUBNET_2>"],
      "securityGroups": ["<MIGRATION_SG>"],
      "assignPublicIp": "DISABLED"
    }
  }'
```

### Verify Migration

After migration completes, confirm the schema is applied:

```bash
# Check the migration task status
aws ecs describe-tasks \
  --cluster solo-founder-production-cluster \
  --tasks <TASK_ARN> \
  --query 'tasks[0].{Status:lastStatus,Exit:containers[0].exitCode}'
```

Exit code `0` means migrations applied successfully.

---

## Step 5: First CI/CD Run

Trigger the full deployment pipeline.

### 5a. Push to Main

Ensure all your changes (account ID, domain config) are committed and push to `main`:

```bash
git add -A
git commit -m "chore: configure production environment"
git push origin main
```

### 5b. Monitor the Workflow

1. Go to your GitHub repository → **Actions** tab
2. Watch the **Deploy** workflow that triggers on push to `main`
3. The workflow will:
   - Build and push the Docker image to ECR
   - Run database migrations
   - Update the ECS service with the new task definition
   - Build and deploy the frontend to S3
   - Invalidate the CloudFront cache

**Expected duration:** 5–8 minutes.

### 5c. Verify Deployment

```bash
# Verify ECR image was pushed
aws ecr describe-images \
  --repository-name solo-founder-production \
  --query 'imageDetails | sort_by(@, &imagePushedAt) | [-1].{Tag:imageTags[0],Pushed:imagePushedAt}' \
  --output table

# Verify ECS service is running
aws ecs describe-services \
  --cluster solo-founder-production-cluster \
  --services solo-founder-production-service \
  --query 'services[0].{Running:runningCount,Desired:desiredCount,Status:status}' \
  --output table

# Verify the API responds
curl -s https://api.solofounder.app/health | jq .
# Expected: { "status": "ok" }
```

### Troubleshooting

If the workflow fails:

```bash
# Check ECS task stopped reason
aws ecs list-tasks --cluster solo-founder-production-cluster --desired-status STOPPED
aws ecs describe-tasks \
  --cluster solo-founder-production-cluster \
  --tasks <TASK_ARN> \
  --query 'tasks[0].{Reason:stoppedReason,Exit:containers[0].exitCode}'
```

Common issues:
- **Image pull failure:** ECR permissions or image tag mismatch
- **Task crash loop:** Missing secrets or incorrect `DATABASE_URL` — check CloudWatch logs
- **Health check failure:** ALB target group health check path mismatch

---

## Step 6: DNS Configuration

Point your domain's subdomains to the deployed AWS resources.

> **Detailed guide:** [dns-setup.md](./dns-setup.md)

### Summary of actions

1. Create a Route 53 hosted zone (or use existing if registering via Route 53)
2. Configure NS records at your registrar to point to Route 53
3. Create an A/AAAA alias record: `api.solofounder.app` → ALB
4. Create an A/AAAA alias record: `app.solofounder.app` → CloudFront distribution
5. Update `packages/infra/lib/config/environments.ts` with your domain values if needed

### Quick Verification

```bash
# Test API subdomain resolution
dig api.solofounder.app A +short

# Test web subdomain resolution
dig app.solofounder.app A +short

# Test HTTPS connectivity
curl -I https://api.solofounder.app/health
curl -I https://app.solofounder.app
```

> **Note:** DNS propagation can take up to 48 hours for NS record changes at external registrars. Alias record changes within Route 53 propagate within 60 seconds.

---

## Step 7: Verification

Run the automated readiness checklist to confirm everything is wired together.

### 7a. Run the Readiness Check

```bash
npm run check:readiness -- --stage production
```

This checks:
- DNS resolution for both subdomains
- OIDC role assumption
- All 5 CloudFormation stacks in healthy state
- All secrets populated in Secrets Manager
- ECS service running at least 1 healthy task
- ALB health check passing
- CloudWatch log group receiving data
- TLS certificates valid (>30 days until expiration)
- CloudFront returning correct content
- Bundle size within threshold

### 7b. Review Results

All automated checks should show `✓ PASS`. If any check fails, the output includes:
- What was expected vs what was found
- A remediation hint for the specific failure

### 7c. Complete Manual Verification Items

The readiness check also lists items that require manual confirmation:

- [ ] Confirm alarm notification email received (check your inbox for SNS subscription confirmation)
- [ ] Test GitHub OAuth login flow end-to-end (visit `https://app.solofounder.app` and log in)
- [ ] Verify domain registration is complete and auto-renewal is enabled

---

## Step 8: Monitoring Verification

Verify that monitoring, metrics, and alarms are functioning with real production data.

### 8a. Run Monitoring Verification

```bash
npm run verify:monitoring -- --stage production
```

This script:
1. Checks that the CloudWatch log group is receiving structured JSON logs from ECS
2. Verifies the CloudWatch dashboard displays real-time data
3. Triggers a test alarm to verify SNS notification delivery
4. Confirms the error-rate metric filter is counting correctly
5. Runs a CloudWatch Logs Insights query to verify saved queries work

### 8b. Confirm Alarm Email

After the test alarm triggers, check your email for the SNS notification. It should arrive within 5 minutes.

If no email arrives:
- Verify the SNS subscription is confirmed (check **SNS** → **Subscriptions** in AWS Console)
- Check the alarm email address in `packages/infra/lib/config/environments.ts` → `monitoring.alarmEmail`
- Ensure the email address isn't filtering AWS notifications to spam

### 8c. Verify Dashboard

Open the CloudWatch console and check the **Solo Founder Production** dashboard shows data for:
- Request volume
- Error rates
- Latency percentiles (p50, p95, p99)
- Container health (CPU, memory)
- Database connection metrics

---

## Step 9: Load Testing (Optional)

Validate auto-scaling behavior under realistic traffic. Only run this after the deployment is stable and serving traffic correctly.

> **Prerequisites:** [k6](https://k6.io/) installed locally (`brew install k6` or download from k6.io)

### 9a. Run the Load Test

```bash
npm run test:load -- --env TEST_SESSION_COOKIE=<VALID_SESSION_COOKIE>
```

The test:
- Ramps from 0 to 50 concurrent users over 5 minutes
- Sustains peak load for 10 minutes
- Winds down over 3 minutes

### 9b. Verify Auto-Scaling

During the sustained load phase, monitor ECS task count:

```bash
# Watch task count (run in separate terminal)
watch -n 10 'aws ecs describe-services \
  --cluster solo-founder-production-cluster \
  --services solo-founder-production-service \
  --query "services[0].runningCount" \
  --output text'
```

Expected behavior:
- When CPU > 70%: ECS scales out (adds tasks, up to max 4)
- When CPU < 30% after test: ECS scales in (removes tasks, down to min 1)

### 9c. Review Results

k6 outputs a summary including:
- p50/p95/p99 response latency
- Error rate
- Requests per second (throughput)
- Scale-out event timestamps

**Pass criteria:**
- p95 response time < 2 seconds during sustained load
- Error rate < 5% (excluding intentional 4xx responses)
- Auto-scaling triggers within 5 minutes of sustained high CPU

---

## Post-Deployment Checklist

Use this table to track completion of all deployment items:

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | AWS OIDC provider created | ☐ | — |
| 2 | IAM deploy role configured | ☐ | — |
| 3 | GitHub repository secrets set | ☐ | `AWS_ACCOUNT_ID`, `AWS_REGION`, `CLOUDFRONT_DISTRIBUTION_ID` |
| 4 | Account ID updated in `environments.ts` | ☐ | Replace `987654321098` |
| 5 | CDK bootstrap completed | ☐ | — |
| 6 | All 5 stacks deployed | ☐ | network, database, container, CDN, monitoring |
| 7 | Session secret generated | ☐ | Auto-generated by setup script |
| 8 | Encryption key generated | ☐ | Auto-generated by setup script |
| 9 | GitHub OAuth app created | ☐ | Callback: `https://api.solofounder.app/auth/github/callback` |
| 10 | GitHub OAuth credentials in Secrets Manager | ☐ | client-id, client-secret, callback-url |
| 11 | Database migration applied | ☐ | Via CI/CD or manual ECS task |
| 12 | First CI/CD deploy successful | ☐ | Push to `main`, verify workflow |
| 13 | ECR image pushed | ☐ | — |
| 14 | ECS service healthy | ☐ | At least 1 running task |
| 15 | Domain registered | ☐ | — |
| 16 | Route 53 hosted zone created | ☐ | — |
| 17 | NS records delegated | ☐ | — |
| 18 | API DNS record created | ☐ | `api.solofounder.app` → ALB |
| 19 | Web DNS record created | ☐ | `app.solofounder.app` → CloudFront |
| 20 | TLS certificates validated | ☐ | >30 days until expiration |
| 21 | Readiness check passes | ☐ | `npm run check:readiness -- --stage production` |
| 22 | Monitoring dashboard populated | ☐ | Real-time data visible |
| 23 | Test alarm email received | ☐ | Check inbox/spam |
| 24 | GitHub OAuth login tested | ☐ | Full end-to-end flow |
| 25 | Load test passed (optional) | ☐ | p95 < 2s, errors < 5% |

---

## Related Documentation

- [AWS Account Setup Guide](./aws-account-setup.md) — OIDC provider, IAM role, GitHub secrets
- [DNS Setup Runbook](./dns-setup.md) — Domain registration, Route 53, alias records
- [Manual Migration Procedure](./manual-migration.md) — Fallback database migration via AWS CLI
