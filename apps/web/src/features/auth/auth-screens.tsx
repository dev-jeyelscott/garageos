'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  type CSSProperties,
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from 'react';

import {
  changePassword,
  confirmEmailVerification,
  forgotPassword,
  getCurrentSession,
  login,
  logout,
  logoutAll,
  resendEmailVerification,
  resetPassword,
  signupOwner,
} from '../../lib/auth-api';
import { type ApiClientError, type ApiErrorDetail, isApiClientError } from '../../lib/api-envelope';
import type { AuthSessionResponseData } from '../../lib/auth-session';

type ActionStatus = 'idle' | 'submitting' | 'success' | 'error';

interface ActionState {
  readonly status: ActionStatus;
  readonly message: string;
  readonly error: ApiClientError | null;
}

const initialActionState: ActionState = {
  status: 'idle',
  message: '',
  error: null,
};

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
      const data = await login({
        email: getFormValue(formData, 'email'),
        password: getFormValue(formData, 'password'),
        remember_me: formData.get('remember_me') === 'on',
      });

      setState({
        ...initialActionState,
        status: 'success',
        message: data.user.email_verified
          ? 'Login successful. Loading your session...'
          : 'Login successful. Please verify your email before operational access.',
      });

      router.push(data.user.email_verified ? '/' : '/auth/email-verification');
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
      <form onSubmit={handleSubmit} style={styles.form}>
        <InputField label="Email" name="email" type="email" autoComplete="email" required />
        <InputField
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />

        <label style={styles.checkboxLabel}>
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
        <p style={styles.paragraph}>
          Owner signup may be blocked until the platform default plan and default subscription
          duration are configured.
        </p>
      </InfoPanel>

      <form onSubmit={handleSubmit} style={styles.form}>
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
        <p style={styles.paragraph}>
          Before verification, only verification actions and logout are available.
        </p>
      </InfoPanel>

      <div style={styles.buttonRow}>
        <button type="button" onClick={handleResend} style={styles.primaryButton}>
          Resend verification email
        </button>
        <button type="button" onClick={handleLogout} style={styles.secondaryButton}>
          Logout
        </button>
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
      <form onSubmit={handleSubmit} style={styles.form}>
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
      <form onSubmit={handleSubmit} style={styles.form}>
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
      <form onSubmit={handleSubmit} style={styles.form}>
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
          <AuthLink href="/">Current session</AuthLink>
          <AuthLink href="/auth/login">Login</AuthLink>
        </>
      }
    >
      <form onSubmit={handleSubmit} style={styles.form}>
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

function AuthPageShell({
  title,
  description,
  secondaryActions,
  children,
}: {
  readonly title: string;
  readonly description: string;
  readonly secondaryActions?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <div style={styles.header}>
          <p style={styles.kicker}>GarageOS</p>
          <h1 style={styles.title}>{title}</h1>
          <p style={styles.description}>{description}</p>
        </div>

        {children}

        {secondaryActions === undefined ? null : (
          <nav aria-label="Related auth actions" style={styles.linkRow}>
            {secondaryActions}
          </nav>
        )}
      </section>
    </main>
  );
}

function InputField({
  label,
  name,
  type,
  required = false,
  autoComplete,
  defaultValue,
}: {
  readonly label: string;
  readonly name: string;
  readonly type: string;
  readonly required?: boolean;
  readonly autoComplete?: string;
  readonly defaultValue?: string;
}) {
  return (
    <label style={styles.field}>
      <span style={styles.label}>{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        style={styles.input}
      />
    </label>
  );
}

function PasswordPolicy() {
  return (
    <div style={styles.helpPanel}>
      <p style={styles.helpTitle}>Password rules</p>
      <ul style={styles.helpList}>
        <li>At least 8 characters</li>
        <li>At least 1 uppercase letter</li>
        <li>At least 1 lowercase letter</li>
        <li>At least 1 number</li>
      </ul>
    </div>
  );
}

function PrimaryButton({
  disabled,
  children,
}: {
  readonly disabled: boolean;
  readonly children: ReactNode;
}) {
  return (
    <button type="submit" disabled={disabled} style={styles.primaryButton}>
      {children}
    </button>
  );
}

function AuthLink({ href, children }: { readonly href: string; readonly children: ReactNode }) {
  return (
    <Link href={href} style={styles.link}>
      {children}
    </Link>
  );
}

function InfoPanel({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section style={styles.infoPanel}>
      <h2 style={styles.panelTitle}>{title}</h2>
      {children}
    </section>
  );
}

function StatusMessage({ state }: { readonly state: ActionState }) {
  if (state.status === 'idle') {
    return null;
  }

  if (state.status === 'error' && state.error !== null) {
    return (
      <section role="alert" style={styles.errorPanel}>
        <h2 style={styles.panelTitle}>{state.message}</h2>
        <p style={styles.paragraph}>
          {state.error.message} <strong>({state.error.code})</strong>
        </p>

        {state.error.details.length === 0 ? null : (
          <ul style={styles.detailList}>
            {state.error.details.map((detail, index) => (
              <li key={index}>{formatErrorDetail(detail)}</li>
            ))}
          </ul>
        )}

        <RequestMetadata error={state.error} />
      </section>
    );
  }

  return (
    <section
      role="status"
      style={state.status === 'success' ? styles.successPanel : styles.infoPanel}
    >
      <p style={styles.paragraph}>{state.message}</p>
    </section>
  );
}

function RequestMetadata({ error }: { readonly error: ApiClientError }) {
  if (error.requestId === null && error.correlationId === null) {
    return null;
  }

  return (
    <dl style={styles.metadataList}>
      {error.requestId === null ? null : (
        <>
          <dt>Request ID</dt>
          <dd>{error.requestId}</dd>
        </>
      )}
      {error.correlationId === null ? null : (
        <>
          <dt>Correlation ID</dt>
          <dd>{error.correlationId}</dd>
        </>
      )}
    </dl>
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

function getFormValue(formData: FormData, key: string): string {
  const value = formData.get(key);

  return typeof value === 'string' ? value.trim() : '';
}

function toErrorState(error: unknown, fallbackMessage: string): ActionState {
  if (isApiClientError(error)) {
    return {
      status: 'error',
      message: fallbackMessage,
      error,
    };
  }

  return {
    status: 'error',
    message: fallbackMessage,
    error: {
      code: 'unexpected_client_error',
      message: error instanceof Error ? error.message : 'An unexpected client error occurred.',
      status: 0,
      details: [],
      requestId: null,
      correlationId: null,
    },
  };
}

function formatErrorDetail(detail: ApiErrorDetail): string {
  if (typeof detail.message === 'string' && detail.message.length > 0) {
    return detail.field === undefined ? detail.message : `${detail.field}: ${detail.message}`;
  }

  const safeEntries = Object.entries(detail)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => `${key}: ${String(value)}`);

  return safeEntries.length === 0 ? 'Additional validation error.' : safeEntries.join(', ');
}

function formatNullableNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? 'N/A' : String(value);
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: '100vh',
    padding: '32px 16px',
    background: '#f8fafc',
    color: '#0f172a',
    boxSizing: 'border-box',
  },
  card: {
    width: '100%',
    maxWidth: '760px',
    margin: '0 auto',
    padding: '28px',
    background: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: '18px',
    boxShadow: '0 20px 60px rgba(15, 23, 42, 0.08)',
    boxSizing: 'border-box',
  },
  header: {
    marginBottom: '24px',
  },
  kicker: {
    margin: '0 0 8px',
    fontSize: '12px',
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: '#475569',
  },
  title: {
    margin: 0,
    fontSize: '32px',
    lineHeight: 1.1,
  },
  description: {
    margin: '12px 0 0',
    color: '#475569',
    lineHeight: 1.6,
  },
  form: {
    display: 'grid',
    gap: '16px',
  },
  field: {
    display: 'grid',
    gap: '8px',
  },
  label: {
    fontSize: '14px',
    fontWeight: 700,
  },
  input: {
    minHeight: '44px',
    padding: '10px 12px',
    border: '1px solid #cbd5e1',
    borderRadius: '10px',
    fontSize: '16px',
  },
  checkboxLabel: {
    display: 'flex',
    gap: '10px',
    alignItems: 'center',
    color: '#334155',
  },
  primaryButton: {
    minHeight: '44px',
    padding: '10px 16px',
    border: '1px solid #0f172a',
    borderRadius: '10px',
    background: '#0f172a',
    color: '#ffffff',
    fontWeight: 700,
    cursor: 'pointer',
    textDecoration: 'none',
  },
  secondaryButton: {
    minHeight: '44px',
    padding: '10px 16px',
    border: '1px solid #cbd5e1',
    borderRadius: '10px',
    background: '#ffffff',
    color: '#0f172a',
    fontWeight: 700,
    cursor: 'pointer',
  },
  secondaryButtonLink: {
    minHeight: '22px',
    padding: '10px 16px',
    border: '1px solid #cbd5e1',
    borderRadius: '10px',
    background: '#ffffff',
    color: '#0f172a',
    fontWeight: 700,
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
  },
  buttonRow: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
    marginTop: '16px',
  },
  linkRow: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
    marginTop: '24px',
    paddingTop: '18px',
    borderTop: '1px solid #e2e8f0',
  },
  link: {
    color: '#0f172a',
    fontWeight: 700,
  },
  infoPanel: {
    padding: '16px',
    border: '1px solid #cbd5e1',
    borderRadius: '14px',
    background: '#f8fafc',
    marginTop: '16px',
  },
  successPanel: {
    padding: '16px',
    border: '1px solid #86efac',
    borderRadius: '14px',
    background: '#f0fdf4',
    marginTop: '16px',
  },
  errorPanel: {
    padding: '16px',
    border: '1px solid #fecaca',
    borderRadius: '14px',
    background: '#fef2f2',
    marginTop: '16px',
  },
  panelTitle: {
    margin: '0 0 8px',
    fontSize: '16px',
  },
  paragraph: {
    margin: '0 0 8px',
    color: '#334155',
    lineHeight: 1.6,
  },
  helpPanel: {
    padding: '12px',
    border: '1px dashed #cbd5e1',
    borderRadius: '12px',
    background: '#f8fafc',
  },
  helpTitle: {
    margin: '0 0 6px',
    fontWeight: 700,
  },
  helpList: {
    margin: 0,
    paddingLeft: '20px',
    color: '#334155',
  },
  detailList: {
    margin: '8px 0 0',
    paddingLeft: '20px',
    color: '#334155',
  },
  metadataList: {
    display: 'grid',
    gridTemplateColumns: '120px 1fr',
    gap: '4px 10px',
    margin: '12px 0 0',
    fontSize: '12px',
    color: '#475569',
  },
  sessionGrid: {
    display: 'grid',
    gap: '16px',
  },
  keyValue: {
    display: 'grid',
    gridTemplateColumns: '180px 1fr',
    gap: '8px',
    padding: '6px 0',
    borderBottom: '1px solid #e2e8f0',
  },
  key: {
    color: '#475569',
    fontWeight: 700,
  },
  value: {
    color: '#0f172a',
    overflowWrap: 'anywhere',
  },
  permissionList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    margin: '8px 0 0',
    padding: 0,
    listStyle: 'none',
  },
  permissionBadge: {
    padding: '6px 8px',
    border: '1px solid #cbd5e1',
    borderRadius: '999px',
    background: '#ffffff',
    fontSize: '12px',
  },
};
