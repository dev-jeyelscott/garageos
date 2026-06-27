'use client';

import { useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { confirmEmailVerification, logout, resendEmailVerification } from '../../../lib/auth-api';
import { AuthPageShell, styles } from '../components/auth-page-shell';
import {
  AuthLink,
  InfoPanel,
  InputField,
  PrimaryButton,
  StatusMessage,
  getFormValue,
  initialActionState,
  toErrorState,
  type ActionState,
} from '../components/auth-form-controls';

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
        <button type="button" onClick={handleResend} className={styles.primaryButton}>
          Resend verification email
        </button>
        <button type="button" onClick={handleLogout} className={styles.secondaryButton}>
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
