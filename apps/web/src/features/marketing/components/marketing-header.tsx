import Image from 'next/image';

import { ButtonLink, Container } from '../../../components/ui';
import { navItems } from '../marketing-content';

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/90 shadow-[0_1px_0_rgb(255_255_255_/_0.75)] backdrop-blur-xl">
      <Container className="flex min-h-16 items-center justify-between gap-4 py-2">
        <a href="#top" className="group flex items-center gap-3 font-black tracking-tight">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-primary/20 bg-accent shadow-sm transition group-hover:border-primary/35">
            <Image
              src="/images/favicon-32x32.png"
              alt=""
              width={32}
              height={32}
              priority
              className="h-6 w-6"
            />
          </span>
          <span>
            <span className="block text-base font-black tracking-tight sm:text-lg">
              Garage<span className="text-primary">OS</span>
            </span>
            <span className="hidden text-xs font-bold text-muted-foreground xl:block">
              Motorcycle shop operations
            </span>
          </span>
        </a>

        <nav
          aria-label="Primary marketing navigation"
          className="hidden items-center rounded-full border border-border bg-card/85 p-1 text-sm font-bold text-foreground/70 shadow-sm lg:flex"
        >
          {navItems.map(([label, href]) => (
            <a
              key={label}
              href={href}
              className="rounded-full px-4 py-2 transition hover:bg-accent hover:text-accent-foreground"
            >
              {label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ButtonLink
            href="#workflow"
            variant="outline"
            size="sm"
            className="hidden bg-card/80 font-bold md:inline-flex"
          >
            See workflow
          </ButtonLink>
          <ButtonLink
            href="/auth/login"
            variant="ghost"
            size="sm"
            className="hidden text-foreground/80 hover:text-foreground sm:inline-flex"
          >
            Log in
          </ButtonLink>
          <ButtonLink
            href="/auth/signup-owner"
            size="sm"
            className="min-h-10 bg-gradient-to-r from-primary to-orange-500 px-3 font-black shadow-[0_14px_30px_rgb(249_115_0_/_0.22)] hover:opacity-95 sm:px-4"
          >
            <span className="sm:hidden">Create shop</span>
            <span className="hidden sm:inline">Create shop account</span>
          </ButtonLink>
        </div>
      </Container>
    </header>
  );
}
