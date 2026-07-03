'use client';

import { useEffect, useState, type FormEvent } from 'react';

import {
  Alert,
  Button,
  ButtonLink,
  Card,
  CardContent,
  CardDescription,
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
import { cancelInvoice, getInvoice, issueInvoice, voidInvoice } from './invoice.api';
import type { InvoiceDetail, InvoiceDetailState, InvoiceLineItem } from './invoice.types';
import {
  canUseInvoiceWriteActions,
  generateIdempotencyKey,
  getApiErrorCode,
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

    const blockedReason = getWorkflowBlockedReason({
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

  const issueBlockedReason = getWorkflowBlockedReason({
    action: 'issue',
    invoice,
    session,
    isOffline,
    writeActionsAllowed,
    reason: '',
  });
  const cancelBlockedReason = getWorkflowBlockedReason({
    action: 'cancel',
    invoice,
    session,
    isOffline,
    writeActionsAllowed,
    reason: cancelReason,
  });
  const voidBlockedReason = getWorkflowBlockedReason({
    action: 'void',
    invoice,
    session,
    isOffline,
    writeActionsAllowed,
    reason: voidReason,
  });
  const submitting = workflowState.status === 'submitting';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Workflow actions</CardTitle>
        <CardDescription>
          Issue, cancel, and void are explicit invoice workflow actions. Payment and refund UI are
          intentionally outside this slice.
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
              disabled={submitting || invoice.status !== 'draft'}
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

function getWorkflowBlockedReason({
  action,
  invoice,
  session,
  isOffline,
  writeActionsAllowed,
  reason,
}: {
  readonly action: 'issue' | 'cancel' | 'void';
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

  if (action === 'issue' && invoice.status !== 'draft') {
    return 'Only draft invoices can be issued.';
  }

  if (action === 'cancel' && invoice.status !== 'draft' && invoice.status !== 'pending') {
    return 'Only draft or pending zero-payment invoices can be cancelled.';
  }

  if ((action === 'cancel' || action === 'void') && reason.trim().length === 0) {
    return 'A reason is required for this invoice workflow action.';
  }

  if (action === 'void' && (invoice.status === 'draft' || invoice.status === 'cancelled')) {
    return 'Draft and cancelled invoices cannot be voided.';
  }

  return null;
}
