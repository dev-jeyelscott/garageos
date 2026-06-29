export type TenantPlannedRouteKey =
  | 'job-orders'
  | 'customers'
  | 'inventory-stock-balances'
  | 'more';

export interface TenantPlannedRouteConfig {
  readonly title: string;
  readonly eyebrow: string;
  readonly description: string;
  readonly routePath: string;
  readonly primaryPermission: string | null;
  readonly primaryPermissionLabel: string;
  readonly plannedWorkflows: readonly string[];
  readonly guardrails: readonly string[];
}

export interface TenantMoreMenuItem {
  readonly title: string;
  readonly group: string;
  readonly description: string;
  readonly routePath: string;
  readonly routeExists: boolean;
  readonly requiredPermissions: readonly string[];
  readonly plannedScope: readonly string[];
}
