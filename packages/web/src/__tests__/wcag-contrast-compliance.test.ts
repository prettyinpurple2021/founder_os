// Requirements: 3.7, 7.1, 7.2, 7.3
// Feature: launchchrome-design-system, Property 3: WCAG contrast compliance
// Validates: Requirements 3.7, 7.1, 7.2, 7.3

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Parses a hex color string to RGB components (0–255).
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const cleaned = hex.replace('#', '');
  return {
    r: parseInt(cleaned.slice(0, 2), 16),
    g: parseInt(cleaned.slice(2, 4), 16),
    b: parseInt(cleaned.slice(4, 6), 16),
  };
}

/**
 * Converts an sRGB channel value (0–255) to linear luminance component.
 * Per WCAG 2.2 relative luminance formula.
 */
function srgbToLinear(channel: number): number {
  const s = channel / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/**
 * Computes relative luminance of a hex color per WCAG 2.2.
 * L = 0.2126 * R + 0.7152 * G + 0.0722 * B
 */
function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

/**
 * Computes WCAG 2.2 contrast ratio between two colors.
 * Ratio = (L1 + 0.05) / (L2 + 0.05) where L1 >= L2.
 */
function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ─── Token Definitions ───────────────────────────────────────────────────────

/** Foreground (text) tokens used in the LaunchChrome™ design system */
const textTokens = {
  'text-primary': '#F7F9FC',
  'text-secondary': '#B7BEC9',
  'text-muted': '#7C8491',
  'chrome-white': '#F8FAFC',
  'chrome-silver': '#D7DCE3',
} as const;

/** Background (surface) tokens from the Foundation palette */
const surfaceTokens = {
  obsidian: '#050608',
  carbon: '#0B0D10',
  gunmetal: '#15191F',
  graphite: '#232933',
} as const;

/** Energy color tokens used for borders on interactive controls */
const energyBorderTokens = {
  'founder-pink': '#FF2BA6',
  'hyper-cyan': '#42E8FF',
  'launch-lime': '#B7FF2A',
} as const;

// ─── Valid Pair Definitions ──────────────────────────────────────────────────

type TextTokenName = keyof typeof textTokens;
type SurfaceTokenName = keyof typeof surfaceTokens;

interface NormalTextPair {
  foreground: TextTokenName;
  background: SurfaceTokenName;
  type: 'normal';
}

interface LargeTextPair {
  foreground: TextTokenName;
  background: SurfaceTokenName;
  type: 'large';
}

interface BorderPair {
  foreground: string;
  foregroundHex: string;
  background: SurfaceTokenName;
  type: 'border';
}

/**
 * Normal text pairs: must achieve ≥ 4.5:1 contrast.
 * text-primary and text-secondary are used for normal text on all surfaces.
 */
const normalTextPairs: NormalTextPair[] = [
  // text-primary on all surfaces
  { foreground: 'text-primary', background: 'obsidian', type: 'normal' },
  { foreground: 'text-primary', background: 'carbon', type: 'normal' },
  { foreground: 'text-primary', background: 'gunmetal', type: 'normal' },
  { foreground: 'text-primary', background: 'graphite', type: 'normal' },
  // text-secondary on all surfaces
  { foreground: 'text-secondary', background: 'obsidian', type: 'normal' },
  { foreground: 'text-secondary', background: 'carbon', type: 'normal' },
  { foreground: 'text-secondary', background: 'gunmetal', type: 'normal' },
  { foreground: 'text-secondary', background: 'graphite', type: 'normal' },
  // chrome-white on all surfaces (used for headings / primary content)
  { foreground: 'chrome-white', background: 'obsidian', type: 'normal' },
  { foreground: 'chrome-white', background: 'carbon', type: 'normal' },
  { foreground: 'chrome-white', background: 'gunmetal', type: 'normal' },
  { foreground: 'chrome-white', background: 'graphite', type: 'normal' },
  // chrome-silver on all surfaces (used for button text / labels)
  { foreground: 'chrome-silver', background: 'obsidian', type: 'normal' },
  { foreground: 'chrome-silver', background: 'carbon', type: 'normal' },
  { foreground: 'chrome-silver', background: 'gunmetal', type: 'normal' },
  { foreground: 'chrome-silver', background: 'graphite', type: 'normal' },
];

/**
 * Large text pairs: must achieve ≥ 3:1 contrast.
 * text-muted is used for large text (18px+) and tertiary information.
 */
const largeTextPairs: LargeTextPair[] = [
  { foreground: 'text-muted', background: 'obsidian', type: 'large' },
  { foreground: 'text-muted', background: 'carbon', type: 'large' },
  { foreground: 'text-muted', background: 'gunmetal', type: 'large' },
  { foreground: 'text-muted', background: 'graphite', type: 'large' },
];

/**
 * Border pairs: energy color borders on surfaces must achieve ≥ 3:1 contrast.
 * These are interactive control boundaries per WCAG 2.2 requirement 7.3.
 */
const borderPairs: BorderPair[] = [
  { foreground: 'founder-pink', foregroundHex: '#FF2BA6', background: 'graphite', type: 'border' },
  { foreground: 'hyper-cyan', foregroundHex: '#42E8FF', background: 'carbon', type: 'border' },
  { foreground: 'launch-lime', foregroundHex: '#B7FF2A', background: 'graphite', type: 'border' },
  // Additional border pairs on other surfaces
  { foreground: 'founder-pink', foregroundHex: '#FF2BA6', background: 'obsidian', type: 'border' },
  { foreground: 'founder-pink', foregroundHex: '#FF2BA6', background: 'carbon', type: 'border' },
  { foreground: 'founder-pink', foregroundHex: '#FF2BA6', background: 'gunmetal', type: 'border' },
  { foreground: 'hyper-cyan', foregroundHex: '#42E8FF', background: 'obsidian', type: 'border' },
  { foreground: 'hyper-cyan', foregroundHex: '#42E8FF', background: 'gunmetal', type: 'border' },
  { foreground: 'hyper-cyan', foregroundHex: '#42E8FF', background: 'graphite', type: 'border' },
  { foreground: 'launch-lime', foregroundHex: '#B7FF2A', background: 'obsidian', type: 'border' },
  { foreground: 'launch-lime', foregroundHex: '#B7FF2A', background: 'carbon', type: 'border' },
  { foreground: 'launch-lime', foregroundHex: '#B7FF2A', background: 'gunmetal', type: 'border' },
];

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Feature: launchchrome-design-system, Property 3: WCAG contrast compliance', () => {
  it('normal text token pairs achieve ≥ 4.5:1 contrast ratio against all surfaces', () => {
    const pairArb = fc.constantFrom(...normalTextPairs);

    fc.assert(
      fc.property(pairArb, (pair) => {
        const fgHex = textTokens[pair.foreground];
        const bgHex = surfaceTokens[pair.background];
        const ratio = contrastRatio(fgHex, bgHex);

        expect(ratio).toBeGreaterThanOrEqual(4.5);

        return ratio >= 4.5;
      }),
      { numRuns: 100 },
    );
  });

  it('large text token pairs achieve ≥ 3:1 contrast ratio against all surfaces', () => {
    const pairArb = fc.constantFrom(...largeTextPairs);

    fc.assert(
      fc.property(pairArb, (pair) => {
        const fgHex = textTokens[pair.foreground];
        const bgHex = surfaceTokens[pair.background];
        const ratio = contrastRatio(fgHex, bgHex);

        expect(ratio).toBeGreaterThanOrEqual(3.0);

        return ratio >= 3.0;
      }),
      { numRuns: 100 },
    );
  });

  it('energy color borders achieve ≥ 3:1 contrast ratio against adjacent surfaces', () => {
    const pairArb = fc.constantFrom(...borderPairs);

    fc.assert(
      fc.property(pairArb, (pair) => {
        const fgHex = pair.foregroundHex;
        const bgHex = surfaceTokens[pair.background];
        const ratio = contrastRatio(fgHex, bgHex);

        expect(ratio).toBeGreaterThanOrEqual(3.0);

        return ratio >= 3.0;
      }),
      { numRuns: 100 },
    );
  });

  it('all (foreground, background) pairs from the design system meet their respective WCAG thresholds', () => {
    // Combined arbitrary that randomly selects any valid pair type
    const allPairsArb = fc.oneof(
      fc.constantFrom(...normalTextPairs).map((p) => ({
        fgHex: textTokens[p.foreground],
        bgHex: surfaceTokens[p.background],
        threshold: 4.5,
        label: `${p.foreground} on ${p.background} (normal text)`,
      })),
      fc.constantFrom(...largeTextPairs).map((p) => ({
        fgHex: textTokens[p.foreground],
        bgHex: surfaceTokens[p.background],
        threshold: 3.0,
        label: `${p.foreground} on ${p.background} (large text)`,
      })),
      fc.constantFrom(...borderPairs).map((p) => ({
        fgHex: p.foregroundHex,
        bgHex: surfaceTokens[p.background],
        threshold: 3.0,
        label: `${p.foreground} on ${p.background} (border)`,
      })),
    );

    fc.assert(
      fc.property(allPairsArb, ({ fgHex, bgHex, threshold, label }) => {
        const ratio = contrastRatio(fgHex, bgHex);

        if (ratio < threshold) {
          throw new Error(
            `WCAG contrast failure: ${label} has ratio ${ratio.toFixed(2)}:1, ` +
              `required ≥ ${threshold}:1 (fg: ${fgHex}, bg: ${bgHex})`,
          );
        }

        return true;
      }),
      { numRuns: 100 },
    );
  });
});
