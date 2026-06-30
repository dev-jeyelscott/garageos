'use client';

import { useEffect, useState } from 'react';

import { Alert, Button, ButtonLink } from '../../../components/ui';
import type { AuthSessionResponseData } from '../../auth/types/auth-session';
import {
  defaultPlatformTenantListFilters,
  platformTenantListPageSize,
} from '../tenants/platform-tenant.defaults';
import { getPlatformTenants } from '../tenants/platform-tenant.api';

import {
  ForbiddenState,
  PlatformAttentionNeededCard,
  PlatformOverviewSkeleton,
  PlatformQuickActionsCard,
  RecentPlatformActivityCard,
  SubscriptionHealthCard,
  SummaryCard,
  SupportAccessPolicyCard,
} from './platform-overview.components';
import type { PlatformOverviewState } from './platform-overview.types';
import {
  createPlatformAttentionItems,
  createPlatformTenantStatusSummary,
  getApiErrorCode,
  getPlatformOverviewPermissions,
  toSafeErrorDetail,
  toSafeErrorMessage,
} from './platform-overview.utils';

export function PlatformOverviewHeaderActions({
  session,
}: {
  readonly session: AuthSessionResponseData;
}) {
  const permissions = getPlatformOverviewPermissions(session);

  return (
    <>
      {permissions.canReadTenants ? (
        <ButtonLink href="/platform/tenants" variant="secondary">
          View tenants
        </ButtonLink>
      ) : (
        <Button type="button" variant="secondary" disabled title="Requires platform.tenants.read.">
          View tenants
        </Button>
      )}

      {permissions.canCreateTenant ? (
        <ButtonLink href="/platform/tenants/new" variant="primary">
          Create tenant
        </ButtonLink>
      ) : (
        <Button
          type="button"
          variant="secondary"
          disabled
          title="Requires platform.tenants.create."
        >
          Create tenant
        </Button>
      )}
    </>
  );
}

export function PlatformOverviewContent({
  session,
}: {
  readonly session: AuthSessionResponseData;
}) {
  const permissions = getPlatformOverviewPermissions(session);
  const [overviewState, setOverviewState] = useState<PlatformOverviewState>({
    status: 'idle',
    tenants: [],
  });

  useEffect(() => {
    if (!permissions.canReadTenants) {
      return;
    }

    let active = true;

    async function loadOverviewTenants() {
      setOverviewState({
        status: 'loading',
        tenants: [],
      });

      try {
        const result = await getPlatformTenants({
          filters: defaultPlatformTenantListFilters,
          limit: platformTenantListPageSize,
        });

        if (!active) {
          return;
        }

        setOverviewState({
          status: 'loaded',
          tenants: result.tenants,
        });
      } catch (error) {
        if (!active) {
          return;
        }

        setOverviewState({
          status: 'error',
          tenants: [],
          message: toSafeErrorMessage(error, 'Unable to load platform overview.'),
          detail: toSafeErrorDetail(error),
          code: getApiErrorCode(error),
        });
      }
    }

    void loadOverviewTenants();

    return () => {
      active = false;
    };
  }, [permissions.canReadTenants]);

  const tenants = overviewState.tenants;
  const loadedTenantCount = tenants.length;
  const statusSummary = createPlatformTenantStatusSummary(tenants);
  const attentionItems = createPlatformAttentionItems(tenants).slice(0, 5);
  const tenantsNeedingAction = attentionItems.length;
  const pendingSetupCount = statusSummary.pending_setup;
  const hasTenantData = overviewState.status === 'loaded' && tenants.length > 0;

  return (
    <>
      {!permissions.canReadTenants ? (
        <ForbiddenState
          title="Platform overview unavailable"
          requiredPermission="platform.tenants.read"
          description="Your platform session does not include permission to view tenant overview data."
        />
      ) : null}

      {permissions.canReadTenants ? (
        <>
          {overviewState.status === 'loading' || overviewState.status === 'idle' ? (
            <PlatformOverviewSkeleton />
          ) : null}

          {overviewState.status === 'error' ? (
            overviewState.code === 'forbidden' ? (
              <ForbiddenState
                title="Platform overview blocked"
                requiredPermission="platform.tenants.read"
                description={overviewState.message}
                detail={overviewState.detail}
              />
            ) : (
              <Alert variant="destructive">
                <p className="text-sm font-bold">{overviewState.message}</p>
                {overviewState.detail === null ? null : (
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {overviewState.detail}
                  </p>
                )}
              </Alert>
            )
          ) : null}

          {overviewState.status === 'loaded' ? (
            <>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <SummaryCard
                  title="Loaded tenants"
                  value={String(loadedTenantCount)}
                  description={
                    hasTenantData
                      ? 'Loaded from the first page of platform tenant records visible to this session.'
                      : 'No tenant records are visible in the current platform view.'
                  }
                />
                <SummaryCard
                  title="Tenants needing action"
                  value={String(tenantsNeedingAction)}
                  description="Includes grace period, read-only, suspended, pending deletion, and setup blockers."
                />
                <SummaryCard
                  title="Setup not finished"
                  value={String(pendingSetupCount)}
                  description="Tenants in pending setup remain blocked from operational modules."
                />
                <SummaryCard
                  title="Active support sessions"
                  value="Planned"
                  description="Aggregate support-session counts need a dedicated support access list API."
                />
              </div>

              <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]">
                <SubscriptionHealthCard
                  statusSummary={statusSummary}
                  loadedTenantCount={loadedTenantCount}
                />
                <PlatformAttentionNeededCard items={attentionItems} />
              </div>

              <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.8fr)_minmax(0,0.9fr)]">
                <RecentPlatformActivityCard canReadAuditLogs={permissions.canReadAuditLogs} />
                <PlatformQuickActionsCard permissions={permissions} />
                <SupportAccessPolicyCard />
              </div>
            </>
          ) : null}
        </>
      ) : null}
    </>
  );
}
