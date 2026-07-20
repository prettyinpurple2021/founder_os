import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { Skeleton } from './Skeleton';

// Helper to shallow-render and inspect the React element tree
function renderElement(props: Parameters<typeof Skeleton>[0]) {
  return createElement(Skeleton, props) as unknown as {
    props: Record<string, unknown>;
  };
}

describe('Skeleton', () => {
  describe('single element variants', () => {
    it('renders card variant with correct classes', () => {
      const el = Skeleton({ variant: 'card' });
      const className = el.props.className as string;
      expect(className).toContain('skeleton-shimmer');
      expect(className).toContain('h-32');
      expect(className).toContain('w-full');
      expect(className).toContain('rounded-lg');
      expect(el.props['aria-hidden']).toBe('true');
    });

    it('renders metric variant with correct classes', () => {
      const el = Skeleton({ variant: 'metric' });
      const className = el.props.className as string;
      expect(className).toContain('skeleton-shimmer');
      expect(className).toContain('h-10');
      expect(className).toContain('w-24');
      expect(className).toContain('rounded');
    });

    it('renders progress variant with correct classes', () => {
      const el = Skeleton({ variant: 'progress' });
      const className = el.props.className as string;
      expect(className).toContain('skeleton-shimmer');
      expect(className).toContain('h-2');
      expect(className).toContain('w-full');
      expect(className).toContain('rounded-full');
    });

    it('renders text variant (single line) with correct classes', () => {
      const el = Skeleton({ variant: 'text' });
      const className = el.props.className as string;
      expect(className).toContain('skeleton-shimmer');
      expect(className).toContain('h-4');
      expect(className).toContain('w-full');
      expect(className).toContain('rounded');
    });
  });

  describe('text variant with multiple lines', () => {
    it('renders multiple line elements', () => {
      const el = Skeleton({ variant: 'text', lines: 3 });
      expect(el.props['aria-hidden']).toBe('true');
      const children = el.props.children as Array<{ props: Record<string, unknown> }>;
      expect(children).toHaveLength(3);
    });

    it('last line has 60% width', () => {
      const el = Skeleton({ variant: 'text', lines: 4 });
      const children = el.props.children as Array<{ props: Record<string, unknown> }>;
      const lastChild = children[3];
      const className = lastChild.props.className as string;
      expect(className).toContain('w-[60%]');
    });

    it('non-last lines have full width', () => {
      const el = Skeleton({ variant: 'text', lines: 3 });
      const children = el.props.children as Array<{ props: Record<string, unknown> }>;
      const firstChild = children[0];
      const className = firstChild.props.className as string;
      expect(className).toContain('w-full');
      expect(className).not.toContain('w-[60%]');
    });
  });

  describe('aria-hidden', () => {
    it('all single-element variants are aria-hidden', () => {
      const variants = ['card', 'metric', 'progress', 'text'] as const;
      for (const variant of variants) {
        const el = Skeleton({ variant });
        expect(el.props['aria-hidden']).toBe('true');
      }
    });

    it('multi-line text wrapper is aria-hidden', () => {
      const el = Skeleton({ variant: 'text', lines: 2 });
      expect(el.props['aria-hidden']).toBe('true');
    });
  });

  describe('custom className', () => {
    it('appends custom className for single element variant', () => {
      const el = Skeleton({ variant: 'card', className: 'my-custom' });
      const className = el.props.className as string;
      expect(className).toContain('my-custom');
    });

    it('appends custom className for multi-line text', () => {
      const el = Skeleton({ variant: 'text', lines: 2, className: 'extra' });
      const className = el.props.className as string;
      expect(className).toContain('extra');
    });
  });
});
