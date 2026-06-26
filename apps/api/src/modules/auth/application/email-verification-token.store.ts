export interface EmailVerificationTokenRecord {
  readonly id: string;
  readonly userId: string;
  readonly tokenHash: string;
  readonly email: string;
  readonly expiresAt: Date;
  readonly usedAt: Date | null;
  readonly createdAt: Date;
}

export interface CreateEmailVerificationTokenInput {
  readonly id: string;
  readonly userId: string;
  readonly tokenHash: string;
  readonly email: string;
  readonly expiresAt: Date;
}

export abstract class EmailVerificationTokenStore {
  abstract create(input: CreateEmailVerificationTokenInput): Promise<EmailVerificationTokenRecord>;

  abstract consumeActiveByTokenHash(
    tokenHash: string,
    consumedAt: Date,
  ): Promise<EmailVerificationTokenRecord | null>;
}
