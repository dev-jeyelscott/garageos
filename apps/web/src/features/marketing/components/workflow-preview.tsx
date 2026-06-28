import { Card, Container, cn } from '../../../components/ui';
import { workflowSteps } from '../marketing-content';
import { MarketingIcon } from '../marketing-icons';
import { SectionHeading } from './section-heading';

export function WorkflowPreview() {
  return (
    <section
      id="workflow"
      className="border-y border-border/80 bg-[linear-gradient(180deg,rgb(var(--muted))_0%,rgb(var(--background))_100%)] py-14 sm:py-20"
    >
      <Container>
        <div className="grid gap-10 lg:grid-cols-[0.68fr_1.32fr] lg:items-start">
          <div className="lg:sticky lg:top-24">
            <SectionHeading
              eyebrow="Shop workflow"
              title="From intake to invoice without losing the handoff."
              description="GarageOS presents each step as an intentional operational action, so advisors, mechanics, cashiers, and managers can follow the work without turning status updates into guesswork."
            />

            <div className="mt-8 rounded-[1.75rem] border border-border bg-card p-5 shadow-[0_18px_60px_rgb(24_24_27_/_0.06)]">
              <p className="text-sm font-black uppercase tracking-[0.18em] text-primary">
                Why it matters
              </p>
              <p className="mt-3 text-[15px] leading-7 text-foreground/72">
                Each handoff keeps the next person clear on ownership, branch context, stock impact,
                billing status, and what still needs attention.
              </p>
            </div>
          </div>

          <div className="relative rounded-[2rem] border border-border bg-card p-4 shadow-[0_24px_80px_rgb(24_24_27_/_0.07)] sm:p-6">
            <div className="absolute bottom-8 left-10 top-8 hidden w-px bg-gradient-to-b from-primary/50 via-border to-border lg:block" />

            <div className="grid gap-4">
              {workflowSteps.map((step, index) => {
                const isFirst = index === 0;
                const isLast = index === workflowSteps.length - 1;

                return (
                  <Card
                    key={step.title}
                    className={cn(
                      'relative overflow-hidden rounded-[1.5rem] p-5 shadow-none transition hover:border-primary/30 hover:shadow-[0_18px_50px_rgb(24_24_27_/_0.06)] sm:p-6 lg:ml-10',
                      isFirst && 'border-primary/35 bg-accent',
                      isLast &&
                        'border-primary/25 bg-[linear-gradient(135deg,rgb(var(--card))_0%,rgb(var(--accent))_100%)]',
                    )}
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                      <div className="flex shrink-0 items-center gap-3 sm:flex-col">
                        <div
                          className={cn(
                            'flex h-12 w-12 items-center justify-center rounded-2xl border text-sm font-black',
                            isFirst || isLast
                              ? 'border-primary bg-primary text-primary-foreground shadow-[0_12px_28px_rgb(249_115_0_/_0.18)]'
                              : 'border-border bg-muted text-foreground',
                          )}
                        >
                          {String(index + 1).padStart(2, '0')}
                        </div>

                        <div
                          className={cn(
                            'flex h-10 w-10 items-center justify-center rounded-2xl border',
                            isFirst || isLast
                              ? 'border-primary/20 bg-background text-primary'
                              : 'border-border bg-background text-foreground/70',
                          )}
                        >
                          <MarketingIcon name={step.icon} className="h-5 w-5" />
                        </div>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-xs font-black uppercase tracking-[0.16em] text-primary">
                              {step.phase}
                            </p>
                            <h3 className="mt-2 text-xl font-black tracking-tight">{step.title}</h3>
                          </div>

                          <span className="w-fit shrink-0 rounded-full border border-border bg-background px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">
                            Step {String(index + 1).padStart(2, '0')}
                          </span>
                        </div>

                        <p className="mt-3 text-[15px] leading-7 text-foreground/70">
                          {step.description}
                        </p>

                        <p className="mt-4 rounded-2xl bg-muted px-4 py-3 text-sm font-bold leading-6 text-foreground/80">
                          {step.outcome}
                        </p>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
