import { Badge, Container } from '../../../components/ui';
import { trustItems } from '../marketing-content';
import { MarketingIcon } from '../marketing-icons';

export function OperationalTrustSection() {
  return (
    <section id="trust" className="bg-background pb-8 pt-2 sm:pb-14">
      <Container>
        <div className="grid overflow-hidden rounded-[2rem] border border-border bg-card shadow-[0_24px_80px_rgb(24_24_27_/_0.08)] lg:grid-cols-[1.05fr_1.2fr]">
          <div className="bg-[radial-gradient(circle_at_20%_20%,rgb(249_115_0_/_0.28),transparent_34%),linear-gradient(135deg,rgb(17_17_19),rgb(39_39_42))] p-7 text-white sm:p-10">
            <Badge className="border-white/15 bg-white/10 text-white">Operational trust</Badge>
            <h2 className="mt-5 text-4xl font-black tracking-tight sm:text-5xl">
              Serious controls for real shop operations.
            </h2>
            <p className="mt-5 text-base leading-8 text-zinc-200">
              A motorcycle shop system should not feel like a loose spreadsheet with prettier
              buttons. GarageOS is designed around branch context, role-aware access, controlled
              workflows, inventory discipline, and readable shop-floor states.
            </p>
          </div>

          <div className="grid gap-0 sm:grid-cols-2">
            {trustItems.map((item) => (
              <div key={item.title} className="border-t border-border p-6 sm:border-l">
                <MarketingIcon name={item.icon} className="h-7 w-7 text-primary" />
                <h3 className="mt-4 text-lg font-black">{item.title}</h3>
                <p className="mt-2 text-[15px] leading-7 text-foreground/68">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
