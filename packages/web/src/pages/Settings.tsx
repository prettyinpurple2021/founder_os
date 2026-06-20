// Requirements: 1.2, 1.3
// Settings page with repository connection management

import RepositoryConnection from '../components/RepositoryConnection';

export default function Settings() {
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Settings</h2>
      <div className="max-w-2xl space-y-6">
        <RepositoryConnection />
      </div>
    </div>
  );
}
