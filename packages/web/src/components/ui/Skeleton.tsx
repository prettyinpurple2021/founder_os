import clsx from 'clsx';

export interface SkeletonProps {
  variant: 'text' | 'card' | 'metric' | 'progress';
  lines?: number;
  className?: string;
}

const variantStyles: Record<SkeletonProps['variant'], string> = {
  text: 'h-4 w-full rounded',
  card: 'h-32 w-full rounded-lg',
  metric: 'h-10 w-24 rounded',
  progress: 'h-2 w-full rounded-full',
};

export function Skeleton({ variant, lines = 1, className }: SkeletonProps) {
  if (variant === 'text' && lines > 1) {
    return (
      <div className={clsx('flex flex-col gap-2', className)} aria-hidden="true">
        {Array.from({ length: lines }, (_, i) => (
          <div
            key={i}
            className={clsx(
              'skeleton-shimmer rounded h-4',
              i === lines - 1 ? 'w-[60%]' : 'w-full'
            )}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      aria-hidden="true"
      className={clsx('skeleton-shimmer', variantStyles[variant], className)}
    />
  );
}
