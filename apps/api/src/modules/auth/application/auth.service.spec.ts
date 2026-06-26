import { describe, expect, it, vi } from 'vitest';

import { GarageOsApiException } from '../../../shared/api/api-exception';
import { AuthRateLimitStore } from './auth-rate-limit.store';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { AuthLoginContext, AuthUserStore } from './auth-user.store';
import { PasswordHashingService } from './password-hashing.service';
import { AccessTokenService } from '../security/access-token.service';
import { AuthService } from './auth.service';
import type {
  CountAuthRateLimitEventsInput,
  RecordAuthRateLimitEventInput,
} from './auth-rate-limit.store';

const signingOptions = {
  issuer: 'garageos-api',
  audience: 'garageos-pwa',
  secret: 'test-access-token-secret-at-least-32-chars',
};

class FakeAuthUserStore extends AuthUserStore {
  readonly lookups: string[] = [];
  private context: AuthLoginContext | null = null;

  setContext(context: AuthLoginContext | null): void {
    this.context = context;
  }

  async findActiveLoginContextByNormalizedEmail(input: {
    readonly normalizedEmail: string;
  }): Promise<AuthLoginContext | null> {
    this.lookups.push(input.normalizedEmail);

    return this.context;
  }
}

class FakeAuthRateLimitStore extends AuthRateLimitStore {
  readonly countInputs: CountAuthRateLimitEventsInput[] = [];
  readonly recordInputs: RecordAuthRateLimitEventInput[] = [];
  private readonly countsByKey = new Map<string, number>();

  setCount(key: string, count: number): void {
    this.countsByKey.set(key, count);
  }

  async countEvents(input: CountAuthRateLimitEventsInput): Promise<number> {
    this.countInputs.push(input);

    return this.countsByKey.get(input.key) ?? 0;
  }

  async recordEvent(input: RecordAuthRateLimitEventInput): Promise<void> {
    this.recordInputs.push(input);
  }
}

function createLoginContext(): AuthLoginContext {
  return {
    user: {
      id: '11111111-1111-4111-8111-111111111111',
      tenantId: '22222222-2222-4222-8222-222222222222',
      userType: 'tenant_user',
      email: 'owner@example.com',
      passwordHash: 'hashed-password',
      emailVerifiedAt: new Date('2026-06-26T00:00:00.000Z'),
      status: 'active',
      fullName: 'Juan Dela Cruz',
    },
    tenant: {
      id: '22222222-2222-4222-8222-222222222222',
      business_name: 'Moto Garage',
      status: 'active',
      timezone: 'Asia/Manila',
      country: 'PH',
      currency: 'PHP',
    },
    permissions: ['customers.read', 'job_orders.create'],
    branches: [
      {
        id: '33333333-3333-4333-8333-333333333333',
        name: 'Main Branch',
      },
    ],
    tenantWideBranchAccess: true,
  };
}

function createService(
  options: {
    readonly loginContext?: AuthLoginContext | null;
    readonly passwordMatches?: boolean;
    readonly accountAttemptCount?: number;
    readonly ipAttemptCount?: number;
  } = {},
): {
  readonly service: AuthService;
  readonly userStore: FakeAuthUserStore;
  readonly rateLimitStore: FakeAuthRateLimitStore;
  readonly verifyPassword: ReturnType<typeof vi.fn>;
  readonly accessTokenService: AccessTokenService;
} {
  const userStore = new FakeAuthUserStore();
  userStore.setContext('loginContext' in options ? options.loginContext : createLoginContext());

  const rateLimitStore = new FakeAuthRateLimitStore();
  rateLimitStore.setCount('account:owner@example.com', options.accountAttemptCount ?? 0);
  rateLimitStore.setCount('ip:203.0.113.10', options.ipAttemptCount ?? 0);

  const verifyPassword = vi.fn(async () => options.passwordMatches ?? true);

  const passwordHashingService = {
    verifyPassword,
    hashPassword: vi.fn(),
  } as unknown as PasswordHashingService;

  const accessTokenService = new AccessTokenService(signingOptions);
  const rateLimitService = new AuthRateLimitService(rateLimitStore);

  return {
    service: new AuthService(
      userStore,
      passwordHashingService,
      accessTokenService,
      rateLimitService,
    ),
    userStore,
    rateLimitStore,
    verifyPassword,
    accessTokenService,
  };
}

describe('AuthService login', () => {
  it('returns login response data and a signed access token for valid credentials', async () => {
    const { service, userStore, rateLimitStore, verifyPassword, accessTokenService } =
      createService();

    const response = await service.login(
      {
        email: ' Owner@Example.com ',
        password: 'Secret123',
        remember_me: true,
      },
      {
        ipAddress: '203.0.113.10',
      },
    );

    expect(userStore.lookups).toEqual(['owner@example.com']);
    expect(verifyPassword).toHaveBeenCalledWith('Secret123', 'hashed-password');
    expect(rateLimitStore.recordInputs).toEqual([]);

    expect(response.user).toEqual({
      id: '11111111-1111-4111-8111-111111111111',
      user_type: 'tenant_user',
      full_name: 'Juan Dela Cruz',
      email: 'owner@example.com',
      email_verified: true,
      status: 'active',
    });
    expect(response.tenant?.id).toBe('22222222-2222-4222-8222-222222222222');
    expect(response.permissions).toEqual(['customers.read', 'job_orders.create']);
    expect(response.branches).toEqual([
      {
        id: '33333333-3333-4333-8333-333333333333',
        name: 'Main Branch',
      },
    ]);
    expect(response.tenant_wide_branch_access).toBe(true);
    expect(response.expires_in_seconds).toBe(15 * 60);

    const verified = await accessTokenService.verify(response.access_token);

    expect(verified).toEqual(
      expect.objectContaining({
        token_type: 'access',
        user_id: '11111111-1111-4111-8111-111111111111',
        user_type: 'tenant_user',
        tenant_id: '22222222-2222-4222-8222-222222222222',
        email_verified: true,
        session_id: expect.any(String),
      }),
    );
  });

  it('records failed account and IP login attempts when the account does not exist', async () => {
    const { service, rateLimitStore } = createService({
      loginContext: null,
    });

    await expect(
      service.login(
        {
          email: 'owner@example.com',
          password: 'Secret123',
        },
        {
          ipAddress: '203.0.113.10',
        },
      ),
    ).rejects.toBeInstanceOf(GarageOsApiException);

    expect(rateLimitStore.recordInputs).toEqual([
      expect.objectContaining({
        bucket: 'auth.login',
        key: 'account:owner@example.com',
        tenantId: null,
        userId: null,
        ipAddress: '203.0.113.10',
      }),
      expect.objectContaining({
        bucket: 'auth.login',
        key: 'ip:203.0.113.10',
        tenantId: null,
        userId: null,
        ipAddress: '203.0.113.10',
      }),
    ]);
  });

  it('records failed attempts against the resolved user when the password is invalid', async () => {
    const { service, rateLimitStore } = createService({
      passwordMatches: false,
    });

    await expect(
      service.login(
        {
          email: 'owner@example.com',
          password: 'WrongSecret123',
        },
        {
          ipAddress: '203.0.113.10',
        },
      ),
    ).rejects.toBeInstanceOf(GarageOsApiException);

    expect(rateLimitStore.recordInputs).toEqual([
      expect.objectContaining({
        bucket: 'auth.login',
        key: 'account:owner@example.com',
        tenantId: '22222222-2222-4222-8222-222222222222',
        userId: '11111111-1111-4111-8111-111111111111',
        ipAddress: '203.0.113.10',
      }),
      expect.objectContaining({
        bucket: 'auth.login',
        key: 'ip:203.0.113.10',
        tenantId: '22222222-2222-4222-8222-222222222222',
        userId: '11111111-1111-4111-8111-111111111111',
        ipAddress: '203.0.113.10',
      }),
    ]);
  });

  it('blocks login before user lookup when the account login rate limit is exceeded', async () => {
    const { service, userStore } = createService({
      accountAttemptCount: 5,
    });

    await expect(
      service.login(
        {
          email: 'owner@example.com',
          password: 'Secret123',
        },
        {
          ipAddress: '203.0.113.10',
        },
      ),
    ).rejects.toMatchObject({
      code: 'rate_limited',
    });

    expect(userStore.lookups).toEqual([]);
  });
});
