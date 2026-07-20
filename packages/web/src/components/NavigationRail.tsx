// Requirements: 4.1, 4.2, 4.6, 4.7, 7.7
// Left navigation rail with Carbon Black background, Founder Pink active indicator, and Gunmetal hover states

import { NavLink } from 'react-router-dom';
import clsx from 'clsx';

export interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  end?: boolean;
}

export interface NavigationRailProps {
  items: NavItem[];
}

export default function NavigationRail({ items }: NavigationRailProps) {
  return (
    <nav
      aria-label="Main navigation"
      className="w-20 bg-carbon flex flex-col items-center py-4 gap-2"
    >
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            clsx(
              'relative flex flex-col items-center justify-center w-full px-1 py-3 text-center transition-colors duration-fast ease-snap',
              isActive
                ? 'bg-gunmetal text-chrome-white border-l-[3px] border-founder-pink shadow-[inset_0_0_12px_rgba(255,43,166,0.08),0_0_8px_rgba(255,43,166,0.05)]'
                : 'bg-transparent text-text-muted border-l-[3px] border-transparent hover:bg-gunmetal'
            )
          }
        >
          <span className="text-lg">{item.icon}</span>
          <span className="text-caption mt-1 leading-tight">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
