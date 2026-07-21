// ESM resolve hook — appends .js to extensionless relative imports (for Prisma generated code)
export async function resolve(specifier, context, nextResolve) {
  if ((specifier.startsWith('./') || specifier.startsWith('../')) &&
      !specifier.endsWith('.js') && !specifier.endsWith('.json') && !specifier.endsWith('.node')) {
    try {
      return await nextResolve(`${specifier}.js`, context);
    } catch {
      // Fall through to default resolution
    }
  }
  return nextResolve(specifier, context);
}
