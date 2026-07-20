// Requirements: 8.6
import { useState, useEffect, useRef } from 'react';

export interface UseCountUpOptions {
  end: number;
  duration?: number; // default 400ms
  delay?: number; // default 0ms
}

/**
 * Animates a number from 0 to `end` using requestAnimationFrame with ease-out deceleration.
 * Respects prefers-reduced-motion: returns `end` immediately when active.
 * Only fires on initial mount (not on re-renders).
 */
export function useCountUp({
  end,
  duration = 400,
  delay = 0,
}: UseCountUpOptions): number {
  const [current, setCurrent] = useState(0);
  const rafRef = useRef<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // If end is 0, no animation needed
    if (end === 0) {
      setCurrent(0);
      return;
    }

    // Check prefers-reduced-motion
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      setCurrent(end);
      return;
    }

    const startAnimation = () => {
      const startTime = performance.now();

      const animate = (now: number) => {
        const elapsed = now - startTime;
        const t = Math.min(elapsed / duration, 1);

        // Ease-out deceleration: 1 - (1 - t)^3
        const eased = 1 - Math.pow(1 - t, 3);

        const value = eased * end;

        // Round to integer if end is a whole number
        const rounded = Number.isInteger(end) ? Math.round(value) : value;

        setCurrent(rounded);

        if (t < 1) {
          rafRef.current = requestAnimationFrame(animate);
        } else {
          setCurrent(end);
        }
      };

      rafRef.current = requestAnimationFrame(animate);
    };

    if (delay > 0) {
      timeoutRef.current = setTimeout(startAnimation, delay);
    } else {
      startAnimation();
    }

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []); // Only fire on initial mount

  return current;
}
