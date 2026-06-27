import type { DatabaseQueryClient } from '../../../shared/database/database-client';

export interface ShopOwnerCheckInput {
  readonly tenantId: string;
  readonly userId: string;
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

export abstract class BranchStore {
  abstract isActiveShopOwner(input: ShopOwnerCheckInput): Promise<boolean>;

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
}
