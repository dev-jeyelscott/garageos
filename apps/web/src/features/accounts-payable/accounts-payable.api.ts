import { getAccessTokenOrRefresh, getAuthJsonEnvelope } from '../auth/actions/login.action';
import { type ApiClientError, type ApiPaginationMeta } from '../../lib/api-envelope';

import { accountsPayablePageSize } from './accounts-payable.defaults';
import type {
  AccountsPayableBranchBalance,
  AccountsPayableFilters,
  AccountsPayableListResult,
  AccountsPayableReportScope,
  AccountsPayableSummaryResult,
  AccountsPayableSupplierBalance,
  AccountsPayableSupplierStatus,
  AccountsPayableTotals,
} from './accounts-payable.types';

export async function getAccountsPayableList({
  filters,
  cursor = null,
  limit,
}: {
  readonly filters: AccountsPayableFilters;
  readonly cursor?: string | null;
  readonly limit: number;
}): Promise<AccountsPayableListResult> {
  const accessToken = await getAccessTokenOrRefresh();
  const params = toAccountsPayableParams(filters);

  params.set('limit', String(limit));

  if (cursor !== null && cursor.length > 0) {
    params.set('cursor', cursor);
  }

  const envelope = await getAuthJsonEnvelope<unknown>(`/accounts/payable?${params.toString()}`, {
    accessToken,
  });

  return normalizeAccountsPayableListPayload(envelope.data, {
    requestId: readMetaString(envelope.meta.request_id),
    correlationId: readMetaString(envelope.meta.correlation_id),
    pagination: normalizePagination(envelope.meta.pagination),
  });
}

export async function getAccountsPayableSummary({
  filters,
}: {
  readonly filters: AccountsPayableFilters;
}): Promise<AccountsPayableSummaryResult> {
  const accessToken = await getAccessTokenOrRefresh();
  const params = toAccountsPayableParams(filters);
  const envelope = await getAuthJsonEnvelope<unknown>(
    `/accounts/payable/summary?${params.toString()}`,
    {
      accessToken,
    },
  );

  return normalizeAccountsPayableSummaryPayload(envelope.data, {
    requestId: readMetaString(envelope.meta.request_id),
    correlationId: readMetaString(envelope.meta.correlation_id),
  });
}

function toAccountsPayableParams(filters: AccountsPayableFilters): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.branch_id !== null && filters.branch_id.length > 0) {
    params.set('branch_id', filters.branch_id);
  }

  if (filters.supplier_id !== null && filters.supplier_id.length > 0) {
    params.set('supplier_id', filters.supplier_id);
  }

  if (filters.include_zero) {
    params.set('include_zero', 'true');
  }

  return params;
}

function normalizeAccountsPayableListPayload(
  data: unknown,
  meta: {
    readonly requestId: string | null;
    readonly correlationId: string | null;
    readonly pagination: ApiPaginationMeta | null;
  },
): AccountsPayableListResult {
  if (!isObjectRecord(data)) {
    throw toInvalidAccountsPayableResponseError(
      'The accounts payable list response did not contain an object payload.',
      meta,
    );
  }

  const balances = normalizeSupplierBalances(data.balances ?? data.items ?? data.results);

  if (balances === null) {
    throw toInvalidAccountsPayableResponseError(
      'The accounts payable list response did not contain valid supplier balances.',
      meta,
    );
  }

  return {
    scope: isReportScope(data.scope) ? data.scope : 'tenant',
    branch_ids: normalizeStringArrayOrNull(data.branch_ids),
    balances,
    pagination: normalizePagination(data.pagination) ??
      meta.pagination ?? {
        limit: accountsPayablePageSize,
        next_cursor: null,
        has_more: false,
      },
  };
}

function normalizeAccountsPayableSummaryPayload(
  data: unknown,
  meta: {
    readonly requestId: string | null;
    readonly correlationId: string | null;
  },
): AccountsPayableSummaryResult {
  if (!isObjectRecord(data)) {
    throw toInvalidAccountsPayableResponseError(
      'The accounts payable summary response did not contain an object payload.',
      meta,
    );
  }

  const totals = normalizeTotals(data.totals);
  const bySupplier = normalizeSupplierBalances(data.by_supplier);
  const byBranch = normalizeBranchBalances(data.by_branch);

  if (totals === null || bySupplier === null || byBranch === null) {
    throw toInvalidAccountsPayableResponseError(
      'The accounts payable summary response did not contain valid totals and breakdowns.',
      meta,
    );
  }

  return {
    scope: isReportScope(data.scope) ? data.scope : 'tenant',
    branch_ids: normalizeStringArrayOrNull(data.branch_ids),
    totals,
    by_supplier: bySupplier,
    by_branch: byBranch,
  };
}

function normalizeSupplierBalances(
  value: unknown,
): readonly AccountsPayableSupplierBalance[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const balances: AccountsPayableSupplierBalance[] = [];

  for (const item of value) {
    const balance = normalizeSupplierBalance(item);

    if (balance === null) {
      return null;
    }

    balances.push(balance);
  }

  return balances;
}

function normalizeSupplierBalance(value: unknown): AccountsPayableSupplierBalance | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  const totals = normalizeTotals(value);

  if (
    totals === null ||
    typeof value.supplier_id !== 'string' ||
    typeof value.supplier_name !== 'string' ||
    !isSupplierStatus(value.supplier_status) ||
    typeof value.last_activity_at !== 'string'
  ) {
    return null;
  }

  return {
    supplier_id: value.supplier_id,
    supplier_name: value.supplier_name,
    supplier_status: value.supplier_status,
    ...totals,
    last_activity_at: value.last_activity_at,
  };
}

function normalizeBranchBalances(value: unknown): readonly AccountsPayableBranchBalance[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const balances: AccountsPayableBranchBalance[] = [];

  for (const item of value) {
    const balance = normalizeBranchBalance(item);

    if (balance === null) {
      return null;
    }

    balances.push(balance);
  }

  return balances;
}

function normalizeBranchBalance(value: unknown): AccountsPayableBranchBalance | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  const creditPurchaseReceivedTotal = readMoneyString(value.credit_purchase_received_total);
  const supplierCreditTotal = readMoneyString(value.supplier_credit_total);
  const sourceBalance = readMoneyString(value.source_balance);

  if (
    typeof value.branch_id !== 'string' ||
    typeof value.branch_name !== 'string' ||
    !isSupplierStatus(value.branch_status) ||
    typeof value.supplier_id !== 'string' ||
    typeof value.supplier_name !== 'string' ||
    creditPurchaseReceivedTotal === null ||
    supplierCreditTotal === null ||
    sourceBalance === null ||
    typeof value.last_activity_at !== 'string'
  ) {
    return null;
  }

  return {
    branch_id: value.branch_id,
    branch_name: value.branch_name,
    branch_status: value.branch_status,
    supplier_id: value.supplier_id,
    supplier_name: value.supplier_name,
    credit_purchase_received_total: creditPurchaseReceivedTotal,
    supplier_credit_total: supplierCreditTotal,
    source_balance: sourceBalance,
    last_activity_at: value.last_activity_at,
  };
}

function normalizeTotals(value: unknown): AccountsPayableTotals | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  const creditPurchaseReceivedTotal = readMoneyString(value.credit_purchase_received_total);
  const supplierPaymentTotal = readMoneyString(value.supplier_payment_total);
  const supplierCreditTotal = readMoneyString(value.supplier_credit_total);
  const payableBalance = readMoneyString(value.payable_balance);

  if (
    creditPurchaseReceivedTotal === null ||
    supplierPaymentTotal === null ||
    supplierCreditTotal === null ||
    payableBalance === null
  ) {
    return null;
  }

  return {
    credit_purchase_received_total: creditPurchaseReceivedTotal,
    supplier_payment_total: supplierPaymentTotal,
    supplier_credit_total: supplierCreditTotal,
    payable_balance: payableBalance,
  };
}

function normalizePagination(value: unknown): ApiPaginationMeta | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  const rawLimit = value.limit;
  const limit =
    typeof rawLimit === 'number'
      ? rawLimit
      : typeof rawLimit === 'string'
        ? Number(rawLimit)
        : accountsPayablePageSize;

  return {
    limit: Number.isFinite(limit) ? limit : accountsPayablePageSize,
    next_cursor: typeof value.next_cursor === 'string' ? value.next_cursor : null,
    has_more: value.has_more === true,
  };
}

function normalizeStringArrayOrNull(value: unknown): readonly string[] | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (!Array.isArray(value)) {
    return null;
  }

  const strings = value.filter((item): item is string => typeof item === 'string');

  return strings.length === value.length ? strings : null;
}

function readMoneyString(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toFixed(2);
  }

  return null;
}

function isReportScope(value: unknown): value is AccountsPayableReportScope {
  return value === 'tenant' || value === 'branch_source';
}

function isSupplierStatus(value: unknown): value is AccountsPayableSupplierStatus {
  return value === 'active' || value === 'inactive';
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readMetaString(value: string | undefined): string | null {
  return value === undefined || value.length === 0 ? null : value;
}

function toInvalidAccountsPayableResponseError(
  message: string,
  meta: {
    readonly requestId: string | null;
    readonly correlationId: string | null;
  },
): ApiClientError {
  return {
    code: 'invalid_api_response',
    message,
    status: 500,
    details: [],
    requestId: meta.requestId,
    correlationId: meta.correlationId,
  };
}
