import clsx from 'clsx';

export interface ProgressRailProps {
  value: number; // 0-100
  label?: string;
  showPercentage?: boolean;
  className?: string;
}

export function ProgressRail({
  value,
  label,
  showPercentage,
  className,
}: ProgressRailProps) {
  const clampedValue = Math.min(100, Math.max(0, value));

  return (
    <div className={clsx('w-full', className)}>
      {(label || showPercentage) && (
        <div className="flex items-center justify-between mb-2">
          {label && (
            <span className="text-small text-text-secondary">{label}</span>
          )}
          {showPercentage && (
            <span className="text-small text-text-primary font-medium tabular-nums">
              {Math.round(clampedValue)}%
            </span>
          )}
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={clampedValue}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label || undefined}
        className="bg-graphite rounded-full h-2 overflow-hidden"
      >
        <div
          className={clsx(
            'bg-launch-lime rounded-full h-full shadow-glow-lime',
            'motion-safe:animate-charge motion-reduce:animate-none',
          )}
          style={
            {
              '--charge-target': `${clampedValue}%`,
              width: `${clampedValue}%`,
            } as React.CSSProperties
          }
        />
      </div>
    </div>
  );
}
