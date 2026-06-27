import type { DatabaseQueryClient } from '../../../shared/database/database-client';

export interface PlatformTenantOperationTenantRecord {
  readonly id: string;
  readonly status: string;
  readonly deletionScheduledFor: Date | null;
}

export interface CreateSupportAccessSessionInput {
  readonly id: string;
  readonly tenantId: string;
  readonly platformAdminUserId: string;
  readonly accessMode: 'read_only' | 'write_allowed';
  readonly reason: string;
  readonly startedAt: Date;
  readonly expiresAt: Date;
}

export interface SupportAccessSessionRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly platformAdminUserId: string;
  readonly accessMode: 'read_only' | 'write_allowed';
  readonly reason: string;
  readonly startedAt: Date;
  readonly expiresAt: Date;
  readonly endedAt: Date | null;
}

export abstract class PlatformTenantOperationsStore {
  abstract findTenantForOperation(
    tenantId: string,
    client?: DatabaseQueryClient,
  ): Promise<PlatformTenantOperationTenantRecord | null>;

  abstract createSupportAccessSession(
    input: CreateSupportAccessSessionInput,
    client: DatabaseQueryClient,
  ): Promise<SupportAccessSessionRecord>;

  abstract endSupportAccessSession(
    input: {
      readonly id: string;
      readonly endedAt: Date;
    },
    client: DatabaseQueryClient,
  ): Promise<SupportAccessSessionRecord | null>;

  abstract applyTenantStatusOverride(
    input: {
      readonly id: string;
      readonly tenantId: string;
      readonly fromStatus: string;
      readonly toStatus: 'read_only' | 'suspended';
      readonly overrideType: string;
      readonly previousValueJson: unknown;
      readonly newValueJson: unknown;
      readonly reason: string;
      readonly expiresAt: Date | null;
      readonly platformAdminUserId: string;
      readonly effectiveAt: Date;
      readonly lifecycleEventId: string;
    },
    client: DatabaseQueryClient,
  ): Promise<void>;

  abstract queueTenantDeletionJob(
    input: {
      readonly id: string;
      readonly tenantId: string;
      readonly scheduledFor: Date;
      readonly createdAt: Date;
    },
    client: DatabaseQueryClient,
  ): Promise<void>;
}
