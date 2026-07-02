import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';

import {
  Alert,
  Badge,
  Button,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  type BadgeVariant,
} from '../../../components/ui';
import type { AppShellSession, AuthTenantStatus } from '../types/app-shell-session';
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
    <div className="min-h-dvh bg-background text-foreground">
      <div className="flex min-h-dvh">
        <TenantDesktopSidebar session={session} />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-border bg-card/95 shadow-sm backdrop-blur-xl">
            <div className="flex min-h-16 items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
              <div className="flex min-w-0 items-center gap-3">
                <TenantMobileNavigation session={session} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-black uppercase tracking-[0.18em] text-muted-foreground">
                    Tenant Workspace
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {session.tenant?.business_name ?? 'GarageOS tenant'}
                  </p>
                </div>
              </div>

              <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
                <BranchContextIndicator session={session} />
                <TenantLifecycleBadge
                  status={session.tenant?.status ?? session.subscription?.status}
                />
                <UserMenu session={session} />
              </div>
            </div>
          </header>

          <div className="grid w-full max-w-none gap-5 px-4 py-6 sm:px-6 lg:px-8">
            <TenantStatusBanner status={session.tenant?.status ?? session.subscription?.status} />
            <OfflineIndicator />
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

function TenantDesktopSidebar({ session }: { readonly session: AppShellSession }) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-72 shrink-0 border-r border-border bg-card px-4 py-5 shadow-sm lg:flex lg:flex-col">
      <TenantBrandLink session={session} />

      <div className="mt-6 min-h-0 flex-1 overflow-y-auto pr-1">
        <PermissionAwareNavigation permissions={session.effective_permissions} variant="static" />
      </div>

      <Alert className="mt-6">
        <p className="text-sm font-bold">Tenant access guardrail</p>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Navigation is permission-aware for UX only. Backend authorization, tenant lifecycle,
          branch access, and offline guards remain authoritative.
        </p>
      </Alert>
    </aside>
  );
}

function TenantMobileNavigation({ session }: { readonly session: AppShellSession }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button type="button" variant="secondary" size="sm" className="lg:hidden">
          Menu
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[20rem] max-w-[86vw] p-0">
        <SheetHeader className="border-b border-border p-4 pr-12">
          <SheetTitle>Tenant Workspace</SheetTitle>
        </SheetHeader>

        <div className="grid gap-5 p-4">
          <TenantBrandLink session={session} />
          <PermissionAwareNavigation permissions={session.effective_permissions} variant="static" />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function TenantBrandLink({ session }: { readonly session: AppShellSession }) {
  return (
    <Link
      href="/dashboard"
      aria-label="GarageOS tenant dashboard"
      className="inline-flex min-h-12 min-w-0 items-center gap-3 no-underline"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-accent shadow-sm sm:h-14 sm:w-14">
        <Image
          src="/images/logo.png"
          alt=""
          width={96}
          height={96}
          priority
          className="h-9 w-9 object-contain sm:h-11 sm:w-11"
        />
      </span>

      <span className="min-w-0">
        <span className="hidden rounded-2xl border border-border/70 bg-[rgb(var(--foreground))] px-3 py-2 shadow-sm dark:bg-card sm:inline-flex">
          <Image
            src="/images/garageos.png"
            alt=""
            width={168}
            height={60}
            priority
            className="h-auto w-[118px] object-contain md:w-[136px]"
          />
        </span>
        <span className="mt-2 block max-w-48 truncate text-xs text-muted-foreground">
          {session.tenant?.business_name ?? 'Tenant workspace'}
        </span>
      </span>
    </Link>
  );
}

function TenantLifecycleBadge({ status }: { readonly status: AuthTenantStatus | undefined }) {
  const resolvedStatus = status ?? 'unknown';

  return (
    <Badge variant={getTenantStatusBadgeVariant(resolvedStatus)}>
      {formatStatusLabel(resolvedStatus)}
    </Badge>
  );
}

function getTenantStatusBadgeVariant(status: string): BadgeVariant {
  switch (status) {
    case 'active':
      return 'success';

    case 'pending_setup':
    case 'grace_period':
      return 'warning';

    case 'read_only':
      return 'readonly';

    case 'suspended':
    case 'pending_deletion':
    case 'deleted':
      return 'destructive';

    default:
      return 'secondary';
  }
}

function formatStatusLabel(status: string): string {
  return status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
