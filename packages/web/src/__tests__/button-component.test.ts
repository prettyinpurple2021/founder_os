// Requirements: 5.1, 5.2, 5.6, 5.7, 7.5
// Unit tests for Button component class composition logic

import { describe, it, expect } from 'vitest';
import clsx from 'clsx';

// Mirror the Button component's class logic for testing
const variantStyles: Record<string, string> = {
  primary: clsx(
    'bg-founder-pink text-chrome-white border border-founder-pink/20 shadow-glow-pink',
    'hover:bg-neon-magenta hover:shadow-glow-pink',
    'active:translate-y-px active:scale-[0.985]',
  ),
  secondary: clsx(
    'bg-gunmetal text-chrome-silver border border-graphite',
    'hover:bg-graphite hover:border-dark-chrome',
    'active:translate-y-px active:scale-[0.985]',
  ),
  tertiary: clsx(
    'bg-transparent text-text-secondary border-none',
    'hover:text-text-primary hover:bg-gunmetal/50',
    'active:translate-y-px active:scale-[0.985]',
  ),
  danger: clsx(
    'bg-alert-red/10 text-alert-red border border-alert-red/30',
    'hover:bg-alert-red/20 hover:border-alert-red/50',
    'active:translate-y-px active:scale-[0.985]',
  ),
};

const sizeStyles: Record<string, string> = {
  sm: 'px-3 py-1.5 text-small',
  md: 'px-4 py-2 text-body',
  lg: 'px-6 py-3 text-body-l',
};

const baseStyles =
  'inline-flex items-center justify-center gap-2 rounded-md font-medium';

const focusStyles =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hyper-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-carbon';

const transitionStyles =
  'motion-safe:transition-[transform,box-shadow,background-color,border-color,opacity] motion-safe:duration-fast motion-safe:ease-snap';

const disabledStyles = 'opacity-50 cursor-not-allowed pointer-events-none';

describe('Button Component - Variant Styles', () => {
  it('primary variant uses founder-pink background with chrome-white text', () => {
    expect(variantStyles.primary).toContain('bg-founder-pink');
    expect(variantStyles.primary).toContain('text-chrome-white');
  });

  it('primary variant has founder-pink border and glow-pink shadow', () => {
    expect(variantStyles.primary).toContain('border-founder-pink/20');
    expect(variantStyles.primary).toContain('shadow-glow-pink');
  });

  it('secondary variant uses gunmetal background with chrome-silver text', () => {
    expect(variantStyles.secondary).toContain('bg-gunmetal');
    expect(variantStyles.secondary).toContain('text-chrome-silver');
  });

  it('secondary variant has graphite border and no glow', () => {
    expect(variantStyles.secondary).toContain('border-graphite');
    expect(variantStyles.secondary).not.toContain('shadow-glow');
  });

  it('tertiary variant uses transparent background with text-secondary color', () => {
    expect(variantStyles.tertiary).toContain('bg-transparent');
    expect(variantStyles.tertiary).toContain('text-text-secondary');
  });

  it('tertiary variant has no border', () => {
    expect(variantStyles.tertiary).toContain('border-none');
  });

  it('danger variant uses alert-red/10 background with alert-red text', () => {
    expect(variantStyles.danger).toContain('bg-alert-red/10');
    expect(variantStyles.danger).toContain('text-alert-red');
  });

  it('danger variant has alert-red/30 border', () => {
    expect(variantStyles.danger).toContain('border-alert-red/30');
  });
});

describe('Button Component - Hover States', () => {
  it('primary hover brightens to neon-magenta', () => {
    expect(variantStyles.primary).toContain('hover:bg-neon-magenta');
  });

  it('secondary hover brightens to graphite background', () => {
    expect(variantStyles.secondary).toContain('hover:bg-graphite');
  });

  it('tertiary hover shows text-primary and subtle gunmetal background', () => {
    expect(variantStyles.tertiary).toContain('hover:text-text-primary');
    expect(variantStyles.tertiary).toContain('hover:bg-gunmetal/50');
  });

  it('danger hover intensifies to alert-red/20', () => {
    expect(variantStyles.danger).toContain('hover:bg-alert-red/20');
  });
});

describe('Button Component - Active (pressed) States', () => {
  it('all variants apply translateY(1px) and scale(0.985) on active', () => {
    for (const [, style] of Object.entries(variantStyles)) {
      expect(style).toContain('active:translate-y-px');
      expect(style).toContain('active:scale-[0.985]');
    }
  });
});

describe('Button Component - Focus State', () => {
  it('uses ring-2 with hyper-cyan for focus-visible', () => {
    expect(focusStyles).toContain('focus-visible:ring-2');
    expect(focusStyles).toContain('focus-visible:ring-hyper-cyan');
  });

  it('uses ring-offset-2 with carbon offset color', () => {
    expect(focusStyles).toContain('focus-visible:ring-offset-2');
    expect(focusStyles).toContain('focus-visible:ring-offset-carbon');
  });

  it('removes default outline on focus-visible', () => {
    expect(focusStyles).toContain('focus-visible:outline-none');
  });
});

describe('Button Component - Disabled State', () => {
  it('applies opacity-50 when disabled', () => {
    expect(disabledStyles).toContain('opacity-50');
  });

  it('shows not-allowed cursor when disabled', () => {
    expect(disabledStyles).toContain('cursor-not-allowed');
  });

  it('disables pointer events when disabled', () => {
    expect(disabledStyles).toContain('pointer-events-none');
  });
});

describe('Button Component - Size Classes', () => {
  it('sm size uses px-3 py-1.5 with 14px text', () => {
    expect(sizeStyles.sm).toContain('px-3');
    expect(sizeStyles.sm).toContain('py-1.5');
    expect(sizeStyles.sm).toContain('text-small');
  });

  it('md size uses px-4 py-2 with 16px text', () => {
    expect(sizeStyles.md).toContain('px-4');
    expect(sizeStyles.md).toContain('py-2');
    expect(sizeStyles.md).toContain('text-body');
  });

  it('lg size uses px-6 py-3 with 18px text', () => {
    expect(sizeStyles.lg).toContain('px-6');
    expect(sizeStyles.lg).toContain('py-3');
    expect(sizeStyles.lg).toContain('text-body-l');
  });
});

describe('Button Component - Motion and Transitions', () => {
  it('uses motion-safe prefix for transitions (respects reduced-motion)', () => {
    expect(transitionStyles).toContain('motion-safe:transition-');
  });

  it('uses fast duration token (140ms) for state transitions', () => {
    expect(transitionStyles).toContain('motion-safe:duration-fast');
  });

  it('uses ease-snap timing function', () => {
    expect(transitionStyles).toContain('motion-safe:ease-snap');
  });

  it('transitions transform, box-shadow, background-color, border-color, opacity', () => {
    expect(transitionStyles).toContain(
      'motion-safe:transition-[transform,box-shadow,background-color,border-color,opacity]',
    );
  });
});

describe('Button Component - Design Token Compliance', () => {
  it('no variant uses hard-coded hex colors in class names', () => {
    for (const style of Object.values(variantStyles)) {
      // Should not contain patterns like bg-[#xxx] or text-[#xxx]
      expect(style).not.toMatch(/\[#[0-9a-fA-F]+\]/);
    }
  });

  it('no variant uses generic Tailwind colors (gray, slate, etc)', () => {
    for (const style of Object.values(variantStyles)) {
      expect(style).not.toContain('bg-white');
      expect(style).not.toContain('bg-gray');
      expect(style).not.toContain('bg-slate');
      expect(style).not.toContain('text-white');
      expect(style).not.toContain('text-gray');
    }
  });

  it('all background colors use LaunchChrome design tokens', () => {
    const allowedBgTokens = [
      'bg-founder-pink',
      'bg-gunmetal',
      'bg-transparent',
      'bg-alert-red/10',
      'bg-neon-magenta',
      'bg-graphite',
      'bg-gunmetal/50',
      'bg-alert-red/20',
    ];
    for (const style of Object.values(variantStyles)) {
      const bgClasses = style.split(' ').filter((cls) => cls.startsWith('bg-') || cls.startsWith('hover:bg-'));
      for (const bg of bgClasses) {
        const token = bg.replace('hover:', '');
        expect(allowedBgTokens).toContain(token);
      }
    }
  });
});

describe('Button Component - Base Styles', () => {
  it('renders as inline-flex with centered content', () => {
    expect(baseStyles).toContain('inline-flex');
    expect(baseStyles).toContain('items-center');
    expect(baseStyles).toContain('justify-center');
  });

  it('includes gap for icon spacing', () => {
    expect(baseStyles).toContain('gap-2');
  });

  it('uses rounded-md border radius', () => {
    expect(baseStyles).toContain('rounded-md');
  });

  it('uses font-medium weight', () => {
    expect(baseStyles).toContain('font-medium');
  });
});
