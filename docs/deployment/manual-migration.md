# Manual Database Migration Procedure

## Overview

This document covers how to run database migrations manually using the AWS CLI when the CI/CD pipeline is unavailable. Use this procedure in the following situations:

- **First-time setup** — initializing the production database schema before CI/CD is configured
- **CI/CD unavailable** — GitHub Actions is down or the workflow is broken
- **Troubleshooting** — diagnosing migration failures that occurred in the pipeline
- **Emergency fixes** — applying a critical schema change outside the normal deployment flow

The migration task runs `prisma migrate deploy` against the production RDS instance inside a dedicated ECS task. It executes in a private subnet with no public internet exposure and retrieves database credentials from AWS Secrets Manager.

---

## Prerequisites

Before running a manual migration, ensure you have:

- **AWS CLI v2** installed and configured with credentials that have permission to run ECS tasks, describe CloudFormation stacks, and read CloudWatch logs
- **jq** installed for parsing JSON responses
- **ECS cluster name** — `solo-founder-production` (or your environment's cluster name)
- **Migration task definition** — `solo-founder-production-migration` (provisioned by the container CDK stack)
- **Private subnet IDs** — from the network stack outputs
- **Migration security group ID** — from the network or container stack outputs

---

## Step 1: Identify Network Configuration

The migration task requires private subnet IDs and security group IDs from the deployed infrastructure. Retrieve these from CloudFormation stack outputs.

### Get network stack outputs

```bash
aws cloudformation describe-stacks \
  --stack-name SoloFounderNetworkProduction \
  --query "Stacks[0].Outputs" \
  --output table
```

Look for outputs named similar to:
- `PrivateSubnetId1` / `PrivateSubnetId2` — the private subnets where the migration task runs
- `MigrationSecurityGroupId` — the security group that allows access to RDS

### Store values for use in later commands

```bash
# Replace with actual values from the stack outputs
PRIVATE_SUBNET_1="subnet-xxxxxxxxxxxxxxxxx"
PRIVATE_SUBNET_2="subnet-yyyyyyyyyyyyyyyyy"
MIGRATION_SG="sg-zzzzzzzzzzzzzzzzz"
CLUSTER_NAME="solo-founder-production"
TASK_DEFINITION="solo-founder-production-migration"
```

> **Tip:** If you're unsure of the stack name, list all stacks with:
> ```bash
> aws cloudformation list-stacks \
>   --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE \
>   --query "StackSummaries[?contains(StackName, 'SoloFounder')].StackName" \
>   --output text
> ```

---

## Step 2: Run the Migration Task

Execute the migration ECS task using `aws ecs run-task`. The task uses the FARGATE launch type and runs in the private subnets with no public IP assigned.

```bash
TASK_ARN=$(aws ecs run-task \
  --cluster "$CLUSTER_NAME" \
  --task-definition "$TASK_DEFINITION" \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$PRIVATE_SUBNET_1,$PRIVATE_SUBNET_2],securityGroups=[$MIGRATION_SG],assignPublicIp=DISABLED}" \
  --overrides '{
    "containerOverrides": [{
      "name": "api",
      "command": ["npx", "prisma", "migrate", "deploy"]
    }]
  }' \
  --query 'tasks[0].taskArn' \
  --output text)

echo "Migration task started: $TASK_ARN"
```

### Key details

| Parameter | Value | Explanation |
|-----------|-------|-------------|
| `--launch-type FARGATE` | Serverless compute | No EC2 instances to manage; task runs on-demand |
| `assignPublicIp=DISABLED` | No public internet | Task runs in private subnet with RDS access only |
| `containerOverrides.command` | `npx prisma migrate deploy` | Applies all pending migrations from `packages/api/prisma/migrations/` |
| Database credentials | From Secrets Manager | Task definition references `/solo-founder-launch-os/production/database/url` |

> **Warning:** If `TASK_ARN` is empty or "None", the task failed to start. See [Troubleshooting](#troubleshooting) below.

---

## Step 3: Monitor Task Execution

### Wait for the task to stop

```bash
echo "Waiting for migration task to complete..."
aws ecs wait tasks-stopped \
  --cluster "$CLUSTER_NAME" \
  --tasks "$TASK_ARN"
```

This command blocks until the task reaches the `STOPPED` state (typically 30–120 seconds for migrations).

### Check task result

```bash
TASK_DETAIL=$(aws ecs describe-tasks \
  --cluster "$CLUSTER_NAME" \
  --tasks "$TASK_ARN" \
  --query 'tasks[0]')

EXIT_CODE=$(echo "$TASK_DETAIL" | jq -r '.containers[0].exitCode // "unknown"')
STOP_REASON=$(echo "$TASK_DETAIL" | jq -r '.stoppedReason // "none"')
LAST_STATUS=$(echo "$TASK_DETAIL" | jq -r '.lastStatus')

echo "Status: $LAST_STATUS"
echo "Exit code: $EXIT_CODE"
echo "Stop reason: $STOP_REASON"
```

- **Exit code 0** — migration completed successfully
- **Non-zero exit code** — migration failed; check logs

### View CloudWatch logs

The migration task logs to CloudWatch. Retrieve the logs using the task ID:

```bash
TASK_ID=$(echo "$TASK_ARN" | awk -F'/' '{print $NF}')
LOG_GROUP="/ecs/$CLUSTER_NAME"
LOG_STREAM="api/api/$TASK_ID"

aws logs get-log-events \
  --log-group-name "$LOG_GROUP" \
  --log-stream-name "$LOG_STREAM" \
  --limit 50 \
  --query 'events[].message' \
  --output text
```

> **Note:** Log stream names follow the pattern `{container-name}/{container-name}/{task-id}`. If the container name differs from `api`, adjust accordingly.

---

## Step 4: Verify Migration Success

After the task exits with code 0, verify the database schema was applied correctly.

### Check the `_prisma_migrations` table

Run a query against the database to confirm migration entries exist. You can use a temporary ECS task or a bastion host if available:

```bash
# Option A: Run a verification task with a psql command
aws ecs run-task \
  --cluster "$CLUSTER_NAME" \
  --task-definition "$TASK_DEFINITION" \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$PRIVATE_SUBNET_1,$PRIVATE_SUBNET_2],securityGroups=[$MIGRATION_SG],assignPublicIp=DISABLED}" \
  --overrides '{
    "containerOverrides": [{
      "name": "api",
      "command": ["npx", "prisma", "migrate", "status"]
    }]
  }' \
  --query 'tasks[0].taskArn' \
  --output text
```

This runs `prisma migrate status` which reports applied and pending migrations.

### Verify the API health endpoint

Once migrations are applied, confirm the API service can connect to the database:

```bash
# If the ALB is accessible
ALB_DNS=$(aws cloudformation describe-stacks \
  --stack-name SoloFounderContainerProduction \
  --query "Stacks[0].Outputs[?OutputKey=='AlbDnsName'].OutputValue" \
  --output text)

curl -s "http://$ALB_DNS/health" | jq .
```

A successful response confirms the API can query the database with the migrated schema.

---

## Rollback Steps

If a migration fails or causes issues, follow these steps to recover.

### Identify which migration failed

Check the CloudWatch logs (Step 3) or run `prisma migrate status`:

```bash
aws ecs run-task \
  --cluster "$CLUSTER_NAME" \
  --task-definition "$TASK_DEFINITION" \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$PRIVATE_SUBNET_1,$PRIVATE_SUBNET_2],securityGroups=[$MIGRATION_SG],assignPublicIp=DISABLED}" \
  --overrides '{
    "containerOverrides": [{
      "name": "api",
      "command": ["npx", "prisma", "migrate", "status"]
    }]
  }' \
  --query 'tasks[0].taskArn' \
  --output text
```

Look for migrations marked as "failed" in the output.

### Mark a migration as rolled back

If a migration partially applied and left the database in a dirty state, mark it as rolled back so subsequent deploys can proceed:

```bash
aws ecs run-task \
  --cluster "$CLUSTER_NAME" \
  --task-definition "$TASK_DEFINITION" \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$PRIVATE_SUBNET_1,$PRIVATE_SUBNET_2],securityGroups=[$MIGRATION_SG],assignPublicIp=DISABLED}" \
  --overrides '{
    "containerOverrides": [{
      "name": "api",
      "command": ["npx", "prisma", "migrate", "resolve", "--rolled-back", "<migration_name>"]
    }]
  }' \
  --query 'tasks[0].taskArn' \
  --output text
```

Replace `<migration_name>` with the migration directory name (e.g., `20240115_add_user_table`).

### Manual SQL rollback

If `prisma migrate resolve` is insufficient and you need to manually revert schema changes:

1. Connect to the database via a bastion host or temporary ECS task with `psql`
2. Run the reverse SQL statements for the failed migration
3. Remove the failed migration entry from the `_prisma_migrations` table:
   ```sql
   DELETE FROM _prisma_migrations
   WHERE migration_name = '<migration_name>';
   ```
4. Re-run `prisma migrate deploy` to retry from a clean state

> **Warning:** Manual SQL rollbacks are risky. Only use this approach when `prisma migrate resolve` cannot fix the issue. Always take a database snapshot before making manual schema changes.

---

## Troubleshooting

### Task fails to start

**Symptoms:** `run-task` returns an empty task ARN or the task immediately moves to `STOPPED` without running.

**Common causes:**
- **Subnet not found** — verify subnet IDs exist and are in the correct VPC
- **Security group not found** — verify the security group ID exists
- **IAM role missing** — the task execution role or task role may not exist or lack permissions
- **Task definition not found** — verify the task definition family name is correct

**Resolution:**
```bash
# Check if the task definition exists
aws ecs describe-task-definition \
  --task-definition "$TASK_DEFINITION" \
  --query 'taskDefinition.taskDefinitionArn'

# Check the task's stopped reason
aws ecs describe-tasks \
  --cluster "$CLUSTER_NAME" \
  --tasks "$TASK_ARN" \
  --query 'tasks[0].{stoppedReason:stoppedReason,stopCode:stopCode}'
```

### Database connection timeout

**Symptoms:** Task starts but migration fails with a connection timeout error.

**Common causes:**
- **Security group rules** — the migration security group must allow outbound traffic to the RDS security group on port 5432
- **Wrong subnet** — task must run in a subnet that has a route to the RDS instance (same VPC, private subnet)
- **Secrets Manager access** — task role must have permission to read the database URL secret

**Resolution:**
```bash
# Verify security group allows traffic to RDS
aws ec2 describe-security-groups \
  --group-ids "$MIGRATION_SG" \
  --query 'SecurityGroups[0].IpPermissionsEgress'

# Check if RDS is accessible from the subnet
aws rds describe-db-instances \
  --query "DBInstances[?contains(DBInstanceIdentifier, 'solo-founder')].{Endpoint:Endpoint.Address,VpcId:DBSubnetGroup.VpcId}"
```

### Migration conflict (dirty state)

**Symptoms:** Migration fails with "migration already exists" or "dirty migration" error.

**Common causes:**
- A previous migration partially applied and was interrupted
- The `_prisma_migrations` table has an entry without a `finished_at` timestamp

**Resolution:**
1. Run `prisma migrate status` (see Verify section) to identify the conflicting migration
2. Use `prisma migrate resolve --rolled-back <migration_name>` to mark it as rolled back
3. Re-run `prisma migrate deploy`

### Task exits with non-zero code

**Symptoms:** Task completes but exit code is not 0.

**Resolution:**
1. Check CloudWatch logs immediately (see Step 3)
2. Common exit codes:
   - **Exit 1** — Prisma migration error (syntax error in SQL, constraint violation, etc.)
   - **Exit 137** — Out of memory (task killed by OOM)
   - **Exit 143** — Task was terminated (SIGTERM)
3. For migration errors, the log output will include the specific failing migration file and SQL error

```bash
# Get the last 100 log events for the failed task
TASK_ID=$(echo "$TASK_ARN" | awk -F'/' '{print $NF}')
aws logs get-log-events \
  --log-group-name "/ecs/$CLUSTER_NAME" \
  --log-stream-name "api/api/$TASK_ID" \
  --limit 100 \
  --query 'events[].message' \
  --output text
```

---

## Quick Reference

Single-command migration (copy and fill in values):

```bash
# Fill in your values
CLUSTER="solo-founder-production"
TASK_DEF="solo-founder-production-migration"
SUBNETS="subnet-xxx,subnet-yyy"
SG="sg-zzz"

# Run migration
TASK_ARN=$(aws ecs run-task \
  --cluster "$CLUSTER" \
  --task-definition "$TASK_DEF" \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$SG],assignPublicIp=DISABLED}" \
  --overrides '{"containerOverrides":[{"name":"api","command":["npx","prisma","migrate","deploy"]}]}' \
  --query 'tasks[0].taskArn' --output text) && \
echo "Started: $TASK_ARN" && \
aws ecs wait tasks-stopped --cluster "$CLUSTER" --tasks "$TASK_ARN" && \
echo "Exit code: $(aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$TASK_ARN" --query 'tasks[0].containers[0].exitCode' --output text)"
```
