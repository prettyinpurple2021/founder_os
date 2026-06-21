// Requirements: 4.1, 4.5, 4.6, 4.7
// AWS Secrets Manager client for retrieving production secrets.
// Uses IAM role-based access (no static keys).
// In local development, falls back to environment variables by returning an empty object.
// Supports separate secret paths per environment: /solo-founder-launch-os/{stage}/

import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';

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
 * Returns the parsed JSON value, or an empty object if the secret is not found.
 */
async function getSecretValue(
  client: SecretsManagerClient,
  secretId: string,
): Promise<Record<string, unknown>> {
  try {
    const command = new GetSecretValueCommand({ SecretId: secretId });
    const response = await client.send(command);

    if (response.SecretString) {
      return JSON.parse(response.SecretString) as Record<string, unknown>;
    }

    return {};
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[secrets] Failed to retrieve secret "${secretId}": ${message}`);
    return {};
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

  // Fetch all secret groups in parallel
  const [database, github, session, encryption] = await Promise.all([
    getSecretValue(client, `${basePath}/database`),
    getSecretValue(client, `${basePath}/github`),
    getSecretValue(client, `${basePath}/session`),
    getSecretValue(client, `${basePath}/encryption`),
  ]);

  // Map Secrets Manager values to the config shape expected by validation.ts
  const config: Record<string, unknown> = {};

  if (database['url']) {
    config['database'] = { url: database['url'] };
  }

  if (github['client-id'] || github['client-secret'] || github['callback-url']) {
    config['github'] = {
      ...(github['client-id'] ? { clientId: github['client-id'] } : {}),
      ...(github['client-secret'] ? { clientSecret: github['client-secret'] } : {}),
      ...(github['callback-url'] ? { callbackUrl: github['callback-url'] } : {}),
    };
  }

  if (session['secret']) {
    config['session'] = { secret: session['secret'] };
  }

  if (encryption['key']) {
    config['encryption'] = { key: encryption['key'] };
  }

  return config;
}
