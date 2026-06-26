import { describe, expect, it } from 'vitest';

import { AuthSessionService } from './auth-session.service';
import type {
  CreateRefreshSessionInput,
  RefreshSessionRecord,
  ReplaceRefreshSessionInput,
  RotateRefreshSessionInput,
} from './refresh-session.store';
import { RefreshSessionStore } from './refresh-session.store';

class FakeRefreshSessionStore extends RefreshSessionStore {
  readonly calls: Array<{
    readonly method: string;
    readonly input: unknown;
  }> = [];

  private activeSession: RefreshSessionRecord | null = null;

  setActiveSession(session: RefreshSessionRecord | null): void {
    this.activeSession = session;
  }

  async create(input: CreateRefreshSessionInput): Promise<RefreshSessionRecord> {
    this.calls.push({ method: 'create', input });

    const session: RefreshSessionRecord = {
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

    this.activeSession = session;

    return session;
  }

  async findActiveByRefreshTokenHash(
    refreshTokenHash: string,
    now: Date,
  ): Promise<RefreshSessionRecord | null> {
    this.calls.push({
      method: 'findActiveByRefreshTokenHash',
      input: { refreshTokenHash, now },
    });

    if (
      this.activeSession === null ||
      this.activeSession.refreshTokenHash !== refreshTokenHash ||
      this.activeSession.revokedAt !== null ||
      this.activeSession.expiresAt <= now
    ) {
      return null;
    }

    return this.activeSession;
  }

  async findActiveById(sessionId: string, now: Date): Promise<RefreshSessionRecord | null> {
    this.calls.push({
      method: 'findActiveById',
      input: { sessionId, now },
    });

    if (
      this.activeSession === null ||
      this.activeSession.id !== sessionId ||
      this.activeSession.revokedAt !== null ||
      this.activeSession.expiresAt <= now
    ) {
      return null;
    }

    return this.activeSession;
  }

  async rotate(input: RotateRefreshSessionInput): Promise<RefreshSessionRecord | null> {
    this.calls.push({ method: 'rotate', input });

    if (
      this.activeSession === null ||
      this.activeSession.id !== input.currentSessionId ||
      this.activeSession.refreshTokenHash !== input.currentRefreshTokenHash ||
      this.activeSession.revokedAt !== null ||
      this.activeSession.expiresAt <= input.rotatedAt
    ) {
      return null;
    }

    const replacementSession: RefreshSessionRecord = {
      id: input.replacementSessionId,
      userId: this.activeSession.userId,
      tenantId: this.activeSession.tenantId,
      tokenFamilyId: this.activeSession.tokenFamilyId,
      refreshTokenHash: input.replacementRefreshTokenHash,
      rememberMe: this.activeSession.rememberMe,
      expiresAt: this.activeSession.expiresAt,
      revokedAt: null,
      replacedBySessionId: null,
      createdAt: input.rotatedAt,
    };

    this.activeSession = replacementSession;

    return replacementSession;
  }

  async markReplaced(input: ReplaceRefreshSessionInput): Promise<void> {
    this.calls.push({ method: 'markReplaced', input });
  }

  async revokeCurrentDevice(sessionId: string, revokedAt: Date): Promise<void> {
    this.calls.push({
      method: 'revokeCurrentDevice',
      input: { sessionId, revokedAt },
    });

    if (this.activeSession?.id === sessionId) {
      this.activeSession = {
        ...this.activeSession,
        revokedAt,
      };
    }
  }

  async revokeAllForUser(userId: string, revokedAt: Date): Promise<void> {
    this.calls.push({
      method: 'revokeAllForUser',
      input: { userId, revokedAt },
    });

    if (this.activeSession?.userId === userId) {
      this.activeSession = {
        ...this.activeSession,
        revokedAt,
      };
    }
  }
}

describe('AuthSessionService', () => {
  it('creates refresh sessions through the configured store boundary', async () => {
    const store = new FakeRefreshSessionStore();
    const service = new AuthSessionService(store);

    const expiresAt = new Date('2026-07-26T00:00:00.000Z');

    const session = await service.createRefreshSession({
      id: '11111111-1111-4111-8111-111111111111',
      userId: '22222222-2222-4222-8222-222222222222',
      tenantId: '33333333-3333-4333-8333-333333333333',
      tokenFamilyId: '44444444-4444-4444-8444-444444444444',
      refreshTokenHash: 'refresh-token-hash',
      rememberMe: true,
      expiresAt,
    });

    expect(store.calls).toEqual([
      {
        method: 'create',
        input: {
          id: '11111111-1111-4111-8111-111111111111',
          userId: '22222222-2222-4222-8222-222222222222',
          tenantId: '33333333-3333-4333-8333-333333333333',
          tokenFamilyId: '44444444-4444-4444-8444-444444444444',
          refreshTokenHash: 'refresh-token-hash',
          rememberMe: true,
          expiresAt,
        },
      },
    ]);

    expect(session.id).toBe('11111111-1111-4111-8111-111111111111');
    expect(session.refreshTokenHash).toBe('refresh-token-hash');
    expect(session.rememberMe).toBe(true);
  });

  it('finds an active refresh session by hash through the store boundary', async () => {
    const store = new FakeRefreshSessionStore();
    const service = new AuthSessionService(store);

    const now = new Date('2026-06-26T00:00:00.000Z');

    const activeSession: RefreshSessionRecord = {
      id: '11111111-1111-4111-8111-111111111111',
      userId: '22222222-2222-4222-8222-222222222222',
      tenantId: null,
      tokenFamilyId: '44444444-4444-4444-8444-444444444444',
      refreshTokenHash: 'refresh-token-hash',
      rememberMe: false,
      expiresAt: new Date('2026-06-26T01:00:00.000Z'),
      revokedAt: null,
      replacedBySessionId: null,
      createdAt: new Date('2026-06-26T00:00:00.000Z'),
    };

    store.setActiveSession(activeSession);

    await expect(
      service.findActiveRefreshSession({
        refreshTokenHash: 'refresh-token-hash',
        now,
      }),
    ).resolves.toEqual(activeSession);

    expect(store.calls).toEqual([
      {
        method: 'findActiveByRefreshTokenHash',
        input: {
          refreshTokenHash: 'refresh-token-hash',
          now,
        },
      },
    ]);
  });

  it('rotates refresh sessions through the configured store boundary', async () => {
    const store = new FakeRefreshSessionStore();
    const service = new AuthSessionService(store);

    const rotatedAt = new Date('2026-06-26T00:00:00.000Z');

    const activeSession: RefreshSessionRecord = {
      id: '11111111-1111-4111-8111-111111111111',
      userId: '22222222-2222-4222-8222-222222222222',
      tenantId: '33333333-3333-4333-8333-333333333333',
      tokenFamilyId: '44444444-4444-4444-8444-444444444444',
      refreshTokenHash: 'current-refresh-token-hash',
      rememberMe: true,
      expiresAt: new Date('2026-07-26T00:00:00.000Z'),
      revokedAt: null,
      replacedBySessionId: null,
      createdAt: new Date('2026-06-26T00:00:00.000Z'),
    };

    store.setActiveSession(activeSession);

    const rotatedSession = await service.rotateRefreshSession({
      currentSessionId: '11111111-1111-4111-8111-111111111111',
      currentRefreshTokenHash: 'current-refresh-token-hash',
      replacementSessionId: '55555555-5555-4555-8555-555555555555',
      replacementRefreshTokenHash: 'replacement-refresh-token-hash',
      rotatedAt,
    });

    expect(store.calls).toEqual([
      {
        method: 'rotate',
        input: {
          currentSessionId: '11111111-1111-4111-8111-111111111111',
          currentRefreshTokenHash: 'current-refresh-token-hash',
          replacementSessionId: '55555555-5555-4555-8555-555555555555',
          replacementRefreshTokenHash: 'replacement-refresh-token-hash',
          rotatedAt,
        },
      },
    ]);

    expect(rotatedSession).toEqual(
      expect.objectContaining({
        id: '55555555-5555-4555-8555-555555555555',
        userId: '22222222-2222-4222-8222-222222222222',
        tenantId: '33333333-3333-4333-8333-333333333333',
        tokenFamilyId: '44444444-4444-4444-8444-444444444444',
        refreshTokenHash: 'replacement-refresh-token-hash',
        rememberMe: true,
      }),
    );
  });

  it('marks refresh sessions as replaced through the store boundary', async () => {
    const store = new FakeRefreshSessionStore();
    const service = new AuthSessionService(store);

    const revokedAt = new Date('2026-06-26T00:00:00.000Z');

    await service.markRefreshSessionReplaced({
      currentSessionId: '11111111-1111-4111-8111-111111111111',
      replacementSessionId: '22222222-2222-4222-8222-222222222222',
      revokedAt,
    });

    expect(store.calls).toEqual([
      {
        method: 'markReplaced',
        input: {
          currentSessionId: '11111111-1111-4111-8111-111111111111',
          replacementSessionId: '22222222-2222-4222-8222-222222222222',
          revokedAt,
        },
      },
    ]);
  });

  it('revokes the current refresh session through the store boundary', async () => {
    const store = new FakeRefreshSessionStore();
    const service = new AuthSessionService(store);

    const revokedAt = new Date('2026-06-26T00:00:00.000Z');

    await service.revokeCurrentRefreshSession({
      sessionId: '11111111-1111-4111-8111-111111111111',
      revokedAt,
    });

    expect(store.calls).toEqual([
      {
        method: 'revokeCurrentDevice',
        input: {
          sessionId: '11111111-1111-4111-8111-111111111111',
          revokedAt,
        },
      },
    ]);
  });

  it('revokes all refresh sessions for a user through the store boundary', async () => {
    const store = new FakeRefreshSessionStore();
    const service = new AuthSessionService(store);

    const revokedAt = new Date('2026-06-26T00:00:00.000Z');

    await service.revokeAllRefreshSessionsForUser({
      userId: '22222222-2222-4222-8222-222222222222',
      revokedAt,
    });

    expect(store.calls).toEqual([
      {
        method: 'revokeAllForUser',
        input: {
          userId: '22222222-2222-4222-8222-222222222222',
          revokedAt,
        },
      },
    ]);
  });
});
