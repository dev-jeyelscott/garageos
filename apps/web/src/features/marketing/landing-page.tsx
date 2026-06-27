import {
  FeatureGrid,
  MarketingCtaSection,
  MarketingFooter,
  MarketingHeader,
  MarketingHero,
  OperationalTrustSection,
  RoleValueSection,
  WorkflowPreview,
} from './marketing-components';

export function LandingPage() {
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <MarketingHeader />
      <MarketingHero />
      <FeatureGrid />
      <WorkflowPreview />
      <RoleValueSection />
      <OperationalTrustSection />
      <MarketingCtaSection />
      <MarketingFooter />
    </main>
  );
}
