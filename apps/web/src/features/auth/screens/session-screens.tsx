'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { getCurrentSession, logout, logoutAll } from '../../../lib/auth-api';
import type { AuthSessionResponseData } from '../../../lib/auth-session';
import { AuthPageShell, styles } from '../components/auth-page-shell';
import {
  AuthLink,
  InfoPanel,
  StatusMessage,
  initialActionState,
  toErrorState,
  type ActionState,
} from '../components/auth-form-controls';

export function HomeSessionScreen() {
  const [session, setSession] = useState<AuthSessionResponseData | null>(null);
  const [state, setState] = useState<ActionState>({
    ...initialActionState,
    status: 'submitting',
    message: 'Loading current session...',
  });

  const loadSession = useCallback(async () => {
    setState({
      ...initialActionState,
      status: 'submitting',
      message: 'Loading current session...',
    });

    try {
      const nextSession = await getCurrentSession();
      setSession(nextSession);
      setState({
        ...initialActionState,
        status: 'success',
        message: 'Current session loaded.',
      });
    } catch (error) {
      setSession(null);
      setState(toErrorState(error, 'Unable to load the current session.'));
    }
  }, []);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  return (
    <AuthPageShell
      title="GarageOS"
      description="Auth/session foundation for the mobile-first PWA."
      secondaryActions={
        <>
          <AuthLink href="/auth/login">Login</AuthLink>
          <AuthLink href="/auth/signup-owner">Owner signup</AuthLink>
          <AuthLink href="/auth/password/forgot">Forgot password</AuthLink>
        </>
      }
    >
      <StatusMessage state={state} />

      {session === null ? (
        <InfoPanel title="No active session">
          <p style={styles.paragraph}>
            Log in to load the current user, tenant, permissions, branches, plan, and subscription
            access flags from the GarageOS API.
          </p>
        </InfoPanel>
      ) : (
        <SessionSummary session={session} onRefresh={loadSession} />
      )}
    </AuthPageShell>
  );
}

export function LogoutScreen() {
  const router = useRouter();
  const [state, setState] = useState<ActionState>(initialActionState);

  async function handleLogoutCurrentDevice() {
    setState({
      ...initialActionState,
      status: 'submitting',
      message: 'Logging out current device...',
    });

    try {
      await logout();

      setState({
        ...initialActionState,
        status: 'success',
        message: 'Logged out from current device.',
      });

      router.push('/auth/login');
    } catch (error) {
      setState(toErrorState(error, 'Logout failed.'));
    }
  }

  async function handleLogoutAllDevices() {
    setState({
      ...initialActionState,
      status: 'submitting',
      message: 'Logging out all devices...',
    });

    try {
      await logoutAll();

      setState({
        ...initialActionState,
        status: 'success',
        message: 'Logged out from all devices.',
      });

      router.push('/auth/login');
    } catch (error) {
      setState(toErrorState(error, 'Logout all failed.'));
    }
  }

  return (
    <AuthPageShell
      title="Logout Confirmation"
      description="End your current GarageOS session or revoke all active sessions."
      secondaryActions={<AuthLink href="/">Cancel</AuthLink>}
    >
      <div style={styles.buttonRow}>
        <button type="button" onClick={handleLogoutCurrentDevice} style={styles.primaryButton}>
          Logout current device
        </button>
        <button type="button" onClick={handleLogoutAllDevices} style={styles.secondaryButton}>
          Logout all devices
        </button>
      </div>

      <StatusMessage state={state} />
    </AuthPageShell>
  );
}

function SessionSummary({
  session,
  onRefresh,
}: {
  readonly session: AuthSessionResponseData;
  readonly onRefresh: () => Promise<void>;
}) {
  const warnings = session.subscription?.warnings ?? [];

  return (
    <section style={styles.sessionGrid}>
      <InfoPanel title="User">
        <KeyValue label="Name" value={session.user.full_name} />
        <KeyValue label="Email" value={session.user.email} />
        <KeyValue label="Type" value={session.user.user_type} />
        <KeyValue label="Status" value={session.user.status} />
        <KeyValue label="Email verified" value={session.user.email_verified ? 'Yes' : 'No'} />
      </InfoPanel>

      <InfoPanel title="Tenant">
        {session.tenant === null ? (
          <p style={styles.paragraph}>Platform admin session without tenant context.</p>
        ) : (
          <>
            <KeyValue label="Business" value={session.tenant.business_name} />
            <KeyValue label="Status" value={session.tenant.status} />
            <KeyValue label="Timezone" value={session.tenant.timezone} />
            <KeyValue
              label="Country / Currency"
              value={`${session.tenant.country} / ${session.tenant.currency}`}
            />
          </>
        )}
      </InfoPanel>

      <InfoPanel title="Subscription Access">
        <KeyValue
          label="Operational modules"
          value={session.access.can_access_operational_modules ? 'Allowed' : 'Blocked'}
        />
        <KeyValue label="Read-only" value={session.access.read_only ? 'Yes' : 'No'} />
        <KeyValue label="Plan" value={session.effective_plan?.name ?? 'N/A'} />
        <KeyValue label="Expiration" value={session.subscription?.expiration_date ?? 'N/A'} />
        <KeyValue
          label="Days until expiration"
          value={formatNullableNumber(session.subscription?.days_until_expiration)}
        />

        {warnings.length === 0 ? null : (
          <ul style={styles.detailList}>
            {warnings.map((warning) => (
              <li key={warning.code}>
                <strong>{warning.code}:</strong> {warning.message}
              </li>
            ))}
          </ul>
        )}
      </InfoPanel>

      <InfoPanel title="Branch Access">
        <KeyValue
          label="Tenant-wide branch access"
          value={session.tenant_wide_branch_access ? 'Yes' : 'No'}
        />

        {session.branches.length === 0 ? (
          <p style={styles.paragraph}>No branch assignments returned.</p>
        ) : (
          <ul style={styles.detailList}>
            {session.branches.map((branch) => (
              <li key={branch.id}>{branch.name}</li>
            ))}
          </ul>
        )}
      </InfoPanel>

      <InfoPanel title="Permissions">
        {session.effective_permissions.length === 0 ? (
          <p style={styles.paragraph}>No effective permissions returned.</p>
        ) : (
          <ul style={styles.permissionList}>
            {session.effective_permissions.slice(0, 16).map((permission) => (
              <li key={permission} style={styles.permissionBadge}>
                {permission}
              </li>
            ))}
          </ul>
        )}

        {session.effective_permissions.length > 16 ? (
          <p style={styles.paragraph}>
            Showing 16 of {session.effective_permissions.length} permissions.
          </p>
        ) : null}
      </InfoPanel>

      <div style={styles.buttonRow}>
        <button type="button" onClick={() => void onRefresh()} style={styles.primaryButton}>
          Refresh session
        </button>
        <Link href="/auth/password/change" style={styles.secondaryButtonLink}>
          Change password
        </Link>
        <Link href="/auth/logout" style={styles.secondaryButtonLink}>
          Logout
        </Link>
      </div>
    </section>
  );
}

function KeyValue({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div style={styles.keyValue}>
      <span style={styles.key}>{label}</span>
      <span style={styles.value}>{value}</span>
    </div>
  );
}

function formatNullableNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? 'N/A' : String(value);
}
