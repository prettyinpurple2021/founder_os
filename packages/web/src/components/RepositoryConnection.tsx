// Requirements: 1.2, 1.3
// Repository connection UI: select, connect, and disconnect a single GitHub repository

import { useState, useEffect, useCallback } from 'react';
import { repoApi, ApiError } from '../lib/api';
import type { AvailableRepo, ConnectedRepo } from '../lib/api';

type Status = 'idle' | 'loading' | 'error';

export default function RepositoryConnection() {
  const [connectedRepo, setConnectedRepo] = useState<ConnectedRepo | null>(null);
  const [availableRepos, setAvailableRepos] = useState<AvailableRepo[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState<string>('');
  const [status, setStatus] = useState<Status>('loading');
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);

  const fetchCurrentRepo = useCallback(async () => {
    try {
      const repo = await repoApi.getCurrent();
      setConnectedRepo(repo);
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setConnectedRepo(null);
        return false;
      }
      throw err;
    }
  }, []);

  const fetchAvailableRepos = useCallback(async () => {
    const repos = await repoApi.getAvailable();
    setAvailableRepos(repos);
  }, []);

  useEffect(() => {
    async function init() {
      setStatus('loading');
      setError(null);
      try {
        const hasRepo = await fetchCurrentRepo();
        if (!hasRepo) {
          await fetchAvailableRepos();
        }
        setStatus('idle');
      } catch (err) {
        const message = err instanceof ApiError ? err.message : 'Failed to load repository data';
        setError(message);
        setStatus('error');
      }
    }
    void init();
  }, [fetchCurrentRepo, fetchAvailableRepos]);

  async function handleConnect() {
    if (!selectedRepoId) return;

    const repo = availableRepos.find((r) => String(r.id) === selectedRepoId);
    if (!repo) return;

    setActionLoading(true);
    setError(null);
    try {
      const connected = await repoApi.connect({
        owner: repo.owner.login,
        name: repo.name,
        fullName: repo.full_name,
        githubId: repo.id,
      });
      setConnectedRepo(connected);
      setSelectedRepoId('');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to connect repository';
      setError(message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDisconnect() {
    setActionLoading(true);
    setError(null);
    try {
      await repoApi.disconnect();
      setConnectedRepo(null);
      setShowDisconnectConfirm(false);
      await fetchAvailableRepos();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to disconnect repository';
      setError(message);
    } finally {
      setActionLoading(false);
    }
  }

  if (status === 'loading') {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-5 bg-gray-200 rounded w-1/3"></div>
          <div className="h-10 bg-gray-200 rounded w-full"></div>
        </div>
      </div>
    );
  }

  if (status === 'error' && !connectedRepo && availableRepos.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">GitHub Repository</h3>
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-sm text-red-700">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-3 text-sm font-medium text-red-700 hover:text-red-800 underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">GitHub Repository</h3>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-md p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {connectedRepo ? (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
              <span className="text-green-600 text-lg">✓</span>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">{connectedRepo.fullName}</p>
              <p className="text-xs text-gray-500">
                Connected {new Date(connectedRepo.connectedAt).toLocaleDateString()}
              </p>
            </div>
          </div>

          {showDisconnectConfirm ? (
            <div className="bg-amber-50 border border-amber-200 rounded-md p-4">
              <p className="text-sm text-amber-800 mb-3">
                Disconnecting will stop syncing progress from this repository. Historical data will
                be preserved.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleDisconnect}
                  disabled={actionLoading}
                  className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {actionLoading ? 'Disconnecting…' : 'Confirm Disconnect'}
                </button>
                <button
                  onClick={() => setShowDisconnectConfirm(false)}
                  disabled={actionLoading}
                  className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowDisconnectConfirm(true)}
              className="px-3 py-1.5 text-sm font-medium text-red-600 border border-red-200 rounded-md hover:bg-red-50"
            >
              Disconnect Repository
            </button>
          )}
        </div>
      ) : (
        <div>
          <p className="text-sm text-gray-600 mb-4">
            Connect a GitHub repository to start tracking your launch progress.
          </p>

          <div className="flex gap-2">
            <select
              value={selectedRepoId}
              onChange={(e) => setSelectedRepoId(e.target.value)}
              disabled={actionLoading}
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50 disabled:bg-gray-100"
            >
              <option value="">Select a repository…</option>
              {availableRepos.map((repo) => (
                <option key={repo.id} value={String(repo.id)}>
                  {repo.full_name}
                  {repo.private ? ' 🔒' : ''}
                </option>
              ))}
            </select>

            <button
              onClick={handleConnect}
              disabled={!selectedRepoId || actionLoading}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {actionLoading ? 'Connecting…' : 'Connect'}
            </button>
          </div>

          {availableRepos.length === 0 && (
            <p className="mt-3 text-xs text-gray-500">
              No repositories found. Make sure your GitHub account has accessible repositories.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
