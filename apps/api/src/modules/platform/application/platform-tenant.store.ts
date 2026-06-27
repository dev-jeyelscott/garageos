import type { DatabaseQueryClient } from '../../../shared/database/database-client';

export type PlatformTenantStatus =
  | 'pending_setup'
  | 'active'
  | 'grace_period'
  | 'read_only'
  | 'suspended'
  | 'pending_deletion'
  | 'deleted';

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

export interface ListPlatformTenantsInput {
  readonly limit: number;
  readonly cursorCreatedAt: Date | null;
  readonly cursorId: string | null;
  readonly status: PlatformTenantStatus | null;
  readonly search: string | null;
}

export interface CreateTenantInput {
  readonly id: string;
  readonly businessName: string;
  readonly normalizedBusinessName: string;
  readonly shopEmail: string;
  readonly normalizedShopEmail: string;
  readonly status: PlatformTenantStatus;
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

  abstract createOwnerInvitation(
    input: CreateOwnerInvitationInput,
    client: DatabaseQueryClient,
  ): Promise<PlatformTenantOwnerInvitationSummary>;

  abstract createTenantLifecycleEvent(
    input: CreateTenantLifecycleEventInput,
    client: DatabaseQueryClient,
  ): Promise<void>;
}
