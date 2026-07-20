// Requirements: 2.5, 7.7, 14.1–14.5
// Integration tests for visual migration correctness:
// 1. Dark background surfaces (no white/light backgrounds in any page)
// 2. Semantic HTML elements (nav, main, header)
// 3. Route resolution (all routes defined and code-split)

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: Dark background surfaces — no white/light backgrounds in page sources
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Forbidden light-background Tailwind classes. If any page source contains
 * these classes, the migration is incomplete.
 */
const FORBIDDEN_LIGHT_BG_CLASSES = [
  'bg-white',
  'bg-gray-50',
  'bg-gray-100',
  'bg-gray-200',
  'bg-slate-50',
  'bg-slate-100',
  'bg-slate-200',
  'bg-zinc-50',
  'bg-zinc-100',
  'bg-neutral-50',
  'bg-neutral-100',
  'bg-stone-50',
  'bg-stone-100',
];

/**
 * Valid LaunchChrome™ dark surface classes used as backgrounds.
 * Also includes token references via CSS custom properties (--fl-*).
 */
const VALID_DARK_BG_CLASSES = [
  'bg-obsidian',
  'bg-carbon',
  'bg-gunmetal',
  'bg-graphite',
];

/**
 * Extended check: pages rendered inside Layout may use design tokens
 * via component composition (Card, DiamondEdgePanel) rather than direct
 * background classes. These token references count as valid dark surfaces.
 */
const VALID_DARK_SURFACE_INDICATORS = [
  ...VALID_DARK_BG_CLASSES,
  '--fl-carbon',
  '--fl-obsidian',
  '--fl-gunmetal',
  '--fl-graphite',
  'Card',         // Card component uses Gunmetal surface internally
  'DiamondEdgePanel', // Uses Carbon Black body
];

/**
 * Page source files to validate for dark surface compliance.
 */
const PAGE_FILES = [
  'Dashboard.tsx',
  'Login.tsx',
  'Checklist.tsx',
  'Content.tsx',
  'Marketing.tsx',
  'Settings.tsx',
  'DraftDetail.tsx',
];

const PAGES_DIR = path.resolve(__dirname, '../pages');
const COMPONENTS_DIR = path.resolve(__dirname, '../components');

describe('Visual Migration - Dark Background Surfaces', () => {
  PAGE_FILES.forEach((pageFile) => {
    it(`${pageFile} contains no forbidden light background classes`, () => {
      const filePath = path.join(PAGES_DIR, pageFile);
      const source = fs.readFileSync(filePath, 'utf-8');

      for (const forbidden of FORBIDDEN_LIGHT_BG_CLASSES) {
        // Match class usage in className strings (not in comments or variable names)
        const regex = new RegExp(`['"\`\\s]${forbidden.replace('-', '\\-')}['"\`\\s]`, 'g');
        expect(
          regex.test(source),
          `Page "${pageFile}" should not contain "${forbidden}" — found light background class`,
        ).toBe(false);
      }
    });
  });

  PAGE_FILES.forEach((pageFile) => {
    it(`${pageFile} uses LaunchChrome™ dark surface tokens or components`, () => {
      const filePath = path.join(PAGES_DIR, pageFile);
      const source = fs.readFileSync(filePath, 'utf-8');

      // Each page should reference at least one valid dark surface indicator —
      // either a direct bg class or a design-system component that provides dark surfaces
      const usesAnySurface = VALID_DARK_SURFACE_INDICATORS.some((indicator) =>
        source.includes(indicator),
      );
      expect(
        usesAnySurface,
        `Page "${pageFile}" should use at least one dark surface class or component (${VALID_DARK_SURFACE_INDICATORS.join(', ')})`,
      ).toBe(true);
    });
  });

  it('Layout.tsx uses dark surface for workspace background (var(--fl-carbon))', () => {
    const layoutSource = fs.readFileSync(path.join(COMPONENTS_DIR, 'Layout.tsx'), 'utf-8');
    expect(layoutSource).toContain('--fl-carbon');
  });

  it('Layout.tsx contains no forbidden light background classes', () => {
    const layoutSource = fs.readFileSync(path.join(COMPONENTS_DIR, 'Layout.tsx'), 'utf-8');

    for (const forbidden of FORBIDDEN_LIGHT_BG_CLASSES) {
      expect(layoutSource).not.toContain(forbidden);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: Semantic HTML elements
// ─────────────────────────────────────────────────────────────────────────────

describe('Visual Migration - Semantic HTML Elements', () => {
  it('NavigationRail renders a <nav> element with aria-label', () => {
    const navSource = fs.readFileSync(path.join(COMPONENTS_DIR, 'NavigationRail.tsx'), 'utf-8');

    // Verify the component renders a <nav> element
    expect(navSource).toContain('<nav');
    // Verify it has an aria-label for accessibility
    expect(navSource).toMatch(/aria-label=["'][^"']+["']/);
  });

  it('NavigationRail aria-label is "Main navigation"', () => {
    const navSource = fs.readFileSync(path.join(COMPONENTS_DIR, 'NavigationRail.tsx'), 'utf-8');
    expect(navSource).toContain('aria-label="Main navigation"');
  });

  it('Layout renders a <main> element for workspace area', () => {
    const layoutSource = fs.readFileSync(path.join(COMPONENTS_DIR, 'Layout.tsx'), 'utf-8');
    expect(layoutSource).toContain('<main');
  });

  it('UtilityBar renders a <header> element', () => {
    const utilitySource = fs.readFileSync(path.join(COMPONENTS_DIR, 'UtilityBar.tsx'), 'utf-8');
    expect(utilitySource).toContain('<header');
  });

  it('Layout uses NavigationRail component for navigation', () => {
    const layoutSource = fs.readFileSync(path.join(COMPONENTS_DIR, 'Layout.tsx'), 'utf-8');
    expect(layoutSource).toContain('NavigationRail');
    expect(layoutSource).toContain('<NavigationRail');
  });

  it('Layout uses UtilityBar component for top bar', () => {
    const layoutSource = fs.readFileSync(path.join(COMPONENTS_DIR, 'Layout.tsx'), 'utf-8');
    expect(layoutSource).toContain('UtilityBar');
    expect(layoutSource).toContain('<UtilityBar');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 3: Route resolution — all expected routes defined with code-splitting
// ─────────────────────────────────────────────────────────────────────────────

describe('Visual Migration - Route Resolution', () => {
  const appSource = fs.readFileSync(
    path.resolve(__dirname, '../App.tsx'),
    'utf-8',
  );

  const EXPECTED_ROUTES = [
    { path: '/', page: 'Dashboard' },
    { path: '/login', page: 'Login' },
    { path: '/checklist', page: 'Checklist' },
    { path: '/content', page: 'Content' },
    { path: '/content/:id', page: 'DraftDetail' },
    { path: '/marketing', page: 'Marketing' },
    { path: '/settings', page: 'Settings' },
    { path: '/auth/callback', page: 'AuthCallback' },
  ];

  EXPECTED_ROUTES.forEach(({ path: routePath, page }) => {
    it(`route "${routePath}" is defined and renders ${page}`, () => {
      // Verify route path exists
      expect(appSource).toContain(`path="${routePath}"`);
      // Verify the page component is referenced
      expect(appSource).toContain(page);
    });
  });

  it('routes use code-splitting via lazy() imports', () => {
    expect(appSource).toContain('lazy(');
    // Each page should be lazily loaded
    const lazyImports = appSource.match(/lazy\(\(\) =>/g);
    expect(lazyImports).not.toBeNull();
    // At least 7 pages are code-split (all except AuthCallback possibly)
    expect(lazyImports!.length).toBeGreaterThanOrEqual(7);
  });

  it('routes are wrapped in Suspense for loading states', () => {
    expect(appSource).toContain('Suspense');
    expect(appSource).toContain('fallback');
  });

  it('authenticated routes are wrapped in ProtectedRoute', () => {
    expect(appSource).toContain('ProtectedRoute');
    expect(appSource).toContain('<ProtectedRoute');
  });

  it('authenticated routes render within Layout', () => {
    expect(appSource).toContain('Layout');
    expect(appSource).toContain('<Layout');
  });

  it('all page source files exist', () => {
    PAGE_FILES.forEach((pageFile) => {
      const filePath = path.join(PAGES_DIR, pageFile);
      expect(
        fs.existsSync(filePath),
        `Expected page file to exist: ${pageFile}`,
      ).toBe(true);
    });
  });
});
