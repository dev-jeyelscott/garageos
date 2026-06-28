import type { ReactNode } from 'react';

import { Card, cn } from '../../../components/ui';
import { dashboardMetrics } from '../marketing-content';
import type { DashboardMetric } from '../marketing-content';
import { MarketingIcon } from '../marketing-icons';

export function DashboardMockup() {
  return (
    <div className="relative mx-auto w-full max-w-3xl">
      <div className="absolute -inset-4 rounded-[2.25rem] bg-[linear-gradient(135deg,rgb(24_24_27_/_0.12),transparent_36%,rgb(249_115_0_/_0.16))] blur-2xl" />

      <Card className="relative overflow-hidden rounded-[2rem] border-zinc-800 bg-zinc-950 text-white shadow-[0_28px_90px_rgb(24_24_27_/_0.28)]">
        <div className="border-b border-white/10 bg-white/[0.03] px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                <MarketingIcon name="gauge" className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">
                  Sample dashboard
                </p>
                <h2 className="text-lg font-black tracking-tight text-white sm:text-xl">
                  Good morning, Maico
                </h2>
              </div>
            </div>
            <span className="hidden rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-zinc-300 sm:inline-flex">
              Main Branch
            </span>
          </div>
        </div>

        <div className="grid gap-4 p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            {dashboardMetrics.map((metric) => (
              <MiniMetricCard key={metric.label} metric={metric} />
            ))}
          </div>

          <div className="grid gap-3 lg:grid-cols-[1fr_0.9fr]">
            <PreviewPanel dark title="Job progress" action="Today">
              {[
                ['JO-2026-0012', 'Yamaha NMAX 155', 'In progress'],
                ['JO-2026-0013', 'Honda Click 125i', 'Waiting parts'],
                ['JO-2026-0014', 'Kawasaki Ninja 400', 'Completed'],
              ].map(([code, bike, status]) => (
                <div
                  key={`${code}-${bike}`}
                  className="flex items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <p className="font-bold text-white">{code}</p>
                    <p className="mt-1 text-zinc-400">{bike}</p>
                  </div>
                  <span className="rounded-full bg-primary/15 px-2.5 py-1 font-bold text-orange-200">
                    {status}
                  </span>
                </div>
              ))}
            </PreviewPanel>

            <PreviewPanel dark title="Revenue" action="This month">
              <p className="text-2xl font-black text-white">PHP 186,750</p>
              <p className="mt-1 text-xs font-bold text-green-300">+16% vs last month</p>
              <div className="mt-5 flex h-24 items-end gap-2 border-b border-l border-white/10 px-2">
                {[34, 46, 42, 58, 64, 78, 74, 90, 86, 100].map((height, index) => (
                  <span
                    key={`${height}-${index}`}
                    className="flex-1 rounded-t-lg bg-gradient-to-t from-primary/35 to-orange-300"
                    style={{ height: `${height}%` }}
                  />
                ))}
              </div>
            </PreviewPanel>
          </div>
        </div>
      </Card>
    </div>
  );
}

function MiniMetricCard({ metric }: { readonly metric: DashboardMetric }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-[0_18px_50px_rgb(0_0_0_/_0.14)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-zinc-400">{metric.label}</p>
          <p
            className={cn(
              'mt-2 text-2xl font-black text-white',
              metric.tone === 'success' && 'text-green-300',
              metric.tone === 'warning' && 'text-amber-300',
            )}
          >
            {metric.value}
          </p>
          <p className="mt-1 text-xs text-zinc-500">{metric.detail}</p>
        </div>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
          <MarketingIcon name={metric.icon} className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
}

function PreviewPanel({
  title,
  action,
  dark = false,
  children,
}: {
  readonly title: string;
  readonly action: string;
  readonly dark?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border p-4 shadow-[0_12px_36px_rgb(24_24_27_/_0.05)]',
        dark ? 'border-white/10 bg-white/[0.04]' : 'border-border bg-card',
      )}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className={cn('text-sm font-black', dark && 'text-white')}>{title}</h3>
        <span
          className={cn('text-xs font-semibold', dark ? 'text-zinc-400' : 'text-muted-foreground')}
        >
          {action}
        </span>
      </div>
      <div className="grid gap-3">{children}</div>
    </div>
  );
}
