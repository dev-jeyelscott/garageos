import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { GarageOsApiException } from '../../../shared/api/api-exception';
import { AUDIT_ACTOR_TYPES, AuditService } from '../../../shared/audit/audit.service';
import {
  API_TRANSACTION_RUNNER,
  type DatabaseTransactionRunner,
} from '../../../shared/database/database-transaction';
import {
  assertTenantLifecycleAccess,
  TENANT_ACCESS_ACTIONS,
} from '../../../shared/authorization/tenant-lifecycle-access.policy';
import {
  resolveTenantContextFromAuthenticatedSession,
  TENANT_STATUSES,
  type ResolvedTenantContext,
  type TenantContextAuthenticatedSession,
} from '../../../shared/tenant-context/tenant-context';
import type { RenewalRequest, ShopProfileRequest } from '../api/shop.schemas';
import { ShopStore } from './shop.store';

export interface OnboardingStateResponse {
  readonly tenant_status: string;
  readonly onboarding_completed: boolean;
  readonly requirements: {
    readonly shop_profile: boolean;
    readonly active_branch: boolean;
    readonly invoice_prefix: boolean;
    readonly tax_localization: boolean;
    readonly active_shop_owner: boolean;
    readonly subscription_plan: boolean;
    readonly subscription_expiration_date: boolean;
  };
  readonly missing_requirements: readonly string[];
  readonly can_complete_onboarding: boolean;
}

export interface CompleteOnboardingResponse {
  readonly tenant: {
    readonly id: string;
    readonly status: 'active';
    readonly onboarding_completed_at: string;
  };
}

export interface RenewalRequestResponse {
  readonly status: 'submitted';
  readonly instructions: string;
}

@Injectable()
export class ShopService {
  constructor(
    @Inject(ShopStore)
    private readonly shopStore: ShopStore,
    @Inject(API_TRANSACTION_RUNNER)
    private readonly transactionRunner: DatabaseTransactionRunner,
    @Inject(AuditService)
    private readonly auditService: AuditService,
  ) {}

  async getOnboardingState(
    session: TenantContextAuthenticatedSession,
  ): Promise<OnboardingStateResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.shopStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.ONBOARDING_SETUP,
    });

    const state = await this.shopStore.getOnboardingState(context.tenantId);

    return toOnboardingStateResponse(state);
  }

  async upsertProfile(
    request: ShopProfileRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<{ readonly saved: true }> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.shopStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.ONBOARDING_SETUP,
    });

    if (!isShopOwner && !context.effectivePermissions.includes('shop.update')) {
      throw GarageOsApiException.forbidden('shop.update');
    }

    await this.transactionRunner.runInTransaction(async (transaction) => {
      await this.shopStore.upsertShopProfile(
        {
          tenantId: context.tenantId,
          shopName: request.shop_name.trim(),
          address: request.address.trim(),
          contactNumber: request.contact_number.trim(),
          email: request.email.trim(),
          businessHoursJson: request.business_hours,
          taxProfile: request.tax_profile,
          taxMode: request.tax_mode,
          vatRate: request.vat_rate ?? 0.12,
          country: (request.country ?? 'PH').trim().toUpperCase(),
          timezone: request.timezone?.trim() ?? 'Asia/Manila',
          currency: (request.currency ?? 'PHP').trim().toUpperCase(),
          invoicePrefix: request.invoice_prefix.trim(),
          receiptFooterText: normalizeNullableText(request.receipt_footer_text),
          reminderSenderName: normalizeNullableText(request.reminder_sender_name),
          defaultInvoiceDueDays: request.default_invoice_due_days ?? 7,
          updatedAt: new Date(),
        },
        transaction,
      );
    });

    return { saved: true };
  }

  async completeOnboarding(
    session: TenantContextAuthenticatedSession,
  ): Promise<CompleteOnboardingResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.shopStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.ONBOARDING_SETUP,
    });

    if (!isShopOwner) {
      throw GarageOsApiException.forbidden('shop.update');
    }

    const now = new Date();

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const state = await this.shopStore.getOnboardingState(context.tenantId, transaction);
      const response = toOnboardingStateResponse(state);

      if (!response.can_complete_onboarding) {
        throw GarageOsApiException.validationFailed(
          response.missing_requirements.map((requirement) => ({
            field: requirement,
            code: 'missing_onboarding_requirement',
            message: `Missing onboarding requirement: ${requirement}.`,
          })),
        );
      }

      if (context.tenantStatus !== TENANT_STATUSES.PENDING_SETUP) {
        throw GarageOsApiException.validationFailed([
          {
            field: 'tenant.status',
            code: 'tenant_not_pending_setup',
            message: 'Only pending setup tenants can complete onboarding through this endpoint.',
          },
        ]);
      }

      await this.shopStore.markOnboardingComplete(
        {
          tenantId: context.tenantId,
          completedAt: now,
          lifecycleEventId: randomUUID(),
        },
        transaction,
      );

      await this.auditService.record({
        tenantId: context.tenantId,
        actorUserId: context.actorUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        action: 'shop.onboarding.completed',
        entityType: 'tenant',
        entityId: context.tenantId,
        afterJson: {
          status: 'active',
          onboarding_completed_at: now.toISOString(),
        },
        reason: 'onboarding_requirements_complete',
        client: transaction,
      });

      return {
        tenant: {
          id: context.tenantId,
          status: 'active',
          onboarding_completed_at: now.toISOString(),
        },
      };
    });
  }

  async requestRenewal(
    request: RenewalRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<RenewalRequestResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.shopStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.RENEWAL_REQUEST,
    });

    if (!isShopOwner) {
      throw GarageOsApiException.forbidden('shop.billing.update');
    }

    await this.transactionRunner.runInTransaction(async (transaction) => {
      await this.shopStore.createRenewalRequestAuditMarker(
        {
          tenantId: context.tenantId,
          userId: context.actorUserId,
          requestedAt: new Date(),
          message: normalizeNullableText(request.message),
        },
        transaction,
      );
    });

    return {
      status: 'submitted',
      instructions:
        'Your renewal request was submitted. GarageOS does not process subscription payments inside the system. A platform admin must confirm external payment and update your subscription before access is restored to active.',
    };
  }
}

function toOnboardingStateResponse(state: {
  readonly tenantStatus: string;
  readonly onboardingCompletedAt: Date | null;
  readonly profileComplete: boolean;
  readonly activeBranchCount: number;
  readonly activeOwnerCount: number;
  readonly hasSubscriptionPlan: boolean;
  readonly hasSubscriptionExpirationDate: boolean;
}): OnboardingStateResponse {
  const requirements = {
    shop_profile: state.profileComplete,
    active_branch: state.activeBranchCount > 0,
    invoice_prefix: state.profileComplete,
    tax_localization: state.profileComplete,
    active_shop_owner: state.activeOwnerCount > 0,
    subscription_plan: state.hasSubscriptionPlan,
    subscription_expiration_date: state.hasSubscriptionExpirationDate,
  };

  const missingRequirements = Object.entries(requirements)
    .filter(([, satisfied]) => !satisfied)
    .map(([requirement]) => requirement);

  return {
    tenant_status: state.tenantStatus,
    onboarding_completed: state.onboardingCompletedAt !== null,
    requirements,
    missing_requirements: missingRequirements,
    can_complete_onboarding: missingRequirements.length === 0,
  };
}

function normalizeNullableText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalizedValue = value.trim();

  return normalizedValue.length > 0 ? normalizedValue : null;
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}
