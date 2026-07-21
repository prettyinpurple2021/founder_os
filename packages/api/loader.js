// Custom ESM loader that adds .js extension to extensionless relative imports.
// Required because Prisma generates imports without .js extensions which breaks Node.js ESM.
// Used via: node --import ./loader.js dist/index.js

import { register } from 'node:module';

register('./resolve-hook.js', import.meta.url);
