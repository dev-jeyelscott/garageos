import type { ReactNode } from 'react';

import { Card, CardContent, CardHeader, Skeleton, cn } from '../ui';

export type ListPageProps = {
  readonly title: string;
  readonly description?: string;
  readonly actions?: ReactNode;
  readonly filters?: ReactNode;
  readonly toolbar?: ReactNode;
  readonly isLoading?: boolean;
  readonly loadingFallback?: ReactNode;
  readonly emptyState?: ReactNode;
  readonly blockedState?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
};

export function ListPage({
  title,
  description,
  actions,
  filters,
  toolbar,
  isLoading = false,
  loadingFallback,
  emptyState,
  blockedState,
  children,
  className,
}: ListPageProps) {
  return (
    <section className={cn('grid gap-6', className)} aria-busy={isLoading}>
      <header className="grid gap-4 sm:flex sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
          {description === undefined ? null : (
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
          )}
        </div>
        {actions === undefined ? null : (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">{actions}</div>
        )}
      </header>

      {blockedState === undefined ? null : <div>{blockedState}</div>}

      {filters === undefined && toolbar === undefined ? null : (
        <Card>
          <CardHeader className="gap-4 p-4 sm:p-6">
            {filters === undefined ? null : <div className="grid gap-3">{filters}</div>}
            {toolbar === undefined ? null : (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                {toolbar}
              </div>
            )}
          </CardHeader>
        </Card>
      )}

      <div>
        {isLoading ? (loadingFallback ?? <ListPageSkeleton />) : (children ?? emptyState ?? null)}
      </div>
    </section>
  );
}

function ListPageSkeleton() {
  return (
    <Card>
      <CardContent className="grid gap-3 p-4 sm:p-6">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-3/4" />
      </CardContent>
    </Card>
  );
}
