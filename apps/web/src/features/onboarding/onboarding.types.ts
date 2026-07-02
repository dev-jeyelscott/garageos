export interface OnboardingRequirements {
  readonly shop_profile: boolean;
  readonly active_branch: boolean;
  readonly invoice_prefix: boolean;
  readonly tax_localization: boolean;
  readonly active_shop_owner: boolean;
  readonly subscription_plan: boolean;
  readonly subscription_expiration_date: boolean;
}

export interface OnboardingStateResponse {
  readonly tenant_status: string;
  readonly onboarding_completed: boolean;
  readonly requirements: OnboardingRequirements;
  readonly missing_requirements: readonly string[];
  readonly can_complete_onboarding: boolean;
}

export type TaxProfile = 'vat_registered' | 'non_vat' | 'no_tax';
export type TaxMode = 'tax_inclusive' | 'tax_exclusive' | 'no_tax';

export interface ShopProfileOnboardingValues {
  readonly shop_name: string;
  readonly address: string;
  readonly contact_number: string;
  readonly email: string;
  readonly monday_hours: string;
  readonly tuesday_hours: string;
  readonly wednesday_hours: string;
  readonly thursday_hours: string;
  readonly friday_hours: string;
  readonly saturday_hours: string;
  readonly sunday_hours: string;
  readonly tax_profile: TaxProfile;
  readonly tax_mode: TaxMode;
  readonly vat_rate: string;
  readonly country: string;
  readonly timezone: string;
  readonly currency: string;
  readonly invoice_prefix: string;
  readonly receipt_footer_text: string;
  readonly reminder_sender_name: string;
  readonly default_invoice_due_days: string;
}

export interface ShopProfileRequest {
  readonly shop_name: string;
  readonly address: string;
  readonly contact_number: string;
  readonly email: string;
  readonly business_hours: Readonly<Record<string, string>>;
  readonly tax_profile: TaxProfile;
  readonly tax_mode: TaxMode;
  readonly vat_rate: number;
  readonly country: string;
  readonly timezone: string;
  readonly currency: string;
  readonly invoice_prefix: string;
  readonly receipt_footer_text: string | null;
  readonly reminder_sender_name: string | null;
  readonly default_invoice_due_days: number;
}

export interface FirstBranchOnboardingValues {
  readonly name: string;
  readonly address: string;
  readonly contact_number: string;
  readonly monday_hours: string;
  readonly tuesday_hours: string;
  readonly wednesday_hours: string;
  readonly thursday_hours: string;
  readonly friday_hours: string;
  readonly saturday_hours: string;
  readonly sunday_hours: string;
}

export interface CreateBranchRequest {
  readonly name: string;
  readonly address: string;
  readonly contact_number: string;
  readonly business_hours: Readonly<Record<string, string>>;
}

export interface CreateBranchResponse {
  readonly id: string;
  readonly name: string;
  readonly status: 'active';
  readonly lock_version: number;
}

export interface CompleteOnboardingResponse {
  readonly tenant: {
    readonly id: string;
    readonly status: 'active';
    readonly onboarding_completed_at: string;
  };
}

export type OnboardingSaveStatus =
  | {
      readonly status: 'idle';
    }
  | {
      readonly status: 'submitting';
    }
  | {
      readonly status: 'success';
      readonly message: string;
    }
  | {
      readonly status: 'error';
      readonly message: string;
      readonly detail: string | null;
    };
