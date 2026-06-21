// Requirements: 8.3, 8.6
// Property-based tests for bundle analyzer pure logic

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  analyzeBundles,
  type ChunkInfo,
} from '../lib/bundle-analyzer.js';

/**
 * Arbitrary generator for valid ChunkInfo objects.
 * Constrains to non-negative sizes and valid type enum values.
 */
const chunkInfoArb: fc.Arbitrary<ChunkInfo> = fc.record({
  name: fc.string({ minLength: 1, maxLength: 50 }),
  type: fc.constantFrom('main' as const, 'vendor' as const, 'css' as const, 'route' as const),
  rawSize: fc.nat({ max: 10_000_000 }),
  gzipSize: fc.nat({ max: 10_000_000 }),
  isInitial: fc.boolean(),
});

const chunksArb: fc.Arbitrary<ChunkInfo[]> = fc.array(chunkInfoArb, {
  minLength: 0,
  maxLength: 20,
});

describe('Property 2: Bundle report completeness and serialization round-trip', () => {
  /**
   * Validates: Requirements 8.3, 8.6
   *
   * For any set of chunk metadata, the formatted JSON report SHALL contain
   * every chunk from the input with both raw and gzipped sizes, and parsing
   * the JSON output SHALL produce data equivalent to the original analysis result.
   */
  it('serialization round-trip: JSON.stringify then JSON.parse produces equivalent result', () => {
    fc.assert(
      fc.property(chunksArb, (chunks) => {
        const result = analyzeBundles(chunks);

        // Serialize to JSON
        const serialized = JSON.stringify(result);

        // Parse back
        const parsed = JSON.parse(serialized);

        // Assert deep equality (round-trip preserves all data)
        expect(parsed).toEqual(result);
      }),
      { numRuns: 100 }
    );
  });

  it('report completeness: every input chunk appears in result with rawSize and gzipSize preserved', () => {
    fc.assert(
      fc.property(chunksArb, (chunks) => {
        const result = analyzeBundles(chunks);

        // Every input chunk must appear in result.chunks
        expect(result.chunks).toHaveLength(chunks.length);

        for (let i = 0; i < chunks.length; i++) {
          const inputChunk = chunks[i];
          const outputChunk = result.chunks[i];

          // Each chunk preserves name, rawSize, and gzipSize
          expect(outputChunk.name).toBe(inputChunk.name);
          expect(outputChunk.rawSize).toBe(inputChunk.rawSize);
          expect(outputChunk.gzipSize).toBe(inputChunk.gzipSize);
          expect(outputChunk.type).toBe(inputChunk.type);
          expect(outputChunk.isInitial).toBe(inputChunk.isInitial);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('round-trip preserves chunk-level size data after serialization', () => {
    fc.assert(
      fc.property(chunksArb, (chunks) => {
        const result = analyzeBundles(chunks);
        const parsed = JSON.parse(JSON.stringify(result));

        // Every chunk in the parsed output has both raw and gzip sizes
        for (const chunk of parsed.chunks) {
          expect(typeof chunk.rawSize).toBe('number');
          expect(typeof chunk.gzipSize).toBe('number');
          expect(chunk.rawSize).toBeGreaterThanOrEqual(0);
          expect(chunk.gzipSize).toBeGreaterThanOrEqual(0);
        }

        // Verify length matches
        expect(parsed.chunks.length).toBe(chunks.length);
      }),
      { numRuns: 100 }
    );
  });
});
