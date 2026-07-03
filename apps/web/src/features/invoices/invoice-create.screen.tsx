'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

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
} from '../../components/ui';
import { getCurrentSession } from '../auth/queries/get-current-session.query';
import type { AuthSessionResponseData } from '../auth/types/auth-session';

import { createDraftInvoice } from './invoice.api';
import type { CreateDraftInvoiceInput, InvoiceDiscountType } from './invoice.types';
import {
  canUseInvoiceWriteActions,
  generateIdempotencyKey,
  getApiErrorCode,
  hasPermission,
  toSafeErrorDetail,
  toSafeErrorMessage,
  useNetworkStatus,
} from './invoice.ui';

type FormState =
  | { readonly status: 'idle' }
  | { readonly status: 'submitting' }
  | {
      readonly status: 'error';
      readonly message: string;
      readonly detail: string | null;
      readonly code: string | null;
    };

export function InvoiceCreateScreen() {
  const router = useRouter();
  const [sessionState, setSessionState] = useState<
    | { readonly status: 'loading' }
    | { readonly status: 'ready'; readonly session: AuthSessionResponseData }
    | { readonly status: 'error'; readonly message: string; readonly detail: string | null }
  >({ status: 'loading' });
  const [jobOrderIds, setJobOrderIds] = useState('');
  const [jobOrderLineIds, setJobOrderLineIds] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [discountType, setDiscountType] = useState<InvoiceDiscountType>('none');
  const [discountAmount, setDiscountAmount] = useState('');
  const [discountPercentage, setDiscountPercentage] = useState('');
  const [discountReason, setDiscountReason] = useState('');
  const [formState, setFormState] = useState<FormState>({ status: 'idle' });
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
  const canCreateInvoices = hasPermission(session, 'invoices.create');
  const writeActionsAllowed = canUseInvoiceWriteActions({ session, networkStatus });
  const blockedReason = getCreateBlockedReason({
    session,
    canCreateInvoices,
    writeActionsAllowed,
    isOffline: networkStatus === 'offline',
  });
  const submitting = formState.status === 'submitting';

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const input = buildDraftInvoiceInput({
      jobOrderIds,
      jobOrderLineIds,
      invoiceDate,
      dueDate,
      discountType,
      discountAmount,
      discountPercentage,
      discountReason,
    });

    if (blockedReason !== null) {
      setFormState({
        status: 'error',
        message: blockedReason,
        detail: null,
        code: 'forbidden',
      });
      return;
    }

    if (typeof input === 'string') {
      setFormState({
        status: 'error',
        message: input,
        detail: null,
        code: 'validation_failed',
      });
      return;
    }

    setFormState({ status: 'submitting' });

    try {
      const created = await createDraftInvoice({
        input,
        idempotencyKey: generateIdempotencyKey('invoice-draft'),
      });

      router.push(`/invoices/${encodeURIComponent(created.id)}`);
    } catch (error) {
      setFormState({
        status: 'error',
        message: toSafeErrorMessage(error, 'Unable to create this draft invoice.'),
        detail: toSafeErrorDetail(error),
        code: getApiErrorCode(error),
      });
    }
  }

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

  return (
    <Card>
      <CardHeader>
        <p className="text-xs font-black uppercase tracking-[0.22em] text-muted-foreground">
          Draft invoice
        </p>
        <CardTitle className="mt-2 text-2xl">Create invoice from job orders</CardTitle>
        <CardDescription>
          Create a draft service invoice from existing job order IDs and optional billable line IDs.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="grid gap-5">
          {blockedReason === null ? null : (
            <Alert>
              <p className="text-sm leading-6">{blockedReason}</p>
            </Alert>
          )}

          {formState.status === 'error' ? (
            <Alert variant="destructive">
              <p className="text-sm font-bold">{formState.message}</p>
              {formState.code === null ? null : (
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Error code: {formState.code}
                </p>
              )}
              {formState.detail === null ? null : (
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{formState.detail}</p>
              )}
            </Alert>
          ) : null}

          <label className="grid gap-2">
            <span className="text-sm font-bold text-foreground">Job order IDs</span>
            <textarea
              value={jobOrderIds}
              onChange={(event) => setJobOrderIds(event.currentTarget.value)}
              disabled={submitting || blockedReason !== null}
              placeholder="One UUID per line, or comma-separated"
              className="min-h-28 rounded-xl border border-input bg-background px-3 py-2 text-base text-foreground shadow-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-bold text-foreground">Job order line IDs</span>
            <textarea
              value={jobOrderLineIds}
              onChange={(event) => setJobOrderLineIds(event.currentTarget.value)}
              disabled={submitting || blockedReason !== null}
              placeholder="Optional. Leave blank to bill all eligible lines."
              className="min-h-28 rounded-xl border border-input bg-background px-3 py-2 text-base text-foreground shadow-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </label>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-sm font-bold text-foreground">Invoice date</span>
              <Input
                type="date"
                value={invoiceDate}
                onChange={(event) => setInvoiceDate(event.currentTarget.value)}
                disabled={submitting || blockedReason !== null}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-bold text-foreground">Due date</span>
              <Input
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.currentTarget.value)}
                disabled={submitting || blockedReason !== null}
              />
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-[12rem_1fr_1fr]">
            <label className="grid gap-2">
              <span className="text-sm font-bold text-foreground">Discount</span>
              <select
                value={discountType}
                onChange={(event) =>
                  setDiscountType(event.currentTarget.value as InvoiceDiscountType)
                }
                disabled={submitting || blockedReason !== null}
                className="min-h-11 rounded-xl border border-input bg-background px-3 py-2 text-base text-foreground shadow-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="none">None</option>
                <option value="fixed">Fixed amount</option>
                <option value="percentage">Percentage</option>
              </select>
            </label>

            {discountType === 'fixed' ? (
              <label className="grid gap-2">
                <span className="text-sm font-bold text-foreground">Discount amount</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={discountAmount}
                  onChange={(event) => setDiscountAmount(event.currentTarget.value)}
                  disabled={submitting || blockedReason !== null}
                />
              </label>
            ) : null}

            {discountType === 'percentage' ? (
              <label className="grid gap-2">
                <span className="text-sm font-bold text-foreground">Discount percentage</span>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.0001"
                  value={discountPercentage}
                  onChange={(event) => setDiscountPercentage(event.currentTarget.value)}
                  disabled={submitting || blockedReason !== null}
                />
              </label>
            ) : null}

            {discountType !== 'none' ? (
              <label className="grid gap-2 md:col-span-3">
                <span className="text-sm font-bold text-foreground">Discount reason</span>
                <Input
                  value={discountReason}
                  onChange={(event) => setDiscountReason(event.currentTarget.value)}
                  disabled={submitting || blockedReason !== null}
                />
              </label>
            ) : null}
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-3 sm:flex-row">
          <Button type="submit" disabled={submitting || blockedReason !== null}>
            {submitting ? 'Creating...' : 'Create draft invoice'}
          </Button>
          <ButtonLink href="/invoices" variant="secondary">
            Back to invoices
          </ButtonLink>
        </CardFooter>
      </form>
    </Card>
  );
}

function getCreateBlockedReason({
  session,
  canCreateInvoices,
  writeActionsAllowed,
  isOffline,
}: {
  readonly session: AuthSessionResponseData | null;
  readonly canCreateInvoices: boolean;
  readonly writeActionsAllowed: boolean;
  readonly isOffline: boolean;
}): string | null {
  if (session === null) {
    return null;
  }

  if (!canCreateInvoices) {
    return 'Your tenant session does not include invoices.create permission.';
  }

  if (isOffline) {
    return 'Reconnect before creating draft invoices. Offline mode is read-only.';
  }

  if (session.access.read_only === true) {
    return 'This tenant is read-only. Operational invoice writes are blocked.';
  }

  if (!writeActionsAllowed) {
    return 'Invoice creation is blocked by the current tenant session.';
  }

  return null;
}

function buildDraftInvoiceInput(input: {
  readonly jobOrderIds: string;
  readonly jobOrderLineIds: string;
  readonly invoiceDate: string;
  readonly dueDate: string;
  readonly discountType: InvoiceDiscountType;
  readonly discountAmount: string;
  readonly discountPercentage: string;
  readonly discountReason: string;
}): CreateDraftInvoiceInput | string {
  const jobOrderIds = parseIds(input.jobOrderIds);

  if (jobOrderIds.length === 0) {
    return 'At least one job order ID is required.';
  }

  const jobOrderLineIds = parseIds(input.jobOrderLineIds);
  const request: CreateDraftInvoiceInput = {
    job_order_ids: jobOrderIds,
    ...(jobOrderLineIds.length > 0 ? { job_order_line_ids: jobOrderLineIds } : {}),
    ...(input.invoiceDate.length > 0 ? { invoice_date: input.invoiceDate } : {}),
    ...(input.dueDate.length > 0 ? { due_date: input.dueDate } : {}),
  };

  if (input.discountType === 'fixed') {
    if (input.discountAmount.length === 0 || input.discountReason.trim().length === 0) {
      return 'Fixed invoice discounts require an amount and reason.';
    }

    return {
      ...request,
      invoice_level_discount: {
        type: 'fixed',
        amount: Number(input.discountAmount).toFixed(2),
        reason: input.discountReason.trim(),
      },
    };
  }

  if (input.discountType === 'percentage') {
    if (input.discountPercentage.length === 0 || input.discountReason.trim().length === 0) {
      return 'Percentage invoice discounts require a percentage and reason.';
    }

    return {
      ...request,
      invoice_level_discount: {
        type: 'percentage',
        percentage: input.discountPercentage,
        reason: input.discountReason.trim(),
      },
    };
  }

  return request;
}

function parseIds(value: string): readonly string[] {
  return [
    ...new Set(
      value
        .split(/[\s,]+/)
        .map((part) => part.trim())
        .filter((part) => part.length > 0),
    ),
  ];
}
