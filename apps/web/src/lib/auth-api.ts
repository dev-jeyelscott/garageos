import { type ApiClientError, readApiResponse } from './api-envelope';
import type {
  AuthActionResult,
  AuthLoginResponseData,
  AuthRefreshResponseData,
  AuthSessionResponseData,
} from './auth-session';

const ACCESS_TOKEN_STORAGE_KEY = 'garageos.access_token';

export interface LoginInput {
  readonly email: string;
  readonly password: string;
  readonly remember_me: boolean;
}

export interface OwnerSignupInput {
  readonly business_name: string;
  readonly shop_email: string;
  readonly owner: {
    readonly full_name: string;
    readonly email: string;
    readonly password: string;
  };
}

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

export interface EmailVerificationConfirmInput {
  readonly token: string;
}

export async function login(input: LoginInput): Promise<AuthLoginResponseData> {
  const data = await postJson<AuthLoginResponseData>('/auth/login', input);
  storeAccessToken(data.access_token);
  return data;
}

export async function signupOwner(input: OwnerSignupInput): Promise<AuthActionResult> {
  return postJson<AuthActionResult>('/auth/signup-owner', input, {
    idempotencyKey: `signup-owner-${createClientRequestId()}`,
  });
}

export async function refreshAccessToken(): Promise<AuthRefreshResponseData> {
  const data = await postJson<AuthRefreshResponseData>('/auth/refresh');
  storeAccessToken(data.access_token);
  return data;
}

export async function getCurrentSession(): Promise<AuthSessionResponseData> {
  const accessToken = await getAccessTokenOrRefresh();

  return getJson<AuthSessionResponseData>('/auth/session', {
    accessToken,
  });
}

export async function resendEmailVerification(): Promise<AuthActionResult> {
  return postJson<AuthActionResult>('/auth/email-verification/resend');
}

export async function confirmEmailVerification(
  input: EmailVerificationConfirmInput,
): Promise<AuthActionResult> {
  return postJson<AuthActionResult>('/auth/email-verification/confirm', input);
}

export async function forgotPassword(input: ForgotPasswordInput): Promise<AuthActionResult> {
  return postJson<AuthActionResult>('/auth/password/forgot', input);
}

export async function resetPassword(input: ResetPasswordInput): Promise<AuthActionResult> {
  return postJson<AuthActionResult>('/auth/password/reset', input);
}

export async function changePassword(input: ChangePasswordInput): Promise<AuthActionResult> {
  const result = await postJson<AuthActionResult>('/auth/password/change', input);
  clearStoredAccessToken();
  return result;
}

export async function logout(): Promise<AuthActionResult> {
  try {
    return await postJson<AuthActionResult>('/auth/logout');
  } finally {
    clearStoredAccessToken();
  }
}

export async function logoutAll(): Promise<AuthActionResult> {
  try {
    return await postJson<AuthActionResult>('/auth/logout-all');
  } finally {
    clearStoredAccessToken();
  }
}

export function clearStoredAccessToken(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
}

function storeAccessToken(accessToken: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, accessToken);
}

function getStoredAccessToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.sessionStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
}

async function getAccessTokenOrRefresh(): Promise<string> {
  const storedAccessToken = getStoredAccessToken();

  if (storedAccessToken !== null && storedAccessToken.length > 0) {
    return storedAccessToken;
  }

  try {
    const refreshed = await refreshAccessToken();
    return refreshed.access_token;
  } catch {
    throw {
      code: 'unauthenticated',
      message: 'Please log in to continue.',
      status: 401,
      details: [],
      requestId: null,
      correlationId: null,
    } satisfies ApiClientError;
  }
}

async function getJson<TData>(
  path: string,
  options: {
    readonly accessToken?: string;
  } = {},
): Promise<TData> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (options.accessToken !== undefined) {
    headers.Authorization = `Bearer ${options.accessToken}`;
  }

  const response = await fetch(buildApiUrl(path), {
    method: 'GET',
    headers,
    credentials: 'include',
  });

  return readApiResponse<TData>(response);
}

async function postJson<TData>(
  path: string,
  body?: unknown,
  options: {
    readonly idempotencyKey?: string;
  } = {},
): Promise<TData> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  const requestInit: RequestInit = {
    method: 'POST',
    headers,
    credentials: 'include',
  };

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    requestInit.body = JSON.stringify(body);
  }

  if (options.idempotencyKey !== undefined) {
    headers['Idempotency-Key'] = options.idempotencyKey;
  }

  const response = await fetch(buildApiUrl(path), requestInit);

  return readApiResponse<TData>(response);
}

function buildApiUrl(path: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_GARAGEOS_API_BASE_URL ?? '/api/v1';
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  return `${normalizedBaseUrl}${normalizedPath}`;
}

function createClientRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
