import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  changePassword,
  clearStoredAccessToken,
  getCurrentSession,
  login,
  logout,
} from './auth-api';
import type {
  AuthActionResult,
  AuthLoginResponseData,
  AuthRefreshResponseData,
  AuthSessionResponseData,
} from './auth-session';

describe('auth-api access token cache', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    clearStoredAccessToken();
  });

  it('keeps login access tokens in memory and does not touch browser storage', async () => {
    const sessionStorage = createStorageMock();
    const localStorage = createStorageMock();

    vi.stubGlobal('window', {
      sessionStorage,
      localStorage,
    });

    const fetchMock = createFetchMock(
      apiSuccess(createLoginResponse('login-token')),
      apiSuccess(createSessionResponse()),
    );

    vi.stubGlobal('fetch', fetchMock);

    await login({
      email: 'owner@example.com',
      password: 'Secret123',
      remember_me: true,
    });

    await getCurrentSession();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/auth/login');
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/v1/auth/session');
    expect(headersAt(fetchMock, 1).Authorization).toBe('Bearer login-token');

    expect(sessionStorage.setItem).not.toHaveBeenCalled();
    expect(sessionStorage.getItem).not.toHaveBeenCalled();
    expect(sessionStorage.removeItem).not.toHaveBeenCalled();

    expect(localStorage.setItem).not.toHaveBeenCalled();
    expect(localStorage.getItem).not.toHaveBeenCalled();
    expect(localStorage.removeItem).not.toHaveBeenCalled();
  });

  it('recovers the current session through refresh when the memory cache is empty', async () => {
    const fetchMock = createFetchMock(
      apiSuccess(createRefreshResponse('refreshed-token')),
      apiSuccess(createSessionResponse()),
    );

    vi.stubGlobal('fetch', fetchMock);

    await getCurrentSession();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/auth/refresh');
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/v1/auth/session');

    expect(requestInitAt(fetchMock, 0).credentials).toBe('include');
    expect(headersAt(fetchMock, 0).Authorization).toBeUndefined();

    expect(requestInitAt(fetchMock, 1).credentials).toBe('include');
    expect(headersAt(fetchMock, 1).Authorization).toBe('Bearer refreshed-token');
  });

  it('refreshes before authenticated POST actions when the memory cache is empty', async () => {
    const fetchMock = createFetchMock(
      apiSuccess(createRefreshResponse('post-refresh-token')),
      apiSuccess(createActionResult()),
    );

    vi.stubGlobal('fetch', fetchMock);

    await changePassword({
      current_password: 'OldSecret123',
      new_password: 'NewSecret123',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/auth/refresh');
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/v1/auth/password/change');

    expect(headersAt(fetchMock, 0).Authorization).toBeUndefined();
    expect(headersAt(fetchMock, 1).Authorization).toBe('Bearer post-refresh-token');
  });

  it('clears the memory cache after logout and does not reuse the previous bearer token', async () => {
    const fetchMock = createFetchMock(
      apiSuccess(createLoginResponse('logout-token')),
      apiSuccess(createActionResult()),
      apiError('unauthenticated', 401),
    );

    vi.stubGlobal('fetch', fetchMock);

    await login({
      email: 'owner@example.com',
      password: 'Secret123',
      remember_me: false,
    });

    await logout();

    await expect(getCurrentSession()).rejects.toMatchObject({
      code: 'unauthenticated',
      status: 401,
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/auth/login');
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/v1/auth/logout');
    expect(fetchMock.mock.calls[2]?.[0]).toBe('/api/v1/auth/refresh');

    expect(headersAt(fetchMock, 1).Authorization).toBe('Bearer logout-token');
    expect(headersAt(fetchMock, 2).Authorization).toBeUndefined();
  });
});

function createStorageMock() {
  return {
    length: 0,
    clear: vi.fn(),
    getItem: vi.fn(),
    key: vi.fn(),
    removeItem: vi.fn(),
    setItem: vi.fn(),
  };
}

function createFetchMock(...responses: readonly Response[]) {
  const responseQueue = [...responses];

  return vi.fn<typeof fetch>(async () => {
    const response = responseQueue.shift();

    if (response === undefined) {
      throw new Error('Unexpected fetch call.');
    }

    return response;
  });
}

function requestInitAt(
  fetchMock: ReturnType<typeof createFetchMock>,
  callIndex: number,
): RequestInit {
  const requestInit = fetchMock.mock.calls[callIndex]?.[1];

  expect(requestInit).toBeDefined();

  return requestInit as RequestInit;
}

function headersAt(
  fetchMock: ReturnType<typeof createFetchMock>,
  callIndex: number,
): Record<string, string> {
  return requestInitAt(fetchMock, callIndex).headers as Record<string, string>;
}

function apiSuccess<TData>(data: TData): Response {
  return new Response(
    JSON.stringify({
      data,
      meta: {
        request_id: 'req_test',
        correlation_id: 'corr_test',
      },
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    },
  );
}

function apiError(code: string, status: number): Response {
  return new Response(
    JSON.stringify({
      error: {
        code,
        message: 'The request is unauthenticated.',
        details: [],
        request_id: 'req_test',
        correlation_id: 'corr_test',
      },
    }),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
      },
    },
  );
}

function createLoginResponse(accessToken: string): AuthLoginResponseData {
  return {
    access_token: accessToken,
    expires_in_seconds: 900,
    user: {
      id: 'user_1',
      user_type: 'tenant_user',
      full_name: 'Garage Owner',
      email: 'owner@example.com',
      email_verified: true,
      status: 'active',
    },
    tenant: {
      id: 'tenant_1',
      business_name: 'Demo Garage',
      status: 'active',
      timezone: 'Asia/Manila',
      country: 'PH',
      currency: 'PHP',
    },
    permissions: ['shop.read'],
    branches: [
      {
        id: 'branch_1',
        name: 'Main Branch',
      },
    ],
    tenant_wide_branch_access: true,
  };
}

function createRefreshResponse(accessToken: string): AuthRefreshResponseData {
  return {
    access_token: accessToken,
    expires_in_seconds: 900,
  };
}

function createSessionResponse(): AuthSessionResponseData {
  return {
    user: {
      id: 'user_1',
      user_type: 'tenant_user',
      full_name: 'Garage Owner',
      email: 'owner@example.com',
      email_verified: true,
      status: 'active',
    },
    tenant: {
      id: 'tenant_1',
      business_name: 'Demo Garage',
      status: 'active',
      timezone: 'Asia/Manila',
      country: 'PH',
      currency: 'PHP',
    },
    effective_permissions: ['shop.read'],
    branches: [
      {
        id: 'branch_1',
        name: 'Main Branch',
      },
    ],
    tenant_wide_branch_access: true,
    effective_plan: {
      code: 'basic',
      name: 'Basic',
      limits: {
        max_active_branches: 1,
        customer_email_reminders: false,
        customer_sms_reminders: false,
      },
    },
    subscription: {
      status: 'active',
      expiration_date: '2026-12-31',
      days_until_expiration: 30,
      renewal_required: false,
      warnings: [],
    },
    access: {
      can_access_operational_modules: true,
      read_only: false,
    },
  };
}

function createActionResult(): AuthActionResult {
  return {
    success: true,
  };
}
