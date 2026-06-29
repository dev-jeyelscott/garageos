export interface PlatformAuditLogListFilters {
  readonly platform_admin_user_id: string;
  readonly action: string;
  readonly tenant_id: string;
  readonly from: string;
  readonly to: string;
}

export interface PlatformAuditLogListItem {
  readonly id: string;
  readonly platform_admin_user_id: string | null;
  readonly tenant_id: string | null;
  readonly action: string;
  readonly entity_type: string;
  readonly entity_id: string | null;
  readonly metadata_json: Record<string, unknown> | null;
  readonly ip_address: string | null;
  readonly user_agent: string | null;
  readonly created_at: string;
}

export interface PlatformAuditLogListPagination {
  readonly limit: number;
  readonly next_cursor: string | null;
  readonly has_more: boolean;
}

export interface PlatformAuditLogListResult {
  readonly audit_logs: readonly PlatformAuditLogListItem[];
  readonly pagination: PlatformAuditLogListPagination | null;
}

export interface PlatformAuditLogListState {
  readonly status: 'idle' | 'loading' | 'loaded' | 'loading_more' | 'error';
  readonly auditLogs: readonly PlatformAuditLogListItem[];
  readonly pagination: PlatformAuditLogListPagination | null;
  readonly message?: string;
  readonly detail?: string | null;
  readonly code?: string | null;
}
