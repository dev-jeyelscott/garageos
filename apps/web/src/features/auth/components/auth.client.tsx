'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { Button, ButtonLink } from '../../../components/ui';
import {
  confirmEmailVerification,
  resendEmailVerification,
} from '../actions/email-verification.action';
import { login } from '../actions/login.action';
import { logout, logoutAll } from '../actions/logout.action';
import { signupOwner } from '../actions/owner-signup.action';
import { changePassword, forgotPassword, resetPassword } from '../actions/password.action';
import { getCurrentSession } from '../queries/get-current-session.query';
import { resolveAuthenticatedRedirect } from '../utils/resolve-auth-redirect';
import type { ActionState } from '../types/auth-action-state';
import { initialActionState } from '../types/auth-action-state';
import type { AuthSessionResponseData } from '../types/auth-session';
import { AuthPageShell, styles } from './auth.base';
import {
  AuthLink,
  InfoPanel,
  InputField,
  PasswordPolicy,
  PrimaryButton,
  getFormValue,
} from './auth-form-fields.base';
import { StatusMessage, toErrorState } from './auth-status.base';

export function LoginScreen() {
  const router = useRouter();
  const [state, setState] = useState<ActionState>(initialActionState);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    setState({
      ...initialActionState,
      status: 'submitting',
      message: 'Logging in...',
    });

    try {
      const loginResult = await login({
        email: getFormValue(formData, 'email'),
        password: getFormValue(formData, 'password'),
        remember_me: formData.get('remember_me') === 'on',
      });

      if (!loginResult.user.email_verified) {
        setState({
          ...initialActionState,
          status: 'success',
          message: 'Login successful. Please verify your email before operational access.',
        });

        router.push('/auth/email-verification');
        return;
      }

      const session = await getCurrentSession();
      const redirectTo = resolveAuthenticatedRedirect(session);

      setState({
        ...initialActionState,
        status: 'success',
        message: 'Login successful. Loading your workspace...',
      });

      router.push(redirectTo);
    } catch (error) {
      setState(toErrorState(error, 'Login failed.'));
    }
  }

  return (
    <AuthPageShell
      title="Login"
      description="Access GarageOS with your verified user account."
      secondaryActions={
        <>
          <AuthLink href="/auth/password/forgot">Forgot password</AuthLink>
          <AuthLink href="/auth/signup-owner">Create shop owner account</AuthLink>
        </>
      }
    >
      <form onSubmit={handleSubmit} className={styles.form}>
        <InputField label="Email" name="email" type="email" autoComplete="email" required />
        <InputField
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />

        <label className={styles.checkboxLabel}>
          <input name="remember_me" type="checkbox" />
          Remember me on this device
        </label>

        <PrimaryButton disabled={state.status === 'submitting'}>Login</PrimaryButton>
      </form>

      <StatusMessage state={state} />
    </AuthPageShell>
  );
}

export function OwnerSignupScreen() {
  const router = useRouter();
  const [state, setState] = useState<ActionState>(initialActionState);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    setState({
      ...initialActionState,
      status: 'submitting',
      message: 'Submitting owner signup...',
    });

    try {
      const result = await signupOwner({
        business_name: getFormValue(formData, 'business_name'),
        shop_email: getFormValue(formData, 'shop_email'),
        owner: {
          full_name: getFormValue(formData, 'owner_full_name'),
          email: getFormValue(formData, 'owner_email'),
          password: getFormValue(formData, 'password'),
        },
      });

      setState({
        ...initialActionState,
        status: 'success',
        message:
          result.message ??
          'Signup submitted. Verify the owner email before accessing operational screens.',
      });

      router.push('/auth/email-verification');
    } catch (error) {
      setState(toErrorState(error, 'Owner signup failed.'));
    }
  }

  return (
    <AuthPageShell
      title="Owner Signup"
      description="Create a pending-setup tenant and owner account, then verify email before operational access."
      secondaryActions={<AuthLink href="/auth/login">Already have an account?</AuthLink>}
    >
      <InfoPanel title="Source-aligned signup note">
        <p className={styles.paragraph}>
          Owner signup may be blocked until the platform default plan and default subscription
          duration are configured.
        </p>
      </InfoPanel>

      <form onSubmit={handleSubmit} className={styles.form}>
        <InputField label="Business name" name="business_name" type="text" required />
        <InputField label="Shop email" name="shop_email" type="email" required />
        <InputField label="Owner full name" name="owner_full_name" type="text" required />
        <InputField label="Owner email" name="owner_email" type="email" required />
        <InputField
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
        />
        <PasswordPolicy />

        <PrimaryButton disabled={state.status === 'submitting'}>Submit signup</PrimaryButton>
      </form>

      <StatusMessage state={state} />
    </AuthPageShell>
  );
}

export function EmailVerificationRequiredScreen() {
  const [state, setState] = useState<ActionState>(initialActionState);

  async function handleResend() {
    setState({
      ...initialActionState,
      status: 'submitting',
      message: 'Sending verification email...',
    });

    try {
      const result = await resendEmailVerification();

      setState({
        ...initialActionState,
        status: 'success',
        message: result.message ?? 'Verification email sent.',
      });
    } catch (error) {
      setState(toErrorState(error, 'Unable to resend verification email.'));
    }
  }

  async function handleLogout() {
    setState({
      ...initialActionState,
      status: 'submitting',
      message: 'Logging out...',
    });

    try {
      await logout();

      setState({
        ...initialActionState,
        status: 'success',
        message: 'Logged out.',
      });
    } catch (error) {
      setState(toErrorState(error, 'Unable to log out.'));
    }
  }

  return (
    <AuthPageShell
      title="Email Verification Required"
      description="Verify your email before using GarageOS operational screens."
      secondaryActions={<AuthLink href="/auth/login">Back to login</AuthLink>}
    >
      <InfoPanel title="Access limited">
        <p className={styles.paragraph}>
          Before verification, only verification actions and logout are available.
        </p>
      </InfoPanel>

      <div className={styles.buttonRow}>
        <Button type="button" onClick={handleResend}>
          Resend verification email
        </Button>
        <Button type="button" variant="secondary" onClick={handleLogout}>
          Logout
        </Button>
      </div>

      <StatusMessage state={state} />
    </AuthPageShell>
  );
}

export function EmailVerificationConfirmScreen() {
  const searchParams = useSearchParams();
  const [state, setState] = useState<ActionState>(initialActionState);
  const token = searchParams.get('token') ?? '';

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    setState({
      ...initialActionState,
      status: 'submitting',
      message: 'Confirming email verification...',
    });

    try {
      const result = await confirmEmailVerification({
        token: getFormValue(formData, 'token'),
      });

      setState({
        ...initialActionState,
        status: 'success',
        message: result.message ?? 'Email verified. You may continue to login.',
      });
    } catch (error) {
      setState(toErrorState(error, 'Email verification failed.'));
    }
  }

  return (
    <AuthPageShell
      title="Email Verification Result"
      description="Confirm a single-use email verification token."
      secondaryActions={<AuthLink href="/auth/login">Continue to login</AuthLink>}
    >
      <form onSubmit={handleSubmit} className={styles.form}>
        <InputField
          label="Verification token"
          name="token"
          type="text"
          defaultValue={token}
          required
        />
        <PrimaryButton disabled={state.status === 'submitting'}>Confirm email</PrimaryButton>
      </form>

      <StatusMessage state={state} />
    </AuthPageShell>
  );
}

export function ForgotPasswordScreen() {
  const [state, setState] = useState<ActionState>(initialActionState);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    setState({
      ...initialActionState,
      status: 'submitting',
      message: 'Submitting password reset request...',
    });

    try {
      const result = await forgotPassword({
        email: getFormValue(formData, 'email'),
      });

      setState({
        ...initialActionState,
        status: 'success',
        message:
          result.message ?? 'If the account exists and is eligible, a reset link will be sent.',
      });
    } catch (error) {
      setState(toErrorState(error, 'Password reset request failed.'));
    }
  }

  return (
    <AuthPageShell
      title="Forgot Password"
      description="Request a rate-limited password reset link."
      secondaryActions={<AuthLink href="/auth/login">Back to login</AuthLink>}
    >
      <form onSubmit={handleSubmit} className={styles.form}>
        <InputField label="Email" name="email" type="email" autoComplete="email" required />
        <PrimaryButton disabled={state.status === 'submitting'}>Send reset link</PrimaryButton>
      </form>

      <StatusMessage state={state} />
    </AuthPageShell>
  );
}

export function ResetPasswordScreen() {
  const searchParams = useSearchParams();
  const [state, setState] = useState<ActionState>(initialActionState);
  const token = searchParams.get('token') ?? '';

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    setState({
      ...initialActionState,
      status: 'submitting',
      message: 'Resetting password...',
    });

    try {
      const result = await resetPassword({
        token: getFormValue(formData, 'token'),
        new_password: getFormValue(formData, 'new_password'),
      });

      setState({
        ...initialActionState,
        status: 'success',
        message: result.message ?? 'Password reset. You may now log in.',
      });
    } catch (error) {
      setState(toErrorState(error, 'Password reset failed.'));
    }
  }

  return (
    <AuthPageShell
      title="Reset Password"
      description="Use a single-use password reset token before it expires."
      secondaryActions={<AuthLink href="/auth/login">Back to login</AuthLink>}
    >
      <form onSubmit={handleSubmit} className={styles.form}>
        <InputField label="Reset token" name="token" type="text" defaultValue={token} required />
        <InputField
          label="New password"
          name="new_password"
          type="password"
          autoComplete="new-password"
          required
        />
        <PasswordPolicy />
        <PrimaryButton disabled={state.status === 'submitting'}>Reset password</PrimaryButton>
      </form>

      <StatusMessage state={state} />
    </AuthPageShell>
  );
}

export function ChangePasswordScreen() {
  const [state, setState] = useState<ActionState>(initialActionState);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    setState({
      ...initialActionState,
      status: 'submitting',
      message: 'Changing password...',
    });

    try {
      const result = await changePassword({
        current_password: getFormValue(formData, 'current_password'),
        new_password: getFormValue(formData, 'new_password'),
      });

      setState({
        ...initialActionState,
        status: 'success',
        message:
          result.message ??
          'Password changed. Active session tokens were cleared; please log in again.',
      });
    } catch (error) {
      setState(toErrorState(error, 'Password change failed.'));
    }
  }

  return (
    <AuthPageShell
      title="Change Password"
      description="Change your password while authenticated."
      secondaryActions={
        <>
          <AuthLink href="/">Home</AuthLink>
          <AuthLink href="/auth/login">Login</AuthLink>
        </>
      }
    >
      <form onSubmit={handleSubmit} className={styles.form}>
        <InputField
          label="Current password"
          name="current_password"
          type="password"
          autoComplete="current-password"
          required
        />
        <InputField
          label="New password"
          name="new_password"
          type="password"
          autoComplete="new-password"
          required
        />
        <PasswordPolicy />
        <PrimaryButton disabled={state.status === 'submitting'}>Change password</PrimaryButton>
      </form>

      <StatusMessage state={state} />
    </AuthPageShell>
  );
}

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
          <p className={styles.paragraph}>
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
      <div className={styles.buttonRow}>
        <Button type="button" onClick={handleLogoutCurrentDevice}>
          Logout current device
        </Button>
        <Button type="button" variant="secondary" onClick={handleLogoutAllDevices}>
          Logout all devices
        </Button>
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
    <section className={styles.sessionGrid}>
      <InfoPanel title="User">
        <KeyValue label="Name" value={session.user.full_name} />
        <KeyValue label="Email" value={session.user.email} />
        <KeyValue label="Type" value={session.user.user_type} />
        <KeyValue label="Status" value={session.user.status} />
        <KeyValue label="Email verified" value={session.user.email_verified ? 'Yes' : 'No'} />
      </InfoPanel>

      <InfoPanel title="Tenant">
        {session.tenant === null ? (
          <p className={styles.paragraph}>Platform admin session without tenant context.</p>
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
          <ul className={styles.detailList}>
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
          <p className={styles.paragraph}>No branch assignments returned.</p>
        ) : (
          <ul className={styles.detailList}>
            {session.branches.map((branch) => (
              <li key={branch.id}>{branch.name}</li>
            ))}
          </ul>
        )}
      </InfoPanel>

      <InfoPanel title="Permissions">
        {session.effective_permissions.length === 0 ? (
          <p className={styles.paragraph}>No effective permissions returned.</p>
        ) : (
          <ul className={styles.permissionList}>
            {session.effective_permissions.slice(0, 16).map((permission) => (
              <li key={permission} className={styles.permissionBadge}>
                {permission}
              </li>
            ))}
          </ul>
        )}

        {session.effective_permissions.length > 16 ? (
          <p className={styles.paragraph}>
            Showing 16 of {session.effective_permissions.length} permissions.
          </p>
        ) : null}
      </InfoPanel>

      <div className={styles.buttonRow}>
        <Button type="button" onClick={() => void onRefresh()}>
          Refresh session
        </Button>
        <ButtonLink href="/auth/password/change" variant="secondary">
          Change password
        </ButtonLink>
        <ButtonLink href="/auth/logout" variant="secondary">
          Logout
        </ButtonLink>
      </div>
    </section>
  );
}

function KeyValue({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className={styles.keyValue}>
      <span className={styles.key}>{label}</span>
      <span className={styles.value}>{value}</span>
    </div>
  );
}

function formatNullableNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? 'N/A' : String(value);
}
