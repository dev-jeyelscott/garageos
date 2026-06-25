import { describe, expect, it } from 'vitest';
import type { AuthAccessTokenPayload, AuthSessionResponseData } from './auth-session.contract';

describe('auth session contracts', () => {
  it('supports the access token payload shape without issuing a token', () => {
    const payload = {
      token_type: 'access',
      sub: 'user-id',
      user_id: 'user-id',
      user_type: 'tenant_user',
      tenant_id: 'tenant-id',
      session_id: 'session-id',
      email_verified: true,
      iat: 0,
      exp: 900,
      jti: 'access-token-id',
    } satisfies AuthAccessTokenPayload;

    expect(payload.token_type).toBe('access');
    expect(payload.exp - payload.iat).toBe(900);
  });

  it('supports the documented current session response shape', () => {
    const response = {
      user: {
        id: 'user-id',
        user_type: 'tenant_user',
        full_name: 'Juan Dela Cruz',
        email: 'owner@example.com',
        email_verified: true,
        status: 'active',
      },
      tenant: {
        id: 'tenant-id',
        business_name: 'Moto Garage',
        status: 'active',
        timezone: 'Asia/Manila',
        country: 'PH',
        currency: 'PHP',
      },
      effective_permissions: ['customers.read', 'job_orders.create'],
      branches: [
        {
          id: 'branch-id',
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
        expiration_date: '2026-07-24',
        days_until_expiration: 30,
        renewal_required: false,
        warnings: [],
      },
      access: {
        can_access_operational_modules: true,
        read_only: false,
      },
    } satisfies AuthSessionResponseData;

    expect(response.tenant?.status).toBe('active');
    expect(response.access.read_only).toBe(false);
  });
});
