import type { FirstBranchOnboardingValues, ShopProfileOnboardingValues } from './onboarding.types';
import type { AuthSessionResponseData } from '../auth/types/auth-session';

export const DEFAULT_BUSINESS_HOURS = '08:00-17:00';
export const DEFAULT_CLOSED_HOURS = 'Closed';

export function createDefaultShopProfileValues(
  session: AuthSessionResponseData | null,
): ShopProfileOnboardingValues {
  return {
    shop_name: session?.tenant?.business_name ?? '',
    address: '',
    contact_number: '',
    email: session?.user.email ?? '',
    monday_hours: DEFAULT_BUSINESS_HOURS,
    tuesday_hours: DEFAULT_BUSINESS_HOURS,
    wednesday_hours: DEFAULT_BUSINESS_HOURS,
    thursday_hours: DEFAULT_BUSINESS_HOURS,
    friday_hours: DEFAULT_BUSINESS_HOURS,
    saturday_hours: DEFAULT_BUSINESS_HOURS,
    sunday_hours: DEFAULT_CLOSED_HOURS,
    tax_profile: 'non_vat',
    tax_mode: 'no_tax',
    vat_rate: '0.12',
    country: session?.tenant?.country ?? 'PH',
    timezone: session?.tenant?.timezone ?? 'Asia/Manila',
    currency: session?.tenant?.currency ?? 'PHP',
    invoice_prefix: '',
    receipt_footer_text: '',
    reminder_sender_name: '',
    default_invoice_due_days: '7',
  };
}

export function createDefaultFirstBranchValues(
  session: AuthSessionResponseData | null,
): FirstBranchOnboardingValues {
  return {
    name: 'Main Branch',
    address: '',
    contact_number: '',
    monday_hours: DEFAULT_BUSINESS_HOURS,
    tuesday_hours: DEFAULT_BUSINESS_HOURS,
    wednesday_hours: DEFAULT_BUSINESS_HOURS,
    thursday_hours: DEFAULT_BUSINESS_HOURS,
    friday_hours: DEFAULT_BUSINESS_HOURS,
    saturday_hours: DEFAULT_BUSINESS_HOURS,
    sunday_hours: DEFAULT_CLOSED_HOURS,
  };
}
