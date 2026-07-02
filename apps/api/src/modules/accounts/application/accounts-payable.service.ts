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
import type {
  AccountsPayableListQuery,
  AccountsPayableSummaryQuery,
} from '../api/accounts-payable.schemas';
import {
  calculateAccountsPayableBalance,
  sumAccountsPayableCalculations,
  type AccountsPayableCalculationResult,
} from './accounts-payable.calculation';
import {
  AccountsPayableStore,
  type AccountsPayableBranchBasisRecord,
  type AccountsPayableListCursor,
  type AccountsPayableReportScope,
  type AccountsPayableSupplierBasisRecord,
} from './accounts-payable.store';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SUPPLIER_PAYMENT_READ_PERMISSION = 'supplier_payments.read';
const BASIC_REPORT_PERMISSION = 'reports.view_basic';

export interface AccountsPayableTotalsResponse {
  readonly credit_purchase_received_total: string;
  readonly supplier_payment_total: string;
  readonly supplier_credit_total: string;
  readonly payable_balance: string;
}

export interface AccountsPayableSupplierBalanceResponse extends AccountsPayableTotalsResponse {
  readonly supplier_id: string;
  readonly supplier_name: string;
  readonly supplier_status: 'active' | 'inactive';
  readonly last_activity_at: string;
}

export interface AccountsPayableBranchBalanceResponse {
  readonly branch_id: string;
  readonly branch_name: string;
  readonly branch_status: 'active' | 'inactive';
  readonly supplier_id: string;
  readonly supplier_name: string;
  readonly credit_purchase_received_total: string;
  readonly supplier_credit_total: string;
  readonly source_balance: string;
  readonly last_activity_at: string;
}

export interface AccountsPayablePaginationResponse {
  readonly limit: number;
  readonly next_cursor: string | null;
  readonly has_more: boolean;
}

export interface AccountsPayableListResponse {
  readonly scope: AccountsPayableReportScope;
  readonly branch_ids: readonly string[] | null;
  readonly balances: readonly AccountsPayableSupplierBalanceResponse[];
  readonly pagination: AccountsPayablePaginationResponse;
}

export interface AccountsPayableSummaryResponse {
  readonly scope: AccountsPayableReportScope;
  readonly branch_ids: readonly string[] | null;
  readonly totals: AccountsPayableTotalsResponse;
  readonly by_supplier: readonly AccountsPayableSupplierBalanceResponse[];
  readonly by_branch: readonly AccountsPayableBranchBalanceResponse[];
}

interface ResolvedAccountsPayableScope {
  readonly reportScope: AccountsPayableReportScope;
  readonly branchIds: readonly string[] | null;
}

@Injectable()
export class AccountsPayableService {
  constructor(
    @Inject(AccountsPayableStore)
    private readonly accountsPayableStore: AccountsPayableStore,
  ) {}

  async listPayables(
    query: AccountsPayableListQuery,
    session: TenantContextAuthenticatedSession,
  ): Promise<AccountsPayableListResponse> {
    const context = await this.resolveReadContext(session, {
      allowSupplierPaymentRead: true,
      allowBasicReportRead: true,
    });
    const scope = resolveAccountsPayableScope(context, query.branch_id ?? null);

    if (scope.branchIds !== null && scope.branchIds.length === 0) {
      return {
        scope: scope.reportScope,
        branch_ids: scope.branchIds,
        balances: [],
        pagination: {
          limit: query.limit,
          next_cursor: null,
          has_more: false,
        },
      };
    }

    const records = await this.accountsPayableStore.listSupplierBalances({
      tenantId: context.tenantId,
      reportScope: scope.reportScope,
      branchIds: scope.branchIds,
      supplierId: query.supplier_id ?? null,
      includeZero: query.include_zero,
      limit: query.limit + 1,
      cursor: decodeAccountsPayableListCursor(query.cursor),
    });
    const visibleRecords = records.slice(0, query.limit);
    const hasMore = records.length > query.limit;

    return {
      scope: scope.reportScope,
      branch_ids: scope.branchIds,
      balances: visibleRecords.map(toSupplierBalanceResponse),
      pagination: {
        limit: query.limit,
        has_more: hasMore,
        next_cursor: hasMore
          ? encodeAccountsPayableListCursor(visibleRecords.at(-1) ?? null)
          : null,
      },
    };
  }

  async getPayableSummary(
    query: AccountsPayableSummaryQuery,
    session: TenantContextAuthenticatedSession,
  ): Promise<AccountsPayableSummaryResponse> {
    const context = await this.resolveReadContext(session, {
      allowSupplierPaymentRead: false,
      allowBasicReportRead: true,
    });
    const scope = resolveAccountsPayableScope(context, query.branch_id ?? null);

    if (scope.branchIds !== null && scope.branchIds.length === 0) {
      return {
        scope: scope.reportScope,
        branch_ids: scope.branchIds,
        totals: toTotalsResponse(emptyCalculation()),
        by_supplier: [],
        by_branch: [],
      };
    }

    const summary = await this.accountsPayableStore.getSummaryBasis({
      tenantId: context.tenantId,
      reportScope: scope.reportScope,
      branchIds: scope.branchIds,
      supplierId: query.supplier_id ?? null,
      includeZero: query.include_zero,
    });
    const bySupplier = summary.suppliers.map(toSupplierBalanceResponse);

    return {
      scope: scope.reportScope,
      branch_ids: scope.branchIds,
      totals: toTotalsResponse(sumAccountsPayableCalculations(bySupplier.map(toCalculationResult))),
      by_supplier: bySupplier,
      by_branch: summary.branches.map(toBranchBalanceResponse),
    };
  }

  private async resolveReadContext(
    session: TenantContextAuthenticatedSession,
    permissions: {
      readonly allowSupplierPaymentRead: boolean;
      readonly allowBasicReportRead: boolean;
    },
  ): Promise<ResolvedTenantContext> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.accountsPayableStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_READ,
    });
    assertAccountsPayablePermission(context, isShopOwner, permissions);

    return context;
  }
}

function resolveAccountsPayableScope(
  context: ResolvedTenantContext,
  requestedBranchId: string | null,
): ResolvedAccountsPayableScope {
  if (requestedBranchId !== null) {
    const branchId = normalizeUuid(requestedBranchId, 'branch_id');

    assertBranchAccessAllowed({ context, branchId });

    return {
      reportScope: 'branch_source',
      branchIds: [branchId],
    };
  }

  if (context.tenantWideBranchAccess) {
    return {
      reportScope: 'tenant',
      branchIds: null,
    };
  }

  return {
    reportScope: 'branch_source',
    branchIds: [
      ...new Set(
        context.assignedBranchIds
          .map((branchId) => branchId.trim())
          .filter((branchId) => branchId.length > 0),
      ),
    ],
  };
}

function assertAccountsPayablePermission(
  context: ResolvedTenantContext,
  isShopOwner: boolean,
  permissions: {
    readonly allowSupplierPaymentRead: boolean;
    readonly allowBasicReportRead: boolean;
  },
): void {
  if (isShopOwner) {
    return;
  }

  const allowed =
    (permissions.allowSupplierPaymentRead &&
      context.effectivePermissions.includes(SUPPLIER_PAYMENT_READ_PERMISSION)) ||
    (permissions.allowBasicReportRead &&
      context.effectivePermissions.includes(BASIC_REPORT_PERMISSION));

  if (!allowed) {
    throw GarageOsApiException.forbidden(
      permissions.allowSupplierPaymentRead
        ? SUPPLIER_PAYMENT_READ_PERMISSION
        : BASIC_REPORT_PERMISSION,
    );
  }
}

function toSupplierBalanceResponse(
  record: AccountsPayableSupplierBasisRecord,
): AccountsPayableSupplierBalanceResponse {
  const calculation = calculateAccountsPayableBalance({
    creditPurchaseReceivedTotal: record.creditPurchaseReceivedTotal,
    supplierPaymentTotal: record.supplierPaymentTotal,
    supplierCreditTotal: record.supplierCreditTotal,
  });

  return {
    supplier_id: record.supplierId,
    supplier_name: record.supplierName,
    supplier_status: record.supplierStatus,
    ...toTotalsResponse(calculation),
    last_activity_at: record.lastActivityAt.toISOString(),
  };
}

function toBranchBalanceResponse(
  record: AccountsPayableBranchBasisRecord,
): AccountsPayableBranchBalanceResponse {
  const sourceBalance = calculateAccountsPayableBalance({
    creditPurchaseReceivedTotal: record.creditPurchaseReceivedTotal,
    supplierPaymentTotal: '0.00',
    supplierCreditTotal: record.supplierCreditTotal,
  }).payableBalance;

  return {
    branch_id: record.branchId,
    branch_name: record.branchName,
    branch_status: record.branchStatus,
    supplier_id: record.supplierId,
    supplier_name: record.supplierName,
    credit_purchase_received_total: record.creditPurchaseReceivedTotal,
    supplier_credit_total: record.supplierCreditTotal,
    source_balance: sourceBalance,
    last_activity_at: record.lastActivityAt.toISOString(),
  };
}

function toTotalsResponse(
  calculation: AccountsPayableCalculationResult,
): AccountsPayableTotalsResponse {
  return {
    credit_purchase_received_total: calculation.creditPurchaseReceivedTotal,
    supplier_payment_total: calculation.supplierPaymentTotal,
    supplier_credit_total: calculation.supplierCreditTotal,
    payable_balance: calculation.payableBalance,
  };
}

function toCalculationResult(
  balance: AccountsPayableSupplierBalanceResponse,
): AccountsPayableCalculationResult {
  return {
    creditPurchaseReceivedTotal: balance.credit_purchase_received_total,
    supplierPaymentTotal: balance.supplier_payment_total,
    supplierCreditTotal: balance.supplier_credit_total,
    payableBalance: balance.payable_balance,
  };
}

function emptyCalculation(): AccountsPayableCalculationResult {
  return {
    creditPurchaseReceivedTotal: '0.00',
    supplierPaymentTotal: '0.00',
    supplierCreditTotal: '0.00',
    payableBalance: '0.00',
  };
}

function encodeAccountsPayableListCursor(
  record: AccountsPayableSupplierBasisRecord | null,
): string | null {
  if (record === null) {
    return null;
  }

  return Buffer.from(
    JSON.stringify({
      last_activity_at: record.lastActivityAt.toISOString(),
      supplier_id: record.supplierId,
    }),
  ).toString('base64url');
}

function decodeAccountsPayableListCursor(
  value: string | undefined,
): AccountsPayableListCursor | null {
  if (value === undefined || value.trim().length === 0) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown;

    if (!isCursorPayload(decoded)) {
      return null;
    }

    const lastActivityAt = new Date(decoded.last_activity_at);

    if (Number.isNaN(lastActivityAt.getTime())) {
      return null;
    }

    return {
      lastActivityAt,
      supplierId: decoded.supplier_id,
    };
  } catch {
    return null;
  }
}

function isCursorPayload(
  value: unknown,
): value is { readonly last_activity_at: string; readonly supplier_id: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'last_activity_at' in value &&
    typeof (value as { last_activity_at?: unknown }).last_activity_at === 'string' &&
    'supplier_id' in value &&
    typeof (value as { supplier_id?: unknown }).supplier_id === 'string'
  );
}

function normalizeUuid(value: string, field: string): string {
  const normalizedValue = value.trim();

  if (!UUID_PATTERN.test(normalizedValue)) {
    throw GarageOsApiException.validationFailed([
      {
        field,
        code: 'invalid_uuid',
        message: `${field} must be a valid UUID.`,
      },
    ]);
  }

  return normalizedValue;
}
