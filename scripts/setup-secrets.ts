// Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.7
// Generates cryptographic secrets and stores them in AWS Secrets Manager.
// CLI: npx tsx scripts/setup-secrets.ts --stage production [--force]

import crypto from 'node:crypto';
import {
  CreateSecretCommand,
  GetSecretValueCommand,
  PutSecretValueCommand,
  ResourceNotFoundException,
} from '@aws-sdk/client-secrets-manager';
import { getSecretsManagerClient } from './lib/aws.js';

export interface SecretsSetupOptions {
  stage: 'staging' | 'production';
  force?: boolean;
}

export interface SecretDefinition {
  path: string;
  generate: boolean;
  description: string;
  generator?: () => string;
}

// Secrets that are auto-generated
const AUTO_SECRETS: SecretDefinition[] = [
  {
    path: '/solo-founder-launch-os/{stage}/session/secret',
    generate: true,
    description: 'Express session secret (256-bit random)',
    generator: () => crypto.randomBytes(32).toString('hex'),
  },
  {
    path: '/solo-founder-launch-os/{stage}/encryption/key',
    generate: true,
    description: 'AES-256 encryption key',
    generator: () => crypto.randomBytes(32).toString('base64'),
  },
];

// Secrets that require manual input (script documents them)
const MANUAL_SECRETS: string[] = [
  '/solo-founder-launch-os/{stage}/github/client-id',
  '/solo-founder-launch-os/{stage}/github/client-secret',
  '/solo-founder-launch-os/{stage}/github/callback-url',
];

function resolvePath(template: string, stage: string): string {
  return template.replace('{stage}', stage);
}

function parseArgs(argv: string[]): SecretsSetupOptions {
  const args = argv.slice(2);
  let stage: string | undefined;
  let force = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--stage' && i + 1 < args.length) {
      stage = args[++i];
    } else if (arg === '--force') {
      force = true;
    }
  }

  if (!stage || (stage !== 'staging' && stage !== 'production')) {
    console.error(
      'Usage: npx tsx scripts/setup-secrets.ts --stage <staging|production> [--force]'
    );
    console.error('');
    console.error('Options:');
    console.error(
      '  --stage   Required. Target environment: staging or production'
    );
    console.error(
      '  --force   Optional. Overwrite existing secrets'
    );
    process.exit(1);
  }

  return { stage: stage as 'staging' | 'production', force };
}

async function secretExists(
  client: ReturnType<typeof getSecretsManagerClient>,
  secretId: string
): Promise<boolean> {
  try {
    await client.send(
      new GetSecretValueCommand({ SecretId: secretId })
    );
    return true;
  } catch (err: unknown) {
    if (err instanceof ResourceNotFoundException) {
      return false;
    }
    throw err;
  }
}

async function createOrUpdateSecret(
  client: ReturnType<typeof getSecretsManagerClient>,
  secretId: string,
  value: string,
  description: string,
  exists: boolean
): Promise<void> {
  if (exists) {
    await client.send(
      new PutSecretValueCommand({
        SecretId: secretId,
        SecretString: value,
      })
    );
  } else {
    await client.send(
      new CreateSecretCommand({
        Name: secretId,
        SecretString: value,
        Description: description,
      })
    );
  }
}

async function setupAutoSecrets(
  client: ReturnType<typeof getSecretsManagerClient>,
  stage: string,
  force: boolean
): Promise<void> {
  console.log('');
  console.log('╭─────────────────────────────────────────────╮');
  console.log('│         Secrets Setup — Auto-Generated       │');
  console.log('╰─────────────────────────────────────────────╯');
  console.log('');

  for (const secret of AUTO_SECRETS) {
    const resolvedPath = resolvePath(secret.path, stage);
    const exists = await secretExists(client, resolvedPath);

    if (exists && !force) {
      console.log(
        `  ○ SKIP  ${resolvedPath}`
      );
      console.log(
        `          Already exists, use --force to overwrite`
      );
      continue;
    }

    if (!secret.generator) {
      console.error(`  ✗ ERROR No generator defined for ${resolvedPath}`);
      continue;
    }

    const value = secret.generator();
    await createOrUpdateSecret(
      client,
      resolvedPath,
      value,
      secret.description,
      exists
    );

    const action = exists ? 'UPDATED' : 'CREATED';
    console.log(`  ✓ ${action} ${resolvedPath}`);
    console.log(`          ${secret.description}`);
  }
}

function listManualSecrets(stage: string): void {
  console.log('');
  console.log('╭─────────────────────────────────────────────╮');
  console.log('│       Manual Secrets — User Population       │');
  console.log('╰─────────────────────────────────────────────╯');
  console.log('');
  console.log('  The following secrets must be populated manually:');
  console.log('');

  for (const template of MANUAL_SECRETS) {
    const resolvedPath = resolvePath(template, stage);
    console.log(`  → ${resolvedPath}`);
  }

  console.log('');
  console.log('  To populate a secret:');
  console.log(
    '    aws secretsmanager create-secret --name <path> --secret-string <value>'
  );
  console.log('');
  console.log('  GitHub OAuth setup:');
  console.log(
    '    1. Create a GitHub OAuth App at https://github.com/settings/developers'
  );
  console.log(
    `    2. Set callback URL to: https://api.solofounder.app/auth/github/callback`
  );
  console.log('    3. Store the client ID and client secret in the paths above');
  console.log('');
}

async function validateSecrets(
  client: ReturnType<typeof getSecretsManagerClient>,
  stage: string
): Promise<boolean> {
  console.log('╭─────────────────────────────────────────────╮');
  console.log('│            Secrets Validation                │');
  console.log('╰─────────────────────────────────────────────╯');
  console.log('');

  const allPaths = [
    ...AUTO_SECRETS.map((s) => resolvePath(s.path, stage)),
    ...MANUAL_SECRETS.map((t) => resolvePath(t, stage)),
  ];

  let allValid = true;

  for (const path of allPaths) {
    try {
      const response = await client.send(
        new GetSecretValueCommand({ SecretId: path })
      );

      if (response.SecretString && response.SecretString.length > 0) {
        console.log(`  ✓ PASS  ${path}`);
      } else {
        console.log(`  ✗ FAIL  ${path} — secret is empty`);
        allValid = false;
      }
    } catch (err: unknown) {
      if (err instanceof ResourceNotFoundException) {
        console.log(`  ✗ FAIL  ${path} — not found`);
      } else {
        console.log(`  ✗ FAIL  ${path} — error accessing secret`);
      }
      allValid = false;
    }
  }

  console.log('');
  if (allValid) {
    console.log('  ✓ All secrets validated successfully');
  } else {
    console.log('  ✗ Some secrets are missing or empty');
    console.log('    Run this script again or populate manual secrets');
  }
  console.log('');

  return allValid;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv);
  const client = getSecretsManagerClient();

  console.log(`Setting up secrets for stage: ${options.stage}`);
  if (options.force) {
    console.log('Force mode enabled — existing secrets will be overwritten');
  }

  await setupAutoSecrets(client, options.stage, options.force ?? false);
  listManualSecrets(options.stage);
  const valid = await validateSecrets(client, options.stage);

  if (!valid) {
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error('Fatal error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
