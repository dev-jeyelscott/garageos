'use client';

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
} from '../../../components/ui';

import type { PurchaseOrderListItem, PurchaseOrderListState } from '../purchase-order.types';

interface PurchaseOrderListResultsProps {
  readonly purchaseOrderListState: PurchaseOrderListState;
  readonly isInitialLoading: boolean;
  readonly isLoadingMore: boolean;
  readonly hasActiveFilters: boolean;
  readonly hasMore: boolean;
  readonly onLoadMore: () => void;
}

export function PurchaseOrderListResults({
  purchaseOrderListState,
  isInitialLoading,
  isLoadingMore,
  hasActiveFilters,
  hasMore,
  onLoadMore,
}: PurchaseOrderListResultsProps) {
  if (isInitialLoading) {
    return <PurchaseOrderListLoadingState />;
  }

  if (
    purchaseOrderListState.status === 'error' &&
    purchaseOrderListState.purchaseOrders.length === 0
  ) {
    return (
      <PurchaseOrderListErrorState
        message={purchaseOrderListState.message}
        detail={purchaseOrderListState.detail}
        code={purchaseOrderListState.code}
      />
    );
  }

  if (purchaseOrderListState.purchaseOrders.length === 0) {
    return <PurchaseOrderListEmptyState hasActiveFilters={hasActiveFilters} />;
  }

  return (
    <div className="grid gap-4">
      {purchaseOrderListState.status === 'error' ? (
        <PurchaseOrderListErrorState
          message={purchaseOrderListState.message}
          detail={purchaseOrderListState.detail}
          code={purchaseOrderListState.code}
        />
      ) : null}

      <PurchaseOrderCardList purchaseOrders={purchaseOrderListState.purchaseOrders} />
      <PurchaseOrderTable purchaseOrders={purchaseOrderListState.purchaseOrders} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {purchaseOrderListState.purchaseOrders.length} purchase order record(s).
        </p>
        <Button
          type="button"
          variant="secondary"
          disabled={!hasMore || isLoadingMore}
          onClick={onLoadMore}
        >
          {isLoadingMore ? 'Loading…' : hasMore ? 'Load more' : 'No more records'}
        </Button>
      </div>
    </div>
  );
}

function PurchaseOrderListLoadingState() {
  return (
    <div className="grid gap-3" aria-busy="true" aria-live="polite">
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-28 w-full" />
    </div>
  );
}

function PurchaseOrderListErrorState({
  message,
  detail,
  code,
}: {
  readonly message: string;
  readonly detail: string | null;
  readonly code: string | null;
}) {
  return (
    <Alert variant="destructive">
      <p className="text-sm font-bold">{message}</p>
      {code === null ? null : (
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Error code: {code}</p>
      )}
      {detail === null ? null : (
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>
      )}
    </Alert>
  );
}

function PurchaseOrderListEmptyState({ hasActiveFilters }: { readonly hasActiveFilters: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {hasActiveFilters ? 'No matching purchase orders' : 'No purchase orders yet'}
        </CardTitle>
        <CardDescription>
          {hasActiveFilters
            ? 'Adjust the search text, branch, status, or date filters and try again.'
            : 'Purchase order records will appear here after the documented purchase order API returns data.'}
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

function PurchaseOrderCardList({
  purchaseOrders,
}: {
  readonly purchaseOrders: readonly PurchaseOrderListItem[];
}) {
  return (
    <ul className="grid gap-3 md:hidden">
      {purchaseOrders.map((purchaseOrder) => (
        <li key={purchaseOrder.id}>
          <Card>
            <CardHeader className="gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="truncate text-base">
                    {purchaseOrder.purchase_order_number}
                  </CardTitle>
                  <CardDescription>{formatSupplierBranchSummary(purchaseOrder)}</CardDescription>
                </div>
                <PurchaseOrderStatusBadge status={purchaseOrder.status} />
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <PurchaseOrderField
                label="Payment terms"
                value={formatPaymentTerms(purchaseOrder.payment_terms)}
              />
              <PurchaseOrderField label="Order date" value={formatDate(purchaseOrder.order_date)} />
              <PurchaseOrderField
                label="Expected receive"
                value={formatDate(purchaseOrder.expected_receive_date)}
              />
              <PurchaseOrderField
                label="Ordered total"
                value={formatMoney(purchaseOrder.ordered_total_amount)}
              />
              <PurchaseOrderField
                label="Received total"
                value={formatMoney(purchaseOrder.received_total_amount)}
              />
              <PurchaseOrderField
                label="Updated"
                value={formatDateTime(purchaseOrder.updated_at)}
              />
              <ButtonLink
                href={`/purchase-orders/${encodeURIComponent(purchaseOrder.id)}`}
                variant="secondary"
                size="sm"
              >
                View detail
              </ButtonLink>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}

function PurchaseOrderTable({
  purchaseOrders,
}: {
  readonly purchaseOrders: readonly PurchaseOrderListItem[];
}) {
  return (
    <div className="hidden overflow-hidden rounded-2xl border border-border md:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>PO number</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Supplier</TableHead>
            <TableHead>Branch</TableHead>
            <TableHead>Terms</TableHead>
            <TableHead>Order date</TableHead>
            <TableHead>Expected</TableHead>
            <TableHead className="text-right">Ordered total</TableHead>
            <TableHead className="text-right">Lines</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {purchaseOrders.map((purchaseOrder) => (
            <TableRow key={purchaseOrder.id}>
              <TableCell>
                <div className="grid gap-1">
                  <span className="font-semibold text-foreground">
                    {purchaseOrder.purchase_order_number}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Updated {formatDateTime(purchaseOrder.updated_at)}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <PurchaseOrderStatusBadge status={purchaseOrder.status} />
              </TableCell>
              <TableCell>{purchaseOrder.supplier_name ?? '—'}</TableCell>
              <TableCell>{purchaseOrder.branch_name ?? '—'}</TableCell>
              <TableCell>{formatPaymentTerms(purchaseOrder.payment_terms)}</TableCell>
              <TableCell>{formatDate(purchaseOrder.order_date)}</TableCell>
              <TableCell>{formatDate(purchaseOrder.expected_receive_date)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatMoney(purchaseOrder.ordered_total_amount)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatReceivedLineCount(purchaseOrder)}
              </TableCell>
              <TableCell className="text-right">
                <ButtonLink
                  href={`/purchase-orders/${encodeURIComponent(purchaseOrder.id)}`}
                  variant="secondary"
                  size="sm"
                >
                  View detail
                </ButtonLink>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function PurchaseOrderStatusBadge({
  status,
}: {
  readonly status: PurchaseOrderListItem['status'];
}) {
  return <Badge variant={getStatusBadgeVariant(status)}>{formatStatusLabel(status)}</Badge>;
}

function PurchaseOrderField({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string | null;
}) {
  return (
    <div className="grid gap-1 rounded-xl border border-border bg-muted/40 p-3">
      <span className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      <span className="break-words text-foreground">{value ?? '—'}</span>
    </div>
  );
}

function getStatusBadgeVariant(status: PurchaseOrderListItem['status']) {
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

function formatSupplierBranchSummary(purchaseOrder: PurchaseOrderListItem): string {
  const supplier = purchaseOrder.supplier_name ?? 'Supplier not returned';
  const branch = purchaseOrder.branch_name ?? 'Branch not returned';

  return `${supplier} · ${branch}`;
}

function formatReceivedLineCount(purchaseOrder: PurchaseOrderListItem): string {
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

function formatDateTime(value: string | null): string {
  if (value === null || value.length === 0) {
    return '—';
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

function formatPaymentTerms(paymentTerms: PurchaseOrderListItem['payment_terms']): string {
  return paymentTerms === 'cash' ? 'Cash' : 'Credit';
}

function formatStatusLabel(status: string): string {
  return status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
