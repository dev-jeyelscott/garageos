export interface RefreshSessionRecord {
  readonly id: string;
  readonly userId: string;
  readonly tenantId: string | null;
  readonly tokenFamilyId: string;
  readonly refreshTokenHash: string;
  readonly rememberMe: boolean;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
  readonly replacedBySessionId: string | null;
  readonly createdAt: Date;
}

export interface CreateRefreshSessionInput {
  readonly id: string;
  readonly userId: string;
  readonly tenantId: string | null;
  readonly tokenFamilyId: string;
  readonly refreshTokenHash: string;
  readonly rememberMe: boolean;
  readonly expiresAt: Date;
}

export interface ReplaceRefreshSessionInput {
  readonly currentSessionId: string;
  readonly replacementSessionId: string;
  readonly revokedAt: Date;
}

export interface RotateRefreshSessionInput {
  readonly currentSessionId: string;
  readonly currentRefreshTokenHash: string;
  readonly replacementSessionId: string;
  readonly replacementRefreshTokenHash: string;
  readonly rotatedAt: Date;
}

export abstract class RefreshSessionStore {
  abstract create(input: CreateRefreshSessionInput): Promise<RefreshSessionRecord>;

  abstract findActiveByRefreshTokenHash(
    refreshTokenHash: string,
    now: Date,
  ): Promise<RefreshSessionRecord | null>;

  abstract findActiveById(sessionId: string, now: Date): Promise<RefreshSessionRecord | null>;

  abstract rotate(input: RotateRefreshSessionInput): Promise<RefreshSessionRecord | null>;

  abstract markReplaced(input: ReplaceRefreshSessionInput): Promise<void>;

  abstract revokeCurrentDevice(sessionId: string, revokedAt: Date): Promise<void>;

  abstract revokeAllForUser(userId: string, revokedAt: Date): Promise<void>;
}
