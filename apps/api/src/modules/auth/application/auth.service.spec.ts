import { describe, expect, it, vi } from 'vitest';

import { GarageOsApiException } from '../../../shared/api/api-exception';
import { AuthRateLimitStore } from './auth-rate-limit.store';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { AuthSessionService } from './auth-session.service';
import { AuthLoginContext, AuthUserStore } from './auth-user.store';
import { PasswordHashingService } from './password-hashing.service';
import { RefreshSessionStore } from './refresh-session.store';
import { SecureTokenService } from './secure-token.service';
import { TokenHashingService } from './token-hashing.service';
import { AccessTokenService } from '../security/access-token.service';
import { AuthService } from './auth.service';
import type {
  CountAuthRateLimitEventsInput,
  RecordAuthRateLimitEventInput,
} from './auth-rate-limit.store';
import type {
  CreateRefreshSessionInput,
  RefreshSessionRecord,
  ReplaceRefreshSessionInput,
  RotateRefreshSessionInput,
} from './refresh-session.store';

const signingOptions = {
  issuer: 'garageos-api',
  audience: 'garageos-pwa',
  secret: 'test-access-token-secret-at-least-32-chars',
};

class FakeAuthUserStore extends AuthUserStore {
  readonly lookups: string[] = [];
  readonly userIdLookups: string[] = [];

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

  async findActiveLoginContextByUserId(input: {
    readonly userId: string;
  }): Promise<AuthLoginContext | null> {
    this.userIdLookups.push(input.userId);

    if (this.context?.user.id !== input.userId) {
      return null;
    }

    return this.context;
  }
}

class FakeRefreshSessionStore extends RefreshSessionStore {
  readonly createInputs: CreateRefreshSessionInput[] = [];
  readonly rotateInputs: RotateRefreshSessionInput[] = [];
  readonly revokedCurrentDeviceInputs: { readonly sessionId: string; readonly revokedAt: Date }[] =
    [];

  private readonly sessionsByHash = new Map<string, RefreshSessionRecord>();

  setActiveSession(record: RefreshSessionRecord): void {
    this.sessionsByHash.set(record.refreshTokenHash, record);
  }

  async create(input: CreateRefreshSessionInput): Promise<RefreshSessionRecord> {
    this.createInputs.push(input);

    const record: RefreshSessionRecord = {
      id: input.id,
      userId: input.userId,
      tenantId: input.tenantId,
      tokenFamilyId: input.tokenFamilyId,
      refreshTokenHash: input.refreshTokenHash,
      rememberMe: input.rememberMe,
      expiresAt: input.expiresAt,
      revokedAt: null,
      replacedBySessionId: null,
      createdAt: new Date('2026-06-26T00:00:00.000Z'),
    };

    this.sessionsByHash.set(record.refreshTokenHash, record);

    return record;
  }

  async findActiveByRefreshTokenHash(
    refreshTokenHash: string,
    now: Date,
  ): Promise<RefreshSessionRecord | null> {
    const session = this.sessionsByHash.get(refreshTokenHash);

    if (session === undefined || session.revokedAt !== null || session.expiresAt <= now) {
      return null;
    }

    return session;
  }

  async rotate(input: RotateRefreshSessionInput): Promise<RefreshSessionRecord | null> {
    this.rotateInputs.push(input);

    const current = this.sessionsByHash.get(input.currentRefreshTokenHash);

    if (
      current === undefined ||
      current.id !== input.currentSessionId ||
      current.revokedAt !== null ||
      current.expiresAt <= input.rotatedAt
    ) {
      return null;
    }

    this.sessionsByHash.delete(input.currentRefreshTokenHash);

    const replacement: RefreshSessionRecord = {
      id: input.replacementSessionId,
      userId: current.userId,
      tenantId: current.tenantId,
      tokenFamilyId: current.tokenFamilyId,
      refreshTokenHash: input.replacementRefreshTokenHash,
      rememberMe: current.rememberMe,
      expiresAt: current.expiresAt,
      revokedAt: null,
      replacedBySessionId: null,
      createdAt: input.rotatedAt,
    };

    this.sessionsByHash.set(replacement.refreshTokenHash, replacement);

    return replacement;
  }

  async markReplaced(_input: ReplaceRefreshSessionInput): Promise<void> {}

  async revokeCurrentDevice(sessionId: string, revokedAt: Date): Promise<void> {
    this.revokedCurrentDeviceInputs.push({ sessionId, revokedAt });
  }

  async revokeAllForUser(_userId: string, _revokedAt: Date): Promise<void> {}
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
  readonly refreshSessionStore: FakeRefreshSessionStore;
  readonly verifyPassword: ReturnType<typeof vi.fn>;
  readonly accessTokenService: AccessTokenService;
  readonly tokenHashingService: TokenHashingService;
} {
  const userStore = new FakeAuthUserStore();
  userStore.setContext('loginContext' in options ? options.loginContext : createLoginContext());

  const rateLimitStore = new FakeAuthRateLimitStore();
  rateLimitStore.setCount('account:owner@example.com', options.accountAttemptCount ?? 0);
  rateLimitStore.setCount('ip:203.0.113.10', options.ipAttemptCount ?? 0);

  const refreshSessionStore = new FakeRefreshSessionStore();

  const verifyPassword = vi.fn(async () => options.passwordMatches ?? true);

  const passwordHashingService = {
    verifyPassword,
    hashPassword: vi.fn(),
  } as unknown as PasswordHashingService;

  const accessTokenService = new AccessTokenService(signingOptions);
  const rateLimitService = new AuthRateLimitService(rateLimitStore);
  const authSessionService = new AuthSessionService(refreshSessionStore);
  const secureTokenService = new SecureTokenService();
  const tokenHashingService = new TokenHashingService();

  return {
    service: new AuthService(
      userStore,
      passwordHashingService,
      accessTokenService,
      rateLimitService,
      authSessionService,
      secureTokenService,
      tokenHashingService,
    ),
    userStore,
    rateLimitStore,
    refreshSessionStore,
    verifyPassword,
    accessTokenService,
    tokenHashingService,
  };
}

function getOnlyItem<T>(items: readonly T[], label: string): T {
  const item = items[0];

  if (item === undefined) {
    throw new Error(`${label} was not recorded.`);
  }

  return item;
}

describe('AuthService login', () => {
  it('returns login response data, a signed access token, and creates a refresh session for valid credentials', async () => {
    const {
      service,
      userStore,
      rateLimitStore,
      refreshSessionStore,
      verifyPassword,
      accessTokenService,
    } = createService();

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
    expect(response.refreshToken).toEqual(expect.any(String));
    expect(response.refreshSessionId).toEqual(expect.any(String));
    expect(response.rememberMe).toBe(true);

    const createdSession = getOnlyItem(
      refreshSessionStore.createInputs,
      'refresh session create input',
    );

    expect(createdSession).toEqual(
      expect.objectContaining({
        id: response.refreshSessionId,
        userId: '11111111-1111-4111-8111-111111111111',
        tenantId: '22222222-2222-4222-8222-222222222222',
        rememberMe: true,
      }),
    );
    expect(createdSession.refreshTokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(createdSession.refreshTokenHash).not.toBe(response.refreshToken);

    const verified = await accessTokenService.verify(response.access_token);

    expect(verified).toEqual(
      expect.objectContaining({
        token_type: 'access',
        user_id: '11111111-1111-4111-8111-111111111111',
        user_type: 'tenant_user',
        tenant_id: '22222222-2222-4222-8222-222222222222',
        email_verified: true,
        session_id: createdSession.id,
      }),
    );
  });

  it('records failed account and IP login attempts when the account does not exist', async () => {
    const { service, rateLimitStore, refreshSessionStore } = createService({
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

    expect(refreshSessionStore.createInputs).toEqual([]);
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
    const { service, rateLimitStore, refreshSessionStore } = createService({
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

    expect(refreshSessionStore.createInputs).toEqual([]);
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
    const { service, userStore, refreshSessionStore } = createService({
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
    expect(refreshSessionStore.createInputs).toEqual([]);
  });
});

describe('AuthService refresh', () => {
  it('rotates the refresh session and returns a new signed access token', async () => {
    const { service, userStore, refreshSessionStore, accessTokenService, tokenHashingService } =
      createService();

    const currentRefreshToken = 'current-refresh-token';
    const currentRefreshTokenHash = tokenHashingService.hashToken(currentRefreshToken);

    refreshSessionStore.setActiveSession({
      id: '44444444-4444-4444-8444-444444444444',
      userId: '11111111-1111-4111-8111-111111111111',
      tenantId: '22222222-2222-4222-8222-222222222222',
      tokenFamilyId: '55555555-5555-4555-8555-555555555555',
      refreshTokenHash: currentRefreshTokenHash,
      rememberMe: true,
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
      revokedAt: null,
      replacedBySessionId: null,
      createdAt: new Date('2026-06-26T00:00:00.000Z'),
    });

    const response = await service.refresh(currentRefreshToken);

    expect(userStore.userIdLookups).toEqual(['11111111-1111-4111-8111-111111111111']);
    expect(response.access_token).toEqual(expect.any(String));
    expect(response.expires_in_seconds).toBe(15 * 60);
    expect(response.refreshToken).toEqual(expect.any(String));
    expect(response.refreshSessionId).toEqual(expect.any(String));
    expect(response.rememberMe).toBe(true);

    const rotateInput = getOnlyItem(
      refreshSessionStore.rotateInputs,
      'refresh session rotate input',
    );

    expect(rotateInput).toEqual(
      expect.objectContaining({
        currentSessionId: '44444444-4444-4444-8444-444444444444',
        currentRefreshTokenHash,
        replacementSessionId: response.refreshSessionId,
      }),
    );
    expect(rotateInput.replacementRefreshTokenHash).not.toBe(currentRefreshTokenHash);
    expect(tokenHashingService.hashToken(response.refreshToken)).toBe(
      rotateInput.replacementRefreshTokenHash,
    );

    const verified = await accessTokenService.verify(response.access_token);

    expect(verified).toEqual(
      expect.objectContaining({
        token_type: 'access',
        user_id: '11111111-1111-4111-8111-111111111111',
        user_type: 'tenant_user',
        tenant_id: '22222222-2222-4222-8222-222222222222',
        email_verified: true,
        session_id: response.refreshSessionId,
      }),
    );
  });

  it('rejects missing refresh tokens', async () => {
    const { service } = createService();

    await expect(service.refresh(null)).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });

  it('rejects unknown refresh tokens', async () => {
    const { service } = createService();

    await expect(service.refresh('unknown-refresh-token')).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });

  it('revokes the current refresh session when the user is no longer active', async () => {
    const { service, userStore, refreshSessionStore, tokenHashingService } = createService();

    const currentRefreshToken = 'current-refresh-token';
    const currentRefreshTokenHash = tokenHashingService.hashToken(currentRefreshToken);

    userStore.setContext(null);

    refreshSessionStore.setActiveSession({
      id: '44444444-4444-4444-8444-444444444444',
      userId: '11111111-1111-4111-8111-111111111111',
      tenantId: '22222222-2222-4222-8222-222222222222',
      tokenFamilyId: '55555555-5555-4555-8555-555555555555',
      refreshTokenHash: currentRefreshTokenHash,
      rememberMe: false,
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
      revokedAt: null,
      replacedBySessionId: null,
      createdAt: new Date('2026-06-26T00:00:00.000Z'),
    });

    await expect(service.refresh(currentRefreshToken)).rejects.toMatchObject({
      code: 'unauthenticated',
    });

    expect(refreshSessionStore.revokedCurrentDeviceInputs).toEqual([
      expect.objectContaining({
        sessionId: '44444444-4444-4444-8444-444444444444',
      }),
    ]);
  });
});
