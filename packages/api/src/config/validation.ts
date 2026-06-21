// Requirements: 4.1, 4.2, 4.3, 4.4, 1.8
// Configuration validation schema using Zod.
// Defines all required config fields and validates at startup.
// Error messages reference environment variable names for operator clarity.

import { z } from 'zod';

/**
 * Maps config paths to their corresponding environment variable names.
 * Used to produce actionable error messages that tell operators
 * exactly which env var to set.
 */
export const CONFIG_PATH_TO_ENV_VAR: Record<string, string> = {
  'database.url': 'DATABASE_URL',
  'session.secret': 'SESSION_SECRET',
  'github.clientId': 'GITHUB_CLIENT_ID',
  'github.clientSecret': 'GITHUB_CLIENT_SECRET',
  'github.callbackUrl': 'GITHUB_CALLBACK_URL',
  'encryption.key': 'ENCRYPTION_KEY',
  'cors.origin': 'FRONTEND_URL (or CORS_ORIGIN)',
  port: 'PORT',
  nodeEnv: 'NODE_ENV',
};

export const configSchema = z.object({
  port: z.number().int().min(1).max(65535),
  nodeEnv: z.enum(['development', 'staging', 'production']),
  database: z.object({
    url: z.string().min(1, 'DATABASE_URL is required'),
  }),
  session: z.object({
    secret: z.string().min(1, 'SESSION_SECRET is required'),
    maxAge: z.number().int().positive(),
  }),
  github: z.object({
    clientId: z.string().min(1, 'GITHUB_CLIENT_ID is required'),
    clientSecret: z.string().min(1, 'GITHUB_CLIENT_SECRET is required'),
    callbackUrl: z.string().url('GITHUB_CALLBACK_URL must be a valid URL'),
  }),
  encryption: z.object({
    key: z.string().min(1, 'ENCRYPTION_KEY is required'),
  }),
  errorTracking: z.object({
    logGroupName: z.string(),
    environment: z.string(),
  }),
  cors: z.object({
    origin: z.string().min(1, 'FRONTEND_URL (or CORS_ORIGIN) is required'),
  }),
});

export type AppConfig = z.infer<typeof configSchema>;

/**
 * Resolves a config path (e.g. "database.url") to its environment variable name.
 */
function resolveEnvVarName(configPath: string): string {
  return CONFIG_PATH_TO_ENV_VAR[configPath] ?? configPath;
}

/**
 * Validates a raw config object against the schema.
 * Throws a descriptive error listing all missing environment variables.
 */
export function validateConfig(raw: unknown): AppConfig {
  const result = configSchema.safeParse(raw);

  if (!result.success) {
    const issues = result.error.issues.map((issue) => {
      const configPath = issue.path.join('.');
      const envVar = resolveEnvVarName(configPath);
      return `  - ${envVar}: ${issue.message}`;
    });
    const message = [
      'Configuration validation failed. Missing or invalid environment variables:',
      ...issues,
    ].join('\n');
    throw new Error(message);
  }

  return result.data;
}
