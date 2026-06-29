import type { AuthSessionResponseData } from '../../auth/types/auth-session';

export type ProtectedRouteKind =
  | 'platform'
  | 'tenant-dashboard'
  | 'tenant-operational'
  | 'tenant-onboarding'
  | 'tenant-status';

export type SessionLoadState =
  | {
      readonly status: 'loading';
    }
  | {
      readonly status: 'ready';
      readonly session: AuthSessionResponseData;
    }
  | {
      readonly status: 'error';
      readonly message: string;
      readonly detail: string | null;
    };

export interface ShellNavItem {
  readonly label: string;
  readonly href?: string;
  readonly disabledReason?: string;
}
