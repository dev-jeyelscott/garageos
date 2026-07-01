import {
  Alert,
  Badge,
  Button,
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

import type { SupplierListItem, SupplierListState } from '../supplier.types';

interface SupplierListResultsProps {
  readonly supplierListState: SupplierListState;
  readonly isInitialLoading: boolean;
  readonly isLoadingMore: boolean;
  readonly hasActiveFilters: boolean;
  readonly hasMore: boolean;
  readonly onLoadMore: () => void;
}

export function SupplierListResults({
  supplierListState,
  isInitialLoading,
  isLoadingMore,
  hasActiveFilters,
  hasMore,
  onLoadMore,
}: SupplierListResultsProps) {
  if (isInitialLoading) {
    return <SupplierListLoadingState />;
  }

  if (supplierListState.status === 'error' && supplierListState.suppliers.length === 0) {
    return (
      <SupplierListErrorState
        message={supplierListState.message}
        detail={supplierListState.detail}
        code={supplierListState.code}
      />
    );
  }

  if (supplierListState.suppliers.length === 0) {
    return <SupplierListEmptyState hasActiveFilters={hasActiveFilters} />;
  }

  return (
    <div className="grid gap-4">
      {supplierListState.status === 'error' ? (
        <SupplierListErrorState
          message={supplierListState.message}
          detail={supplierListState.detail}
          code={supplierListState.code}
        />
      ) : null}

      <SupplierCardList suppliers={supplierListState.suppliers} />
      <SupplierTable suppliers={supplierListState.suppliers} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {supplierListState.suppliers.length} supplier record(s).
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

function SupplierListLoadingState() {
  return (
    <div className="grid gap-3" aria-busy="true" aria-live="polite">
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

function SupplierListErrorState({
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

function SupplierListEmptyState({ hasActiveFilters }: { readonly hasActiveFilters: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{hasActiveFilters ? 'No matching suppliers' : 'No suppliers yet'}</CardTitle>
        <CardDescription>
          {hasActiveFilters
            ? 'Adjust the search text or status filter and try again.'
            : 'Supplier records will appear here after the documented supplier API returns data.'}
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

function SupplierCardList({ suppliers }: { readonly suppliers: readonly SupplierListItem[] }) {
  return (
    <ul className="grid gap-3 md:hidden">
      {suppliers.map((supplier) => (
        <li key={supplier.id}>
          <Card>
            <CardHeader className="gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="truncate text-base">{supplier.name}</CardTitle>
                  <CardDescription>{formatSupplierContactSummary(supplier)}</CardDescription>
                </div>
                <SupplierStatusBadge status={supplier.status} />
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <SupplierField label="Contact person" value={supplier.contact_person} />
              <SupplierField label="Mobile number" value={supplier.mobile_number} />
              <SupplierField label="Email" value={supplier.email} />
              <SupplierField label="Updated" value={formatDateTime(supplier.updated_at)} />
              <div className="flex justify-end border-t border-border pt-3">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled
                  title="Supplier detail route is planned for the next supplier UI slice."
                >
                  Detail planned
                </Button>
              </div>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}

function SupplierTable({ suppliers }: { readonly suppliers: readonly SupplierListItem[] }) {
  return (
    <div className="hidden overflow-hidden rounded-2xl border border-border md:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Supplier</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead>Mobile</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Updated</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {suppliers.map((supplier) => (
            <TableRow key={supplier.id}>
              <TableCell>
                <div className="grid gap-1">
                  <span className="font-semibold text-foreground">{supplier.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {supplier.address ?? 'No address provided'}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <SupplierStatusBadge status={supplier.status} />
              </TableCell>
              <TableCell>{supplier.contact_person ?? '—'}</TableCell>
              <TableCell>{supplier.mobile_number ?? '—'}</TableCell>
              <TableCell>{supplier.email ?? '—'}</TableCell>
              <TableCell>{formatDateTime(supplier.updated_at)}</TableCell>
              <TableCell className="text-right">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled
                  title="Supplier detail route is planned for the next supplier UI slice."
                >
                  Detail planned
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function SupplierStatusBadge({ status }: { readonly status: SupplierListItem['status'] }) {
  return (
    <Badge variant={status === 'active' ? 'success' : 'readonly'}>
      {formatStatusLabel(status)}
    </Badge>
  );
}

function SupplierField({
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

function formatSupplierContactSummary(supplier: SupplierListItem): string {
  if (supplier.contact_person !== null && supplier.contact_person.length > 0) {
    return supplier.contact_person;
  }

  if (supplier.mobile_number !== null && supplier.mobile_number.length > 0) {
    return supplier.mobile_number;
  }

  if (supplier.email !== null && supplier.email.length > 0) {
    return supplier.email;
  }

  return 'No contact information provided';
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

function formatStatusLabel(status: string): string {
  return status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
