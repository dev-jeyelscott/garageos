import { Card, Container } from '../../../components/ui';
import { roleValues } from '../marketing-content';
import { MarketingIcon } from '../marketing-icons';
import { SectionHeading } from './section-heading';

export function RoleValueSection() {
  return (
    <section id="roles" className="bg-background py-12 sm:py-16">
      <Container>
        <SectionHeading
          eyebrow="Role fit"
          title="Designed for the people who keep a motorcycle shop moving."
          description="GarageOS supports role-focused work while keeping permissions, branch access, tenant lifecycle, and plan limits authoritative."
        />

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {roleValues.map((item) => (
            <Card
              key={item.role}
              className="rounded-[1.5rem] p-5 shadow-[0_16px_48px_rgb(24_24_27_/_0.05)]"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent text-primary">
                <MarketingIcon name={item.icon} className="h-5 w-5" />
              </span>
              <h3 className="mt-5 font-black">{item.role}</h3>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.description}</p>
            </Card>
          ))}
        </div>
      </Container>
    </section>
  );
}
