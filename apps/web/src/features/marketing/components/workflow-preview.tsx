import { Card, Container, cn } from '../../../components/ui';
import { workflowSteps } from '../marketing-content';
import type { WorkflowStep } from '../marketing-content';
import { MarketingIcon } from '../marketing-icons';
import { SectionHeading } from './section-heading';

export function WorkflowPreview() {
  return (
    <section id="workflow" className="border-y border-border/80 bg-muted py-14 sm:py-20">
      <Container>
        <div className="grid gap-8 lg:grid-cols-[0.74fr_1.26fr] lg:items-start">
          <div className="lg:sticky lg:top-24">
            <SectionHeading
              eyebrow="Shop workflow"
              title="From intake to invoice without losing the handoff."
              description="GarageOS presents each step as an intentional operational action, so advisors, mechanics, cashiers, and managers can follow the work without turning status updates into guesswork."
            />

            <Card className="mt-8 overflow-hidden rounded-[1.75rem] border-primary/20 bg-card shadow-[0_18px_60px_rgb(24_24_27_/_0.06)]">
              <div className="bg-[linear-gradient(135deg,rgb(17_17_19),rgb(39_39_42))] p-5 text-white">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-200">
                  Why this matters
                </p>
                <p className="mt-3 text-lg font-black leading-7">
                  Every handoff keeps the same customer, motorcycle, branch, stock, billing, and
                  reporting context.
                </p>
              </div>
              <div className="grid gap-3 p-5 text-sm font-bold text-foreground/72">
                {[
                  'Clear next action',
                  'Visible ownership',
                  'Controlled inventory and payment trail',
                ].map((item) => (
                  <div key={item} className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-primary">
                      <MarketingIcon name="checklist" className="h-3.5 w-3.5" />
                    </span>
                    {item}
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <div className="rounded-[2rem] border border-border bg-card p-4 shadow-[0_24px_80px_rgb(24_24_27_/_0.08)] sm:p-6">
            <div className="mb-5 flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.18em] text-primary">
                  Operational handoff map
                </p>
                <h3 className="mt-2 text-2xl font-black tracking-tight text-foreground">
                  One path through the shop floor.
                </h3>
              </div>
              <p className="max-w-xs text-sm leading-6 text-muted-foreground">
                Built to make each team handoff easier to read on mobile and desktop.
              </p>
            </div>

            <div className="relative grid gap-3">
              <div className="absolute left-[1.72rem] top-4 hidden h-[calc(100%-2rem)] w-px bg-gradient-to-b from-primary/45 via-border to-primary/20 sm:block" />

              {workflowSteps.map((step, index) => (
                <WorkflowStepCard
                  key={step.title}
                  step={step}
                  index={index}
                  isLast={index === workflowSteps.length - 1}
                />
              ))}
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

function WorkflowStepCard({
  step,
  index,
  isLast,
}: {
  readonly step: WorkflowStep;
  readonly index: number;
  readonly isLast: boolean;
}) {
  return (
    <Card
      className={cn(
        'relative overflow-hidden rounded-[1.5rem] border-border/80 bg-background p-5 shadow-none transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_18px_50px_rgb(24_24_27_/_0.06)] sm:ml-7',
        index === 0 && 'border-primary/40 bg-accent',
        isLast && 'border-primary/30 bg-card',
      )}
    >
      <div className="flex items-start gap-4">
        <div className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[0_14px_30px_rgb(249_115_0_/_0.22)]">
          <MarketingIcon name={step.icon} className="h-6 w-6" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">
                {String(index + 1).padStart(2, '0')} · {step.phase}
              </p>
              <h3 className="mt-1 text-xl font-black tracking-tight">{step.title}</h3>
            </div>
            {!isLast ? (
              <span className="w-fit rounded-full border border-border bg-card px-3 py-1 text-xs font-bold text-muted-foreground">
                Next handoff
              </span>
            ) : (
              <span className="w-fit rounded-full border border-primary/25 bg-accent px-3 py-1 text-xs font-bold text-accent-foreground">
                Management view
              </span>
            )}
          </div>

          <p className="mt-3 text-[15px] leading-7 text-foreground/70">{step.description}</p>
          <p className="mt-4 rounded-2xl bg-muted px-4 py-3 text-sm font-bold leading-6 text-foreground/78">
            {step.outcome}
          </p>
        </div>
      </div>
    </Card>
  );
}
