'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { signupOwner } from '../../../lib/auth-api';
import { AuthPageShell, styles } from '../components/auth-page-shell';
import {
  AuthLink,
  InfoPanel,
  InputField,
  PasswordPolicy,
  PrimaryButton,
  StatusMessage,
  getFormValue,
  initialActionState,
  toErrorState,
  type ActionState,
} from '../components/auth-form-controls';

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
