import { Card, Container } from '../../../components/ui';
import { features } from '../marketing-content';
import { MarketingIcon } from '../marketing-icons';
import { SectionHeading } from './section-heading';

export function FeatureGrid() {
  return (
    <section id="features" className="bg-background py-12 sm:py-16">
      <Container>
        <div
          id="product"
          className="grid gap-6 rounded-[2rem] border border-border bg-card p-5 shadow-[0_24px_80px_rgb(24_24_27_/_0.08)] sm:p-8 lg:grid-cols-[0.86fr_1.14fr] lg:items-center"
        >
          <div>
            <p className="text-sm font-black uppercase tracking-[0.2em] text-primary">
              Connected operations
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
              From paper, spreadsheets, and scattered updates to one GarageOS workflow.
            </h2>
          </div>
          <p className="text-base leading-7 text-muted-foreground">
            GarageOS keeps intake, service work, inventory, billing, reminders, and reporting in one
            operational workspace. The public page stays focused on documented product capability
            and avoids unsupported scope.
          </p>
        </div>

        <SectionHeading
          eyebrow="Core features"
          title="Everything a motorcycle service shop needs to stay organized."
          description="The homepage highlights documented GarageOS modules without adding unsupported product claims."
          className="mt-14"
        />

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {features.map((feature) => (
            <Card
              key={feature.title}
              className="group rounded-[1.5rem] p-6 shadow-[0_18px_60px_rgb(24_24_27_/_0.06)] transition hover:-translate-y-1 hover:border-primary/30 hover:shadow-[0_24px_70px_rgb(249_115_0_/_0.12)]"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-primary shadow-inner">
                <MarketingIcon name={feature.icon} className="h-6 w-6" />
              </span>
              <h3 className="mt-5 text-xl font-black tracking-tight">{feature.title}</h3>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{feature.description}</p>
            </Card>
          ))}
        </div>
      </Container>
    </section>
  );
}
