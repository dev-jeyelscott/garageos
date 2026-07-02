'use client';

import { useState } from 'react';

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

import { deactivateSupplier, reactivateSupplier } from '../supplier.api';
import type { SupplierListItem, SupplierListState } from '../supplier.types';
import { toSafeErrorDetail, toSafeErrorMessage } from '../supplier.ui';

interface SupplierListResultsProps {
  readonly supplierListState: SupplierListState;
  readonly isInitialLoading: boolean;
  readonly isLoadingMore: boolean;
  readonly hasActiveFilters: boolean;
  readonly hasMore: boolean;
  readonly canEditSuppliers: boolean;
  readonly canDeactivateSuppliers: boolean;
  readonly canRecordSupplierPayments: boolean;
  readonly canUseWriteActions: boolean;
  readonly onLoadMore: () => void;
  readonly onSupplierChanged: () => void;
}

export function SupplierListResults({
  supplierListState,
  isInitialLoading,
  isLoadingMore,
  hasActiveFilters,
  hasMore,
  canEditSuppliers,
  canDeactivateSuppliers,
  canRecordSupplierPayments,
  canUseWriteActions,
  onLoadMore,
  onSupplierChanged,
}: SupplierListResultsProps) {
  const [actionState, setActionState] = useState<
    | { readonly status: 'idle' }
    | {
        readonly status: 'submitting';
        readonly supplierId: string;
        readonly action: SupplierStatusAction;
      }
    | { readonly status: 'success'; readonly message: string }
    | { readonly status: 'error'; readonly message: string; readonly detail: string | null }
  >({ status: 'idle' });

  async function handleStatusAction(supplier: SupplierListItem, action: SupplierStatusAction) {
    const actionLabel = action === 'deactivate' ? 'deactivate' : 'reactivate';
    const confirmed = window.confirm(
      `Confirm ${actionLabel} for ${supplier.name}? Backend validation remains authoritative.`,
    );

    if (!confirmed) {
      return;
    }

    setActionState({ status: 'submitting', supplierId: supplier.id, action });

    try {
      if (action === 'deactivate') {
        await deactivateSupplier(supplier.id);
      } else {
        await reactivateSupplier(supplier.id);
      }

      setActionState({
        status: 'success',
        message: `${supplier.name} was ${action === 'deactivate' ? 'deactivated' : 'reactivated'}.`,
      });
      onSupplierChanged();
    } catch (error) {
      setActionState({
        status: 'error',
        message: toSafeErrorMessage(error, `Unable to ${actionLabel} supplier.`),
        detail: toSafeErrorDetail(error),
      });
    }
  }

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
      {actionState.status === 'success' ? (
        <Alert variant="success">
          <p className="text-sm font-bold">{actionState.message}</p>
        </Alert>
      ) : null}

      {actionState.status === 'error' ? (
        <Alert variant="destructive">
          <p className="text-sm font-bold">{actionState.message}</p>
          {actionState.detail === null ? null : (
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{actionState.detail}</p>
          )}
        </Alert>
      ) : null}

      {supplierListState.status === 'error' ? (
        <SupplierListErrorState
          message={supplierListState.message}
          detail={supplierListState.detail}
          code={supplierListState.code}
        />
      ) : null}

      <SupplierCardList
        suppliers={supplierListState.suppliers}
        canEditSuppliers={canEditSuppliers}
        canDeactivateSuppliers={canDeactivateSuppliers}
        canRecordSupplierPayments={canRecordSupplierPayments}
        canUseWriteActions={canUseWriteActions}
        submittingAction={actionState.status === 'submitting' ? actionState : null}
        onStatusAction={(supplier, action) => void handleStatusAction(supplier, action)}
      />
      <SupplierTable
        suppliers={supplierListState.suppliers}
        canEditSuppliers={canEditSuppliers}
        canDeactivateSuppliers={canDeactivateSuppliers}
        canRecordSupplierPayments={canRecordSupplierPayments}
        canUseWriteActions={canUseWriteActions}
        submittingAction={actionState.status === 'submitting' ? actionState : null}
        onStatusAction={(supplier, action) => void handleStatusAction(supplier, action)}
      />

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

function SupplierCardList({
  suppliers,
  canEditSuppliers,
  canDeactivateSuppliers,
  canRecordSupplierPayments,
  canUseWriteActions,
  submittingAction,
  onStatusAction,
}: SupplierActionListProps) {
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
              <SupplierRowActions
                supplier={supplier}
                canEditSuppliers={canEditSuppliers}
                canDeactivateSuppliers={canDeactivateSuppliers}
                canRecordSupplierPayments={canRecordSupplierPayments}
                canUseWriteActions={canUseWriteActions}
                submittingAction={submittingAction}
                onStatusAction={onStatusAction}
              />
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}

function SupplierTable({
  suppliers,
  canEditSuppliers,
  canDeactivateSuppliers,
  canRecordSupplierPayments,
  canUseWriteActions,
  submittingAction,
  onStatusAction,
}: SupplierActionListProps) {
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
            <TableHead className="text-right">Actions</TableHead>
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
                <SupplierRowActions
                  supplier={supplier}
                  canEditSuppliers={canEditSuppliers}
                  canDeactivateSuppliers={canDeactivateSuppliers}
                  canRecordSupplierPayments={canRecordSupplierPayments}
                  canUseWriteActions={canUseWriteActions}
                  submittingAction={submittingAction}
                  onStatusAction={onStatusAction}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function SupplierRowActions({
  supplier,
  canEditSuppliers,
  canDeactivateSuppliers,
  canRecordSupplierPayments,
  canUseWriteActions,
  submittingAction,
  onStatusAction,
}: SupplierRowActionsProps) {
  const statusAction: SupplierStatusAction =
    supplier.status === 'active' ? 'deactivate' : 'reactivate';
  const canRunStatusAction =
    canUseWriteActions &&
    (statusAction === 'deactivate' ? canDeactivateSuppliers : canEditSuppliers);
  const canRecordPayment =
    canUseWriteActions && canRecordSupplierPayments && supplier.status === 'active';
  const isSubmitting =
    submittingAction?.supplierId === supplier.id && submittingAction.action === statusAction;

  return (
    <div className="flex flex-col justify-end gap-2 border-t border-border pt-3 sm:flex-row md:border-t-0 md:pt-0">
      {canRecordPayment ? (
        <ButtonLink href={`/suppliers/${supplier.id}/payments`} variant="secondary" size="sm">
          Record payment
        </ButtonLink>
      ) : (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled
          title={getRecordPaymentTitle({ supplier, canRecordSupplierPayments, canUseWriteActions })}
        >
          Record payment
        </Button>
      )}

      {canEditSuppliers && canUseWriteActions ? (
        <ButtonLink href={`/suppliers/${supplier.id}/edit`} variant="secondary" size="sm">
          Edit
        </ButtonLink>
      ) : (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled
          title="Edit is blocked by permission, read-only tenant state, or offline mode."
        >
          Edit
        </Button>
      )}

      <Button
        type="button"
        variant={statusAction === 'deactivate' ? 'destructive' : 'secondary'}
        size="sm"
        disabled={!canRunStatusAction || isSubmitting}
        title={getStatusActionTitle({ supplier, statusAction, canRunStatusAction })}
        onClick={() => onStatusAction(supplier, statusAction)}
      >
        {isSubmitting ? 'Saving…' : statusAction === 'deactivate' ? 'Deactivate' : 'Reactivate'}
      </Button>
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

function getRecordPaymentTitle({
  supplier,
  canRecordSupplierPayments,
  canUseWriteActions,
}: {
  readonly supplier: SupplierListItem;
  readonly canRecordSupplierPayments: boolean;
  readonly canUseWriteActions: boolean;
}): string {
  if (!canRecordSupplierPayments) {
    return 'Record payment is blocked by missing supplier_payments.create permission.';
  }

  if (!canUseWriteActions) {
    return 'Record payment is blocked by read-only tenant state or offline mode.';
  }

  if (supplier.status !== 'active') {
    return 'Supplier must be active before recording a supplier payment.';
  }

  return `Record a manual supplier payment for ${supplier.name}.`;
}

function getStatusActionTitle({
  supplier,
  statusAction,
  canRunStatusAction,
}: {
  readonly supplier: SupplierListItem;
  readonly statusAction: SupplierStatusAction;
  readonly canRunStatusAction: boolean;
}): string {
  if (canRunStatusAction) {
    return statusAction === 'deactivate'
      ? `Deactivate ${supplier.name} when backend blockers allow it.`
      : `Reactivate ${supplier.name} after backend uniqueness checks pass.`;
  }

  return statusAction === 'deactivate'
    ? 'Deactivate is blocked by permission, read-only tenant state, offline mode, or backend blockers.'
    : 'Reactivate is blocked by suppliers.update permission, read-only tenant state, offline mode, or backend uniqueness checks.';
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

type SupplierStatusAction = 'deactivate' | 'reactivate';

type SubmittingAction = {
  readonly status: 'submitting';
  readonly supplierId: string;
  readonly action: SupplierStatusAction;
};

interface SupplierActionListProps {
  readonly suppliers: readonly SupplierListItem[];
  readonly canEditSuppliers: boolean;
  readonly canDeactivateSuppliers: boolean;
  readonly canRecordSupplierPayments: boolean;
  readonly canUseWriteActions: boolean;
  readonly submittingAction: SubmittingAction | null;
  readonly onStatusAction: (supplier: SupplierListItem, action: SupplierStatusAction) => void;
}

interface SupplierRowActionsProps extends Omit<SupplierActionListProps, 'suppliers'> {
  readonly supplier: SupplierListItem;
}
