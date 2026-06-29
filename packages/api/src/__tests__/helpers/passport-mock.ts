/**
 * Shared factory for mocking `../auth/passport.js` in integration tests that
 * import the API entrypoint (`index.ts`).  The shape includes every member
 * consumed at start-up so the module stays consistent across test files.
 *
 * Usage inside a test file:
 *
 *   vi.mock('../auth/passport.js', async () => {
 *     const { createPassportMock } = await import('./helpers/passport-mock.js');
 *     return createPassportMock();
 *   });
 */

import { vi } from 'vitest';

export function createPassportMock() {
  const passport = {
    initialize: () => (_req: unknown, _res: unknown, next: () => void) => next(),
    session: () => (_req: unknown, _res: unknown, next: () => void) => next(),
    authenticate: () => (_req: unknown, _res: unknown, next: () => void) => next(),
    use: () => {},
    serializeUser: () => {},
    deserializeUser: () => {},
  };
  return { default: passport, initializePassport: vi.fn() };
}
