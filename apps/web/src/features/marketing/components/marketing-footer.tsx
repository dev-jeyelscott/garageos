import { Container } from '../../../components/ui';
import { navItems } from '../marketing-content';

export function MarketingFooter() {
  return (
    <footer className="border-t border-border bg-card py-7">
      <Container className="flex flex-col gap-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>GarageOS — Motorcycle Shop Management System SaaS</p>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {navItems.map(([label, href]) => (
            <a key={label} href={href} className="transition hover:text-foreground">
              {label}
            </a>
          ))}
          <a href="/auth/login" className="transition hover:text-foreground">
            Login
          </a>
        </div>
      </Container>
    </footer>
  );
}
