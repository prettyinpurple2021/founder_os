import clsx from 'clsx';

export interface DiamondEdgePanelProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * The signature LaunchChrome™ panel component featuring:
 * - Carbon Black body with chrome border frame
 * - CSS clip-path for angular (diamond-cut) corners
 * - Left-edge Launch Lime glow and right-edge Founder Pink glow
 * - Chrome-sweep hover effect with reduced-motion suppression
 *
 * Requirements: 5.3, 8.1
 */
export function DiamondEdgePanel({ children, className }: DiamondEdgePanelProps) {
  return (
    <div
      className={clsx(
        'diamond-edge-panel chrome-sweep relative shadow-panel',
        className,
      )}
    >
      {/* Left-edge Launch Lime glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(90deg, rgba(183, 255, 42, 0.08) 0%, transparent 40%)',
          clipPath:
            'polygon(12px 0, calc(100% - 12px) 0, 100% 12px, 100% calc(100% - 12px), calc(100% - 12px) 100%, 12px 100%, 0 calc(100% - 12px), 0 12px)',
        }}
        aria-hidden="true"
      />
      {/* Right-edge Founder Pink glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(270deg, rgba(255, 43, 166, 0.08) 0%, transparent 40%)',
          clipPath:
            'polygon(12px 0, calc(100% - 12px) 0, 100% 12px, 100% calc(100% - 12px), calc(100% - 12px) 100%, 12px 100%, 0 calc(100% - 12px), 0 12px)',
        }}
        aria-hidden="true"
      />
      {/* Content */}
      <div className="relative z-10">{children}</div>
    </div>
  );
}
