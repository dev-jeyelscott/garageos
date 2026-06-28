import { Badge, ButtonLink, Container } from '../../../components/ui';
import { MarketingIcon } from '../marketing-icons';
import { DashboardMockup } from './dashboard-mockup';

export function MarketingHero() {
  return (
    <section id="top" className="relative isolate overflow-hidden bg-background">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_18%_12%,rgb(255_244_230)_0,transparent_34%),linear-gradient(180deg,rgb(255_255_255)_0%,rgb(var(--background))_68%,rgb(var(--muted))_100%)]" />
      <div className="absolute right-[-9rem] top-24 -z-10 hidden h-[32rem] w-[32rem] rounded-full bg-primary/10 blur-3xl lg:block" />
      <div className="absolute left-[-12rem] top-[30rem] -z-10 hidden h-[24rem] w-[24rem] rounded-full bg-orange-200/25 blur-3xl lg:block" />

      <Container className="grid gap-10 pb-14 pt-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:pb-20 lg:pt-16">
        <div className="max-w-2xl">
          <Badge className="border-primary/20 bg-accent px-4 py-2 text-sm font-bold text-accent-foreground shadow-sm">
            <span className="mr-2 inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
            Motorcycle Shop Management SaaS
          </Badge>

          <h1 className="mt-6 text-4xl font-black leading-[0.96] tracking-tight text-foreground sm:text-6xl lg:text-7xl">
            Run your shop{' '}
            <span className="block bg-gradient-to-r from-primary via-orange-400 to-amber-300 bg-clip-text text-transparent">
              faster, cleaner, and smarter.
            </span>
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">
            GarageOS helps motorcycle repair shops manage customers, motorcycles, job orders,
            inventory, invoices, payments, reminders, and reports from one mobile-first workspace.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <ButtonLink
              href="/auth/signup-owner"
              size="lg"
              className="bg-gradient-to-r from-primary to-orange-500 px-6 shadow-[0_18px_35px_rgb(249_115_0_/_0.28)] hover:opacity-95"
            >
              Start Owner Signup
              <span aria-hidden="true" className="ml-2">
                →
              </span>
            </ButtonLink>
            <ButtonLink href="#features" variant="outline" size="lg" className="bg-card">
              View Features
            </ButtonLink>
          </div>

          <div className="mt-8 grid gap-3 text-sm font-semibold text-muted-foreground sm:grid-cols-3">
            {['Repair shops', 'Service centers', 'Tuning + tire shops'].map((item) => (
              <div key={item} className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-primary">
                  <MarketingIcon name="checklist" className="h-3.5 w-3.5" />
                </span>
                {item}
              </div>
            ))}
          </div>
        </div>

        <DashboardMockup />
      </Container>
    </section>
  );
}
