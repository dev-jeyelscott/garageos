import type { ReactNode } from 'react';

import { Card, CardContent, cn } from '../ui';

export type EmptyStateProps = {
  readonly title: string;
  readonly description?: string;
  readonly action?: ReactNode;
  readonly icon?: ReactNode;
  readonly className?: string;
};

export function EmptyState({ title, description, action, icon, className }: EmptyStateProps) {
  return (
    <Card className={cn('text-center', className)}>
      <CardContent className="grid justify-items-center gap-3 p-6 sm:p-8">
        {icon === undefined ? null : <div className="text-muted-foreground">{icon}</div>}
        <div className="grid gap-1">
          <h2 className="text-lg font-bold text-foreground">{title}</h2>
          {description === undefined ? null : (
            <p className="max-w-xl text-sm leading-6 text-muted-foreground">{description}</p>
          )}
        </div>
        {action === undefined ? null : <div className="mt-2">{action}</div>}
      </CardContent>
    </Card>
  );
}
