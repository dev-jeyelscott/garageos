export interface RefreshSessionRecord {
  id: string;
  userId: string;
  tenantId: string | null;
  tokenFamilyId: string;
  refreshTokenHash: string;
  rememberMe: boolean;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedBySessionId: string | null;
  createdAt: Date;
}

export interface CreateRefreshSessionInput {
  userId: string;
  tenantId: string | null;
  tokenFamilyId: string;
  refreshTokenHash: string;
  rememberMe: boolean;
  expiresAt: Date;
}

export interface ReplaceRefreshSessionInput {
  currentSessionId: string;
  replacementSessionId: string;
  revokedAt: Date;
}

export abstract class RefreshSessionStore {
  abstract create(input: CreateRefreshSessionInput): Promise<RefreshSessionRecord>;

  abstract findActiveByRefreshTokenHash(
    refreshTokenHash: string,
    now: Date,
  ): Promise<RefreshSessionRecord | null>;

  abstract markReplaced(input: ReplaceRefreshSessionInput): Promise<void>;

  abstract revokeCurrentDevice(sessionId: string, revokedAt: Date): Promise<void>;

  abstract revokeAllForUser(userId: string, revokedAt: Date): Promise<void>;
}
