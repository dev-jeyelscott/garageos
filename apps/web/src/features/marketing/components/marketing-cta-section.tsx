import { ButtonLink, Container } from '../../../components/ui';

export function MarketingCtaSection() {
  return (
    <section className="bg-background pb-16 pt-6 sm:pb-20">
      <Container>
        <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-primary via-orange-500 to-amber-400 p-8 text-primary-foreground shadow-[0_28px_90px_rgb(249_115_0_/_0.25)] sm:p-10 lg:p-12">
          <div className="absolute right-[-4rem] top-[-6rem] h-52 w-52 rounded-full bg-white/20 blur-3xl" />
          <div className="absolute bottom-[-7rem] left-[-5rem] h-56 w-56 rounded-full bg-black/10 blur-3xl" />

          <div className="relative grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.2em] text-white/80">
                Start cleaner operations
              </p>
              <h2 className="mt-3 max-w-3xl text-3xl font-black tracking-tight sm:text-4xl">
                Ready to modernize your motorcycle shop?
              </h2>
              <p className="mt-4 max-w-2xl text-base leading-7 text-white/90">
                Move from paper, spreadsheets, and scattered updates to one organized GarageOS
                workspace for service operations.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
              <ButtonLink
                href="/auth/signup-owner"
                size="lg"
                className="border-white bg-white px-6 text-foreground hover:bg-white/90"
              >
                Start Owner Signup
              </ButtonLink>
              <ButtonLink
                href="/auth/login"
                variant="outline"
                size="lg"
                className="border-white/40 bg-white/10 px-6 text-white hover:bg-white/20"
              >
                Log in
              </ButtonLink>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
