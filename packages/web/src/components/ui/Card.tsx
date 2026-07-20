import clsx from 'clsx';

interface CardProps {
  children: React.ReactNode;
  variant?: 'default' | 'featured' | 'elevated';
  accent?: 'pink' | 'lime' | 'cyan' | 'red' | 'amber';
  className?: string;
}

const variantStyles: Record<NonNullable<CardProps['variant']>, string> = {
  default: 'bg-gunmetal border border-graphite rounded-lg p-6',
  featured: 'bg-gunmetal border border-graphite shadow-panel rounded-lg p-6',
  elevated: 'bg-graphite border border-dark-chrome rounded-lg p-6',
};

const accentStyles: Record<NonNullable<CardProps['accent']>, string> = {
  pink: 'border-l-4 border-l-founder-pink',
  lime: 'border-l-4 border-l-launch-lime',
  cyan: 'border-l-4 border-l-hyper-cyan',
  red: 'border-l-4 border-l-alert-red',
  amber: 'border-l-4 border-l-warning-amber',
};

const hoverClasses =
  'motion-safe:transition-[transform,box-shadow,border-color] motion-safe:duration-fast motion-safe:ease-snap motion-safe:hover:-translate-y-0.5 hover:border-dark-chrome/80 hover:shadow-chrome-edge';

export function Card({
  children,
  variant = 'default',
  accent,
  className,
}: CardProps) {
  return (
    <div
      className={clsx(
        variantStyles[variant],
        accent && accentStyles[accent],
        hoverClasses,
        className
      )}
    >
      {children}
    </div>
  );
}
