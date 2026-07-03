'use client';

import { useEffect, useState, type FormEvent } from 'react';

import {
  Alert,
  Button,
  ButtonLink,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui';
import { getCurrentSession } from '../auth/queries/get-current-session.query';
import type { AuthSessionResponseData } from '../auth/types/auth-session';

import { InvoiceStatusBadge } from './components/invoice-list-results';
import {
  cancelInvoice,
  getInvoice,
  getReceiptPrintMetadata,
  issueInvoice,
  recordInvoicePayment,
  recordPaymentRefund,
  voidInvoice,
} from './invoice.api';
import type {
  InvoiceDetail,
  InvoiceDetailState,
  InvoiceLineItem,
  InvoicePaymentMethod,
  InvoiceReceipt,
} from './invoice.types';
import {
  buildInvoicePaymentInput,
  buildInvoiceRefundInput,
  canEnterInvoiceCancelReason,
  canUseInvoiceWriteActions,
  generateIdempotencyKey,
  getApiErrorCode,
  getInvoicePaymentBlockedReason,
  getInvoiceRefundBlockedReason,
  getInvoiceRefundFormBlockedReason,
  getReceiptRefundableEstimate,
  getInvoiceWorkflowBlockedReason,
  hasPermission,
  toSafeErrorDetail,
  toSafeErrorMessage,
  useNetworkStatus,
} from './invoice.ui';
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatQuantity,
  formatStatusLabel,
} from './invoice.view-utils';

interface InvoiceDetailScreenProps {
  readonly invoiceId: string;
}

type WorkflowState =
  | { readonly status: 'idle' }
  | { readonly status: 'submitting'; readonly action: 'issue' | 'cancel' | 'void' }
  | { readonly status: 'success'; readonly message: string }
  | {
      readonly status: 'error';
      readonly message: string;
      readonly detail: string | null;
      readonly code: string | null;
    };

type PaymentState =
  | { readonly status: 'idle' }
  | { readonly status: 'submitting' }
  | { readonly status: 'success'; readonly receiptNumber: string }
  | {
      readonly status: 'error';
      readonly message: string;
      readonly detail: string | null;
      readonly code: string | null;
    };

type RefundState =
  | { readonly status: 'idle' }
  | { readonly status: 'submitting' }
  | { readonly status: 'success'; readonly refundAmount: string }
  | {
      readonly status: 'error';
      readonly message: string;
      readonly detail: string | null;
      readonly code: string | null;
    };

const paymentMethodOptions: readonly {
  readonly value: InvoicePaymentMethod;
  readonly label: string;
}[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'gcash', label: 'GCash' },
  { value: 'maya', label: 'Maya' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'credit_card', label: 'Credit card' },
  { value: 'check', label: 'Check' },
  { value: 'other', label: 'Other' },
];

function getDefaultRefundReceiptId(receipts: readonly InvoiceReceipt[]): string {
  return (
    receipts.find((receipt) => getReceiptRefundableEstimate({ receipt }) > 0)?.id ??
    receipts[0]?.id ??
    ''
  );
}

export function InvoiceDetailScreen({ invoiceId }: InvoiceDetailScreenProps) {
  const targetInvoiceId = invoiceId.length > 0 ? invoiceId : null;
  const [refreshKey, setRefreshKey] = useState(0);
  const [sessionState, setSessionState] = useState<
    | { readonly status: 'loading' }
    | { readonly status: 'ready'; readonly session: AuthSessionResponseData }
    | { readonly status: 'error'; readonly message: string; readonly detail: string | null }
  >({ status: 'loading' });
  const [detailState, setDetailState] = useState<InvoiceDetailState>({ status: 'loading' });
  const networkStatus = useNetworkStatus();

  useEffect(() => {
    let active = true;

    async function loadSession() {
      try {
        const session = await getCurrentSession();

        if (active) {
          setSessionState({ status: 'ready', session });
        }
      } catch (error) {
        if (active) {
          setSessionState({
            status: 'error',
            message: toSafeErrorMessage(error, 'Unable to load your GarageOS session.'),
            detail: toSafeErrorDetail(error),
          });
        }
      }
    }

    void loadSession();

    return () => {
      active = false;
    };
  }, []);

  const session = sessionState.status === 'ready' ? sessionState.session : null;
  const canReadInvoices = hasPermission(session, 'invoices.read');
  const canAccessInvoices =
    session !== null && session.access.can_access_operational_modules === true && canReadInvoices;
  const writeActionsAllowed = canUseInvoiceWriteActions({ session, networkStatus });

  useEffect(() => {
    if (targetInvoiceId === null) {
      setDetailState({
        status: 'error',
        message: 'Invoice ID is required.',
        detail: null,
        code: 'validation_failed',
      });
      return;
    }

    if (!canAccessInvoices) {
      return;
    }

    if (networkStatus === 'offline') {
      setDetailState((current) =>
        current.status === 'loaded'
          ? current
          : {
              status: 'error',
              message: 'Invoice detail is unavailable while offline.',
              detail: 'Offline mode is read-only. Reconnect to load this invoice detail.',
              code: 'offline_read_only',
            },
      );
      return;
    }

    let active = true;

    async function loadInvoice(currentInvoiceId: string) {
      setDetailState({ status: 'loading' });

      try {
        const invoice = await getInvoice(currentInvoiceId);

        if (active) {
          setDetailState({ status: 'loaded', invoice });
        }
      } catch (error) {
        if (active) {
          setDetailState({
            status: 'error',
            message: toSafeErrorMessage(error, 'Unable to load this invoice.'),
            detail: toSafeErrorDetail(error),
            code: getApiErrorCode(error),
          });
        }
      }
    }

    void loadInvoice(targetInvoiceId);

    return () => {
      active = false;
    };
  }, [canAccessInvoices, networkStatus, refreshKey, targetInvoiceId]);

  if (sessionState.status === 'error') {
    return (
      <Alert variant="destructive">
        <p className="text-sm font-bold">{sessionState.message}</p>
        {sessionState.detail === null ? null : (
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{sessionState.detail}</p>
        )}
      </Alert>
    );
  }

  if (session !== null && !canReadInvoices) {
    return (
      <Alert variant="destructive">
        <p className="text-sm font-bold">Invoice detail unavailable</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Required permission: <strong>invoices.read</strong>
        </p>
      </Alert>
    );
  }

  if (session !== null && session.access.can_access_operational_modules !== true) {
    return (
      <Alert variant="destructive">
        <p className="text-sm font-bold">Invoices are blocked</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          This tenant lifecycle state cannot access operational invoice screens.
        </p>
      </Alert>
    );
  }

  if (sessionState.status === 'loading' || detailState.status === 'loading') {
    return <InvoiceDetailLoadingState />;
  }

  if (detailState.status === 'error') {
    return (
      <InvoiceDetailErrorState
        code={detailState.code}
        message={detailState.message}
        detail={detailState.detail}
      />
    );
  }

  return (
    <InvoiceDetailView
      invoice={detailState.invoice}
      session={session}
      isOffline={networkStatus === 'offline'}
      writeActionsAllowed={writeActionsAllowed}
      onChanged={() => setRefreshKey((current) => current + 1)}
    />
  );
}

function InvoiceDetailLoadingState() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-live="polite">
      <Skeleton className="h-36 w-full" />
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}

function InvoiceDetailErrorState({
  code,
  message,
  detail,
}: {
  readonly code: string | null;
  readonly message: string;
  readonly detail: string | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {code === 'resource_not_found' ? 'Invoice not found' : 'Unable to load invoice'}
        </CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {code === null ? null : (
          <p className="text-sm leading-6 text-muted-foreground">Error code: {code}</p>
        )}
        {detail === null ? null : (
          <p className="text-sm leading-6 text-muted-foreground">{detail}</p>
        )}
        <div>
          <ButtonLink href="/invoices" variant="secondary">
            Back to invoices
          </ButtonLink>
        </div>
      </CardContent>
    </Card>
  );
}

function InvoiceDetailView({
  invoice,
  session,
  isOffline,
  writeActionsAllowed,
  onChanged,
}: {
  readonly invoice: InvoiceDetail;
  readonly session: AuthSessionResponseData | null;
  readonly isOffline: boolean;
  readonly writeActionsAllowed: boolean;
  readonly onChanged: () => void;
}) {
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader className="gap-4 lg:grid lg:grid-cols-[1fr_auto] lg:items-start">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-muted-foreground">
              Invoice detail
            </p>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
              <CardTitle className="break-words text-2xl">{invoice.invoice_number}</CardTitle>
              <InvoiceStatusBadge status={invoice.status} />
            </div>
            <CardDescription className="mt-2">
              Customer {invoice.customer_name ?? invoice.customer_id} / Branch{' '}
              {invoice.branch_name ?? invoice.branch_id}
            </CardDescription>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row lg:justify-end">
            <ButtonLink href="/invoices" variant="secondary">
              Back to list
            </ButtonLink>
          </div>
        </CardHeader>
      </Card>

      {isOffline ? (
        <Alert>
          <p className="text-sm leading-6">
            Offline mode is read-only. Existing on-screen details remain viewable, but reconnect
            before issuing, cancelling, voiding, or refreshing this invoice.
          </p>
        </Alert>
      ) : null}

      {session?.access.read_only === true ? (
        <Alert>
          <p className="text-sm leading-6">
            This tenant is read-only. Invoice viewing remains available, but invoice workflow writes
            are blocked.
          </p>
        </Alert>
      ) : null}

      <InvoiceWorkflowActions
        invoice={invoice}
        session={session}
        isOffline={isOffline}
        writeActionsAllowed={writeActionsAllowed}
        onChanged={onChanged}
      />
      <InvoicePaymentPanel
        invoice={invoice}
        session={session}
        isOffline={isOffline}
        writeActionsAllowed={writeActionsAllowed}
        onChanged={onChanged}
      />
      <InvoiceRefundPanel
        invoice={invoice}
        receipts={invoice.receipts}
        session={session}
        isOffline={isOffline}
        writeActionsAllowed={writeActionsAllowed}
        onChanged={onChanged}
      />
      <InvoiceReceiptsPanel receipts={invoice.receipts} />
      <InvoiceSummaryCard invoice={invoice} />
      <InvoiceLineItems lines={invoice.lines} />
      <InvoiceStatusHistory invoice={invoice} />
    </div>
  );
}

function InvoiceWorkflowActions({
  invoice,
  session,
  isOffline,
  writeActionsAllowed,
  onChanged,
}: {
  readonly invoice: InvoiceDetail;
  readonly session: AuthSessionResponseData | null;
  readonly isOffline: boolean;
  readonly writeActionsAllowed: boolean;
  readonly onChanged: () => void;
}) {
  const [cancelReason, setCancelReason] = useState('');
  const [voidReason, setVoidReason] = useState('');
  const [workflowState, setWorkflowState] = useState<WorkflowState>({ status: 'idle' });

  async function submitWorkflow(
    event: FormEvent<HTMLFormElement>,
    action: 'issue' | 'cancel' | 'void',
  ) {
    event.preventDefault();

    const blockedReason = getInvoiceWorkflowBlockedReason({
      action,
      invoice,
      session,
      isOffline,
      writeActionsAllowed,
      reason: action === 'cancel' ? cancelReason : action === 'void' ? voidReason : '',
    });

    if (blockedReason !== null) {
      setWorkflowState({
        status: 'error',
        message: blockedReason,
        detail: null,
        code: 'forbidden',
      });
      return;
    }

    setWorkflowState({ status: 'submitting', action });

    try {
      if (action === 'issue') {
        await issueInvoice({
          invoiceId: invoice.id,
          idempotencyKey: generateIdempotencyKey('invoice-issue'),
        });
      } else if (action === 'cancel') {
        await cancelInvoice({
          invoiceId: invoice.id,
          input: { reason: cancelReason.trim() },
          idempotencyKey: generateIdempotencyKey('invoice-cancel'),
        });
      } else {
        await voidInvoice({
          invoiceId: invoice.id,
          input: { reason: voidReason.trim() },
          idempotencyKey: generateIdempotencyKey('invoice-void'),
        });
      }

      setWorkflowState({
        status: 'success',
        message: `Invoice ${action} action completed. Details are refreshing.`,
      });
      onChanged();
    } catch (error) {
      setWorkflowState({
        status: 'error',
        message: toSafeErrorMessage(error, `Unable to ${action} this invoice.`),
        detail: toSafeErrorDetail(error),
        code: getApiErrorCode(error),
      });
    }
  }

  const issueBlockedReason = getInvoiceWorkflowBlockedReason({
    action: 'issue',
    invoice,
    session,
    isOffline,
    writeActionsAllowed,
    reason: '',
  });
  const cancelBlockedReason = getInvoiceWorkflowBlockedReason({
    action: 'cancel',
    invoice,
    session,
    isOffline,
    writeActionsAllowed,
    reason: cancelReason,
  });
  const voidBlockedReason = getInvoiceWorkflowBlockedReason({
    action: 'void',
    invoice,
    session,
    isOffline,
    writeActionsAllowed,
    reason: voidReason,
  });

  const submitting = workflowState.status === 'submitting';

  const canEnterCancelReason = canEnterInvoiceCancelReason(invoice.status);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Workflow actions</CardTitle>
        <CardDescription>
          Issue, cancel, and void are explicit invoice workflow actions. Paid invoices must be fully
          refunded before voiding.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {workflowState.status === 'success' ? (
          <Alert>
            <p className="text-sm leading-6">{workflowState.message}</p>
          </Alert>
        ) : null}

        {workflowState.status === 'error' ? (
          <Alert variant="destructive">
            <p className="text-sm font-bold">{workflowState.message}</p>
            {workflowState.code === null ? null : (
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Error code: {workflowState.code}
              </p>
            )}
            {workflowState.detail === null ? null : (
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{workflowState.detail}</p>
            )}
          </Alert>
        ) : null}

        <form className="grid gap-3" onSubmit={(event) => void submitWorkflow(event, 'issue')}>
          {issueBlockedReason === null ? null : (
            <p className="text-sm text-muted-foreground">{issueBlockedReason}</p>
          )}
          <Button type="submit" disabled={submitting || issueBlockedReason !== null}>
            {submitting && workflowState.action === 'issue' ? 'Issuing...' : 'Issue invoice'}
          </Button>
        </form>

        <form className="grid gap-3" onSubmit={(event) => void submitWorkflow(event, 'cancel')}>
          <label className="grid gap-2">
            <span className="text-sm font-bold text-foreground">Cancel reason</span>
            <Input
              value={cancelReason}
              onChange={(event) => setCancelReason(event.currentTarget.value)}
              disabled={submitting || !canEnterCancelReason}
            />
          </label>
          {cancelBlockedReason === null ? null : (
            <p className="text-sm text-muted-foreground">{cancelBlockedReason}</p>
          )}
          <Button
            type="submit"
            variant="secondary"
            disabled={submitting || cancelBlockedReason !== null}
          >
            {submitting && workflowState.action === 'cancel' ? 'Cancelling...' : 'Cancel invoice'}
          </Button>
        </form>

        <form className="grid gap-3" onSubmit={(event) => void submitWorkflow(event, 'void')}>
          <label className="grid gap-2">
            <span className="text-sm font-bold text-foreground">Void reason</span>
            <Input
              value={voidReason}
              onChange={(event) => setVoidReason(event.currentTarget.value)}
              disabled={submitting || invoice.status === 'draft'}
            />
          </label>
          {voidBlockedReason === null ? null : (
            <p className="text-sm text-muted-foreground">{voidBlockedReason}</p>
          )}
          <Button
            type="submit"
            variant="destructive"
            disabled={submitting || voidBlockedReason !== null}
          >
            {submitting && workflowState.action === 'void' ? 'Voiding...' : 'Void invoice'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function InvoicePaymentPanel({
  invoice,
  session,
  isOffline,
  writeActionsAllowed,
  onChanged,
}: {
  readonly invoice: InvoiceDetail;
  readonly session: AuthSessionResponseData | null;
  readonly isOffline: boolean;
  readonly writeActionsAllowed: boolean;
  readonly onChanged: () => void;
}) {
  const [amount, setAmount] = useState(invoice.remaining_collectible_balance);
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState<InvoicePaymentMethod>('cash');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentState, setPaymentState] = useState<PaymentState>({ status: 'idle' });
  const blockedReason = getInvoicePaymentBlockedReason({
    invoice,
    session,
    isOffline,
    writeActionsAllowed,
    amount,
    paymentDate,
  });
  const submitting = paymentState.status === 'submitting';

  useEffect(() => {
    setAmount(invoice.remaining_collectible_balance);
  }, [invoice.id, invoice.remaining_collectible_balance]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (blockedReason !== null) {
      setPaymentState({
        status: 'error',
        message: blockedReason,
        detail: null,
        code: 'forbidden',
      });
      return;
    }

    setPaymentState({ status: 'submitting' });

    try {
      const result = await recordInvoicePayment({
        invoiceId: invoice.id,
        input: buildInvoicePaymentInput({
          amount,
          paymentDate,
          paymentMethod,
          referenceNumber,
          notes,
        }),
        idempotencyKey: generateIdempotencyKey('invoice-payment'),
      });

      setPaymentState({
        status: 'success',
        receiptNumber: result.receipt.receipt_number,
      });
      setReferenceNumber('');
      setNotes('');
      onChanged();
    } catch (error) {
      setPaymentState({
        status: 'error',
        message: toSafeErrorMessage(error, 'Unable to record this payment.'),
        detail: toSafeErrorDetail(error),
        code: getApiErrorCode(error),
      });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payments</CardTitle>
        <CardDescription>
          Record manual customer payments against the remaining collectible balance.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="grid gap-4">
          {blockedReason === null ? null : (
            <Alert>
              <p className="text-sm leading-6">{blockedReason}</p>
            </Alert>
          )}

          {paymentState.status === 'success' ? (
            <Alert>
              <p className="text-sm leading-6">
                Payment recorded. Receipt {paymentState.receiptNumber} is available below.
              </p>
            </Alert>
          ) : null}

          {paymentState.status === 'error' ? (
            <Alert variant="destructive">
              <p className="text-sm font-bold">{paymentState.message}</p>
              {paymentState.code === null ? null : (
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Error code: {paymentState.code}
                </p>
              )}
              {paymentState.detail === null ? null : (
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {paymentState.detail}
                </p>
              )}
            </Alert>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <DetailField
              label="Remaining"
              value={formatMoney(invoice.remaining_collectible_balance)}
            />
            <label className="grid gap-2">
              <span className="text-sm font-bold text-foreground">Amount</span>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.currentTarget.value)}
                disabled={submitting || blockedReason !== null}
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-bold text-foreground">Payment date</span>
              <Input
                type="date"
                value={paymentDate}
                onChange={(event) => setPaymentDate(event.currentTarget.value)}
                disabled={submitting || blockedReason !== null}
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-bold text-foreground">Payment method</span>
              <select
                value={paymentMethod}
                onChange={(event) =>
                  setPaymentMethod(event.currentTarget.value as InvoicePaymentMethod)
                }
                disabled={submitting || blockedReason !== null}
                className="min-h-11 rounded-xl border border-input bg-background px-3 py-2 text-base text-foreground shadow-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {paymentMethodOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-sm font-bold text-foreground">Reference number</span>
              <Input
                value={referenceNumber}
                onChange={(event) => setReferenceNumber(event.currentTarget.value)}
                disabled={submitting || blockedReason !== null}
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-bold text-foreground">Notes</span>
              <Input
                value={notes}
                onChange={(event) => setNotes(event.currentTarget.value)}
                disabled={submitting || blockedReason !== null}
              />
            </label>
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={submitting || blockedReason !== null}>
            {submitting ? 'Recording...' : 'Record payment'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function InvoiceRefundPanel({
  invoice,
  receipts,
  session,
  isOffline,
  writeActionsAllowed,
  onChanged,
}: {
  readonly invoice: InvoiceDetail;
  readonly receipts: readonly InvoiceReceipt[];
  readonly session: AuthSessionResponseData | null;
  readonly isOffline: boolean;
  readonly writeActionsAllowed: boolean;
  readonly onChanged: () => void;
}) {
  const [selectedReceiptId, setSelectedReceiptId] = useState(() =>
    getDefaultRefundReceiptId(receipts),
  );
  const selectedReceipt =
    receipts.find((receipt) => receipt.id === selectedReceiptId) ?? receipts[0] ?? null;
  const selectedReceiptRefundableAmount =
    selectedReceipt === null ? 0 : getReceiptRefundableEstimate({ receipt: selectedReceipt });
  const estimatedRefundableAmount = selectedReceiptRefundableAmount;
  const [amount, setAmount] = useState(() => estimatedRefundableAmount.toFixed(2));
  const [reason, setReason] = useState('');
  const [collectionShouldContinue, setCollectionShouldContinue] = useState(true);
  const [closeInvoiceAfterRefund, setCloseInvoiceAfterRefund] = useState(false);
  const [refundState, setRefundState] = useState<RefundState>({ status: 'idle' });

  useEffect(() => {
    const defaultReceiptId = getDefaultRefundReceiptId(receipts);
    setSelectedReceiptId((current) =>
      receipts.some((receipt) => receipt.id === current) ? current : defaultReceiptId,
    );
  }, [receipts]);

  useEffect(() => {
    setAmount(estimatedRefundableAmount.toFixed(2));
  }, [estimatedRefundableAmount, selectedReceipt?.id]);

  const formBlockedReason = getInvoiceRefundFormBlockedReason({
    invoice,
    receipt: selectedReceipt,
    session,
    isOffline,
    writeActionsAllowed,
  });
  const selectedReceiptBlockedReason =
    selectedReceipt !== null && selectedReceiptRefundableAmount <= 0
      ? 'This receipt-backed payment has no refundable amount remaining.'
      : null;
  const blockedReason =
    formBlockedReason ??
    selectedReceiptBlockedReason ??
    (selectedReceipt === null
      ? 'No receipt-backed payment is available to refund.'
      : getInvoiceRefundBlockedReason({
          invoice,
          receipt: selectedReceipt,
          session,
          isOffline,
          writeActionsAllowed,
          amount,
          reason,
        }));
  const submitting = refundState.status === 'submitting';
  const receiptSelectDisabled = submitting || formBlockedReason !== null || receipts.length === 0;
  const refundFieldsDisabled =
    submitting || formBlockedReason !== null || selectedReceiptRefundableAmount <= 0;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (selectedReceipt === null || blockedReason !== null) {
      setRefundState({
        status: 'error',
        message: blockedReason ?? 'No receipt-backed payment is available to refund.',
        detail: null,
        code: 'forbidden',
      });
      return;
    }

    setRefundState({ status: 'submitting' });

    try {
      const result = await recordPaymentRefund({
        paymentId: selectedReceipt.payment_id,
        input: buildInvoiceRefundInput({
          amount,
          reason,
          collectionShouldContinue,
          closeInvoiceAfterRefund,
        }),
        idempotencyKey: generateIdempotencyKey('payment-refund'),
      });

      setRefundState({
        status: 'success',
        refundAmount: result.refund.amount,
      });
      setReason('');
      onChanged();
    } catch (error) {
      setRefundState({
        status: 'error',
        message: toSafeErrorMessage(error, 'Unable to record this refund.'),
        detail: toSafeErrorDetail(error),
        code: getApiErrorCode(error),
      });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Refunds</CardTitle>
        <CardDescription>
          Record correction-only refunds against receipt-backed payments. Receipt records remain
          immutable; the backend remains authoritative for exact refundable balances.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="grid gap-4">
          {blockedReason === null ? null : (
            <Alert>
              <p className="text-sm leading-6">{blockedReason}</p>
            </Alert>
          )}

          {refundState.status === 'success' ? (
            <Alert>
              <p className="text-sm leading-6">
                Refund recorded for {formatMoney(refundState.refundAmount)}. Invoice details are
                refreshing.
              </p>
            </Alert>
          ) : null}

          {refundState.status === 'error' ? (
            <Alert variant="destructive">
              <p className="text-sm font-bold">{refundState.message}</p>
              {refundState.code === null ? null : (
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Error code: {refundState.code}
                </p>
              )}
              {refundState.detail === null ? null : (
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{refundState.detail}</p>
              )}
            </Alert>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="grid gap-2">
              <span className="text-sm font-bold text-foreground">Payment / receipt</span>
              <select
                value={selectedReceipt?.id ?? ''}
                onChange={(event) => setSelectedReceiptId(event.currentTarget.value)}
                disabled={receiptSelectDisabled}
                className="min-h-11 rounded-xl border border-input bg-background px-3 py-2 text-base text-foreground shadow-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {receipts.length === 0 ? <option value="">No receipts</option> : null}
                {receipts.map((receipt) => {
                  const refundableAmount = getReceiptRefundableEstimate({ receipt });

                  return (
                    <option key={receipt.id} value={receipt.id} disabled={refundableAmount <= 0}>
                      {receipt.receipt_number} / paid {formatMoney(receipt.amount)} / available{' '}
                      {formatMoney(refundableAmount.toFixed(2))}
                    </option>
                  );
                })}
              </select>
            </label>
            <DetailField
              label="Available refundable"
              value={formatMoney(estimatedRefundableAmount.toFixed(2))}
            />
            <label className="grid gap-2">
              <span className="text-sm font-bold text-foreground">Refund amount</span>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.currentTarget.value)}
                disabled={refundFieldsDisabled}
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-bold text-foreground">Refund reason</span>
              <Input
                value={reason}
                onChange={(event) => setReason(event.currentTarget.value)}
                disabled={refundFieldsDisabled}
              />
            </label>
          </div>

          <div className="grid gap-3 rounded-xl border border-border bg-muted/40 p-3 md:grid-cols-2">
            <label className="flex items-start gap-3 text-sm leading-6 text-foreground">
              <input
                type="checkbox"
                checked={collectionShouldContinue}
                onChange={(event) => {
                  const checked = event.currentTarget.checked;
                  setCollectionShouldContinue(checked);

                  if (checked) {
                    setCloseInvoiceAfterRefund(false);
                  }
                }}
                disabled={refundFieldsDisabled}
                className="mt-1 h-4 w-4"
              />
              Continue collection after this refund.
            </label>
            <label className="flex items-start gap-3 text-sm leading-6 text-foreground">
              <input
                type="checkbox"
                checked={closeInvoiceAfterRefund}
                onChange={(event) => {
                  const checked = event.currentTarget.checked;
                  setCloseInvoiceAfterRefund(checked);

                  if (checked) {
                    setCollectionShouldContinue(false);
                  }
                }}
                disabled={refundFieldsDisabled}
                className="mt-1 h-4 w-4"
              />
              Close invoice after refund. Backend allows this only after all payment amounts are
              refunded.
            </label>
          </div>

          <Alert>
            <p className="text-sm leading-6">
              Inventory reversal inputs are intentionally not shown here because this detail screen
              does not expose safe return candidates per payment. Refund inventory reversal remains
              backend-authoritative when an API client supplies documented reversal lines.
            </p>
          </Alert>
        </CardContent>
        <CardFooter>
          <Button type="submit" variant="secondary" disabled={submitting || blockedReason !== null}>
            {submitting ? 'Recording refund...' : 'Record refund'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function InvoiceReceiptsPanel({ receipts }: { readonly receipts: readonly InvoiceReceipt[] }) {
  const [printState, setPrintState] = useState<
    | { readonly status: 'idle' }
    | { readonly status: 'loading'; readonly receiptId: string }
    | { readonly status: 'error'; readonly message: string; readonly detail: string | null }
  >({ status: 'idle' });

  async function handlePrint(receiptId: string) {
    setPrintState({ status: 'loading', receiptId });

    try {
      await getReceiptPrintMetadata(receiptId);
      setPrintState({ status: 'idle' });
      window.print();
    } catch (error) {
      setPrintState({
        status: 'error',
        message: toSafeErrorMessage(error, 'Unable to load receipt print metadata.'),
        detail: toSafeErrorDetail(error),
      });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Receipts</CardTitle>
        <CardDescription>
          Immutable receipt records generated from invoice payments.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {printState.status === 'error' ? (
          <Alert variant="destructive">
            <p className="text-sm font-bold">{printState.message}</p>
            {printState.detail === null ? null : (
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{printState.detail}</p>
            )}
          </Alert>
        ) : null}

        {receipts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No receipts were returned.</p>
        ) : (
          receipts.map((receipt) => (
            <div
              key={receipt.id}
              className="grid gap-3 rounded-xl border border-border bg-muted/40 p-3 md:grid-cols-[1fr_auto] md:items-center"
            >
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <DetailField label="Receipt" value={receipt.receipt_number} />
                <DetailField label="Amount" value={formatMoney(receipt.amount)} />
                <DetailField label="Method" value={formatStatusLabel(receipt.payment_method)} />
                <DetailField label="Issued" value={formatDateTime(receipt.issued_at)} />
              </div>
              <Button
                type="button"
                variant="secondary"
                disabled={printState.status === 'loading' && printState.receiptId === receipt.id}
                onClick={() => void handlePrint(receipt.id)}
              >
                {printState.status === 'loading' && printState.receiptId === receipt.id
                  ? 'Loading...'
                  : 'Print'}
              </Button>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function InvoiceSummaryCard({ invoice }: { readonly invoice: InvoiceDetail }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Invoice summary</CardTitle>
        <CardDescription>Financial fields returned by the documented invoice API.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DetailField label="Invoice date" value={formatDate(invoice.invoice_date)} />
        <DetailField label="Due date" value={formatDate(invoice.due_date)} />
        <DetailField label="Subtotal" value={formatMoney(invoice.subtotal_amount)} />
        <DetailField label="Discount" value={formatMoney(invoice.discount_amount)} />
        <DetailField label="Tax" value={formatMoney(invoice.tax_amount)} />
        <DetailField label="Total" value={formatMoney(invoice.total_amount)} />
        <DetailField label="Paid" value={formatMoney(invoice.amount_paid)} />
        <DetailField label="Refunded" value={formatMoney(invoice.amount_refunded)} />
        <DetailField label="Remaining" value={formatMoney(invoice.remaining_collectible_balance)} />
        <DetailField label="Tax profile" value={invoice.tax_profile} />
        <DetailField label="Tax mode" value={invoice.tax_mode} />
        <DetailField label="VAT rate" value={invoice.vat_rate} />
        <DetailField label="Job orders" value={invoice.job_order_ids.join(', ') || null} />
        <DetailField label="Created" value={formatDateTime(invoice.created_at)} />
        <DetailField label="Updated" value={formatDateTime(invoice.updated_at)} />
      </CardContent>
    </Card>
  );
}

function InvoiceLineItems({ lines }: { readonly lines: readonly InvoiceLineItem[] }) {
  if (lines.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Invoice lines</CardTitle>
          <CardDescription>Line items were not returned by the invoice detail API.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invoice lines</CardTitle>
        <CardDescription>
          Service, labor, part, and custom lines copied into the invoice.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <ul className="grid gap-3 lg:hidden">
          {lines.map((line) => (
            <li key={line.id}>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{line.description}</CardTitle>
                  <CardDescription>{formatStatusLabel(line.line_type)}</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
                  <DetailField label="Quantity" value={formatQuantity(line.quantity)} />
                  <DetailField label="Unit price" value={formatMoney(line.unit_price)} />
                  <DetailField label="Discount" value={formatMoney(line.line_discount_amount)} />
                  <DetailField label="Tax" value={formatMoney(line.tax_amount)} />
                  <DetailField label="Line total" value={formatMoney(line.line_total)} />
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>

        <div className="hidden overflow-hidden rounded-2xl border border-border lg:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit</TableHead>
                <TableHead className="text-right">Discount</TableHead>
                <TableHead className="text-right">Tax</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>{line.description}</TableCell>
                  <TableCell>{formatStatusLabel(line.line_type)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatQuantity(line.quantity)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(line.unit_price)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(line.line_discount_amount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(line.tax_amount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(line.line_total)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function InvoiceStatusHistory({ invoice }: { readonly invoice: InvoiceDetail }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Status history</CardTitle>
        <CardDescription>Workflow status events returned by the invoice API.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {invoice.status_events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No status events were returned.</p>
        ) : (
          invoice.status_events.map((event) => (
            <div
              key={event.id}
              className="grid gap-1 rounded-xl border border-border bg-muted/40 p-3"
            >
              <p className="text-sm font-semibold text-foreground">
                {event.from_status === null ? 'Created' : formatStatusLabel(event.from_status)} to{' '}
                {formatStatusLabel(event.to_status)}
              </p>
              <p className="text-sm text-muted-foreground">
                {formatDateTime(event.created_at)} / {event.reason ?? 'No reason returned'}
              </p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function DetailField({ label, value }: { readonly label: string; readonly value: string | null }) {
  return (
    <div className="grid gap-1 rounded-xl border border-border bg-muted/40 p-3">
      <span className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      <span className="break-words text-foreground">{value ?? '-'}</span>
    </div>
  );
}
