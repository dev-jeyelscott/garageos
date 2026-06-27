'use client';

import { useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { changePassword, forgotPassword, resetPassword } from '../../../lib/auth-api';
import { AuthPageShell, styles } from '../components/auth-page-shell';
import {
  AuthLink,
  InputField,
  PasswordPolicy,
  PrimaryButton,
  StatusMessage,
  getFormValue,
  initialActionState,
  toErrorState,
  type ActionState,
} from '../components/auth-form-controls';

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
