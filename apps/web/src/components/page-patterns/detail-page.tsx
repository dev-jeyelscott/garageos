import type { ReactNode } from 'react';

import { Card, CardContent, Skeleton, cn } from '../ui';

export type DetailPageProps = {
  readonly title: string;
  readonly description?: string;
  readonly status?: ReactNode;
  readonly metadata?: ReactNode;
  readonly actions?: ReactNode;
  readonly backAction?: ReactNode;
  readonly isLoading?: boolean;
  readonly loadingFallback?: ReactNode;
  readonly blockedState?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
};

export function DetailPage({
  title,
  description,
  status,
  metadata,
  actions,
  backAction,
  isLoading = false,
  loadingFallback,
  blockedState,
  children,
  className,
}: DetailPageProps) {
  return (
    <section className={cn('grid gap-6', className)} aria-busy={isLoading}>
      <header className="grid gap-4">
        {backAction === undefined ? null : <div>{backAction}</div>}
        <div className="grid gap-4 lg:flex lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
              {status}
            </div>
            {description === undefined ? null : (
              <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
            )}
            {metadata === undefined ? null : (
              <div className="text-sm text-muted-foreground">{metadata}</div>
            )}
          </div>
          {actions === undefined ? null : (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">{actions}</div>
          )}
        </div>
      </header>

      {blockedState === undefined ? null : <div>{blockedState}</div>}

      <div>{isLoading ? (loadingFallback ?? <DetailPageSkeleton />) : children}</div>
    </section>
  );
}

function DetailPageSkeleton() {
  return (
    <Card>
      <CardContent className="grid gap-4 p-4 sm:p-6">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </CardContent>
    </Card>
  );
}
