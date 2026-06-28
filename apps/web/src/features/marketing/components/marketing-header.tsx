import Image from 'next/image';

import { ButtonLink, Container } from '../../../components/ui';
import { navItems } from '../marketing-content';

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/95 backdrop-blur-xl">
      <Container className="flex min-h-16 items-center justify-between gap-4">
        <a href="#top" className="flex items-center gap-3 font-black tracking-tight">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-primary/20 bg-accent shadow-sm">
            <Image
              src="/images/favicon-32x32.png"
              alt=""
              width={32}
              height={32}
              priority
              className="h-6 w-6"
            />
          </span>
          <span className="text-base font-black tracking-tight sm:text-lg">
            Garage<span className="text-primary">OS</span>
          </span>
        </a>

        <nav
          aria-label="Primary marketing navigation"
          className="hidden items-center gap-7 text-sm font-bold text-foreground/70 lg:flex"
        >
          {navItems.map(([label, href]) => (
            <a key={label} href={href} className="transition hover:text-foreground">
              {label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
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
            className="min-h-10 bg-gradient-to-r from-primary to-orange-500 px-4 font-black shadow-[0_14px_30px_rgb(249_115_0_/_0.22)] hover:opacity-95"
          >
            Create shop account
          </ButtonLink>
        </div>
      </Container>
    </header>
  );
}
