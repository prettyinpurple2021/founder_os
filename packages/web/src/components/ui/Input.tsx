import { forwardRef, useId } from 'react';
import clsx from 'clsx';

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, id: propId, className, ...props }, ref) => {
    const generatedId = useId();
    const inputId = propId || generatedId;
    const hintId = `${inputId}-hint`;
    const errorId = `${inputId}-error`;

    return (
      <div className="w-full">
        {/* Label */}
        <label
          htmlFor={inputId}
          className="block text-small text-text-secondary font-medium mb-1.5"
        >
          {label}
        </label>

        {/* Input */}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
          className={clsx(
            // Base styles
            'w-full rounded-md px-4 py-2.5',
            'bg-carbon border text-text-primary placeholder:text-text-muted',
            // Focus transition
            'motion-safe:transition-[border-color,box-shadow] motion-safe:duration-fast',
            // Focus state
            'focus:outline-none focus:border-hyper-cyan focus:ring-1 focus:ring-hyper-cyan',
            // Border: error or default
            error ? 'border-alert-red' : 'border-graphite',
            // Disabled state
            props.disabled && 'opacity-50 cursor-not-allowed',
            // User overrides
            className,
          )}
          {...props}
        />

        {/* Error message (takes precedence over hint) */}
        {error && (
          <p id={errorId} className="mt-1.5 text-caption text-alert-red" role="alert">
            {error}
          </p>
        )}

        {/* Hint text (shown only when no error) */}
        {!error && hint && (
          <p id={hintId} className="mt-1.5 text-caption text-text-muted">
            {hint}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';
