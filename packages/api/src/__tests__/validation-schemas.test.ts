import { describe, it, expect } from 'vitest';
import { connectRepoSchema } from '../validation/schemas.js';

describe('connectRepoSchema', () => {
  it('rejects fullName values that do not match owner/name', () => {
    const result = connectRepoSchema.safeParse({
      githubId: 1,
      owner: 'octocat',
      name: 'hello-world',
      fullName: 'octocat/different',
    });

    expect(result.success).toBe(false);
  });

  it('accepts valid owner, name, and matching fullName', () => {
    const result = connectRepoSchema.safeParse({
      githubId: 1,
      owner: 'octocat',
      name: 'hello-world',
      fullName: 'octocat/hello-world',
    });

    expect(result.success).toBe(true);
  });
});
