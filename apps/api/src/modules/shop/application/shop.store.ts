import type { DatabaseQueryClient } from '../../../shared/database/database-client';
import type { TenantStatus } from '../../../shared/tenant-context/tenant-context';

export interface ShopOnboardingStateRecord {
  readonly tenantId: string;
  readonly tenantStatus: TenantStatus;
  readonly onboardingCompletedAt: Date | null;
  readonly profileExists: boolean;
  readonly profileComplete: boolean;
  readonly activeBranchCount: number;
  readonly activeOwnerCount: number;
  readonly hasSubscriptionPlan: boolean;
  readonly hasSubscriptionExpirationDate: boolean;
}

export interface ShopOwnerCheckInput {
  readonly tenantId: string;
  readonly userId: string;
}

export interface UpsertShopProfileInput {
  readonly tenantId: string;
  readonly shopName: string;
  readonly address: string;
  readonly contactNumber: string;
  readonly email: string;
  readonly businessHoursJson: unknown;
  readonly taxProfile: string;
  readonly taxMode: string;
  readonly vatRate: number;
  readonly country: string;
  readonly timezone: string;
  readonly currency: string;
  readonly invoicePrefix: string;
  readonly receiptFooterText: string | null;
  readonly reminderSenderName: string | null;
  readonly defaultInvoiceDueDays: number;
  readonly updatedAt: Date;
}

export interface CreateBranchInput {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly normalizedName: string;
  readonly address: string;
  readonly contactNumber: string;
  readonly businessHoursJson: unknown;
  readonly createdAt: Date;
}

export interface BranchSummaryRecord {
  readonly id: string;
  readonly name: string;
  readonly address: string;
  readonly contactNumber: string;
  readonly businessHoursJson: unknown;
  readonly status: BranchStatus;
  readonly lockVersion: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deactivatedAt: Date | null;
  readonly reactivatedAt: Date | null;
}

export type BranchStatus = 'active' | 'inactive';

export interface UpdateBranchInput {
  readonly tenantId: string;
  readonly branchId: string;
  readonly name: string;
  readonly normalizedName: string;
  readonly address: string;
  readonly contactNumber: string;
  readonly businessHoursJson: unknown;
  readonly expectedLockVersion: number;
  readonly updatedAt: Date;
}

export interface ChangeBranchStatusInput {
  readonly tenantId: string;
  readonly branchId: string;
  readonly fromStatus: BranchStatus;
  readonly toStatus: BranchStatus;
  readonly expectedLockVersion: number;
  readonly changedAt: Date;
}

export interface CreateBranchStatusEventInput {
  readonly tenantId: string;
  readonly branchId: string;
  readonly fromStatus: BranchStatus;
  readonly toStatus: BranchStatus;
  readonly reason: string | null;
  readonly createdByUserId: string;
  readonly createdAt: Date;
}

export type BranchDeactivationBlocker =
  | 'open_job_orders'
  | 'open_purchase_orders'
  | 'open_inventory_transfers'
  | 'active_inventory_reservations'
  | 'non_zero_stock'
  | 'unposted_inventory_adjustments'
  | 'unposted_purchase_receivings';

export abstract class ShopStore {
  abstract isActiveShopOwner(input: ShopOwnerCheckInput): Promise<boolean>;

  abstract getOnboardingState(
    tenantId: string,
    client?: DatabaseQueryClient,
  ): Promise<ShopOnboardingStateRecord>;

  abstract upsertShopProfile(
    input: UpsertShopProfileInput,
    client: DatabaseQueryClient,
  ): Promise<void>;

  abstract countActiveBranches(tenantId: string, client?: DatabaseQueryClient): Promise<number>;

  abstract getEffectiveMaxActiveBranches(
    tenantId: string,
    client?: DatabaseQueryClient,
  ): Promise<number>;

  abstract createBranch(
    input: CreateBranchInput,
    client: DatabaseQueryClient,
  ): Promise<BranchSummaryRecord>;

  abstract listBranches(
    tenantId: string,
    client?: DatabaseQueryClient,
  ): Promise<readonly BranchSummaryRecord[]>;

  abstract findBranchById(
    tenantId: string,
    branchId: string,
    client?: DatabaseQueryClient,
  ): Promise<BranchSummaryRecord | null>;

  abstract updateBranch(
    input: UpdateBranchInput,
    client: DatabaseQueryClient,
  ): Promise<BranchSummaryRecord | null>;

  abstract changeBranchStatus(
    input: ChangeBranchStatusInput,
    client: DatabaseQueryClient,
  ): Promise<BranchSummaryRecord | null>;

  abstract createBranchStatusEvent(
    input: CreateBranchStatusEventInput,
    client: DatabaseQueryClient,
  ): Promise<void>;

  abstract findBranchDeactivationBlockers(
    tenantId: string,
    branchId: string,
    client?: DatabaseQueryClient,
  ): Promise<readonly BranchDeactivationBlocker[]>;

  abstract markOnboardingComplete(
    input: {
      readonly tenantId: string;
      readonly completedAt: Date;
      readonly lifecycleEventId: string;
    },
    client: DatabaseQueryClient,
  ): Promise<void>;

  abstract createRenewalRequestAuditMarker(
    input: {
      readonly tenantId: string;
      readonly userId: string;
      readonly requestedAt: Date;
      readonly message: string | null;
    },
    client: DatabaseQueryClient,
  ): Promise<void>;
}
