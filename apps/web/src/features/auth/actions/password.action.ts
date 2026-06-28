import type { AuthActionResult } from '../types/auth-session';
import { clearStoredAccessToken, postAuthJson } from './login.action';

export interface ForgotPasswordInput {
  readonly email: string;
}

export interface ResetPasswordInput {
  readonly token: string;
  readonly new_password: string;
}

export interface ChangePasswordInput {
  readonly current_password: string;
  readonly new_password: string;
}

export async function forgotPassword(input: ForgotPasswordInput): Promise<AuthActionResult> {
  return postAuthJson<AuthActionResult>('/auth/password/forgot', input);
}

export async function resetPassword(input: ResetPasswordInput): Promise<AuthActionResult> {
  return postAuthJson<AuthActionResult>('/auth/password/reset', input);
}

export async function changePassword(input: ChangePasswordInput): Promise<AuthActionResult> {
  const result = await postAuthJson<AuthActionResult>('/auth/password/change', input, {
    requiresAuth: true,
  });
  clearStoredAccessToken();
  return result;
}
