/**
 * Property-Based Test: Design Token Resolution Completeness
 *
 * Feature: launchchrome-design-system, Property 1: Design token resolution completeness
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 1.9
 *
 * For any design token name in the specification, the resolved value from the
 * Tailwind configuration must exactly match the expected value defined in the Master Bible.
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import resolveConfig from 'tailwindcss/resolveConfig';
import tailwindConfig from '../../tailwind.config.ts';

const fullConfig = resolveConfig(tailwindConfig);

/**
 * Complete expected token set — token name → expected hex value
 * Sourced from the Master Bible / requirements document.
 */
const EXPECTED_COLOR_TOKENS: Record<string, string> = {
  // Foundation colors (Requirement 1.1)
  obsidian: '#050608',
  carbon: '#0B0D10',
  gunmetal: '#15191F',
  graphite: '#232933',
  // Chrome colors (Requirement 1.2)
  'chrome-white': '#F8FAFC',
  'chrome-silver': '#D7DCE3',
  'chrome-steel': '#929AA6',
  'dark-chrome': '#3B424C',
  // Energy colors (Requirement 1.3)
  'founder-pink': '#FF2BA6',
  'neon-magenta': '#FF4FC3',
  'launch-lime': '#B7FF2A',
  'electric-lime': '#D5FF65',
  // Supporting colors (Requirement 1.4)
  'hyper-cyan': '#42E8FF',
  'plasma-violet': '#9D63FF',
  'alert-red': '#FF4D5F',
  'warning-amber': '#FFB547',
  'victory-gold': '#FFD36A',
  // Text colors (Requirement 1.5)
  'text-primary': '#F7F9FC',
  'text-secondary': '#B7BEC9',
  'text-muted': '#7C8491',
  'text-disabled': '#555D68',
};

const EXPECTED_SPACING_TOKENS: Record<string, string> = {
  // Spacing scale (Requirement 1.8)
  '1': '4px',
  '2': '8px',
  '3': '12px',
  '4': '16px',
  '5': '20px',
  '6': '24px',
  '8': '32px',
  '12': '48px',
  '16': '64px',
  '24': '96px',
};

const EXPECTED_DURATION_TOKENS: Record<string, string> = {
  // Motion duration tokens (Requirement 1.9)
  instant: '80ms',
  fast: '140ms',
  standard: '220ms',
  slow: '360ms',
  cinematic: '700ms',
};

// Helpers to resolve values from the full config
function resolveColor(tokenName: string): string | undefined {
  const colors = fullConfig.theme?.colors as Record<string, unknown> | undefined;
  if (!colors) return undefined;
  const value = colors[tokenName];
  if (typeof value === 'string') return value;
  return undefined;
}

function resolveSpacing(tokenName: string): string | undefined {
  const spacing = fullConfig.theme?.spacing as Record<string, string> | undefined;
  if (!spacing) return undefined;
  return spacing[tokenName];
}

function resolveDuration(tokenName: string): string | undefined {
  const durations = fullConfig.theme?.transitionDuration as Record<string, string> | undefined;
  if (!durations) return undefined;
  return durations[tokenName];
}

describe('Feature: launchchrome-design-system, Property 1: Design token resolution completeness', () => {
  /**
   * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6**
   *
   * Property: For any color token name in the spec, the resolved Tailwind config
   * value exactly matches the Master Bible hex value (case-insensitive).
   */
  it('every color token resolves to its exact Master Bible hex value', () => {
    const colorTokenNames = Object.keys(EXPECTED_COLOR_TOKENS);
    const tokenArb = fc.constantFrom(...colorTokenNames);

    fc.assert(
      fc.property(tokenArb, (tokenName) => {
        const resolved = resolveColor(tokenName);
        const expected = EXPECTED_COLOR_TOKENS[tokenName];
        expect(resolved).toBeDefined();
        expect(resolved!.toLowerCase()).toBe(expected.toLowerCase());
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 1.8**
   *
   * Property: For any spacing token name in the spec, the resolved Tailwind config
   * value exactly matches the expected pixel value.
   */
  it('every spacing token resolves to its exact expected value', () => {
    const spacingTokenNames = Object.keys(EXPECTED_SPACING_TOKENS);
    const tokenArb = fc.constantFrom(...spacingTokenNames);

    fc.assert(
      fc.property(tokenArb, (tokenName) => {
        const resolved = resolveSpacing(tokenName);
        const expected = EXPECTED_SPACING_TOKENS[tokenName];
        expect(resolved).toBeDefined();
        expect(resolved).toBe(expected);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 1.9**
   *
   * Property: For any motion duration token name in the spec, the resolved Tailwind
   * config value exactly matches the expected millisecond value.
   */
  it('every motion duration token resolves to its exact expected value', () => {
    const durationTokenNames = Object.keys(EXPECTED_DURATION_TOKENS);
    const tokenArb = fc.constantFrom(...durationTokenNames);

    fc.assert(
      fc.property(tokenArb, (tokenName) => {
        const resolved = resolveDuration(tokenName);
        const expected = EXPECTED_DURATION_TOKENS[tokenName];
        expect(resolved).toBeDefined();
        expect(resolved).toBe(expected);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 1.9**
   *
   * Property: The complete token set is fully covered — every expected token exists
   * in the resolved config with no missing entries.
   */
  it('all expected tokens from the full spec set are present in the resolved config', () => {
    // Combine all token categories and pick randomly
    const allTokenEntries = [
      ...Object.entries(EXPECTED_COLOR_TOKENS).map(([name, value]) => ({
        category: 'color' as const,
        name,
        expected: value,
      })),
      ...Object.entries(EXPECTED_SPACING_TOKENS).map(([name, value]) => ({
        category: 'spacing' as const,
        name,
        expected: value,
      })),
      ...Object.entries(EXPECTED_DURATION_TOKENS).map(([name, value]) => ({
        category: 'duration' as const,
        name,
        expected: value,
      })),
    ];

    const tokenArb = fc.constantFrom(...allTokenEntries);

    fc.assert(
      fc.property(tokenArb, (token) => {
        let resolved: string | undefined;
        switch (token.category) {
          case 'color':
            resolved = resolveColor(token.name);
            break;
          case 'spacing':
            resolved = resolveSpacing(token.name);
            break;
          case 'duration':
            resolved = resolveDuration(token.name);
            break;
        }
        expect(resolved).toBeDefined();
        expect(resolved!.toLowerCase()).toBe(token.expected.toLowerCase());
      }),
      { numRuns: 100 }
    );
  });
});
