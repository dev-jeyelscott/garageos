import type { AuthActionResult } from '../types/auth-session';
import { clearStoredAccessToken, postAuthJson } from './login.action';

export async function logout(): Promise<AuthActionResult> {
  try {
    return await postAuthJson<AuthActionResult>('/auth/logout', undefined, {
      requiresAuth: true,
    });
  } finally {
    clearStoredAccessToken();
  }
}

export async function logoutAll(): Promise<AuthActionResult> {
  try {
    return await postAuthJson<AuthActionResult>('/auth/logout-all', undefined, {
      requiresAuth: true,
    });
  } finally {
    clearStoredAccessToken();
  }
}
