import Link from 'next/link';
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
type ButtonSize = 'sm' | 'md' | 'lg';

export function cn(...classes: ReadonlyArray<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    'border border-primary bg-primary text-primary-foreground shadow-sm hover:opacity-90 focus-visible:outline-ring',
  secondary:
    'border border-border bg-card text-card-foreground shadow-sm hover:bg-secondary focus-visible:outline-ring',
  ghost: 'border border-transparent text-foreground hover:bg-secondary focus-visible:outline-ring',
  destructive:
    'border border-destructive bg-destructive text-destructive-foreground shadow-sm hover:opacity-90 focus-visible:outline-ring',
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: 'min-h-9 px-3 text-sm',
  md: 'min-h-11 px-4 text-sm',
  lg: 'min-h-12 px-5 text-base',
};

export function buttonClassName({
  variant = 'primary',
  size = 'md',
  className,
}: {
  readonly variant?: ButtonVariant | undefined;
  readonly size?: ButtonSize | undefined;
  readonly className?: string | undefined;
} = {}) {
  return cn(
    'inline-flex items-center justify-center rounded-xl font-semibold transition disabled:pointer-events-none disabled:opacity-60',
    buttonVariants[variant],
    buttonSizes[size],
    className,
  );
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
}) {
  return (
    <button type={type} className={buttonClassName({ variant, size, className })} {...props} />
  );
}

export function ButtonLink({
  href,
  children,
  variant = 'primary',
  size = 'md',
  className,
}: {
  readonly href: string;
  readonly children: ReactNode;
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly className?: string;
}) {
  return (
    <Link href={href} className={buttonClassName({ variant, size, className })}>
      {children}
    </Link>
  );
}

export function Card({
  className,
  ...props
}: HTMLAttributes<HTMLElement> & {
  readonly children: ReactNode;
}) {
  return (
    <section
      className={cn(
        'rounded-2xl border border-border bg-card text-card-foreground shadow-sm',
        className,
      )}
      {...props}
    />
  );
}

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

export function Container({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  readonly children: ReactNode;
}) {
  return (
    <div className={cn('mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8', className)} {...props} />
  );
}
