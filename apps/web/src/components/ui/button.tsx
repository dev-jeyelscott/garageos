import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import Link from 'next/link';
import type { LinkProps } from 'next/link';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';

import { cn } from './utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold no-underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 disabled:pointer-events-none disabled:opacity-60 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'border border-primary bg-primary text-primary-foreground shadow-sm hover:opacity-90',
        primary:
          'border border-primary bg-primary text-primary-foreground shadow-sm hover:opacity-90',
        secondary:
          'border border-border bg-card text-card-foreground shadow-sm hover:bg-secondary hover:text-secondary-foreground',
        outline:
          'border border-border bg-background text-foreground shadow-sm hover:bg-secondary hover:text-secondary-foreground',
        ghost:
          'border border-transparent text-foreground hover:bg-secondary hover:text-secondary-foreground',
        destructive:
          'border border-destructive bg-destructive text-destructive-foreground shadow-sm hover:opacity-90',
      },
      size: {
        sm: 'min-h-9 px-3',
        md: 'min-h-11 px-4',
        lg: 'min-h-12 px-5 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  },
);

export type ButtonVariant = Exclude<
  VariantProps<typeof buttonVariants>['variant'],
  null | undefined
>;
export type ButtonSize = Exclude<VariantProps<typeof buttonVariants>['size'], null | undefined>;

export function buttonClassName({
  variant = 'default',
  size = 'md',
  className,
}: {
  readonly variant?: ButtonVariant | undefined;
  readonly size?: ButtonSize | undefined;
  readonly className?: string | undefined;
} = {}) {
  return cn(buttonVariants({ variant, size, className }));
}

export interface ButtonProps
  extends
    ButtonHTMLAttributes<HTMLButtonElement>,
    Omit<VariantProps<typeof buttonVariants>, 'variant' | 'size'> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly asChild?: boolean;
}

export function Button({
  variant = 'default',
  size = 'md',
  className,
  type = 'button',
  asChild = false,
  ...props
}: ButtonProps) {
  if (asChild) {
    return <Slot className={buttonClassName({ variant, size, className })} {...props} />;
  }

  return (
    <button type={type} className={buttonClassName({ variant, size, className })} {...props} />
  );
}

export type ButtonLinkProps = LinkProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps | 'className' | 'href'> & {
    readonly children: ReactNode;
    readonly variant?: ButtonVariant;
    readonly size?: ButtonSize;
    readonly className?: string;
    readonly disabled?: boolean;
  };

export function ButtonLink({
  href,
  children,
  variant = 'default',
  size = 'md',
  className,
  disabled = false,
  ...props
}: ButtonLinkProps) {
  const computedClassName = buttonClassName({ variant, size, className });

  if (disabled) {
    const {
      title,
      'aria-label': ariaLabel,
      'aria-describedby': ariaDescribedBy,
      'aria-controls': ariaControls,
    } = props;

    return (
      <button
        type="button"
        className={computedClassName}
        disabled
        aria-disabled="true"
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-controls={ariaControls}
        title={title}
      >
        {children}
      </button>
    );
  }

  return (
    <Link href={href} className={computedClassName} {...props}>
      {children}
    </Link>
  );
}
