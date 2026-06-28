import type { AuthActionResult } from '../types/auth-session';
import { postAuthJson } from './login.action';

export interface OwnerSignupInput {
  readonly business_name: string;
  readonly shop_email: string;
  readonly owner: {
    readonly full_name: string;
    readonly email: string;
    readonly password: string;
  };
}

export async function signupOwner(input: OwnerSignupInput): Promise<AuthActionResult> {
  return postAuthJson<AuthActionResult>('/auth/signup-owner', input, {
    idempotencyKey: `signup-owner-${createClientRequestId()}`,
  });
}

function createClientRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
