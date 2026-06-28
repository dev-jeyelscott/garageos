import Image from 'next/image';

import { ButtonLink, Container } from '../../../components/ui';
import { navItems } from '../marketing-content';

const accountLinks = [
  ['Create shop account', '/auth/signup-owner'],
  ['Log in', '/auth/login'],
] as const;

const footerNotes = ['Mobile-first PWA', 'Multi-branch ready', 'Role-aware workspace'] as const;

export function MarketingFooter() {
  return (
    <footer className="border-t border-border bg-card">
      <Container className="py-10 sm:py-12">
        <div className="grid gap-8 lg:grid-cols-[1.05fr_0.7fr_0.7fr_1fr]">
          <div>
            <a href="#top" className="inline-flex items-center gap-3 font-black tracking-tight">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/20 bg-accent shadow-sm">
                <Image
                  src="/images/favicon-32x32.png"
                  alt=""
                  width={32}
                  height={32}
                  className="h-6 w-6"
                />
              </span>
              <span className="text-lg font-black tracking-tight">
                Garage<span className="text-primary">OS</span>
              </span>
            </a>

            <p className="mt-4 max-w-sm text-sm leading-7 text-muted-foreground">
              A motorcycle shop management workspace for service intake, job orders, inventory,
              invoices, payments, reminders, and operational reports.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              {footerNotes.map((note) => (
                <span
                  key={note}
                  className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-black text-foreground/70"
                >
                  {note}
                </span>
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-sm font-black uppercase tracking-[0.18em] text-foreground">
              Product
            </h2>
            <div className="mt-4 grid gap-3 text-sm font-bold text-muted-foreground">
              {navItems.map(([label, href]) => (
                <a key={label} href={href} className="transition hover:text-foreground">
                  {label}
                </a>
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-sm font-black uppercase tracking-[0.18em] text-foreground">
              Account
            </h2>
            <div className="mt-4 grid gap-3 text-sm font-bold text-muted-foreground">
              {accountLinks.map(([label, href]) => (
                <a key={label} href={href} className="transition hover:text-foreground">
                  {label}
                </a>
              ))}
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-primary/20 bg-accent p-5">
            <p className="text-sm font-black text-accent-foreground">
              Bring the shop workflow into one place.
            </p>
            <p className="mt-2 text-sm leading-6 text-foreground/72">
              Start with account creation, then set up the workspace for your service team.
            </p>
            <ButtonLink
              href="/auth/signup-owner"
              size="sm"
              className="mt-5 w-full bg-primary font-black text-primary-foreground shadow-[0_12px_28px_rgb(249_115_0_/_0.18)] hover:opacity-95 sm:w-auto"
            >
              Create shop account
            </ButtonLink>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-3 border-t border-border pt-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 GarageOS. Motorcycle Shop Management System SaaS.</p>
          <p>Built for repair shops, service centers, tuning shops, and tire shops.</p>
        </div>
      </Container>
    </footer>
  );
}
