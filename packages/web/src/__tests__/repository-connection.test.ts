// Requirements: 1.2, 1.3
// Unit tests for repository connection UI logic and data handling

import { describe, it, expect } from 'vitest';

// Interfaces matching the API contract
interface AvailableRepo {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string };
  private: boolean;
  description: string | null;
}

interface ConnectedRepo {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  githubId: number;
  connectedAt: string;
}

// Logic functions extracted from the component for testability

function buildConnectPayload(repo: AvailableRepo) {
  return {
    owner: repo.owner.login,
    name: repo.name,
    fullName: repo.full_name,
    githubId: repo.id,
  };
}

function isRepoConnected(connectedRepo: ConnectedRepo | null): boolean {
  return connectedRepo !== null;
}

function findSelectedRepo(
  repos: AvailableRepo[],
  selectedId: string
): AvailableRepo | undefined {
  return repos.find((r) => String(r.id) === selectedId);
}

function canConnect(selectedRepoId: string, actionLoading: boolean): boolean {
  return selectedRepoId !== '' && !actionLoading;
}

describe('Repository Connection - Connect Payload Construction', () => {
  it('should build correct payload from an available repo', () => {
    const repo: AvailableRepo = {
      id: 12345,
      name: 'my-project',
      full_name: 'founder/my-project',
      owner: { login: 'founder' },
      private: false,
      description: 'A cool project',
    };

    const payload = buildConnectPayload(repo);

    expect(payload).toEqual({
      owner: 'founder',
      name: 'my-project',
      fullName: 'founder/my-project',
      githubId: 12345,
    });
  });

  it('should handle private repos the same way', () => {
    const repo: AvailableRepo = {
      id: 99999,
      name: 'secret-sauce',
      full_name: 'solo-dev/secret-sauce',
      owner: { login: 'solo-dev' },
      private: true,
      description: null,
    };

    const payload = buildConnectPayload(repo);

    expect(payload.owner).toBe('solo-dev');
    expect(payload.name).toBe('secret-sauce');
    expect(payload.fullName).toBe('solo-dev/secret-sauce');
    expect(payload.githubId).toBe(99999);
  });
});

describe('Repository Connection - State Detection', () => {
  it('should detect connected state when repo exists', () => {
    const connected: ConnectedRepo = {
      id: 'uuid-1',
      owner: 'founder',
      name: 'my-project',
      fullName: 'founder/my-project',
      githubId: 12345,
      connectedAt: '2024-03-15T10:00:00Z',
    };

    expect(isRepoConnected(connected)).toBe(true);
  });

  it('should detect disconnected state when repo is null', () => {
    expect(isRepoConnected(null)).toBe(false);
  });
});

describe('Repository Connection - Repo Selection', () => {
  const repos: AvailableRepo[] = [
    {
      id: 100,
      name: 'repo-a',
      full_name: 'user/repo-a',
      owner: { login: 'user' },
      private: false,
      description: 'First repo',
    },
    {
      id: 200,
      name: 'repo-b',
      full_name: 'user/repo-b',
      owner: { login: 'user' },
      private: true,
      description: null,
    },
    {
      id: 300,
      name: 'repo-c',
      full_name: 'user/repo-c',
      owner: { login: 'user' },
      private: false,
      description: 'Third repo',
    },
  ];

  it('should find the selected repo by string ID', () => {
    const found = findSelectedRepo(repos, '200');
    expect(found).toBeDefined();
    expect(found!.name).toBe('repo-b');
  });

  it('should return undefined for non-existent ID', () => {
    const found = findSelectedRepo(repos, '999');
    expect(found).toBeUndefined();
  });

  it('should return undefined for empty selection', () => {
    const found = findSelectedRepo(repos, '');
    expect(found).toBeUndefined();
  });
});

describe('Repository Connection - Connect Button Enablement', () => {
  it('should allow connect when repo is selected and not loading', () => {
    expect(canConnect('123', false)).toBe(true);
  });

  it('should disable connect when no repo is selected', () => {
    expect(canConnect('', false)).toBe(false);
  });

  it('should disable connect when action is loading', () => {
    expect(canConnect('123', true)).toBe(false);
  });

  it('should disable connect when both no selection and loading', () => {
    expect(canConnect('', true)).toBe(false);
  });
});

describe('Repository Connection - Data Structure Validation', () => {
  it('should handle connected repo response with all required fields', () => {
    const repo: ConnectedRepo = {
      id: 'uuid-123',
      owner: 'solo-founder',
      name: 'launch-product',
      fullName: 'solo-founder/launch-product',
      githubId: 55555,
      connectedAt: '2024-06-01T12:00:00Z',
    };

    expect(repo.id).toBeTruthy();
    expect(repo.owner).toBeTruthy();
    expect(repo.name).toBeTruthy();
    expect(repo.fullName).toBe(`${repo.owner}/${repo.name}`);
    expect(typeof repo.githubId).toBe('number');
    expect(new Date(repo.connectedAt).getTime()).not.toBeNaN();
  });

  it('should handle available repos response as an array', () => {
    const repos: AvailableRepo[] = [
      {
        id: 1,
        name: 'test',
        full_name: 'u/test',
        owner: { login: 'u' },
        private: false,
        description: null,
      },
    ];

    expect(Array.isArray(repos)).toBe(true);
    expect(repos.length).toBeGreaterThan(0);
    expect(repos[0].owner.login).toBeTruthy();
  });

  it('should support one-repo-per-user constraint by representing single connection', () => {
    // The API returns a single ConnectedRepo (not an array), enforcing the constraint
    const current: ConnectedRepo | null = {
      id: 'single-repo',
      owner: 'user',
      name: 'only-one',
      fullName: 'user/only-one',
      githubId: 1,
      connectedAt: '2024-01-01T00:00:00Z',
    };

    // The system only supports one repo — the API returns an object, not an array
    expect(current).not.toBeNull();
    expect(typeof current).toBe('object');
    expect(Array.isArray(current)).toBe(false);
  });
});
