'use client';

import { useEffect, useState, type FormEvent } from 'react';

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
} from '../../components/ui';
import { getCurrentSession } from '../auth/queries/get-current-session.query';
import type { AuthSessionResponseData } from '../auth/types/auth-session';

import { InvoiceListResults } from './components/invoice-list-results';
import { getInvoices } from './invoice.api';
import {
  defaultInvoiceListFilters,
  invoiceListPageSize,
  invoiceStatusFilterOptions,
} from './invoice.defaults';
import type {
  InvoiceBranchFilter,
  InvoiceListFilters,
  InvoiceListState,
  InvoiceStatusFilter,
} from './invoice.types';
import {
  canUseInvoiceWriteActions,
  canViewInvoices,
  getApiErrorCode,
  hasPermission,
  toSafeErrorDetail,
  toSafeErrorMessage,
  useNetworkStatus,
} from './invoice.ui';

export function InvoiceListScreen() {
  const [sessionState, setSessionState] = useState<
    | { readonly status: 'loading' }
    | { readonly status: 'ready'; readonly session: AuthSessionResponseData }
    | { readonly status: 'error'; readonly message: string; readonly detail: string | null }
  >({ status: 'loading' });
  const [statusDraft, setStatusDraft] = useState<InvoiceStatusFilter>('all');
  const [branchDraft, setBranchDraft] = useState<InvoiceBranchFilter>('all');
  const [customerDraft, setCustomerDraft] = useState('');
  const [fromDateDraft, setFromDateDraft] = useState('');
  const [toDateDraft, setToDateDraft] = useState('');
  const [appliedFilters, setAppliedFilters] =
    useState<InvoiceListFilters>(defaultInvoiceListFilters);
  const [invoiceListState, setInvoiceListState] = useState<InvoiceListState>({
    status: 'idle',
    invoices: [],
    pagination: null,
  });
  const networkStatus = useNetworkStatus();

  useEffect(() => {
    let active = true;

    async function loadSession() {
      setSessionState({ status: 'loading' });

      try {
        const session = await getCurrentSession();

        if (active) {
          setSessionState({ status: 'ready', session });
        }
      } catch (error) {
        if (active) {
          setSessionState({
            status: 'error',
            message: toSafeErrorMessage(error, 'Unable to load your GarageOS session.'),
            detail: toSafeErrorDetail(error),
          });
        }
      }
    }

    void loadSession();

    return () => {
      active = false;
    };
  }, []);

  const session = sessionState.status === 'ready' ? sessionState.session : null;
  const canReadInvoices = hasPermission(session, 'invoices.read');
  const canCreateInvoices = hasPermission(session, 'invoices.create');
  const canAccessInvoices = canViewInvoices(session);
  const writeActionsAllowed = canUseInvoiceWriteActions({ session, networkStatus });

  useEffect(() => {
    if (!canAccessInvoices) {
      return;
    }

    if (networkStatus === 'offline') {
      setInvoiceListState((current) => ({
        status: 'error',
        invoices: current.invoices,
        pagination: current.pagination,
        message: 'Invoice search is unavailable while offline.',
        detail: 'Offline mode is read-only. Reconnect to refresh invoice search results.',
        code: 'offline_read_only',
      }));
      return;
    }

    let active = true;

    async function loadInvoices() {
      setInvoiceListState({
        status: 'loading',
        invoices: [],
        pagination: null,
      });

      try {
        const result = await getInvoices({
          filters: appliedFilters,
          limit: invoiceListPageSize,
        });

        if (active) {
          setInvoiceListState({
            status: 'loaded',
            invoices: result.invoices,
            pagination: result.pagination,
          });
        }
      } catch (error) {
        if (active) {
          setInvoiceListState({
            status: 'error',
            invoices: [],
            pagination: null,
            message: toSafeErrorMessage(error, 'Unable to load invoices.'),
            detail: toSafeErrorDetail(error),
            code: getApiErrorCode(error),
          });
        }
      }
    }

    void loadInvoices();

    return () => {
      active = false;
    };
  }, [appliedFilters, canAccessInvoices, networkStatus]);

  function handleFilterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setAppliedFilters({
      status: statusDraft,
      branch_id: branchDraft,
      customer_id: customerDraft.trim(),
      from_date: fromDateDraft,
      to_date: toDateDraft,
    });
  }

  function handleResetFilters() {
    setStatusDraft('all');
    setBranchDraft('all');
    setCustomerDraft('');
    setFromDateDraft('');
    setToDateDraft('');
    setAppliedFilters(defaultInvoiceListFilters);
  }

  const isInitialLoading =
    sessionState.status === 'loading' ||
    (canAccessInvoices &&
      (invoiceListState.status === 'idle' || invoiceListState.status === 'loading'));
  const hasActiveFilters =
    appliedFilters.status !== 'all' ||
    appliedFilters.branch_id !== 'all' ||
    appliedFilters.customer_id.length > 0 ||
    appliedFilters.from_date.length > 0 ||
    appliedFilters.to_date.length > 0;
  const branchOptions = session?.branches ?? [];
  const shouldShowBranchFilter =
    session?.tenant_wide_branch_access === true || branchOptions.length > 1;
  const isCreateInvoiceBlocked = !canCreateInvoices || !writeActionsAllowed;

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

  if (session !== null && !canReadInvoices) {
    return (
      <Alert variant="destructive">
        <p className="text-sm font-bold">Invoice list unavailable</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Your tenant session does not include permission to view invoices.
        </p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Required permission: <strong>invoices.read</strong>
        </p>
      </Alert>
    );
  }

  if (session !== null && session.access.can_access_operational_modules !== true) {
    return (
      <Alert variant="destructive">
        <p className="text-sm font-bold">Invoices are blocked</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          This tenant lifecycle state cannot access operational invoice screens.
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
              Cashier workflows
            </p>
            <CardTitle className="mt-2 text-2xl">Invoices</CardTitle>
            <CardDescription className="mt-2">
              Search branch-scoped service invoices and create draft invoices from job orders.
            </CardDescription>
          </div>
          <ButtonLink
            href="/invoices/new"
            disabled={isCreateInvoiceBlocked}
            title={isCreateInvoiceBlocked ? 'New invoice creation is unavailable.' : undefined}
          >
            New invoice
          </ButtonLink>
        </CardHeader>
      </Card>

      {session !== null && !canCreateInvoices ? (
        <Alert>
          <p className="text-sm leading-6">
            New invoice creation is unavailable because your tenant session does not include{' '}
            <strong>invoices.create</strong>.
          </p>
        </Alert>
      ) : null}

      {networkStatus === 'offline' ? (
        <Alert>
          <p className="text-sm leading-6">
            Offline mode is read-only. Reconnect before refreshing invoice search or creating draft
            invoices.
          </p>
        </Alert>
      ) : null}

      {session?.access.read_only === true ? (
        <Alert>
          <p className="text-sm leading-6">
            This tenant is read-only. Invoice viewing remains available with{' '}
            <strong>invoices.read</strong>, but invoice workflow writes are blocked.
          </p>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Invoice list</CardTitle>
          <CardDescription>
            Filter by branch, customer ID, documented invoice status, and invoice date range.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <form
            className="grid gap-3 xl:grid-cols-[13rem_13rem_1fr_11rem_11rem_auto_auto] xl:items-end"
            onSubmit={handleFilterSubmit}
          >
            <label className="grid gap-2">
              <span className="text-sm font-bold text-foreground">Status</span>
              <select
                value={statusDraft}
                onChange={(event) =>
                  setStatusDraft(event.currentTarget.value as InvoiceStatusFilter)
                }
                disabled={isInitialLoading || networkStatus === 'offline'}
                className="min-h-11 rounded-xl border border-input bg-background px-3 py-2 text-base text-foreground shadow-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {invoiceStatusFilterOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-bold text-foreground">Branch</span>
              <select
                value={branchDraft}
                onChange={(event) => setBranchDraft(event.currentTarget.value)}
                disabled={
                  isInitialLoading || networkStatus === 'offline' || !shouldShowBranchFilter
                }
                className="min-h-11 rounded-xl border border-input bg-background px-3 py-2 text-base text-foreground shadow-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="all">All accessible branches</option>
                {branchOptions.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-bold text-foreground">Customer ID</span>
              <Input
                value={customerDraft}
                onChange={(event) => setCustomerDraft(event.currentTarget.value)}
                placeholder="Customer UUID"
                disabled={isInitialLoading || networkStatus === 'offline'}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-bold text-foreground">From date</span>
              <Input
                type="date"
                value={fromDateDraft}
                onChange={(event) => setFromDateDraft(event.currentTarget.value)}
                disabled={isInitialLoading || networkStatus === 'offline'}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-bold text-foreground">To date</span>
              <Input
                type="date"
                value={toDateDraft}
                onChange={(event) => setToDateDraft(event.currentTarget.value)}
                disabled={isInitialLoading || networkStatus === 'offline'}
              />
            </label>

            <Button type="submit" disabled={isInitialLoading || networkStatus === 'offline'}>
              Apply filters
            </Button>

            <Button
              type="button"
              variant="secondary"
              disabled={isInitialLoading || networkStatus === 'offline'}
              onClick={handleResetFilters}
            >
              Reset
            </Button>
          </form>

          {hasActiveFilters ? (
            <Alert>
              <p className="text-sm leading-6">Active filters are applied to this invoice list.</p>
            </Alert>
          ) : null}

          <InvoiceListResults
            invoiceListState={invoiceListState}
            isInitialLoading={isInitialLoading}
            hasActiveFilters={hasActiveFilters}
          />
        </CardContent>
      </Card>
    </div>
  );
}
