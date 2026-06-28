import type { ReactNode } from 'react';

import { Alert, cn } from '../ui';

export type ConflictStateProps = {
  readonly title: string;
  readonly description?: string;
  readonly requestMetadata?: ReactNode;
  readonly refreshAction?: ReactNode;
  readonly backAction?: ReactNode;
  readonly className?: string;
};

export function ConflictState({
  title,
  description,
  requestMetadata,
  refreshAction,
  backAction,
  className,
}: ConflictStateProps) {
  return (
    <Alert role="alert" className={cn('grid gap-3', className)}>
      <div className="grid gap-1">
        <h2 className="text-base font-bold text-foreground">{title}</h2>
        {description === undefined ? null : (
          <p className="text-sm leading-6 text-muted-foreground">{description}</p>
        )}
      </div>
      {requestMetadata === undefined ? null : <div>{requestMetadata}</div>}
      {refreshAction === undefined && backAction === undefined ? null : (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {refreshAction}
          {backAction}
        </div>
      )}
    </Alert>
  );
}
