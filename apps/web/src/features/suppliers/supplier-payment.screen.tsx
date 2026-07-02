'use client';

import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';

import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Skeleton,
} from '../../components/ui';
import { isApiClientError, type ApiClientError } from '../../lib/api-envelope';
import { getCurrentSession } from '../auth/queries/get-current-session.query';
import type { AuthSessionResponseData } from '../auth/types/auth-session';

import {
  createSupplierPaymentIdempotencyKey,
  getSupplier,
  recordSupplierPayment,
} from './supplier.api';
import {
  defaultSupplierPaymentFormValues,
  supplierPaymentMethodOptions,
} from './supplier.defaults';
import type {
  SupplierDetail,
  SupplierPaymentFormValues,
  SupplierPaymentInput,
  SupplierPaymentMutationResult,
} from './supplier.types';
import {
  canUseSupplierWriteActions,
  getFieldErrorMap,
  getSupplierWriteBlockReason,
  hasPermission,
  toSafeErrorDetail,
  toSafeErrorMessage,
  useNetworkStatus,
  type NetworkStatus,
} from './supplier.ui';

interface SupplierPaymentScreenProps {
  readonly supplierId: string;
}

type SessionState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly session: AuthSessionResponseData }
  | { readonly status: 'error'; readonly message: string; readonly detail: string | null };

type SupplierState =
  | { readonly status: 'idle' | 'loading'; readonly supplier: SupplierDetail | null }
  | { readonly status: 'ready'; readonly supplier: SupplierDetail }
  | { readonly status: 'error'; readonly message: string; readonly detail: string | null };

type SubmitState =
  | { readonly status: 'idle' }
  | { readonly status: 'submitting' }
  | { readonly status: 'success'; readonly result: SupplierPaymentMutationResult }
  | { readonly status: 'error'; readonly error: ApiClientError | null; readonly message: string };

export function SupplierPaymentScreen({ supplierId }: SupplierPaymentScreenProps) {
  const targetSupplierId = supplierId.length > 0 ? supplierId : null;
  const [sessionState, setSessionState] = useState<SessionState>({ status: 'loading' });
  const [supplierState, setSupplierState] = useState<SupplierState>({
    status: 'idle',
    supplier: null,
  });
  const [values, setValues] = useState<SupplierPaymentFormValues>(defaultSupplierPaymentFormValues);
  const [submitState, setSubmitState] = useState<SubmitState>({ status: 'idle' });
  const [clientError, setClientError] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(createSupplierPaymentIdempotencyKey);
  const networkStatus = useNetworkStatus();

  useEffect(() => {
    let active = true;

    async function loadSession() {
      setSessionState({ status: 'loading' });

      try {
        const session = await getCurrentSession();

        if (!active) {
          return;
        }

        setSessionState({ status: 'ready', session });
      } catch (error) {
        if (!active) {
          return;
        }

        setSessionState({
          status: 'error',
          message: toSafeErrorMessage(error, 'Unable to load your GarageOS session.'),
          detail: toSafeErrorDetail(error),
        });
      }
    }

    void loadSession();

    return () => {
      active = false;
    };
  }, []);

  const session = sessionState.status === 'ready' ? sessionState.session : null;
  const canReadSupplier = hasPermission(session, 'suppliers.read');
  const hasPaymentPermission = hasPermission(session, 'supplier_payments.create');
  const writeActionsAllowed = canUseSupplierWriteActions({ session, networkStatus });

  useEffect(() => {
    if (sessionState.status !== 'ready') {
      return;
    }

    if (!canReadSupplier) {
      return;
    }

    if (targetSupplierId === null) {
      setSupplierState({
        status: 'error',
        message: 'Supplier ID is required before recording a supplier payment.',
        detail: null,
      });
      return;
    }

    let active = true;

    async function loadSupplier(currentSupplierId: string) {
      setSupplierState({ status: 'loading', supplier: null });

      try {
        const supplier = await getSupplier(currentSupplierId);

        if (!active) {
          return;
        }

        setSupplierState({ status: 'ready', supplier });
      } catch (error) {
        if (!active) {
          return;
        }

        setSupplierState({
          status: 'error',
          message: toSafeErrorMessage(error, 'Unable to load this supplier.'),
          detail: toSafeErrorDetail(error),
        });
      }
    }

    void loadSupplier(targetSupplierId);

    return () => {
      active = false;
    };
  }, [canReadSupplier, sessionState.status, targetSupplierId]);

  const supplier = supplierState.status === 'ready' ? supplierState.supplier : null;
  const supplierIsActive = supplier?.status === 'active';
  const baseCanSubmit = canReadSupplier && hasPaymentPermission && writeActionsAllowed;
  const canSubmit = baseCanSubmit && supplierIsActive;
  const blockReason = getSupplierPaymentBlockReason({
    session,
    networkStatus,
    canReadSupplier,
    hasPaymentPermission,
    supplier,
  });

  function handleChange(nextValues: SupplierPaymentFormValues) {
    setValues(nextValues);
    setClientError(null);

    if (submitState.status !== 'submitting') {
      setSubmitState({ status: 'idle' });
      setIdempotencyKey(createSupplierPaymentIdempotencyKey());
    }
  }

  async function handleSubmit() {
    setClientError(null);
    setSubmitState({ status: 'idle' });

    const validationError = validateSupplierPaymentForm(values);

    if (validationError !== null) {
      setClientError(validationError);
      return;
    }

    if (!canSubmit || targetSupplierId === null) {
      setClientError(blockReason ?? 'Supplier payment recording is currently blocked.');
      return;
    }

    const input = toSupplierPaymentInput(values);

    setSubmitState({ status: 'submitting' });

    try {
      const result = await recordSupplierPayment({
        supplierId: targetSupplierId,
        input,
        idempotencyKey,
      });

      setSubmitState({ status: 'success', result });
      setValues({
        ...defaultSupplierPaymentFormValues,
        payment_date: values.payment_date,
        payment_method: values.payment_method,
      });
      setIdempotencyKey(createSupplierPaymentIdempotencyKey());
    } catch (error) {
      if (isApiClientError(error)) {
        setSubmitState({ status: 'error', error, message: error.message });
      } else {
        setSubmitState({
          status: 'error',
          error: null,
          message: toSafeErrorMessage(error, 'Unable to record supplier payment.'),
        });
      }
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

  if (session !== null && !canReadSupplier) {
    return (
      <Alert variant="destructive">
        <p className="text-sm font-bold">Supplier payment unavailable</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Your tenant session does not include permission to view supplier records.
        </p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Required permission: <strong>suppliers.read</strong>
        </p>
      </Alert>
    );
  }

  if (
    sessionState.status === 'loading' ||
    supplierState.status === 'idle' ||
    supplierState.status === 'loading'
  ) {
    return (
      <div className="grid gap-4" aria-busy="true" aria-live="polite">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (supplierState.status === 'error') {
    return (
      <Alert variant="destructive">
        <p className="text-sm font-bold">{supplierState.message}</p>
        {supplierState.detail === null ? null : (
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{supplierState.detail}</p>
        )}
      </Alert>
    );
  }

  if (supplierState.status !== 'ready') {
    return (
      <Alert variant="destructive">
        <p className="text-sm font-bold">Supplier payment unavailable</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Supplier data could not be resolved into a ready state. Refresh the page and try again.
        </p>
      </Alert>
    );
  }

  const readySupplier = supplierState.supplier;

  return (
    <SupplierPaymentForm
      supplier={supplierState.supplier}
      values={values}
      disabled={!canSubmit}
      submitting={submitState.status === 'submitting'}
      apiError={submitState.status === 'error' ? submitState.error : null}
      clientError={clientError}
      successResult={submitState.status === 'success' ? submitState.result : null}
      blockReason={blockReason}
      onChange={handleChange}
      onSubmit={() => void handleSubmit()}
    />
  );
}

function SupplierPaymentForm({
  supplier,
  values,
  disabled,
  submitting,
  apiError,
  clientError,
  successResult,
  blockReason,
  onChange,
  onSubmit,
}: {
  readonly supplier: SupplierDetail;
  readonly values: SupplierPaymentFormValues;
  readonly disabled: boolean;
  readonly submitting: boolean;
  readonly apiError: ApiClientError | null;
  readonly clientError: string | null;
  readonly successResult: SupplierPaymentMutationResult | null;
  readonly blockReason: string | null;
  readonly onChange: (values: SupplierPaymentFormValues) => void;
  readonly onSubmit: () => void;
}) {
  const fieldErrors = getFieldErrorMap(apiError);

  function handleChange(field: keyof SupplierPaymentFormValues) {
    return (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      onChange({
        ...values,
        [field]: event.currentTarget.value,
      });
    };
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit}>
      <Card>
        <CardHeader className="gap-4 lg:grid lg:grid-cols-[1fr_auto] lg:items-start">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-muted-foreground">
              Purchasing and accounts payable
            </p>
            <CardTitle className="mt-2 text-2xl">Record supplier payment</CardTitle>
            <CardDescription className="mt-2">
              Record a manual payment against supplier accounts payable. Backend validation remains
              authoritative for payable balance, tenant status, permissions, and idempotency.
            </CardDescription>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{supplier.name}</span>
              <Badge variant={supplier.status === 'active' ? 'success' : 'readonly'}>
                {formatStatusLabel(supplier.status)}
              </Badge>
            </div>
            <p className="mt-2 break-all text-xs text-muted-foreground">
              Supplier ID: <span className="font-mono">{supplier.id}</span>
            </p>
          </div>
          <ButtonLink href="/suppliers" variant="secondary">
            Back to suppliers
          </ButtonLink>
        </CardHeader>
      </Card>

      {blockReason === null ? null : (
        <Alert variant="destructive">
          <p className="text-sm font-bold">Supplier payment blocked</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{blockReason}</p>
        </Alert>
      )}

      {clientError === null ? null : (
        <Alert variant="destructive">
          <p className="text-sm font-bold">Check the supplier payment form</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{clientError}</p>
        </Alert>
      )}

      {apiError === null ? null : (
        <Alert variant="destructive">
          <p className="text-sm font-bold">{apiError.message}</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Error code: {apiError.code}
          </p>
          {apiError.requestId === null && apiError.correlationId === null ? null : (
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Reference:{' '}
              {[apiError.requestId, apiError.correlationId]
                .filter((value): value is string => value !== null)
                .join(' · ')}
            </p>
          )}
        </Alert>
      )}

      {successResult === null ? null : (
        <Alert variant="success">
          <p className="text-sm font-bold">Supplier payment recorded.</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Payment {successResult.payment.id} reduced payable balance from{' '}
            <strong>{formatMoney(successResult.balance.before_payment)}</strong> to{' '}
            <strong>{formatMoney(successResult.balance.after_payment)}</strong>.
          </p>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Payment information</CardTitle>
          <CardDescription>
            Amount, payment date, and payment method are required. Reference number and notes are
            optional manual-payment fields.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <SupplierPaymentInput
              id="supplier-payment-amount"
              label="Amount"
              type="number"
              value={values.amount}
              disabled={disabled || submitting}
              required
              inputMode="decimal"
              step="0.01"
              min="0.01"
              fieldError={fieldErrors.get('amount') ?? null}
              onChange={handleChange('amount')}
            />
            <SupplierPaymentInput
              id="supplier-payment-date"
              label="Payment date"
              type="date"
              value={values.payment_date}
              disabled={disabled || submitting}
              required
              fieldError={fieldErrors.get('payment_date') ?? null}
              onChange={handleChange('payment_date')}
            />
          </div>

          <label className="grid gap-2" htmlFor="supplier-payment-method">
            <span className="text-sm font-bold text-foreground">
              Payment method<span className="text-destructive"> *</span>
            </span>
            <select
              id="supplier-payment-method"
              value={values.payment_method}
              disabled={disabled || submitting}
              required
              onChange={handleChange('payment_method')}
              className="min-h-11 rounded-xl border border-input bg-background px-3 py-2 text-base text-foreground shadow-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {supplierPaymentMethodOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {fieldErrors.get('payment_method') === undefined ? null : (
              <span className="text-sm text-destructive">{fieldErrors.get('payment_method')}</span>
            )}
          </label>

          <SupplierPaymentInput
            id="supplier-payment-reference"
            label="Reference number"
            value={values.reference_number}
            disabled={disabled || submitting}
            fieldError={fieldErrors.get('reference_number') ?? null}
            onChange={handleChange('reference_number')}
          />

          <label className="grid gap-2" htmlFor="supplier-payment-notes">
            <span className="text-sm font-bold text-foreground">Notes</span>
            <textarea
              id="supplier-payment-notes"
              value={values.notes}
              disabled={disabled || submitting}
              onChange={handleChange('notes')}
              className="min-h-28 rounded-xl border border-input bg-background px-3 py-2 text-base text-foreground shadow-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
            />
            {fieldErrors.get('notes') === undefined ? null : (
              <span className="text-sm text-destructive">{fieldErrors.get('notes')}</span>
            )}
          </label>
        </CardContent>
      </Card>

      <Card className="sticky bottom-20 z-10 flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-end md:bottom-4">
        <ButtonLink href="/suppliers" variant="secondary">
          Cancel
        </ButtonLink>
        <Button type="submit" disabled={disabled || submitting}>
          {submitting ? 'Recording…' : 'Record supplier payment'}
        </Button>
      </Card>
    </form>
  );
}

function SupplierPaymentInput({
  id,
  label,
  type = 'text',
  value,
  disabled,
  required = false,
  inputMode,
  step,
  min,
  fieldError,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly type?: string;
  readonly value: string;
  readonly disabled: boolean;
  readonly required?: boolean;
  readonly inputMode?: 'decimal';
  readonly step?: string;
  readonly min?: string;
  readonly fieldError: string | null;
  readonly onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="grid gap-2" htmlFor={id}>
      <span className="text-sm font-bold text-foreground">
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </span>
      <Input
        id={id}
        type={type}
        value={value}
        disabled={disabled}
        required={required}
        inputMode={inputMode}
        step={step}
        min={min}
        onChange={onChange}
      />
      {fieldError === null ? null : <span className="text-sm text-destructive">{fieldError}</span>}
    </label>
  );
}

function getSupplierPaymentBlockReason({
  session,
  networkStatus,
  canReadSupplier,
  hasPaymentPermission,
  supplier,
}: {
  readonly session: AuthSessionResponseData | null;
  readonly networkStatus: NetworkStatus;
  readonly canReadSupplier: boolean;
  readonly hasPaymentPermission: boolean;
  readonly supplier: SupplierDetail | null;
}): string | null {
  if (!canReadSupplier) {
    return 'Required permission: suppliers.read.';
  }

  if (!hasPaymentPermission) {
    return 'Required permission: supplier_payments.create.';
  }

  const writeBlockReason = getSupplierWriteBlockReason({
    session,
    networkStatus,
    requiredPermission: 'supplier_payments.create',
  });

  if (!canUseSupplierWriteActions({ session, networkStatus })) {
    return writeBlockReason;
  }

  if (supplier !== null && supplier.status !== 'active') {
    return 'Supplier must be active before recording a supplier payment.';
  }

  return null;
}

function validateSupplierPaymentForm(values: SupplierPaymentFormValues): string | null {
  const amount = values.amount.trim();

  if (amount.length === 0) {
    return 'Payment amount is required.';
  }

  if (!/^\d+(\.\d{1,2})?$/.test(amount)) {
    return 'Payment amount must be a positive decimal with up to 2 decimal places.';
  }

  if (Number(amount) <= 0) {
    return 'Payment amount must be greater than zero.';
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.payment_date)) {
    return 'Payment date must use YYYY-MM-DD format.';
  }

  const paymentDate = new Date(`${values.payment_date}T00:00:00.000Z`);

  if (
    Number.isNaN(paymentDate.getTime()) ||
    paymentDate.toISOString().slice(0, 10) !== values.payment_date
  ) {
    return 'Payment date must be a valid calendar date.';
  }

  if (!supplierPaymentMethodOptions.some((option) => option.value === values.payment_method)) {
    return 'Payment method is invalid.';
  }

  return null;
}

function toSupplierPaymentInput(values: SupplierPaymentFormValues): SupplierPaymentInput {
  return {
    amount: normalizeMoneyInput(values.amount),
    payment_date: values.payment_date,
    payment_method: values.payment_method,
    reference_number: toNullableString(values.reference_number),
    notes: toNullableString(values.notes),
  };
}

function normalizeMoneyInput(value: string): string {
  return Number(value.trim()).toFixed(2);
}

function toNullableString(value: string): string | null {
  const trimmedValue = value.trim();

  return trimmedValue.length > 0 ? trimmedValue : null;
}

function formatStatusLabel(status: string): string {
  return status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatMoney(value: string): string {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return value;
  }

  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(amount);
}
