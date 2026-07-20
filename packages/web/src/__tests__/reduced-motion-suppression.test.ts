// Requirements: 7.4, 8.5
// Feature: launchchrome-design-system, Property 4: Reduced motion suppression
// Validates: Requirements 7.4, 8.5

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Property 4: Reduced motion suppression
 *
 * For any animated element in the application, when `prefers-reduced-motion: reduce`
 * is active, the effective animation-duration and transition-duration must resolve to
 * 0ms. No transform-based, scale-based, or translate-based animation shall execute
 * under reduced-motion mode.
 *
 * This is a contract/structural test since we cannot evaluate CSS in a node environment.
 * We verify that:
 * 1. All animation classes are either prefixed with `motion-safe:` OR are covered by
 *    the global `@media (prefers-reduced-motion)` override
 * 2. The global override uses `!important` to ensure it takes precedence
 * 3. The CSS contains the correct reduced-motion media query structure
 */

// --- Motion utility classes used in the design system ---

/** Classes that use Tailwind's built-in motion-safe: prefix (inherently suppressed) */
const MOTION_SAFE_CLASSES = [
  'motion-safe:transition-state',
  'motion-safe:transition-panel',
  'motion-safe:duration-fast',
  'motion-safe:hover:-translate-y-0.5',
  'motion-safe:animate-charge',
  'motion-safe:hover-lift',
  'motion-safe:active-press',
  'motion-safe:animate-fade-in',
] as const;

/** Classes that do NOT use motion-safe: prefix — require global CSS override */
const NON_PREFIXED_MOTION_CLASSES = [
  'animate-chrome-sweep',
  'animate-pulse-pink',
  'skeleton-shimmer',
] as const;

/** All motion-related classes in the design system */
const ALL_MOTION_CLASSES = [...MOTION_SAFE_CLASSES, ...NON_PREFIXED_MOTION_CLASSES] as const;

type MotionSafeClass = (typeof MOTION_SAFE_CLASSES)[number];
type NonPrefixedMotionClass = (typeof NON_PREFIXED_MOTION_CLASSES)[number];
type MotionClass = (typeof ALL_MOTION_CLASSES)[number];

/**
 * Read index.css content for structural verification.
 */
function readIndexCss(): string {
  const cssPath = path.resolve(__dirname, '../index.css');
  return fs.readFileSync(cssPath, 'utf-8');
}

/**
 * Determines whether a motion class is inherently suppressed under reduced-motion.
 * A class is suppressed if:
 * - It uses the `motion-safe:` prefix (Tailwind's built-in behavior: the styles
 *   only apply when prefers-reduced-motion is NOT reduce)
 * - OR it is covered by the global CSS `@media (prefers-reduced-motion: reduce)` override
 *   which sets animation-duration: 0ms !important and transition-duration: 0ms !important
 */
function isMotionSuppressedUnderReducedMotion(
  className: MotionClass,
  cssContent: string,
): { suppressed: boolean; mechanism: 'motion-safe-prefix' | 'global-css-override' } {
  // Classes with motion-safe: prefix are inherently suppressed
  if (className.startsWith('motion-safe:')) {
    return { suppressed: true, mechanism: 'motion-safe-prefix' };
  }

  // Non-prefixed classes must be covered by the global override
  // The global override targets *, *::before, *::after with !important
  const hasGlobalOverride =
    cssContent.includes('@media (prefers-reduced-motion: reduce)') &&
    cssContent.includes('animation-duration: 0ms !important') &&
    cssContent.includes('transition-duration: 0ms !important');

  return {
    suppressed: hasGlobalOverride,
    mechanism: 'global-css-override',
  };
}

/**
 * Checks if the global reduced-motion override in the CSS uses correct properties.
 */
function validateGlobalReducedMotionOverride(cssContent: string): {
  hasMediaQuery: boolean;
  hasAnimationDuration0ms: boolean;
  hasTransitionDuration0ms: boolean;
  hasAnimationIterationCount1: boolean;
  hasScrollBehaviorAuto: boolean;
  usesImportant: boolean;
  targetsUniversalSelector: boolean;
} {
  // Find the global (non-nested) reduced-motion block
  const globalBlock = extractGlobalReducedMotionBlock(cssContent);

  return {
    hasMediaQuery: cssContent.includes('@media (prefers-reduced-motion: reduce)'),
    hasAnimationDuration0ms: globalBlock.includes('animation-duration: 0ms !important'),
    hasTransitionDuration0ms: globalBlock.includes('transition-duration: 0ms !important'),
    hasAnimationIterationCount1: globalBlock.includes('animation-iteration-count: 1 !important'),
    hasScrollBehaviorAuto: globalBlock.includes('scroll-behavior: auto !important'),
    usesImportant:
      globalBlock.includes('!important') &&
      globalBlock.includes('animation-duration: 0ms !important') &&
      globalBlock.includes('transition-duration: 0ms !important'),
    targetsUniversalSelector:
      globalBlock.includes('*,') || globalBlock.includes('*\n') || globalBlock.includes('* '),
  };
}

/**
 * Extracts the global (top-level, non-component-scoped) reduced-motion media query block.
 * This is the block that applies to *, *::before, *::after outside any @layer.
 */
function extractGlobalReducedMotionBlock(cssContent: string): string {
  // Match the global reduced-motion block (the one outside @layer)
  // It starts with the comment "Reduced motion — system-level override"
  const marker = '/* Reduced motion';
  const markerIndex = cssContent.indexOf(marker);
  if (markerIndex === -1) {
    // Fallback: find the last @media (prefers-reduced-motion: reduce) block
    const regex = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([^}]*\{[^}]*\}[^}]*)\}/g;
    let lastMatch = '';
    let match;
    while ((match = regex.exec(cssContent)) !== null) {
      lastMatch = match[0];
    }
    return lastMatch;
  }

  // Extract from marker to end of block
  const blockStart = cssContent.indexOf('@media', markerIndex);
  if (blockStart === -1) return '';

  let depth = 0;
  let blockEnd = blockStart;
  for (let i = blockStart; i < cssContent.length; i++) {
    if (cssContent[i] === '{') depth++;
    if (cssContent[i] === '}') {
      depth--;
      if (depth === 0) {
        blockEnd = i + 1;
        break;
      }
    }
  }

  return cssContent.slice(blockStart, blockEnd);
}

// --- Arbitraries ---

const motionSafeClassArb = fc.constantFrom(...MOTION_SAFE_CLASSES);
const nonPrefixedMotionClassArb = fc.constantFrom(...NON_PREFIXED_MOTION_CLASSES);
const allMotionClassArb = fc.constantFrom(...ALL_MOTION_CLASSES);

/** Generate random subsets (1 to all) of motion classes */
const motionClassSubsetArb = fc
  .subarray([...ALL_MOTION_CLASSES], { minLength: 1, maxLength: ALL_MOTION_CLASSES.length })
  .filter((arr) => arr.length > 0);

describe('Feature: launchchrome-design-system, Property 4: Reduced motion suppression', () => {
  const cssContent = readIndexCss();

  /**
   * **Validates: Requirements 7.4, 8.5**
   *
   * Property: For any random combination of motion utility classes from the design system,
   * under reduced-motion mode, the effective animation-duration would be 0ms.
   * This is ensured because all classes are either:
   * - Prefixed with `motion-safe:` (Tailwind makes them no-ops under reduced-motion)
   * - Covered by the global CSS override that sets animation-duration: 0ms !important
   */
  it('all motion class combinations produce 0ms animation-duration under reduced-motion', () => {
    fc.assert(
      fc.property(motionClassSubsetArb, (classes) => {
        for (const cls of classes) {
          const result = isMotionSuppressedUnderReducedMotion(cls, cssContent);
          expect(result.suppressed).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 7.4, 8.5**
   *
   * Property: For any random combination of motion utility classes from the design system,
   * under reduced-motion mode, the effective transition-duration would be 0ms.
   * This is ensured by the same mechanisms as animation-duration.
   */
  it('all motion class combinations produce 0ms transition-duration under reduced-motion', () => {
    fc.assert(
      fc.property(motionClassSubsetArb, (classes) => {
        for (const cls of classes) {
          const result = isMotionSuppressedUnderReducedMotion(cls, cssContent);
          expect(result.suppressed).toBe(true);

          // For motion-safe: prefixed classes, they simply won't apply at all
          // For non-prefixed classes, the global override ensures 0ms transition-duration
          if (!cls.startsWith('motion-safe:')) {
            expect(result.mechanism).toBe('global-css-override');
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 7.4, 8.5**
   *
   * Property: Every motion-safe: prefixed class is inherently suppressed under reduced-motion
   * due to Tailwind's built-in behavior (motion-safe: variant only applies when
   * prefers-reduced-motion is NOT reduce).
   */
  it('motion-safe: prefixed classes are inherently suppressed under reduced-motion', () => {
    fc.assert(
      fc.property(motionSafeClassArb, (cls) => {
        const result = isMotionSuppressedUnderReducedMotion(cls, cssContent);
        expect(result.suppressed).toBe(true);
        expect(result.mechanism).toBe('motion-safe-prefix');
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 7.4, 8.5**
   *
   * Property: Every non-prefixed animation class (those without motion-safe:) is caught
   * by the global CSS @media (prefers-reduced-motion: reduce) override which sets
   * animation-duration and transition-duration to 0ms !important.
   */
  it('non-prefixed animation classes are caught by global CSS override', () => {
    fc.assert(
      fc.property(nonPrefixedMotionClassArb, (cls) => {
        const result = isMotionSuppressedUnderReducedMotion(cls, cssContent);
        expect(result.suppressed).toBe(true);
        expect(result.mechanism).toBe('global-css-override');
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 7.4, 8.5**
   *
   * Structural verification: The CSS contains the correct reduced-motion media query
   * with all required properties and !important declarations.
   */
  it('CSS contains correct global reduced-motion media query structure', () => {
    const validation = validateGlobalReducedMotionOverride(cssContent);

    expect(validation.hasMediaQuery).toBe(true);
    expect(validation.hasAnimationDuration0ms).toBe(true);
    expect(validation.hasTransitionDuration0ms).toBe(true);
    expect(validation.hasAnimationIterationCount1).toBe(true);
    expect(validation.hasScrollBehaviorAuto).toBe(true);
    expect(validation.usesImportant).toBe(true);
  });

  /**
   * **Validates: Requirements 7.4, 8.5**
   *
   * Structural verification: The global override targets the universal selector
   * (*, *::before, *::after) to ensure no element can escape the suppression.
   */
  it('global override targets universal selector for complete coverage', () => {
    const validation = validateGlobalReducedMotionOverride(cssContent);
    expect(validation.targetsUniversalSelector).toBe(true);
  });

  /**
   * **Validates: Requirements 7.4, 8.5**
   *
   * Property: For any random subset of motion classes, every class in that subset
   * is covered by exactly one suppression mechanism — no gaps in coverage.
   */
  it('every motion class has exactly one suppression mechanism with no coverage gaps', () => {
    fc.assert(
      fc.property(allMotionClassArb, (cls) => {
        const result = isMotionSuppressedUnderReducedMotion(cls, cssContent);

        // Must be suppressed
        expect(result.suppressed).toBe(true);

        // Mechanism must be one of the two valid options
        expect(['motion-safe-prefix', 'global-css-override']).toContain(result.mechanism);

        // motion-safe: prefix → mechanism must be 'motion-safe-prefix'
        if (cls.startsWith('motion-safe:')) {
          expect(result.mechanism).toBe('motion-safe-prefix');
        } else {
          expect(result.mechanism).toBe('global-css-override');
        }
      }),
      { numRuns: 100 },
    );
  });
});
