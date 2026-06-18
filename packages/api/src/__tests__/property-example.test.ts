import { describe, it } from 'vitest';
import fc from 'fast-check';

describe('Property-Based Testing Setup', () => {
  it('addition is commutative', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => {
        return a + b === b + a;
      })
    );
  });

  it('string concatenation length equals sum of lengths', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (a, b) => {
        return (a + b).length === a.length + b.length;
      })
    );
  });

  it('array reverse is its own inverse', () => {
    fc.assert(
      fc.property(fc.array(fc.integer()), (arr) => {
        const reversed = [...arr].reverse().reverse();
        return JSON.stringify(reversed) === JSON.stringify(arr);
      })
    );
  });
});
