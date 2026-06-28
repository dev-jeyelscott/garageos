import { Card, Container } from '../../../components/ui';
import { features, operationalProofPoints } from '../marketing-content';
import { MarketingIcon } from '../marketing-icons';
import { SectionHeading } from './section-heading';

export function FeatureGrid() {
  const featuredFeatures = features.slice(0, 2);
  const supportingFeatures = features.slice(2);

  return (
    <section id="features" className="bg-background py-14 sm:py-20">
      <Container>
        <div
          id="product"
          className="grid gap-8 rounded-[2rem] border border-border bg-card p-6 shadow-[0_24px_80px_rgb(24_24_27_/_0.08)] sm:p-9 lg:grid-cols-[0.82fr_1.18fr] lg:items-center"
        >
          <div>
            <p className="text-sm font-black uppercase tracking-[0.2em] text-primary">
              Connected operations
            </p>
            <h2 className="mt-3 text-4xl font-black tracking-tight text-foreground sm:text-5xl">
              Replace counter chaos with one clean shop workflow.
            </h2>
          </div>
          <div>
            <p className="text-lg leading-8 text-foreground/72">
              GarageOS connects service intake, repair tracking, branch stock, billing, reminders,
              and reporting so the team can see what is happening without chasing paper,
              spreadsheets, or scattered messages.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {operationalProofPoints.map((point) => (
                <div key={point.value} className="rounded-2xl bg-muted p-4">
                  <p className="font-black text-primary">{point.value}</p>
                  <p className="mt-1 text-sm leading-6 text-foreground/68">{point.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <SectionHeading
          eyebrow="Core features"
          title="The daily shop work stays connected."
          description="From the first customer conversation to stock usage, invoice balance, receipt history, and management reports, each module supports a real shop-floor workflow."
          className="mt-16"
        />

        <div className="mt-10 grid gap-4 lg:grid-cols-6">
          {featuredFeatures.map((feature) => (
            <Card
              key={feature.title}
              className="group rounded-[1.75rem] p-7 shadow-[0_22px_70px_rgb(24_24_27_/_0.07)] transition hover:-translate-y-1 hover:border-primary/30 hover:shadow-[0_28px_80px_rgb(249_115_0_/_0.14)] lg:col-span-3"
            >
              <div className="flex items-start gap-5">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-accent text-primary shadow-inner">
                  <MarketingIcon name={feature.icon} className="h-7 w-7" />
                </span>
                <div>
                  <h3 className="text-2xl font-black tracking-tight">{feature.title}</h3>
                  <p className="mt-3 text-base leading-7 text-foreground/70">
                    {feature.description}
                  </p>
                  <p className="mt-4 rounded-2xl bg-muted px-4 py-3 text-sm font-bold leading-6 text-foreground/78">
                    {feature.outcome}
                  </p>
                </div>
              </div>
            </Card>
          ))}

          {supportingFeatures.map((feature) => (
            <Card
              key={feature.title}
              className="group rounded-[1.5rem] p-6 shadow-[0_18px_60px_rgb(24_24_27_/_0.06)] transition hover:-translate-y-1 hover:border-primary/30 hover:shadow-[0_24px_70px_rgb(249_115_0_/_0.12)] md:col-span-3 lg:col-span-2"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-primary shadow-inner">
                <MarketingIcon name={feature.icon} className="h-6 w-6" />
              </span>
              <h3 className="mt-5 text-xl font-black tracking-tight">{feature.title}</h3>
              <p className="mt-3 text-[15px] leading-7 text-foreground/70">{feature.description}</p>
              <p className="mt-4 text-sm font-bold leading-6 text-foreground/78">
                {feature.outcome}
              </p>
            </Card>
          ))}
        </div>
      </Container>
    </section>
  );
}
