import { notFound } from 'next/navigation';

import { Badge, ButtonLink, Card } from '../../components/ui';
import {
  BlockedState,
  EmptyState,
  GuardedPrimaryAction,
  LoadingState,
  PageHeader,
  StandardStateGallery,
  TenantAppShell,
  createMockShellSession,
  type AppModule,
} from '../tenant-shell/tenant-shell';
import {
  getMasterDataRecord,
  listMasterData,
  masterDataModules,
  type MasterDataKind,
  type MasterDataRecord,
} from './master-data-adapter';

const moduleToAppModule: Record<MasterDataKind, AppModule> = {
  branches: 'branches',
  employees: 'employees',
  roles: 'roles',
  customers: 'customers',
  customer_tags: 'customer_tags',
};

export async function MasterDataListScreen({ kind }: { readonly kind: MasterDataKind }) {
  const config = masterDataModules[kind];
  const records = await listMasterData(kind);
  const shellSession = createMockShellSession();
  const createAction = (
    <GuardedPrimaryAction
      href={`${config.route}/new`}
      label={`New ${singularLabel(config.title)}`}
      requiredPermission={config.createPermission}
      shellSession={shellSession}
    />
  );

  return (
    <TenantAppShell
      currentModule={moduleToAppModule[kind]}
      primaryAction={createAction}
      shellSession={shellSession}
    >
      <PageHeader title={config.title} description={config.description} action={createAction} />
      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="text-sm font-semibold" htmlFor={`${kind}-search`}>
            Search
          </label>
          <input
            id={`${kind}-search`}
            className="min-h-11 rounded-xl border border-input bg-background px-3 text-sm"
            placeholder="Search is wired when the API client is ready"
            type="search"
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Adapter target: <span className="font-mono">{config.apiRoute}</span>
        </p>
      </Card>

      {records.length === 0 ? (
        <EmptyState
          title={`No ${config.title.toLowerCase()} yet`}
          message="This scaffold uses an isolated typed adapter until the corresponding API client contract is ready."
          action={createAction}
        />
      ) : (
        <div className="grid gap-3">
          {records.map((record) => (
            <MasterDataRecordCard
              key={record.id}
              record={record}
              href={`${config.route}/${record.id}`}
            />
          ))}
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Required states</h2>
        <StandardStateGallery />
      </section>
    </TenantAppShell>
  );
}

export async function MasterDataDetailScreen({
  kind,
  id,
}: {
  readonly kind: MasterDataKind;
  readonly id: string;
}) {
  const config = masterDataModules[kind];
  const record = await getMasterDataRecord(kind, id);
  const shellSession = createMockShellSession();

  if (record === null) {
    notFound();
  }

  return (
    <TenantAppShell currentModule={moduleToAppModule[kind]} shellSession={shellSession}>
      <PageHeader
        title={record.title}
        description={`${config.title} detail shell. Backend authorization and validation remain authoritative.`}
        action={
          <ButtonLink href={`${config.route}/${record.id}/edit`} variant="secondary">
            Edit
          </ButtonLink>
        }
      />
      <Card className="space-y-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">{record.subtitle}</p>
            {record.branch !== undefined ? (
              <p className="mt-1 text-xs text-muted-foreground">Branch: {record.branch}</p>
            ) : null}
          </div>
          <StatusBadge status={record.status} />
        </div>
        <dl className="grid gap-3 sm:grid-cols-2">
          {record.fields.map((field) => (
            <div key={field.name} className="rounded-xl border border-border p-3">
              <dt className="text-xs font-semibold uppercase text-muted-foreground">
                {field.label}
              </dt>
              <dd className="mt-1 text-sm">{field.value}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <BlockedState
        title="Audit and workflow actions"
        message="Deactivation, reactivation, invitation expiration, revocation, role impact, and similar commands must be wired to documented action endpoints before they are interactive."
      />
    </TenantAppShell>
  );
}

export function MasterDataFormScreen({
  kind,
  mode,
  id,
}: {
  readonly kind: MasterDataKind;
  readonly mode: 'create' | 'edit';
  readonly id?: string;
}) {
  const config = masterDataModules[kind];
  const shellSession = createMockShellSession();
  const title =
    mode === 'create'
      ? `New ${singularLabel(config.title)}`
      : `Edit ${singularLabel(config.title)}`;

  return (
    <TenantAppShell currentModule={moduleToAppModule[kind]} shellSession={shellSession}>
      <PageHeader
        title={title}
        description="Form layout scaffold with validation, conflict, offline, tenant lifecycle, permission, branch, and plan blocked states reserved for API wiring."
      />
      <Card className="space-y-4 p-4">
        {id !== undefined ? (
          <p className="text-xs text-muted-foreground">
            Record: <span className="font-mono">{id}</span>
          </p>
        ) : null}
        <div className="grid gap-3">
          <label className="grid gap-1 text-sm font-semibold">
            Name
            <input
              className="min-h-11 rounded-xl border border-input bg-background px-3 text-sm"
              placeholder="Documented field placeholder"
            />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Notes
            <textarea
              className="min-h-28 rounded-xl border border-input bg-background px-3 py-2 text-sm"
              placeholder="Optional, only when supported by the API contract"
            />
          </label>
        </div>
      </Card>
      <Card className="sticky bottom-20 z-10 flex flex-col gap-2 p-3 md:bottom-4 sm:flex-row sm:justify-end">
        <ButtonLink href={config.route} variant="secondary">
          Cancel
        </ButtonLink>
        <button
          type="button"
          className="min-h-11 rounded-xl border border-border bg-secondary px-4 text-sm font-semibold text-muted-foreground"
          disabled
          title="Submit is disabled until the API client contract is wired."
        >
          Save disabled
        </button>
      </Card>
      <StandardStateGallery />
    </TenantAppShell>
  );
}

export function DashboardScreen() {
  return (
    <TenantAppShell currentModule="dashboard">
      <PageHeader
        title="Dashboard"
        description="Authenticated tenant landing shell. Later operational modules stay out of this frontend slice."
      />
      <LoadingState label="Dashboard API wiring pending" />
      <BlockedState
        title="Milestone scope guard"
        message="Job Orders, Inventory, Invoices, Payments, Reports, Files, and later milestone screens are intentionally not implemented in this slice."
      />
    </TenantAppShell>
  );
}

function MasterDataRecordCard({
  record,
  href,
}: {
  readonly record: MasterDataRecord;
  readonly href: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold">{record.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{record.subtitle}</p>
          {record.branch !== undefined ? (
            <p className="mt-1 text-xs text-muted-foreground">Branch: {record.branch}</p>
          ) : null}
        </div>
        <StatusBadge status={record.status} />
      </div>
      <div className="mt-4 flex justify-end">
        <ButtonLink href={href} variant="secondary" size="sm">
          Open
        </ButtonLink>
      </div>
    </Card>
  );
}

function StatusBadge({ status }: { readonly status: MasterDataRecord['status'] }) {
  const className =
    status === 'active'
      ? 'border-success bg-success/10 text-foreground'
      : status === 'pending'
        ? 'border-warning bg-warning/10 text-foreground'
        : status === 'soft_deleted'
          ? 'border-destructive bg-destructive/10 text-foreground'
          : 'border-border bg-secondary text-secondary-foreground';

  return <Badge className={className}>{status.replace('_', ' ')}</Badge>;
}

function singularLabel(title: string): string {
  if (title === 'Branches') {
    return 'Branch';
  }

  if (title === 'Employees') {
    return 'Employee';
  }

  if (title === 'Roles') {
    return 'Role';
  }

  if (title === 'Customers') {
    return 'Customer';
  }

  if (title === 'Customer Tags') {
    return 'Customer Tag';
  }

  return title;
}
