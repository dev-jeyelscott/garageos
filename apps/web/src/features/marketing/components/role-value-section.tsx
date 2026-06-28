import { Card, Container } from '../../../components/ui';
import { roleValues } from '../marketing-content';
import type { RoleValue } from '../marketing-content';
import { MarketingIcon } from '../marketing-icons';
import { SectionHeading } from './section-heading';

export function RoleValueSection() {
  const featuredRoles = roleValues.slice(0, 1);
  const shopRoles = roleValues.slice(1);

  return (
    <section id="roles" className="bg-background py-14 sm:py-20">
      <Container>
        <SectionHeading
          eyebrow="Role fit"
          title="Built around the people running the shop."
          description="GarageOS keeps each role focused on the work they need to perform while preserving permission, branch, tenant lifecycle, and plan boundaries behind the scenes."
        />

        <div className="mt-10 grid gap-4 lg:grid-cols-[0.92fr_1.08fr] lg:items-stretch">
          {featuredRoles.map((ownerRole) => (
            <Card
              key={ownerRole.role}
              className="relative overflow-hidden rounded-[1.75rem] border-primary/25 bg-accent p-7 shadow-[0_22px_70px_rgb(249_115_0_/_0.1)]"
            >
              <div className="absolute right-[-4rem] top-[-5rem] h-44 w-44 rounded-full bg-primary/15 blur-3xl" />

              <div className="relative">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[0_16px_35px_rgb(249_115_0_/_0.22)]">
                  <MarketingIcon name={ownerRole.icon} className="h-7 w-7" />
                </span>

                <p className="mt-7 text-sm font-black uppercase tracking-[0.18em] text-primary">
                  Command center
                </p>
                <h3 className="mt-2 text-3xl font-black tracking-tight">{ownerRole.role}</h3>
                <p className="mt-4 text-base leading-8 text-foreground/74">
                  {ownerRole.description}
                </p>

                <div className="mt-6 grid gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                  {['Branches', 'Reports', 'Approvals'].map((item) => (
                    <div
                      key={item}
                      className="rounded-2xl border border-primary/15 bg-card/70 px-4 py-3 text-sm font-black text-foreground/78"
                    >
                      {item}
                    </div>
                  ))}
                </div>

                <p className="mt-5 rounded-2xl bg-card/85 px-4 py-3 text-sm font-bold leading-6 text-foreground/82">
                  {ownerRole.outcome}
                </p>
              </div>
            </Card>
          ))}

          <div className="grid gap-4 sm:grid-cols-2">
            {shopRoles.map((item) => (
              <RoleCard key={item.role} item={item} />
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}

function RoleCard({ item }: { readonly item: RoleValue }) {
  return (
    <Card className="group rounded-[1.5rem] p-5 shadow-[0_16px_48px_rgb(24_24_27_/_0.05)] transition hover:-translate-y-1 hover:border-primary/30 hover:shadow-[0_24px_70px_rgb(249_115_0_/_0.1)]">
      <div className="flex items-start justify-between gap-4">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent text-primary shadow-inner">
          <MarketingIcon name={item.icon} className="h-5 w-5" />
        </span>
        <span className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">
          Role workspace
        </span>
      </div>

      <h3 className="mt-5 text-xl font-black tracking-tight">{item.role}</h3>
      <p className="mt-3 text-[15px] leading-7 text-foreground/70">{item.description}</p>
      <p className="mt-4 rounded-2xl bg-muted px-4 py-3 text-sm font-bold leading-6 text-foreground/78">
        {item.outcome}
      </p>
    </Card>
  );
}
