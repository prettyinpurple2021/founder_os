import clsx from 'clsx';

export interface BadgeProps {
  children: React.ReactNode;
  color: 'lime' | 'pink' | 'cyan' | 'red' | 'amber' | 'gold' | 'chrome';
}

const colorStyles: Record<BadgeProps['color'], string> = {
  lime: 'bg-launch-lime/10 text-launch-lime',
  pink: 'bg-founder-pink/10 text-founder-pink',
  cyan: 'bg-hyper-cyan/10 text-hyper-cyan',
  red: 'bg-alert-red/10 text-alert-red',
  amber: 'bg-warning-amber/10 text-warning-amber',
  gold: 'bg-victory-gold/10 text-victory-gold',
  chrome: 'bg-chrome-steel/10 text-chrome-silver',
};

export function Badge({ children, color }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-caption font-medium',
        colorStyles[color],
      )}
    >
      {children}
    </span>
  );
}
