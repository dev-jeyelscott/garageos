import type { ReactNode } from 'react';

export type IconName =
  | 'audit'
  | 'bell'
  | 'box'
  | 'chart'
  | 'checklist'
  | 'clock'
  | 'credit-card'
  | 'gauge'
  | 'offline'
  | 'receipt'
  | 'roles'
  | 'shield'
  | 'shop'
  | 'users'
  | 'wrench';

export function MarketingIcon({
  name,
  className,
}: {
  readonly name: IconName;
  readonly className?: string;
}) {
  const paths: Record<IconName, ReactNode> = {
    audit: (
      <>
        <path d="M6 4h12v16H6z" />
        <path d="M9 8h6M9 12h6M9 16h3" />
      </>
    ),
    bell: (
      <>
        <path d="M18 16H6l2-3V9a4 4 0 0 1 8 0v4z" />
        <path d="M10 19h4" />
      </>
    ),
    box: (
      <>
        <path d="M4 8l8-4 8 4-8 4z" />
        <path d="M4 8v8l8 4 8-4V8" />
        <path d="M12 12v8" />
      </>
    ),
    chart: (
      <>
        <path d="M5 19V9" />
        <path d="M12 19V5" />
        <path d="M19 19v-7" />
      </>
    ),
    checklist: (
      <>
        <path d="M8 6h11M8 12h11M8 18h11" />
        <path d="M4.5 6l1 1 1.5-2M4.5 12l1 1 1.5-2M4.5 18l1 1 1.5-2" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v5l3 2" />
      </>
    ),
    'credit-card': (
      <>
        <path d="M4 7h16v10H4z" />
        <path d="M4 10h16" />
        <path d="M7 14h4" />
      </>
    ),
    gauge: (
      <>
        <path d="M4 14a8 8 0 0 1 16 0" />
        <path d="M12 14l4-5" />
        <path d="M6 18h12" />
      </>
    ),
    offline: (
      <>
        <path d="M4 12a12 12 0 0 1 16 0" />
        <path d="M7 15a7 7 0 0 1 10 0" />
        <path d="M10 18a3 3 0 0 1 4 0" />
        <path d="M4 4l16 16" />
      </>
    ),
    receipt: (
      <>
        <path d="M7 4h10v16l-2-1-2 1-2-1-2 1-2-1z" />
        <path d="M9 8h6M9 12h6M9 16h3" />
      </>
    ),
    roles: (
      <>
        <path d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
        <path d="M3 20a6 6 0 0 1 12 0" />
        <path d="M17 8a2.5 2.5 0 0 1 0 5" />
        <path d="M16 16a5 5 0 0 1 5 4" />
      </>
    ),
    shield: (
      <>
        <path d="M12 3l7 3v5c0 4.5-2.8 8-7 10-4.2-2-7-5.5-7-10V6z" />
        <path d="M9 12l2 2 4-5" />
      </>
    ),
    shop: (
      <>
        <path d="M4 10h16l-2-5H6z" />
        <path d="M6 10v9h12v-9" />
        <path d="M9 19v-5h6v5" />
      </>
    ),
    users: (
      <>
        <path d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
        <path d="M3 20a6 6 0 0 1 12 0" />
        <path d="M16 7a3 3 0 0 1 0 6" />
        <path d="M17 14a6 6 0 0 1 4 6" />
      </>
    ),
    wrench: (
      <>
        <path d="M14 7a5 5 0 0 0 6 6L11 22l-5-5 9-9z" />
        <path d="M7 17l-4-4 4-4" />
      </>
    ),
  };

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {paths[name]}
    </svg>
  );
}
