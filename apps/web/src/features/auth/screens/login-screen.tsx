'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { login } from '../../../lib/auth-api';
import { AuthPageShell, styles } from '../components/auth-page-shell';
import {
  AuthLink,
  InputField,
  PrimaryButton,
  StatusMessage,
  getFormValue,
  initialActionState,
  toErrorState,
  type ActionState,
} from '../components/auth-form-controls';

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
