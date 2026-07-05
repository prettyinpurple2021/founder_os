// Requirements: 4.1, 4.2, 4.3, 4.4
// Configuration loader with hierarchical strategy:
// Secrets Manager → environment variables → defaults.
// Fails fast at startup with descriptive error messages listing all missing variables.

import { validateConfig, type AppConfig } from './validation.js';
import { buildDatabaseUrl } from './databaseUrl.js';

/**
 * Mapping from environment variable names to their config paths.
 * Used to build a raw config object from process.env.
 */
function buildRawConfigFromEnv(): Record<string, unknown> {
  const env = process.env;

  return {
    port: env.PORT ? parseInt(env.PORT, 10) : 3001,
    nodeEnv: env.NODE_ENV ?? 'development',
    database: {
      url: buildDatabaseUrl(env),
    },
    session: {
      secret: env.SESSION_SECRET ?? '',
      maxAge: env.SESSION_MAX_AGE ? parseInt(env.SESSION_MAX_AGE, 10) : 86400000, // 24h
    },
    github: {
      clientId: env.GITHUB_CLIENT_ID ?? '',
      clientSecret: env.GITHUB_CLIENT_SECRET ?? '',
      callbackUrl: env.GITHUB_CALLBACK_URL ?? '',
    },
    encryption: {
      key: env.ENCRYPTION_KEY ?? '',
    },
    errorTracking: {
      logGroupName: env.ERROR_LOG_GROUP_NAME ?? '/solo-founder-launch-os/api',
      environment: env.NODE_ENV ?? 'development',
    },
    cors: {
      origin: env.FRONTEND_URL ?? env.CORS_ORIGIN ?? '',
    },
  };
}

/**
 * Deep-merges two config objects. Source values override target values.
 * Only overrides with non-empty string values (empty strings are ignored).
 */
function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...target };

  for (const key of Object.keys(source)) {
    const sourceVal = source[key];
    const targetVal = target[key];

    if (
      sourceVal !== null &&
      sourceVal !== undefined &&
      typeof sourceVal === 'object' &&
      !Array.isArray(sourceVal) &&
      typeof targetVal === 'object' &&
      targetVal !== null &&
      !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>,
      );
    } else if (sourceVal !== '' && sourceVal !== null && sourceVal !== undefined) {
      result[key] = sourceVal;
    }
  }

  return result;
}

/**
 * Loads application configuration using a hierarchical strategy:
 * 1. Start with defaults
 * 2. Override with environment variables
 * 3. Override with Secrets Manager values (if available)
 *
 * The Secrets Manager integration is provided by the `fetchSecrets` parameter,
 * allowing task 1.2 to plug in the AWS Secrets Manager client without modifying this file.
 *
 * Fails fast with descriptive error messages if validation fails.
 */
export async function loadConfig(
  fetchSecrets?: () => Promise<Record<string, unknown>>,
): Promise<AppConfig> {
  // Step 1 & 2: Build config from environment variables (includes defaults)
  const envConfig = buildRawConfigFromEnv();

  // Step 3: Overlay Secrets Manager values if a fetcher is provided
  let finalRaw = envConfig;
  if (fetchSecrets) {
    try {
      const secrets = await fetchSecrets();
      finalRaw = deepMerge(envConfig, secrets);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[config] Failed to load secrets: ${message}`);
      // Continue with env-only config; validation will catch missing required fields
    }
  }

  // Step 4: Validate and fail fast (Requirement 1.8)
  // Exit with non-zero code and log which environment variables are missing.
  try {
    return validateConfig(finalRaw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[config] Startup failed: ${message}`);
    process.exit(1);
  }
}

export type { AppConfig } from './validation.js';
