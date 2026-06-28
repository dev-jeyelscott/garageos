import { cn } from '../../../components/ui';

export function SectionHeading({
  eyebrow,
  title,
  description,
  className,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly className?: string;
}) {
  return (
    <div className={cn('max-w-4xl', className)}>
      <p className="text-sm font-black uppercase tracking-[0.2em] text-primary">{eyebrow}</p>
      <h2 className="mt-3 text-4xl font-black tracking-tight text-foreground sm:text-5xl">
        {title}
      </h2>
      <p className="mt-4 max-w-3xl text-lg leading-8 text-foreground/70">{description}</p>
    </div>
  );
}
