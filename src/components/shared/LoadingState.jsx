import React from 'react';

const SIZE_CLASS = {
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
};

const HEIGHT_CLASS = {
  panel: 'h-96',
  screen: 'h-screen',
};

export default function LoadingState({
  label,
  size = 'sm',
  variant = 'panel',
  className = '',
  style,
}) {
  const containerClass = variant === 'fullscreen'
    ? 'fixed inset-0 flex items-center justify-center bg-background'
    : `flex items-center justify-center ${HEIGHT_CLASS[variant] || HEIGHT_CLASS.panel}`;
  const spinnerClass = `${SIZE_CLASS[size] || SIZE_CLASS.sm} border-2 border-primary border-t-transparent rounded-full animate-spin`;

  return (
    <div className={`${containerClass} ${className}`.trim()} style={style}>
      {label ? (
        <div className="flex flex-col items-center gap-4">
          <div className={spinnerClass} />
          <span className="text-sm text-muted-foreground">{label}</span>
        </div>
      ) : (
        <div className={spinnerClass} />
      )}
    </div>
  );
}
