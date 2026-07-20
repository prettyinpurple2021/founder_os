import { describe, it, expect } from 'vitest';
import { UtilityBar } from './UtilityBar.js';

describe('UtilityBar', () => {
  describe('semantic element', () => {
    it('renders a header element', () => {
      const el = UtilityBar({});
      expect(el.type).toBe('header');
    });
  });

  describe('layout styles', () => {
    it('applies Carbon Black background, graphite border, and 56px height', () => {
      const el = UtilityBar({});
      const className = el.props.className as string;
      expect(className).toContain('bg-carbon');
      expect(className).toContain('border-b');
      expect(className).toContain('border-graphite');
      expect(className).toContain('h-14');
    });

    it('uses flexbox with justify-between and horizontal padding', () => {
      const el = UtilityBar({});
      const className = el.props.className as string;
      expect(className).toContain('flex');
      expect(className).toContain('items-center');
      expect(className).toContain('justify-between');
      expect(className).toContain('px-6');
    });

    it('appends custom className', () => {
      const el = UtilityBar({ className: 'my-custom' });
      const className = el.props.className as string;
      expect(className).toContain('my-custom');
    });
  });

  describe('sync status indicator', () => {
    it('defaults to idle with chrome-steel color', () => {
      const el = UtilityBar({});
      const syncArea = el.props.children[0];
      const dot = syncArea.props.children[0];
      const label = syncArea.props.children[1];
      expect((dot.props.className as string)).toContain('bg-chrome-steel');
      expect(label.props.children).toBe('Idle');
    });

    it('renders syncing state with hyper-cyan and pulse animation', () => {
      const el = UtilityBar({ syncStatus: 'syncing' });
      const syncArea = el.props.children[0];
      const dot = syncArea.props.children[0];
      const label = syncArea.props.children[1];
      expect((dot.props.className as string)).toContain('bg-hyper-cyan');
      expect((dot.props.className as string)).toContain('animate-pulse');
      expect(label.props.children).toBe('Syncing');
    });

    it('renders success state with launch-lime color', () => {
      const el = UtilityBar({ syncStatus: 'success' });
      const syncArea = el.props.children[0];
      const dot = syncArea.props.children[0];
      const label = syncArea.props.children[1];
      expect((dot.props.className as string)).toContain('bg-launch-lime');
      expect(label.props.children).toBe('Synced');
    });

    it('renders failed state with alert-red color', () => {
      const el = UtilityBar({ syncStatus: 'failed' });
      const syncArea = el.props.children[0];
      const dot = syncArea.props.children[0];
      const label = syncArea.props.children[1];
      expect((dot.props.className as string)).toContain('bg-alert-red');
      expect(label.props.children).toBe('Sync failed');
    });

    it('does not pulse when not syncing', () => {
      const el = UtilityBar({ syncStatus: 'success' });
      const syncArea = el.props.children[0];
      const dot = syncArea.props.children[0];
      expect((dot.props.className as string)).not.toContain('animate-pulse');
    });
  });

  describe('user controls', () => {
    it('displays userName when provided', () => {
      const el = UtilityBar({ userName: 'founderdev' });
      const userArea = el.props.children[1];
      const nameSpan = userArea.props.children;
      expect(nameSpan.props.children).toBe('founderdev');
    });

    it('does not render user name when not provided', () => {
      const el = UtilityBar({});
      const userArea = el.props.children[1];
      expect(userArea.props.children).toBeFalsy();
    });
  });
});
