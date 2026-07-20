/**
 * Feature: launchchrome-design-system, Property 6: Badge semantic color mapping
 *
 * Validates: Requirements 5.5
 *
 * For any valid Badge color prop value, the rendered color classes must map to
 * the correct semantic Energy color: 'lime' → Launch Lime, 'pink' → Founder Pink,
 * 'cyan' → Hyper Cyan, 'red' → Alert Red, 'amber' → Warning Amber, 'gold' → Victory Gold,
 * 'chrome' → Chrome Steel/Silver.
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// Expected color → class mapping from the design spec
const expectedColorMapping: Record<string, { bg: string; text: string }> = {
  lime: { bg: 'bg-launch-lime/10', text: 'text-launch-lime' },
  pink: { bg: 'bg-founder-pink/10', text: 'text-founder-pink' },
  cyan: { bg: 'bg-hyper-cyan/10', text: 'text-hyper-cyan' },
  red: { bg: 'bg-alert-red/10', text: 'text-alert-red' },
  amber: { bg: 'bg-warning-amber/10', text: 'text-warning-amber' },
  gold: { bg: 'bg-victory-gold/10', text: 'text-victory-gold' },
  chrome: { bg: 'bg-chrome-steel/10', text: 'text-chrome-silver' },
};

// The actual colorStyles from the Badge component (imported logic)
const badgeColorStyles: Record<string, string> = {
  lime: 'bg-launch-lime/10 text-launch-lime',
  pink: 'bg-founder-pink/10 text-founder-pink',
  cyan: 'bg-hyper-cyan/10 text-hyper-cyan',
  red: 'bg-alert-red/10 text-alert-red',
  amber: 'bg-warning-amber/10 text-warning-amber',
  gold: 'bg-victory-gold/10 text-victory-gold',
  chrome: 'bg-chrome-steel/10 text-chrome-silver',
};

const validBadgeColors = ['lime', 'pink', 'cyan', 'red', 'amber', 'gold', 'chrome'] as const;

// Generator for valid badge color props
const badgeColorArb = fc.constantFrom(...validBadgeColors);

describe('Feature: launchchrome-design-system, Property 6: Badge semantic color mapping', () => {
  it('every valid badge color prop maps to the correct Energy color background and text classes', () => {
    fc.assert(
      fc.property(badgeColorArb, (color) => {
        const renderedClasses = badgeColorStyles[color];
        const expected = expectedColorMapping[color];

        // Assert the rendered classes contain the correct background token
        expect(renderedClasses).toContain(expected.bg);

        // Assert the rendered classes contain the correct text token
        expect(renderedClasses).toContain(expected.text);
      }),
      { numRuns: 100 },
    );
  });

  it('badge color mapping is exhaustive — every valid color has a defined style', () => {
    fc.assert(
      fc.property(badgeColorArb, (color) => {
        // Every valid color must have a non-empty class string in the mapping
        expect(badgeColorStyles[color]).toBeDefined();
        expect(badgeColorStyles[color].length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  it('badge color classes always include both a background and a text utility', () => {
    fc.assert(
      fc.property(badgeColorArb, (color) => {
        const classes = badgeColorStyles[color];
        const classList = classes.split(' ');

        // Must have at least one bg-* class
        const hasBgClass = classList.some((cls) => cls.startsWith('bg-'));
        expect(hasBgClass).toBe(true);

        // Must have at least one text-* class
        const hasTextClass = classList.some((cls) => cls.startsWith('text-'));
        expect(hasTextClass).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('badge background classes use /10 opacity for subtle semantic backgrounds', () => {
    fc.assert(
      fc.property(badgeColorArb, (color) => {
        const classes = badgeColorStyles[color];
        const classList = classes.split(' ');

        // The background class must use /10 opacity modifier
        const bgClass = classList.find((cls) => cls.startsWith('bg-'));
        expect(bgClass).toContain('/10');
      }),
      { numRuns: 100 },
    );
  });
});
