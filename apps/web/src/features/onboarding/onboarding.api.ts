import { readApiResponse } from '../../lib/api-envelope';
import { getAccessTokenOrRefresh } from '../auth/actions/login.action';
import type {
  CompleteOnboardingResponse,
  CreateBranchRequest,
  CreateBranchResponse,
  OnboardingStateResponse,
  ShopProfileRequest,
} from './onboarding.types';

export async function getOnboardingState(): Promise<OnboardingStateResponse> {
  return getOnboardingJson<OnboardingStateResponse>('/shop/onboarding-state');
}

export async function saveShopProfile(
  request: ShopProfileRequest,
): Promise<{ readonly saved: true }> {
  return sendOnboardingJson<{ readonly saved: true }>('/shop/profile', {
    method: 'PUT',
    body: request,
  });
}

export async function createFirstBranch(
  request: CreateBranchRequest,
): Promise<CreateBranchResponse> {
  return sendOnboardingJson<CreateBranchResponse>('/branches', {
    method: 'POST',
    body: request,
    idempotencyKey: createClientIdempotencyKey('branch'),
  });
}

export async function completeOnboarding(): Promise<CompleteOnboardingResponse> {
  return sendOnboardingJson<CompleteOnboardingResponse>('/shop/complete-onboarding', {
    method: 'POST',
    idempotencyKey: createClientIdempotencyKey('onboarding'),
  });
}

async function getOnboardingJson<TData>(path: string): Promise<TData> {
  const response = await fetch(buildApiUrl(path), {
    method: 'GET',
    headers: await buildAuthorizedHeaders(),
    credentials: 'include',
  });

  return readApiResponse<TData>(response);
}

async function sendOnboardingJson<TData>(
  path: string,
  options: {
    readonly method: 'POST' | 'PUT';
    readonly body?: unknown;
    readonly idempotencyKey?: string;
  },
): Promise<TData> {
  const headers = await buildAuthorizedHeaders();

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (options.idempotencyKey !== undefined) {
    headers['Idempotency-Key'] = options.idempotencyKey;
  }

  const requestInit: RequestInit = {
    method: options.method,
    headers,
    credentials: 'include',
  };

  if (options.body !== undefined) {
    requestInit.body = JSON.stringify(options.body);
  }

  const response = await fetch(buildApiUrl(path), requestInit);

  return readApiResponse<TData>(response);
}

async function buildAuthorizedHeaders(): Promise<Record<string, string>> {
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${await getAccessTokenOrRefresh()}`,
  };
}

function buildApiUrl(path: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_GARAGEOS_API_BASE_URL ?? '/api/v1';
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  return `${normalizedBaseUrl}${normalizedPath}`;
}

function createClientIdempotencyKey(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
