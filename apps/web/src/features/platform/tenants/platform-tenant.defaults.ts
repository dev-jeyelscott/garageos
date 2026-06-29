import type {
  PlatformSupportAccessEndForm,
  PlatformSupportAccessForm,
  PlatformTenantCreateForm,
  PlatformTenantDeletionJobForm,
  PlatformTenantExportForm,
  PlatformTenantListFilters,
  PlatformTenantReadOnlyOverrideForm,
  PlatformTenantStatusFilter,
  PlatformTenantSubscriptionForm,
  PlatformTenantSuspensionForm,
} from './platform-tenant.types';

export const platformTenantListPageSize = 50;

export const defaultPlatformTenantListFilters: PlatformTenantListFilters = {
  q: '',
  status: 'all',
};

export const defaultPlatformTenantCreateForm: PlatformTenantCreateForm = {
  business_name: '',
  shop_email: '',
  plan_id: '',
  subscription_start_date: '',
  subscription_expiration_date: '',
  owner_full_name: '',
  owner_email: '',
  approve_duplicate: false,
  duplicate_approval_reason: '',
};

export const defaultPlatformTenantSubscriptionForm: PlatformTenantSubscriptionForm = {
  plan_id: '',
  subscription_start_date: '',
  subscription_expiration_date: '',
  reason: '',
};

export const defaultPlatformTenantReadOnlyOverrideForm: PlatformTenantReadOnlyOverrideForm = {
  reason: '',
  expires_at: '',
};

export const defaultPlatformTenantSuspensionForm: PlatformTenantSuspensionForm = {
  reason: '',
  expires_at: '',
};

export const defaultPlatformSupportAccessForm: PlatformSupportAccessForm = {
  mode: 'read_only',
  reason: '',
  expires_at: '',
};

export const defaultPlatformSupportAccessEndForm: PlatformSupportAccessEndForm = {
  reason: '',
};

export const defaultPlatformTenantExportForm: PlatformTenantExportForm = {
  reason: '',
  include_attachments: false,
};

export const defaultPlatformTenantDeletionJobForm: PlatformTenantDeletionJobForm = {
  reason: '',
  confirmation: '',
};

export const tenantStatusFilterOptions: readonly {
  readonly value: PlatformTenantStatusFilter;
  readonly label: string;
}[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'pending_setup', label: 'Pending setup' },
  { value: 'active', label: 'Active' },
  { value: 'grace_period', label: 'Grace period' },
  { value: 'read_only', label: 'Read-only' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'pending_deletion', label: 'Pending deletion' },
  { value: 'deleted', label: 'Deleted' },
];
