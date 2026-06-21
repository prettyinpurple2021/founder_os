// Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
// CLI entry point for frontend bundle size analysis.
// Measures gzipped size of production build chunks against 500KB threshold.
// Usage: npx tsx scripts/check-bundle.ts [--json]

import { analyzeBundles, type ChunkInfo } from './lib/bundle-analyzer.js';
import { formatBundleReport } from './lib/reporter.js';
import { gzipSync } from 'node:zlib';
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const DIST_DIR = path.resolve(
  import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname),
  '../packages/web/dist'
);
const MANIFEST_PATH = path.join(DIST_DIR, '.vite', 'manifest.json');

interface ManifestEntry {
  file: string;
  src?: string;
  isEntry?: boolean;
  isDynamicEntry?: boolean;
  css?: string[];
  imports?: string[];
}

type ViteManifest = Record<string, ManifestEntry>;

function parseArgs(): { json: boolean } {
  const args = process.argv.slice(2);
  return { json: args.includes('--json') };
}

function ensureBuild(): void {
  if (!existsSync(DIST_DIR) || !existsSync(MANIFEST_PATH)) {
    console.log('Building frontend (npm run build:web)...');
    try {
      execSync('npm run build:web', {
        stdio: 'inherit',
        cwd: path.resolve(
          import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname),
          '..'
        ),
      });
    } catch {
      console.error('Build failed. Fix build errors and try again.');
      process.exit(1);
    }
  }

  if (!existsSync(MANIFEST_PATH)) {
    console.error(
      'Vite manifest not found at packages/web/dist/.vite/manifest.json.\n' +
        'Ensure vite.config.ts has `build.manifest: true`.'
    );
    process.exit(1);
  }
}

function classifyChunk(
  key: string,
  entry: ManifestEntry
): ChunkInfo['type'] {
  const file = entry.file;

  // CSS files
  if (file.endsWith('.css')) {
    return 'css';
  }

  // Entry point (main)
  if (entry.isEntry) {
    return 'main';
  }

  // Dynamic imports are route chunks
  if (entry.isDynamicEntry) {
    return 'route';
  }

  // Keys starting with underscore or containing 'vendor' are vendor chunks
  if (key.startsWith('_') || file.includes('vendor')) {
    return 'vendor';
  }

  // Fallback: treat as route chunk
  return 'route';
}

function isInitialChunk(
  key: string,
  entry: ManifestEntry,
  manifest: ViteManifest
): boolean {
  // Entry points are always initial
  if (entry.isEntry) {
    return true;
  }

  // Dynamic entries are not initial (lazy-loaded)
  if (entry.isDynamicEntry) {
    return false;
  }

  // CSS files referenced by entry points are initial
  for (const manifestEntry of Object.values(manifest)) {
    if (manifestEntry.isEntry && manifestEntry.css?.includes(entry.file)) {
      return true;
    }
  }

  // Chunks imported by entry points are initial (vendor chunks)
  for (const manifestEntry of Object.values(manifest)) {
    if (manifestEntry.isEntry && manifestEntry.imports?.includes(key)) {
      return true;
    }
  }

  // Chunks imported by other initial chunks (recursive check, one level deep)
  for (const [otherKey, otherEntry] of Object.entries(manifest)) {
    if (
      otherEntry.isEntry &&
      otherEntry.imports
    ) {
      for (const importedKey of otherEntry.imports) {
        const importedEntry = manifest[importedKey];
        if (importedEntry?.imports?.includes(key)) {
          return true;
        }
      }
    }
  }

  return false;
}

function collectChunks(manifest: ViteManifest): ChunkInfo[] {
  const chunks: ChunkInfo[] = [];
  const processed = new Set<string>();

  for (const [key, entry] of Object.entries(manifest)) {
    const filePath = path.join(DIST_DIR, entry.file);

    // Skip if file doesn't exist or already processed
    if (!existsSync(filePath) || processed.has(entry.file)) {
      continue;
    }
    processed.add(entry.file);

    const content = readFileSync(filePath);
    const rawSize = content.length;
    const gzipSize = gzipSync(content).length;

    chunks.push({
      name: entry.file,
      type: classifyChunk(key, entry),
      rawSize,
      gzipSize,
      isInitial: isInitialChunk(key, entry, manifest),
    });

    // Also process CSS files referenced by this entry
    if (entry.css) {
      for (const cssFile of entry.css) {
        if (processed.has(cssFile)) continue;
        processed.add(cssFile);

        const cssPath = path.join(DIST_DIR, cssFile);
        if (!existsSync(cssPath)) continue;

        const cssContent = readFileSync(cssPath);
        const cssRawSize = cssContent.length;
        const cssGzipSize = gzipSync(cssContent).length;

        chunks.push({
          name: cssFile,
          type: 'css',
          rawSize: cssRawSize,
          gzipSize: cssGzipSize,
          isInitial: entry.isEntry === true,
        });
      }
    }
  }

  return chunks;
}

function main(): void {
  const { json } = parseArgs();

  ensureBuild();

  const manifestContent = readFileSync(MANIFEST_PATH, 'utf-8');
  const manifest: ViteManifest = JSON.parse(manifestContent);

  const chunks = collectChunks(manifest);
  const result = analyzeBundles(chunks);
  const output = formatBundleReport(result, {
    format: json ? 'json' : 'human',
  });

  console.log(output);

  if (result.status === 'fail') {
    process.exit(1);
  }

  process.exit(0);
}

main();
