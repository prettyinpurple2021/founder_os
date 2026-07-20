// Requirements: 4.5, 7.6, 9.1
// Bottom tab bar navigation for mobile viewports (below 1024px)

import { NavLink } from 'react-router-dom';
import clsx from 'clsx';
import type { NavItem } from './NavigationRail';

export interface MobileNavProps {
  items: NavItem[];
}

export default function MobileNav({ items }: MobileNavProps) {
  return (
    <nav
      aria-label="Mobile navigation"
      className="h-16 bg-carbon border-t border-graphite flex items-center justify-around"
    >
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            clsx(
              'relative flex flex-col items-center justify-center min-h-[44px] min-w-[44px] px-2 py-1 transition-colors duration-fast ease-snap',
              isActive
                ? 'text-founder-pink'
                : 'text-text-muted hover:text-chrome-silver'
            )
          }
        >
          {({ isActive }) => (
            <>
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-4 h-[3px] rounded-full bg-founder-pink"
                />
              )}
              <span className="text-lg">{item.icon}</span>
              <span className="text-caption mt-0.5 leading-tight">
                {item.label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
