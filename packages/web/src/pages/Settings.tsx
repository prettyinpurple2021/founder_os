// Requirements: 12.1, 12.5, 14.4, 14.5
// Settings page with repository connection management — LaunchChrome™ styling

import RepositoryConnection from '../components/RepositoryConnection';

export default function Settings() {
  return (
    <div className="bg-carbon min-h-full">
      <h2 className="text-2xl font-display font-bold text-chrome-white mb-6">
        Settings
      </h2>
      <div className="max-w-2xl space-y-6">
        <RepositoryConnection />
      </div>
    </div>
  );
}
