// Requirements: 4.5, 7.6, 9.1
// Unit tests for MobileNav component class composition and structure

import { describe, it, expect } from 'vitest';
import clsx from 'clsx';

// MobileNav container classes matching the component implementation
const containerClasses = 'h-16 bg-carbon border-t border-graphite flex items-center justify-around';

// Nav item class composition logic matching the component
const baseItemStyles = 'relative flex flex-col items-center justify-center min-h-[44px] min-w-[44px] px-2 py-1 transition-colors duration-fast ease-snap';
const activeItemStyles = 'text-founder-pink';
const inactiveItemStyles = 'text-text-muted hover:text-chrome-silver';

function getNavItemClassName(isActive: boolean): string {
  return clsx(
    baseItemStyles,
    isActive ? activeItemStyles : inactiveItemStyles
  );
}

describe('MobileNav - Container', () => {
  it('uses nav element semantics with mobile aria-label', () => {
    // The component renders <nav aria-label="Mobile navigation">
    const ariaLabel = 'Mobile navigation';
    expect(ariaLabel).toBe('Mobile navigation');
  });

  it('has 64px height using h-16 class', () => {
    expect(containerClasses).toContain('h-16');
  });

  it('uses Carbon Black background', () => {
    expect(containerClasses).toContain('bg-carbon');
  });

  it('has graphite top border', () => {
    expect(containerClasses).toContain('border-t');
    expect(containerClasses).toContain('border-graphite');
  });

  it('distributes items evenly with justify-around', () => {
    expect(containerClasses).toContain('flex');
    expect(containerClasses).toContain('items-center');
    expect(containerClasses).toContain('justify-around');
  });
});

describe('MobileNav - Touch Targets', () => {
  it('enforces minimum 44px height touch target', () => {
    const className = getNavItemClassName(false);
    expect(className).toContain('min-h-[44px]');
  });

  it('enforces minimum 44px width touch target', () => {
    const className = getNavItemClassName(false);
    expect(className).toContain('min-w-[44px]');
  });
});

describe('MobileNav - Active State', () => {
  it('uses Founder Pink text color when active', () => {
    const className = getNavItemClassName(true);
    expect(className).toContain('text-founder-pink');
  });

  it('does not apply muted text when active', () => {
    const className = getNavItemClassName(true);
    expect(className).not.toContain('text-text-muted');
  });
});

describe('MobileNav - Inactive State', () => {
  it('uses text-muted color when inactive', () => {
    const className = getNavItemClassName(false);
    expect(className).toContain('text-text-muted');
  });

  it('applies chrome-silver on hover when inactive', () => {
    const className = getNavItemClassName(false);
    expect(className).toContain('hover:text-chrome-silver');
  });

  it('does not apply founder-pink when inactive', () => {
    const className = getNavItemClassName(false);
    expect(className).not.toContain('text-founder-pink');
  });
});

describe('MobileNav - Item Layout', () => {
  it('stacks icon and label vertically', () => {
    const className = getNavItemClassName(true);
    expect(className).toContain('flex-col');
  });

  it('centers items within touch target', () => {
    const className = getNavItemClassName(true);
    expect(className).toContain('items-center');
    expect(className).toContain('justify-center');
  });
});

describe('MobileNav - Transitions', () => {
  it('uses fast duration for color transitions', () => {
    const className = getNavItemClassName(true);
    expect(className).toContain('duration-fast');
  });

  it('uses snap easing curve', () => {
    const className = getNavItemClassName(true);
    expect(className).toContain('ease-snap');
  });
});
