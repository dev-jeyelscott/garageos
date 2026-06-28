import { Card, Container } from '../../../components/ui';
import { roleValues } from '../marketing-content';
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

        <div className="mt-10 grid gap-5 lg:grid-cols-[0.88fr_1.12fr]">
          {featuredRoles.map((ownerRole) => (
            <Card
              key={ownerRole.role}
              className="relative overflow-hidden rounded-[1.75rem] border-primary/25 bg-[linear-gradient(145deg,rgb(var(--accent))_0%,rgb(var(--card))_70%)] p-7 shadow-[0_22px_70px_rgb(249_115_0_/_0.09)]"
            >
              <div className="absolute right-[-5rem] top-[-5rem] h-40 w-40 rounded-full bg-primary/10 blur-3xl" />

              <div className="relative">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[0_16px_36px_rgb(249_115_0_/_0.18)]">
                  <MarketingIcon name={ownerRole.icon} className="h-7 w-7" />
                </span>

                <p className="mt-7 text-xs font-black uppercase tracking-[0.18em] text-primary">
                  Business control
                </p>
                <h3 className="mt-3 text-2xl font-black tracking-tight">{ownerRole.role}</h3>
                <p className="mt-3 text-base leading-7 text-foreground/72">
                  {ownerRole.description}
                </p>

                <div className="mt-6 rounded-2xl border border-primary/15 bg-card/85 p-4">
                  <p className="text-sm font-black text-foreground">Owner workspace outcome</p>
                  <p className="mt-2 text-sm font-bold leading-6 text-foreground/78">
                    {ownerRole.outcome}
                  </p>
                </div>

                <div className="mt-5 grid gap-2 text-sm font-bold text-foreground/70 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  {['Reports', 'Approvals', 'Branches', 'Audit'].map((item) => (
                    <span key={item} className="rounded-full bg-muted px-3 py-2">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </Card>
          ))}

          <div className="grid gap-4 sm:grid-cols-2">
            {shopRoles.map((item) => (
              <Card
                key={item.role}
                className="group rounded-[1.5rem] p-5 shadow-[0_16px_48px_rgb(24_24_27_/_0.05)] transition hover:-translate-y-1 hover:border-primary/25 hover:shadow-[0_22px_64px_rgb(24_24_27_/_0.07)]"
              >
                <div className="flex items-start justify-between gap-4">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent text-primary shadow-inner">
                    <MarketingIcon name={item.icon} className="h-5 w-5" />
                  </span>
                  <span className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">
                    Role
                  </span>
                </div>

                <h3 className="mt-5 text-lg font-black tracking-tight">{item.role}</h3>
                <p className="mt-3 text-[15px] leading-7 text-foreground/68">{item.description}</p>

                <p className="mt-4 border-l-2 border-primary/35 pl-4 text-sm font-bold leading-6 text-foreground/80">
                  {item.outcome}
                </p>
              </Card>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
