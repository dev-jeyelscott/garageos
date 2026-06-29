import Image from 'next/image';
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
import { MarketingHeader } from '../../marketing/components/marketing-header';

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
    <div className="min-h-dvh bg-background text-foreground">
      <MarketingHeader />

      <main className="relative isolate overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-20 bg-[linear-gradient(145deg,rgb(255_255_255)_0%,rgb(var(--background))_44%,rgb(var(--muted))_100%)] dark:bg-[linear-gradient(145deg,rgb(var(--background))_0%,rgb(var(--background))_54%,rgb(var(--muted))_100%)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-40 top-16 -z-10 h-72 w-72 rounded-full bg-primary/10 blur-3xl sm:h-96 sm:w-96"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-36 bottom-10 -z-10 h-72 w-72 rounded-full bg-accent/70 blur-3xl sm:h-96 sm:w-96"
        />

        <Container className="relative flex min-h-[calc(100dvh-4rem)] max-w-7xl items-center py-5 sm:py-8 lg:py-10">
          <div className="grid w-full gap-5 lg:grid-cols-[minmax(0,0.92fr)_minmax(440px,0.78fr)] lg:items-center xl:gap-8">
            <aside className="relative hidden overflow-hidden rounded-[2rem] border border-border/80 bg-card/90 p-7 text-card-foreground shadow-[0_24px_70px_rgb(15_23_42_/_0.08)] backdrop-blur lg:block lg:min-h-[640px] lg:p-9">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgb(var(--primary)_/_0.16),transparent_32%),linear-gradient(135deg,rgb(var(--accent)_/_0.82),rgb(var(--card)_/_0.92)_48%,rgb(var(--background)_/_0.86))]"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-24 top-16 h-64 w-64 rounded-full border-[18px] border-primary/10"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -bottom-10 left-10 h-40 w-40 rounded-full bg-primary/10 blur-2xl"
              />

              <div className="relative z-10 flex h-full min-h-[560px] flex-col items-center justify-center text-center">
                <Link
                  href="/"
                  aria-label="GarageOS home"
                  className="group inline-flex flex-col items-center gap-6 no-underline"
                >
                  <Image
                    src="/images/logo-with-garageos-text.png"
                    alt=""
                    width={520}
                    height={220}
                    priority
                    className="h-auto w-full max-w-[25rem] object-contain drop-shadow-sm transition duration-300 group-hover:scale-[1.01]"
                  />

                  <span className="max-w-sm text-base font-semibold leading-7 text-muted-foreground">
                    Run your motorcycle shop from one clear workspace.
                  </span>
                </Link>
              </div>
            </aside>

            <section className="flex items-center">
              <Card className="w-full overflow-hidden rounded-[2rem] border-border/80 bg-card/95 shadow-[0_24px_70px_rgb(15_23_42_/_0.10)] backdrop-blur">
                <CardHeader className="border-b border-border/70 bg-background/35">
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-muted-foreground">
                    GarageOS account
                  </p>
                  <CardTitle className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
                    {title}
                  </CardTitle>
                  <CardDescription className="mt-3 max-w-xl">{description}</CardDescription>
                </CardHeader>

                <CardContent className="space-y-6">
                  {children}

                  {secondaryActions === undefined ? null : (
                    <nav
                      aria-label="Related auth actions"
                      className="flex flex-wrap gap-3 border-t border-border pt-5 text-sm"
                    >
                      {secondaryActions}
                    </nav>
                  )}
                </CardContent>
              </Card>
            </section>
          </div>
        </Container>
      </main>
    </div>
  );
}

export const styles = {
  form: 'grid gap-4',
  field: 'grid gap-2',
  label: 'text-sm font-bold text-foreground',
  checkboxLabel:
    'flex min-h-12 items-center gap-3 rounded-2xl border border-border bg-background/80 px-4 text-sm font-semibold text-muted-foreground shadow-sm transition focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20',
  checkboxControl:
    'h-4 w-4 rounded border-input accent-primary focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60',
  buttonRow:
    'grid gap-3 sm:flex sm:flex-wrap [&>a]:w-full [&>button]:w-full sm:[&>a]:w-auto sm:[&>button]:w-auto',
  link: 'inline-flex min-h-11 items-center rounded-xl border border-border bg-background px-3 text-sm font-semibold text-foreground no-underline shadow-sm transition hover:border-primary/30 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
  infoPanel: 'border-primary/20 bg-accent/45 shadow-sm',
  statusPanel: 'shadow-sm',
  statusText: 'text-sm leading-6 text-muted-foreground',
  panelTitle: 'mb-2 text-base font-bold text-foreground',
  paragraph: 'mb-2 text-sm leading-6 text-muted-foreground',
  helpPanel: 'rounded-2xl border border-dashed border-primary/30 bg-accent/55 p-4',
  helpTitle: 'mb-2 text-sm font-bold text-foreground',
  helpList: 'm-0 grid list-none gap-2 p-0 text-sm text-muted-foreground',
  detailList: 'mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground',
  sessionGrid: 'grid gap-4',
  keyValue: 'grid gap-1 border-b border-border py-2 sm:grid-cols-[180px_1fr] sm:gap-3',
  key: 'text-sm font-bold text-muted-foreground',
  value: 'break-words text-sm text-foreground',
  permissionList: 'mt-2 flex list-none flex-wrap gap-2 p-0',
  permissionBadge:
    'rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-card-foreground',
} as const;
