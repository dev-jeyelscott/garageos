import type { ReactNode } from 'react';

import { Alert, cn } from '../ui';

export type ForbiddenStateProps = {
  readonly title: string;
  readonly description?: string;
  readonly requestMetadata?: ReactNode;
  readonly action?: ReactNode;
  readonly className?: string;
};

export function ForbiddenState({
  title,
  description,
  requestMetadata,
  action,
  className,
}: ForbiddenStateProps) {
  return (
    <Alert role="status" className={cn('grid gap-3', className)}>
      <div className="grid gap-1">
        <h2 className="text-base font-bold text-foreground">{title}</h2>
        {description === undefined ? null : (
          <p className="text-sm leading-6 text-muted-foreground">{description}</p>
        )}
      </div>
      {requestMetadata === undefined ? null : <div>{requestMetadata}</div>}
      {action === undefined ? null : <div>{action}</div>}
    </Alert>
  );
}
