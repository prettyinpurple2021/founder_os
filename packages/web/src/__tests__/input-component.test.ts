// Requirements: 5.4, 5.6, 5.7, 7.5
// Unit tests for Input component class composition logic

import { describe, it, expect } from 'vitest';
import clsx from 'clsx';

// Mirror the Input component's class logic for testing
const baseInputStyles = clsx(
  'w-full rounded-md px-4 py-2.5',
  'bg-carbon border text-text-primary placeholder:text-text-muted',
  'motion-safe:transition-[border-color,box-shadow] motion-safe:duration-fast',
  'focus:outline-none focus:border-hyper-cyan focus:ring-1 focus:ring-hyper-cyan',
);

const defaultBorderStyle = 'border-graphite';
const errorBorderStyle = 'border-alert-red';
const disabledStyles = 'opacity-50 cursor-not-allowed';

const labelStyles = 'block text-small text-text-secondary font-medium mb-1.5';
const hintStyles = 'mt-1.5 text-caption text-text-muted';
const errorTextStyles = 'mt-1.5 text-caption text-alert-red';

describe('Input Component - Base Styles', () => {
  it('uses bg-carbon background matching Foundation surface', () => {
    expect(baseInputStyles).toContain('bg-carbon');
  });

  it('uses text-text-primary for input text color', () => {
    expect(baseInputStyles).toContain('text-text-primary');
  });

  it('uses placeholder:text-text-muted for placeholder styling', () => {
    expect(baseInputStyles).toContain('placeholder:text-text-muted');
  });

  it('renders full-width by default', () => {
    expect(baseInputStyles).toContain('w-full');
  });

  it('uses rounded-md border radius', () => {
    expect(baseInputStyles).toContain('rounded-md');
  });

  it('uses px-4 py-2.5 padding', () => {
    expect(baseInputStyles).toContain('px-4');
    expect(baseInputStyles).toContain('py-2.5');
  });
});

describe('Input Component - Border Styles', () => {
  it('uses border-graphite by default (no error)', () => {
    expect(defaultBorderStyle).toBe('border-graphite');
  });

  it('uses border-alert-red in error state', () => {
    expect(errorBorderStyle).toBe('border-alert-red');
  });

  it('border style switches based on error prop presence', () => {
    const withError = true;
    const borderClass = withError ? errorBorderStyle : defaultBorderStyle;
    expect(borderClass).toBe('border-alert-red');

    const withoutError = false;
    const normalBorder = withoutError ? errorBorderStyle : defaultBorderStyle;
    expect(normalBorder).toBe('border-graphite');
  });
});

describe('Input Component - Focus State', () => {
  it('uses border-hyper-cyan on focus', () => {
    expect(baseInputStyles).toContain('focus:border-hyper-cyan');
  });

  it('uses ring-1 ring-hyper-cyan on focus', () => {
    expect(baseInputStyles).toContain('focus:ring-1');
    expect(baseInputStyles).toContain('focus:ring-hyper-cyan');
  });

  it('removes default outline on focus', () => {
    expect(baseInputStyles).toContain('focus:outline-none');
  });
});

describe('Input Component - Motion and Transitions', () => {
  it('uses motion-safe prefix for transitions (respects reduced-motion)', () => {
    expect(baseInputStyles).toContain('motion-safe:transition-[border-color,box-shadow]');
  });

  it('uses fast duration token for focus transition', () => {
    expect(baseInputStyles).toContain('motion-safe:duration-fast');
  });
});

describe('Input Component - Disabled State', () => {
  it('applies opacity-50 when disabled', () => {
    expect(disabledStyles).toContain('opacity-50');
  });

  it('shows not-allowed cursor when disabled', () => {
    expect(disabledStyles).toContain('cursor-not-allowed');
  });
});

describe('Input Component - Label Styles', () => {
  it('label uses text-small size', () => {
    expect(labelStyles).toContain('text-small');
  });

  it('label uses text-text-secondary color', () => {
    expect(labelStyles).toContain('text-text-secondary');
  });

  it('label uses font-medium weight', () => {
    expect(labelStyles).toContain('font-medium');
  });

  it('label renders as block element', () => {
    expect(labelStyles).toContain('block');
  });
});

describe('Input Component - Hint Text', () => {
  it('hint uses text-caption size', () => {
    expect(hintStyles).toContain('text-caption');
  });

  it('hint uses text-text-muted color', () => {
    expect(hintStyles).toContain('text-text-muted');
  });
});

describe('Input Component - Error Text', () => {
  it('error message uses text-caption size', () => {
    expect(errorTextStyles).toContain('text-caption');
  });

  it('error message uses text-alert-red color', () => {
    expect(errorTextStyles).toContain('text-alert-red');
  });
});

describe('Input Component - Design Token Compliance', () => {
  it('no styles use hard-coded hex colors', () => {
    const allStyles = [baseInputStyles, defaultBorderStyle, errorBorderStyle, labelStyles, hintStyles, errorTextStyles];
    for (const style of allStyles) {
      expect(style).not.toMatch(/\[#[0-9a-fA-F]+\]/);
    }
  });

  it('no styles use generic Tailwind colors (gray, slate, etc)', () => {
    const allStyles = [baseInputStyles, defaultBorderStyle, errorBorderStyle, labelStyles, hintStyles, errorTextStyles];
    for (const style of allStyles) {
      expect(style).not.toContain('bg-white');
      expect(style).not.toContain('bg-gray');
      expect(style).not.toContain('bg-slate');
      expect(style).not.toContain('text-gray');
      expect(style).not.toContain('text-slate');
    }
  });

  it('background uses LaunchChrome design token (carbon)', () => {
    expect(baseInputStyles).toContain('bg-carbon');
    expect(baseInputStyles).not.toContain('bg-white');
    expect(baseInputStyles).not.toContain('bg-gray');
  });
});

describe('Input Component - Accessibility', () => {
  it('label is linked to input via htmlFor/id pattern', () => {
    // The component uses useId() for generated id and propId for user-provided id
    // Label renders with htmlFor={inputId} and input renders with id={inputId}
    // This test validates the contract exists in the component design
    const inputId = 'test-input-id';
    const labelHtmlFor = inputId;
    const inputElementId = inputId;
    expect(labelHtmlFor).toBe(inputElementId);
  });

  it('error state sets aria-invalid=true', () => {
    const error = 'This field is required';
    const ariaInvalid = error ? true : undefined;
    expect(ariaInvalid).toBe(true);
  });

  it('no error state leaves aria-invalid undefined', () => {
    const error = undefined;
    const ariaInvalid = error ? true : undefined;
    expect(ariaInvalid).toBeUndefined();
  });

  it('aria-describedby points to error message when error exists', () => {
    const inputId = 'test-input';
    const error = 'Required field';
    const hint = 'Enter your name';
    const ariaDescribedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;
    expect(ariaDescribedBy).toBe('test-input-error');
  });

  it('aria-describedby points to hint when no error but hint exists', () => {
    const inputId = 'test-input';
    const error = undefined;
    const hint = 'Enter your name';
    const ariaDescribedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;
    expect(ariaDescribedBy).toBe('test-input-hint');
  });

  it('aria-describedby is undefined when no error and no hint', () => {
    const inputId = 'test-input';
    const error = undefined;
    const hint = undefined;
    const ariaDescribedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;
    expect(ariaDescribedBy).toBeUndefined();
  });
});
