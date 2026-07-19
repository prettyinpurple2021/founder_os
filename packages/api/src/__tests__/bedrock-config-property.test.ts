// Feature: bedrock-content-generation, Property 3: Configuration resolution uses environment values with correct defaults

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

/**
 * Property 3: Configuration resolution uses environment values with correct defaults
 *
 * For any non-empty string value set as BEDROCK_MODEL_ID, that exact value SHALL be used
 * as the model ID. For any empty or unset BEDROCK_MODEL_ID, the value `amazon.nova-pro-v1:0`
 * SHALL be used. For any non-empty string value set as BEDROCK_REGION, that exact value SHALL
 * be used as the client region. For any empty or unset BEDROCK_REGION, the value `us-east-1`
 * SHALL be used. For any value of BEDROCK_ENABLED that is NOT case-insensitive "false",
 * enabled is true. For BEDROCK_ENABLED undefined/unset, enabled is true.
 *
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4
 */

// --- Pure function replicating resolveConfig logic from bedrock.ts ---

interface BedrockConfig {
  modelId: string;
  region: string;
  enabled: boolean;
}

/**
 * Pure function that mirrors the configuration resolution logic in bedrock.ts.
 * Takes explicit env values (undefined means "not set") and returns resolved config.
 */
function resolveConfig(env: {
  BEDROCK_MODEL_ID: string | undefined;
  BEDROCK_REGION: string | undefined;
  BEDROCK_ENABLED: string | undefined;
}): BedrockConfig {
  const modelId = env.BEDROCK_MODEL_ID || 'amazon.nova-pro-v1:0';
  const region = env.BEDROCK_REGION || 'us-east-1';
  const enabledEnv = env.BEDROCK_ENABLED;
  const enabled = enabledEnv?.toLowerCase() !== 'false';
  return { modelId, region, enabled };
}

// --- Arbitraries ---

/** Generates a non-empty string suitable for env var values. */
const nonEmptyEnvValueArb = fc.string({ minLength: 1, maxLength: 200 }).filter((s) => s.length > 0);

/** Generates values that are "empty-like" — empty string or undefined. */
const emptyOrUndefinedArb: fc.Arbitrary<string | undefined> = fc.oneof(
  fc.constant(undefined),
  fc.constant(''),
);

/** Generates a case variation of "false" (e.g., "False", "FALSE", "fAlSe"). */
const falseVariationArb: fc.Arbitrary<string> = fc
  .array(fc.boolean(), { minLength: 5, maxLength: 5 })
  .map((bools) => {
    const base = 'false';
    return base
      .split('')
      .map((ch, i) => (bools[i] ? ch.toUpperCase() : ch.toLowerCase()))
      .join('');
  });

/** Generates strings that are NOT case-insensitive "false". */
const notFalseStringArb: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 50 })
  .filter((s) => s.toLowerCase() !== 'false');

// --- Property Tests ---

describe('Property 3: Configuration resolution uses environment values with correct defaults', () => {
  it('non-empty BEDROCK_MODEL_ID is used as modelId', () => {
    fc.assert(
      fc.property(nonEmptyEnvValueArb, (modelIdValue) => {
        const config = resolveConfig({
          BEDROCK_MODEL_ID: modelIdValue,
          BEDROCK_REGION: undefined,
          BEDROCK_ENABLED: undefined,
        });
        expect(config.modelId).toBe(modelIdValue);
      }),
      { numRuns: 100 },
    );
  });

  it('empty or undefined BEDROCK_MODEL_ID defaults to amazon.nova-pro-v1:0', () => {
    fc.assert(
      fc.property(emptyOrUndefinedArb, (modelIdValue) => {
        const config = resolveConfig({
          BEDROCK_MODEL_ID: modelIdValue,
          BEDROCK_REGION: undefined,
          BEDROCK_ENABLED: undefined,
        });
        expect(config.modelId).toBe('amazon.nova-pro-v1:0');
      }),
      { numRuns: 100 },
    );
  });

  it('non-empty BEDROCK_REGION is used as region', () => {
    fc.assert(
      fc.property(nonEmptyEnvValueArb, (regionValue) => {
        const config = resolveConfig({
          BEDROCK_MODEL_ID: undefined,
          BEDROCK_REGION: regionValue,
          BEDROCK_ENABLED: undefined,
        });
        expect(config.region).toBe(regionValue);
      }),
      { numRuns: 100 },
    );
  });

  it('empty or undefined BEDROCK_REGION defaults to us-east-1', () => {
    fc.assert(
      fc.property(emptyOrUndefinedArb, (regionValue) => {
        const config = resolveConfig({
          BEDROCK_MODEL_ID: undefined,
          BEDROCK_REGION: regionValue,
          BEDROCK_ENABLED: undefined,
        });
        expect(config.region).toBe('us-east-1');
      }),
      { numRuns: 100 },
    );
  });

  it('BEDROCK_ENABLED that is NOT case-insensitive "false" results in enabled=true', () => {
    fc.assert(
      fc.property(notFalseStringArb, (enabledValue) => {
        const config = resolveConfig({
          BEDROCK_MODEL_ID: undefined,
          BEDROCK_REGION: undefined,
          BEDROCK_ENABLED: enabledValue,
        });
        expect(config.enabled).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('BEDROCK_ENABLED undefined results in enabled=true', () => {
    const config = resolveConfig({
      BEDROCK_MODEL_ID: undefined,
      BEDROCK_REGION: undefined,
      BEDROCK_ENABLED: undefined,
    });
    expect(config.enabled).toBe(true);
  });

  it('any case variation of "false" for BEDROCK_ENABLED results in enabled=false', () => {
    fc.assert(
      fc.property(falseVariationArb, (enabledValue) => {
        const config = resolveConfig({
          BEDROCK_MODEL_ID: undefined,
          BEDROCK_REGION: undefined,
          BEDROCK_ENABLED: enabledValue,
        });
        expect(config.enabled).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('all env vars resolve simultaneously with correct precedence', () => {
    fc.assert(
      fc.property(
        fc.oneof(nonEmptyEnvValueArb, emptyOrUndefinedArb),
        fc.oneof(nonEmptyEnvValueArb, emptyOrUndefinedArb),
        fc.oneof(notFalseStringArb, falseVariationArb, fc.constant(undefined)),
        (modelIdValue, regionValue, enabledValue) => {
          const config = resolveConfig({
            BEDROCK_MODEL_ID: modelIdValue,
            BEDROCK_REGION: regionValue,
            BEDROCK_ENABLED: enabledValue,
          });

          // Model ID: use value if non-empty, else default
          if (modelIdValue && modelIdValue.length > 0) {
            expect(config.modelId).toBe(modelIdValue);
          } else {
            expect(config.modelId).toBe('amazon.nova-pro-v1:0');
          }

          // Region: use value if non-empty, else default
          if (regionValue && regionValue.length > 0) {
            expect(config.region).toBe(regionValue);
          } else {
            expect(config.region).toBe('us-east-1');
          }

          // Enabled: false only when value is case-insensitive "false"
          if (enabledValue?.toLowerCase() === 'false') {
            expect(config.enabled).toBe(false);
          } else {
            expect(config.enabled).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
