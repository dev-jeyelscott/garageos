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
              <p className="text-sm font-black uppercase tracking-[0.2em] text-white/82">
                Start with the shop workflow
              </p>
              <h2 className="mt-3 max-w-3xl text-4xl font-black tracking-tight sm:text-5xl">
                Ready to get service work, stock, and payments in one place?
              </h2>
              <p className="mt-4 max-w-2xl text-lg leading-8 text-white/92">
                Create the shop account, set up the workspace, and move daily operations away from
                paper, spreadsheets, and scattered updates.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
              <ButtonLink
                href="/auth/signup-owner"
                size="lg"
                className="w-full border-white bg-white px-6 font-black text-foreground hover:bg-white/90 sm:w-auto"
              >
                Create your shop account
              </ButtonLink>
              <ButtonLink
                href="/auth/login"
                variant="outline"
                size="lg"
                className="w-full border-white/45 bg-white/10 px-6 font-black text-white hover:bg-white/20 sm:w-auto"
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
