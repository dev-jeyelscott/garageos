import { Card, Container, cn } from '../../../components/ui';
import { workflowSteps } from '../marketing-content';
import { SectionHeading } from './section-heading';

export function WorkflowPreview() {
  return (
    <section id="workflow" className="border-y border-border/80 bg-muted py-12 sm:py-16">
      <Container>
        <SectionHeading
          eyebrow="Shop workflow"
          title="From intake to reports without handoffs getting lost."
          description="Each step is intentionally presented as a clear operational action, not an arbitrary status edit."
        />

        <div className="mt-10 grid gap-4 lg:grid-cols-4">
          {workflowSteps.map((step, index) => (
            <Card
              key={step.title}
              className={cn(
                'relative overflow-hidden rounded-[1.5rem] p-5 shadow-[0_16px_48px_rgb(24_24_27_/_0.05)]',
                index === 0 && 'border-primary/40 bg-accent',
              )}
            >
              <p className="text-sm font-black text-primary">
                {String(index + 1).padStart(2, '0')}
              </p>
              <h3 className="mt-3 text-lg font-black">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.description}</p>
            </Card>
          ))}
        </div>
      </Container>
    </section>
  );
}
