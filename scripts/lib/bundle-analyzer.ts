// Requirements: 8.1, 8.2, 8.5
// Bundle analysis pure logic — threshold classification and chunk analysis
// Full implementation in task 1.2; this file provides types and stub for reporter imports

export interface ChunkInfo {
  name: string;
  type: 'main' | 'vendor' | 'css' | 'route';
  rawSize: number;
  gzipSize: number;
  isInitial: boolean;
}

export interface BundleAnalysisResult {
  chunks: ChunkInfo[];
  totalInitialRaw: number;
  totalInitialGzip: number;
  status: 'pass' | 'warn' | 'fail';
  threshold: number;
  warningThreshold: number;
  message: string;
}

const THRESHOLD = 500 * 1024; // 500KB in bytes
const WARNING_THRESHOLD = 400 * 1024; // 400KB in bytes

export function analyzeBundles(chunks: ChunkInfo[]): BundleAnalysisResult {
  const initialChunks = chunks.filter((c) => c.isInitial);
  const totalInitialRaw = initialChunks.reduce((sum, c) => sum + c.rawSize, 0);
  const totalInitialGzip = initialChunks.reduce(
    (sum, c) => sum + c.gzipSize,
    0
  );

  let status: 'pass' | 'warn' | 'fail';
  let message: string;

  if (totalInitialGzip > THRESHOLD) {
    status = 'fail';
    message = `Initial bundle size (${formatBytes(totalInitialGzip)} gzipped) exceeds the ${formatBytes(THRESHOLD)} threshold.`;
  } else if (totalInitialGzip >= WARNING_THRESHOLD) {
    status = 'warn';
    message = `Initial bundle size (${formatBytes(totalInitialGzip)} gzipped) is approaching the ${formatBytes(THRESHOLD)} threshold.`;
  } else {
    status = 'pass';
    message = `Initial bundle size (${formatBytes(totalInitialGzip)} gzipped) is within the ${formatBytes(THRESHOLD)} threshold.`;
  }

  return {
    chunks,
    totalInitialRaw,
    totalInitialGzip,
    status,
    threshold: THRESHOLD,
    warningThreshold: WARNING_THRESHOLD,
    message,
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
