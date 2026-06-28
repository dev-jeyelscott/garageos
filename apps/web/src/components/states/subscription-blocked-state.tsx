import type { ReactNode } from 'react';

import { Alert, cn } from '../ui';

export type SubscriptionBlockedStateProps = {
  readonly title: string;
  readonly description?: string;
  readonly action?: ReactNode;
  readonly support?: ReactNode;
  readonly className?: string;
};

export function SubscriptionBlockedState({
  title,
  description,
  action,
  support,
  className,
}: SubscriptionBlockedStateProps) {
  return (
    <Alert role="status" className={cn('grid gap-3', className)}>
      <div className="grid gap-1">
        <h2 className="text-base font-bold text-foreground">{title}</h2>
        {description === undefined ? null : (
          <p className="text-sm leading-6 text-muted-foreground">{description}</p>
        )}
      </div>
      {action === undefined ? null : <div>{action}</div>}
      {support === undefined ? null : (
        <div className="text-sm text-muted-foreground">{support}</div>
      )}
    </Alert>
  );
}
