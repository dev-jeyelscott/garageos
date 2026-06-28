import { type ApiClientError, readApiResponse } from '../../../lib/api-envelope';
import type { AuthLoginResponseData, AuthRefreshResponseData } from '../types/auth-session';

let accessTokenCache: string | null = null;

export interface LoginInput {
  readonly email: string;
  readonly password: string;
  readonly remember_me: boolean;
}

export async function login(input: LoginInput): Promise<AuthLoginResponseData> {
  const data = await postAuthJson<AuthLoginResponseData>('/auth/login', input);
  storeAccessToken(data.access_token);
  return data;
}

export async function refreshAccessToken(): Promise<AuthRefreshResponseData> {
  const data = await postAuthJson<AuthRefreshResponseData>('/auth/refresh');
  storeAccessToken(data.access_token);
  return data;
}

export function clearStoredAccessToken(): void {
  accessTokenCache = null;
}

export async function getAccessTokenOrRefresh(): Promise<string> {
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

export async function getAuthJson<TData>(
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

export async function postAuthJson<TData>(
  path: string,
  body?: unknown,
  options: {
    readonly idempotencyKey?: string;
    readonly requiresAuth?: boolean;
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

  if (options.requiresAuth === true) {
    headers.Authorization = `Bearer ${await getAccessTokenOrRefresh()}`;
  }

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

function storeAccessToken(accessToken: string): void {
  accessTokenCache = accessToken;
}

function getStoredAccessToken(): string | null {
  return accessTokenCache;
}

function buildApiUrl(path: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_GARAGEOS_API_BASE_URL ?? '/api/v1';
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  return `${normalizedBaseUrl}${normalizedPath}`;
}
