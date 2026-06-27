import type { DatabaseQueryClient } from '../../../shared/database/database-client';

export interface OwnerSignupDefaultPlanRecord {
  readonly id: string;
  readonly code: 'basic' | 'mid' | 'high';
  readonly name: string;
  readonly defaultDurationDays: number | null;
}

export interface OwnerSignupTenantRecord {
  readonly id: string;
  readonly businessName: string;
  readonly shopEmail: string;
  readonly status: 'pending_setup';
}

export interface CreateOwnerSignupTenantInput {
  readonly id: string;
  readonly businessName: string;
  readonly normalizedBusinessName: string;
  readonly shopEmail: string;
  readonly normalizedShopEmail: string;
  readonly timezone: string;
  readonly country: string;
  readonly currency: string;
  readonly createdAt: Date;
}

export interface CreateOwnerSignupSubscriptionInput {
  readonly tenantId: string;
  readonly planId: string;
  readonly startDate: string;
  readonly expirationDate: string;
  readonly updatedAt: Date;
}

export interface CreateOwnerSignupUserInput {
  readonly id: string;
  readonly tenantId: string;
  readonly email: string;
  readonly normalizedEmail: string;
  readonly passwordHash: string;
  readonly fullName: string;
  readonly createdAt: Date;
}

export interface CreateOwnerSignupRoleInput {
  readonly id: string;
  readonly tenantId: string;
  readonly createdAt: Date;
}

export interface CreateOwnerSignupEmployeeProfileInput {
  readonly id: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly fullName: string;
  readonly createdAt: Date;
}

export interface CreateOwnerSignupUserRoleInput {
  readonly id: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly roleId: string;
  readonly assignedAt: Date;
}

export interface CreateOwnerSignupEmailVerificationTokenInput {
  readonly id: string;
  readonly userId: string;
  readonly tokenHash: string;
  readonly email: string;
  readonly expiresAt: Date;
  readonly createdAt: Date;
}

export interface CreateOwnerSignupLifecycleEventInput {
  readonly id: string;
  readonly tenantId: string;
  readonly toStatus: 'pending_setup';
  readonly effectiveAt: Date;
  readonly createdAt: Date;
}

export abstract class OwnerSignupStore {
  abstract findDefaultActivePlan(
    client?: DatabaseQueryClient,
  ): Promise<OwnerSignupDefaultPlanRecord | null>;

  abstract findNonDeletedTenantByBusinessEmail(
    input: {
      readonly normalizedBusinessName: string;
      readonly normalizedShopEmail: string;
    },
    client?: DatabaseQueryClient,
  ): Promise<OwnerSignupTenantRecord | null>;

  abstract createTenant(
    input: CreateOwnerSignupTenantInput,
    client: DatabaseQueryClient,
  ): Promise<OwnerSignupTenantRecord>;

  abstract createTenantSubscription(
    input: CreateOwnerSignupSubscriptionInput,
    client: DatabaseQueryClient,
  ): Promise<void>;

  abstract createOwnerUser(
    input: CreateOwnerSignupUserInput,
    client: DatabaseQueryClient,
  ): Promise<void>;

  abstract createOwnerRoleWithAllTenantPermissions(
    input: CreateOwnerSignupRoleInput,
    client: DatabaseQueryClient,
  ): Promise<void>;

  abstract createOwnerEmployeeProfile(
    input: CreateOwnerSignupEmployeeProfileInput,
    client: DatabaseQueryClient,
  ): Promise<void>;

  abstract assignOwnerRole(
    input: CreateOwnerSignupUserRoleInput,
    client: DatabaseQueryClient,
  ): Promise<void>;

  abstract createEmailVerificationToken(
    input: CreateOwnerSignupEmailVerificationTokenInput,
    client: DatabaseQueryClient,
  ): Promise<void>;

  abstract createTenantLifecycleEvent(
    input: CreateOwnerSignupLifecycleEventInput,
    client: DatabaseQueryClient,
  ): Promise<void>;

  abstract seedTenantOnboardingDefaults(
    tenantId: string,
    client: DatabaseQueryClient,
  ): Promise<void>;
}
