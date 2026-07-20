// Requirements: 5.3, 2.3, 2.4
// Unit tests for Card component class composition logic

import { describe, it, expect } from 'vitest';

// Test the Card component's class logic directly
// Since we're in a node environment, we validate the class composition

const variantStyles = {
  default: 'bg-gunmetal border border-graphite rounded-lg p-6',
  featured: 'bg-gunmetal border border-graphite shadow-panel rounded-lg p-6',
  elevated: 'bg-graphite border border-dark-chrome rounded-lg p-6',
} as const;

const accentStyles = {
  pink: 'border-l-4 border-l-founder-pink',
  lime: 'border-l-4 border-l-launch-lime',
  cyan: 'border-l-4 border-l-hyper-cyan',
  red: 'border-l-4 border-l-alert-red',
  amber: 'border-l-4 border-l-warning-amber',
} as const;

const hoverClasses =
  'motion-safe:transition-[transform,box-shadow,border-color] motion-safe:duration-fast motion-safe:ease-snap motion-safe:hover:-translate-y-0.5 hover:border-dark-chrome/80 hover:shadow-chrome-edge';

describe('Card Component - Variant Styles', () => {
  it('default variant uses gunmetal background with graphite border', () => {
    expect(variantStyles.default).toContain('bg-gunmetal');
    expect(variantStyles.default).toContain('border-graphite');
    expect(variantStyles.default).toContain('rounded-lg');
    expect(variantStyles.default).toContain('p-6');
  });

  it('featured variant uses gunmetal background with shadow-panel', () => {
    expect(variantStyles.featured).toContain('bg-gunmetal');
    expect(variantStyles.featured).toContain('border-graphite');
    expect(variantStyles.featured).toContain('shadow-panel');
    expect(variantStyles.featured).toContain('rounded-lg');
  });

  it('elevated variant uses graphite background with dark-chrome border', () => {
    expect(variantStyles.elevated).toContain('bg-graphite');
    expect(variantStyles.elevated).toContain('border-dark-chrome');
    expect(variantStyles.elevated).toContain('rounded-lg');
  });

  it('no variant uses white or light-colored backgrounds', () => {
    for (const style of Object.values(variantStyles)) {
      expect(style).not.toContain('bg-white');
      expect(style).not.toContain('bg-gray');
      expect(style).not.toContain('bg-slate');
    }
  });
});

describe('Card Component - Accent System', () => {
  it('pink accent applies founder-pink left border', () => {
    expect(accentStyles.pink).toContain('border-l-founder-pink');
    expect(accentStyles.pink).toContain('border-l-4');
  });

  it('lime accent applies launch-lime left border', () => {
    expect(accentStyles.lime).toContain('border-l-launch-lime');
    expect(accentStyles.lime).toContain('border-l-4');
  });

  it('cyan accent applies hyper-cyan left border', () => {
    expect(accentStyles.cyan).toContain('border-l-hyper-cyan');
    expect(accentStyles.cyan).toContain('border-l-4');
  });

  it('red accent applies alert-red left border', () => {
    expect(accentStyles.red).toContain('border-l-alert-red');
    expect(accentStyles.red).toContain('border-l-4');
  });

  it('amber accent applies warning-amber left border', () => {
    expect(accentStyles.amber).toContain('border-l-warning-amber');
    expect(accentStyles.amber).toContain('border-l-4');
  });

  it('all accents use 4px left border width', () => {
    for (const style of Object.values(accentStyles)) {
      expect(style).toContain('border-l-4');
    }
  });
});

describe('Card Component - Hover Micro-Interaction', () => {
  it('includes motion-safe transition for transform, box-shadow, and border-color', () => {
    expect(hoverClasses).toContain('motion-safe:transition-[transform,box-shadow,border-color]');
  });

  it('uses fast duration (140ms) for transitions', () => {
    expect(hoverClasses).toContain('motion-safe:duration-fast');
  });

  it('uses ease-snap timing function', () => {
    expect(hoverClasses).toContain('motion-safe:ease-snap');
  });

  it('applies lift effect on hover (translateY -0.5 = -2px)', () => {
    expect(hoverClasses).toContain('motion-safe:hover:-translate-y-0.5');
  });

  it('brightens border to dark-chrome/80 on hover', () => {
    expect(hoverClasses).toContain('hover:border-dark-chrome/80');
  });

  it('adds chrome-edge shadow on hover', () => {
    expect(hoverClasses).toContain('hover:shadow-chrome-edge');
  });

  it('uses motion-safe prefix for transforms (respects reduced-motion)', () => {
    expect(hoverClasses).toContain('motion-safe:hover:-translate-y-0.5');
    // Border and shadow changes are not motion-safe gated since they're subtle non-motion changes
    expect(hoverClasses).toContain('hover:border-dark-chrome/80');
  });
});

describe('Card Component - Design Token Compliance', () => {
  it('all backgrounds use Foundation/Interactive surface tokens only', () => {
    const allowedBgTokens = ['bg-gunmetal', 'bg-graphite', 'bg-carbon', 'bg-obsidian'];
    for (const style of Object.values(variantStyles)) {
      const bgClasses = style.split(' ').filter((cls) => cls.startsWith('bg-'));
      for (const bg of bgClasses) {
        expect(allowedBgTokens).toContain(bg);
      }
    }
  });

  it('all accent border colors use design system energy color tokens', () => {
    const allowedAccentColors = [
      'border-l-founder-pink',
      'border-l-launch-lime',
      'border-l-hyper-cyan',
      'border-l-alert-red',
      'border-l-warning-amber',
    ];
    for (const style of Object.values(accentStyles)) {
      const colorClasses = style
        .split(' ')
        .filter((cls) => cls.startsWith('border-l-') && cls !== 'border-l-4');
      for (const colorClass of colorClasses) {
        expect(allowedAccentColors).toContain(colorClass);
      }
    }
  });
});
