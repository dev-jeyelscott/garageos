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

        <div className="mt-10 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          {featuredRoles.map((ownerRole) => (
            <Card
              key={ownerRole.role}
              className="rounded-[1.75rem] border-primary/25 bg-accent p-7 shadow-[0_22px_70px_rgb(249_115_0_/_0.1)]"
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                <MarketingIcon name={ownerRole.icon} className="h-7 w-7" />
              </span>
              <h3 className="mt-6 text-2xl font-black tracking-tight">{ownerRole.role}</h3>
              <p className="mt-3 text-base leading-7 text-foreground/72">{ownerRole.description}</p>
              <p className="mt-5 rounded-2xl bg-card/80 px-4 py-3 text-sm font-bold leading-6 text-foreground/80">
                {ownerRole.outcome}
              </p>
            </Card>
          ))}

          <div className="grid gap-4 sm:grid-cols-2">
            {shopRoles.map((item) => (
              <Card
                key={item.role}
                className="rounded-[1.5rem] p-5 shadow-[0_16px_48px_rgb(24_24_27_/_0.05)]"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent text-primary">
                  <MarketingIcon name={item.icon} className="h-5 w-5" />
                </span>
                <h3 className="mt-5 font-black">{item.role}</h3>
                <p className="mt-3 text-[15px] leading-7 text-foreground/68">{item.description}</p>
                <p className="mt-3 text-sm font-bold leading-6 text-foreground/78">
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
