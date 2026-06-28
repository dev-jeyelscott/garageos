import { Badge, ButtonLink, Container } from '../../../components/ui';
import { heroProofPoints } from '../marketing-content';
import { MarketingIcon } from '../marketing-icons';
import { DashboardMockup } from './dashboard-mockup';

export function MarketingHero() {
  return (
    <section id="top" className="relative isolate overflow-hidden bg-background">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_16%_10%,rgb(255_244_230)_0,transparent_32%),linear-gradient(180deg,rgb(255_255_255)_0%,rgb(var(--background))_64%,rgb(var(--muted))_100%)]" />
      <div className="absolute right-[-9rem] top-24 -z-10 hidden h-[32rem] w-[32rem] rounded-full bg-primary/10 blur-3xl lg:block" />
      <div className="absolute left-[-12rem] top-[30rem] -z-10 hidden h-[24rem] w-[24rem] rounded-full bg-orange-200/20 blur-3xl lg:block" />

      <Container className="grid gap-12 pb-16 pt-10 lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:pb-24 lg:pt-20">
        <div className="max-w-2xl">
          <Badge className="border-primary/20 bg-accent px-4 py-2 text-sm font-black text-accent-foreground shadow-sm">
            <span className="mr-2 inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
            Built for motorcycle service shops
          </Badge>

          <h1 className="mt-6 text-4xl font-black leading-[0.96] tracking-tight text-zinc-950 sm:text-6xl lg:text-7xl">
            Keep every job, part, and payment
            <span className="block text-primary">under control.</span>
          </h1>

          <p className="mt-6 max-w-2xl text-lg font-bold leading-8 text-zinc-800 sm:text-xl sm:leading-9">
            GarageOS gives motorcycle repair teams one mobile-first workspace for intake, job
            orders, mechanic work, inventory, invoices, payments, reminders, and reports.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <ButtonLink
              href="/auth/signup-owner"
              size="lg"
              className="w-full bg-gradient-to-r from-primary to-orange-500 px-6 font-black shadow-[0_18px_35px_rgb(249_115_0_/_0.28)] hover:opacity-95 sm:w-auto"
            >
              Create your shop account
              <span aria-hidden="true" className="ml-2">
                →
              </span>
            </ButtonLink>
            <ButtonLink
              href="#workflow"
              variant="outline"
              size="lg"
              className="w-full bg-card sm:w-auto"
            >
              See the workflow
            </ButtonLink>
          </div>

          <div className="mt-8 grid gap-3 text-sm font-bold text-foreground/70 sm:grid-cols-3">
            {['Repair shops', 'Service centers', 'Tuning + tire shops'].map((item) => (
              <div key={item} className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-primary">
                  <MarketingIcon name="checklist" className="h-3.5 w-3.5" />
                </span>
                {item}
              </div>
            ))}
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {heroProofPoints.map((point) => (
              <div
                key={point.label}
                className="rounded-2xl border border-border bg-card/80 p-4 shadow-[0_14px_40px_rgb(24_24_27_/_0.05)]"
              >
                <p className="text-lg font-black text-primary">{point.value}</p>
                <p className="mt-1 text-sm leading-6 text-foreground/68">{point.label}</p>
              </div>
            ))}
          </div>
        </div>

        <DashboardMockup />
      </Container>
    </section>
  );
}
