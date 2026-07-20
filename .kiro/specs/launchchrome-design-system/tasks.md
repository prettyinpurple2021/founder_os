# Implementation Plan: LaunchChrome Design System Migration

## Overview

Migrate the FounderLaunch_OS frontend (`packages/web`) from generic light-mode Tailwind styling to the LaunchChrome™ design language. The migration is token-first: Tailwind config and CSS foundation are built first, then component primitives, then layout, then pages. All existing functionality is preserved — only visual presentation changes.

## Tasks

- [x] 1. Design Token Infrastructure and CSS Foundation
  - [x] 1.1 Create Tailwind configuration with LaunchChrome™ design tokens
    - Replace `packages/web/tailwind.config.ts` with the full token set: foundation colors, chrome colors, energy colors, supporting colors, text colors, typography scale, font families, spacing scale, breakpoints, transition durations, timing functions, box shadows, keyframes, and animations
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10_

  - [x] 1.2 Create CSS architecture with layers, font-face declarations, and CSS custom properties
    - Rewrite `packages/web/src/index.css` with `@layer base, tokens, components, utilities` ordering
    - Add `@font-face` declarations for Inter and Space Grotesk variable fonts
    - Define all CSS custom properties (`--fl-*`) in `:root` under `@layer tokens`
    - Add reduced-motion media query that disables all animations/transitions
    - Set `body` background to `var(--fl-obsidian)` and default text to `var(--fl-text-primary)`
    - _Requirements: 1.1–1.9, 2.1, 7.4, 8.5_

  - [x] 1.3 Add self-hosted variable font files and preload hints
    - Add `Inter-Variable.woff2` and `SpaceGrotesk-Variable.woff2` to `packages/web/public/fonts/`
    - Add `<link rel="preload">` tags in `packages/web/index.html` for both font files
    - _Requirements: 3.1, 3.2, 13.1, 13.2, 13.3, 13.4_

  - [x] 1.4 Write property tests for design token resolution completeness
    - **Property 1: Design token resolution completeness**
    - Generate token names from the full spec set, resolve via Tailwind config, assert exact match against Master Bible values
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 1.9**

  - [x] 1.5 Write property test for dark-only surface invariant
    - **Property 2: Dark-only surface invariant**
    - Generate random component background token references, compute relative luminance, assert < 0.05
    - **Validates: Requirements 2.5, 2.6**

  - [x] 1.6 Write property test for WCAG contrast compliance
    - **Property 3: WCAG contrast compliance**
    - Generate all valid (foreground-token, background-token) pairs, compute WCAG 2.2 contrast ratio, assert ≥ 4.5:1 for normal text and ≥ 3:1 for large text/borders
    - **Validates: Requirements 3.7, 7.1, 7.2, 7.3**

- [x] 2. Checkpoint — Token foundation verification
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Component Primitives
  - [x] 3.1 Create Button component with all variants and states
    - Create `packages/web/src/components/ui/Button.tsx`
    - Implement `primary`, `secondary`, `tertiary`, `danger` variants with `sm`, `md`, `lg` sizes
    - Define all states: default, hover, active, focus (ring-2 ring-hyper-cyan), disabled, loading
    - Use design tokens exclusively — no hard-coded color values
    - _Requirements: 5.1, 5.2, 5.6, 5.7, 7.5_

  - [x] 3.2 Create Card component with variants and accent system
    - Create `packages/web/src/components/ui/Card.tsx`
    - Implement `default` (bg-gunmetal border-graphite), `featured` (+ shadow-panel + accent border), `elevated` (bg-graphite border-dark-chrome) variants
    - Accept `accent` prop for colored left-border treatment
    - Add hover micro-interaction (lift, border brighten, chrome-edge shadow)
    - _Requirements: 5.3, 2.3, 2.4_

  - [x] 3.3 Create Input component with LaunchChrome™ styling
    - Create `packages/web/src/components/ui/Input.tsx`
    - Style: bg-carbon, border-graphite, text-primary, placeholder:text-muted
    - Focus: border-hyper-cyan + ring-1 ring-hyper-cyan
    - Error state: border-alert-red with error message display
    - Include label and hint text support
    - _Requirements: 5.4, 5.6, 5.7, 7.5_

  - [x] 3.4 Create Badge component with semantic color mapping
    - Create `packages/web/src/components/ui/Badge.tsx`
    - Map color props to Energy colors: lime→Launch Lime, pink→Founder Pink, cyan→Hyper Cyan, red→Alert Red, amber→Warning Amber, gold→Victory Gold, chrome→Chrome Silver
    - Ensure every badge includes text label (non-color indicator) alongside color
    - _Requirements: 5.5, 6.1–6.6, 7.8_

  - [x] 3.5 Create DiamondEdgePanel component
    - Create `packages/web/src/components/ui/DiamondEdgePanel.tsx`
    - Implement clip-path for angular corners, carbon body, chrome border frame
    - Add left-edge Launch Lime glow and right-edge Founder Pink glow gradients
    - Add chrome-sweep hover effect with reduced-motion suppression
    - _Requirements: 5.3, 8.1_

  - [x] 3.6 Create ProgressRail component
    - Create `packages/web/src/components/ui/ProgressRail.tsx`
    - Track: bg-graphite rounded-full; Fill: bg-launch-lime with leading-edge glow
    - Animate on mount with `charge` keyframe (respect reduced-motion)
    - Accept `value` (0-100), optional `label` and `showPercentage` props
    - _Requirements: 10.3_

  - [x] 3.7 Create Skeleton loading component
    - Create `packages/web/src/components/ui/Skeleton.tsx`
    - Variants: `text`, `card`, `metric`, `progress`
    - Chrome sweep shimmer animation on gunmetal base
    - Reduced-motion: static graphite fill, no animation
    - _Requirements: 12.6_

  - [x] 3.8 Write property test for badge semantic color mapping
    - **Property 6: Badge semantic color mapping**
    - Generate random valid badge color props, assert rendered classes map to correct Energy color
    - **Validates: Requirements 5.5**

  - [x] 3.9 Write property test for non-color status communication
    - **Property 7: Non-color status communication**
    - Generate random Badge renders, assert text label or supplementary icon accompanies color
    - **Validates: Requirements 7.8**

  - [x] 3.10 Write property test for card surface correctness
    - **Property 5: Card and panel surface correctness**
    - Generate random Card variant + props, assert background resolves to gunmetal/graphite tokens
    - **Validates: Requirements 2.3, 5.3**

- [x] 4. Checkpoint — Component primitives verification
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Layout Architecture
  - [x] 5.1 Create NavigationRail component
    - Create `packages/web/src/components/NavigationRail.tsx`
    - Carbon Black background, 80px wide on desktop
    - Active state: Founder Pink left-edge indicator (3px), gunmetal background, chrome-white text, subtle pink glow
    - Hover state: gunmetal background
    - Use semantic `<nav>` element with aria-label
    - Accept `items: NavItem[]` prop with route links and icons
    - _Requirements: 4.1, 4.2, 4.6, 4.7, 7.7_

  - [x] 5.2 Create UtilityBar component
    - Create `packages/web/src/components/UtilityBar.tsx`
    - Carbon Black background with graphite bottom border, 56px height
    - Display sync status indicator and user controls
    - Use semantic `<header>` element
    - _Requirements: 4.3, 7.7_

  - [x] 5.3 Create MobileNav component (bottom tab bar)
    - Create `packages/web/src/components/MobileNav.tsx`
    - Bottom-positioned navigation for viewports below 1024px
    - 64px height, carbon background, Founder Pink active indicators
    - Minimum 44x44px touch targets for all nav items
    - _Requirements: 4.5, 7.6, 9.1_

  - [x] 5.4 Refactor Layout component with CSS Grid shell
    - Rewrite `packages/web/src/components/Layout.tsx`
    - Desktop: 2-column grid (80px nav + 1fr workspace) with utility bar row
    - Mobile: single-column with utility bar top + workspace + bottom nav
    - Use named grid areas: nav, utility, workspace
    - Add workspace ambient background texture (dual-neon radial bloom)
    - Wrap `<Outlet>` with page transition crossfade animation
    - Use `<main>` for workspace area, max-width 1440px centered
    - _Requirements: 4.1–4.5, 4.8, 8.2, 8.3, 9.1–9.6_

  - [x] 5.5 Write property test for reduced motion suppression
    - **Property 4: Reduced motion suppression**
    - Generate random motion utility class combinations, assert 0ms duration under reduced-motion
    - **Validates: Requirements 7.4, 8.5**

  - [x] 5.6 Write property test for focus indicator visibility
    - **Property 8: Focus indicator visibility**
    - Generate random interactive components (Button, Input, NavLink), simulate focus, assert ring presence ≥ 2px width
    - **Validates: Requirements 5.7, 7.5**

  - [x] 5.7 Write property test for touch target minimum size
    - **Property 9: Touch target minimum size**
    - Generate random interactive elements at mobile viewport, assert computed area ≥ 44×44px
    - **Validates: Requirements 7.6**

- [x] 6. Checkpoint — Layout and accessibility verification
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Page Migration — Login
  - [x] 7.1 Migrate Login page to LaunchChrome™ styling
    - Rewrite `packages/web/src/pages/Login.tsx` styling (preserve all logic and auth flow)
    - Obsidian Black full-bleed background
    - Application name in Space Grotesk display font, chrome-white
    - GitHub login button using `Button variant="primary"` with min 44x44px target
    - Centered layout (vertical + horizontal)
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 14.3_

- [x] 8. Page Migration — Dashboard
  - [x] 8.1 Migrate Dashboard page to LaunchChrome™ styling
    - Rewrite `packages/web/src/pages/Dashboard.tsx` styling (preserve all data fetching, state, and logic)
    - Carbon Black page background, Chrome White headings in Space Grotesk
    - Next-action card → `DiamondEdgePanel` with Founder Pink accent
    - Progress bar → `ProgressRail` component with Launch Lime fill
    - Blocker list → `Card accent="red"` on Gunmetal surface
    - Recent progress → Launch Lime checkmark indicators on Gunmetal
    - Sync indicator → Launch Lime (success) / Alert Red (failed)
    - Empty state → dark surface with Founder Pink CTA button
    - Loading state → `Skeleton` components instead of plain spinner
    - _Requirements: 10.1–10.7, 14.2, 14.4, 14.5_

  - [x] 8.2 Create useCountUp hook for metric animations
    - Create `packages/web/src/hooks/useCountUp.ts`
    - Animate numbers from 0 to target with requestAnimationFrame and ease-out deceleration
    - Duration: 400ms, respect prefers-reduced-motion (return end value immediately)
    - Apply to launch readiness %, blocker count, total tasks on Dashboard
    - _Requirements: 8.6_

- [x] 9. Page Migration — Secondary Pages
  - [x] 9.1 Migrate Checklist page to LaunchChrome™ styling
    - Rewrite `packages/web/src/pages/Checklist.tsx` styling (preserve all logic)
    - Carbon Black background, Chrome White headings
    - Category sections → `Card` with Gunmetal surface
    - Completed items → Launch Lime indicators
    - Blocked items → Alert Red indicators
    - Status badges → `Badge` with semantic Energy colors
    - _Requirements: 12.1, 12.2, 14.4, 14.5_

  - [x] 9.2 Migrate Content page to LaunchChrome™ styling
    - Rewrite `packages/web/src/pages/Content.tsx` styling (preserve all logic)
    - Carbon Black background, Gunmetal draft cards
    - Status badges → `Badge` with semantic Energy colors (lime=approved, amber=pending, cyan=generated)
    - _Requirements: 12.1, 12.3, 14.4, 14.5_

  - [x] 9.3 Migrate Marketing page to LaunchChrome™ styling
    - Rewrite `packages/web/src/pages/Marketing.tsx` styling (preserve all logic)
    - Carbon Black background, Gunmetal asset cards
    - Status indicators → semantic `Badge` colors
    - _Requirements: 12.1, 12.4, 14.4, 14.5_

  - [x] 9.4 Migrate Settings page to LaunchChrome™ styling
    - Rewrite `packages/web/src/pages/Settings.tsx` styling (preserve all logic)
    - Carbon Black background, form inputs → `Input` component
    - Section cards → `Card variant="elevated"`
    - Visible focus states on all form controls
    - _Requirements: 12.1, 12.5, 14.4, 14.5_

  - [x] 9.5 Migrate DraftDetail page to LaunchChrome™ styling
    - Rewrite `packages/web/src/pages/DraftDetail.tsx` styling (preserve all logic)
    - Carbon Black background, Gunmetal content areas
    - Action buttons → `Button` variants (primary for approve, danger for reject)
    - _Requirements: 12.1, 14.4, 14.5_

  - [x] 9.6 Update App.tsx Suspense fallback to use Skeleton loading
    - Replace the plain "Loading..." div with a LaunchChrome™ skeleton loading state
    - Use Founder Pink spinner/pulse on Carbon Black background
    - _Requirements: 12.6_

- [x] 10. Checkpoint — Full migration verification
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Integration and Final Wiring
  - [x] 11.1 Verify route preservation and code-splitting behavior
    - Confirm all existing routes still resolve correctly
    - Confirm lazy-loaded pages still produce separate chunks (check build output)
    - Verify no files in `packages/api/` have been modified
    - _Requirements: 14.1, 14.2, 14.6_

  - [x] 11.2 Write integration tests for visual migration correctness
    - Test that all pages render with dark backgrounds (no white surfaces)
    - Test that semantic HTML elements are used (nav, main, aside, header)
    - Test that route navigation works correctly post-migration
    - _Requirements: 2.5, 7.7, 14.1–14.5_

- [x] 12. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation after each major phase
- Property tests validate universal correctness properties from the design document
- All page migrations preserve existing component interfaces, data fetching, and state management
- No files in `packages/api/` are modified during this migration
- Font files (Inter-Variable.woff2, SpaceGrotesk-Variable.woff2) must be sourced from Google Fonts or fontsource

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["1.4", "1.5", "1.6", "3.1", "3.2", "3.3", "3.4", "3.5", "3.6", "3.7"] },
    { "id": 3, "tasks": ["3.8", "3.9", "3.10", "5.1", "5.2", "5.3"] },
    { "id": 4, "tasks": ["5.4", "5.5", "5.6", "5.7"] },
    { "id": 5, "tasks": ["7.1", "8.2"] },
    { "id": 6, "tasks": ["8.1"] },
    { "id": 7, "tasks": ["9.1", "9.2", "9.3", "9.4", "9.5", "9.6"] },
    { "id": 8, "tasks": ["11.1", "11.2"] }
  ]
}
```
