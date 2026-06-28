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

const authTrustPoints = [
  {
    title: 'Verified access',
    description: 'Operational screens stay gated until email verification is complete.',
  },
  {
    title: 'Tenant-aware sessions',
    description:
      'User, tenant, branch, permission, plan, and subscription context come from the API.',
  },
  {
    title: 'Safe recovery',
    description:
      'Password reset and change flows keep policy, token, and rate-limit states visible.',
  },
] as const;

const authPrinciples = [
  'Email verification before operational access',
  'Tenant lifecycle and permission gates stay backend-authoritative',
  'Password policy and token expiry errors remain explicit',
] as const;

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
    <main className="relative isolate min-h-dvh overflow-hidden bg-background text-foreground">
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgb(255_255_255)_0%,rgb(var(--background))_48%,rgb(var(--muted))_100%)] dark:bg-[linear-gradient(180deg,rgb(var(--background))_0%,rgb(var(--background))_48%,rgb(var(--muted))_100%)]"
      />
      <div
        aria-hidden="true"
        className="absolute -left-36 top-10 -z-10 h-80 w-80 rounded-full bg-primary/10 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="absolute -right-32 bottom-0 -z-10 h-96 w-96 rounded-full bg-accent blur-3xl"
      />

      <Container className="relative flex min-h-dvh max-w-7xl items-center py-5 sm:py-8 lg:py-10">
        <div className="grid w-full gap-5 lg:grid-cols-[0.95fr_1.05fr] lg:items-stretch xl:gap-8">
          <aside className="relative overflow-hidden rounded-[2rem] border border-border bg-card p-5 text-card-foreground shadow-[0_24px_80px_rgb(15_23_42_/_0.10)] sm:p-8 lg:min-h-[680px] lg:p-10">
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgb(var(--primary)_/_0.18),transparent_34%),linear-gradient(135deg,rgb(var(--accent)),rgb(var(--card))_46%,rgb(var(--background)))]"
            />
            <div
              aria-hidden="true"
              className="absolute -right-20 top-20 h-56 w-56 rounded-full border-[18px] border-primary/10"
            />
            <div
              aria-hidden="true"
              className="absolute bottom-8 right-8 hidden h-28 w-44 rounded-full border-y-[10px] border-primary/20 lg:block"
            />

            <div className="relative z-10 flex h-full flex-col">
              <Link href="/" className="inline-flex min-h-11 items-center gap-3 no-underline">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/20 bg-card shadow-sm">
                  <Image
                    src="/images/logo.png"
                    alt=""
                    width={64}
                    height={64}
                    priority
                    className="h-9 w-9 object-contain"
                  />
                </span>
                <span className="text-lg font-black tracking-tight">GarageOS</span>
              </Link>

              <div className="mt-9 max-w-2xl lg:mt-14">
                <p className="text-xs font-black uppercase tracking-[0.24em] text-accent-foreground">
                  Secure shop access
                </p>
                <h1 className="mt-4 text-3xl font-black leading-tight tracking-tight text-foreground sm:text-4xl lg:text-5xl">
                  Sign in to a workspace built for motorcycle shop operations.
                </h1>
                <p className="mt-5 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
                  GarageOS keeps authentication focused on the documented access model: verified
                  users, tenant lifecycle, branch access, permissions, and subscription state.
                </p>
              </div>

              <div className="mt-7 grid gap-3 sm:grid-cols-3 lg:mt-10 lg:grid-cols-1 xl:grid-cols-3">
                {authTrustPoints.map((item) => (
                  <section
                    key={item.title}
                    className="rounded-2xl border border-border/80 bg-card/75 p-4 shadow-sm backdrop-blur"
                  >
                    <h2 className="text-sm font-bold text-foreground">{item.title}</h2>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      {item.description}
                    </p>
                  </section>
                ))}
              </div>

              <div className="mt-auto hidden pt-8 lg:block">
                <div className="rounded-3xl border border-border/80 bg-background/70 p-5 shadow-sm backdrop-blur">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">
                    Access principles
                  </p>
                  <ul className="mt-4 grid gap-3">
                    {authPrinciples.map((principle) => (
                      <li key={principle} className="flex gap-3 text-sm text-muted-foreground">
                        <span
                          aria-hidden="true"
                          className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-black text-primary-foreground"
                        >
                          ✓
                        </span>
                        <span>{principle}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </aside>

          <section className="flex items-center">
            <Card className="w-full overflow-hidden rounded-[2rem] border-border/80 bg-card/95 shadow-[0_24px_80px_rgb(15_23_42_/_0.12)] backdrop-blur">
              <CardHeader className="border-b border-border/70">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-muted-foreground">
                  GarageOS account
                </p>
                <CardTitle className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
                  {title}
                </CardTitle>
                <CardDescription className="mt-3 max-w-xl">{description}</CardDescription>
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
          </section>
        </div>
      </Container>
    </main>
  );
}

export const styles = {
  form: 'grid gap-4',
  field: 'grid gap-2',
  label: 'text-sm font-bold text-foreground',
  checkboxLabel:
    'flex min-h-11 items-center gap-3 rounded-2xl border border-border bg-muted/70 px-3 text-sm font-semibold text-muted-foreground',
  checkboxControl:
    'h-4 w-4 rounded border-input accent-primary focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60',
  buttonRow:
    'mt-4 grid gap-3 sm:flex sm:flex-wrap [&>a]:w-full [&>button]:w-full sm:[&>a]:w-auto sm:[&>button]:w-auto',
  link: 'inline-flex min-h-11 items-center rounded-xl border border-border bg-card px-3 text-sm font-semibold text-foreground no-underline shadow-sm transition hover:border-primary/30 hover:bg-accent hover:text-accent-foreground',
  infoPanel: 'mt-4 border-primary/20 shadow-sm',
  statusPanel: 'mt-4 shadow-sm',
  statusText: 'text-sm leading-6 text-muted-foreground',
  panelTitle: 'mb-2 text-base font-bold text-foreground',
  paragraph: 'mb-2 text-sm leading-6 text-muted-foreground',
  helpPanel: 'rounded-2xl border border-dashed border-primary/30 bg-accent/60 p-4',
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
