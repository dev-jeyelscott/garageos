import {
  FeatureGrid,
  MarketingCtaSection,
  MarketingFooter,
  MarketingHeader,
  MarketingHero,
  MarketingReveal,
  OperationalTrustSection,
  RoleValueSection,
  WorkflowPreview,
} from './marketing-components';

export function LandingPage() {
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <MarketingHeader />
      <MarketingHero />

      <MarketingReveal delayMs={40}>
        <FeatureGrid />
      </MarketingReveal>

      <MarketingReveal delayMs={80}>
        <WorkflowPreview />
      </MarketingReveal>

      <MarketingReveal delayMs={80}>
        <RoleValueSection />
      </MarketingReveal>

      <MarketingReveal delayMs={60}>
        <OperationalTrustSection />
      </MarketingReveal>

      <MarketingReveal delayMs={60}>
        <MarketingCtaSection />
      </MarketingReveal>

      <MarketingFooter />
    </main>
  );
}
