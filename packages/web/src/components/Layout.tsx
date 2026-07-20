// Requirements: 4.1–4.5, 4.8, 8.2, 8.3, 9.1–9.6
// CSS Grid layout shell: desktop 2-column (80px nav + 1fr workspace), mobile single-column
// Named grid areas: nav, utility, workspace
// Ambient background texture with dual-neon radial bloom
// Crossfade page transition on Outlet

import { Outlet, useLocation } from 'react-router-dom';
import NavigationRail from './NavigationRail.js';
import { UtilityBar } from './UtilityBar.js';
import MobileNav from './MobileNav.js';
import { useAuth } from '../contexts/AuthContext.js';
import type { NavItem } from './NavigationRail.js';

const navItems: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: '📊', end: true },
  { to: '/checklist', label: 'Checklist', icon: '✅' },
  { to: '/content', label: 'Content', icon: '📝' },
  { to: '/marketing', label: 'Marketing', icon: '📣' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
];

export default function Layout() {
  const { user } = useAuth();
  const location = useLocation();

  return (
    <div className="app-grid grid min-h-screen grid-cols-1 grid-rows-[56px_1fr_64px] lg:grid-cols-[80px_1fr] lg:grid-rows-[56px_1fr]">
      {/* NavigationRail — desktop only (hidden on mobile) */}
      <div className="hidden lg:flex [grid-area:nav]">
        <NavigationRail items={navItems} />
      </div>

      {/* UtilityBar — always visible */}
      <div className="[grid-area:utility]">
        <UtilityBar
          syncStatus="idle"
          userName={user?.username}
        />
      </div>

      {/* Workspace area with ambient background texture */}
      <main
        className="[grid-area:workspace] overflow-y-auto"
        style={{
          background: `
            radial-gradient(ellipse 60% 50% at 10% 90%, rgba(183, 255, 42, 0.02) 0%, transparent 70%),
            radial-gradient(ellipse 50% 60% at 90% 10%, rgba(255, 43, 166, 0.02) 0%, transparent 70%),
            var(--fl-carbon)
          `,
        }}
      >
        <div className="max-w-content mx-auto px-4 py-6 md:px-6 lg:px-8">
          <div key={location.pathname} className="motion-safe:animate-fade-in">
            <Outlet />
          </div>
        </div>
      </main>

      {/* MobileNav — visible below lg */}
      <div className="[grid-area:nav] lg:hidden">
        <MobileNav items={navItems} />
      </div>
    </div>
  );
}
