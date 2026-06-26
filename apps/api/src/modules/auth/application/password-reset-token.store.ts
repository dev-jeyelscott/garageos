export interface PasswordResetTokenRecord {
  readonly id: string;
  readonly userId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly usedAt: Date | null;
  readonly createdAt: Date;
}

export interface CreatePasswordResetTokenInput {
  readonly id: string;
  readonly userId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
}

export abstract class PasswordResetTokenStore {
  abstract create(input: CreatePasswordResetTokenInput): Promise<PasswordResetTokenRecord>;

  abstract consumeActiveByTokenHash(
    tokenHash: string,
    consumedAt: Date,
  ): Promise<PasswordResetTokenRecord | null>;
}
