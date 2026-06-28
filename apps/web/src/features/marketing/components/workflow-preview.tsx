import { Card, Container, cn } from '../../../components/ui';
import { workflowSteps } from '../marketing-content';
import { SectionHeading } from './section-heading';

export function WorkflowPreview() {
  return (
    <section id="workflow" className="border-y border-border/80 bg-muted py-14 sm:py-20">
      <Container>
        <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-start">
          <SectionHeading
            eyebrow="Shop workflow"
            title="From intake to invoice without losing the handoff."
            description="GarageOS presents each step as an intentional operational action, so advisors, mechanics, cashiers, and managers can follow the work without turning status updates into guesswork."
          />

          <div className="rounded-[2rem] border border-border bg-card p-5 shadow-[0_24px_80px_rgb(24_24_27_/_0.08)] sm:p-6">
            <div className="grid gap-3 sm:grid-cols-2">
              {workflowSteps.map((step, index) => (
                <Card
                  key={step.title}
                  className={cn(
                    'relative overflow-hidden rounded-[1.35rem] p-5 shadow-none',
                    index === 0 && 'border-primary/40 bg-accent',
                    index === workflowSteps.length - 1 && 'border-primary/30',
                  )}
                >
                  <div className="flex items-start gap-4">
                    <p className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-black text-primary-foreground">
                      {String(index + 1).padStart(2, '0')}
                    </p>
                    <div>
                      <h3 className="text-lg font-black">{step.title}</h3>
                      <p className="mt-2 text-[15px] leading-7 text-foreground/68">
                        {step.description}
                      </p>
                      <p className="mt-3 text-sm font-bold leading-6 text-foreground/80">
                        {step.outcome}
                      </p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
