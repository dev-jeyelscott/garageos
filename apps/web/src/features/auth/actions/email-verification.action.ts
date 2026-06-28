import type { AuthActionResult } from '../types/auth-session';
import { postAuthJson } from './login.action';

export interface EmailVerificationConfirmInput {
  readonly token: string;
}

export async function resendEmailVerification(): Promise<AuthActionResult> {
  return postAuthJson<AuthActionResult>('/auth/email-verification/resend', undefined, {
    requiresAuth: true,
  });
}

export async function confirmEmailVerification(
  input: EmailVerificationConfirmInput,
): Promise<AuthActionResult> {
  return postAuthJson<AuthActionResult>('/auth/email-verification/confirm', input);
}
