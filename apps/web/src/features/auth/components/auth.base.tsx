import Link from 'next/link';
import type { ReactNode } from 'react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Container,
} from '../../../components/ui';

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

          <Card>
            <CardHeader>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                GarageOS
              </p>
              <CardTitle className="mt-2 text-3xl font-black sm:text-4xl">{title}</CardTitle>
              <CardDescription className="mt-3">{description}</CardDescription>
            </CardHeader>

            <CardContent>
              {children}

              {secondaryActions === undefined ? null : (
                <nav
                  aria-label="Related auth actions"
                  className="mt-6 flex flex-wrap gap-3 border-t border-border pt-5 text-sm"
                >
                  {secondaryActions}
                </nav>
              )}
            </CardContent>
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
  checkboxLabel: 'flex items-center gap-3 text-sm font-medium text-muted-foreground',
  buttonRow: 'mt-4 flex flex-wrap gap-3',
  link: 'font-semibold text-accent-foreground underline-offset-4 hover:underline',
  infoPanel: 'mt-4',
  panelTitle: 'mb-2 text-base font-bold text-foreground',
  paragraph: 'mb-2 text-sm leading-6 text-muted-foreground',
  helpPanel: 'rounded-2xl border border-dashed border-border bg-muted p-4',
  helpTitle: 'mb-2 text-sm font-bold text-foreground',
  helpList: 'm-0 list-disc space-y-1 pl-5 text-sm text-muted-foreground',
  detailList: 'mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground',
  sessionGrid: 'grid gap-4',
  keyValue: 'grid gap-1 border-b border-border py-2 sm:grid-cols-[180px_1fr] sm:gap-3',
  key: 'text-sm font-bold text-muted-foreground',
  value: 'break-words text-sm text-foreground',
  permissionList: 'mt-2 flex list-none flex-wrap gap-2 p-0',
  permissionBadge:
    'rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-card-foreground',
} as const;
