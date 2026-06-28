import { ButtonLink, Container } from '../../../components/ui';

export function MarketingCtaSection() {
  return (
    <section className="bg-background pb-16 pt-4 sm:pb-20">
      <Container>
        <div className="relative overflow-hidden rounded-[2rem] border border-zinc-800 bg-[linear-gradient(135deg,rgb(17_17_19)_0%,rgb(39_39_42)_100%)] p-8 text-white shadow-[0_28px_90px_rgb(24_24_27_/_0.22)] sm:p-10 lg:p-12">
          <div className="absolute right-[-5rem] top-[-6rem] h-56 w-56 rounded-full bg-primary/20 blur-3xl" />
          <div className="absolute bottom-[-7rem] left-[-5rem] h-56 w-56 rounded-full bg-white/10 blur-3xl" />

          <div className="relative grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.2em] text-orange-200">
                Start with the shop workflow
              </p>
              <h2 className="mt-3 max-w-3xl text-4xl font-black tracking-tight sm:text-5xl">
                Ready to get service work, stock, and payments in one place?
              </h2>
              <p className="mt-4 max-w-2xl text-lg leading-8 text-zinc-200">
                Create the shop account, set up the workspace, and move daily operations away from
                paper, spreadsheets, and scattered updates.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
              <ButtonLink
                href="/auth/signup-owner"
                size="lg"
                className="border-primary bg-primary px-6 font-black text-primary-foreground shadow-[0_18px_40px_rgb(249_115_0_/_0.22)] hover:opacity-95"
              >
                Create your shop account
              </ButtonLink>
              <ButtonLink
                href="/auth/login"
                variant="outline"
                size="lg"
                className="border-white/20 bg-white/5 px-6 font-black text-white hover:bg-white/10"
              >
                Log in
              </ButtonLink>
            </div>
          </div>

          <div className="relative mt-8 grid gap-3 border-t border-white/10 pt-6 text-sm font-bold text-zinc-300 sm:grid-cols-3">
            <p>Mobile-first PWA workspace</p>
            <p>Branch and role-aware operations</p>
            <p>Inventory, invoices, and reports connected</p>
          </div>
        </div>
      </Container>
    </section>
  );
}
