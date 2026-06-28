import Image from 'next/image';

import { ButtonLink, Container } from '../../../components/ui';
import { navItems } from '../marketing-content';

export function MarketingFooter() {
  return (
    <footer className="border-t border-border bg-card">
      <Container className="py-10">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr_auto] lg:items-start">
          <div>
            <a href="#top" className="inline-flex items-center gap-3 font-black tracking-tight">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-primary/20 bg-accent shadow-sm">
                <Image
                  src="/images/favicon-32x32.png"
                  alt=""
                  width={32}
                  height={32}
                  className="h-6 w-6"
                />
              </span>
              <span className="text-base font-black tracking-tight sm:text-lg">
                Garage<span className="text-primary">OS</span>
              </span>
            </a>

            <p className="mt-4 max-w-xl text-sm leading-7 text-muted-foreground">
              A mobile-first motorcycle shop workspace for service intake, job orders, inventory,
              invoices, payments, reminders, reports, and operational visibility.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.18em] text-foreground">
                Product
              </p>
              <div className="mt-4 grid gap-3 text-sm font-bold text-muted-foreground">
                {navItems.map(([label, href]) => (
                  <a key={label} href={href} className="transition hover:text-foreground">
                    {label}
                  </a>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-black uppercase tracking-[0.18em] text-foreground">
                Account
              </p>
              <div className="mt-4 grid gap-3 text-sm font-bold text-muted-foreground">
                <a href="/auth/signup-owner" className="transition hover:text-foreground">
                  Create shop account
                </a>
                <a href="/auth/login" className="transition hover:text-foreground">
                  Log in
                </a>
              </div>
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-border bg-background p-5 shadow-[0_16px_48px_rgb(24_24_27_/_0.05)]">
            <p className="text-sm font-black text-foreground">Bring the shop workflow together.</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Start with account setup, then configure the workspace for daily operations.
            </p>
            <ButtonLink
              href="/auth/signup-owner"
              size="sm"
              className="mt-4 w-full bg-gradient-to-r from-primary to-orange-500 font-black shadow-[0_14px_30px_rgb(249_115_0_/_0.2)] hover:opacity-95"
            >
              Create account
            </ButtonLink>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-3 border-t border-border pt-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>GarageOS — Motorcycle Shop Management System SaaS</p>
          <p>Built for motorcycle service operations.</p>
        </div>
      </Container>
    </footer>
  );
}
