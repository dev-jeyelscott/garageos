import { Alert } from '../../../components/ui';
import type { AuthTenantStatus } from '../types/app-shell-session';

const limitedTenantStatusCopy: Partial<
  Record<AuthTenantStatus, { readonly title: string; readonly message: string }>
> = {
  pending_setup: {
    title: 'Setup required',
    message: 'Operational modules stay blocked until onboarding is complete.',
  },
  grace_period: {
    title: 'Grace period',
    message: 'Renewal is due. Operational access still follows permissions and branch scope.',
  },
  read_only: {
    title: 'Read-only tenant',
    message:
      'Operational writes, uploads, approvals, payments, and settings changes are blocked except documented renewal or export actions.',
  },
  suspended: {
    title: 'Tenant suspended',
    message: 'Operational access is blocked except documented owner renewal or export paths.',
  },
  pending_deletion: {
    title: 'Pending deletion',
    message: 'Tenant operational access is blocked.',
  },
  deleted: {
    title: 'Tenant unavailable',
    message: 'This tenant is no longer available.',
  },
};

export function TenantStatusBanner({ status }: { readonly status: AuthTenantStatus | undefined }) {
  if (status === undefined || status === 'active') {
    return null;
  }

  const copy = limitedTenantStatusCopy[status];

  if (copy === undefined) {
    return null;
  }

  return (
    <Alert variant={status === 'grace_period' ? 'default' : 'destructive'} role="status">
      <p className="font-semibold">{copy.title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{copy.message}</p>
    </Alert>
  );
}
