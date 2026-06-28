import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from './utils';

export function Card({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  readonly children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-border bg-card text-card-foreground shadow-sm',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  readonly children: ReactNode;
}) {
  return <div className={cn('grid gap-1.5 p-6 sm:p-8', className)} {...props} />;
}

export function CardTitle({
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement> & {
  readonly children: ReactNode;
}) {
  return (
    <h2 className={cn('text-lg font-bold tracking-tight text-foreground', className)} {...props} />
  );
}

export function CardDescription({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement> & {
  readonly children: ReactNode;
}) {
  return <p className={cn('text-sm leading-6 text-muted-foreground', className)} {...props} />;
}

export function CardContent({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  readonly children: ReactNode;
}) {
  return <div className={cn('p-6 pt-0 sm:p-8 sm:pt-0', className)} {...props} />;
}

export function CardFooter({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  readonly children: ReactNode;
}) {
  return <div className={cn('flex items-center gap-3 p-6 pt-0', className)} {...props} />;
}
