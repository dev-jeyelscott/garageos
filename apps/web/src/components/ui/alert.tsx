import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from './utils';

export type AlertVariant = 'default' | 'destructive' | 'success';

const alertVariants: Record<AlertVariant, string> = {
  default: 'border-border bg-muted text-foreground',
  destructive: 'border-destructive/30 bg-destructive/10 text-foreground',
  success: 'border-success/30 bg-success/10 text-foreground',
};

export function Alert({
  variant = 'default',
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  readonly children: ReactNode;
  readonly variant?: AlertVariant;
}) {
  return (
    <div className={cn('rounded-2xl border p-4', alertVariants[variant], className)} {...props} />
  );
}
