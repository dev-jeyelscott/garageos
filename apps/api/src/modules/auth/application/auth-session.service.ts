import { Inject, Injectable } from '@nestjs/common';

import type {
  CreateRefreshSessionInput,
  RefreshSessionRecord,
  ReplaceRefreshSessionInput,
  RotateRefreshSessionInput,
} from './refresh-session.store';
import { RefreshSessionStore } from './refresh-session.store';

export interface FindActiveRefreshSessionInput {
  readonly refreshTokenHash: string;
  readonly now: Date;
}

export interface RevokeCurrentRefreshSessionInput {
  readonly sessionId: string;
  readonly revokedAt: Date;
}

export interface RevokeAllRefreshSessionsForUserInput {
  readonly userId: string;
  readonly revokedAt: Date;
}

@Injectable()
export class AuthSessionService {
  constructor(
    @Inject(RefreshSessionStore)
    private readonly refreshSessionStore: RefreshSessionStore,
  ) {}

  async createRefreshSession(input: CreateRefreshSessionInput): Promise<RefreshSessionRecord> {
    return this.refreshSessionStore.create(input);
  }

  async findActiveRefreshSession(
    input: FindActiveRefreshSessionInput,
  ): Promise<RefreshSessionRecord | null> {
    return this.refreshSessionStore.findActiveByRefreshTokenHash(input.refreshTokenHash, input.now);
  }

  async rotateRefreshSession(
    input: RotateRefreshSessionInput,
  ): Promise<RefreshSessionRecord | null> {
    return this.refreshSessionStore.rotate(input);
  }

  async markRefreshSessionReplaced(input: ReplaceRefreshSessionInput): Promise<void> {
    await this.refreshSessionStore.markReplaced(input);
  }

  async revokeCurrentRefreshSession(input: RevokeCurrentRefreshSessionInput): Promise<void> {
    await this.refreshSessionStore.revokeCurrentDevice(input.sessionId, input.revokedAt);
  }

  async revokeAllRefreshSessionsForUser(
    input: RevokeAllRefreshSessionsForUserInput,
  ): Promise<void> {
    await this.refreshSessionStore.revokeAllForUser(input.userId, input.revokedAt);
  }
}
