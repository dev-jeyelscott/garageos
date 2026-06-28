import Image from 'next/image';

import { ButtonLink, Container } from '../../../components/ui';
import { navItems, trustItems } from '../marketing-content';
import { MarketingIcon } from '../marketing-icons';

const accountLinks = [
  ['Create shop account', '/auth/signup-owner'],
  ['Log in', '/auth/login'],
] as const;

const footerTrustItems = trustItems.slice(0, 3);

export function MarketingFooter() {
  return (
    <footer className="border-t border-border bg-card">
      <Container className="py-10 sm:py-12">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr_0.82fr] lg:items-start">
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

            <div className="mt-5 grid gap-2 sm:grid-cols-3 lg:max-w-xl">
              {footerTrustItems.map((item) => (
                <div
                  key={item.title}
                  className="flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2 text-xs font-black text-foreground/76"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
                    <MarketingIcon name={item.icon} className="h-4 w-4" />
                  </span>
                  {item.title}
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <FooterLinkGroup title="Product" links={navItems} />
            <FooterLinkGroup title="Account" links={accountLinks} />
          </div>

          <div className="rounded-[1.5rem] border border-border bg-background p-5 shadow-[0_16px_48px_rgb(24_24_27_/_0.05)]">
            <p className="text-sm font-black text-foreground">Bring the shop workflow together.</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Start with account setup, then configure the workspace around daily motorcycle service
              operations.
            </p>
            <ButtonLink
              href="/auth/signup-owner"
              size="sm"
              className="mt-4 w-full font-black shadow-[0_14px_30px_rgb(249_115_0_/_0.18)]"
            >
              Create shop account
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

function FooterLinkGroup({
  title,
  links,
}: {
  readonly title: string;
  readonly links: readonly (readonly [string, string])[];
}) {
  return (
    <div>
      <p className="text-sm font-black uppercase tracking-[0.18em] text-foreground">{title}</p>
      <div className="mt-4 grid gap-3 text-sm font-bold text-muted-foreground">
        {links.map(([label, href]) => (
          <a key={label} href={href} className="transition hover:text-foreground">
            {label}
          </a>
        ))}
      </div>
    </div>
  );
}
