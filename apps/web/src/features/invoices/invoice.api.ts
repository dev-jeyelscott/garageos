import {
  getAccessTokenOrRefresh,
  getAuthJsonEnvelope,
  postAuthJson,
} from '../auth/actions/login.action';
import { type ApiClientError, type ApiPaginationMeta } from '../../lib/api-envelope';

import { invoiceListPageSize } from './invoice.defaults';
import type {
  CreateDraftInvoiceInput,
  CreateInvoicePaymentInput,
  CreateInvoiceRefundInput,
  InvoiceDetail,
  InvoiceInventoryReversal,
  InvoiceLineItem,
  InvoiceListFilters,
  InvoiceListItem,
  InvoiceListResult,
  InvoicePayment,
  InvoicePaymentMethod,
  InvoicePaymentMutationResult,
  InvoiceReceipt,
  InvoiceRefund,
  InvoiceRefundMutationResult,
  InvoiceStatus,
  InvoiceStatusEvent,
  InvoiceWorkflowReasonInput,
} from './invoice.types';

export function buildInvoiceListSearchParams({
  filters,
  limit,
  cursor,
}: {
  readonly filters: InvoiceListFilters;
  readonly limit: number;
  readonly cursor?: string | null | undefined;
}): URLSearchParams {
  const params = new URLSearchParams();

  params.set('limit', String(limit));

  const normalizedCursor = cursor?.trim() ?? '';

  if (normalizedCursor.length > 0) {
    params.set('cursor', normalizedCursor);
  }

  if (filters.status !== 'all') {
    params.set('status', filters.status);
  }

  if (filters.branch_id !== 'all' && filters.branch_id.length > 0) {
    params.set('branch_id', filters.branch_id);
  }

  if (filters.customer_id.length > 0) {
    params.set('customer_id', filters.customer_id);
  }

  if (filters.from_date.length > 0) {
    params.set('from_date', filters.from_date);
  }

  if (filters.to_date.length > 0) {
    params.set('to_date', filters.to_date);
  }

  return params;
}

export async function getInvoices({
  filters,
  limit,
  cursor,
}: {
  readonly filters: InvoiceListFilters;
  readonly limit: number;
  readonly cursor?: string | null | undefined;
}): Promise<InvoiceListResult> {
  const accessToken = await getAccessTokenOrRefresh();
  const params = buildInvoiceListSearchParams({ filters, limit, cursor });

  const envelope = await getAuthJsonEnvelope<unknown>(`/invoices?${params.toString()}`, {
    accessToken,
  });

  return normalizeInvoiceListPayload(envelope.data, {
    requestId: readMetaString(envelope.meta.request_id),
    correlationId: readMetaString(envelope.meta.correlation_id),
    pagination: normalizeInvoicePagination(envelope.meta.pagination),
  });
}

export async function getInvoice(invoiceId: string): Promise<InvoiceDetail> {
  const accessToken = await getAccessTokenOrRefresh();
  const invoiceEnvelope = await getAuthJsonEnvelope<unknown>(
    `/invoices/${encodeURIComponent(invoiceId)}`,
    { accessToken },
  );
  const statusEventsEnvelope = await getAuthJsonEnvelope<unknown>(
    `/invoices/${encodeURIComponent(invoiceId)}/status-events`,
    { accessToken },
  );
  const receiptsEnvelope = await getAuthJsonEnvelope<unknown>('/receipts?limit=100', {
    accessToken,
  });
  const receipts = normalizeReceiptListPayload(receiptsEnvelope.data, {
    requestId: readMetaString(receiptsEnvelope.meta.request_id),
    correlationId: readMetaString(receiptsEnvelope.meta.correlation_id),
  }).filter((receipt) => receipt.invoice_id === invoiceId);

  return normalizeInvoiceDetailPayload(
    invoiceEnvelope.data,
    normalizeStatusEventsPayload(statusEventsEnvelope.data),
    receipts,
    {
      requestId: readMetaString(invoiceEnvelope.meta.request_id),
      correlationId: readMetaString(invoiceEnvelope.meta.correlation_id),
    },
  );
}

export async function createDraftInvoice({
  input,
  idempotencyKey,
}: {
  readonly input: CreateDraftInvoiceInput;
  readonly idempotencyKey: string;
}): Promise<InvoiceDetail> {
  const data = await postAuthJson<unknown>('/invoices', input, {
    idempotencyKey,
    requiresAuth: true,
  });

  return normalizeInvoiceDetailPayload(data, [], [], { requestId: null, correlationId: null });
}

export async function recordInvoicePayment({
  invoiceId,
  input,
  idempotencyKey,
}: {
  readonly invoiceId: string;
  readonly input: CreateInvoicePaymentInput;
  readonly idempotencyKey: string;
}): Promise<InvoicePaymentMutationResult> {
  const data = await postAuthJson<unknown>(
    `/invoices/${encodeURIComponent(invoiceId)}/payments`,
    input,
    { idempotencyKey, requiresAuth: true },
  );

  return normalizePaymentMutationPayload(data, { requestId: null, correlationId: null });
}
export async function recordPaymentRefund({
  paymentId,
  input,
  idempotencyKey,
}: {
  readonly paymentId: string;
  readonly input: CreateInvoiceRefundInput;
  readonly idempotencyKey: string;
}): Promise<InvoiceRefundMutationResult> {
  const data = await postAuthJson<unknown>(
    `/payments/${encodeURIComponent(paymentId)}/refunds`,
    input,
    { idempotencyKey, requiresAuth: true },
  );

  return normalizeRefundMutationPayload(data, { requestId: null, correlationId: null });
}

export async function getReceiptPrintMetadata(receiptId: string): Promise<InvoiceReceipt> {
  const accessToken = await getAccessTokenOrRefresh();
  const envelope = await getAuthJsonEnvelope<unknown>(
    `/receipts/${encodeURIComponent(receiptId)}/print`,
    { accessToken },
  );

  return normalizeReceiptDetailPayload(envelope.data, {
    requestId: readMetaString(envelope.meta.request_id),
    correlationId: readMetaString(envelope.meta.correlation_id),
  });
}

export async function issueInvoice({
  invoiceId,
  idempotencyKey,
}: {
  readonly invoiceId: string;
  readonly idempotencyKey: string;
}): Promise<InvoiceDetail> {
  const data = await postAuthJson<unknown>(
    `/invoices/${encodeURIComponent(invoiceId)}/issue`,
    {},
    { idempotencyKey, requiresAuth: true },
  );

  return normalizeInvoiceDetailPayload(data, [], [], { requestId: null, correlationId: null });
}

export async function cancelInvoice({
  invoiceId,
  input,
  idempotencyKey,
}: {
  readonly invoiceId: string;
  readonly input: InvoiceWorkflowReasonInput;
  readonly idempotencyKey: string;
}): Promise<InvoiceDetail> {
  const data = await postAuthJson<unknown>(
    `/invoices/${encodeURIComponent(invoiceId)}/cancel`,
    input,
    { idempotencyKey, requiresAuth: true },
  );

  return normalizeInvoiceDetailPayload(data, [], [], { requestId: null, correlationId: null });
}

export async function voidInvoice({
  invoiceId,
  input,
  idempotencyKey,
}: {
  readonly invoiceId: string;
  readonly input: InvoiceWorkflowReasonInput;
  readonly idempotencyKey: string;
}): Promise<InvoiceDetail> {
  const data = await postAuthJson<unknown>(
    `/invoices/${encodeURIComponent(invoiceId)}/void`,
    input,
    { idempotencyKey, requiresAuth: true },
  );

  return normalizeInvoiceDetailPayload(data, [], [], { requestId: null, correlationId: null });
}

export function normalizeInvoiceListPayload(
  data: unknown,
  meta: {
    readonly requestId: string | null;
    readonly correlationId: string | null;
    readonly pagination: ApiPaginationMeta | null;
  },
): InvoiceListResult {
  if (Array.isArray(data)) {
    const invoices = normalizeInvoiceArray(data);

    if (invoices !== null) {
      return { invoices, pagination: meta.pagination };
    }
  }

  if (isObjectRecord(data)) {
    const invoices = readInvoiceArray(data);

    if (invoices !== null) {
      return {
        invoices,
        pagination: normalizeInvoicePagination(data.pagination) ?? meta.pagination,
      };
    }
  }

  throw toInvalidInvoiceListResponseError(meta);
}

export function normalizeInvoiceDetailPayload(
  data: unknown,
  statusEvents: readonly InvoiceStatusEvent[],
  receipts: readonly InvoiceReceipt[],
  meta: {
    readonly requestId: string | null;
    readonly correlationId: string | null;
  },
): InvoiceDetail {
  const detail = normalizeInvoiceDetail(data, statusEvents);

  if (detail !== null) {
    return { ...detail, receipts };
  }

  if (isObjectRecord(data)) {
    const candidates = [data.invoice, data.item, data.result];

    for (const candidate of candidates) {
      const nestedDetail = normalizeInvoiceDetail(candidate, statusEvents);

      if (nestedDetail !== null) {
        return { ...nestedDetail, receipts };
      }
    }
  }

  throw toInvalidInvoiceDetailResponseError(meta);
}

export function normalizeReceiptListPayload(
  data: unknown,
  meta: {
    readonly requestId: string | null;
    readonly correlationId: string | null;
  },
): readonly InvoiceReceipt[] {
  if (Array.isArray(data)) {
    const receipts = normalizeReceiptArray(data);

    if (receipts !== null) {
      return receipts;
    }
  }

  if (isObjectRecord(data)) {
    const candidates = [data.receipts, data.items, data.results];

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        const receipts = normalizeReceiptArray(candidate);

        if (receipts !== null) {
          return receipts;
        }
      }
    }
  }

  throw toInvalidReceiptResponseError(meta);
}

export function normalizePaymentMutationPayload(
  data: unknown,
  meta: {
    readonly requestId: string | null;
    readonly correlationId: string | null;
  },
): InvoicePaymentMutationResult {
  const result = normalizePaymentMutation(data);

  if (result !== null) {
    return result;
  }

  if (isObjectRecord(data)) {
    const candidates = [data.invoice_payment, data.payment_result, data.result, data.item];

    for (const candidate of candidates) {
      const nestedResult = normalizePaymentMutation(candidate);

      if (nestedResult !== null) {
        return nestedResult;
      }
    }
  }

  throw toInvalidPaymentResponseError(meta);
}

export function normalizeRefundMutationPayload(
  data: unknown,
  meta: {
    readonly requestId: string | null;
    readonly correlationId: string | null;
  },
): InvoiceRefundMutationResult {
  const result = normalizeRefundMutation(data);

  if (result !== null) {
    return result;
  }

  if (isObjectRecord(data)) {
    const candidates = [data.invoice_refund, data.refund_result, data.result, data.item];

    for (const candidate of candidates) {
      const nestedResult = normalizeRefundMutation(candidate);

      if (nestedResult !== null) {
        return nestedResult;
      }
    }
  }

  throw toInvalidRefundResponseError(meta);
}

function normalizeReceiptDetailPayload(
  data: unknown,
  meta: {
    readonly requestId: string | null;
    readonly correlationId: string | null;
  },
): InvoiceReceipt {
  const receipt = normalizeReceipt(data);

  if (receipt !== null) {
    return receipt;
  }

  if (isObjectRecord(data)) {
    const candidates = [data.receipt, data.item, data.result];

    for (const candidate of candidates) {
      const nestedReceipt = normalizeReceipt(candidate);

      if (nestedReceipt !== null) {
        return nestedReceipt;
      }
    }
  }

  throw toInvalidReceiptResponseError(meta);
}

function readInvoiceArray(data: Record<string, unknown>): readonly InvoiceListItem[] | null {
  const candidates = [data.invoices, data.items, data.results];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      const invoices = normalizeInvoiceArray(candidate);

      if (invoices !== null) {
        return invoices;
      }
    }
  }

  return null;
}

function normalizeInvoiceArray(values: readonly unknown[]): readonly InvoiceListItem[] | null {
  const invoices: InvoiceListItem[] = [];

  for (const value of values) {
    const invoice = normalizeInvoiceListItem(value);

    if (invoice === null) {
      return null;
    }

    invoices.push(invoice);
  }

  return invoices;
}

function normalizeInvoiceDetail(
  value: unknown,
  statusEvents: readonly InvoiceStatusEvent[],
): InvoiceDetail | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  const invoice = normalizeInvoiceListItem(value.invoice ?? value);

  if (invoice === null) {
    return null;
  }

  return {
    ...invoice,
    job_order_ids: normalizeStringArray(value.job_order_ids ?? value.jobOrderIds),
    lines: normalizeInvoiceLines(value.lines),
    status_events: statusEvents,
    receipts: [],
  };
}

function normalizeInvoiceListItem(value: unknown): InvoiceListItem | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  if (
    !(
      typeof value.id === 'string' &&
      typeof value.branch_id === 'string' &&
      typeof value.customer_id === 'string' &&
      typeof value.invoice_number === 'string' &&
      typeof value.invoice_date === 'string' &&
      isInvoiceStatus(value.status)
    )
  ) {
    return null;
  }

  return {
    id: value.id,
    branch_id: value.branch_id,
    branch_name: readNestedName(value, 'branch', 'branch_name'),
    customer_id: value.customer_id,
    customer_name: readNestedName(value, 'customer', 'customer_name'),
    invoice_number: value.invoice_number,
    invoice_date: value.invoice_date,
    due_date: readNullableString(value.due_date),
    status: value.status,
    tax_profile: readNullableString(value.tax_profile),
    tax_mode: readNullableString(value.tax_mode),
    vat_rate: readNullableMoneyString(value.vat_rate),
    subtotal_amount: readMoneyString(value.subtotal_amount),
    discount_amount: readMoneyString(value.discount_amount),
    tax_amount: readMoneyString(value.tax_amount),
    total_amount: readMoneyString(value.total_amount),
    amount_paid: readMoneyString(value.amount_paid),
    amount_refunded: readMoneyString(value.amount_refunded),
    remaining_collectible_balance: readMoneyString(value.remaining_collectible_balance),
    discount_reason: readNullableString(value.discount_reason),
    lock_version: readLockVersion(value.lock_version),
    created_at: readString(value.created_at),
    updated_at: readString(value.updated_at),
  };
}

function normalizeInvoiceLines(value: unknown): readonly InvoiceLineItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((line, index) => normalizeInvoiceLine(line, index))
    .filter((line): line is InvoiceLineItem => line !== null);
}

function normalizeInvoiceLine(value: unknown, index: number): InvoiceLineItem | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  return {
    id: readNullableString(value.id) ?? `line-${index}`,
    originating_job_order_line_id: readNullableString(value.originating_job_order_line_id),
    line_type: readString(value.line_type),
    product_id: readNullableString(value.product_id),
    service_id: readNullableString(value.service_id),
    description: readString(value.description),
    quantity: readQuantityString(value.quantity),
    unit_price: readMoneyString(value.unit_price),
    line_discount_amount: readMoneyString(value.line_discount_amount),
    allocated_invoice_discount_amount: readMoneyString(value.allocated_invoice_discount_amount),
    taxable_base_amount: readMoneyString(value.taxable_base_amount),
    tax_amount: readMoneyString(value.tax_amount),
    line_total: readMoneyString(value.line_total),
    line_order: readInteger(value.line_order, index),
  };
}

function normalizeStatusEventsPayload(data: unknown): readonly InvoiceStatusEvent[] {
  const rawEvents = isObjectRecord(data) ? data.status_events : data;

  if (!Array.isArray(rawEvents)) {
    return [];
  }

  return rawEvents
    .map(normalizeStatusEvent)
    .filter((event): event is InvoiceStatusEvent => event !== null);
}

function normalizeStatusEvent(value: unknown): InvoiceStatusEvent | null {
  if (!isObjectRecord(value) || !isInvoiceStatus(value.to_status)) {
    return null;
  }

  return {
    id: readString(value.id),
    invoice_id: readString(value.invoice_id),
    from_status: isInvoiceStatus(value.from_status) ? value.from_status : null,
    to_status: value.to_status,
    reason: readNullableString(value.reason),
    created_by_user_id: readString(value.created_by_user_id),
    created_at: readString(value.created_at),
  };
}

function normalizePaymentMutation(value: unknown): InvoicePaymentMutationResult | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  const payment = normalizePayment(value.payment);
  const receipt = normalizeReceipt(value.receipt);
  const invoice = normalizeInvoiceListItem(value.invoice);

  if (payment === null || receipt === null || invoice === null) {
    return null;
  }

  return { payment, receipt, invoice };
}

function normalizeRefundMutation(value: unknown): InvoiceRefundMutationResult | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  const refund = normalizeRefund(value.refund);
  const payment = normalizePayment(value.payment);
  const invoice = normalizeInvoiceListItem(value.invoice);
  const inventoryReversals = normalizeInventoryReversalArray(value.inventory_reversals);

  if (refund === null || payment === null || invoice === null || inventoryReversals === null) {
    return null;
  }

  return { refund, payment, invoice, inventory_reversals: inventoryReversals };
}

function normalizeRefund(value: unknown): InvoiceRefund | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  if (
    !(
      typeof value.id === 'string' &&
      typeof value.invoice_id === 'string' &&
      typeof value.payment_id === 'string' &&
      typeof value.reason === 'string' &&
      isRefundStatus(value.status)
    )
  ) {
    return null;
  }

  return {
    id: value.id,
    invoice_id: value.invoice_id,
    payment_id: value.payment_id,
    amount: readMoneyString(value.amount),
    reason: value.reason,
    collection_should_continue: value.collection_should_continue === true,
    close_invoice_after_refund: value.close_invoice_after_refund === true,
    inventory_reversal_selected: value.inventory_reversal_selected === true,
    status: value.status,
    created_at: readString(value.created_at),
  };
}

function normalizeInventoryReversalArray(
  value: unknown,
): readonly InvoiceInventoryReversal[] | null {
  if (!Array.isArray(value)) {
    return [];
  }

  const reversals: InvoiceInventoryReversal[] = [];

  for (const item of value) {
    const reversal = normalizeInventoryReversal(item);

    if (reversal === null) {
      return null;
    }

    reversals.push(reversal);
  }

  return reversals;
}

function normalizeInventoryReversal(value: unknown): InvoiceInventoryReversal | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  if (
    !(
      typeof value.id === 'string' &&
      typeof value.job_order_line_id === 'string' &&
      typeof value.product_id === 'string' &&
      typeof value.inventory_ledger_entry_id === 'string' &&
      typeof value.fifo_layer_id === 'string'
    )
  ) {
    return null;
  }

  return {
    id: value.id,
    job_order_line_id: value.job_order_line_id,
    product_id: value.product_id,
    quantity_returned: readQuantityString(value.quantity_returned),
    inventory_ledger_entry_id: value.inventory_ledger_entry_id,
    fifo_layer_id: value.fifo_layer_id,
    created_at: readString(value.created_at),
  };
}

function normalizePayment(value: unknown): InvoicePayment | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  if (
    !(
      typeof value.id === 'string' &&
      typeof value.invoice_id === 'string' &&
      isPaymentMethod(value.payment_method)
    )
  ) {
    return null;
  }

  return {
    id: value.id,
    invoice_id: value.invoice_id,
    amount: readMoneyString(value.amount),
    refundable_amount: readMoneyString(value.refundable_amount),
    payment_date: readString(value.payment_date),
    payment_method: value.payment_method,
    reference_number: readNullableString(value.reference_number),
    notes: readNullableString(value.notes),
    created_at: readString(value.created_at),
  };
}

function normalizeReceiptArray(values: readonly unknown[]): readonly InvoiceReceipt[] | null {
  const receipts: InvoiceReceipt[] = [];

  for (const value of values) {
    const receipt = normalizeReceipt(value);

    if (receipt === null) {
      return null;
    }

    receipts.push(receipt);
  }

  return receipts;
}

function normalizeReceipt(value: unknown): InvoiceReceipt | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  if (
    !(
      typeof value.id === 'string' &&
      typeof value.invoice_id === 'string' &&
      typeof value.payment_id === 'string' &&
      typeof value.receipt_number === 'string' &&
      isPaymentMethod(value.payment_method)
    )
  ) {
    return null;
  }

  return {
    id: value.id,
    invoice_id: value.invoice_id,
    payment_id: value.payment_id,
    receipt_number: value.receipt_number,
    amount: readMoneyString(value.amount),
    payment_method: value.payment_method,
    issued_at: readString(value.issued_at),
  };
}

function normalizeInvoicePagination(pagination: unknown): ApiPaginationMeta | null {
  if (!isObjectRecord(pagination)) {
    return null;
  }

  const rawLimit = pagination.limit;
  const limit =
    typeof rawLimit === 'number'
      ? rawLimit
      : typeof rawLimit === 'string'
        ? Number(rawLimit)
        : invoiceListPageSize;

  return {
    limit: Number.isFinite(limit) ? limit : invoiceListPageSize,
    next_cursor: typeof pagination.next_cursor === 'string' ? pagination.next_cursor : null,
    has_more: pagination.has_more === true,
  };
}

function normalizeStringArray(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((candidate): candidate is string => typeof candidate === 'string')
    : [];
}

function toInvalidInvoiceListResponseError({
  requestId,
  correlationId,
}: {
  readonly requestId: string | null;
  readonly correlationId: string | null;
}): ApiClientError {
  return {
    code: 'invalid_api_response',
    message: 'The invoice list response did not contain a valid invoice list payload.',
    status: 500,
    details: [],
    requestId,
    correlationId,
  };
}

function toInvalidInvoiceDetailResponseError({
  requestId,
  correlationId,
}: {
  readonly requestId: string | null;
  readonly correlationId: string | null;
}): ApiClientError {
  return {
    code: 'invalid_api_response',
    message: 'The invoice response did not contain a valid invoice payload.',
    status: 500,
    details: [],
    requestId,
    correlationId,
  };
}

function toInvalidReceiptResponseError({
  requestId,
  correlationId,
}: {
  readonly requestId: string | null;
  readonly correlationId: string | null;
}): ApiClientError {
  return {
    code: 'invalid_api_response',
    message: 'The receipt response did not contain a valid receipt payload.',
    status: 500,
    details: [],
    requestId,
    correlationId,
  };
}

function toInvalidPaymentResponseError({
  requestId,
  correlationId,
}: {
  readonly requestId: string | null;
  readonly correlationId: string | null;
}): ApiClientError {
  return {
    code: 'invalid_api_response',
    message: 'The payment response did not contain a valid payment and receipt payload.',
    status: 500,
    details: [],
    requestId,
    correlationId,
  };
}

function toInvalidRefundResponseError({
  requestId,
  correlationId,
}: {
  readonly requestId: string | null;
  readonly correlationId: string | null;
}): ApiClientError {
  return {
    code: 'invalid_api_response',
    message: 'The refund response did not contain a valid refund, payment, and invoice payload.',
    status: 500,
    details: [],
    requestId,
    correlationId,
  };
}

function readNestedName(
  value: Record<string, unknown>,
  nestedKey: string,
  directNameKey: string,
): string | null {
  const nestedValue = value[nestedKey];

  if (isObjectRecord(nestedValue)) {
    return readNullableString(nestedValue.name) ?? readNullableString(value[directNameKey]);
  }

  return readNullableString(value[directNameKey]);
}

function readString(value: unknown): string {
  return typeof value === 'string' && value.length > 0 ? value : '';
}

function readNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readMoneyString(value: unknown): string {
  return readNullableMoneyString(value) ?? '0.00';
}

function readNullableMoneyString(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toFixed(2);
  }

  return null;
}

function readQuantityString(value: unknown): string {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toFixed(3);
  }

  return '0.000';
}

function readInteger(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);

    if (Number.isInteger(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function readLockVersion(value: unknown): number {
  return Math.max(readInteger(value, 0), 0);
}

function isInvoiceStatus(value: unknown): value is InvoiceStatus {
  return (
    value === 'draft' ||
    value === 'pending' ||
    value === 'partially_paid' ||
    value === 'paid' ||
    value === 'overdue' ||
    value === 'cancelled' ||
    value === 'voided' ||
    value === 'refunded'
  );
}

function isPaymentMethod(value: unknown): value is InvoicePaymentMethod {
  return (
    value === 'cash' ||
    value === 'gcash' ||
    value === 'maya' ||
    value === 'bank_transfer' ||
    value === 'credit_card' ||
    value === 'check' ||
    value === 'other'
  );
}

function isRefundStatus(value: unknown): value is InvoiceRefund['status'] {
  return value === 'posted' || value === 'voided';
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readMetaString(value: string | undefined): string | null {
  return value === undefined || value.length === 0 ? null : value;
}
