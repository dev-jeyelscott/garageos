'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';

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
  Input,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui';
import { getCurrentSession } from '../auth/queries/get-current-session.query';
import type { AuthBranchSummary, AuthSessionResponseData } from '../auth/types/auth-session';
import {
  canUseSupplierWriteActions,
  getApiErrorCode,
  hasPermission,
  toSafeErrorDetail,
  toSafeErrorMessage,
  useNetworkStatus,
} from '../suppliers/supplier.ui';

import { getAccountsPayableList, getAccountsPayableSummary } from './accounts-payable.api';
import {
  accountsPayablePageSize,
  defaultAccountsPayableFilters,
} from './accounts-payable.defaults';
import type {
  AccountsPayableBranchBalance,
  AccountsPayableFilters,
  AccountsPayableListResult,
  AccountsPayableSummaryResult,
  AccountsPayableSupplierBalance,
  AccountsPayableTotals,
} from './accounts-payable.types';

type SessionState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly session: AuthSessionResponseData }
  | { readonly status: 'error'; readonly message: string; readonly detail: string | null };

type AccountsPayableDataState =
  | { readonly status: 'idle' | 'loading' }
  | {
      readonly status: 'loaded';
      readonly list: AccountsPayableListResult;
      readonly summary: AccountsPayableSummaryResult | null;
    }
  | {
      readonly status: 'error';
      readonly message: string;
      readonly detail: string | null;
      readonly code: string | null;
    };

export function AccountsPayableSummaryScreen() {
  const [sessionState, setSessionState] = useState<SessionState>({ status: 'loading' });
  const [selectedBranchId, setSelectedBranchId] = useState('all');
  const [includeZero, setIncludeZero] = useState(false);
  const [appliedFilters, setAppliedFilters] = useState<AccountsPayableFilters>(
    defaultAccountsPayableFilters,
  );
  const [dataState, setDataState] = useState<AccountsPayableDataState>({ status: 'idle' });
  const [isLoadingMore, setIsLoadingMore] = useState(false);
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
  const canReadList = canReadAccountsPayableList(session);
  const canReadSummary = canReadAccountsPayableSummary(session);
  const writeActionsAllowed = canUseSupplierWriteActions({ session, networkStatus });

  useEffect(() => {
    if (!canReadList) {
      return;
    }

    let active = true;

    async function loadAccountsPayable() {
      setDataState({ status: 'loading' });
      setIsLoadingMore(false);

      try {
        const [list, summary] = await Promise.all([
          getAccountsPayableList({
            filters: appliedFilters,
            limit: accountsPayablePageSize,
          }),
          canReadSummary
            ? getAccountsPayableSummary({ filters: appliedFilters })
            : Promise.resolve(null),
        ]);

        if (!active) {
          return;
        }

        setDataState({ status: 'loaded', list, summary });
      } catch (error) {
        if (!active) {
          return;
        }

        setDataState({
          status: 'error',
          message: toSafeErrorMessage(error, 'Unable to load accounts payable balances.'),
          detail: toSafeErrorDetail(error),
          code: getApiErrorCode(error),
        });
      }
    }

    void loadAccountsPayable();

    return () => {
      active = false;
    };
  }, [appliedFilters, canReadList, canReadSummary]);

  const handleLoadMore = useCallback(async () => {
    if (dataState.status !== 'loaded' || isLoadingMore) {
      return;
    }

    const nextCursor = dataState.list.pagination.next_cursor;

    if (nextCursor === null || dataState.list.pagination.has_more !== true) {
      return;
    }

    setIsLoadingMore(true);

    try {
      const nextPage = await getAccountsPayableList({
        filters: appliedFilters,
        cursor: nextCursor,
        limit: accountsPayablePageSize,
      });

      setDataState((current) => {
        if (current.status !== 'loaded') {
          return current;
        }

        return {
          status: 'loaded',
          summary: current.summary,
          list: {
            ...nextPage,
            balances: [...current.list.balances, ...nextPage.balances],
          },
        };
      });
    } catch (error) {
      setDataState({
        status: 'error',
        message: toSafeErrorMessage(error, 'Unable to load more accounts payable balances.'),
        detail: toSafeErrorDetail(error),
        code: getApiErrorCode(error),
      });
    } finally {
      setIsLoadingMore(false);
    }
  }, [appliedFilters, dataState, isLoadingMore]);

  function handleFilterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setAppliedFilters({
      branch_id: selectedBranchId === 'all' ? null : selectedBranchId,
      supplier_id: null,
      include_zero: includeZero,
    });
  }

  function handleResetFilters() {
    setSelectedBranchId('all');
    setIncludeZero(false);
    setAppliedFilters(defaultAccountsPayableFilters);
  }

  if (sessionState.status === 'error') {
    return <ErrorAlert title="Accounts payable unavailable" state={sessionState} />;
  }

  if (session !== null && !canReadList) {
    return (
      <Alert variant="destructive">
        <p className="text-sm font-bold">Accounts payable unavailable</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Your tenant session does not include permission to view accounts payable balances.
        </p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Required permission: <strong>supplier_payments.read</strong> or{' '}
          <strong>reports.view_basic</strong>
        </p>
      </Alert>
    );
  }

  const isInitialLoading =
    sessionState.status === 'loading' ||
    dataState.status === 'idle' ||
    dataState.status === 'loading';
  const summary = dataState.status === 'loaded' ? dataState.summary : null;
  const list = dataState.status === 'loaded' ? dataState.list : null;
  const currency = session?.tenant?.currency ?? 'PHP';

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader className="gap-4 lg:grid lg:grid-cols-[1fr_auto] lg:items-start">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-muted-foreground">
              Purchasing and accounts payable
            </p>
            <CardTitle className="mt-2 text-2xl">Accounts payable</CardTitle>
            <CardDescription className="mt-2">
              Review supplier outstanding balances from credit purchases, supplier payments, and
              supplier credits/returns. Branch visibility remains enforced by the API session.
            </CardDescription>
          </div>
          <ButtonLink href="/suppliers" variant="secondary">
            Suppliers
          </ButtonLink>
        </CardHeader>
      </Card>

      {!writeActionsAllowed && session !== null ? (
        <Alert>
          <p className="text-sm leading-6">
            Operational writes are blocked by tenant access state or offline mode. AP balances
            remain viewable when your session has the required read/report permission.
          </p>
        </Alert>
      ) : null}

      {!canReadSummary && session !== null ? (
        <Alert>
          <p className="text-sm leading-6">
            AP summary totals require <strong>reports.view_basic</strong>. Supplier balance rows are
            still available through <strong>supplier_payments.read</strong>.
          </p>
        </Alert>
      ) : null}

      <AccountsPayableFilterCard
        branches={session?.branches ?? []}
        selectedBranchId={selectedBranchId}
        includeZero={includeZero}
        disabled={isInitialLoading || isLoadingMore}
        onBranchChange={setSelectedBranchId}
        onIncludeZeroChange={setIncludeZero}
        onSubmit={handleFilterSubmit}
        onReset={handleResetFilters}
      />

      {dataState.status === 'error' ? (
        <ErrorAlert title="Unable to load accounts payable" state={dataState} />
      ) : null}

      {isInitialLoading ? (
        <AccountsPayableSkeleton />
      ) : list === null ? (
        <Alert variant="destructive">
          <p className="text-sm font-bold">Accounts payable unavailable</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            AP data could not be resolved into a ready state. Refresh the page and try again.
          </p>
        </Alert>
      ) : (
        <>
          <AccountsPayableTotalsCards totals={summary?.totals ?? null} currency={currency} />
          <AccountsPayableSupplierBalances
            balances={list.balances}
            currency={currency}
            isLoadingMore={isLoadingMore}
            hasMore={list.pagination.has_more && list.pagination.next_cursor !== null}
            onLoadMore={() => void handleLoadMore()}
          />
          {summary === null ? null : (
            <AccountsPayableBranchBreakdown balances={summary.by_branch} currency={currency} />
          )}
        </>
      )}
    </div>
  );
}

export function SupplierAccountsPayableDetailScreen({
  supplierId,
}: {
  readonly supplierId: string;
}) {
  const targetSupplierId = supplierId.trim().length > 0 ? supplierId.trim() : null;
  const [sessionState, setSessionState] = useState<SessionState>({ status: 'loading' });
  const [selectedBranchId, setSelectedBranchId] = useState('all');
  const [includeZero, setIncludeZero] = useState(true);
  const [dataState, setDataState] = useState<AccountsPayableDataState>({ status: 'idle' });
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
  const canReadList = canReadAccountsPayableList(session);
  const canReadSummary = canReadAccountsPayableSummary(session);
  const canRecordSupplierPayment =
    hasPermission(session, 'supplier_payments.create') &&
    canUseSupplierWriteActions({ session, networkStatus });

  useEffect(() => {
    if (!canReadList || targetSupplierId === null) {
      return;
    }

    let active = true;
    const filters: AccountsPayableFilters = {
      branch_id: selectedBranchId === 'all' ? null : selectedBranchId,
      supplier_id: targetSupplierId,
      include_zero: includeZero,
    };

    async function loadSupplierAccountsPayable() {
      setDataState({ status: 'loading' });

      try {
        const [list, summary] = await Promise.all([
          getAccountsPayableList({
            filters,
            limit: accountsPayablePageSize,
          }),
          canReadSummary ? getAccountsPayableSummary({ filters }) : Promise.resolve(null),
        ]);

        if (!active) {
          return;
        }

        setDataState({ status: 'loaded', list, summary });
      } catch (error) {
        if (!active) {
          return;
        }

        setDataState({
          status: 'error',
          message: toSafeErrorMessage(error, 'Unable to load supplier AP detail.'),
          detail: toSafeErrorDetail(error),
          code: getApiErrorCode(error),
        });
      }
    }

    void loadSupplierAccountsPayable();

    return () => {
      active = false;
    };
  }, [canReadList, canReadSummary, includeZero, selectedBranchId, targetSupplierId]);

  if (sessionState.status === 'error') {
    return <ErrorAlert title="Supplier AP unavailable" state={sessionState} />;
  }

  if (targetSupplierId === null) {
    return (
      <Alert variant="destructive">
        <p className="text-sm font-bold">Supplier AP unavailable</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Supplier ID is required before opening supplier accounts payable detail.
        </p>
      </Alert>
    );
  }

  if (session !== null && !canReadList) {
    return (
      <Alert variant="destructive">
        <p className="text-sm font-bold">Supplier AP unavailable</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Your tenant session does not include permission to view accounts payable balances.
        </p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Required permission: <strong>supplier_payments.read</strong> or{' '}
          <strong>reports.view_basic</strong>
        </p>
      </Alert>
    );
  }

  const currency = session?.tenant?.currency ?? 'PHP';
  const list = dataState.status === 'loaded' ? dataState.list : null;
  const summary = dataState.status === 'loaded' ? dataState.summary : null;
  const supplierBalance = list?.balances[0] ?? summary?.by_supplier[0] ?? null;
  const isInitialLoading =
    sessionState.status === 'loading' ||
    dataState.status === 'idle' ||
    dataState.status === 'loading';

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader className="gap-4 lg:grid lg:grid-cols-[1fr_auto] lg:items-start">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-muted-foreground">
              Supplier accounts payable
            </p>
            <CardTitle className="mt-2 text-2xl">
              {supplierBalance?.supplier_name ?? 'Supplier AP detail'}
            </CardTitle>
            <CardDescription className="mt-2">
              View this supplier&apos;s payable basis from credit purchases, supplier payments, and
              supplier credits/returns. Payment recording stays in the existing supplier payment
              workflow.
            </CardDescription>
            <p className="mt-2 break-all text-xs text-muted-foreground">
              Supplier ID: <span className="font-mono">{targetSupplierId}</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/accounts-payable" variant="secondary">
              Back to AP
            </ButtonLink>
            {canRecordSupplierPayment ? (
              <ButtonLink href={`/suppliers/${targetSupplierId}/payments`}>
                Record payment
              </ButtonLink>
            ) : (
              <Button
                disabled
                title="Requires supplier_payments.create, write access, and online mode."
              >
                Record payment
              </Button>
            )}
          </div>
        </CardHeader>
      </Card>

      {!canReadSummary && session !== null ? (
        <Alert>
          <p className="text-sm leading-6">
            Supplier AP summary and branch source breakdown require{' '}
            <strong>reports.view_basic</strong>. Supplier payable balance rows are still available
            through <strong>supplier_payments.read</strong>.
          </p>
        </Alert>
      ) : null}

      <AccountsPayableFilterCard
        branches={session?.branches ?? []}
        selectedBranchId={selectedBranchId}
        includeZero={includeZero}
        disabled={isInitialLoading}
        onBranchChange={setSelectedBranchId}
        onIncludeZeroChange={setIncludeZero}
        onSubmit={(event) => event.preventDefault()}
        onReset={() => {
          setSelectedBranchId('all');
          setIncludeZero(true);
        }}
        autoApply
      />

      {dataState.status === 'error' ? (
        <ErrorAlert title="Unable to load supplier AP" state={dataState} />
      ) : null}

      {isInitialLoading ? (
        <AccountsPayableSkeleton />
      ) : supplierBalance === null ? (
        <Alert>
          <p className="text-sm font-bold">No supplier payable basis found</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            This supplier has no visible AP balance or AP basis under the current branch filter.
          </p>
        </Alert>
      ) : (
        <>
          <SupplierPayableBasisCard balance={supplierBalance} currency={currency} />
          {summary === null ? null : (
            <AccountsPayableBranchBreakdown balances={summary.by_branch} currency={currency} />
          )}
        </>
      )}
    </div>
  );
}

function AccountsPayableFilterCard({
  branches,
  selectedBranchId,
  includeZero,
  disabled,
  autoApply = false,
  onBranchChange,
  onIncludeZeroChange,
  onSubmit,
  onReset,
}: {
  readonly branches: readonly AuthBranchSummary[];
  readonly selectedBranchId: string;
  readonly includeZero: boolean;
  readonly disabled: boolean;
  readonly autoApply?: boolean;
  readonly onBranchChange: (branchId: string) => void;
  readonly onIncludeZeroChange: (includeZero: boolean) => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly onReset: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Filters</CardTitle>
        <CardDescription>
          Filter AP by branch. Leaving branch as all accessible branches lets the backend resolve
          tenant-wide or assigned-branch scope from the session.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-3 lg:grid-cols-[1fr_auto_auto] lg:items-end" onSubmit={onSubmit}>
          <label className="grid gap-2">
            <span className="text-sm font-bold text-foreground">Branch</span>
            <select
              value={selectedBranchId}
              disabled={disabled}
              onChange={(event) => onBranchChange(event.currentTarget.value)}
              className="min-h-11 rounded-xl border border-input bg-background px-3 py-2 text-base text-foreground shadow-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="all">All accessible branches</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex min-h-11 items-center gap-3 rounded-xl border border-border px-3 py-2 text-sm font-semibold text-foreground">
            <input
              type="checkbox"
              checked={includeZero}
              disabled={disabled}
              onChange={(event) => onIncludeZeroChange(event.currentTarget.checked)}
              className="size-4"
            />
            Include zero balances
          </label>

          {autoApply ? (
            <Button type="button" variant="secondary" disabled={disabled} onClick={onReset}>
              Reset
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button type="submit" disabled={disabled}>
                Apply
              </Button>
              <Button type="button" variant="secondary" disabled={disabled} onClick={onReset}>
                Reset
              </Button>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

function AccountsPayableTotalsCards({
  totals,
  currency,
}: {
  readonly totals: AccountsPayableTotals | null;
  readonly currency: string;
}) {
  if (totals === null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>AP summary totals unavailable</CardTitle>
          <CardDescription>
            Summary totals require reports access. Supplier balance rows remain visible when
            allowed.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const metrics = [
    {
      label: 'Outstanding AP',
      value: totals.payable_balance,
      description: 'Current supplier payable balance',
    },
    {
      label: 'Credit purchases received',
      value: totals.credit_purchase_received_total,
      description: 'Credit purchase receiving basis',
    },
    {
      label: 'Supplier payments',
      value: totals.supplier_payment_total,
      description: 'Manual payments reducing AP',
    },
    {
      label: 'Supplier credits',
      value: totals.supplier_credit_total,
      description: 'Credits from returns or approved adjustments',
    },
  ];

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => (
        <Card key={metric.label}>
          <CardHeader>
            <CardDescription>{metric.label}</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {formatMoney(metric.value, currency)}
            </CardTitle>
            <p className="text-xs leading-5 text-muted-foreground">{metric.description}</p>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}

function AccountsPayableSupplierBalances({
  balances,
  currency,
  isLoadingMore,
  hasMore,
  onLoadMore,
}: {
  readonly balances: readonly AccountsPayableSupplierBalance[];
  readonly currency: string;
  readonly isLoadingMore: boolean;
  readonly hasMore: boolean;
  readonly onLoadMore: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Supplier balances</CardTitle>
        <CardDescription>
          Supplier AP rows are tenant-scoped and branch-filtered by backend authorization.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {balances.length === 0 ? (
          <Alert>
            <p className="text-sm font-bold">No supplier balances found</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              No visible supplier AP balances match the current filters.
            </p>
          </Alert>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Payable</TableHead>
                  <TableHead className="text-right">Credit received</TableHead>
                  <TableHead className="text-right">Payments</TableHead>
                  <TableHead className="text-right">Credits</TableHead>
                  <TableHead>Last activity</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {balances.map((balance) => (
                  <TableRow key={balance.supplier_id}>
                    <TableCell className="font-semibold">{balance.supplier_name}</TableCell>
                    <TableCell>
                      <SupplierStatusBadge status={balance.supplier_status} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(balance.payable_balance, currency)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(balance.credit_purchase_received_total, currency)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(balance.supplier_payment_total, currency)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(balance.supplier_credit_total, currency)}
                    </TableCell>
                    <TableCell>{formatDateTime(balance.last_activity_at)}</TableCell>
                    <TableCell>
                      <ButtonLink
                        href={`/accounts-payable/suppliers/${balance.supplier_id}`}
                        variant="secondary"
                        size="sm"
                      >
                        View AP
                      </ButtonLink>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {hasMore ? (
          <Button type="button" variant="secondary" disabled={isLoadingMore} onClick={onLoadMore}>
            {isLoadingMore ? 'Loading...' : 'Load more'}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function SupplierPayableBasisCard({
  balance,
  currency,
}: {
  readonly balance: AccountsPayableSupplierBalance;
  readonly currency: string;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>{balance.supplier_name}</CardTitle>
          <SupplierStatusBadge status={balance.supplier_status} />
        </div>
        <CardDescription>
          Last AP activity: {formatDateTime(balance.last_activity_at)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricTile
            label="Outstanding AP"
            value={formatMoney(balance.payable_balance, currency)}
            description="Current payable balance"
          />
          <MetricTile
            label="Credit purchases received"
            value={formatMoney(balance.credit_purchase_received_total, currency)}
            description="Credit receiving basis"
          />
          <MetricTile
            label="Supplier payments"
            value={formatMoney(balance.supplier_payment_total, currency)}
            description="Manual AP reductions"
          />
          <MetricTile
            label="Supplier credits"
            value={formatMoney(balance.supplier_credit_total, currency)}
            description="Returns or approved credit adjustments"
          />
        </div>
      </CardContent>
    </Card>
  );
}

function AccountsPayableBranchBreakdown({
  balances,
  currency,
}: {
  readonly balances: readonly AccountsPayableBranchBalance[];
  readonly currency: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Branch source breakdown</CardTitle>
        <CardDescription>
          Branch source balances show credit purchase receiving and supplier credits by branch.
          Supplier payments reduce supplier-level AP and are not attributed to a branch source row.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {balances.length === 0 ? (
          <Alert>
            <p className="text-sm font-bold">No branch source balances found</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              No visible branch AP source rows match the current filters.
            </p>
          </Alert>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Branch</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead className="text-right">Source balance</TableHead>
                  <TableHead className="text-right">Credit received</TableHead>
                  <TableHead className="text-right">Supplier credits</TableHead>
                  <TableHead>Last activity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {balances.map((balance) => (
                  <TableRow key={`${balance.branch_id}-${balance.supplier_id}`}>
                    <TableCell>
                      <div className="font-semibold">{balance.branch_name}</div>
                      <SupplierStatusBadge status={balance.branch_status} />
                    </TableCell>
                    <TableCell>{balance.supplier_name}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(balance.source_balance, currency)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(balance.credit_purchase_received_total, currency)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(balance.supplier_credit_total, currency)}
                    </TableCell>
                    <TableCell>{formatDateTime(balance.last_activity_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MetricTile({
  label,
  value,
  description,
}: {
  readonly label: string;
  readonly value: string;
  readonly description: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{value}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
    </div>
  );
}

function SupplierStatusBadge({ status }: { readonly status: 'active' | 'inactive' }) {
  return (
    <Badge variant={status === 'active' ? 'success' : 'readonly'}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

function ErrorAlert({
  title,
  state,
}: {
  readonly title: string;
  readonly state: {
    readonly message: string;
    readonly detail: string | null;
    readonly code?: string | null;
  };
}) {
  return (
    <Alert variant="destructive">
      <p className="text-sm font-bold">{title}</p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{state.message}</p>
      {state.detail === null ? null : (
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{state.detail}</p>
      )}
      {state.code === undefined || state.code === null ? null : (
        <p className="mt-2 text-xs text-muted-foreground">Error code: {state.code}</p>
      )}
    </Alert>
  );
}

function AccountsPayableSkeleton() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-live="polite">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
      <Skeleton className="h-96 w-full" />
    </div>
  );
}

function canReadAccountsPayableList(session: AuthSessionResponseData | null): boolean {
  return (
    hasPermission(session, 'supplier_payments.read') || hasPermission(session, 'reports.view_basic')
  );
}

function canReadAccountsPayableSummary(session: AuthSessionResponseData | null): boolean {
  return hasPermission(session, 'reports.view_basic');
}

function formatMoney(value: string, currency: string): string {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return `${currency} ${value}`;
  }

  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency,
  }).format(amount);
}

function formatDateTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
