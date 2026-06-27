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
