import { forwardRef } from 'react';
import clsx from 'clsx';

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant: 'primary' | 'secondary' | 'tertiary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
}

const variantStyles: Record<ButtonProps['variant'], string> = {
  primary: clsx(
    'bg-founder-pink text-chrome-white border border-founder-pink/20 shadow-glow-pink',
    'hover:bg-neon-magenta hover:shadow-glow-pink',
    'active:translate-y-px active:scale-[0.985]',
  ),
  secondary: clsx(
    'bg-gunmetal text-chrome-silver border border-graphite',
    'hover:bg-graphite hover:border-dark-chrome',
    'active:translate-y-px active:scale-[0.985]',
  ),
  tertiary: clsx(
    'bg-transparent text-text-secondary border-none',
    'hover:text-text-primary hover:bg-gunmetal/50',
    'active:translate-y-px active:scale-[0.985]',
  ),
  danger: clsx(
    'bg-alert-red/10 text-alert-red border border-alert-red/30',
    'hover:bg-alert-red/20 hover:border-alert-red/50',
    'active:translate-y-px active:scale-[0.985]',
  ),
};

const sizeStyles: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'px-3 py-1.5 text-small',
  md: 'px-4 py-2 text-body',
  lg: 'px-6 py-3 text-body-l',
};

const Spinner = () => (
  <svg
    className="animate-spin h-4 w-4 text-current"
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <circle
      className="opacity-25"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="4"
    />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant,
      size = 'md',
      loading = false,
      icon,
      disabled,
      className,
      children,
      ...props
    },
    ref,
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        className={clsx(
          // Base styles
          'inline-flex items-center justify-center gap-2 rounded-md font-medium',
          'motion-safe:transition-[transform,box-shadow,background-color,border-color,opacity]',
          'motion-safe:duration-fast motion-safe:ease-snap',
          // Focus ring
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hyper-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-carbon',
          // Variant styles
          variantStyles[variant],
          // Size styles
          sizeStyles[size],
          // Disabled state
          isDisabled && 'opacity-50 cursor-not-allowed pointer-events-none',
          // User overrides
          className,
        )}
        {...props}
      >
        {loading && <Spinner />}
        {!loading && icon && <span className="flex-shrink-0">{icon}</span>}
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';
