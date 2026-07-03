'use client';

import { useEffect, useState } from 'react';

import { isApiClientError, type ApiClientError } from '../../lib/api-envelope';
import type { AuthSessionResponseData } from '../auth/types/auth-session';

import type {
  CreateInvoicePaymentInput,
  CreateInvoiceRefundInput,
  InvoiceDetail,
  InvoiceListItem,
  InvoicePaymentMethod,
  InvoiceReceipt,
  InvoiceStatus,
} from './invoice.types';

export type NetworkStatus = 'online' | 'offline';
export type InvoiceWorkflowAction = 'issue' | 'cancel' | 'void';

export function useNetworkStatus(): NetworkStatus {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
    }

    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline ? 'online' : 'offline';
}

export function hasPermission(
  session: AuthSessionResponseData | null,
  permission: string,
): boolean {
  return session?.effective_permissions.includes(permission) === true;
}

export function canViewInvoices(session: AuthSessionResponseData | null): boolean {
  return (
    session !== null &&
    session.access.can_access_operational_modules === true &&
    hasPermission(session, 'invoices.read')
  );
}

export function canUseInvoiceWriteActions({
  session,
  networkStatus,
}: {
  readonly session: AuthSessionResponseData | null;
  readonly networkStatus: NetworkStatus;
}): boolean {
  return (
    session !== null &&
    session.access.can_access_operational_modules === true &&
    session.access.read_only !== true &&
    networkStatus === 'online'
  );
}

export function canCreateDraftInvoice({
  session,
  networkStatus,
}: {
  readonly session: AuthSessionResponseData | null;
  readonly networkStatus: NetworkStatus;
}): boolean {
  return (
    hasPermission(session, 'invoices.create') &&
    canUseInvoiceWriteActions({ session, networkStatus })
  );
}

export function canEnterInvoiceCancelReason(invoiceStatus: InvoiceStatus): boolean {
  return invoiceStatus === 'draft' || invoiceStatus === 'pending';
}

export function getInvoiceWorkflowBlockedReason({
  action,
  invoice,
  session,
  isOffline,
  writeActionsAllowed,
  reason,
}: {
  readonly action: InvoiceWorkflowAction;
  readonly invoice: InvoiceDetail;
  readonly session: AuthSessionResponseData | null;
  readonly isOffline: boolean;
  readonly writeActionsAllowed: boolean;
  readonly reason: string;
}): string | null {
  const permission =
    action === 'issue'
      ? 'invoices.issue'
      : action === 'cancel'
        ? 'invoices.cancel'
        : 'invoices.void';

  if (session === null) {
    return null;
  }

  if (!hasPermission(session, permission)) {
    return `Your tenant session does not include ${permission} permission.`;
  }

  if (isOffline) {
    return 'Reconnect before using invoice workflow actions. Offline mode is read-only.';
  }

  if (session.access.read_only === true) {
    return 'This tenant is read-only. Operational invoice writes are blocked.';
  }

  if (!writeActionsAllowed) {
    return 'Invoice workflow actions are blocked by the current tenant session.';
  }

  if (isFinalWorkflowBlockedInvoiceStatus(invoice.status)) {
    return 'Cancelled, voided, and refunded invoices cannot use workflow actions.';
  }

  if (action === 'issue' && invoice.status !== 'draft') {
    return 'Only draft invoices can be issued.';
  }

  if (action === 'cancel' && invoice.status !== 'draft' && invoice.status !== 'pending') {
    return 'Only draft or pending zero-payment invoices can be cancelled.';
  }

  if ((action === 'cancel' || action === 'void') && reason.trim().length === 0) {
    return 'A reason is required for this invoice workflow action.';
  }

  if (action === 'void' && invoice.status === 'draft') {
    return 'Draft invoices cannot be voided.';
  }

  const amountPaid = Number(invoice.amount_paid);
  const amountRefunded = Number(invoice.amount_refunded);

  if (
    action === 'void' &&
    Number.isFinite(amountPaid) &&
    Number.isFinite(amountRefunded) &&
    amountPaid > amountRefunded
  ) {
    return 'Paid invoices must be fully refunded before voiding.';
  }

  return null;
}

export function getInvoicePaymentBlockedReason({
  invoice,
  session,
  isOffline,
  writeActionsAllowed,
  amount,
  paymentDate,
}: {
  readonly invoice: InvoiceDetail;
  readonly session: AuthSessionResponseData | null;
  readonly isOffline: boolean;
  readonly writeActionsAllowed: boolean;
  readonly amount: string;
  readonly paymentDate: string;
}): string | null {
  if (session === null) {
    return null;
  }

  if (!hasPermission(session, 'payments.create')) {
    return 'Your tenant session does not include payments.create permission.';
  }

  if (!hasPermission(session, 'receipts.read')) {
    return 'Your tenant session does not include receipts.read permission.';
  }

  if (isOffline) {
    return 'Reconnect before recording payments. Offline mode is read-only.';
  }

  if (session.access.read_only === true) {
    return 'This tenant is read-only. Payment writes are blocked.';
  }

  if (!writeActionsAllowed) {
    return 'Payment recording is blocked by the current tenant session.';
  }

  if (!isCollectibleInvoiceStatus(invoice.status)) {
    return 'Only pending, partially paid, or overdue invoices can receive payments.';
  }

  if (paymentDate.length === 0) {
    return 'Payment date is required.';
  }

  const paymentAmount = Number(amount);
  const remainingBalance = Number(invoice.remaining_collectible_balance);

  if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
    return 'Payment amount must be greater than zero.';
  }

  if (Number.isFinite(remainingBalance) && paymentAmount > remainingBalance) {
    return 'Payment amount cannot exceed the remaining collectible balance.';
  }

  return null;
}

export function buildInvoicePaymentInput({
  amount,
  paymentDate,
  paymentMethod,
  referenceNumber,
  notes,
}: {
  readonly amount: string;
  readonly paymentDate: string;
  readonly paymentMethod: InvoicePaymentMethod;
  readonly referenceNumber: string;
  readonly notes: string;
}): CreateInvoicePaymentInput {
  const trimmedReference = referenceNumber.trim();
  const trimmedNotes = notes.trim();

  return {
    amount: Number(amount).toFixed(2),
    payment_date: paymentDate,
    payment_method: paymentMethod,
    ...(trimmedReference.length > 0 ? { reference_number: trimmedReference } : {}),
    ...(trimmedNotes.length > 0 ? { notes: trimmedNotes } : {}),
  };
}

export function getInvoiceRefundFormBlockedReason({
  invoice,
  receipt,
  session,
  isOffline,
  writeActionsAllowed,
}: {
  readonly invoice: InvoiceDetail;
  readonly receipt: InvoiceReceipt | null;
  readonly session: AuthSessionResponseData | null;
  readonly isOffline: boolean;
  readonly writeActionsAllowed: boolean;
}): string | null {
  if (receipt === null) {
    return 'No receipt-backed payment is available to refund.';
  }

  if (session === null) {
    return null;
  }

  if (!hasPermission(session, 'payments.refund') && !hasPermission(session, 'invoices.refund')) {
    return 'Your tenant session does not include payments.refund or invoices.refund permission.';
  }

  if (isOffline) {
    return 'Reconnect before recording refunds. Offline mode is read-only.';
  }

  if (session.access.read_only === true) {
    return 'This tenant is read-only. Refund writes are blocked.';
  }

  if (!writeActionsAllowed) {
    return 'Refund recording is blocked by the current tenant session.';
  }

  if (
    invoice.status === 'draft' ||
    invoice.status === 'cancelled' ||
    invoice.status === 'voided' ||
    invoice.status === 'refunded'
  ) {
    return 'Only issued invoices with refundable payments can receive refunds.';
  }

  return null;
}

export function getInvoiceRefundBlockedReason({
  invoice,
  receipt,
  session,
  isOffline,
  writeActionsAllowed,
  amount,
  reason,
}: {
  readonly invoice: InvoiceDetail;
  readonly receipt: InvoiceReceipt;
  readonly session: AuthSessionResponseData | null;
  readonly isOffline: boolean;
  readonly writeActionsAllowed: boolean;
  readonly amount: string;
  readonly reason: string;
}): string | null {
  const formBlockedReason = getInvoiceRefundFormBlockedReason({
    invoice,
    receipt,
    session,
    isOffline,
    writeActionsAllowed,
  });

  if (formBlockedReason !== null) {
    return formBlockedReason;
  }

  if (reason.trim().length === 0) {
    return 'Refund reason is required.';
  }

  const maxRefundable = getReceiptRefundableAmount(receipt);
  const refundAmount = Number(amount);

  if (maxRefundable <= 0) {
    return 'This receipt-backed payment has no refundable amount remaining.';
  }

  if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
    return 'Refund amount must be greater than zero.';
  }

  if (refundAmount > maxRefundable) {
    return 'Refund amount cannot exceed the available refundable amount for this payment.';
  }

  return null;
}

export function buildInvoiceRefundInput({
  amount,
  reason,
  collectionShouldContinue,
  closeInvoiceAfterRefund,
}: {
  readonly amount: string;
  readonly reason: string;
  readonly collectionShouldContinue: boolean;
  readonly closeInvoiceAfterRefund: boolean;
}): CreateInvoiceRefundInput {
  return {
    amount: Number(amount).toFixed(2),
    reason: reason.trim(),
    collection_should_continue: collectionShouldContinue,
    close_invoice_after_refund: closeInvoiceAfterRefund,
  };
}

export function getReceiptRefundableAmount(receipt: InvoiceReceipt): number {
  const refundableAmount = Number(receipt.refundable_amount);

  return Number.isFinite(refundableAmount) ? Math.max(refundableAmount, 0) : 0;
}

export function getReceiptRefundableEstimate({
  receipt,
}: {
  readonly invoice?: InvoiceDetail;
  readonly receipt: InvoiceReceipt;
}): number {
  return getReceiptRefundableAmount(receipt);
}

export function mergeUniqueInvoices(
  currentInvoices: readonly InvoiceListItem[],
  nextInvoices: readonly InvoiceListItem[],
): readonly InvoiceListItem[] {
  const seenInvoiceIds = new Set(currentInvoices.map((invoice) => invoice.id));
  const mergedInvoices = [...currentInvoices];

  for (const invoice of nextInvoices) {
    if (!seenInvoiceIds.has(invoice.id)) {
      seenInvoiceIds.add(invoice.id);
      mergedInvoices.push(invoice);
    }
  }

  return mergedInvoices;
}

export function toSafeErrorMessage(error: unknown, fallback: string): string {
  if (isApiClientError(error)) {
    return error.message;
  }

  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return fallback;
}

export function toSafeErrorDetail(error: unknown): string | null {
  if (!isApiClientError(error)) {
    return null;
  }

  const identifiers = [
    error.requestId === null ? null : `request ${error.requestId}`,
    error.correlationId === null ? null : `correlation ${error.correlationId}`,
  ].filter((value): value is string => value !== null);

  return identifiers.length > 0 ? `Reference: ${identifiers.join(' / ')}` : null;
}

export function getApiErrorCode(error: unknown): string | null {
  return isApiClientError(error) ? error.code : null;
}

export function getFieldErrorMap(error: ApiClientError | null): ReadonlyMap<string, string> {
  const errors = new Map<string, string>();

  if (error === null) {
    return errors;
  }

  for (const detail of error.details) {
    if (
      typeof detail.field === 'string' &&
      detail.field.length > 0 &&
      typeof detail.message === 'string' &&
      detail.message.length > 0
    ) {
      errors.set(detail.field, detail.message);
    }
  }

  return errors;
}

export function generateIdempotencyKey(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isFinalWorkflowBlockedInvoiceStatus(status: InvoiceStatus): boolean {
  return status === 'cancelled' || status === 'voided' || status === 'refunded';
}

function isCollectibleInvoiceStatus(status: InvoiceDetail['status']): boolean {
  return status === 'pending' || status === 'partially_paid' || status === 'overdue';
}
