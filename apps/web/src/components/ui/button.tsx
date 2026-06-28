import Link from 'next/link';
import type { LinkProps } from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cn } from './utils';

export type ButtonVariant =
  | 'default'
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

const buttonVariants: Record<ButtonVariant, string> = {
  default:
    'border border-primary bg-primary text-primary-foreground shadow-sm hover:opacity-90 focus-visible:outline-ring',
  primary:
    'border border-primary bg-primary text-primary-foreground shadow-sm hover:opacity-90 focus-visible:outline-ring',
  secondary:
    'border border-border bg-card text-card-foreground shadow-sm hover:bg-secondary focus-visible:outline-ring',
  outline:
    'border border-border bg-background text-foreground shadow-sm hover:bg-secondary focus-visible:outline-ring',
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
  variant = 'default',
  size = 'md',
  className,
}: {
  readonly variant?: ButtonVariant | undefined;
  readonly size?: ButtonSize | undefined;
  readonly className?: string | undefined;
} = {}) {
  return cn(
    'inline-flex items-center justify-center rounded-xl font-semibold no-underline transition disabled:pointer-events-none disabled:opacity-60',
    buttonVariants[variant],
    buttonSizes[size],
    className,
  );
}

export function Button({
  variant = 'default',
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
  variant = 'default',
  size = 'md',
  className,
  ...props
}: LinkProps & {
  readonly children: ReactNode;
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly className?: string;
}) {
  return (
    <Link href={href} className={buttonClassName({ variant, size, className })} {...props}>
      {children}
    </Link>
  );
}
