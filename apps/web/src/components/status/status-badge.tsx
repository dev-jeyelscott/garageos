import { Badge, cn } from '../ui';

export type StatusBadgeVariant =
  | 'neutral'
  | 'success'
  | 'warning'
  | 'destructive'
  | 'info'
  | 'muted';

export type StatusBadgeProps = {
  readonly label: string;
  readonly variant?: StatusBadgeVariant;
  readonly className?: string;
  readonly title?: string;
  readonly 'aria-label'?: string;
};

const statusBadgeVariants: Record<StatusBadgeVariant, string> = {
  neutral: 'border-border bg-secondary text-secondary-foreground',
  success: 'border-success/30 bg-success/10 text-foreground',
  warning: 'border-warning/30 bg-warning/10 text-foreground',
  destructive: 'border-destructive/30 bg-destructive/10 text-foreground',
  info: 'border-info/30 bg-info/10 text-foreground',
  muted: 'border-border bg-muted text-muted-foreground',
};

export function StatusBadge({
  label,
  variant = 'neutral',
  className,
  title,
  'aria-label': ariaLabel,
}: StatusBadgeProps) {
  return (
    <Badge
      className={cn(
        'min-h-7 max-w-full whitespace-normal text-left leading-4',
        statusBadgeVariants[variant],
        className,
      )}
      title={title}
      aria-label={ariaLabel}
    >
      {label}
    </Badge>
  );
}
