// Custom ESM loader that adds .js extension to extensionless relative imports.
// Required because Prisma generates imports without .js extensions which breaks Node.js ESM.

export async function resolve(specifier, context, nextResolve) {
  // Only handle relative imports without extensions (from Prisma generated code)
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    if (!specifier.endsWith('.js') && !specifier.endsWith('.json') && !specifier.endsWith('.node')) {
      try {
        return await nextResolve(`${specifier}.js`, context);
      } catch {
        // Fall through to default resolution
      }
    }
  }
  return nextResolve(specifier, context);
}
