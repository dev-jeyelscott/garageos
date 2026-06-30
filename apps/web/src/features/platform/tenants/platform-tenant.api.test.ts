import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearStoredAccessToken } from '../../auth/actions/login.action';

import {
  createPlatformTenant,
  normalizePlatformTenantDetailPayload,
  normalizePlatformTenantListPayload,
} from './platform-tenant.api';
import type { PlatformTenantCreateForm } from './platform-tenant.types';

describe('platform tenant API adapter', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    clearStoredAccessToken();
  });

  it('normalizes list envelopes with cursor pagination', () => {
    const result = normalizePlatformTenantListPayload(
      {
        tenants: [
          {
            id: 'tenant_1',
            business_name: 'Example Moto Garage',
            shop_email: 'owner@example.com',
            status: 'pending_setup',
            subscription: {
              plan_code: 'basic',
              plan_name: 'Basic',
              expiration_date: '2026-12-31',
            },
          },
        ],
        pagination: {
          limit: '25',
          next_cursor: 'cursor_2',
          has_more: true,
        },
      },
      {
        requestId: 'req_test',
        correlationId: 'corr_test',
        pagination: null,
      },
    );

    expect(result.tenants).toHaveLength(1);
    expect(result.tenants[0]?.business_name).toBe('Example Moto Garage');
    expect(result.pagination).toEqual({
      limit: 25,
      next_cursor: 'cursor_2',
      has_more: true,
    });
  });

  it('rejects unsupported tenant status values in list payloads', () => {
    expect(() => {
      normalizePlatformTenantListPayload(
        [
          {
            id: 'tenant_1',
            business_name: 'Example Moto Garage',
            status: 'draft',
          },
        ],
        {
          requestId: 'req_test',
          correlationId: 'corr_test',
          pagination: null,
        },
      );
    }).toThrowError(
      expect.objectContaining({
        code: 'invalid_api_response',
        requestId: 'req_test',
        correlationId: 'corr_test',
      }),
    );
  });

  it('normalizes detail envelopes without leaking wrapper fields to components', () => {
    const detail = normalizePlatformTenantDetailPayload(
      {
        tenant: {
          id: 'tenant_1',
          business_name: 'Example Moto Garage',
          shop_email: 'owner@example.com',
          status: 'active',
          onboarding_completed_at: '2026-07-01T00:00:00.000Z',
        },
      },
      {
        requestId: 'req_test',
        correlationId: 'corr_test',
      },
    );

    expect(detail).toEqual({
      id: 'tenant_1',
      business_name: 'Example Moto Garage',
      shop_email: 'owner@example.com',
      status: 'active',
      onboarding_completed_at: '2026-07-01T00:00:00.000Z',
    });
  });

  it('posts the strict create contract with an idempotency key', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input: string | URL | Request) => {
      const url = String(input);

      if (url.endsWith('/auth/refresh')) {
        return apiSuccess({
          access_token: 'access-token',
          expires_in_seconds: 900,
        });
      }

      if (url.endsWith('/platform/tenants')) {
        return apiSuccess({
          tenant: {
            id: 'tenant_1',
            business_name: 'Example Moto Garage',
            status: 'pending_setup',
          },
          subscription: {
            plan_id: '11111111-1111-4111-8111-111111111111',
          },
          owner_invitation_sent: true,
        });
      }

      throw new Error(`Unexpected fetch call: ${url}`);
    });

    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', {
      randomUUID: () => '22222222-2222-4222-8222-222222222222',
    });

    await createPlatformTenant(createTenantForm());

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const createRequest = fetchMock.mock.calls[1]?.[1] as RequestInit;
    const headers = createRequest.headers as Record<string, string>;

    expect(headers.Authorization).toBe('Bearer access-token');
    expect(headers['Idempotency-Key']).toBe(
      'platform-tenant-create-22222222-2222-4222-8222-222222222222',
    );
    expect(JSON.parse(String(createRequest.body))).toEqual({
      business_name: 'Example Moto Garage',
      shop_email: 'owner@example.com',
      plan_id: '11111111-1111-4111-8111-111111111111',
      subscription_start_date: '2026-07-01',
      subscription_expiration_date: '2026-12-31',
      owner: {
        full_name: 'Juan Dela Cruz',
        email: 'owner@example.com',
        send_invitation: true,
      },
    });
  });
});

function createTenantForm(): PlatformTenantCreateForm {
  return {
    business_name: ' Example Moto Garage ',
    shop_email: ' owner@example.com ',
    plan_id: ' 11111111-1111-4111-8111-111111111111 ',
    subscription_start_date: '2026-07-01',
    subscription_expiration_date: '2026-12-31',
    owner_full_name: ' Juan Dela Cruz ',
    owner_email: ' owner@example.com ',
    approve_duplicate: false,
    duplicate_approval_reason: '',
  };
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
