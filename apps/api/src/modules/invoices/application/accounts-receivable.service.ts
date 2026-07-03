import { Inject, Injectable } from '@nestjs/common';

import { GarageOsApiException } from '../../../shared/api/api-exception';
import { assertBranchAccessAllowed } from '../../../shared/authorization/branch-access';
import {
  assertTenantLifecycleAccess,
  TENANT_ACCESS_ACTIONS,
} from '../../../shared/authorization/tenant-lifecycle-access.policy';
import {
  resolveTenantContextFromAuthenticatedSession,
  type ResolvedTenantContext,
  type TenantContextAuthenticatedSession,
} from '../../../shared/tenant-context/tenant-context';
import {
  ACCOUNTS_RECEIVABLE_AGING_BUCKET_VALUES,
  type AccountsReceivableAgingBucket,
  type AccountsReceivableInvoiceRecord,
  type AccountsReceivableSummaryRecord,
} from './accounts-receivable.records';
import { AccountsReceivableStore } from './accounts-receivable.store';
import type {
  ListAccountsReceivableQuery,
  SummarizeAccountsReceivableQuery,
} from '../api/accounts-receivable.schemas';

export interface AccountsReceivableItemResponse {
  readonly invoice_id: string;
  readonly invoice_number: string;
  readonly customer_id: string;
  readonly customer_name: string;
  readonly branch_id: string;
  readonly invoice_total: string;
  readonly amount_paid: string;
  readonly remaining_collectible_balance: string;
  readonly due_date: string | null;
  readonly status: AccountsReceivableInvoiceRecord['status'];
  readonly aging_bucket: AccountsReceivableAgingBucket;
}

export interface AccountsReceivableListResponse {
  readonly receivables: readonly AccountsReceivableItemResponse[];
}

export interface AccountsReceivableBucketSummaryResponse {
  readonly aging_bucket: AccountsReceivableAgingBucket;
  readonly invoice_count: number;
  readonly remaining_collectible_balance: string;
}

export interface AccountsReceivableSummaryResponse {
  readonly total_open_invoice_count: number;
  readonly total_remaining_collectible_balance: string;
  readonly aging_buckets: readonly AccountsReceivableBucketSummaryResponse[];
}

@Injectable()
export class AccountsReceivableService {
  constructor(
    @Inject(AccountsReceivableStore)
    private readonly accountsReceivableStore: AccountsReceivableStore,
  ) {}

  async listAccountsReceivable(
    query: ListAccountsReceivableQuery,
    session: TenantContextAuthenticatedSession,
  ): Promise<AccountsReceivableListResponse> {
    const { context } = await this.resolveAuthorizedContext(session, [
      'invoices.read',
      'reports.view_basic',
    ]);
    const branchIds = resolveReadableBranchScope(context, query.branch_id ?? null);

    const receivables = await this.accountsReceivableStore.listAccountsReceivable({
      tenantId: context.tenantId,
      branchIds,
      branchId: query.branch_id ?? null,
      customerId: query.customer_id ?? null,
      status: query.status ?? null,
      fromDate: query.from_date ?? null,
      toDate: query.to_date ?? null,
      asOfDate: query.as_of_date ?? null,
      limit: query.limit,
    });

    return {
      receivables: receivables.map(toAccountsReceivableItemResponse),
    };
  }

  async summarizeAccountsReceivable(
    query: SummarizeAccountsReceivableQuery,
    session: TenantContextAuthenticatedSession,
  ): Promise<AccountsReceivableSummaryResponse> {
    const { context } = await this.resolveAuthorizedContext(session, ['reports.view_basic']);
    const branchIds = resolveReadableBranchScope(context, query.branch_id ?? null);

    const summaryRows = await this.accountsReceivableStore.summarizeAccountsReceivable({
      tenantId: context.tenantId,
      branchIds,
      branchId: query.branch_id ?? null,
      customerId: query.customer_id ?? null,
      fromDate: query.from_date ?? null,
      toDate: query.to_date ?? null,
      asOfDate: query.as_of_date ?? null,
    });
    const rowsByBucket = new Map(summaryRows.map((row) => [row.agingBucket, row] as const));
    const agingBuckets = ACCOUNTS_RECEIVABLE_AGING_BUCKET_VALUES.map((agingBucket) =>
      toAccountsReceivableBucketSummaryResponse(
        rowsByBucket.get(agingBucket) ?? {
          agingBucket,
          invoiceCount: 0,
          remainingCollectibleBalance: '0.00',
        },
      ),
    );

    return {
      total_open_invoice_count: agingBuckets.reduce(
        (total, bucket) => total + bucket.invoice_count,
        0,
      ),
      total_remaining_collectible_balance: formatMoneyCents(
        agingBuckets.reduce(
          (total, bucket) => total + parseMoneyCents(bucket.remaining_collectible_balance),
          0n,
        ),
      ),
      aging_buckets: agingBuckets,
    };
  }

  private async resolveAuthorizedContext(
    session: TenantContextAuthenticatedSession,
    permissions: readonly string[],
  ): Promise<{ readonly context: ResolvedTenantContext; readonly isShopOwner: boolean }> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.accountsReceivableStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_READ,
    });
    assertAnyAccountsReceivablePermission(context, isShopOwner, permissions);

    return { context, isShopOwner };
  }
}

function resolveReadableBranchScope(
  context: ResolvedTenantContext,
  requestedBranchId: string | null,
): readonly string[] | null {
  if (requestedBranchId !== null) {
    assertBranchAccessAllowed({ context, branchId: requestedBranchId });

    return [requestedBranchId];
  }

  return context.tenantWideBranchAccess ? null : context.assignedBranchIds;
}

function assertAnyAccountsReceivablePermission(
  context: ResolvedTenantContext,
  isShopOwner: boolean,
  permissions: readonly string[],
): void {
  if (
    isShopOwner ||
    permissions.some((permission) => context.effectivePermissions.includes(permission))
  ) {
    return;
  }

  throw GarageOsApiException.forbidden(permissions.join(' or '));
}

function toAccountsReceivableItemResponse(
  record: AccountsReceivableInvoiceRecord,
): AccountsReceivableItemResponse {
  return {
    invoice_id: record.invoiceId,
    invoice_number: record.invoiceNumber,
    customer_id: record.customerId,
    customer_name: record.customerName,
    branch_id: record.branchId,
    invoice_total: record.invoiceTotal,
    amount_paid: record.amountPaid,
    remaining_collectible_balance: record.remainingCollectibleBalance,
    due_date: record.dueDate,
    status: record.status,
    aging_bucket: record.agingBucket,
  };
}

function toAccountsReceivableBucketSummaryResponse(
  record: AccountsReceivableSummaryRecord,
): AccountsReceivableBucketSummaryResponse {
  return {
    aging_bucket: record.agingBucket,
    invoice_count: record.invoiceCount,
    remaining_collectible_balance: record.remainingCollectibleBalance,
  };
}

function parseMoneyCents(value: string): bigint {
  const normalized = value.trim();
  const [whole = '0', cents = '0'] = normalized.split('.');

  return BigInt(whole) * 100n + BigInt(cents.padEnd(2, '0').slice(0, 2));
}

function formatMoneyCents(value: bigint): string {
  const sign = value < 0n ? '-' : '';
  const absolute = value < 0n ? -value : value;
  const whole = absolute / 100n;
  const cents = absolute % 100n;

  return `${sign}${whole}.${cents.toString().padStart(2, '0')}`;
}
