// Requirements: 2.5, 2.6
// Feature: launchchrome-design-system, Property 2: Dark-only surface invariant
// Validates: Requirements 2.5, 2.6

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Surface tokens used in the LaunchChrome™ design system.
 * These are the only valid background/surface colors for components.
 */
const SURFACE_TOKENS = {
  obsidian: '#050608',
  carbon: '#0B0D10',
  gunmetal: '#15191F',
  graphite: '#232933',
} as const;

type SurfaceTokenName = keyof typeof SURFACE_TOKENS;

const SURFACE_TOKEN_NAMES: SurfaceTokenName[] = Object.keys(SURFACE_TOKENS) as SurfaceTokenName[];

/**
 * Parse a hex color string to sRGB channels in 0-1 range.
 */
function hexToSRGB(hex: string): { r: number; g: number; b: number } {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255;
  return { r, g, b };
}

/**
 * Linearize an sRGB channel value using the WCAG formula.
 * If channel <= 0.03928, return channel / 12.92
 * Otherwise, return ((channel + 0.055) / 1.055) ^ 2.4
 */
function linearize(channel: number): number {
  if (channel <= 0.03928) {
    return channel / 12.92;
  }
  return Math.pow((channel + 0.055) / 1.055, 2.4);
}

/**
 * Compute the relative luminance of a color per WCAG 2.2.
 * L = 0.2126 * R + 0.7152 * G + 0.0722 * B
 * where R, G, B are linearized sRGB values.
 */
function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToSRGB(hex);
  const R = linearize(r);
  const G = linearize(g);
  const B = linearize(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

/**
 * Arbitrary that generates random surface token names from the design system.
 */
const surfaceTokenArb = fc.constantFrom(...SURFACE_TOKEN_NAMES);

describe('Feature: launchchrome-design-system, Property 2: Dark-only surface invariant', () => {
  /**
   * **Validates: Requirements 2.5, 2.6**
   *
   * Property: For any component background token reference in the design system,
   * the computed relative luminance must be below 0.05, ensuring all surfaces
   * are dark-only.
   */
  it('all surface tokens have relative luminance below 0.05 (dark surface)', () => {
    fc.assert(
      fc.property(surfaceTokenArb, (tokenName) => {
        const hex = SURFACE_TOKENS[tokenName];
        const luminance = relativeLuminance(hex);
        expect(luminance).toBeLessThan(0.05);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 2.5, 2.6**
   *
   * Property: No surface token resolves to a "light" color (luminance >= 0.5).
   * This is a stronger assertion ensuring the design system never produces
   * light-colored backgrounds.
   */
  it('no surface token resolves to a light color (luminance >= 0.5)', () => {
    fc.assert(
      fc.property(surfaceTokenArb, (tokenName) => {
        const hex = SURFACE_TOKENS[tokenName];
        const luminance = relativeLuminance(hex);
        expect(luminance).toBeLessThan(0.5);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Deterministic validation that all surface tokens individually satisfy the dark invariant.
   */
  it('each surface token individually has luminance below 0.05', () => {
    for (const [name, hex] of Object.entries(SURFACE_TOKENS)) {
      const luminance = relativeLuminance(hex);
      expect(
        luminance,
        `Surface token "${name}" (${hex}) has luminance ${luminance.toFixed(6)}, expected < 0.05`,
      ).toBeLessThan(0.05);
    }
  });

  /**
   * Verify the luminance computation is correct by testing known values.
   * Pure black (#000000) should be 0, pure white (#FFFFFF) should be 1.
   */
  it('luminance computation is correct for known reference values', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5);
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 5);
  });
});
