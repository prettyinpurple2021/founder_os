// Requirements: 2.2, 8.5, 9.1
// App shell with navigation sidebar, sync button, user info, and main content area

import { NavLink, Outlet } from 'react-router-dom';
import SyncButton from './SyncButton.js';
import { useAuth } from '../contexts/AuthContext.js';

const navItems = [
  { to: '/', label: 'Dashboard', icon: '📊' },
  { to: '/checklist', label: 'Checklist', icon: '✅' },
  { to: '/content', label: 'Content', icon: '📝' },
  { to: '/marketing', label: 'Marketing', icon: '📣' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
];

export default function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-lg font-bold text-gray-900">Launch OS</h1>
          <p className="text-sm text-gray-500 mt-1">Solo Founder</p>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
                }`
              }
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Sync button in sidebar footer */}
        <SyncButton />

        {/* User section */}
        <div className="p-4 border-t border-gray-200">
          {user && <p className="text-sm text-gray-700 mb-2 truncate">{user.username}</p>}
          <button
            onClick={() => void logout()}
            className="w-full text-left text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-8">
        <Outlet />
      </main>
    </div>
  );
}
