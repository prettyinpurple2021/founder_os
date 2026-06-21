// Requirements: 8.1, 8.2, 8.6, 8.7
// Production bundle optimization: code splitting, content-hashed filenames,
// vendor chunk extraction, and hidden source maps for error tracking.

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/auth': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    // Generate source maps for error tracking (CloudWatch/Sentry upload)
    // 'hidden' generates .map files but does not add sourceMappingURL comment
    // to the built files, so maps are not publicly served.
    sourcemap: 'hidden',

    rollupOptions: {
      output: {
        // Content-based hashing for cache busting on all output files
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',

        // Vendor chunk extraction: separate node_modules into a dedicated chunk
        // to improve cache hit rates across deployments (app code changes frequently,
        // vendor code changes rarely).
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // Group React core libraries together
            if (
              id.includes('react') ||
              id.includes('react-dom') ||
              id.includes('react-router')
            ) {
              return 'vendor-react';
            }
            // All other third-party libraries
            return 'vendor';
          }
        },
      },
    },
  },
});
