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
  type BadgeVariant,
} from '../../../components/ui';

import type { InvoiceListItem, InvoiceListState } from '../invoice.types';
import { formatDate, formatDateTime, formatMoney, formatStatusLabel } from '../invoice.view-utils';

interface InvoiceListResultsProps {
  readonly invoiceListState: InvoiceListState;
  readonly isInitialLoading: boolean;
  readonly hasActiveFilters: boolean;
  readonly isLoadingMore: boolean;
  readonly canLoadMore: boolean;
  readonly onLoadMore: () => void;
}

export function InvoiceListResults({
  invoiceListState,
  isInitialLoading,
  hasActiveFilters,
  isLoadingMore,
  canLoadMore,
  onLoadMore,
}: InvoiceListResultsProps) {
  if (isInitialLoading) {
    return <InvoiceListLoadingState />;
  }

  if (invoiceListState.status === 'error' && invoiceListState.invoices.length === 0) {
    return (
      <InvoiceListErrorState
        message={invoiceListState.message}
        detail={invoiceListState.detail}
        code={invoiceListState.code}
      />
    );
  }

  if (invoiceListState.invoices.length === 0) {
    return <InvoiceListEmptyState hasActiveFilters={hasActiveFilters} />;
  }

  return (
    <div className="grid gap-4">
      {invoiceListState.status === 'error' ? (
        <InvoiceListErrorState
          message={invoiceListState.message}
          detail={invoiceListState.detail}
          code={invoiceListState.code}
        />
      ) : null}

      <InvoiceCardList invoices={invoiceListState.invoices} />
      <InvoiceTable invoices={invoiceListState.invoices} />

      <p className="text-sm text-muted-foreground">
        Showing {invoiceListState.invoices.length} invoice record(s).
      </p>

      {invoiceListState.pagination?.has_more === true ? (
        <div className="grid gap-2 rounded-2xl border border-border bg-muted/30 p-4 sm:flex sm:items-center sm:justify-between">
          <p className="text-sm leading-6 text-muted-foreground">
            {isLoadingMore
              ? 'Loading the next invoice page.'
              : canLoadMore
                ? 'More invoice records are available for the current filters.'
                : 'Load more is unavailable until the current blocker is resolved.'}
          </p>
          <Button
            type="button"
            variant="secondary"
            disabled={!canLoadMore || isLoadingMore}
            onClick={onLoadMore}
          >
            {isLoadingMore ? 'Loading more...' : 'Load more invoices'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function InvoiceStatusBadge({ status }: { readonly status: InvoiceListItem['status'] }) {
  return <Badge variant={getStatusBadgeVariant(status)}>{formatStatusLabel(status)}</Badge>;
}

function InvoiceListLoadingState() {
  return (
    <div className="grid gap-3" aria-busy="true" aria-live="polite">
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-28 w-full" />
    </div>
  );
}

function InvoiceListErrorState({
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

function InvoiceListEmptyState({ hasActiveFilters }: { readonly hasActiveFilters: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{hasActiveFilters ? 'No matching invoices' : 'No invoices yet'}</CardTitle>
        <CardDescription>
          {hasActiveFilters
            ? 'Adjust the branch, customer, status, or date filters and try again.'
            : 'Draft and issued service invoices will appear here after the documented invoice API returns data.'}
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

function InvoiceCardList({ invoices }: { readonly invoices: readonly InvoiceListItem[] }) {
  return (
    <ul className="grid gap-3 md:hidden">
      {invoices.map((invoice) => (
        <li key={invoice.id}>
          <Card>
            <CardHeader className="gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="truncate text-base">{invoice.invoice_number}</CardTitle>
                  <CardDescription>{formatCustomerBranchSummary(invoice)}</CardDescription>
                </div>
                <InvoiceStatusBadge status={invoice.status} />
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <InvoiceField label="Invoice date" value={formatDate(invoice.invoice_date)} />
              <InvoiceField label="Due date" value={formatDate(invoice.due_date)} />
              <InvoiceField label="Total" value={formatMoney(invoice.total_amount)} />
              <InvoiceField
                label="Remaining"
                value={formatMoney(invoice.remaining_collectible_balance)}
              />
              <InvoiceField label="Updated" value={formatDateTime(invoice.updated_at)} />
              <ButtonLink
                href={`/invoices/${encodeURIComponent(invoice.id)}`}
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

function InvoiceTable({ invoices }: { readonly invoices: readonly InvoiceListItem[] }) {
  return (
    <div className="hidden overflow-hidden rounded-2xl border border-border md:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Invoice</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Branch</TableHead>
            <TableHead>Invoice date</TableHead>
            <TableHead>Due</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="text-right">Remaining</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.map((invoice) => (
            <TableRow key={invoice.id}>
              <TableCell>
                <div className="grid gap-1">
                  <span className="font-semibold text-foreground">{invoice.invoice_number}</span>
                  <span className="text-xs text-muted-foreground">
                    Updated {formatDateTime(invoice.updated_at)}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <InvoiceStatusBadge status={invoice.status} />
              </TableCell>
              <TableCell>{invoice.customer_name ?? invoice.customer_id}</TableCell>
              <TableCell>{invoice.branch_name ?? invoice.branch_id}</TableCell>
              <TableCell>{formatDate(invoice.invoice_date)}</TableCell>
              <TableCell>{formatDate(invoice.due_date)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatMoney(invoice.total_amount)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatMoney(invoice.remaining_collectible_balance)}
              </TableCell>
              <TableCell className="text-right">
                <ButtonLink
                  href={`/invoices/${encodeURIComponent(invoice.id)}`}
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

function InvoiceField({ label, value }: { readonly label: string; readonly value: string | null }) {
  return (
    <div className="grid gap-1 rounded-xl border border-border bg-muted/40 p-3">
      <span className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      <span className="break-words text-foreground">{value ?? '-'}</span>
    </div>
  );
}

function getStatusBadgeVariant(status: InvoiceListItem['status']): BadgeVariant {
  if (status === 'paid') {
    return 'success';
  }

  if (status === 'pending' || status === 'partially_paid') {
    return 'info';
  }

  if (status === 'overdue') {
    return 'warning';
  }

  if (status === 'cancelled' || status === 'voided' || status === 'refunded') {
    return 'destructive';
  }

  return 'secondary';
}

function formatCustomerBranchSummary(invoice: InvoiceListItem): string {
  const customer = invoice.customer_name ?? invoice.customer_id;
  const branch = invoice.branch_name ?? invoice.branch_id;

  return `${customer} / ${branch}`;
}
