'use client';

import { useEffect, useState } from 'react';

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
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  type BadgeVariant,
} from '../../components/ui';
import { isApiClientError, type ApiClientError } from '../../lib/api-envelope';
import { getCurrentSession } from '../auth/queries/get-current-session.query';
import type { AuthSessionResponseData } from '../auth/types/auth-session';

import {
  cancelSupplierReturn,
  createSupplierReturnCancelIdempotencyKey,
  createSupplierReturnPostIdempotencyKey,
  getSupplierReturn,
  postSupplierReturn,
} from './supplier-return.api';
import type {
  SupplierReturnDetail,
  SupplierReturnDetailState,
  SupplierReturnLineItem,
  SupplierReturnStatus,
} from './supplier-return.types';
import {
  canUseSupplierWriteActions,
  getApiErrorCode,
  hasPermission,
  toSafeErrorDetail,
  toSafeErrorMessage,
  useNetworkStatus,
  type NetworkStatus,
} from './supplier.ui';

interface SupplierReturnDetailScreenProps {
  readonly supplierReturnId: string;
}

type SessionState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly session: AuthSessionResponseData }
  | { readonly status: 'error'; readonly message: string; readonly detail: string | null };

type ActionState =
  | { readonly status: 'idle' }
  | { readonly status: 'submitting'; readonly action: 'post' | 'cancel' }
  | { readonly status: 'success'; readonly message: string }
  | { readonly status: 'error'; readonly error: ApiClientError | null; readonly message: string };

export function SupplierReturnDetailScreen({ supplierReturnId }: SupplierReturnDetailScreenProps) {
  const targetSupplierReturnId = supplierReturnId.length > 0 ? supplierReturnId : null;
  const [refreshKey, setRefreshKey] = useState(0);
  const [sessionState, setSessionState] = useState<SessionState>({ status: 'loading' });
  const [detailState, setDetailState] = useState<SupplierReturnDetailState>({ status: 'idle' });
  const [actionState, setActionState] = useState<ActionState>({ status: 'idle' });
  const [postIdempotencyKey, setPostIdempotencyKey] = useState(
    createSupplierReturnPostIdempotencyKey,
  );
  const [cancelIdempotencyKey, setCancelIdempotencyKey] = useState(
    createSupplierReturnCancelIdempotencyKey,
  );
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
  const canReadSupplierReturns = hasPermission(session, 'supplier_returns.read');
  const canCreateSupplierReturns = hasPermission(session, 'supplier_returns.create');
  const writeActionsAllowed = canUseSupplierWriteActions({ session, networkStatus });
  const supplierReturn = detailState.status === 'loaded' ? detailState.supplierReturn : null;
  const isDraft = supplierReturn?.status === 'draft';
  const canUseWorkflowActions = canCreateSupplierReturns && writeActionsAllowed && isDraft;
  const workflowBlockReason = getWorkflowBlockReason({
    session,
    networkStatus,
    canCreateSupplierReturns,
    supplierReturn,
  });

  useEffect(() => {
    if (targetSupplierReturnId === null) {
      setDetailState({
        status: 'error',
        message: 'Supplier return ID is required.',
        detail: null,
        code: 'validation_failed',
      });
      return;
    }

    if (sessionState.status !== 'ready' || !canReadSupplierReturns) {
      return;
    }

    let active = true;

    async function loadSupplierReturn(currentSupplierReturnId: string) {
      setDetailState({ status: 'loading' });

      try {
        const loadedSupplierReturn = await getSupplierReturn(currentSupplierReturnId);

        if (!active) {
          return;
        }

        setDetailState({ status: 'loaded', supplierReturn: loadedSupplierReturn });
      } catch (error) {
        if (!active) {
          return;
        }

        setDetailState({
          status: 'error',
          message: toSafeErrorMessage(error, 'Unable to load this supplier return.'),
          detail: toSafeErrorDetail(error),
          code: getApiErrorCode(error),
        });
      }
    }

    void loadSupplierReturn(targetSupplierReturnId);

    return () => {
      active = false;
    };
  }, [canReadSupplierReturns, refreshKey, sessionState.status, targetSupplierReturnId]);

  async function handlePost() {
    if (targetSupplierReturnId === null) {
      return;
    }

    if (!canUseWorkflowActions) {
      setActionState({
        status: 'error',
        error: null,
        message: workflowBlockReason ?? 'Supplier return posting is currently blocked.',
      });
      return;
    }

    setActionState({ status: 'submitting', action: 'post' });

    try {
      await postSupplierReturn({
        supplierReturnId: targetSupplierReturnId,
        idempotencyKey: postIdempotencyKey,
      });

      setActionState({ status: 'success', message: 'Supplier return posted.' });
      setPostIdempotencyKey(createSupplierReturnPostIdempotencyKey());
      setRefreshKey((current) => current + 1);
    } catch (error) {
      if (isApiClientError(error)) {
        setActionState({ status: 'error', error, message: error.message });
      } else {
        setActionState({
          status: 'error',
          error: null,
          message: toSafeErrorMessage(error, 'Unable to post supplier return.'),
        });
      }
    }
  }

  async function handleCancel() {
    if (targetSupplierReturnId === null) {
      return;
    }

    if (!canUseWorkflowActions) {
      setActionState({
        status: 'error',
        error: null,
        message: workflowBlockReason ?? 'Supplier return cancellation is currently blocked.',
      });
      return;
    }

    setActionState({ status: 'submitting', action: 'cancel' });

    try {
      await cancelSupplierReturn({
        supplierReturnId: targetSupplierReturnId,
        idempotencyKey: cancelIdempotencyKey,
      });

      setActionState({ status: 'success', message: 'Supplier return cancelled.' });
      setCancelIdempotencyKey(createSupplierReturnCancelIdempotencyKey());
      setRefreshKey((current) => current + 1);
    } catch (error) {
      if (isApiClientError(error)) {
        setActionState({ status: 'error', error, message: error.message });
      } else {
        setActionState({
          status: 'error',
          error: null,
          message: toSafeErrorMessage(error, 'Unable to cancel supplier return.'),
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

  if (session !== null && !canReadSupplierReturns) {
    return (
      <Alert variant="destructive">
        <p className="text-sm font-bold">Supplier return detail unavailable</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Your tenant session does not include permission to view supplier returns.
        </p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Required permission: <strong>supplier_returns.read</strong>
        </p>
      </Alert>
    );
  }

  if (
    sessionState.status === 'loading' ||
    detailState.status === 'idle' ||
    detailState.status === 'loading'
  ) {
    return (
      <div className="grid gap-4" aria-busy="true" aria-live="polite">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-72 w-full" />
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
        {detailState.code === null ? null : (
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Error code: {detailState.code}
          </p>
        )}
      </Alert>
    );
  }

  if (detailState.status !== 'loaded') {
    return (
      <Alert variant="destructive">
        <p className="text-sm font-bold">Supplier return detail unavailable</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Supplier return data could not be resolved into a ready state. Refresh the page and try
          again.
        </p>
      </Alert>
    );
  }

  const currentSupplierReturn = detailState.supplierReturn;
  const apiError = actionState.status === 'error' ? actionState.error : null;

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader className="gap-4 lg:grid lg:grid-cols-[1fr_auto] lg:items-start">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-muted-foreground">
              Supplier return
            </p>
            <CardTitle className="mt-2 text-2xl">
              {currentSupplierReturn.supplier_return_number ?? currentSupplierReturn.id}
            </CardTitle>
            <CardDescription className="mt-2">
              Review draft or posted supplier return details. Posted returns are final and corrected
              only by documented inventory/AP workflows.
            </CardDescription>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge variant={getStatusBadgeVariant(currentSupplierReturn.status)}>
                {formatStatusLabel(currentSupplierReturn.status)}
              </Badge>
              {currentSupplierReturn.original_receiving_id === null ? null : (
                <span className="break-all text-xs text-muted-foreground">
                  Receiving: {currentSupplierReturn.original_receiving_id}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <ButtonLink href="/supplier-returns" variant="secondary">
              Back to returns
            </ButtonLink>
            {currentSupplierReturn.status === 'draft' &&
            canCreateSupplierReturns &&
            writeActionsAllowed ? (
              <ButtonLink href={`/supplier-returns/${currentSupplierReturn.id}/edit`}>
                Edit draft
              </ButtonLink>
            ) : null}
          </div>
        </CardHeader>
      </Card>

      {workflowBlockReason === null ? null : (
        <Alert>
          <p className="text-sm font-bold">Workflow actions unavailable</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{workflowBlockReason}</p>
        </Alert>
      )}

      {actionState.status === 'success' ? (
        <Alert variant="success">
          <p className="text-sm font-bold">{actionState.message}</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            The supplier return detail has been refreshed from the backend.
          </p>
        </Alert>
      ) : null}

      {actionState.status === 'error' ? (
        <Alert variant="destructive">
          <p className="text-sm font-bold">{actionState.message}</p>
          {apiError === null ? null : (
            <>
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
            </>
          )}
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Return summary</CardTitle>
          <CardDescription>
            Supplier return values come from the backend because FIFO valuation, AP reduction, and
            supplier credit effects are server-authoritative.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <SummaryField
            label="Supplier"
            value={currentSupplierReturn.supplier_name ?? currentSupplierReturn.supplier_id}
          />
          <SummaryField
            label="Branch"
            value={currentSupplierReturn.branch_name ?? currentSupplierReturn.branch_id}
          />
          <SummaryField
            label="Returned quantity"
            value={currentSupplierReturn.total_returned_quantity}
          />
          <SummaryField
            label="Inventory value"
            value={formatNullableMoney(currentSupplierReturn.inventory_value)}
          />
          <SummaryField
            label="Financial value"
            value={formatNullableMoney(currentSupplierReturn.financial_value)}
          />
          <SummaryField
            label="AP reduction"
            value={formatNullableMoney(currentSupplierReturn.ap_reduction_amount)}
          />
          <SummaryField
            label="Supplier credit"
            value={formatNullableMoney(currentSupplierReturn.supplier_credit_amount)}
          />
          <SummaryField
            label="Created"
            value={formatNullableDate(currentSupplierReturn.created_at)}
          />
          <SummaryField
            label="Posted"
            value={formatNullableDate(currentSupplierReturn.posted_at)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reason</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
            {currentSupplierReturn.reason ?? 'No reason was returned by the API.'}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Returned product lines</CardTitle>
          <CardDescription>
            Posted supplier returns reduce branch stock and consume FIFO layers according to backend
            rules.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SupplierReturnLinesTable lines={currentSupplierReturn.line_items} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Workflow actions</CardTitle>
          <CardDescription>
            Post the draft return to apply stock, FIFO, AP, and supplier credit effects. Cancel is
            only available before posting.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-[auto_auto] sm:justify-start">
          <Button
            type="button"
            disabled={!canUseWorkflowActions || actionState.status === 'submitting'}
            onClick={() => void handlePost()}
          >
            {actionState.status === 'submitting' && actionState.action === 'post'
              ? 'Posting…'
              : 'Post supplier return'}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={!canUseWorkflowActions || actionState.status === 'submitting'}
            onClick={() => void handleCancel()}
          >
            {actionState.status === 'submitting' && actionState.action === 'cancel'
              ? 'Cancelling…'
              : 'Cancel draft return'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function SupplierReturnLinesTable({
  lines,
}: {
  readonly lines: readonly SupplierReturnLineItem[];
}) {
  if (lines.length === 0) {
    return (
      <Alert>
        <p className="text-sm leading-6">No supplier return lines were returned by the API.</p>
      </Alert>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead>Returned quantity</TableHead>
            <TableHead>Inventory value</TableHead>
            <TableHead>Financial value</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line) => (
            <TableRow key={line.id}>
              <TableCell>{line.product_name ?? line.product_id ?? '—'}</TableCell>
              <TableCell>{line.returned_quantity ?? '—'}</TableCell>
              <TableCell>{formatNullableMoney(line.inventory_value)}</TableCell>
              <TableCell>{formatNullableMoney(line.financial_value)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function SummaryField({ label, value }: { readonly label: string; readonly value: string | null }) {
  return (
    <div className="rounded-2xl border bg-background p-4">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 break-words text-sm font-semibold text-foreground">{value ?? '—'}</p>
    </div>
  );
}

function getWorkflowBlockReason({
  session,
  networkStatus,
  canCreateSupplierReturns,
  supplierReturn,
}: {
  readonly session: AuthSessionResponseData | null;
  readonly networkStatus: NetworkStatus;
  readonly canCreateSupplierReturns: boolean;
  readonly supplierReturn: SupplierReturnDetail | null;
}): string | null {
  if (!canCreateSupplierReturns) {
    return 'Required permission: supplier_returns.create.';
  }

  if (session === null) {
    return 'Supplier return workflow actions are unavailable while your session is loading.';
  }

  if (session.access.can_access_operational_modules !== true || session.access.read_only === true) {
    return 'Supplier return workflow actions are blocked while this tenant is read-only or otherwise write-restricted.';
  }

  if (networkStatus === 'offline') {
    return 'Offline mode is read-only. Reconnect before posting or cancelling supplier returns.';
  }

  if (supplierReturn !== null && supplierReturn.status !== 'draft') {
    return 'Only draft supplier returns can be posted or cancelled.';
  }

  return null;
}

function getStatusBadgeVariant(status: SupplierReturnStatus): BadgeVariant {
  if (status === 'posted') {
    return 'success';
  }

  if (status === 'cancelled') {
    return 'readonly';
  }

  return 'warning';
}

function formatStatusLabel(status: string): string {
  return status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatNullableMoney(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return value;
  }

  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(amount);
}

function formatNullableDate(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
