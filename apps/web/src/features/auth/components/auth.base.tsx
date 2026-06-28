import Link from 'next/link';
import type { ReactNode } from 'react';

import { Card, Container } from '../../../components/ui';

export function AuthPageShell({
  title,
  description,
  secondaryActions,
  children,
}: {
  readonly title: string;
  readonly description: string;
  readonly secondaryActions?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <main className="min-h-dvh bg-background py-8 text-foreground sm:py-12">
      <Container className="max-w-6xl">
        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-stretch">
          <aside className="rounded-3xl border border-border bg-accent p-8 text-accent-foreground shadow-sm">
            <Link href="/" className="inline-flex items-center gap-3 font-bold">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                G
              </span>
              <span>GarageOS</span>
            </Link>

            <div className="mt-10">
              <p className="text-sm font-bold uppercase tracking-[0.2em]">Secure shop access</p>
              <h2 className="mt-3 text-3xl font-black tracking-tight">
                Mobile-first access for documented GarageOS workflows.
              </h2>
              <p className="mt-4 text-sm leading-6">
                Authentication, email verification, password management, tenant status, permissions,
                and subscription access are resolved through the GarageOS API.
              </p>
            </div>
          </aside>

          <Card className="p-6 sm:p-8">
            <div className="mb-6">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                GarageOS
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">{title}</h1>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
            </div>

            {children}

            {secondaryActions === undefined ? null : (
              <nav
                aria-label="Related auth actions"
                className="mt-6 flex flex-wrap gap-3 border-t border-border pt-5 text-sm"
              >
                {secondaryActions}
              </nav>
            )}
          </Card>
        </div>
      </Container>
    </main>
  );
}

export const styles = {
  form: 'grid gap-4',
  field: 'grid gap-2',
  label: 'text-sm font-semibold text-foreground',
  input:
    'min-h-11 rounded-xl border border-input bg-background px-3 py-2 text-base text-foreground shadow-sm outline-none transition placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20',
  checkboxLabel: 'flex items-center gap-3 text-sm font-medium text-muted-foreground',
  primaryButton:
    'inline-flex min-h-11 items-center justify-center rounded-xl border border-primary bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:pointer-events-none disabled:opacity-60',
  secondaryButton:
    'inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-card-foreground shadow-sm transition hover:bg-secondary disabled:pointer-events-none disabled:opacity-60',
  secondaryButtonLink:
    'inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-card-foreground no-underline shadow-sm transition hover:bg-secondary',
  buttonRow: 'mt-4 flex flex-wrap gap-3',
  link: 'font-semibold text-accent-foreground underline-offset-4 hover:underline',
  infoPanel: 'mt-4 rounded-2xl border border-border bg-muted p-4',
  successPanel: 'mt-4 rounded-2xl border border-success/30 bg-success/10 p-4',
  errorPanel: 'mt-4 rounded-2xl border border-destructive/30 bg-destructive/10 p-4',
  panelTitle: 'mb-2 text-base font-bold text-foreground',
  paragraph: 'mb-2 text-sm leading-6 text-muted-foreground',
  helpPanel: 'rounded-2xl border border-dashed border-border bg-muted p-4',
  helpTitle: 'mb-2 text-sm font-bold text-foreground',
  helpList: 'm-0 list-disc space-y-1 pl-5 text-sm text-muted-foreground',
  detailList: 'mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground',
  metadataList: 'mt-3 grid grid-cols-[120px_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground',
  sessionGrid: 'grid gap-4',
  keyValue: 'grid gap-1 border-b border-border py-2 sm:grid-cols-[180px_1fr] sm:gap-3',
  key: 'text-sm font-bold text-muted-foreground',
  value: 'break-words text-sm text-foreground',
  permissionList: 'mt-2 flex list-none flex-wrap gap-2 p-0',
  permissionBadge:
    'rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-card-foreground',
} as const;
