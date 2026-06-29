import type { AuthTenantStatus } from '../../auth/types/auth-session';

export type PlatformSubscriptionStatusSource = 'system_computed' | 'platform_override';

export type PlatformSupportAccessMode = 'read_only' | 'write_allowed';

export type PlatformTenantStatusFilter = 'all' | AuthTenantStatus;

export interface PlatformTenantPlanSummary {
  readonly id?: string | null;
  readonly code?: string | null;
  readonly name?: string | null;
}

export interface PlatformTenantSubscriptionSummary {
  readonly plan_id?: string | null;
  readonly plan_code?: string | null;
  readonly plan_name?: string | null;
  readonly start_date?: string | null;
  readonly expiration_date?: string | null;
  readonly status_source?: PlatformSubscriptionStatusSource | string | null;
  readonly last_renewal_at?: string | null;
  readonly updated_by_platform_admin_user_id?: string | null;
  readonly updated_at?: string | null;
}

export interface PlatformTenantListItem {
  readonly id: string;
  readonly business_name: string;
  readonly shop_email?: string | null;
  readonly status: AuthTenantStatus;
  readonly timezone?: string | null;
  readonly country?: string | null;
  readonly currency?: string | null;
  readonly onboarding_completed_at?: string | null;
  readonly plan?: PlatformTenantPlanSummary | null;
  readonly subscription?: PlatformTenantSubscriptionSummary | null;
}

export interface PlatformTenantDetail {
  readonly id: string;
  readonly business_name: string;
  readonly shop_email?: string | null;
  readonly status: AuthTenantStatus;
  readonly timezone?: string | null;
  readonly country?: string | null;
  readonly currency?: string | null;
  readonly onboarding_completed_at?: string | null;
  readonly deletion_scheduled_for?: string | null;
  readonly deleted_at?: string | null;
  readonly created_at?: string | null;
  readonly updated_at?: string | null;
  readonly plan?: PlatformTenantPlanSummary | null;
  readonly subscription?: PlatformTenantSubscriptionSummary | null;
}

export type PlatformTenantDetailState =
  | {
      readonly status: 'idle' | 'loading';
    }
  | {
      readonly status: 'loaded';
      readonly tenant: PlatformTenantDetail;
    }
  | {
      readonly status: 'error';
      readonly message: string;
      readonly detail: string | null;
      readonly code: string | null;
    };

export interface PlatformTenantSubscriptionForm {
  readonly plan_id: string;
  readonly subscription_start_date: string;
  readonly subscription_expiration_date: string;
  readonly reason: string;
}

export interface UpdatePlatformTenantSubscriptionResponse {
  readonly subscription: PlatformTenantSubscriptionSummary;
}

export type PlatformTenantSubscriptionSubmitState =
  | {
      readonly status: 'idle';
    }
  | {
      readonly status: 'submitting';
    }
  | {
      readonly status: 'success';
      readonly message: string;
    }
  | {
      readonly status: 'error';
      readonly message: string;
      readonly detail: string | null;
      readonly code: string | null;
      readonly fieldErrors: Record<string, string>;
    };

export interface PlatformTenantReadOnlyOverrideForm {
  readonly reason: string;
  readonly expires_at: string;
}

export interface PlatformTenantSuspensionForm {
  readonly reason: string;
  readonly expires_at: string;
}

export interface PlatformSupportAccessForm {
  readonly mode: PlatformSupportAccessMode;
  readonly reason: string;
  readonly expires_at: string;
}

export interface PlatformSupportAccessEndForm {
  readonly reason: string;
}

export type PlatformTenantReadOnlyOverrideSubmitState =
  | {
      readonly status: 'idle';
    }
  | {
      readonly status: 'submitting';
    }
  | {
      readonly status: 'success';
      readonly message: string;
    }
  | {
      readonly status: 'error';
      readonly message: string;
      readonly detail: string | null;
      readonly code: string | null;
      readonly fieldErrors: Record<string, string>;
    };

export type PlatformTenantSuspensionSubmitState =
  | {
      readonly status: 'idle';
    }
  | {
      readonly status: 'submitting';
    }
  | {
      readonly status: 'success';
      readonly message: string;
    }
  | {
      readonly status: 'error';
      readonly message: string;
      readonly detail: string | null;
      readonly code: string | null;
      readonly fieldErrors: Record<string, string>;
    };

export type PlatformSupportAccessSubmitState =
  | {
      readonly status: 'idle';
    }
  | {
      readonly status: 'submitting';
    }
  | {
      readonly status: 'success';
      readonly message: string;
      readonly session: PlatformSupportAccessSessionSummary;
    }
  | {
      readonly status: 'error';
      readonly message: string;
      readonly detail: string | null;
      readonly code: string | null;
      readonly fieldErrors: Record<string, string>;
    };

export type PlatformSupportAccessEndSubmitState =
  | {
      readonly status: 'idle';
    }
  | {
      readonly status: 'submitting';
    }
  | {
      readonly status: 'success';
      readonly message: string;
      readonly session: PlatformSupportAccessSessionSummary;
    }
  | {
      readonly status: 'error';
      readonly message: string;
      readonly detail: string | null;
      readonly code: string | null;
      readonly fieldErrors: Record<string, string>;
    };

export interface PlatformSupportAccessSessionSummary {
  readonly id: string;
  readonly tenant_id: string;
  readonly platform_admin_user_id: string;
  readonly mode: PlatformSupportAccessMode | string;
  readonly reason: string;
  readonly started_at: string;
  readonly expires_at: string;
  readonly ended_at: string | null;
}

export interface ApplyPlatformTenantReadOnlyOverrideResponse {
  readonly tenant?: PlatformTenantDetail;
}

export interface ApplyPlatformTenantSuspensionResponse {
  readonly tenant?: PlatformTenantDetail;
}

export interface StartPlatformSupportAccessSessionResponse {
  readonly support_access_session: PlatformSupportAccessSessionSummary;
}

export interface EndPlatformSupportAccessSessionResponse {
  readonly support_access_session: PlatformSupportAccessSessionSummary;
}

export interface PlatformTenantExportForm {
  readonly reason: string;
  readonly include_attachments: boolean;
}

export interface PlatformTenantDeletionJobForm {
  readonly reason: string;
  readonly confirmation: string;
}

export interface PlatformTenantDeletionJobSummary {
  readonly id: string;
  readonly tenant_id: string;
  readonly scheduled_for: string;
  readonly status: string;
  readonly created_at: string;
}

export interface QueuePlatformTenantDeletionJobResponse {
  readonly deletion_job: PlatformTenantDeletionJobSummary;
}

export type PlatformTenantDeletionJobSubmitState =
  | {
      readonly status: 'idle';
    }
  | {
      readonly status: 'submitting';
    }
  | {
      readonly status: 'success';
      readonly message: string;
      readonly job: PlatformTenantDeletionJobSummary;
    }
  | {
      readonly status: 'error';
      readonly message: string;
      readonly detail: string | null;
      readonly code: string | null;
      readonly fieldErrors: Record<string, string>;
    };

export interface PlatformTenantExportJobSummary {
  readonly id: string;
  readonly tenant_id: string;
  readonly job_type: string;
  readonly status: string;
  readonly requested_at: string;
  readonly run_after: string;
  readonly include_attachments: boolean;
}

export interface QueuePlatformTenantExportResponse {
  readonly export_job: PlatformTenantExportJobSummary;
}

export type PlatformTenantExportSubmitState =
  | {
      readonly status: 'idle';
    }
  | {
      readonly status: 'submitting';
    }
  | {
      readonly status: 'success';
      readonly message: string;
      readonly job: PlatformTenantExportJobSummary;
    }
  | {
      readonly status: 'error';
      readonly message: string;
      readonly detail: string | null;
      readonly code: string | null;
      readonly fieldErrors: Record<string, string>;
    };

export interface PlatformTenantCreateForm {
  readonly business_name: string;
  readonly shop_email: string;
  readonly plan_id: string;
  readonly subscription_start_date: string;
  readonly subscription_expiration_date: string;
  readonly owner_full_name: string;
  readonly owner_email: string;
  readonly approve_duplicate: boolean;
  readonly duplicate_approval_reason: string;
}

export interface CreatePlatformTenantResponse {
  readonly tenant: {
    readonly id: string;
    readonly business_name: string;
    readonly status: 'pending_setup';
  };
  readonly subscription: PlatformTenantSubscriptionSummary;
  readonly owner_invitation_sent: boolean;
}

export type PlatformTenantCreateSubmitState =
  | {
      readonly status: 'idle';
    }
  | {
      readonly status: 'submitting';
    }
  | {
      readonly status: 'error';
      readonly message: string;
      readonly detail: string | null;
      readonly code: string | null;
      readonly fieldErrors: Record<string, string>;
    };

export interface PlatformTenantListFilters {
  readonly q: string;
  readonly status: PlatformTenantStatusFilter;
}

export interface PlatformTenantListPagination {
  readonly limit: number;
  readonly next_cursor: string | null;
  readonly has_more: boolean;
}

export interface PlatformTenantListResult {
  readonly tenants: readonly PlatformTenantListItem[];
  readonly pagination: PlatformTenantListPagination | null;
}

export interface PlatformTenantListState {
  readonly status: 'idle' | 'loading' | 'loaded' | 'loading_more' | 'error';
  readonly tenants: readonly PlatformTenantListItem[];
  readonly pagination: PlatformTenantListPagination | null;
  readonly message?: string;
  readonly detail?: string | null;
  readonly code?: string | null;
}
