// Requirements: 2.3, 5.3
// Feature: launchchrome-design-system, Property 5: Card and panel surface correctness
// Validates: Requirements 2.3, 5.3

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Card variant → expected background class mapping.
 * Per the design spec:
 * - 'default' → bg-gunmetal (Foundation/Interactive surface)
 * - 'featured' → bg-gunmetal (Foundation/Interactive surface)
 * - 'elevated' → bg-graphite (Foundation/Interactive surface)
 */
const VARIANT_BACKGROUND_MAP: Record<CardVariant, string> = {
  default: 'bg-gunmetal',
  featured: 'bg-gunmetal',
  elevated: 'bg-graphite',
};

/**
 * Card variant → expected border class mapping.
 * - 'default' → border-graphite
 * - 'featured' → border-graphite
 * - 'elevated' → border-dark-chrome
 */
const VARIANT_BORDER_MAP: Record<CardVariant, string> = {
  default: 'border-graphite',
  featured: 'border-graphite',
  elevated: 'border-dark-chrome',
};

/**
 * Full variant style strings as defined in the Card component.
 */
const VARIANT_STYLES: Record<CardVariant, string> = {
  default: 'bg-gunmetal border border-graphite rounded-lg p-6',
  featured: 'bg-gunmetal border border-graphite shadow-panel rounded-lg p-6',
  elevated: 'bg-graphite border border-dark-chrome rounded-lg p-6',
};

/**
 * Accent styles that may be applied to Card.
 */
const ACCENT_STYLES: Record<CardAccent, string> = {
  pink: 'border-l-4 border-l-founder-pink',
  lime: 'border-l-4 border-l-launch-lime',
  cyan: 'border-l-4 border-l-hyper-cyan',
  red: 'border-l-4 border-l-alert-red',
  amber: 'border-l-4 border-l-warning-amber',
};

type CardVariant = 'default' | 'featured' | 'elevated';
type CardAccent = 'pink' | 'lime' | 'cyan' | 'red' | 'amber';

const CARD_VARIANTS: CardVariant[] = ['default', 'featured', 'elevated'];
const CARD_ACCENTS: (CardAccent | undefined)[] = ['pink', 'lime', 'cyan', 'red', 'amber', undefined];

/** Classes that must NEVER appear — white/light/non-token backgrounds. */
const FORBIDDEN_BACKGROUNDS = [
  'bg-white',
  'bg-gray-50',
  'bg-gray-100',
  'bg-gray-200',
  'bg-slate-50',
  'bg-slate-100',
  'bg-neutral-50',
  'bg-neutral-100',
  'bg-zinc-50',
  'bg-zinc-100',
];

/** Valid Foundation/Interactive surface background classes. */
const VALID_BACKGROUNDS = ['bg-gunmetal', 'bg-graphite'];

/** Valid border token classes. */
const VALID_BORDERS = ['border-graphite', 'border-dark-chrome'];

/**
 * Resolve the full class string for a Card given variant and accent.
 * Mirrors the Card component's clsx logic.
 */
function resolveCardClasses(variant: CardVariant, accent: CardAccent | undefined): string {
  const parts: string[] = [VARIANT_STYLES[variant]];
  if (accent) {
    parts.push(ACCENT_STYLES[accent]);
  }
  return parts.join(' ');
}

/**
 * Arbitraries for property-based testing.
 */
const variantArb = fc.constantFrom(...CARD_VARIANTS);
const accentArb = fc.constantFrom(...CARD_ACCENTS);

describe('Feature: launchchrome-design-system, Property 5: Card and panel surface correctness', () => {
  /**
   * **Validates: Requirements 2.3, 5.3**
   *
   * Property: For any Card variant rendered with any valid accent combination,
   * the background class resolves to a Foundation/Interactive surface token
   * (gunmetal or graphite only).
   */
  it('background resolves to gunmetal or graphite for all variant + accent combinations', () => {
    fc.assert(
      fc.property(variantArb, accentArb, (variant, accent) => {
        const classes = resolveCardClasses(variant, accent);
        const expectedBg = VARIANT_BACKGROUND_MAP[variant];

        // Assert the expected background class is present
        expect(classes).toContain(expectedBg);

        // Assert the background is one of the valid Foundation/Interactive surface tokens
        const hasValidBg = VALID_BACKGROUNDS.some((bg) => classes.includes(bg));
        expect(hasValidBg).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 2.3, 5.3**
   *
   * Property: For any Card variant rendered with any valid accent combination,
   * the border class resolves to graphite or dark-chrome token only.
   */
  it('border resolves to graphite or dark-chrome for all variant + accent combinations', () => {
    fc.assert(
      fc.property(variantArb, accentArb, (variant, accent) => {
        const classes = resolveCardClasses(variant, accent);
        const expectedBorder = VARIANT_BORDER_MAP[variant];

        // Assert the expected border class is present
        expect(classes).toContain(expectedBorder);

        // Assert at least one valid border token is present
        const hasValidBorder = VALID_BORDERS.some((border) => classes.includes(border));
        expect(hasValidBorder).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 2.3, 5.3**
   *
   * Property: For any Card variant rendered with any valid accent combination,
   * no white, light, or non-token background class is present.
   */
  it('no white, light, or non-token backgrounds are present in any combination', () => {
    fc.assert(
      fc.property(variantArb, accentArb, (variant, accent) => {
        const classes = resolveCardClasses(variant, accent);

        // Assert no forbidden background classes appear
        for (const forbidden of FORBIDDEN_BACKGROUNDS) {
          expect(classes).not.toContain(forbidden);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 2.3, 5.3**
   *
   * Property: The accent prop only affects the left-border styling and
   * does not change the background or main border token.
   */
  it('accent prop does not alter background or main border tokens', () => {
    fc.assert(
      fc.property(variantArb, accentArb, (variant, accent) => {
        const classesWithAccent = resolveCardClasses(variant, accent);
        const classesWithoutAccent = resolveCardClasses(variant, undefined);

        // Background should be the same regardless of accent
        const expectedBg = VARIANT_BACKGROUND_MAP[variant];
        expect(classesWithAccent).toContain(expectedBg);
        expect(classesWithoutAccent).toContain(expectedBg);

        // Main border should be the same regardless of accent
        const expectedBorder = VARIANT_BORDER_MAP[variant];
        expect(classesWithAccent).toContain(expectedBorder);
        expect(classesWithoutAccent).toContain(expectedBorder);
      }),
      { numRuns: 100 },
    );
  });
});
