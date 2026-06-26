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
import { PasswordResetTokenStore } from './password-reset-token.store';
import type {
  CreatePasswordResetTokenInput,
  PasswordResetTokenRecord,
} from './password-reset-token.store';
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
import { EmailVerificationTokenStore } from './email-verification-token.store';
import type {
  CreateEmailVerificationTokenInput,
  EmailVerificationTokenRecord,
} from './email-verification-token.store';
import type { MarkAuthUserEmailVerifiedInput } from './auth-user.store';

const signingOptions = {
  issuer: 'garageos-api',
  audience: 'garageos-pwa',
  secret: 'test-access-token-secret-at-least-32-chars',
};

class FakeAuthUserStore extends AuthUserStore {
  readonly lookups: string[] = [];
  readonly userIdLookups: string[] = [];
  readonly emailVerificationInputs: MarkAuthUserEmailVerifiedInput[] = [];
  readonly updatedPasswordInputs: {
    readonly userId: string;
    readonly passwordHash: string;
    readonly passwordChangedAt: Date;
  }[] = [];

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

  async updatePasswordHash(input: {
    readonly userId: string;
    readonly passwordHash: string;
    readonly passwordChangedAt: Date;
  }): Promise<void> {
    this.updatedPasswordInputs.push(input);
  }

  async markEmailVerified(input: MarkAuthUserEmailVerifiedInput): Promise<boolean> {
    this.emailVerificationInputs.push(input);

    if (
      this.context === null ||
      this.context.user.id !== input.userId ||
      this.context.user.email.trim().toLowerCase() !== input.email.trim().toLowerCase()
    ) {
      return false;
    }

    this.context = {
      ...this.context,
      user: {
        ...this.context.user,
        emailVerifiedAt: input.emailVerifiedAt,
      },
    };

    return true;
  }
}

class FakeRefreshSessionStore extends RefreshSessionStore {
  readonly createInputs: CreateRefreshSessionInput[] = [];
  readonly rotateInputs: RotateRefreshSessionInput[] = [];
  readonly revokedCurrentDeviceInputs: { readonly sessionId: string; readonly revokedAt: Date }[] =
    [];
  readonly revokedAllForUserInputs: { readonly userId: string; readonly revokedAt: Date }[] = [];

  private readonly sessionsByHash = new Map<string, RefreshSessionRecord>();
  private readonly sessionsById = new Map<string, RefreshSessionRecord>();

  private saveSession(record: RefreshSessionRecord): void {
    this.sessionsByHash.set(record.refreshTokenHash, record);
    this.sessionsById.set(record.id, record);
  }

  setActiveSession(record: RefreshSessionRecord): void {
    this.saveSession(record);
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

    this.saveSession(record);

    return record;
  }

  async findActiveById(sessionId: string, now: Date): Promise<RefreshSessionRecord | null> {
    const session = this.sessionsById.get(sessionId);

    if (session === undefined || session.revokedAt !== null || session.expiresAt <= now) {
      return null;
    }

    return session;
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

    this.saveSession({
      ...current,
      revokedAt: input.rotatedAt,
      replacedBySessionId: input.replacementSessionId,
    });

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

    this.saveSession(replacement);

    return replacement;
  }

  async markReplaced(_input: ReplaceRefreshSessionInput): Promise<void> {}

  async revokeCurrentDevice(sessionId: string, revokedAt: Date): Promise<void> {
    this.revokedCurrentDeviceInputs.push({ sessionId, revokedAt });

    const current = this.sessionsById.get(sessionId);

    if (current !== undefined && current.revokedAt === null) {
      this.saveSession({
        ...current,
        revokedAt,
      });
    }
  }

  async revokeAllForUser(userId: string, revokedAt: Date): Promise<void> {
    this.revokedAllForUserInputs.push({ userId, revokedAt });

    for (const session of this.sessionsById.values()) {
      if (session.userId === userId && session.revokedAt === null) {
        this.saveSession({
          ...session,
          revokedAt,
        });
      }
    }
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

class FakePasswordResetTokenStore extends PasswordResetTokenStore {
  readonly createInputs: CreatePasswordResetTokenInput[] = [];
  readonly consumeInputs: { readonly tokenHash: string; readonly consumedAt: Date }[] = [];

  private readonly tokensByHash = new Map<string, PasswordResetTokenRecord>();

  setActiveToken(record: PasswordResetTokenRecord): void {
    this.tokensByHash.set(record.tokenHash, record);
  }

  async create(input: CreatePasswordResetTokenInput): Promise<PasswordResetTokenRecord> {
    this.createInputs.push(input);

    const record: PasswordResetTokenRecord = {
      id: input.id,
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      usedAt: null,
      createdAt: new Date('2026-06-26T00:00:00.000Z'),
    };

    this.tokensByHash.set(record.tokenHash, record);

    return record;
  }

  async consumeActiveByTokenHash(
    tokenHash: string,
    consumedAt: Date,
  ): Promise<PasswordResetTokenRecord | null> {
    this.consumeInputs.push({ tokenHash, consumedAt });

    const token = this.tokensByHash.get(tokenHash);

    if (token === undefined || token.usedAt !== null || token.expiresAt <= consumedAt) {
      return null;
    }

    const consumedToken: PasswordResetTokenRecord = {
      ...token,
      usedAt: consumedAt,
    };

    this.tokensByHash.set(tokenHash, consumedToken);

    return consumedToken;
  }
}

class FakeEmailVerificationTokenStore extends EmailVerificationTokenStore {
  readonly createInputs: CreateEmailVerificationTokenInput[] = [];
  readonly consumeInputs: { readonly tokenHash: string; readonly consumedAt: Date }[] = [];

  private readonly tokensByHash = new Map<string, EmailVerificationTokenRecord>();

  setActiveToken(record: EmailVerificationTokenRecord): void {
    this.tokensByHash.set(record.tokenHash, record);
  }

  async create(input: CreateEmailVerificationTokenInput): Promise<EmailVerificationTokenRecord> {
    this.createInputs.push(input);

    const record: EmailVerificationTokenRecord = {
      id: input.id,
      userId: input.userId,
      tokenHash: input.tokenHash,
      email: input.email,
      expiresAt: input.expiresAt,
      usedAt: null,
      createdAt: new Date('2026-06-26T00:00:00.000Z'),
    };

    this.tokensByHash.set(record.tokenHash, record);

    return record;
  }

  async consumeActiveByTokenHash(
    tokenHash: string,
    consumedAt: Date,
  ): Promise<EmailVerificationTokenRecord | null> {
    this.consumeInputs.push({ tokenHash, consumedAt });

    const token = this.tokensByHash.get(tokenHash);

    if (token === undefined || token.usedAt !== null || token.expiresAt <= consumedAt) {
      return null;
    }

    const consumedToken: EmailVerificationTokenRecord = {
      ...token,
      usedAt: consumedAt,
    };

    this.tokensByHash.set(tokenHash, consumedToken);

    return consumedToken;
  }
}

function createLoginContext(
  userOverrides: Partial<AuthLoginContext['user']> = {},
): AuthLoginContext {
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
      ...userOverrides,
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
    effectivePlan: {
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
  readonly passwordResetTokenStore: FakePasswordResetTokenStore;
  readonly verifyPassword: ReturnType<typeof vi.fn>;
  readonly hashPassword: ReturnType<typeof vi.fn>;
  readonly accessTokenService: AccessTokenService;
  readonly tokenHashingService: TokenHashingService;
  readonly emailVerificationTokenStore: FakeEmailVerificationTokenStore;
} {
  const userStore = new FakeAuthUserStore();
  userStore.setContext('loginContext' in options ? options.loginContext : createLoginContext());

  const rateLimitStore = new FakeAuthRateLimitStore();
  rateLimitStore.setCount('account:owner@example.com', options.accountAttemptCount ?? 0);
  rateLimitStore.setCount('ip:203.0.113.10', options.ipAttemptCount ?? 0);

  const refreshSessionStore = new FakeRefreshSessionStore();
  const passwordResetTokenStore = new FakePasswordResetTokenStore();

  const verifyPassword = vi.fn(async () => options.passwordMatches ?? true);
  const hashPassword = vi.fn(async (password: string) => `hashed:${password}`);

  const passwordHashingService = {
    verifyPassword,
    hashPassword,
  } as unknown as PasswordHashingService;

  const accessTokenService = new AccessTokenService(signingOptions);
  const rateLimitService = new AuthRateLimitService(rateLimitStore);
  const authSessionService = new AuthSessionService(refreshSessionStore);
  const secureTokenService = new SecureTokenService();
  const tokenHashingService = new TokenHashingService();
  const emailVerificationTokenStore = new FakeEmailVerificationTokenStore();

  return {
    service: new AuthService(
      userStore,
      passwordHashingService,
      accessTokenService,
      rateLimitService,
      authSessionService,
      passwordResetTokenStore,
      emailVerificationTokenStore,
      secureTokenService,
      tokenHashingService,
    ),
    userStore,
    rateLimitStore,
    refreshSessionStore,
    passwordResetTokenStore,
    verifyPassword,
    hashPassword,
    emailVerificationTokenStore,
    accessTokenService,
    tokenHashingService,
  };
}

function createEmailVerificationTokenRecord(
  overrides: Partial<EmailVerificationTokenRecord> = {},
): EmailVerificationTokenRecord {
  return {
    id: '77777777-7777-4777-8777-777777777777',
    userId: '11111111-1111-4111-8111-111111111111',
    tokenHash: 'email-verification-token-hash',
    email: 'owner@example.com',
    expiresAt: new Date('2099-01-01T00:00:00.000Z'),
    usedAt: null,
    createdAt: new Date('2026-06-26T00:00:00.000Z'),
    ...overrides,
  };
}

function createPasswordResetTokenRecord(
  overrides: Partial<PasswordResetTokenRecord> = {},
): PasswordResetTokenRecord {
  return {
    id: '66666666-6666-4666-8666-666666666666',
    userId: '11111111-1111-4111-8111-111111111111',
    tokenHash: 'password-reset-token-hash',
    expiresAt: new Date('2099-01-01T00:00:00.000Z'),
    usedAt: null,
    createdAt: new Date('2026-06-26T00:00:00.000Z'),
    ...overrides,
  };
}

function getOnlyItem<T>(items: readonly T[], label: string): T {
  const item = items[0];

  if (item === undefined) {
    throw new Error(`${label} was not recorded.`);
  }

  return item;
}

function createRefreshSessionRecord(
  overrides: Partial<RefreshSessionRecord> = {},
): RefreshSessionRecord {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    userId: '11111111-1111-4111-8111-111111111111',
    tenantId: '22222222-2222-4222-8222-222222222222',
    tokenFamilyId: '55555555-5555-4555-8555-555555555555',
    refreshTokenHash: 'refresh-token-hash',
    rememberMe: true,
    expiresAt: new Date('2099-01-01T00:00:00.000Z'),
    revokedAt: null,
    replacedBySessionId: null,
    createdAt: new Date('2026-06-26T00:00:00.000Z'),
    ...overrides,
  };
}

describe('AuthService signupOwner', () => {
  it('keeps owner signup intentionally blocked until Milestone 3 tenant lifecycle and onboarding are implemented', () => {
    const { service } = createService();

    expect(() => service.signupOwner()).toThrow(
      expect.objectContaining({
        code: 'service_unavailable',
        message:
          'Owner signup is intentionally unavailable until Milestone 3 tenant lifecycle and onboarding implementation is completed.',
      }),
    );
  });
});

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

describe('AuthService logout', () => {
  it('revokes the current device refresh session matched by hashed refresh token', async () => {
    const { service, refreshSessionStore, tokenHashingService } = createService();

    const currentRefreshToken = 'current-refresh-token';
    const currentRefreshTokenHash = tokenHashingService.hashToken(currentRefreshToken);

    refreshSessionStore.setActiveSession(
      createRefreshSessionRecord({
        refreshTokenHash: currentRefreshTokenHash,
      }),
    );

    await expect(service.logout(` ${currentRefreshToken} `)).resolves.toEqual({});

    expect(refreshSessionStore.revokedCurrentDeviceInputs).toEqual([
      expect.objectContaining({
        sessionId: '44444444-4444-4444-8444-444444444444',
      }),
    ]);
    expect(refreshSessionStore.revokedAllForUserInputs).toEqual([]);
  });

  it('rejects missing refresh tokens for current-device logout', async () => {
    const { service, refreshSessionStore } = createService();

    await expect(service.logout(null)).rejects.toMatchObject({
      code: 'unauthenticated',
    });

    expect(refreshSessionStore.revokedCurrentDeviceInputs).toEqual([]);
    expect(refreshSessionStore.revokedAllForUserInputs).toEqual([]);
  });

  it('rejects unknown refresh tokens for current-device logout', async () => {
    const { service, refreshSessionStore } = createService();

    await expect(service.logout('unknown-refresh-token')).rejects.toMatchObject({
      code: 'unauthenticated',
    });

    expect(refreshSessionStore.revokedCurrentDeviceInputs).toEqual([]);
    expect(refreshSessionStore.revokedAllForUserInputs).toEqual([]);
  });
});

describe('AuthService logoutAll', () => {
  it('revokes all active refresh sessions for the user matched by hashed refresh token', async () => {
    const { service, refreshSessionStore, tokenHashingService } = createService();

    const currentRefreshToken = 'current-refresh-token';
    const currentRefreshTokenHash = tokenHashingService.hashToken(currentRefreshToken);

    refreshSessionStore.setActiveSession(
      createRefreshSessionRecord({
        refreshTokenHash: currentRefreshTokenHash,
      }),
    );

    await expect(service.logoutAll(currentRefreshToken)).resolves.toEqual({});

    expect(refreshSessionStore.revokedCurrentDeviceInputs).toEqual([]);
    expect(refreshSessionStore.revokedAllForUserInputs).toEqual([
      expect.objectContaining({
        userId: '11111111-1111-4111-8111-111111111111',
      }),
    ]);
  });

  it('rejects missing refresh tokens for logout-all', async () => {
    const { service, refreshSessionStore } = createService();

    await expect(service.logoutAll(null)).rejects.toMatchObject({
      code: 'unauthenticated',
    });

    expect(refreshSessionStore.revokedCurrentDeviceInputs).toEqual([]);
    expect(refreshSessionStore.revokedAllForUserInputs).toEqual([]);
  });

  it('rejects unknown refresh tokens for logout-all', async () => {
    const { service, refreshSessionStore } = createService();

    await expect(service.logoutAll('unknown-refresh-token')).rejects.toMatchObject({
      code: 'unauthenticated',
    });

    expect(refreshSessionStore.revokedCurrentDeviceInputs).toEqual([]);
    expect(refreshSessionStore.revokedAllForUserInputs).toEqual([]);
  });
});

describe('AuthService forgotPassword', () => {
  it('rate-limits and creates a hashed password reset token for an active account', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-26T10:00:00.000Z'));

    try {
      const { service, rateLimitStore, passwordResetTokenStore } = createService();

      await expect(
        service.forgotPassword({
          email: ' Owner@Example.com ',
        }),
      ).resolves.toEqual({});

      expect(rateLimitStore.countInputs).toEqual([
        expect.objectContaining({
          bucket: 'auth.password_reset',
          key: 'account:owner@example.com',
        }),
      ]);

      expect(rateLimitStore.recordInputs).toEqual([
        expect.objectContaining({
          bucket: 'auth.password_reset',
          key: 'account:owner@example.com',
          tenantId: '22222222-2222-4222-8222-222222222222',
          userId: '11111111-1111-4111-8111-111111111111',
          ipAddress: null,
        }),
      ]);

      const createdToken = getOnlyItem(
        passwordResetTokenStore.createInputs,
        'password reset token create input',
      );

      expect(createdToken).toEqual(
        expect.objectContaining({
          userId: '11111111-1111-4111-8111-111111111111',
          expiresAt: new Date('2026-06-26T10:30:00.000Z'),
        }),
      );
      expect(createdToken.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not reveal whether an account exists', async () => {
    const { service, rateLimitStore, passwordResetTokenStore } = createService({
      loginContext: null,
    });

    await expect(
      service.forgotPassword({
        email: 'missing@example.com',
      }),
    ).resolves.toEqual({});

    expect(rateLimitStore.recordInputs).toEqual([
      expect.objectContaining({
        bucket: 'auth.password_reset',
        key: 'account:missing@example.com',
        tenantId: null,
        userId: null,
      }),
    ]);
    expect(passwordResetTokenStore.createInputs).toEqual([]);
  });

  it('blocks reset requests when the password reset rate limit is exceeded', async () => {
    const { service, userStore, passwordResetTokenStore, rateLimitStore } = createService();

    rateLimitStore.setCount('account:owner@example.com', 3);

    await expect(
      service.forgotPassword({
        email: 'owner@example.com',
      }),
    ).rejects.toMatchObject({
      code: 'rate_limited',
    });

    expect(userStore.lookups).toEqual([]);
    expect(passwordResetTokenStore.createInputs).toEqual([]);
  });
});

describe('AuthService getSession', () => {
  it('returns the current authenticated session context for a valid bearer access token', async () => {
    const { service } = createService();

    const loginResponse = await service.login({
      email: 'owner@example.com',
      password: 'Secret123',
      remember_me: true,
    });

    const response = await service.getSession(`Bearer ${loginResponse.access_token}`);

    expect(response).toEqual({
      user: {
        id: '11111111-1111-4111-8111-111111111111',
        user_type: 'tenant_user',
        full_name: 'Juan Dela Cruz',
        email: 'owner@example.com',
        email_verified: true,
        status: 'active',
      },
      tenant: {
        id: '22222222-2222-4222-8222-222222222222',
        business_name: 'Moto Garage',
        status: 'active',
        timezone: 'Asia/Manila',
        country: 'PH',
        currency: 'PHP',
      },
      effective_permissions: ['customers.read', 'job_orders.create'],
      branches: [
        {
          id: '33333333-3333-4333-8333-333333333333',
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
    });
  });

  it('rejects missing authorization headers', async () => {
    const { service } = createService();

    await expect(service.getSession(null)).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });

  it('rejects access tokens when the backing refresh session has been revoked', async () => {
    const { service } = createService();

    const loginResponse = await service.login({
      email: 'owner@example.com',
      password: 'Secret123',
      remember_me: true,
    });

    await service.logout(loginResponse.refreshToken);

    await expect(service.getSession(`Bearer ${loginResponse.access_token}`)).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });

  it('rejects access tokens when the user is no longer active', async () => {
    const { service, userStore } = createService();

    const loginResponse = await service.login({
      email: 'owner@example.com',
      password: 'Secret123',
      remember_me: true,
    });

    userStore.setContext(null);

    await expect(service.getSession(`Bearer ${loginResponse.access_token}`)).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });
});

describe('AuthService resetPassword', () => {
  it('consumes a reset token, updates the password hash, and revokes all sessions', async () => {
    const {
      service,
      userStore,
      refreshSessionStore,
      passwordResetTokenStore,
      tokenHashingService,
      hashPassword,
    } = createService();

    const rawResetToken = 'raw-reset-token';
    const tokenHash = tokenHashingService.hashToken(rawResetToken);

    passwordResetTokenStore.setActiveToken(
      createPasswordResetTokenRecord({
        tokenHash,
      }),
    );

    await expect(
      service.resetPassword({
        token: rawResetToken,
        new_password: 'NewSecret123',
      }),
    ).resolves.toEqual({});

    expect(passwordResetTokenStore.consumeInputs).toEqual([
      expect.objectContaining({
        tokenHash,
      }),
    ]);
    expect(hashPassword).toHaveBeenCalledWith('NewSecret123');
    expect(userStore.updatedPasswordInputs).toEqual([
      expect.objectContaining({
        userId: '11111111-1111-4111-8111-111111111111',
        passwordHash: 'hashed:NewSecret123',
      }),
    ]);
    expect(refreshSessionStore.revokedAllForUserInputs).toEqual([
      expect.objectContaining({
        userId: '11111111-1111-4111-8111-111111111111',
      }),
    ]);
  });

  it('rejects missing, used, expired, or unknown reset tokens', async () => {
    const { service, userStore, refreshSessionStore } = createService();

    await expect(
      service.resetPassword({
        token: 'unknown-reset-token',
        new_password: 'NewSecret123',
      }),
    ).rejects.toMatchObject({
      code: 'unauthenticated',
    });

    expect(userStore.updatedPasswordInputs).toEqual([]);
    expect(refreshSessionStore.revokedAllForUserInputs).toEqual([]);
  });
});

describe('AuthService changePassword', () => {
  it('verifies the current password, updates the password hash, and revokes all sessions', async () => {
    const {
      service,
      userStore,
      refreshSessionStore,
      tokenHashingService,
      verifyPassword,
      hashPassword,
    } = createService();

    const currentRefreshToken = 'current-refresh-token';
    const currentRefreshTokenHash = tokenHashingService.hashToken(currentRefreshToken);

    refreshSessionStore.setActiveSession(
      createRefreshSessionRecord({
        refreshTokenHash: currentRefreshTokenHash,
      }),
    );

    await expect(
      service.changePassword(
        {
          current_password: 'Secret123',
          new_password: 'NewSecret123',
        },
        currentRefreshToken,
      ),
    ).resolves.toEqual({});

    expect(verifyPassword).toHaveBeenCalledWith('Secret123', 'hashed-password');
    expect(hashPassword).toHaveBeenCalledWith('NewSecret123');
    expect(userStore.updatedPasswordInputs).toEqual([
      expect.objectContaining({
        userId: '11111111-1111-4111-8111-111111111111',
        passwordHash: 'hashed:NewSecret123',
      }),
    ]);
    expect(refreshSessionStore.revokedAllForUserInputs).toEqual([
      expect.objectContaining({
        userId: '11111111-1111-4111-8111-111111111111',
      }),
    ]);
  });

  it('rejects an invalid current password without changing credentials', async () => {
    const { service, userStore, refreshSessionStore, tokenHashingService } = createService({
      passwordMatches: false,
    });

    const currentRefreshToken = 'current-refresh-token';
    const currentRefreshTokenHash = tokenHashingService.hashToken(currentRefreshToken);

    refreshSessionStore.setActiveSession(
      createRefreshSessionRecord({
        refreshTokenHash: currentRefreshTokenHash,
      }),
    );

    await expect(
      service.changePassword(
        {
          current_password: 'WrongSecret123',
          new_password: 'NewSecret123',
        },
        currentRefreshToken,
      ),
    ).rejects.toMatchObject({
      code: 'unauthenticated',
    });

    expect(userStore.updatedPasswordInputs).toEqual([]);
    expect(refreshSessionStore.revokedAllForUserInputs).toEqual([]);
  });
});

describe('AuthService resendEmailVerification', () => {
  it('rate-limits and creates a hashed email verification token for an unverified active session user', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-26T10:00:00.000Z'));

    try {
      const {
        service,
        rateLimitStore,
        refreshSessionStore,
        emailVerificationTokenStore,
        tokenHashingService,
      } = createService({
        loginContext: createLoginContext({
          emailVerifiedAt: null,
        }),
      });

      const currentRefreshToken = 'current-refresh-token';
      const currentRefreshTokenHash = tokenHashingService.hashToken(currentRefreshToken);

      refreshSessionStore.setActiveSession(
        createRefreshSessionRecord({
          refreshTokenHash: currentRefreshTokenHash,
        }),
      );

      await expect(service.resendEmailVerification(currentRefreshToken)).resolves.toEqual({});

      expect(rateLimitStore.countInputs).toEqual([
        expect.objectContaining({
          bucket: 'auth.email_verification_resend',
          key: 'account:owner@example.com',
        }),
      ]);

      expect(rateLimitStore.recordInputs).toEqual([
        expect.objectContaining({
          bucket: 'auth.email_verification_resend',
          key: 'account:owner@example.com',
          tenantId: '22222222-2222-4222-8222-222222222222',
          userId: '11111111-1111-4111-8111-111111111111',
          ipAddress: null,
        }),
      ]);

      const createdToken = getOnlyItem(
        emailVerificationTokenStore.createInputs,
        'email verification token create input',
      );

      expect(createdToken).toEqual(
        expect.objectContaining({
          userId: '11111111-1111-4111-8111-111111111111',
          email: 'owner@example.com',
          expiresAt: new Date('2026-06-27T10:00:00.000Z'),
        }),
      );
      expect(createdToken.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not create a new token when the session user is already verified', async () => {
    const { service, refreshSessionStore, emailVerificationTokenStore, tokenHashingService } =
      createService();

    const currentRefreshToken = 'current-refresh-token';
    const currentRefreshTokenHash = tokenHashingService.hashToken(currentRefreshToken);

    refreshSessionStore.setActiveSession(
      createRefreshSessionRecord({
        refreshTokenHash: currentRefreshTokenHash,
      }),
    );

    await expect(service.resendEmailVerification(currentRefreshToken)).resolves.toEqual({});

    expect(emailVerificationTokenStore.createInputs).toEqual([]);
  });

  it('blocks resend when the email verification resend rate limit is exceeded', async () => {
    const {
      service,
      rateLimitStore,
      refreshSessionStore,
      emailVerificationTokenStore,
      tokenHashingService,
    } = createService({
      loginContext: createLoginContext({
        emailVerifiedAt: null,
      }),
    });

    rateLimitStore.setCount('account:owner@example.com', 5);

    const currentRefreshToken = 'current-refresh-token';
    const currentRefreshTokenHash = tokenHashingService.hashToken(currentRefreshToken);

    refreshSessionStore.setActiveSession(
      createRefreshSessionRecord({
        refreshTokenHash: currentRefreshTokenHash,
      }),
    );

    await expect(service.resendEmailVerification(currentRefreshToken)).rejects.toMatchObject({
      code: 'rate_limited',
    });

    expect(emailVerificationTokenStore.createInputs).toEqual([]);
  });
});

describe('AuthService confirmEmailVerification', () => {
  it('consumes a verification token and marks the matching active user email as verified', async () => {
    const { service, userStore, emailVerificationTokenStore, tokenHashingService } = createService({
      loginContext: createLoginContext({
        emailVerifiedAt: null,
      }),
    });

    const rawVerificationToken = 'raw-email-verification-token';
    const tokenHash = tokenHashingService.hashToken(rawVerificationToken);

    emailVerificationTokenStore.setActiveToken(
      createEmailVerificationTokenRecord({
        tokenHash,
      }),
    );

    await expect(
      service.confirmEmailVerification({
        token: rawVerificationToken,
      }),
    ).resolves.toEqual({});

    expect(emailVerificationTokenStore.consumeInputs).toEqual([
      expect.objectContaining({
        tokenHash,
      }),
    ]);

    expect(userStore.emailVerificationInputs).toEqual([
      expect.objectContaining({
        userId: '11111111-1111-4111-8111-111111111111',
        email: 'owner@example.com',
      }),
    ]);
  });

  it('rejects missing, used, expired, or unknown verification tokens', async () => {
    const { service, userStore } = createService();

    await expect(
      service.confirmEmailVerification({
        token: 'unknown-email-verification-token',
      }),
    ).rejects.toMatchObject({
      code: 'unauthenticated',
    });

    expect(userStore.emailVerificationInputs).toEqual([]);
  });

  it('rejects a valid token when the token email no longer matches an active user email', async () => {
    const { service, userStore, emailVerificationTokenStore, tokenHashingService } =
      createService();

    const rawVerificationToken = 'raw-email-verification-token';
    const tokenHash = tokenHashingService.hashToken(rawVerificationToken);

    emailVerificationTokenStore.setActiveToken(
      createEmailVerificationTokenRecord({
        tokenHash,
        email: 'old-owner@example.com',
      }),
    );

    await expect(
      service.confirmEmailVerification({
        token: rawVerificationToken,
      }),
    ).rejects.toMatchObject({
      code: 'unauthenticated',
    });

    expect(userStore.emailVerificationInputs).toEqual([
      expect.objectContaining({
        userId: '11111111-1111-4111-8111-111111111111',
        email: 'old-owner@example.com',
      }),
    ]);
  });
});
