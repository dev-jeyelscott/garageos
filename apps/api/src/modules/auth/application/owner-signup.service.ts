import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { GarageOsApiException } from '../../../shared/api/api-exception';
import { AUDIT_ACTOR_TYPES, AuditService } from '../../../shared/audit/audit.service';
import {
  API_TRANSACTION_RUNNER,
  type DatabaseTransactionRunner,
} from '../../../shared/database/database-transaction';
import { PasswordHashingService } from './password-hashing.service';
import { SecureTokenService } from './secure-token.service';
import { TokenHashingService } from './token-hashing.service';
import { OwnerSignupStore } from './owner-signup.store';
import type { OwnerSignupRequest } from '../api/auth.schemas';

const DEFAULT_TIMEZONE = 'Asia/Manila';
const DEFAULT_COUNTRY = 'PH';
const DEFAULT_CURRENCY = 'PHP';
const EMAIL_VERIFICATION_TOKEN_EXPIRES_IN_HOURS = 24;

export interface OwnerSignupResponse {
  readonly tenant: {
    readonly id: string;
    readonly business_name: string;
    readonly status: 'pending_setup';
  };
  readonly user: {
    readonly id: string;
    readonly email: string;
    readonly email_verified: false;
  };
  readonly subscription: {
    readonly plan_id: string;
    readonly start_date: string;
    readonly expiration_date: string;
    readonly status_source: 'system_computed';
  };
  readonly email_verification_required: true;
}

@Injectable()
export class OwnerSignupService {
  constructor(
    @Inject(OwnerSignupStore)
    private readonly ownerSignupStore: OwnerSignupStore,
    @Inject(API_TRANSACTION_RUNNER)
    private readonly transactionRunner: DatabaseTransactionRunner,
    @Inject(PasswordHashingService)
    private readonly passwordHashingService: PasswordHashingService,
    @Inject(SecureTokenService)
    private readonly secureTokenService: SecureTokenService,
    @Inject(TokenHashingService)
    private readonly tokenHashingService: TokenHashingService,
    @Inject(AuditService)
    private readonly auditService: AuditService,
  ) {}

  async signupOwner(request: OwnerSignupRequest): Promise<OwnerSignupResponse> {
    const normalizedBusinessName = normalizeBusinessName(request.business_name);
    const normalizedShopEmail = normalizeEmail(request.shop_email);
    const normalizedOwnerEmail = normalizeEmail(request.owner.email);

    if (normalizedShopEmail !== normalizedOwnerEmail) {
      throw GarageOsApiException.validationFailed([
        {
          field: 'owner.email',
          code: 'must_match_shop_email',
          message: 'Owner email must match the shop email for owner signup.',
        },
      ]);
    }

    const now = new Date();
    const tenantTimezone = normalizeOptionalText(request.timezone) ?? DEFAULT_TIMEZONE;
    const country = (normalizeOptionalText(request.country) ?? DEFAULT_COUNTRY).toUpperCase();
    const currency = (normalizeOptionalText(request.currency) ?? DEFAULT_CURRENCY).toUpperCase();

    const tenantId = randomUUID();
    const ownerUserId = randomUUID();
    const ownerRoleId = randomUUID();
    const employeeProfileId = randomUUID();
    const userRoleId = randomUUID();
    const lifecycleEventId = randomUUID();
    const emailVerificationTokenId = randomUUID();

    const passwordHash = await this.passwordHashingService.hashPassword(request.owner.password);
    const emailVerificationToken = this.secureTokenService.generateOpaqueToken();

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const defaultPlan = await this.ownerSignupStore.findDefaultActivePlan(transaction);

      if (defaultPlan === null) {
        throw GarageOsApiException.validationFailed([
          {
            field: 'plan',
            code: 'default_plan_required',
            message:
              'Owner signup is blocked until a default active subscription plan is configured.',
          },
        ]);
      }

      if (
        defaultPlan.defaultDurationDays === null ||
        !Number.isInteger(defaultPlan.defaultDurationDays) ||
        defaultPlan.defaultDurationDays <= 0
      ) {
        throw GarageOsApiException.validationFailed([
          {
            field: 'default_subscription_duration',
            code: 'default_duration_required',
            message:
              'Owner signup is blocked until the default subscription duration is configured.',
          },
        ]);
      }

      const duplicate = await this.ownerSignupStore.findNonDeletedTenantByBusinessEmail(
        {
          normalizedBusinessName,
          normalizedShopEmail,
        },
        transaction,
      );

      if (duplicate !== null) {
        throw GarageOsApiException.duplicateResource(
          'A non-deleted tenant with the same business name and shop email already exists.',
        );
      }

      const startDate = getDateOnlyInTimeZone(now, tenantTimezone);
      const expirationDate = addDaysToDateOnly(startDate, defaultPlan.defaultDurationDays);

      const tenant = await this.ownerSignupStore.createTenant(
        {
          id: tenantId,
          businessName: request.business_name.trim(),
          normalizedBusinessName,
          shopEmail: request.shop_email.trim(),
          normalizedShopEmail,
          timezone: tenantTimezone,
          country,
          currency,
          createdAt: now,
        },
        transaction,
      );

      await this.ownerSignupStore.createTenantSubscription(
        {
          tenantId,
          planId: defaultPlan.id,
          startDate,
          expirationDate,
          updatedAt: now,
        },
        transaction,
      );

      await this.ownerSignupStore.createOwnerUser(
        {
          id: ownerUserId,
          tenantId,
          email: request.owner.email.trim(),
          normalizedEmail: normalizedOwnerEmail,
          passwordHash,
          fullName: request.owner.full_name.trim(),
          createdAt: now,
        },
        transaction,
      );

      await this.ownerSignupStore.createOwnerRoleWithAllTenantPermissions(
        {
          id: ownerRoleId,
          tenantId,
          createdAt: now,
        },
        transaction,
      );

      await this.ownerSignupStore.createOwnerEmployeeProfile(
        {
          id: employeeProfileId,
          tenantId,
          userId: ownerUserId,
          fullName: request.owner.full_name.trim(),
          createdAt: now,
        },
        transaction,
      );

      await this.ownerSignupStore.assignOwnerRole(
        {
          id: userRoleId,
          tenantId,
          userId: ownerUserId,
          roleId: ownerRoleId,
          assignedAt: now,
        },
        transaction,
      );

      await this.ownerSignupStore.createEmailVerificationToken(
        {
          id: emailVerificationTokenId,
          userId: ownerUserId,
          tokenHash: this.tokenHashingService.hashToken(emailVerificationToken),
          email: request.owner.email.trim(),
          expiresAt: new Date(
            now.getTime() + EMAIL_VERIFICATION_TOKEN_EXPIRES_IN_HOURS * 60 * 60 * 1000,
          ),
          createdAt: now,
        },
        transaction,
      );

      await this.ownerSignupStore.seedTenantOnboardingDefaults(tenantId, transaction);

      await this.ownerSignupStore.createTenantLifecycleEvent(
        {
          id: lifecycleEventId,
          tenantId,
          toStatus: 'pending_setup',
          effectiveAt: now,
          createdAt: now,
        },
        transaction,
      );

      await this.auditService.record({
        tenantId,
        actorUserId: ownerUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        action: 'auth.owner_signup.completed',
        entityType: 'tenant',
        entityId: tenantId,
        afterJson: {
          business_name: tenant.businessName,
          shop_email: tenant.shopEmail,
          status: tenant.status,
          plan_id: defaultPlan.id,
          plan_code: defaultPlan.code,
          start_date: startDate,
          expiration_date: expirationDate,
          email_verification_required: true,
        },
        reason: 'owner_signup_tenant_created',
        client: transaction,
      });

      return {
        tenant: {
          id: tenant.id,
          business_name: tenant.businessName,
          status: 'pending_setup',
        },
        user: {
          id: ownerUserId,
          email: request.owner.email.trim(),
          email_verified: false,
        },
        subscription: {
          plan_id: defaultPlan.id,
          start_date: startDate,
          expiration_date: expirationDate,
          status_source: 'system_computed',
        },
        email_verification_required: true,
      };
    });
  }
}

function normalizeBusinessName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeOptionalText(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }

  const normalizedValue = value.trim();

  return normalizedValue.length > 0 ? normalizedValue : null;
}

function getDateOnlyInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  return `${getDatePart(parts, 'year')}-${getDatePart(parts, 'month')}-${getDatePart(parts, 'day')}`;
}

function getDatePart(
  parts: readonly Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): string {
  const part = parts.find((candidate) => candidate.type === type);

  if (part === undefined) {
    throw new Error(`Unable to resolve ${type} for tenant timezone date.`);
  }

  return part.value;
}

function addDaysToDateOnly(dateOnly: string, days: number): string {
  const [yearText, monthText, dayText] = dateOnly.split('-');
  const date = new Date(Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText)));

  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}
