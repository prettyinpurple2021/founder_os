# AWS Account and IAM Configuration Guide

This guide walks through configuring your AWS account with GitHub OIDC federation and IAM roles so that CI/CD can deploy securely without static access keys.

## Prerequisites

- An AWS account with administrative access
- AWS CLI v2 installed and configured (`aws configure`)
- A GitHub repository containing the Solo Founder Launch OS codebase
- GitHub repository admin permissions (for configuring secrets)

Verify your AWS CLI is working:

```bash
aws sts get-caller-identity
```

You should see your account ID, user ARN, and user ID in the output.

---

## Step 1: Create GitHub OIDC Identity Provider

GitHub Actions uses OpenID Connect (OIDC) to request short-lived credentials from AWS. You need to register GitHub as an identity provider in your AWS account.

### Get the Thumbprint

The thumbprint for `token.actions.githubusercontent.com` is used to verify the TLS certificate of the OIDC provider. As of 2024, GitHub's thumbprint is:

```
6938fd4d98bab03faadb97b34396831e3780aea1
```

> **Note:** AWS now validates the OIDC provider's certificate via its own certificate authority, so the thumbprint value is less critical. However, at least one thumbprint is required when creating the provider.

### Create the Provider

Run the following AWS CLI command:

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
```

Expected output:

```json
{
  "OpenIDConnectProviderArn": "arn:aws:iam::<YOUR_ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"
}
```

### Verify the Provider

```bash
aws iam get-open-id-connect-provider \
  --open-id-connect-provider-arn arn:aws:iam::<YOUR_ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com
```

---

## Step 2: Create IAM Role (`github-actions-deploy`)

This role is what GitHub Actions assumes via OIDC to perform deployments.

### 2a. Create the Trust Policy

Create a file named `trust-policy.json`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::<YOUR_ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:<OWNER>/<REPO>:ref:refs/heads/main"
        }
      }
    }
  ]
}
```

> **Important:** Replace `<YOUR_ACCOUNT_ID>` with your 12-digit AWS account ID, and `<OWNER>/<REPO>` with your GitHub username/org and repository name (e.g., `myuser/solo-founder-launch-os`).

### 2b. Create the Role

```bash
aws iam create-role \
  --role-name github-actions-deploy \
  --assume-role-policy-document file://trust-policy.json \
  --description "GitHub Actions deployment role for Solo Founder Launch OS"
```

### 2c. Create the Permissions Policy

Create a file named `deploy-permissions.json`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ECRAccess",
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "ecr:PutImage",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload"
      ],
      "Resource": "*"
    },
    {
      "Sid": "ECSAccess",
      "Effect": "Allow",
      "Action": [
        "ecs:DescribeServices",
        "ecs:DescribeTaskDefinition",
        "ecs:DescribeTasks",
        "ecs:ListTasks",
        "ecs:RegisterTaskDefinition",
        "ecs:UpdateService",
        "ecs:RunTask"
      ],
      "Resource": "*"
    },
    {
      "Sid": "S3StaticAssets",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:ListBucket",
        "s3:DeleteObject"
      ],
      "Resource": [
        "arn:aws:s3:::solo-founder-production-static-assets",
        "arn:aws:s3:::solo-founder-production-static-assets/*"
      ]
    },
    {
      "Sid": "CloudFrontInvalidation",
      "Effect": "Allow",
      "Action": [
        "cloudfront:CreateInvalidation",
        "cloudfront:GetInvalidation",
        "cloudfront:ListInvalidations"
      ],
      "Resource": "*"
    },
    {
      "Sid": "SecretsManagerRead",
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue",
        "secretsmanager:DescribeSecret"
      ],
      "Resource": "arn:aws:secretsmanager:*:*:secret:/solo-founder-launch-os/*"
    },
    {
      "Sid": "CloudFormationAccess",
      "Effect": "Allow",
      "Action": [
        "cloudformation:DescribeStacks",
        "cloudformation:DescribeStackEvents",
        "cloudformation:GetTemplate",
        "cloudformation:UpdateStack",
        "cloudformation:CreateChangeSet",
        "cloudformation:DescribeChangeSet",
        "cloudformation:ExecuteChangeSet"
      ],
      "Resource": "arn:aws:cloudformation:*:*:stack/solo-founder-*/*"
    },
    {
      "Sid": "CloudWatchAccess",
      "Effect": "Allow",
      "Action": [
        "cloudwatch:PutMetricData",
        "cloudwatch:GetMetricData",
        "cloudwatch:DescribeAlarms",
        "cloudwatch:PutMetricAlarm",
        "cloudwatch:DeleteAlarms",
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "logs:DescribeLogGroups",
        "logs:DescribeLogStreams"
      ],
      "Resource": "*"
    },
    {
      "Sid": "IAMPassRole",
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": "arn:aws:iam::*:role/solo-founder-*",
      "Condition": {
        "StringEquals": {
          "iam:PassedToService": [
            "ecs-tasks.amazonaws.com"
          ]
        }
      }
    }
  ]
}
```

### 2d. Attach the Policy to the Role

```bash
aws iam put-role-policy \
  --role-name github-actions-deploy \
  --policy-name SoloFounderDeployPermissions \
  --policy-document file://deploy-permissions.json
```

### Verify the Role

```bash
aws iam get-role --role-name github-actions-deploy
```

---

## Step 3: Configure GitHub Repository Secrets

Navigate to your GitHub repository → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.

Add the following secrets:

| Secret Name | Value | Description |
|-------------|-------|-------------|
| `AWS_ACCOUNT_ID` | Your 12-digit AWS account ID (e.g., `123456789012`) | Used to construct the role ARN |
| `AWS_REGION` | `us-east-1` | AWS region for deployment |
| `CLOUDFRONT_DISTRIBUTION_ID` | Your CloudFront distribution ID (e.g., `E1A2B3C4D5E6F7`) | Used for cache invalidation |

You can find your CloudFront distribution ID after deploying the CDN stack:

```bash
aws cloudfront list-distributions \
  --query "DistributionList.Items[?Comment=='solo-founder-production'].Id" \
  --output text
```

> **Warning:** Never commit these values to the repository. GitHub secrets are encrypted and only exposed to workflows at runtime.

---

## Step 4: Update Placeholder Account ID

The infrastructure code contains a placeholder AWS account ID that must be replaced with your actual account ID.

Edit `packages/infra/lib/config/environments.ts` and replace the placeholder:

```typescript
// Before
production: {
  account: '987654321098', // Replace with your AWS account ID
  ...
}

// After
production: {
  account: '<YOUR_ACTUAL_ACCOUNT_ID>', // Your production AWS account
  ...
}
```

Also update the staging account if using a separate account:

```typescript
// Before
staging: {
  account: '123456789012', // Replace with your AWS account ID
  ...
}

// After
staging: {
  account: '<YOUR_ACTUAL_ACCOUNT_ID>', // Your staging AWS account
  ...
}
```

Commit this change:

```bash
git add packages/infra/lib/config/environments.ts
git commit -m "chore: set production AWS account ID"
```

---

## Step 5: Validation

Validate that GitHub Actions can assume the OIDC role by running a test workflow.

### Create a Test Workflow

Create `.github/workflows/test-oidc.yml`:

```yaml
name: Test OIDC Role Assumption

on:
  workflow_dispatch:

permissions:
  id-token: write
  contents: read

jobs:
  test-oidc:
    name: Verify OIDC Configuration
    runs-on: ubuntu-latest
    steps:
      - name: Configure AWS credentials (OIDC)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::${{ secrets.AWS_ACCOUNT_ID }}:role/github-actions-deploy
          aws-region: ${{ secrets.AWS_REGION }}

      - name: Verify identity
        run: aws sts get-caller-identity
```

### Run the Test

1. Push the workflow file to `main`
2. Go to **Actions** → **Test OIDC Role Assumption** → **Run workflow**
3. Check the output of the "Verify identity" step

### Expected Output

```json
{
  "UserId": "AROA1234567890EXAMPLE:GitHubActions",
  "Account": "<YOUR_ACCOUNT_ID>",
  "Arn": "arn:aws:sts::<YOUR_ACCOUNT_ID>:assumed-role/github-actions-deploy/GitHubActions"
}
```

If you see the assumed role ARN with your account ID, the OIDC configuration is working correctly.

### Clean Up

After successful validation, you can remove the test workflow:

```bash
git rm .github/workflows/test-oidc.yml
git commit -m "chore: remove OIDC test workflow after validation"
```

---

## Troubleshooting

### Trust Policy Condition Syntax Errors

**Symptom:** Role assumption fails with `Not authorized to perform sts:AssumeRoleWithWebIdentity`.

**Cause:** The `Condition` block in the trust policy has incorrect syntax or values.

**Fix:** Verify the trust policy matches this exact structure:

```json
"Condition": {
  "StringEquals": {
    "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
  },
  "StringLike": {
    "token.actions.githubusercontent.com:sub": "repo:<OWNER>/<REPO>:ref:refs/heads/main"
  }
}
```

Common mistakes:
- Using `StringEquals` instead of `StringLike` for the `sub` condition
- Missing the `token.actions.githubusercontent.com:` prefix on condition keys
- Typos in the federated principal ARN

### Audience Mismatch

**Symptom:** `Error: Not authorized to perform sts:AssumeRoleWithWebIdentity` even though the subject matches.

**Cause:** The audience (`aud`) configured in the OIDC provider or trust policy doesn't match what GitHub sends.

**Fix:** The audience must be `sts.amazonaws.com`. Verify:

```bash
aws iam get-open-id-connect-provider \
  --open-id-connect-provider-arn arn:aws:iam::<YOUR_ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com \
  --query "ClientIDList"
```

Expected output: `["sts.amazonaws.com"]`

If the audience is wrong, update it:

```bash
aws iam add-client-id-to-open-id-connect-provider \
  --open-id-connect-provider-arn arn:aws:iam::<YOUR_ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com \
  --client-id sts.amazonaws.com
```

### Repository Name Format

**Symptom:** OIDC authentication succeeds but role assumption is denied.

**Cause:** The `sub` condition in the trust policy doesn't match the format GitHub sends.

**Details:** GitHub's OIDC token includes a `sub` claim in the format:

```
repo:<owner>/<repo>:ref:refs/heads/<branch>
```

**Common mistakes:**
- Using uppercase in the owner/repo name (GitHub sends lowercase)
- Missing `ref:refs/heads/` prefix for branch-based conditions
- Using `repo:owner/repo:*` without `StringLike` (must use `StringLike` for wildcards)

**Verify your repository format:**

```bash
# The sub claim will look like:
# repo:myuser/solo-founder-launch-os:ref:refs/heads/main
```

If you need to allow deployments from multiple branches or pull requests, adjust the condition:

```json
// Allow any branch (less restrictive)
"StringLike": {
  "token.actions.githubusercontent.com:sub": "repo:<OWNER>/<REPO>:*"
}
```

> **Warning:** Allowing `*` means any branch or PR can assume the deploy role. For production, restrict to `refs/heads/main` only.

### Missing Permissions

**Symptom:** Deployment workflow fails with `AccessDenied` on specific AWS API calls.

**Cause:** The IAM policy attached to `github-actions-deploy` is missing required permissions.

**Debug:** Check CloudTrail for denied API calls:

```bash
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=<FAILED_API_CALL> \
  --max-results 5
```

**Fix:** Add the missing permission to `deploy-permissions.json` and update the inline policy:

```bash
aws iam put-role-policy \
  --role-name github-actions-deploy \
  --policy-name SoloFounderDeployPermissions \
  --policy-document file://deploy-permissions.json
```

### Region Mismatch

**Symptom:** Resources not found or API calls return empty results.

**Cause:** The `AWS_REGION` secret in GitHub doesn't match the region where resources are deployed.

**Fix:** Verify the region is consistent across all configurations:

1. GitHub secret `AWS_REGION` → should be `us-east-1`
2. `packages/infra/lib/config/environments.ts` → `region: 'us-east-1'`
3. Trust policy doesn't restrict by region, so this only affects resource lookup

```bash
# Verify your configured region
aws configure get region
```

> **Note:** CloudFront distributions and ACM certificates for CloudFront must be in `us-east-1` regardless of where other resources are deployed. The deploy workflow uses the `AWS_REGION` secret for all operations.
