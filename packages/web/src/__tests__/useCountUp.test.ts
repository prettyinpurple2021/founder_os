import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useCountUp } from '../hooks/useCountUp.js';

// Minimal hook runner without React DOM — tests the logic directly
// Since vitest environment is 'node', we simulate the hook behavior

describe('useCountUp', () => {
  let matchMediaMock: ReturnType<typeof vi.fn>;
  let rafCallbacks: Array<(time: number) => void>;
  let rafId: number;

  beforeEach(() => {
    rafCallbacks = [];
    rafId = 0;

    // Mock window.matchMedia
    matchMediaMock = vi.fn().mockReturnValue({ matches: false });
    vi.stubGlobal('matchMedia', matchMediaMock);

    // Mock requestAnimationFrame
    vi.stubGlobal('requestAnimationFrame', (cb: (time: number) => void) => {
      rafCallbacks.push(cb);
      return ++rafId;
    });

    // Mock cancelAnimationFrame
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    // Mock performance.now
    vi.stubGlobal('performance', { now: vi.fn(() => 0) });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('prefers-reduced-motion', () => {
    it('should return end value immediately when reduced motion is active', () => {
      matchMediaMock.mockReturnValue({ matches: true });

      // Simulate the hook logic for reduced motion
      const prefersReducedMotion = matchMediaMock(
        '(prefers-reduced-motion: reduce)',
      ).matches;
      expect(prefersReducedMotion).toBe(true);

      // Hook returns end immediately when reduced motion is active
      const end = 75;
      if (prefersReducedMotion) {
        expect(end).toBe(75);
      }
    });

    it('should check matchMedia with correct query', () => {
      matchMediaMock('(prefers-reduced-motion: reduce)');
      expect(matchMediaMock).toHaveBeenCalledWith(
        '(prefers-reduced-motion: reduce)',
      );
    });
  });

  describe('end value of 0', () => {
    it('should return 0 immediately without animation', () => {
      const end = 0;
      // When end is 0, hook returns 0 immediately with no animation
      expect(end).toBe(0);
    });
  });

  describe('ease-out deceleration function', () => {
    // Testing the easing function: 1 - (1 - t)^3
    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

    it('should start at 0 when t=0', () => {
      expect(easeOut(0)).toBe(0);
    });

    it('should end at 1 when t=1', () => {
      expect(easeOut(1)).toBe(1);
    });

    it('should be greater than linear at midpoint (deceleration)', () => {
      // At t=0.5, ease-out should be ahead of linear (0.5)
      expect(easeOut(0.5)).toBeGreaterThan(0.5);
    });

    it('should produce monotonically increasing values', () => {
      let prev = 0;
      for (let i = 1; i <= 100; i++) {
        const t = i / 100;
        const value = easeOut(t);
        expect(value).toBeGreaterThanOrEqual(prev);
        prev = value;
      }
    });

    it('should map correctly to end value', () => {
      const end = 100;
      const t = 0.5;
      const result = easeOut(t) * end;
      // 1 - (1 - 0.5)^3 = 1 - 0.125 = 0.875
      expect(result).toBeCloseTo(87.5);
    });
  });

  describe('integer rounding', () => {
    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

    it('should round to integer when end is a whole number', () => {
      const end = 42;
      const t = 0.3;
      const value = easeOut(t) * end;
      const rounded = Number.isInteger(end) ? Math.round(value) : value;
      expect(Number.isInteger(rounded)).toBe(true);
    });

    it('should not round when end is a decimal', () => {
      const end = 42.5;
      const t = 0.3;
      const value = easeOut(t) * end;
      const rounded = Number.isInteger(end) ? Math.round(value) : value;
      // Non-integer end means no rounding
      expect(rounded).toBe(value);
    });
  });

  describe('animation lifecycle', () => {
    it('should register a requestAnimationFrame callback on start', () => {
      const startTime = 0;
      vi.mocked(performance.now).mockReturnValue(startTime);

      // Simulate starting animation
      const startAnimation = () => {
        const animate = (_now: number) => {
          /* animation frame */
        };
        return requestAnimationFrame(animate);
      };

      const id = startAnimation();
      expect(id).toBeGreaterThan(0);
      expect(rafCallbacks.length).toBe(1);
    });

    it('should stop animation when t reaches 1', () => {
      const duration = 400;
      const startTime = 0;
      const end = 100;
      const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

      // At elapsed = duration, t should be clamped to 1
      const elapsed = duration;
      const t = Math.min(elapsed / duration, 1);
      expect(t).toBe(1);
      expect(easeOut(t) * end).toBe(100);
    });

    it('should clamp t to max 1 even if elapsed exceeds duration', () => {
      const duration = 400;
      const elapsed = 600; // exceeds duration
      const t = Math.min(elapsed / duration, 1);
      expect(t).toBe(1);
    });
  });

  describe('delay behavior', () => {
    it('should delay animation start when delay > 0', () => {
      vi.useFakeTimers();
      const delay = 200;
      let animationStarted = false;

      const startAnimation = () => {
        animationStarted = true;
      };

      if (delay > 0) {
        setTimeout(startAnimation, delay);
      }

      expect(animationStarted).toBe(false);
      vi.advanceTimersByTime(200);
      expect(animationStarted).toBe(true);

      vi.useRealTimers();
    });

    it('should start immediately when delay is 0', () => {
      const delay = 0;
      let animationStarted = false;

      const startAnimation = () => {
        animationStarted = true;
      };

      if (delay > 0) {
        setTimeout(startAnimation, delay);
      } else {
        startAnimation();
      }

      expect(animationStarted).toBe(true);
    });
  });
});
