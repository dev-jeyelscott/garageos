'use client';

import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react';

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

import { getSupplierReturns } from './supplier-return.api';
import {
  defaultSupplierReturnListFilters,
  supplierReturnListPageSize,
  supplierReturnStatusFilterOptions,
} from './supplier-return.defaults';
import type {
  SupplierReturnListFilters,
  SupplierReturnListItem,
  SupplierReturnListState,
  SupplierReturnStatus,
  SupplierReturnStatusFilter,
} from './supplier-return.types';
import {
  canUseSupplierWriteActions,
  getApiErrorCode,
  hasPermission,
  toSafeErrorDetail,
  toSafeErrorMessage,
  useNetworkStatus,
} from './supplier.ui';

export function SupplierReturnListScreen() {
  const [sessionState, setSessionState] = useState<
    | { readonly status: 'loading' }
    | { readonly status: 'ready'; readonly session: AuthSessionResponseData }
    | { readonly status: 'error'; readonly message: string; readonly detail: string | null }
  >({ status: 'loading' });
  const [statusDraft, setStatusDraft] = useState<SupplierReturnStatusFilter>('all');
  const [branchDraft, setBranchDraft] = useState('all');
  const [supplierDraft, setSupplierDraft] = useState('all');
  const [appliedFilters, setAppliedFilters] = useState<SupplierReturnListFilters>(
    defaultSupplierReturnListFilters,
  );
  const [supplierReturnListState, setSupplierReturnListState] = useState<SupplierReturnListState>({
    status: 'idle',
    supplierReturns: [],
    pagination: null,
  });
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
  const canCreateSupplierReturn = canCreateSupplierReturns && writeActionsAllowed;

  useEffect(() => {
    if (!canReadSupplierReturns) {
      return;
    }

    let active = true;

    async function loadInitialSupplierReturns() {
      setSupplierReturnListState({
        status: 'loading',
        supplierReturns: [],
        pagination: null,
      });

      try {
        const result = await getSupplierReturns({
          filters: appliedFilters,
          limit: supplierReturnListPageSize,
        });

        if (!active) {
          return;
        }

        setSupplierReturnListState({
          status: 'loaded',
          supplierReturns: result.supplierReturns,
          pagination: result.pagination,
        });
      } catch (error) {
        if (!active) {
          return;
        }

        setSupplierReturnListState({
          status: 'error',
          supplierReturns: [],
          pagination: null,
          message: toSafeErrorMessage(error, 'Unable to load supplier returns.'),
          detail: toSafeErrorDetail(error),
          code: getApiErrorCode(error),
        });
      }
    }

    void loadInitialSupplierReturns();

    return () => {
      active = false;
    };
  }, [appliedFilters, canReadSupplierReturns]);

  const handleLoadMore = useCallback(async () => {
    const nextCursor = supplierReturnListState.pagination?.next_cursor ?? null;

    if (nextCursor === null || supplierReturnListState.status === 'loading_more') {
      return;
    }

    setSupplierReturnListState((current) => ({
      ...current,
      status: 'loading_more',
    }));

    try {
      const result = await getSupplierReturns({
        filters: appliedFilters,
        cursor: nextCursor,
        limit: supplierReturnListPageSize,
      });

      setSupplierReturnListState((current) => ({
        status: 'loaded',
        supplierReturns: [...current.supplierReturns, ...result.supplierReturns],
        pagination: result.pagination,
      }));
    } catch (error) {
      setSupplierReturnListState((current) => ({
        status: 'error',
        supplierReturns: current.supplierReturns,
        pagination: current.pagination,
        message: toSafeErrorMessage(error, 'Unable to load more supplier returns.'),
        detail: toSafeErrorDetail(error),
        code: getApiErrorCode(error),
      }));
    }
  }, [
    appliedFilters,
    supplierReturnListState.pagination?.next_cursor,
    supplierReturnListState.status,
  ]);

  function handleFilterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setAppliedFilters({
      status: statusDraft,
      branch_id: branchDraft.trim().length > 0 ? branchDraft.trim() : 'all',
      supplier_id: supplierDraft.trim().length > 0 ? supplierDraft.trim() : 'all',
    });
  }

  function handleResetFilters() {
    setStatusDraft('all');
    setBranchDraft('all');
    setSupplierDraft('all');
    setAppliedFilters(defaultSupplierReturnListFilters);
  }

  const isInitialLoading =
    sessionState.status === 'loading' ||
    supplierReturnListState.status === 'idle' ||
    supplierReturnListState.status === 'loading';
  const isLoadingMore = supplierReturnListState.status === 'loading_more';
  const hasMore =
    supplierReturnListState.pagination?.has_more === true &&
    supplierReturnListState.pagination.next_cursor !== null;
  const hasActiveFilters =
    appliedFilters.status !== 'all' ||
    appliedFilters.branch_id !== 'all' ||
    appliedFilters.supplier_id !== 'all';

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
        <p className="text-sm font-bold">Supplier returns unavailable</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Your tenant session does not include permission to view supplier returns.
        </p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Required permission: <strong>supplier_returns.read</strong>
        </p>
      </Alert>
    );
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader className="gap-4 lg:grid lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-muted-foreground">
              Purchasing and accounts payable
            </p>
            <CardTitle className="mt-2 text-2xl">Supplier returns</CardTitle>
            <CardDescription className="mt-2">
              View draft, posted, and cancelled supplier returns. Posting remains authoritative in
              the API because it affects stock, FIFO consumption, accounts payable, and supplier
              credits.
            </CardDescription>
          </div>
          {canCreateSupplierReturn ? (
            <ButtonLink href="/supplier-returns/new">New supplier return</ButtonLink>
          ) : (
            <Button
              type="button"
              disabled
              title="Create supplier return is blocked by permission, read-only tenant state, or offline mode."
            >
              New supplier return
            </Button>
          )}
        </CardHeader>
      </Card>

      {!writeActionsAllowed && session !== null ? (
        <Alert>
          <p className="text-sm leading-6">
            Supplier return writes are currently blocked by tenant access state or offline mode.
            Return search remains available when your session has{' '}
            <strong>supplier_returns.read</strong>.
          </p>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Return list</CardTitle>
          <CardDescription>
            Filter by documented supplier-return dimensions: branch, supplier, and workflow status.
            Branch and supplier filters accept IDs to avoid depending on undocumented lookup APIs.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <form
            className="grid gap-3 lg:grid-cols-[14rem_1fr_1fr_auto_auto] lg:items-end"
            onSubmit={handleFilterSubmit}
          >
            <label className="grid gap-2">
              <span className="text-sm font-bold text-foreground">Status</span>
              <select
                value={statusDraft}
                onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                  setStatusDraft(event.currentTarget.value as SupplierReturnStatusFilter)
                }
                disabled={isInitialLoading || isLoadingMore}
                className="min-h-11 rounded-xl border border-input bg-background px-3 py-2 text-base text-foreground shadow-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {supplierReturnStatusFilterOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-bold text-foreground">Branch ID</span>
              <input
                type="text"
                value={branchDraft}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setBranchDraft(event.currentTarget.value)
                }
                disabled={isInitialLoading || isLoadingMore}
                placeholder="all or branch UUID"
                className="min-h-11 rounded-xl border border-input bg-background px-3 py-2 text-base text-foreground shadow-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-bold text-foreground">Supplier ID</span>
              <input
                type="text"
                value={supplierDraft}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setSupplierDraft(event.currentTarget.value)
                }
                disabled={isInitialLoading || isLoadingMore}
                placeholder="all or supplier UUID"
                className="min-h-11 rounded-xl border border-input bg-background px-3 py-2 text-base text-foreground shadow-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>

            <Button type="submit" disabled={isInitialLoading || isLoadingMore}>
              Apply filters
            </Button>

            <Button
              type="button"
              variant="secondary"
              disabled={isInitialLoading || isLoadingMore}
              onClick={handleResetFilters}
            >
              Reset
            </Button>
          </form>

          {hasActiveFilters ? (
            <Alert>
              <p className="text-sm leading-6">
                Active filters: <strong>{formatStatusFilter(appliedFilters.status)}</strong>
                {' · '}
                <strong>Branch: {appliedFilters.branch_id}</strong>
                {' · '}
                <strong>Supplier: {appliedFilters.supplier_id}</strong>
              </p>
            </Alert>
          ) : null}

          <SupplierReturnListResults
            supplierReturnListState={supplierReturnListState}
            isInitialLoading={isInitialLoading}
            isLoadingMore={isLoadingMore}
            hasActiveFilters={hasActiveFilters}
            hasMore={hasMore}
            canCreateSupplierReturns={canCreateSupplierReturns}
            canUseWriteActions={writeActionsAllowed}
            onLoadMore={() => void handleLoadMore()}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function SupplierReturnListResults({
  supplierReturnListState,
  isInitialLoading,
  isLoadingMore,
  hasActiveFilters,
  hasMore,
  canCreateSupplierReturns,
  canUseWriteActions,
  onLoadMore,
}: {
  readonly supplierReturnListState: SupplierReturnListState;
  readonly isInitialLoading: boolean;
  readonly isLoadingMore: boolean;
  readonly hasActiveFilters: boolean;
  readonly hasMore: boolean;
  readonly canCreateSupplierReturns: boolean;
  readonly canUseWriteActions: boolean;
  readonly onLoadMore: () => void;
}) {
  if (isInitialLoading) {
    return (
      <div className="grid gap-3" aria-busy="true" aria-live="polite">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (supplierReturnListState.status === 'error') {
    return (
      <Alert variant="destructive">
        <p className="text-sm font-bold">{supplierReturnListState.message}</p>
        {supplierReturnListState.detail === null ? null : (
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {supplierReturnListState.detail}
          </p>
        )}
        {supplierReturnListState.code === null ? null : (
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Error code: {supplierReturnListState.code}
          </p>
        )}
      </Alert>
    );
  }

  if (supplierReturnListState.supplierReturns.length === 0) {
    return (
      <Alert>
        <p className="text-sm font-bold">No supplier returns found.</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {hasActiveFilters
            ? 'Adjust the branch, supplier, or status filters and try again.'
            : 'Create a draft supplier return when stock previously received from a supplier must be returned.'}
        </p>
        {canCreateSupplierReturns && canUseWriteActions ? (
          <ButtonLink href="/supplier-returns/new" className="mt-3 inline-flex">
            New supplier return
          </ButtonLink>
        ) : null}
      </Alert>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="overflow-hidden rounded-2xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Return</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead>Quantity</TableHead>
              <TableHead>Financial value</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {supplierReturnListState.supplierReturns.map((supplierReturn) => (
              <SupplierReturnTableRow
                key={supplierReturn.id}
                supplierReturn={supplierReturn}
                canCreateSupplierReturns={canCreateSupplierReturns}
                canUseWriteActions={canUseWriteActions}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      {hasMore ? (
        <div className="flex justify-center">
          <Button type="button" variant="secondary" disabled={isLoadingMore} onClick={onLoadMore}>
            {isLoadingMore ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function SupplierReturnTableRow({
  supplierReturn,
  canCreateSupplierReturns,
  canUseWriteActions,
}: {
  readonly supplierReturn: SupplierReturnListItem;
  readonly canCreateSupplierReturns: boolean;
  readonly canUseWriteActions: boolean;
}) {
  const canEditDraft =
    supplierReturn.status === 'draft' && canCreateSupplierReturns && canUseWriteActions;

  return (
    <TableRow>
      <TableCell>
        <div className="grid gap-1">
          <ButtonLink
            href={`/supplier-returns/${supplierReturn.id}`}
            variant="ghost"
            className="justify-start px-0"
          >
            {supplierReturn.supplier_return_number ?? supplierReturn.id}
          </ButtonLink>
          {supplierReturn.original_receiving_id === null ? null : (
            <span className="break-all text-xs text-muted-foreground">
              Receiving: {supplierReturn.original_receiving_id}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell>
        <Badge variant={getStatusBadgeVariant(supplierReturn.status)}>
          {formatStatusLabel(supplierReturn.status)}
        </Badge>
      </TableCell>
      <TableCell>{supplierReturn.supplier_name ?? supplierReturn.supplier_id ?? '—'}</TableCell>
      <TableCell>{supplierReturn.branch_name ?? supplierReturn.branch_id ?? '—'}</TableCell>
      <TableCell>{supplierReturn.total_returned_quantity ?? '—'}</TableCell>
      <TableCell>{formatNullableMoney(supplierReturn.financial_value)}</TableCell>
      <TableCell>
        <div className="flex justify-end gap-2">
          <ButtonLink href={`/supplier-returns/${supplierReturn.id}`} variant="secondary" size="sm">
            View
          </ButtonLink>
          {canEditDraft ? (
            <ButtonLink href={`/supplier-returns/${supplierReturn.id}/edit`} size="sm">
              Edit
            </ButtonLink>
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  );
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

function formatStatusFilter(status: SupplierReturnStatusFilter): string {
  if (status === 'all') {
    return 'All returns';
  }

  return `${formatStatusLabel(status)} returns`;
}

function formatStatusLabel(status: string): string {
  return status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatNullableMoney(value: string | null): string {
  if (value === null) {
    return '—';
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
