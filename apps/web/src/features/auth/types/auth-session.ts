export type AuthUserType = 'tenant_user' | 'platform_admin';

export type AuthUserStatus = 'active' | 'inactive';

export type AuthTenantStatus =
  | 'pending_setup'
  | 'active'
  | 'grace_period'
  | 'read_only'
  | 'suspended'
  | 'pending_deletion'
  | 'deleted';

export type AuthPlanCode = 'basic' | 'mid' | 'high';

export interface AuthUserSummary {
  readonly id: string;
  readonly user_type: AuthUserType;
  readonly full_name: string;
  readonly email: string;
  readonly email_verified: boolean;
  readonly status: AuthUserStatus;
}

export interface AuthTenantSummary {
  readonly id: string;
  readonly business_name: string;
  readonly status: AuthTenantStatus;
  readonly timezone: string;
  readonly country: string;
  readonly currency: string;
}

export interface AuthBranchSummary {
  readonly id: string;
  readonly name: string;
}

export interface AuthEffectivePlanLimits {
  readonly max_active_branches: number;
  readonly customer_email_reminders: boolean;
  readonly customer_sms_reminders: boolean;
  readonly [capabilityCode: string]: boolean | number | string | null;
}

export interface AuthEffectivePlanSummary {
  readonly code: AuthPlanCode;
  readonly name: string;
  readonly limits: AuthEffectivePlanLimits;
}

export interface AuthSubscriptionWarning {
  readonly code: string;
  readonly message: string;
}

export interface AuthSubscriptionSummary {
  readonly status: AuthTenantStatus;
  readonly expiration_date: string | null;
  readonly days_until_expiration: number | null;
  readonly renewal_required: boolean;
  readonly warnings?: readonly AuthSubscriptionWarning[];
}

export interface AuthSessionAccessSummary {
  readonly can_access_operational_modules: boolean;
  readonly read_only: boolean;
}

export interface AuthLoginResponseData {
  readonly access_token: string;
  readonly expires_in_seconds: number;
  readonly user: AuthUserSummary;
  readonly tenant: AuthTenantSummary | null;
  readonly permissions: readonly string[];
  readonly branches: readonly AuthBranchSummary[];
  readonly tenant_wide_branch_access: boolean;
}

export interface AuthRefreshResponseData {
  readonly access_token: string;
  readonly expires_in_seconds: number;
}

export interface AuthActionResult {
  readonly success: boolean;
  readonly message?: string;
}

export interface AuthSessionResponseData {
  readonly user: AuthUserSummary;
  readonly tenant: AuthTenantSummary | null;
  readonly effective_permissions: readonly string[];
  readonly branches: readonly AuthBranchSummary[];
  readonly tenant_wide_branch_access: boolean;
  readonly effective_plan: AuthEffectivePlanSummary | null;
  readonly subscription: AuthSubscriptionSummary | null;
  readonly access: AuthSessionAccessSummary;
}
