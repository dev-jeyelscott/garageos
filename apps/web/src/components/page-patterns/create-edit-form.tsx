import type { FormEventHandler, ReactNode } from 'react';

import { Card, CardContent, CardHeader, cn } from '../ui';

export type CreateEditFormProps = {
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
  readonly errorSummary?: ReactNode;
  readonly requestMetadata?: ReactNode;
  readonly actions?: ReactNode;
  readonly isSubmitting?: boolean;
  readonly isReadOnly?: boolean;
  readonly onSubmit?: FormEventHandler<HTMLFormElement>;
  readonly className?: string;
};

export function CreateEditForm({
  title,
  description,
  children,
  errorSummary,
  requestMetadata,
  actions,
  isSubmitting = false,
  isReadOnly = false,
  onSubmit,
  className,
}: CreateEditFormProps) {
  return (
    <form
      className={cn('grid gap-6', className)}
      onSubmit={onSubmit}
      aria-busy={isSubmitting}
      aria-readonly={isReadOnly}
    >
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
          {description === undefined ? null : (
            <p className="text-sm leading-6 text-muted-foreground">{description}</p>
          )}
        </CardHeader>
        <CardContent className="grid gap-5 p-4 pt-0 sm:p-6 sm:pt-0">
          {errorSummary === undefined ? null : (
            <div id="form-error-summary" role="alert">
              {errorSummary}
            </div>
          )}
          <fieldset
            className="grid gap-5 disabled:opacity-70"
            disabled={isSubmitting || isReadOnly}
          >
            {children}
          </fieldset>
          {requestMetadata === undefined ? null : <div>{requestMetadata}</div>}
        </CardContent>
      </Card>

      {actions === undefined ? null : (
        <div className="sticky bottom-0 z-10 -mx-4 border-t border-border bg-background/95 p-4 backdrop-blur sm:static sm:mx-0 sm:flex sm:justify-end sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-0">
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">{actions}</div>
        </div>
      )}
    </form>
  );
}
