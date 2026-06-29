import type { DatabaseQueryClient } from '../../../shared/database/database-client';

export type PlatformTenantStatus =
  | 'pending_setup'
  | 'active'
  | 'grace_period'
  | 'read_only'
  | 'suspended'
  | 'pending_deletion'
  | 'deleted';

export type PlatformSupportAccessMode = 'read_only' | 'write_allowed';

export type PlatformPlanCode = 'basic' | 'mid' | 'high';

export interface PlatformTenantOwnerSummary {
  readonly id: string;
  readonly fullName: string;
  readonly email: string;
  readonly status: string;
}

export interface PlatformTenantOwnerInvitationSummary {
  readonly email: string;
  readonly status: string;
  readonly expiresAt: Date;
}

export interface PlatformTenantListRecord {
  readonly id: string;
  readonly businessName: string;
  readonly shopEmail: string;
  readonly status: PlatformTenantStatus;
  readonly timezone: string;
  readonly country: string;
  readonly currency: string;
  readonly duplicateApprovedAt: Date | null;
  readonly duplicateApprovedByPlatformAdminUserId: string | null;
  readonly duplicateApprovalReason: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly lockVersion: number;
  readonly plan: PlatformPlanSummary | null;
  readonly subscription: PlatformSubscriptionSummary | null;
  readonly owner: PlatformTenantOwnerSummary | null;
  readonly ownerInvitation: PlatformTenantOwnerInvitationSummary | null;
}

export interface PlatformTenantDetailRecord extends PlatformTenantListRecord {
  readonly onboardingCompletedAt: Date | null;
  readonly deletionScheduledFor: Date | null;
  readonly deletedAt: Date | null;
}

export interface PlatformPlanSummary {
  readonly id: string;
  readonly code: PlatformPlanCode;
  readonly name: string;
  readonly status: string;
}

export interface PlatformSubscriptionSummary {
  readonly planId: string;
  readonly startDate: string;
  readonly expirationDate: string;
  readonly statusSource: string;
  readonly lastRenewalAt: Date | null;
  readonly updatedByPlatformAdminUserId: string | null;
  readonly updatedAt: Date;
}

export interface PlatformSupportAccessSessionSummary {
  readonly id: string;
  readonly tenantId: string;
  readonly platformAdminUserId: string;
  readonly accessMode: PlatformSupportAccessMode;
  readonly reason: string;
  readonly startedAt: Date;
  readonly expiresAt: Date;
  readonly endedAt: Date | null;
}

export interface PlatformTenantExportJobSummary {
  readonly id: string;
  readonly tenantId: string | null;
  readonly jobType: string;
  readonly status: string;
  readonly payloadJson: Record<string, unknown>;
  readonly runAfter: Date;
  readonly attemptCount: number;
  readonly maxAttempts: number;
  readonly createdAt: Date;
  readonly correlationId: string | null;
}

export interface PlatformTenantDeletionJobSummary {
  readonly id: string;
  readonly tenantId: string;
  readonly scheduledFor: Date;
  readonly status: string;
  readonly startedAt: Date | null;
  readonly completedAt: Date | null;
  readonly failureReason: string | null;
  readonly attemptCount: number;
  readonly createdAt: Date;
}

export interface ListPlatformTenantsInput {
  readonly limit: number;
  readonly cursorCreatedAt: Date | null;
  readonly cursorId: string | null;
  readonly status: PlatformTenantStatus | null;
  readonly search: string | null;
}

export interface PlatformAuditLogRecord {
  readonly id: string;
  readonly platformAdminUserId: string | null;
  readonly tenantId: string | null;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string | null;
  readonly metadataJson: Record<string, unknown> | null;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  readonly createdAt: Date;
}

export interface ListPlatformAuditLogsInput {
  readonly limit: number;
  readonly cursorCreatedAt: Date | null;
  readonly cursorId: string | null;
  readonly platformAdminUserId: string | null;
  readonly action: string | null;
  readonly tenantId: string | null;
  readonly fromCreatedAt: Date | null;
  readonly toCreatedAt: Date | null;
}

export interface CreateTenantInput {
  readonly id: string;
  readonly businessName: string;
  readonly normalizedBusinessName: string;
  readonly shopEmail: string;
  readonly normalizedShopEmail: string;
  readonly status: PlatformTenantStatus;
  readonly duplicateApprovedAt: Date | null;
  readonly duplicateApprovedByPlatformAdminUserId: string | null;
  readonly duplicateApprovalReason: string | null;
  readonly createdAt: Date;
}

export interface CreateTenantSubscriptionInput {
  readonly tenantId: string;
  readonly planId: string;
  readonly startDate: string;
  readonly expirationDate: string;
  readonly updatedByPlatformAdminUserId: string;
  readonly updatedAt: Date;
}

export interface UpsertTenantSubscriptionInput {
  readonly tenantId: string;
  readonly planId: string;
  readonly startDate: string;
  readonly expirationDate: string;
  readonly updatedByPlatformAdminUserId: string;
  readonly updatedAt: Date;
}

export interface UpdateTenantStatusInput {
  readonly tenantId: string;
  readonly status: PlatformTenantStatus;
  readonly updatedAt: Date;
}

export interface CreateSubscriptionOverrideInput {
  readonly id: string;
  readonly tenantId: string;
  readonly overrideType: string;
  readonly previousValueJson: Record<string, unknown> | null;
  readonly newValueJson: Record<string, unknown>;
  readonly reason: string;
  readonly effectiveAt: Date;
  readonly expiresAt: Date | null;
  readonly createdByPlatformAdminUserId: string;
  readonly createdAt: Date;
}

export interface CreatePlatformSupportAccessSessionInput {
  readonly id: string;
  readonly tenantId: string;
  readonly platformAdminUserId: string;
  readonly accessMode: PlatformSupportAccessMode;
  readonly reason: string;
  readonly startedAt: Date;
  readonly expiresAt: Date;
}

export interface EndPlatformSupportAccessSessionInput {
  readonly id: string;
  readonly endedAt: Date;
}

export interface QueueTenantExportJobInput {
  readonly id: string;
  readonly tenantId: string;
  readonly payloadJson: Record<string, unknown>;
  readonly runAfter: Date;
  readonly maxAttempts: number;
  readonly correlationId: string | null;
}

export interface QueueTenantDeletionJobInput {
  readonly id: string;
  readonly tenantId: string;
  readonly scheduledFor: Date;
  readonly status: 'queued';
  readonly createdAt: Date;
}

export interface CreateOwnerInvitationInput {
  readonly id: string;
  readonly tenantId: string;
  readonly email: string;
  readonly normalizedEmail: string;
  readonly tokenHash: string;
  readonly status: string;
  readonly expiresAt: Date;
  readonly assignedRoleConfigJson: unknown;
  readonly assignedBranchConfigJson: unknown;
  readonly createdByUserId: string;
  readonly createdAt: Date;
}

export interface CreateTenantLifecycleEventInput {
  readonly id: string;
  readonly tenantId: string;
  readonly fromStatus: PlatformTenantStatus | null;
  readonly toStatus: PlatformTenantStatus;
  readonly source: string;
  readonly reason: string;
  readonly effectiveAt: Date;
  readonly createdAt: Date;
}

export abstract class PlatformTenantStore {
  abstract listPlatformAuditLogs(
    input: ListPlatformAuditLogsInput,
    client?: DatabaseQueryClient,
  ): Promise<readonly PlatformAuditLogRecord[]>;

  abstract listTenants(
    input: ListPlatformTenantsInput,
    client?: DatabaseQueryClient,
  ): Promise<readonly PlatformTenantListRecord[]>;

  abstract findTenantById(
    tenantId: string,
    client?: DatabaseQueryClient,
  ): Promise<PlatformTenantDetailRecord | null>;

  abstract findActivePlanById(
    planId: string,
    client?: DatabaseQueryClient,
  ): Promise<PlatformPlanSummary | null>;

  abstract findNonDeletedTenantByBusinessEmail(
    input: {
      readonly normalizedBusinessName: string;
      readonly normalizedShopEmail: string;
    },
    client?: DatabaseQueryClient,
  ): Promise<PlatformTenantDetailRecord | null>;

  abstract createTenant(
    input: CreateTenantInput,
    client: DatabaseQueryClient,
  ): Promise<PlatformTenantDetailRecord>;

  abstract createTenantSubscription(
    input: CreateTenantSubscriptionInput,
    client: DatabaseQueryClient,
  ): Promise<PlatformSubscriptionSummary>;

  abstract upsertTenantSubscription(
    input: UpsertTenantSubscriptionInput,
    client: DatabaseQueryClient,
  ): Promise<PlatformSubscriptionSummary>;

  abstract updateTenantStatus(
    input: UpdateTenantStatusInput,
    client: DatabaseQueryClient,
  ): Promise<PlatformTenantDetailRecord>;

  abstract createSubscriptionOverride(
    input: CreateSubscriptionOverrideInput,
    client: DatabaseQueryClient,
  ): Promise<void>;

  abstract createPlatformSupportAccessSession(
    input: CreatePlatformSupportAccessSessionInput,
    client: DatabaseQueryClient,
  ): Promise<PlatformSupportAccessSessionSummary>;

  abstract findPlatformSupportAccessSessionById(
    supportAccessSessionId: string,
    client?: DatabaseQueryClient,
  ): Promise<PlatformSupportAccessSessionSummary | null>;

  abstract endPlatformSupportAccessSession(
    input: EndPlatformSupportAccessSessionInput,
    client: DatabaseQueryClient,
  ): Promise<PlatformSupportAccessSessionSummary>;

  abstract queueTenantExportJob(
    input: QueueTenantExportJobInput,
    client: DatabaseQueryClient,
  ): Promise<PlatformTenantExportJobSummary>;

  abstract findActiveTenantDeletionJobByTenantId(
    tenantId: string,
    client?: DatabaseQueryClient,
  ): Promise<PlatformTenantDeletionJobSummary | null>;

  abstract queueTenantDeletionJob(
    input: QueueTenantDeletionJobInput,
    client: DatabaseQueryClient,
  ): Promise<PlatformTenantDeletionJobSummary>;

  abstract createOwnerInvitation(
    input: CreateOwnerInvitationInput,
    client: DatabaseQueryClient,
  ): Promise<PlatformTenantOwnerInvitationSummary>;

  abstract createTenantLifecycleEvent(
    input: CreateTenantLifecycleEventInput,
    client: DatabaseQueryClient,
  ): Promise<void>;
}
