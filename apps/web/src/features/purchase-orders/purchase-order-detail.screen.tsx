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
import { getCurrentSession } from '../auth/queries/get-current-session.query';
import type { AuthSessionResponseData } from '../auth/types/auth-session';

import { getPurchaseOrder } from './purchase-order.api';
import type {
  PurchaseOrderDetail,
  PurchaseOrderDetailState,
  PurchaseOrderLineItem,
  PurchaseOrderStatus,
  PurchaseOrderSummaryField,
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

export function PurchaseOrderDetailScreen({ purchaseOrderId }: PurchaseOrderDetailScreenProps) {
  const targetPurchaseOrderId = purchaseOrderId.length > 0 ? purchaseOrderId : null;
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
  }, [canAccessPurchaseOrders, networkStatus, targetPurchaseOrderId]);

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
}: {
  readonly purchaseOrder: PurchaseOrderDetail;
  readonly isOffline: boolean;
  readonly isReadOnlyTenant: boolean;
  readonly writeActionsAllowed: boolean;
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
            before refreshing this purchase order.
          </p>
        </Alert>
      ) : null}

      {isReadOnlyTenant ? (
        <Alert>
          <p className="text-sm leading-6">
            This tenant is read-only. Purchase order viewing remains available with{' '}
            <strong>purchases.read</strong>, but purchasing writes are blocked.
          </p>
        </Alert>
      ) : null}

      <PurchaseOrderPlannedActions writeActionsAllowed={writeActionsAllowed} />
      <PurchaseOrderSummaryCard purchaseOrder={purchaseOrder} />
      <PurchaseOrderReceivingSummary fields={purchaseOrder.receiving_status_summary} />
      <PurchaseOrderLineItems lineItems={purchaseOrder.line_items} />
    </div>
  );
}

function PurchaseOrderPlannedActions({
  writeActionsAllowed,
}: {
  readonly writeActionsAllowed: boolean;
}) {
  const blockedTitle = writeActionsAllowed
    ? 'This workflow action is planned for a later Milestone 8 slice.'
    : 'This workflow action is blocked by permission, read-only tenant state, offline mode, or this slice scope.';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Workflow actions</CardTitle>
        <CardDescription>
          This slice is read-only. Edit, order, receive, cancel, and close actions are shown as
          planned controls only.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {['Edit', 'Order', 'Receive', 'Cancel', 'Close'].map((action) => (
          <Button key={action} type="button" variant="secondary" disabled title={blockedTitle}>
            {action} planned
          </Button>
        ))}
      </CardContent>
    </Card>
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
        <CardDescription>
          Optional receiving status summary from the API. No receiving workflow is enabled here.
        </CardDescription>
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
