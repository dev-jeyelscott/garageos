'use client';

import { useEffect, useState, type FormEvent } from 'react';

import {
  Alert,
  Badge,
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
  type BadgeVariant,
} from '../../components/ui';
import { getCurrentSession } from '../auth/queries/get-current-session.query';
import type { AuthSessionResponseData } from '../auth/types/auth-session';

import { getPurchaseOrder, receivePurchaseOrder } from './purchase-order.api';
import type {
  PurchaseOrderDetail,
  PurchaseOrderDetailState,
  PurchaseOrderLineItem,
  PurchaseOrderReceiveInput,
  PurchaseOrderStatus,
  PurchaseOrderSummaryField,
  PurchasePaymentMethod,
} from './purchase-order.types';
import {
  canUsePurchaseWriteActions,
  canViewPurchaseOrders,
  getApiErrorCode,
  hasPermission,
  toSafeErrorDetail,
  toSafeErrorMessage,
  useNetworkStatus,
} from './purchase-order.ui';

interface PurchaseOrderDetailScreenProps {
  readonly purchaseOrderId: string;
}

interface ReceivingLineDraft {
  readonly lineId: string;
  readonly receivedQuantity: string;
  readonly receivedUnitCost: string;
}

type ReceivingFormState =
  | { readonly status: 'idle' }
  | { readonly status: 'submitting' }
  | { readonly status: 'success'; readonly message: string }
  | {
      readonly status: 'error';
      readonly message: string;
      readonly detail: string | null;
      readonly code: string | null;
    };

const purchasePaymentMethodOptions: readonly {
  readonly value: PurchasePaymentMethod;
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

export function PurchaseOrderDetailScreen({ purchaseOrderId }: PurchaseOrderDetailScreenProps) {
  const targetPurchaseOrderId = purchaseOrderId.length > 0 ? purchaseOrderId : null;
  const [refreshKey, setRefreshKey] = useState(0);
  const [sessionState, setSessionState] = useState<
    | { readonly status: 'loading' }
    | { readonly status: 'ready'; readonly session: AuthSessionResponseData }
    | { readonly status: 'error'; readonly message: string; readonly detail: string | null }
  >({ status: 'loading' });
  const [detailState, setDetailState] = useState<PurchaseOrderDetailState>({ status: 'loading' });
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
  const canReadPurchaseOrders = hasPermission(session, 'purchases.read');
  const canReceivePurchaseOrders = hasPermission(session, 'purchases.receive');
  const canAccessPurchaseOrders = canViewPurchaseOrders(session);
  const writeActionsAllowed = canUsePurchaseWriteActions({ session, networkStatus });

  useEffect(() => {
    if (targetPurchaseOrderId === null) {
      setDetailState({
        status: 'error',
        message: 'Purchase order ID is required.',
        detail: null,
        code: 'validation_failed',
      });
      return;
    }

    if (!canAccessPurchaseOrders) {
      return;
    }

    if (networkStatus === 'offline') {
      setDetailState((current) => {
        if (current.status === 'loaded') {
          return current;
        }

        return {
          status: 'error',
          message: 'Purchase order detail is unavailable while offline.',
          detail: 'Offline mode is read-only. Reconnect to load this purchase order detail.',
          code: 'offline_read_only',
        };
      });
      return;
    }

    let active = true;

    async function loadPurchaseOrder(currentPurchaseOrderId: string) {
      setDetailState({ status: 'loading' });

      try {
        const purchaseOrder = await getPurchaseOrder(currentPurchaseOrderId);

        if (!active) {
          return;
        }

        setDetailState({ status: 'loaded', purchaseOrder });
      } catch (error) {
        if (!active) {
          return;
        }

        setDetailState({
          status: 'error',
          message: toSafeErrorMessage(error, 'Unable to load this purchase order.'),
          detail: toSafeErrorDetail(error),
          code: getApiErrorCode(error),
        });
      }
    }

    void loadPurchaseOrder(targetPurchaseOrderId);

    return () => {
      active = false;
    };
  }, [canAccessPurchaseOrders, networkStatus, refreshKey, targetPurchaseOrderId]);

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

  if (session !== null && !canReadPurchaseOrders) {
    return (
      <Alert variant="destructive">
        <p className="text-sm font-bold">Purchase order detail unavailable</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Your tenant session does not include permission to view purchase orders.
        </p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Required permission: <strong>purchases.read</strong>
        </p>
      </Alert>
    );
  }

  if (session !== null && session.access.can_access_operational_modules !== true) {
    return (
      <Alert variant="destructive">
        <p className="text-sm font-bold">Purchase orders are blocked</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          This tenant lifecycle state cannot access operational purchase order screens. Complete
          setup, renew, or contact a platform admin before opening purchasing records.
        </p>
      </Alert>
    );
  }

  if (sessionState.status === 'loading') {
    return <PurchaseOrderDetailLoadingState />;
  }

  if (detailState.status === 'error') {
    return (
      <PurchaseOrderDetailErrorState
        code={detailState.code}
        message={detailState.message}
        detail={detailState.detail}
      />
    );
  }

  if (detailState.status !== 'loaded') {
    return <PurchaseOrderDetailLoadingState />;
  }

  const purchaseOrder = detailState.purchaseOrder;

  return (
    <PurchaseOrderDetailView
      purchaseOrder={purchaseOrder}
      isOffline={networkStatus === 'offline'}
      isReadOnlyTenant={session?.access.read_only === true}
      writeActionsAllowed={writeActionsAllowed}
      canReceivePurchaseOrders={canReceivePurchaseOrders}
      onPurchaseOrderReceived={() => setRefreshKey((current) => current + 1)}
    />
  );
}

function PurchaseOrderDetailLoadingState() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-live="polite">
      <Skeleton className="h-36 w-full" />
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}

function PurchaseOrderDetailErrorState({
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
        <CardTitle>{getErrorTitle(code)}</CardTitle>
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
          <ButtonLink href="/purchase-orders" variant="secondary">
            Back to purchase orders
          </ButtonLink>
        </div>
      </CardContent>
    </Card>
  );
}

function PurchaseOrderDetailView({
  purchaseOrder,
  isOffline,
  isReadOnlyTenant,
  writeActionsAllowed,
  canReceivePurchaseOrders,
  onPurchaseOrderReceived,
}: {
  readonly purchaseOrder: PurchaseOrderDetail;
  readonly isOffline: boolean;
  readonly isReadOnlyTenant: boolean;
  readonly writeActionsAllowed: boolean;
  readonly canReceivePurchaseOrders: boolean;
  readonly onPurchaseOrderReceived: () => void;
}) {
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader className="gap-4 lg:grid lg:grid-cols-[1fr_auto] lg:items-start">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-muted-foreground">
              Purchase order detail
            </p>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
              <CardTitle className="break-words text-2xl">
                {purchaseOrder.purchase_order_number}
              </CardTitle>
              <PurchaseOrderStatusBadge status={purchaseOrder.status} />
            </div>
            <CardDescription className="mt-2">
              {formatSupplierBranchSummary(purchaseOrder)}
            </CardDescription>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row lg:justify-end">
            <ButtonLink href="/purchase-orders" variant="secondary">
              Back to list
            </ButtonLink>
          </div>
        </CardHeader>
      </Card>

      {isOffline ? (
        <Alert>
          <p className="text-sm leading-6">
            Offline mode is read-only. Existing on-screen details remain viewable, but reconnect
            before receiving stock or refreshing this purchase order.
          </p>
        </Alert>
      ) : null}

      {isReadOnlyTenant ? (
        <Alert>
          <p className="text-sm leading-6">
            This tenant is read-only. Purchase order viewing remains available with{' '}
            <strong>purchases.read</strong>, but purchase receiving is blocked.
          </p>
        </Alert>
      ) : null}

      <PurchaseOrderWorkflowActions
        purchaseOrder={purchaseOrder}
        isOffline={isOffline}
        isReadOnlyTenant={isReadOnlyTenant}
        writeActionsAllowed={writeActionsAllowed}
        canReceivePurchaseOrders={canReceivePurchaseOrders}
        onPurchaseOrderReceived={onPurchaseOrderReceived}
      />
      <PurchaseOrderSummaryCard purchaseOrder={purchaseOrder} />
      <PurchaseOrderReceivingSummary fields={purchaseOrder.receiving_status_summary} />
      <PurchaseOrderLineItems lineItems={purchaseOrder.line_items} />
    </div>
  );
}

function PurchaseOrderWorkflowActions({
  purchaseOrder,
  isOffline,
  isReadOnlyTenant,
  writeActionsAllowed,
  canReceivePurchaseOrders,
  onPurchaseOrderReceived,
}: {
  readonly purchaseOrder: PurchaseOrderDetail;
  readonly isOffline: boolean;
  readonly isReadOnlyTenant: boolean;
  readonly writeActionsAllowed: boolean;
  readonly canReceivePurchaseOrders: boolean;
  readonly onPurchaseOrderReceived: () => void;
}) {
  const plannedBlockedTitle = writeActionsAllowed
    ? 'This workflow action is planned for a separate Milestone 8 UI slice.'
    : 'This workflow action is blocked by permission, read-only tenant state, offline mode, or this slice scope.';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Workflow actions</CardTitle>
        <CardDescription>
          This slice enables purchase receiving only. Edit, order, cancel, and close controls remain
          disabled until their own approved UI slice.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {['Edit', 'Order', 'Cancel', 'Close'].map((action) => (
            <Button
              key={action}
              type="button"
              variant="secondary"
              disabled
              title={plannedBlockedTitle}
            >
              {action} planned
            </Button>
          ))}
        </div>
        <PurchaseOrderReceiveForm
          purchaseOrder={purchaseOrder}
          isOffline={isOffline}
          isReadOnlyTenant={isReadOnlyTenant}
          writeActionsAllowed={writeActionsAllowed}
          canReceivePurchaseOrders={canReceivePurchaseOrders}
          onPurchaseOrderReceived={onPurchaseOrderReceived}
        />
      </CardContent>
    </Card>
  );
}

function PurchaseOrderReceiveForm({
  purchaseOrder,
  isOffline,
  isReadOnlyTenant,
  writeActionsAllowed,
  canReceivePurchaseOrders,
  onPurchaseOrderReceived,
}: {
  readonly purchaseOrder: PurchaseOrderDetail;
  readonly isOffline: boolean;
  readonly isReadOnlyTenant: boolean;
  readonly writeActionsAllowed: boolean;
  readonly canReceivePurchaseOrders: boolean;
  readonly onPurchaseOrderReceived: () => void;
}) {
  const [receivedAt, setReceivedAt] = useState(() => toLocalDateTimeInputValue(new Date()));
  const [paymentMethod, setPaymentMethod] = useState<PurchasePaymentMethod>('cash');
  const [paymentReference, setPaymentReference] = useState('');
  const [lineDrafts, setLineDrafts] = useState<readonly ReceivingLineDraft[]>(() =>
    buildReceivingLineDrafts(purchaseOrder.line_items),
  );
  const [validationErrors, setValidationErrors] = useState<Readonly<Record<string, string>>>({});
  const [formState, setFormState] = useState<ReceivingFormState>({ status: 'idle' });

  useEffect(() => {
    setReceivedAt(toLocalDateTimeInputValue(new Date()));
    setPaymentMethod('cash');
    setPaymentReference('');
    setLineDrafts(buildReceivingLineDrafts(purchaseOrder.line_items));
    setValidationErrors({});
    setFormState({ status: 'idle' });
  }, [purchaseOrder.id, purchaseOrder.line_items]);

  const receivableLines = purchaseOrder.line_items.filter((lineItem) => {
    const remainingQuantity = getRemainingQuantity(lineItem);
    return remainingQuantity !== null && remainingQuantity > 0 && !isSyntheticLineId(lineItem.id);
  });
  const receiveBlockedReason = getReceiveBlockedReason({
    purchaseOrder,
    isOffline,
    isReadOnlyTenant,
    writeActionsAllowed,
    canReceivePurchaseOrders,
    hasReceivableLines: receivableLines.length > 0,
  });
  const submitDisabled = receiveBlockedReason !== null || formState.status === 'submitting';

  function updateLineDraft(
    lineId: string,
    field: 'receivedQuantity' | 'receivedUnitCost',
    value: string,
  ) {
    setLineDrafts((current) =>
      current.map((lineDraft) =>
        lineDraft.lineId === lineId ? { ...lineDraft, [field]: value } : lineDraft,
      ),
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const localValidation = validateReceivingForm({
      purchaseOrder,
      receivedAt,
      paymentMethod,
      paymentReference,
      lineDrafts,
    });

    setValidationErrors(localValidation.errors);

    if (localValidation.input === null) {
      setFormState({
        status: 'error',
        message: localValidation.message,
        detail: null,
        code: 'validation_failed',
      });
      return;
    }

    if (receiveBlockedReason !== null) {
      setFormState({
        status: 'error',
        message: receiveBlockedReason,
        detail: null,
        code: 'forbidden',
      });
      return;
    }

    setFormState({ status: 'submitting' });

    try {
      await receivePurchaseOrder({
        purchaseOrderId: purchaseOrder.id,
        input: localValidation.input,
        idempotencyKey: generateIdempotencyKey('purchase-receiving'),
      });

      setFormState({
        status: 'success',
        message: 'Stock receiving was posted. Purchase order details are refreshing.',
      });
      onPurchaseOrderReceived();
    } catch (error) {
      setFormState({
        status: 'error',
        message: toSafeErrorMessage(error, 'Unable to receive stock for this purchase order.'),
        detail: toSafeErrorDetail(error),
        code: getApiErrorCode(error),
      });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Receive stock</CardTitle>
        <CardDescription>
          Receive ordered stock into the purchase order branch. The backend remains authoritative
          for branch access, status transitions, FIFO layers, inventory ledger entries, AP effects,
          and over-receiving protection.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="grid gap-5">
          {receiveBlockedReason === null ? null : (
            <Alert>
              <p className="text-sm leading-6">{receiveBlockedReason}</p>
            </Alert>
          )}

          {formState.status === 'success' ? (
            <Alert>
              <p className="text-sm leading-6">{formState.message}</p>
            </Alert>
          ) : null}

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

          <div className="grid gap-3 lg:grid-cols-[1fr_14rem_1fr]">
            <label className="grid gap-2">
              <span className="text-sm font-bold text-foreground">Received at</span>
              <Input
                type="datetime-local"
                value={receivedAt}
                onChange={(event) => setReceivedAt(event.currentTarget.value)}
                disabled={submitDisabled}
              />
              {validationErrors.received_at === undefined ? null : (
                <span className="text-sm text-destructive">{validationErrors.received_at}</span>
              )}
            </label>

            {purchaseOrder.payment_terms === 'cash' ? (
              <label className="grid gap-2">
                <span className="text-sm font-bold text-foreground">Payment method</span>
                <select
                  value={paymentMethod}
                  onChange={(event) =>
                    setPaymentMethod(event.currentTarget.value as PurchasePaymentMethod)
                  }
                  disabled={submitDisabled}
                  className="min-h-11 rounded-xl border border-input bg-background px-3 py-2 text-base text-foreground shadow-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {purchasePaymentMethodOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {validationErrors.payment_method === undefined ? null : (
                  <span className="text-sm text-destructive">
                    {validationErrors.payment_method}
                  </span>
                )}
              </label>
            ) : (
              <DetailField label="AP effect" value="Credit purchase receiving increases AP." />
            )}

            {purchaseOrder.payment_terms === 'cash' ? (
              <label className="grid gap-2">
                <span className="text-sm font-bold text-foreground">Payment reference</span>
                <Input
                  value={paymentReference}
                  onChange={(event) => setPaymentReference(event.currentTarget.value)}
                  placeholder="Optional receipt or reference number"
                  disabled={submitDisabled}
                />
              </label>
            ) : (
              <DetailField label="Payment terms" value="Credit" />
            )}
          </div>

          <div className="grid gap-3">
            <div>
              <h3 className="text-sm font-black uppercase tracking-[0.14em] text-muted-foreground">
                Receiving lines
              </h3>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Enter received quantity only for lines received in this action. Quantity defaults to
                the remaining ordered quantity, and unit cost defaults from the purchase order line.
              </p>
            </div>
            <PurchaseOrderReceiveLineCards
              lineItems={purchaseOrder.line_items}
              lineDrafts={lineDrafts}
              validationErrors={validationErrors}
              disabled={submitDisabled}
              onUpdateLineDraft={updateLineDraft}
            />
            <PurchaseOrderReceiveLineTable
              lineItems={purchaseOrder.line_items}
              lineDrafts={lineDrafts}
              validationErrors={validationErrors}
              disabled={submitDisabled}
              onUpdateLineDraft={updateLineDraft}
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col items-stretch gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-6 text-muted-foreground">
            Purchase receiving requires <strong>purchases.receive</strong> and an online,
            write-enabled tenant session.
          </p>
          <Button type="submit" disabled={submitDisabled}>
            {formState.status === 'submitting' ? 'Receiving stock...' : 'Receive stock'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function PurchaseOrderReceiveLineCards({
  lineItems,
  lineDrafts,
  validationErrors,
  disabled,
  onUpdateLineDraft,
}: {
  readonly lineItems: readonly PurchaseOrderLineItem[];
  readonly lineDrafts: readonly ReceivingLineDraft[];
  readonly validationErrors: Readonly<Record<string, string>>;
  readonly disabled: boolean;
  readonly onUpdateLineDraft: (
    lineId: string,
    field: 'receivedQuantity' | 'receivedUnitCost',
    value: string,
  ) => void;
}) {
  return (
    <ul className="grid gap-3 xl:hidden">
      {lineItems.map((lineItem, index) => {
        const lineDraft = lineDrafts.find((candidate) => candidate.lineId === lineItem.id);
        const remainingQuantity = getRemainingQuantity(lineItem);
        const isLineDisabled =
          disabled ||
          remainingQuantity === null ||
          remainingQuantity <= 0 ||
          isSyntheticLineId(lineItem.id);

        return (
          <li key={lineItem.id}>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {lineItem.product_name ?? 'Product not returned'}
                </CardTitle>
                <CardDescription>{lineItem.notes ?? 'No line notes returned.'}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <DetailField label="Ordered" value={formatQuantity(lineItem.ordered_quantity)} />
                  <DetailField
                    label="Received"
                    value={formatQuantity(lineItem.received_quantity)}
                  />
                  <DetailField
                    label="Remaining"
                    value={
                      remainingQuantity === null ? null : formatQuantity(String(remainingQuantity))
                    }
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-2">
                    <span className="text-sm font-bold text-foreground">Receive quantity</span>
                    <Input
                      type="number"
                      min="0"
                      step="0.001"
                      inputMode="decimal"
                      value={lineDraft?.receivedQuantity ?? ''}
                      onChange={(event) =>
                        onUpdateLineDraft(
                          lineItem.id,
                          'receivedQuantity',
                          event.currentTarget.value,
                        )
                      }
                      disabled={isLineDisabled}
                    />
                    {validationErrors[`lines.${index}.received_quantity`] === undefined ? null : (
                      <span className="text-sm text-destructive">
                        {validationErrors[`lines.${index}.received_quantity`]}
                      </span>
                    )}
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-bold text-foreground">Unit cost</span>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={lineDraft?.receivedUnitCost ?? ''}
                      onChange={(event) =>
                        onUpdateLineDraft(
                          lineItem.id,
                          'receivedUnitCost',
                          event.currentTarget.value,
                        )
                      }
                      disabled={isLineDisabled}
                    />
                    {validationErrors[`lines.${index}.received_unit_cost`] === undefined ? null : (
                      <span className="text-sm text-destructive">
                        {validationErrors[`lines.${index}.received_unit_cost`]}
                      </span>
                    )}
                  </label>
                </div>
              </CardContent>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

function PurchaseOrderReceiveLineTable({
  lineItems,
  lineDrafts,
  validationErrors,
  disabled,
  onUpdateLineDraft,
}: {
  readonly lineItems: readonly PurchaseOrderLineItem[];
  readonly lineDrafts: readonly ReceivingLineDraft[];
  readonly validationErrors: Readonly<Record<string, string>>;
  readonly disabled: boolean;
  readonly onUpdateLineDraft: (
    lineId: string,
    field: 'receivedQuantity' | 'receivedUnitCost',
    value: string,
  ) => void;
}) {
  return (
    <div className="hidden overflow-hidden rounded-2xl border border-border xl:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead className="text-right">Ordered</TableHead>
            <TableHead className="text-right">Received</TableHead>
            <TableHead className="text-right">Remaining</TableHead>
            <TableHead className="text-right">Receive quantity</TableHead>
            <TableHead className="text-right">Unit cost</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lineItems.map((lineItem, index) => {
            const lineDraft = lineDrafts.find((candidate) => candidate.lineId === lineItem.id);
            const remainingQuantity = getRemainingQuantity(lineItem);
            const isLineDisabled =
              disabled ||
              remainingQuantity === null ||
              remainingQuantity <= 0 ||
              isSyntheticLineId(lineItem.id);

            return (
              <TableRow key={lineItem.id}>
                <TableCell>{lineItem.product_name ?? '—'}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatQuantity(lineItem.ordered_quantity) ?? '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatQuantity(lineItem.received_quantity) ?? '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {remainingQuantity === null ? '—' : formatQuantity(String(remainingQuantity))}
                </TableCell>
                <TableCell>
                  <label className="sr-only" htmlFor={`receive-quantity-${lineItem.id}`}>
                    Receive quantity for {lineItem.product_name ?? lineItem.id}
                  </label>
                  <Input
                    id={`receive-quantity-${lineItem.id}`}
                    type="number"
                    min="0"
                    step="0.001"
                    inputMode="decimal"
                    value={lineDraft?.receivedQuantity ?? ''}
                    onChange={(event) =>
                      onUpdateLineDraft(lineItem.id, 'receivedQuantity', event.currentTarget.value)
                    }
                    disabled={isLineDisabled}
                    className="text-right tabular-nums"
                  />
                  {validationErrors[`lines.${index}.received_quantity`] === undefined ? null : (
                    <p className="mt-1 text-sm text-destructive">
                      {validationErrors[`lines.${index}.received_quantity`]}
                    </p>
                  )}
                </TableCell>
                <TableCell>
                  <label className="sr-only" htmlFor={`receive-unit-cost-${lineItem.id}`}>
                    Unit cost for {lineItem.product_name ?? lineItem.id}
                  </label>
                  <Input
                    id={`receive-unit-cost-${lineItem.id}`}
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={lineDraft?.receivedUnitCost ?? ''}
                    onChange={(event) =>
                      onUpdateLineDraft(lineItem.id, 'receivedUnitCost', event.currentTarget.value)
                    }
                    disabled={isLineDisabled}
                    className="text-right tabular-nums"
                  />
                  {validationErrors[`lines.${index}.received_unit_cost`] === undefined ? null : (
                    <p className="mt-1 text-sm text-destructive">
                      {validationErrors[`lines.${index}.received_unit_cost`]}
                    </p>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function PurchaseOrderSummaryCard({
  purchaseOrder,
}: {
  readonly purchaseOrder: PurchaseOrderDetail;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Purchase order summary</CardTitle>
        <CardDescription>
          Source-aligned fields returned by the documented purchase order detail API.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DetailField label="Branch" value={purchaseOrder.branch_name} />
        <DetailField label="Supplier" value={purchaseOrder.supplier_name} />
        <DetailField
          label="Payment terms"
          value={formatPaymentTerms(purchaseOrder.payment_terms)}
        />
        <DetailField label="Order date" value={formatDate(purchaseOrder.order_date)} />
        <DetailField
          label="Expected receive"
          value={formatDate(purchaseOrder.expected_receive_date)}
        />
        <DetailField
          label="Ordered total"
          value={formatMoney(purchaseOrder.ordered_total_amount)}
        />
        <DetailField
          label="Received total"
          value={formatMoney(purchaseOrder.received_total_amount)}
        />
        <DetailField label="Line receiving" value={formatReceivedLineCount(purchaseOrder)} />
        <DetailField label="Created" value={formatDateTime(purchaseOrder.created_at)} />
        <DetailField label="Updated" value={formatDateTime(purchaseOrder.updated_at)} />
      </CardContent>
    </Card>
  );
}

function PurchaseOrderReceivingSummary({
  fields,
}: {
  readonly fields: readonly PurchaseOrderSummaryField[];
}) {
  if (fields.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Receiving summary</CardTitle>
        <CardDescription>Optional receiving status summary from the API.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {fields.map((field) => (
          <DetailField key={field.label} label={field.label} value={field.value} />
        ))}
      </CardContent>
    </Card>
  );
}

function PurchaseOrderLineItems({
  lineItems,
}: {
  readonly lineItems: readonly PurchaseOrderLineItem[];
}) {
  if (lineItems.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Line items</CardTitle>
          <CardDescription>
            Line items were not returned by the purchase order detail API response.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Line items</CardTitle>
        <CardDescription>
          Ordered and received quantities, costs, and notes as returned by the API.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <PurchaseOrderLineItemCards lineItems={lineItems} />
        <PurchaseOrderLineItemTable lineItems={lineItems} />
      </CardContent>
    </Card>
  );
}

function PurchaseOrderLineItemCards({
  lineItems,
}: {
  readonly lineItems: readonly PurchaseOrderLineItem[];
}) {
  return (
    <ul className="grid gap-3 lg:hidden">
      {lineItems.map((lineItem) => (
        <li key={lineItem.id}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {lineItem.product_name ?? 'Product not returned'}
              </CardTitle>
              <CardDescription>{lineItem.notes ?? 'No line notes returned.'}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
              <DetailField label="Ordered" value={formatQuantity(lineItem.ordered_quantity)} />
              <DetailField label="Received" value={formatQuantity(lineItem.received_quantity)} />
              <DetailField label="Unit cost" value={formatMoney(lineItem.unit_cost)} />
              <DetailField label="Line total" value={formatMoney(lineItem.line_total)} />
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}

function PurchaseOrderLineItemTable({
  lineItems,
}: {
  readonly lineItems: readonly PurchaseOrderLineItem[];
}) {
  return (
    <div className="hidden overflow-hidden rounded-2xl border border-border lg:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead className="text-right">Ordered</TableHead>
            <TableHead className="text-right">Received</TableHead>
            <TableHead className="text-right">Unit cost</TableHead>
            <TableHead className="text-right">Line total</TableHead>
            <TableHead>Notes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lineItems.map((lineItem) => (
            <TableRow key={lineItem.id}>
              <TableCell>{lineItem.product_name ?? '—'}</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatQuantity(lineItem.ordered_quantity) ?? '—'}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatQuantity(lineItem.received_quantity) ?? '—'}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatMoney(lineItem.unit_cost) ?? '—'}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatMoney(lineItem.line_total) ?? '—'}
              </TableCell>
              <TableCell>{lineItem.notes ?? '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function PurchaseOrderStatusBadge({ status }: { readonly status: PurchaseOrderStatus }) {
  return <Badge variant={getStatusBadgeVariant(status)}>{formatStatusLabel(status)}</Badge>;
}

function DetailField({ label, value }: { readonly label: string; readonly value: string | null }) {
  return (
    <div className="grid gap-1 rounded-xl border border-border bg-muted/40 p-3">
      <span className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      <span className="break-words text-foreground">{value ?? '—'}</span>
    </div>
  );
}

function getReceiveBlockedReason({
  purchaseOrder,
  isOffline,
  isReadOnlyTenant,
  writeActionsAllowed,
  canReceivePurchaseOrders,
  hasReceivableLines,
}: {
  readonly purchaseOrder: PurchaseOrderDetail;
  readonly isOffline: boolean;
  readonly isReadOnlyTenant: boolean;
  readonly writeActionsAllowed: boolean;
  readonly canReceivePurchaseOrders: boolean;
  readonly hasReceivableLines: boolean;
}): string | null {
  if (!canReceivePurchaseOrders) {
    return 'Your tenant session does not include purchases.receive permission.';
  }

  if (isOffline) {
    return 'Reconnect before receiving stock. Offline mode is read-only.';
  }

  if (isReadOnlyTenant) {
    return 'This tenant is read-only. Operational purchasing writes are blocked.';
  }

  if (!writeActionsAllowed) {
    return 'Purchase receiving is blocked by the current tenant session.';
  }

  if (purchaseOrder.status !== 'ordered' && purchaseOrder.status !== 'partially_received') {
    return 'Only ordered or partially received purchase orders can receive stock.';
  }

  if (!hasReceivableLines) {
    return 'There are no remaining purchase order lines available to receive.';
  }

  return null;
}

function validateReceivingForm({
  purchaseOrder,
  receivedAt,
  paymentMethod,
  paymentReference,
  lineDrafts,
}: {
  readonly purchaseOrder: PurchaseOrderDetail;
  readonly receivedAt: string;
  readonly paymentMethod: PurchasePaymentMethod;
  readonly paymentReference: string;
  readonly lineDrafts: readonly ReceivingLineDraft[];
}): {
  readonly input: PurchaseOrderReceiveInput | null;
  readonly errors: Readonly<Record<string, string>>;
  readonly message: string;
} {
  const errors: Record<string, string> = {};
  const receivedAtIso = toReceivedAtIso(receivedAt);

  if (receivedAtIso === null) {
    errors.received_at = 'Receiving timestamp is required.';
  }

  if (purchaseOrder.payment_terms === 'cash' && paymentMethod.length === 0) {
    errors.payment_method = 'Payment method is required for cash purchases.';
  }

  const lines = lineDrafts
    .map((lineDraft, index) => {
      const lineItem = purchaseOrder.line_items.find(
        (candidate) => candidate.id === lineDraft.lineId,
      );
      const receivedQuantity = parseDecimal(lineDraft.receivedQuantity);
      const receivedUnitCost = parseDecimal(lineDraft.receivedUnitCost);
      const remainingQuantity = lineItem === undefined ? null : getRemainingQuantity(lineItem);

      if (lineItem === undefined || isSyntheticLineId(lineItem.id)) {
        return null;
      }

      if (receivedQuantity === null || receivedQuantity === 0) {
        return null;
      }

      if (receivedQuantity < 0) {
        errors[`lines.${index}.received_quantity`] = 'Received quantity must be greater than zero.';
        return null;
      }

      if (remainingQuantity === null || receivedQuantity > remainingQuantity) {
        errors[`lines.${index}.received_quantity`] =
          'Received quantity cannot exceed remaining ordered quantity.';
        return null;
      }

      if (receivedUnitCost === null || receivedUnitCost < 0) {
        errors[`lines.${index}.received_unit_cost`] = 'Received unit cost must be zero or greater.';
        return null;
      }

      return {
        purchase_order_line_id: lineItem.id,
        received_quantity: formatDecimalForApi(receivedQuantity, 3),
        received_unit_cost: formatDecimalForApi(receivedUnitCost, 2),
      };
    })
    .filter((line): line is PurchaseOrderReceiveInput['lines'][number] => line !== null);

  if (lines.length === 0) {
    errors.lines = 'At least one receiving line with quantity greater than zero is required.';
  }

  if (Object.keys(errors).length > 0 || receivedAtIso === null) {
    return {
      input: null,
      errors,
      message: errors.lines ?? 'Review the receiving form before submitting.',
    };
  }

  const input: PurchaseOrderReceiveInput = {
    received_at: receivedAtIso,
    lines,
  };

  if (purchaseOrder.payment_terms === 'cash') {
    const cleanedPaymentReference = paymentReference.trim();

    return {
      input: {
        ...input,
        payment_method: paymentMethod,
        ...(cleanedPaymentReference.length > 0
          ? { payment_reference: cleanedPaymentReference }
          : {}),
      },
      errors,
      message: 'Ready to receive stock.',
    };
  }

  return {
    input,
    errors,
    message: 'Ready to receive stock.',
  };
}

function buildReceivingLineDrafts(
  lineItems: readonly PurchaseOrderLineItem[],
): readonly ReceivingLineDraft[] {
  return lineItems.map((lineItem) => {
    const remainingQuantity = getRemainingQuantity(lineItem);

    return {
      lineId: lineItem.id,
      receivedQuantity:
        remainingQuantity === null || remainingQuantity <= 0
          ? ''
          : formatDecimalForApi(remainingQuantity, 3),
      receivedUnitCost: lineItem.unit_cost ?? '0.00',
    };
  });
}

function getRemainingQuantity(lineItem: PurchaseOrderLineItem): number | null {
  const orderedQuantity = parseDecimal(lineItem.ordered_quantity);
  const receivedQuantity = parseDecimal(lineItem.received_quantity) ?? 0;

  if (orderedQuantity === null) {
    return null;
  }

  return Math.max(orderedQuantity - receivedQuantity, 0);
}

function isSyntheticLineId(lineId: string): boolean {
  return lineId.startsWith('line-');
}

function parseDecimal(value: string | null): number | null {
  if (value === null || value.trim().length === 0) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDecimalForApi(value: number, fractionDigits: number): string {
  return value.toFixed(fractionDigits);
}

function toReceivedAtIso(value: string): string | null {
  if (value.length === 0) {
    return null;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function toLocalDateTimeInputValue(value: Date): string {
  const localDate = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function generateIdempotencyKey(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getErrorTitle(code: string | null): string {
  if (code === 'resource_not_found') {
    return 'Purchase order not found';
  }

  if (code === 'forbidden') {
    return 'Purchase order detail forbidden';
  }

  if (code === 'branch_access_denied') {
    return 'Branch access denied';
  }

  if (code === 'subscription_access_blocked') {
    return 'Purchase order detail blocked';
  }

  if (code === 'offline_read_only') {
    return 'Purchase order detail unavailable offline';
  }

  return 'Unable to load purchase order';
}

function getStatusBadgeVariant(status: PurchaseOrderStatus): BadgeVariant {
  if (status === 'received' || status === 'closed') {
    return 'success';
  }

  if (status === 'ordered' || status === 'partially_received') {
    return 'info';
  }

  if (status === 'cancelled') {
    return 'destructive';
  }

  return 'secondary';
}

function formatSupplierBranchSummary(purchaseOrder: PurchaseOrderDetail): string {
  const supplier = purchaseOrder.supplier_name ?? 'Supplier not returned';
  const branch = purchaseOrder.branch_name ?? 'Branch not returned';

  return `${supplier} · ${branch}`;
}

function formatReceivedLineCount(purchaseOrder: PurchaseOrderDetail): string {
  if (purchaseOrder.ordered_line_count === null && purchaseOrder.received_line_count === null) {
    return '—';
  }

  const received = purchaseOrder.received_line_count ?? 0;
  const ordered = purchaseOrder.ordered_line_count ?? '—';

  return `${received}/${ordered}`;
}

function formatDate(value: string | null): string | null {
  if (value === null || value.length === 0) {
    return null;
  }

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
  }).format(date);
}

function formatDateTime(value: string | null): string | null {
  if (value === null || value.length === 0) {
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

function formatMoney(value: string | null): string | null {
  if (value === null || value.length === 0) {
    return null;
  }

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return value;
  }

  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(numericValue);
}

function formatQuantity(value: string | null): string | null {
  if (value === null || value.length === 0) {
    return null;
  }

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return value;
  }

  return new Intl.NumberFormat('en-PH', {
    maximumFractionDigits: 3,
    minimumFractionDigits: 0,
  }).format(numericValue);
}

function formatPaymentTerms(paymentTerms: PurchaseOrderDetail['payment_terms']): string {
  return paymentTerms === 'cash' ? 'Cash' : 'Credit';
}

function formatStatusLabel(status: string): string {
  return status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
