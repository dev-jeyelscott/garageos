import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from './utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-border bg-secondary text-secondary-foreground',
        destructive: 'border-transparent bg-destructive text-destructive-foreground',
        outline: 'border-border bg-background text-foreground',
        success: 'border-success/30 bg-success/10 text-success',
        warning: 'border-warning/40 bg-warning/15 text-warning-foreground',
        info: 'border-info/30 bg-info/10 text-info',
        readonly: 'border-readonly/30 bg-readonly/10 text-readonly',
      },
    },
    defaultVariants: {
      variant: 'secondary',
    },
  },
);

export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>;

export function Badge({
  className,
  variant = 'secondary',
  ...props
}: HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants> & {
    readonly children: ReactNode;
  }) {
  return <span className={cn(badgeVariants({ variant, className }))} {...props} />;
}
