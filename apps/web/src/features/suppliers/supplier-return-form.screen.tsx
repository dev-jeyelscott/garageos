'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';

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
} from '../../components/ui';
import { isApiClientError, type ApiClientError } from '../../lib/api-envelope';
import { getCurrentSession } from '../auth/queries/get-current-session.query';
import type { AuthSessionResponseData } from '../auth/types/auth-session';

import { getSuppliers } from './supplier.api';
import { supplierListPageSize } from './supplier.defaults';
import type { SupplierListItem } from './supplier.types';
import {
  createSupplierReturn,
  createSupplierReturnCreateIdempotencyKey,
  getSupplierReturn,
  updateSupplierReturn,
} from './supplier-return.api';
import {
  createDefaultSupplierReturnLine,
  defaultSupplierReturnFormValues,
} from './supplier-return.defaults';
import type {
  SupplierReturnDetail,
  SupplierReturnFormLineValues,
  SupplierReturnFormValues,
  SupplierReturnInput,
  SupplierReturnUpdateInput,
} from './supplier-return.types';
import {
  canUseSupplierWriteActions,
  getFieldErrorMap,
  hasPermission,
  toSafeErrorDetail,
  toSafeErrorMessage,
  useNetworkStatus,
  type NetworkStatus,
} from './supplier.ui';

interface SupplierReturnFormScreenProps {
  readonly supplierReturnId: string | null;
}

type SessionState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly session: AuthSessionResponseData }
  | { readonly status: 'error'; readonly message: string; readonly detail: string | null };

type SupplierOptionsState =
  | { readonly status: 'idle' | 'loading'; readonly suppliers: readonly SupplierListItem[] }
  | { readonly status: 'loaded'; readonly suppliers: readonly SupplierListItem[] }
  | {
      readonly status: 'error';
      readonly suppliers: readonly SupplierListItem[];
      readonly message: string;
    };

type DetailState =
  | { readonly status: 'idle' | 'loading' }
  | { readonly status: 'loaded'; readonly supplierReturn: SupplierReturnDetail }
  | { readonly status: 'error'; readonly message: string; readonly detail: string | null };

type SubmitState =
  | { readonly status: 'idle' }
  | { readonly status: 'submitting' }
  | { readonly status: 'success'; readonly supplierReturn: SupplierReturnDetail }
  | { readonly status: 'error'; readonly error: ApiClientError | null; readonly message: string };

export function SupplierReturnFormScreen({ supplierReturnId }: SupplierReturnFormScreenProps) {
  const mode = supplierReturnId === null ? 'create' : 'edit';
  const router = useRouter();
  const [sessionState, setSessionState] = useState<SessionState>({ status: 'loading' });
  const [supplierOptionsState, setSupplierOptionsState] = useState<SupplierOptionsState>({
    status: 'idle',
    suppliers: [],
  });
  const [detailState, setDetailState] = useState<DetailState>({ status: 'idle' });
  const [values, setValues] = useState<SupplierReturnFormValues>(defaultSupplierReturnFormValues);
  const [submitState, setSubmitState] = useState<SubmitState>({ status: 'idle' });
  const [clientError, setClientError] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(createSupplierReturnCreateIdempotencyKey);
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
  const canCreateSupplierReturns = hasPermission(session, 'supplier_returns.create');
  const canReadSupplierReturns = hasPermission(session, 'supplier_returns.read');
  const canReadSuppliers = hasPermission(session, 'suppliers.read');
  const writeActionsAllowed = canUseSupplierWriteActions({ session, networkStatus });
  const accessibleBranches = session?.branches ?? [];
  const selectedBranchIsAccessible = accessibleBranches.some(
    (branch) => branch.id === values.branch_id,
  );
  const detail = detailState.status === 'loaded' ? detailState.supplierReturn : null;
  const editIsDraft = mode === 'create' || detail?.status === 'draft';
  const canSubmit =
    canCreateSupplierReturns &&
    writeActionsAllowed &&
    editIsDraft &&
    accessibleBranches.length > 0 &&
    selectedBranchIsAccessible;
  const blockReason = getSupplierReturnFormBlockReason({
    mode,
    session,
    networkStatus,
    canCreateSupplierReturns,
    accessibleBranchCount: accessibleBranches.length,
    selectedBranchIsAccessible,
    supplierReturn: detail,
  });

  useEffect(() => {
    if (sessionState.status !== 'ready') {
      return;
    }

    if (values.branch_id.length > 0 || accessibleBranches.length !== 1) {
      return;
    }

    const firstBranch = accessibleBranches[0];

    if (firstBranch === undefined) {
      return;
    }

    setValues((current) => ({
      ...current,
      branch_id: firstBranch.id,
    }));
  }, [accessibleBranches, sessionState.status, values.branch_id.length]);

  useEffect(() => {
    if (sessionState.status !== 'ready' || !canReadSuppliers || networkStatus === 'offline') {
      return;
    }

    let active = true;

    async function loadSupplierOptions() {
      setSupplierOptionsState({ status: 'loading', suppliers: [] });

      try {
        const result = await getSuppliers({
          filters: { q: '', status: 'active' },
          limit: Math.min(100, supplierListPageSize * 4),
        });

        if (!active) {
          return;
        }

        setSupplierOptionsState({ status: 'loaded', suppliers: result.suppliers });
      } catch (error) {
        if (!active) {
          return;
        }

        setSupplierOptionsState({
          status: 'error',
          suppliers: [],
          message: toSafeErrorMessage(error, 'Unable to load supplier options.'),
        });
      }
    }

    void loadSupplierOptions();

    return () => {
      active = false;
    };
  }, [canReadSuppliers, networkStatus, sessionState.status]);

  useEffect(() => {
    if (mode !== 'edit') {
      setDetailState({ status: 'idle' });
      return;
    }

    if (supplierReturnId === null) {
      return;
    }

    if (sessionState.status !== 'ready' || !canReadSupplierReturns) {
      return;
    }

    let active = true;

    async function loadSupplierReturn(currentSupplierReturnId: string) {
      setDetailState({ status: 'loading' });

      try {
        const supplierReturn = await getSupplierReturn(currentSupplierReturnId);

        if (!active) {
          return;
        }

        setDetailState({ status: 'loaded', supplierReturn });
        setValues(toSupplierReturnFormValues(supplierReturn));
      } catch (error) {
        if (!active) {
          return;
        }

        setDetailState({
          status: 'error',
          message: toSafeErrorMessage(error, 'Unable to load this supplier return.'),
          detail: toSafeErrorDetail(error),
        });
      }
    }

    void loadSupplierReturn(supplierReturnId);

    return () => {
      active = false;
    };
  }, [canReadSupplierReturns, mode, sessionState.status, supplierReturnId]);

  function handleValueChange(field: keyof Omit<SupplierReturnFormValues, 'lines'>) {
    return (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setValues((current) => ({
        ...current,
        [field]: event.currentTarget.value,
      }));
      resetSubmitMessages();
    };
  }

  function handleLineChange(
    clientId: string,
    field: keyof Omit<SupplierReturnFormLineValues, 'client_id'>,
  ) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      const nextValue = event.currentTarget.value;

      setValues((current) => ({
        ...current,
        lines: current.lines.map((line) =>
          line.client_id === clientId
            ? {
                ...line,
                [field]: nextValue,
              }
            : line,
        ),
      }));
      resetSubmitMessages();
    };
  }

  function handleAddLine() {
    setValues((current) => ({
      ...current,
      lines: [...current.lines, createDefaultSupplierReturnLine()],
    }));
    resetSubmitMessages();
  }

  function handleRemoveLine(clientId: string) {
    setValues((current) => {
      if (current.lines.length <= 1) {
        return current;
      }

      return {
        ...current,
        lines: current.lines.filter((line) => line.client_id !== clientId),
      };
    });
    resetSubmitMessages();
  }

  async function handleSubmit() {
    setClientError(null);
    setSubmitState({ status: 'idle' });

    const validationError = validateSupplierReturnForm(values);

    if (validationError !== null) {
      setClientError(validationError);
      return;
    }

    if (!canSubmit) {
      setClientError(blockReason ?? 'Supplier return submission is currently blocked.');
      return;
    }

    const input = toSupplierReturnInput(values);
    setSubmitState({ status: 'submitting' });

    try {
      const supplierReturn =
        mode === 'create'
          ? await createSupplierReturn({
              input,
              idempotencyKey,
            })
          : await updateSupplierReturn({
              supplierReturnId: supplierReturnId ?? '',
              input: toSupplierReturnUpdateInput(input, detail),
            });

      setSubmitState({ status: 'success', supplierReturn });
      setIdempotencyKey(createSupplierReturnCreateIdempotencyKey());
      router.push(`/supplier-returns/${supplierReturn.id}`);
    } catch (error) {
      if (isApiClientError(error)) {
        setSubmitState({ status: 'error', error, message: error.message });
      } else {
        setSubmitState({
          status: 'error',
          error: null,
          message: toSafeErrorMessage(error, 'Unable to save supplier return.'),
        });
      }
    }
  }

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void handleSubmit();
  }

  function resetSubmitMessages() {
    setClientError(null);

    if (submitState.status !== 'submitting') {
      setSubmitState({ status: 'idle' });

      if (mode === 'create') {
        setIdempotencyKey(createSupplierReturnCreateIdempotencyKey());
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

  if (session !== null && mode === 'edit' && !canReadSupplierReturns) {
    return (
      <Alert variant="destructive">
        <p className="text-sm font-bold">Supplier return edit unavailable</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Your tenant session does not include permission to view supplier returns.
        </p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Required permission: <strong>supplier_returns.read</strong>
        </p>
      </Alert>
    );
  }

  if (session !== null && !canCreateSupplierReturns) {
    return (
      <Alert variant="destructive">
        <p className="text-sm font-bold">Supplier return form unavailable</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Your tenant session does not include permission to create or update supplier returns.
        </p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Required permission: <strong>supplier_returns.create</strong>
        </p>
      </Alert>
    );
  }

  if (sessionState.status === 'loading' || detailState.status === 'loading') {
    return (
      <div className="grid gap-4" aria-busy="true" aria-live="polite">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (detailState.status === 'error') {
    return (
      <Alert variant="destructive">
        <p className="text-sm font-bold">{detailState.message}</p>
        {detailState.detail === null ? null : (
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{detailState.detail}</p>
        )}
      </Alert>
    );
  }

  const apiError = submitState.status === 'error' ? submitState.error : null;
  const fieldErrors = getFieldErrorMap(apiError);

  return (
    <form className="grid gap-4" onSubmit={handleFormSubmit}>
      <Card>
        <CardHeader className="gap-4 lg:grid lg:grid-cols-[1fr_auto] lg:items-start">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-muted-foreground">
              Purchasing and accounts payable
            </p>
            <CardTitle className="mt-2 text-2xl">
              {mode === 'create' ? 'New supplier return' : 'Edit supplier return'}
            </CardTitle>
            <CardDescription className="mt-2">
              Create or update a draft supplier return for stock previously received from a
              supplier. Product lookup is intentionally limited to product IDs because this slice
              does not add an undocumented product-search API.
            </CardDescription>
          </div>
          <ButtonLink href="/supplier-returns" variant="secondary">
            Back to supplier returns
          </ButtonLink>
        </CardHeader>
      </Card>

      {blockReason === null ? null : (
        <Alert variant="destructive">
          <p className="text-sm font-bold">Supplier return blocked</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{blockReason}</p>
        </Alert>
      )}

      {supplierOptionsState.status === 'error' ? (
        <Alert>
          <p className="text-sm font-bold">Supplier selector is using manual ID entry.</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {supplierOptionsState.message}
          </p>
        </Alert>
      ) : null}

      {clientError === null ? null : (
        <Alert variant="destructive">
          <p className="text-sm font-bold">Check the supplier return form</p>
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

      <Card>
        <CardHeader>
          <CardTitle>Return header</CardTitle>
          <CardDescription>
            Branch, supplier, and reason are required. Original receiving reference is optional when
            the backend can trace it.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2" htmlFor="supplier-return-branch">
              <span className="text-sm font-bold text-foreground">
                Branch<span className="text-destructive"> *</span>
              </span>
              <select
                id="supplier-return-branch"
                value={values.branch_id}
                disabled={!writeActionsAllowed || submitState.status === 'submitting'}
                required
                onChange={handleValueChange('branch_id')}
                className="min-h-11 rounded-xl border border-input bg-background px-3 py-2 text-base text-foreground shadow-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="">Select branch</option>
                {accessibleBranches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
              {fieldErrors.get('branch_id') === undefined ? null : (
                <span className="text-sm text-destructive">{fieldErrors.get('branch_id')}</span>
              )}
            </label>

            {canReadSuppliers && supplierOptionsState.status === 'loaded' ? (
              <label className="grid gap-2" htmlFor="supplier-return-supplier">
                <span className="text-sm font-bold text-foreground">
                  Supplier<span className="text-destructive"> *</span>
                </span>
                <select
                  id="supplier-return-supplier"
                  value={values.supplier_id}
                  disabled={!writeActionsAllowed || submitState.status === 'submitting'}
                  required
                  onChange={handleValueChange('supplier_id')}
                  className="min-h-11 rounded-xl border border-input bg-background px-3 py-2 text-base text-foreground shadow-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="">Select active supplier</option>
                  {supplierOptionsState.suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
                {fieldErrors.get('supplier_id') === undefined ? null : (
                  <span className="text-sm text-destructive">{fieldErrors.get('supplier_id')}</span>
                )}
              </label>
            ) : (
              <SupplierReturnTextInput
                id="supplier-return-supplier"
                label="Supplier ID"
                value={values.supplier_id}
                disabled={!writeActionsAllowed || submitState.status === 'submitting'}
                required
                fieldError={fieldErrors.get('supplier_id') ?? null}
                onChange={handleValueChange('supplier_id')}
              />
            )}
          </div>

          <SupplierReturnTextInput
            id="supplier-return-original-receiving"
            label="Original receiving ID"
            value={values.original_receiving_id}
            disabled={!writeActionsAllowed || submitState.status === 'submitting'}
            fieldError={fieldErrors.get('original_receiving_id') ?? null}
            onChange={handleValueChange('original_receiving_id')}
          />

          <label className="grid gap-2" htmlFor="supplier-return-reason">
            <span className="text-sm font-bold text-foreground">
              Reason<span className="text-destructive"> *</span>
            </span>
            <textarea
              id="supplier-return-reason"
              value={values.reason}
              disabled={!writeActionsAllowed || submitState.status === 'submitting'}
              required
              onChange={handleValueChange('reason')}
              className="min-h-28 rounded-xl border border-input bg-background px-3 py-2 text-base text-foreground shadow-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
            />
            {fieldErrors.get('reason') === undefined ? null : (
              <span className="text-sm text-destructive">{fieldErrors.get('reason')}</span>
            )}
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-4 lg:grid lg:grid-cols-[1fr_auto] lg:items-start">
          <div>
            <CardTitle>Returned products</CardTitle>
            <CardDescription>
              Add one or more product lines. Returned quantity must be greater than zero and is
              validated again by the backend against available unreserved stock and FIFO rules.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={!writeActionsAllowed || submitState.status === 'submitting'}
            onClick={handleAddLine}
          >
            Add line
          </Button>
        </CardHeader>
        <CardContent className="grid gap-4">
          {values.lines.map((line, index) => (
            <div key={line.client_id} className="rounded-2xl border bg-background p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-sm font-black uppercase tracking-[0.18em] text-muted-foreground">
                  Line {index + 1}
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={
                    values.lines.length <= 1 ||
                    !writeActionsAllowed ||
                    submitState.status === 'submitting'
                  }
                  onClick={() => handleRemoveLine(line.client_id)}
                >
                  Remove
                </Button>
              </div>
              <div className="grid gap-4 md:grid-cols-[1fr_12rem]">
                <SupplierReturnTextInput
                  id={`supplier-return-product-${line.client_id}`}
                  label="Product ID"
                  value={line.product_id}
                  disabled={!writeActionsAllowed || submitState.status === 'submitting'}
                  required
                  fieldError={fieldErrors.get(`lines.${index}.product_id`) ?? null}
                  onChange={handleLineChange(line.client_id, 'product_id')}
                />
                <SupplierReturnTextInput
                  id={`supplier-return-quantity-${line.client_id}`}
                  label="Returned quantity"
                  type="number"
                  value={line.returned_quantity}
                  disabled={!writeActionsAllowed || submitState.status === 'submitting'}
                  required
                  inputMode="decimal"
                  step="0.001"
                  min="0.001"
                  fieldError={fieldErrors.get(`lines.${index}.returned_quantity`) ?? null}
                  onChange={handleLineChange(line.client_id, 'returned_quantity')}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="sticky bottom-20 z-10 flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-end md:bottom-4">
        <ButtonLink href="/supplier-returns" variant="secondary">
          Cancel
        </ButtonLink>
        <Button type="submit" disabled={!canSubmit || submitState.status === 'submitting'}>
          {submitState.status === 'submitting'
            ? 'Saving…'
            : mode === 'create'
              ? 'Create draft return'
              : 'Save draft return'}
        </Button>
      </Card>
    </form>
  );
}

function SupplierReturnTextInput({
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

function getSupplierReturnFormBlockReason({
  mode,
  session,
  networkStatus,
  canCreateSupplierReturns,
  accessibleBranchCount,
  selectedBranchIsAccessible,
  supplierReturn,
}: {
  readonly mode: 'create' | 'edit';
  readonly session: AuthSessionResponseData | null;
  readonly networkStatus: NetworkStatus;
  readonly canCreateSupplierReturns: boolean;
  readonly accessibleBranchCount: number;
  readonly selectedBranchIsAccessible: boolean;
  readonly supplierReturn: SupplierReturnDetail | null;
}): string | null {
  if (!canCreateSupplierReturns) {
    return 'Required permission: supplier_returns.create.';
  }

  if (session === null) {
    return 'Supplier return actions are unavailable while your session is loading.';
  }

  if (session.access.can_access_operational_modules !== true || session.access.read_only === true) {
    return 'Supplier return writes are blocked while this tenant is read-only or otherwise write-restricted.';
  }

  if (networkStatus === 'offline') {
    return 'Offline mode is read-only. Reconnect before creating or updating supplier returns.';
  }

  if (accessibleBranchCount === 0) {
    return 'No accessible branch is available for this supplier return.';
  }

  if (!selectedBranchIsAccessible) {
    return 'Select one of your accessible branches before saving the supplier return.';
  }

  if (mode === 'edit' && supplierReturn !== null && supplierReturn.status !== 'draft') {
    return 'Only draft supplier returns can be edited.';
  }

  return null;
}

function validateSupplierReturnForm(values: SupplierReturnFormValues): string | null {
  if (values.branch_id.trim().length === 0) {
    return 'Branch is required.';
  }

  if (values.supplier_id.trim().length === 0) {
    return 'Supplier is required.';
  }

  if (values.reason.trim().length === 0) {
    return 'Reason is required.';
  }

  if (values.lines.length === 0) {
    return 'At least one returned product line is required.';
  }

  for (const [index, line] of values.lines.entries()) {
    const lineNumber = index + 1;

    if (line.product_id.trim().length === 0) {
      return `Product ID is required on line ${lineNumber}.`;
    }

    const quantity = line.returned_quantity.trim();

    if (quantity.length === 0) {
      return `Returned quantity is required on line ${lineNumber}.`;
    }

    if (!/^\d+(\.\d{1,3})?$/.test(quantity)) {
      return `Returned quantity on line ${lineNumber} must be a positive decimal with up to 3 decimal places.`;
    }

    if (Number(quantity) <= 0) {
      return `Returned quantity on line ${lineNumber} must be greater than zero.`;
    }
  }

  return null;
}

function toSupplierReturnInput(values: SupplierReturnFormValues): SupplierReturnInput {
  return {
    branch_id: values.branch_id.trim(),
    supplier_id: values.supplier_id.trim(),
    original_receiving_id: toNullableString(values.original_receiving_id),
    reason: values.reason.trim(),
    immediate_cash_refund: {
      enabled: false,
    },
    lines: values.lines.map((line) => ({
      product_id: line.product_id.trim(),
      returned_quantity: normalizeQuantityInput(line.returned_quantity),
    })),
  };
}

function toSupplierReturnUpdateInput(
  input: SupplierReturnInput,
  supplierReturn: SupplierReturnDetail | null,
): SupplierReturnUpdateInput {
  return {
    ...input,
    lock_version: supplierReturn?.lock_version ?? 0,
  };
}

function toSupplierReturnFormValues(
  supplierReturn: SupplierReturnDetail,
): SupplierReturnFormValues {
  return {
    branch_id: supplierReturn.branch_id ?? '',
    supplier_id: supplierReturn.supplier_id ?? '',
    original_receiving_id: supplierReturn.original_receiving_id ?? '',
    reason: supplierReturn.reason ?? '',
    lines:
      supplierReturn.line_items.length > 0
        ? supplierReturn.line_items.map((line) => ({
            client_id: line.id,
            product_id: line.product_id ?? '',
            returned_quantity: line.returned_quantity ?? '',
          }))
        : [createDefaultSupplierReturnLine()],
  };
}

function normalizeQuantityInput(value: string): string {
  return Number(value.trim()).toFixed(3);
}

function toNullableString(value: string): string | null {
  const trimmedValue = value.trim();

  return trimmedValue.length > 0 ? trimmedValue : null;
}
