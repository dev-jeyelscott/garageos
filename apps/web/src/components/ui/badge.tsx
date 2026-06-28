import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from './utils';

export function Badge({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  readonly children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border border-border bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground',
        className,
      )}
      {...props}
    />
  );
}
