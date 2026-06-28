import type { ReactNode } from 'react';

import { Alert, cn } from '../ui';

export type OfflineReadOnlyStateProps = {
  readonly title?: string;
  readonly description?: string;
  readonly action?: ReactNode;
  readonly className?: string;
};

export function OfflineReadOnlyState({
  title = 'Offline read-only mode',
  description = 'You can review available cached information while offline, but creates, edits, approvals, uploads, payments, refunds, inventory actions, settings changes, and permission changes are unavailable until the connection is restored.',
  action,
  className,
}: OfflineReadOnlyStateProps) {
  return (
    <Alert role="status" className={cn('grid gap-3', className)}>
      <div className="grid gap-1">
        <h2 className="text-base font-bold text-foreground">{title}</h2>
        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      {action === undefined ? null : <div>{action}</div>}
    </Alert>
  );
}
