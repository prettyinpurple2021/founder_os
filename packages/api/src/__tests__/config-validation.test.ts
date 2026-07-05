// Requirements: 4.3, 4.4
// Unit tests for configuration validation: rejects incomplete config,
// hierarchical override strategy, and secrets are never logged/exposed.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateConfig } from '../config/validation.js';
import { loadConfig } from '../config/index.js';

/**
 * A complete valid config object for baseline testing.
 */
function buildValidConfig(): Record<string, unknown> {
  return {
    port: 3001,
    nodeEnv: 'production',
    database: { url: 'postgresql://user:pass@localhost:5432/db' },
    session: { secret: 'session-secret-value', maxAge: 86400000 },
    github: {
      clientId: 'gh-client-id',
      clientSecret: 'gh-client-secret',
      callbackUrl: 'https://example.com/auth/callback',
    },
    encryption: { key: 'encryption-key-value' },
    errorTracking: { logGroupName: '/app/logs', environment: 'production' },
    cors: { origin: 'https://app.example.com' },
  };
}

describe('validateConfig', () => {
  it('rejects an empty config with descriptive errors listing all required fields', () => {
    expect(() => validateConfig({})).toThrow(/Configuration validation failed/);

    try {
      validateConfig({});
    } catch (err) {
      const message = (err as Error).message;
      // Should mention required fields — either by env var name or by config path
      expect(message).toContain('Configuration validation failed');
      // When entire nested objects are missing, Zod reports the parent path
      expect(message).toContain('database');
      expect(message).toContain('session');
      expect(message).toContain('github');
      expect(message).toContain('encryption');
      expect(message).toContain('cors');
    }
  });

  it('rejects partial config and lists only the missing fields', () => {
    const partial = {
      port: 3001,
      nodeEnv: 'production',
      database: { url: 'postgresql://localhost/db' },
      session: { secret: 'secret', maxAge: 86400000 },
      github: {
        clientId: 'id',
        clientSecret: 'secret',
        callbackUrl: 'https://example.com/cb',
      },
      encryption: { key: '' }, // empty — should fail
      errorTracking: { logGroupName: '/logs', environment: 'prod' },
      cors: { origin: '' }, // empty — should fail
    };

    try {
      validateConfig(partial);
      expect.fail('Should have thrown');
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain('ENCRYPTION_KEY');
      expect(message).toContain('FRONTEND_URL');
      // Should NOT complain about fields that are present and valid
      expect(message).not.toContain('DATABASE_URL');
      expect(message).not.toContain('SESSION_SECRET');
      expect(message).not.toContain('GITHUB_CLIENT_ID');
    }
  });

  it('accepts a complete valid config and returns it', () => {
    const raw = buildValidConfig();
    const result = validateConfig(raw);

    expect(result.port).toBe(3001);
    expect(result.nodeEnv).toBe('production');
    expect(result.database.url).toBe('postgresql://user:pass@localhost:5432/db');
    expect(result.session.secret).toBe('session-secret-value');
    expect(result.github.clientId).toBe('gh-client-id');
    expect(result.encryption.key).toBe('encryption-key-value');
    expect(result.cors.origin).toBe('https://app.example.com');
  });
});

describe('loadConfig — hierarchical override strategy', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    // Set all required env vars so config can load without secrets
    process.env.PORT = '4000';
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://env-user:env-pass@envhost:5432/envdb';
    process.env.SESSION_SECRET = 'env-session-secret';
    process.env.SESSION_MAX_AGE = '3600000';
    process.env.GITHUB_CLIENT_ID = 'env-gh-id';
    process.env.GITHUB_CLIENT_SECRET = 'env-gh-secret';
    process.env.GITHUB_CALLBACK_URL = 'https://env.example.com/callback';
    process.env.ENCRYPTION_KEY = 'env-encryption-key';
    process.env.ERROR_LOG_GROUP_NAME = '/env/logs';
    process.env.FRONTEND_URL = 'https://env.example.com';
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('fetchSecrets overrides environment variable values', async () => {
    // Mock process.exit to prevent test from exiting
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);

    const fetchSecrets = vi.fn().mockResolvedValue({
      database: { url: 'postgresql://secret-user:secret-pass@secrethost:5432/secretdb' },
      session: { secret: 'secret-session-override' },
    });

    const config = await loadConfig(fetchSecrets);

    expect(fetchSecrets).toHaveBeenCalledOnce();
    // Secrets Manager values should override env vars
    expect(config.database.url).toBe(
      'postgresql://secret-user:secret-pass@secrethost:5432/secretdb',
    );
    expect(config.session.secret).toBe('secret-session-override');
    // Env vars still used for fields not present in secrets
    expect(config.github.clientId).toBe('env-gh-id');
    expect(config.port).toBe(4000);

    exitSpy.mockRestore();
  });

  it('builds DATABASE_URL from discrete database environment variables', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);

    delete process.env.DATABASE_URL;
    process.env.DATABASE_HOST = 'db.internal';
    process.env.DATABASE_PORT = '5432';
    process.env.DATABASE_NAME = 'solofounder';
    process.env.DATABASE_USER = 'service-user';
    process.env.DATABASE_PASSWORD = 'service-password';

    const fetchSecrets = vi.fn().mockResolvedValue({});
    const config = await loadConfig(fetchSecrets);

    expect(config.database.url).toContain('@db.internal:5432/solofounder');
    expect(config.database.url).toContain('service-user');

    exitSpy.mockRestore();
  });
});

describe('loadConfig — secrets are never logged or exposed', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.PORT = '3001';
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://user:supersecretpassword@host:5432/db';
    process.env.SESSION_SECRET = 'top-secret-session';
    process.env.SESSION_MAX_AGE = '86400000';
    process.env.GITHUB_CLIENT_ID = 'gh-id';
    process.env.GITHUB_CLIENT_SECRET = 'gh-very-secret';
    process.env.GITHUB_CALLBACK_URL = 'https://example.com/callback';
    process.env.ENCRYPTION_KEY = 'super-secret-encryption-key';
    process.env.ERROR_LOG_GROUP_NAME = '/app/logs';
    process.env.FRONTEND_URL = 'https://app.example.com';
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('does not log secret values when config validation fails', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);

    // Remove a required field to trigger validation failure
    delete process.env.DATABASE_URL;
    process.env.ENCRYPTION_KEY = '';

    loadConfig().catch(() => {
      // expected — process.exit is mocked to throw
    });

    // Wait for async to settle, then check logs
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const loggedOutput = consoleErrorSpy.mock.calls.map((args) => args.join(' ')).join('\n');

        // The logged output should NOT contain any raw secret values
        expect(loggedOutput).not.toContain('top-secret-session');
        expect(loggedOutput).not.toContain('gh-very-secret');
        expect(loggedOutput).not.toContain('super-secret-encryption-key');
        expect(loggedOutput).not.toContain('supersecretpassword');

        consoleErrorSpy.mockRestore();
        exitSpy.mockRestore();
        resolve();
      }, 50);
    });
  });

  it('does not expose secrets in validation error messages', () => {
    // Test that validateConfig error messages don't contain actual secret values
    const partialConfig = {
      port: 3001,
      nodeEnv: 'production',
      database: { url: '' }, // invalid
      session: { secret: 'actual-secret-value', maxAge: 86400000 },
      github: {
        clientId: 'my-client-id',
        clientSecret: 'my-client-secret',
        callbackUrl: 'not-a-valid-url',
      },
      encryption: { key: '' },
      errorTracking: { logGroupName: '/logs', environment: 'prod' },
      cors: { origin: '' },
    };

    try {
      validateConfig(partialConfig);
      expect.fail('Should have thrown');
    } catch (err) {
      const message = (err as Error).message;
      // Error messages should describe what is wrong, not echo secret values
      expect(message).not.toContain('actual-secret-value');
      expect(message).not.toContain('my-client-secret');
    }
  });
});
