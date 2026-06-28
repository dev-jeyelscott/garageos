import Link from 'next/link';
import type { ReactNode } from 'react';

import { Container } from '../../../components/ui';
import type { AppShellSession } from '../types/app-shell-session';
import { BranchContextIndicator } from './branch-context-indicator.base';
import { OfflineIndicator } from './offline-indicator.client';
import { PermissionAwareNavigation } from './permission-aware-navigation.client';
import { TenantStatusBanner } from './tenant-status-banner.base';
import { UserMenu } from './user-menu.client';

export function AppShellBase({
  children,
  session,
}: {
  readonly children: ReactNode;
  readonly session: AppShellSession;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
        <Container className="flex min-h-16 items-center justify-between gap-3 py-3">
          <div className="min-w-0">
            <Link className="block text-lg font-bold text-foreground" href="/dashboard">
              GarageOS
            </Link>
            <p className="truncate text-xs text-muted-foreground">
              {session.tenant?.business_name ?? 'Tenant workspace'}
            </p>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <BranchContextIndicator session={session} />
            <UserMenu session={session} />
          </div>
        </Container>
      </header>

      <Container className="grid gap-4 py-4 md:grid-cols-[15rem_1fr] md:py-6">
        <aside className="min-w-0">
          <PermissionAwareNavigation permissions={session.effective_permissions} />
        </aside>
        <main className="min-w-0 space-y-4">
          <TenantStatusBanner status={session.tenant?.status ?? session.subscription?.status} />
          <OfflineIndicator />
          {children}
        </main>
      </Container>
    </div>
  );
}
