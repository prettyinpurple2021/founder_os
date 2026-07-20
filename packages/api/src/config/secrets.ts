// Requirements: 4.1, 4.5, 4.6, 4.7
// AWS Secrets Manager client for retrieving production secrets.
// Uses IAM role-based access (no static keys).
// In local development, falls back to environment variables by returning an empty object.
// Supports separate secret paths per environment: /solo-founder-launch-os/{stage}/

import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

/**
 * Determines the current deployment stage from NODE_ENV.
 * Maps 'production' → 'production', 'staging' → 'staging'.
 */
function getStage(): string {
  const env = process.env.NODE_ENV ?? 'development';
  if (env === 'production') return 'production';
  if (env === 'staging') return 'staging';
  return 'development';
}

/**
 * Retrieves a single secret from AWS Secrets Manager by its full path.
 * Returns the parsed JSON value, or an empty object if the secret is not JSON.
 */
async function getSecretValue(
  client: SecretsManagerClient,
  secretId: string,
): Promise<Record<string, unknown>> {
  try {
    const command = new GetSecretValueCommand({ SecretId: secretId });
    const response = await client.send(command);

    if (response.SecretString) {
      try {
        return JSON.parse(response.SecretString) as Record<string, unknown>;
      } catch {
        // Not JSON — return empty, use getRawSecretValue instead
        return {};
      }
    }

    return {};
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[secrets] Failed to retrieve secret "${secretId}": ${message}`);
    return {};
  }
}

/**
 * Retrieves a single secret as a raw string value (for non-JSON secrets).
 * Returns the string value, or null if not found.
 */
async function getRawSecretValue(
  client: SecretsManagerClient,
  secretId: string,
): Promise<string | null> {
  try {
    const command = new GetSecretValueCommand({ SecretId: secretId });
    const response = await client.send(command);
    return response.SecretString ?? null;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[secrets] Failed to retrieve secret "${secretId}": ${message}`);
    return null;
  }
}


/**
 * Fetches all application secrets from AWS Secrets Manager.
 *
 * In local development (NODE_ENV=development), returns an empty object so that
 * the config loader falls back to environment variables.
 *
 * In staging/production, fetches secrets from the path:
 *   /solo-founder-launch-os/{stage}/
 *
 * Uses IAM role-based access — no static credentials are required.
 * The ECS task role provides Secrets Manager read permissions in production.
 *
 * When secrets are rotated in Secrets Manager, the new values are picked up
 * on the next container restart without code changes (Requirement 4.6).
 *
 * @returns A flat config object suitable for merging with env-based config.
 */
export async function fetchSecrets(): Promise<Record<string, unknown>> {
  const stage = getStage();

  // In development, skip Secrets Manager and rely on env vars
  if (stage === 'development') {
    return {};
  }

  const region = process.env.AWS_REGION ?? 'us-east-1';
  const client = new SecretsManagerClient({ region });
  const basePath = `/solo-founder-launch-os/${stage}`;

  // Fetch all secret groups in parallel — each is stored as an individual secret
  const [databaseCreds, githubClientId, githubClientSecret, githubCallbackUrl, sessionSecret, encryptionKey] = await Promise.all([
    getSecretValue(client, `${basePath}/database/credentials`),
    getSecretValue(client, `${basePath}/github/client-id`),
    getSecretValue(client, `${basePath}/github/client-secret`),
    getSecretValue(client, `${basePath}/github/callback-url`),
    getSecretValue(client, `${basePath}/session/secret`),
    getSecretValue(client, `${basePath}/encryption/key`),
  ]);

  // Map Secrets Manager values to the config shape expected by validation.ts
  const config: Record<string, unknown> = {};

  // Database credentials are stored as JSON with 'username' and 'password' fields
  if (databaseCreds['username'] && databaseCreds['password']) {
    const host = process.env.DATABASE_HOST ?? 'localhost';
    const port = process.env.DATABASE_PORT ?? '5432';
    const dbName = process.env.DATABASE_NAME ?? 'solofounder';
    config['database'] = {
      url: `postgresql://${databaseCreds['username']}:${databaseCreds['password']}@${host}:${port}/${dbName}`,
    };
  }

  // Individual secrets are stored as plain strings (not JSON)
  // getSecretValue returns {} for non-JSON strings, so we need a raw fetch
  const githubConfig: Record<string, unknown> = {};
  if (typeof githubClientId === 'object' && Object.keys(githubClientId).length === 0) {
    // Secret was a plain string — refetch as raw
    githubConfig['clientId'] = await getRawSecretValue(client, `${basePath}/github/client-id`);
  }
  if (typeof githubClientSecret === 'object' && Object.keys(githubClientSecret).length === 0) {
    githubConfig['clientSecret'] = await getRawSecretValue(client, `${basePath}/github/client-secret`);
  }
  if (typeof githubCallbackUrl === 'object' && Object.keys(githubCallbackUrl).length === 0) {
    githubConfig['callbackUrl'] = await getRawSecretValue(client, `${basePath}/github/callback-url`);
  }
  if (Object.keys(githubConfig).length > 0) {
    config['github'] = githubConfig;
  }

  const rawSession = await getRawSecretValue(client, `${basePath}/session/secret`);
  if (rawSession) {
    config['session'] = { secret: rawSession };
  }

  const rawEncryption = await getRawSecretValue(client, `${basePath}/encryption/key`);
  if (rawEncryption) {
    config['encryption'] = { key: rawEncryption };
  }

  return config;
}
