import { ButtonLink, Container } from '../../../components/ui';

export function MarketingCtaSection() {
  return (
    <section className="bg-background pb-14 pt-4 sm:pb-20">
      <Container>
        <div className="relative overflow-hidden rounded-[2rem] border border-foreground/10 bg-[linear-gradient(135deg,rgb(17_17_19),rgb(39_39_42))] p-6 text-white shadow-[0_28px_90px_rgb(24_24_27_/_0.18)] sm:p-8 lg:p-10">
          <div className="absolute right-[-6rem] top-[-7rem] h-64 w-64 rounded-full bg-primary/25 blur-3xl" />
          <div className="absolute bottom-[-8rem] left-[-5rem] h-60 w-60 rounded-full bg-amber-300/10 blur-3xl" />

          <div className="relative grid gap-8 lg:grid-cols-[1.08fr_0.92fr] lg:items-center">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.2em] text-orange-200">
                Start with operational control
              </p>
              <h2 className="mt-3 max-w-3xl text-3xl font-black tracking-tight sm:text-5xl">
                Bring service work, stock, billing, and reports into one shop workspace.
              </h2>
              <p className="mt-4 max-w-2xl text-base leading-8 text-white/78 sm:text-lg">
                Create the shop account, complete setup, and give the team a clearer way to move
                from intake to invoice without relying on paper, spreadsheets, or scattered updates.
              </p>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <ButtonLink
                  href="/auth/signup-owner"
                  size="lg"
                  className="w-full border-white bg-white px-6 font-black text-foreground shadow-[0_18px_45px_rgb(0_0_0_/_0.2)] hover:bg-white/90 sm:w-auto"
                >
                  Create your shop account
                  <span aria-hidden="true" className="ml-2">
                    →
                  </span>
                </ButtonLink>
                <ButtonLink
                  href="#workflow"
                  variant="outline"
                  size="lg"
                  className="w-full border-white/30 bg-white/5 px-6 font-black text-white hover:bg-white/12 sm:w-auto"
                >
                  Review the workflow
                </ButtonLink>
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-white/12 bg-white/[0.06] p-5 shadow-[0_20px_60px_rgb(0_0_0_/_0.16)] backdrop-blur">
              <p className="text-sm font-black uppercase tracking-[0.18em] text-orange-200">
                Setup path
              </p>

              <div className="mt-5 grid gap-3">
                {[
                  ['01', 'Create the shop account'],
                  ['02', 'Set branch, roles, and workflow context'],
                  ['03', 'Run daily operations from one workspace'],
                ].map(([number, label]) => (
                  <div
                    key={label}
                    className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/15 p-3"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-sm font-black text-primary-foreground">
                      {number}
                    </span>
                    <span className="text-sm font-bold leading-6 text-white/82">{label}</span>
                  </div>
                ))}
              </div>

              <p className="mt-5 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm font-bold leading-6 text-white/72">
                Built for motorcycle repair shops, service centers, tuning shops, tire shops, and
                multi-branch service operations.
              </p>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
