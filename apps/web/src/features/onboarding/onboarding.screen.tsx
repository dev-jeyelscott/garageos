'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';

import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Skeleton,
} from '../../components/ui';
import { isApiClientError } from '../../lib/api-envelope';
import { getCurrentSession } from '../auth/queries/get-current-session.query';
import type { AuthSessionResponseData } from '../auth/types/auth-session';
import { resolveAuthenticatedRedirect } from '../auth/utils/resolve-auth-redirect';
import {
  completeOnboarding,
  createFirstBranch,
  getOnboardingState,
  saveShopProfile,
} from './onboarding.api';
import {
  createDefaultFirstBranchValues,
  createDefaultShopProfileValues,
} from './onboarding.defaults';
import type {
  CreateBranchRequest,
  FirstBranchOnboardingValues,
  OnboardingSaveStatus,
  OnboardingStateResponse,
  ShopProfileOnboardingValues,
  ShopProfileRequest,
  TaxMode,
  TaxProfile,
} from './onboarding.types';

type LoadState =
  | {
      readonly status: 'loading';
    }
  | {
      readonly status: 'ready';
      readonly session: AuthSessionResponseData;
      readonly onboardingState: OnboardingStateResponse;
    }
  | {
      readonly status: 'error';
      readonly message: string;
      readonly detail: string | null;
    };

type ActivePanel = 'profile' | 'branch' | 'verify' | 'complete';

const IDLE_SAVE_STATUS: OnboardingSaveStatus = { status: 'idle' };

const REQUIREMENT_LABELS: Record<keyof OnboardingStateResponse['requirements'], string> = {
  shop_profile: 'Shop profile saved',
  active_branch: 'First active branch created',
  invoice_prefix: 'Invoice prefix configured',
  tax_localization: 'Tax and localization configured',
  active_shop_owner: 'Active Shop Owner verified',
  subscription_plan: 'Effective subscription plan exists',
  subscription_expiration_date: 'Subscription expiration date exists',
};

export function TenantOnboardingCompletionScreen() {
  const router = useRouter();
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });
  const [activePanel, setActivePanel] = useState<ActivePanel>('profile');
  const [profileValues, setProfileValues] = useState<ShopProfileOnboardingValues>(() =>
    createDefaultShopProfileValues(null),
  );
  const [branchValues, setBranchValues] = useState<FirstBranchOnboardingValues>(() =>
    createDefaultFirstBranchValues(null),
  );
  const [profileSaveStatus, setProfileSaveStatus] =
    useState<OnboardingSaveStatus>(IDLE_SAVE_STATUS);
  const [branchSaveStatus, setBranchSaveStatus] = useState<OnboardingSaveStatus>(IDLE_SAVE_STATUS);
  const [completionStatus, setCompletionStatus] = useState<OnboardingSaveStatus>(IDLE_SAVE_STATUS);

  const loadOnboarding = useCallback(async () => {
    setLoadState({ status: 'loading' });

    try {
      const session = await getCurrentSession();
      const redirectTo = resolveOnboardingRedirect(session);

      if (redirectTo !== null) {
        router.replace(redirectTo);
        return;
      }

      const onboardingState = await getOnboardingState();

      setProfileValues((currentValues) =>
        shouldHydrateProfileDefaults(currentValues)
          ? createDefaultShopProfileValues(session)
          : currentValues,
      );
      setBranchValues((currentValues) =>
        shouldHydrateBranchDefaults(currentValues)
          ? createDefaultFirstBranchValues(session)
          : currentValues,
      );
      setLoadState({ status: 'ready', session, onboardingState });
      setActivePanel(resolveNextPanel(onboardingState));
    } catch (error) {
      setLoadState({
        status: 'error',
        message: toSafeErrorMessage(error, 'Unable to load onboarding state.'),
        detail: toSafeErrorDetail(error),
      });
    }
  }, [router]);

  useEffect(() => {
    void loadOnboarding();
  }, [loadOnboarding]);

  const refreshOnboardingState = useCallback(async () => {
    const [session, onboardingState] = await Promise.all([
      getCurrentSession(),
      getOnboardingState(),
    ]);

    setLoadState({ status: 'ready', session, onboardingState });
    setActivePanel(resolveNextPanel(onboardingState));
  }, []);

  const profileRequest = useMemo(() => buildProfileRequest(profileValues), [profileValues]);
  const branchRequest = useMemo(() => buildBranchRequest(branchValues), [branchValues]);

  async function handleSaveProfile(): Promise<void> {
    setProfileSaveStatus({ status: 'submitting' });

    const validationMessage = validateProfileRequest(profileRequest);

    if (validationMessage !== null) {
      setProfileSaveStatus({ status: 'error', message: validationMessage, detail: null });
      return;
    }

    try {
      await saveShopProfile(profileRequest);
      await refreshOnboardingState();
      setProfileSaveStatus({
        status: 'success',
        message: 'Shop profile, tax/localization, and invoice prefix were saved.',
      });
    } catch (error) {
      setProfileSaveStatus({
        status: 'error',
        message: toSafeErrorMessage(error, 'Unable to save shop profile.'),
        detail: toSafeErrorDetail(error),
      });
    }
  }

  async function handleCreateBranch(): Promise<void> {
    setBranchSaveStatus({ status: 'submitting' });

    const validationMessage = validateBranchRequest(branchRequest);

    if (validationMessage !== null) {
      setBranchSaveStatus({ status: 'error', message: validationMessage, detail: null });
      return;
    }

    try {
      const branch = await createFirstBranch(branchRequest);
      await refreshOnboardingState();
      setBranchSaveStatus({
        status: 'success',
        message: `Created active branch: ${branch.name}.`,
      });
    } catch (error) {
      setBranchSaveStatus({
        status: 'error',
        message: toSafeErrorMessage(error, 'Unable to create first branch.'),
        detail: toSafeErrorDetail(error),
      });
    }
  }

  async function handleCompleteOnboarding(): Promise<void> {
    if (loadState.status !== 'ready') {
      return;
    }

    setCompletionStatus({ status: 'submitting' });

    if (!loadState.onboardingState.can_complete_onboarding) {
      setCompletionStatus({
        status: 'error',
        message: `Resolve missing requirements first: ${loadState.onboardingState.missing_requirements
          .map(formatRequirementCode)
          .join(', ')}.`,
        detail: null,
      });
      return;
    }

    try {
      await completeOnboarding();
      setCompletionStatus({
        status: 'success',
        message: 'Onboarding completed. Redirecting to Dashboard.',
      });
      router.replace('/dashboard');
    } catch (error) {
      setCompletionStatus({
        status: 'error',
        message: toSafeErrorMessage(error, 'Unable to complete onboarding.'),
        detail: toSafeErrorDetail(error),
      });
    }
  }

  if (loadState.status !== 'ready') {
    return <OnboardingLoadState state={loadState} onRetry={loadOnboarding} />;
  }

  const { session, onboardingState } = loadState;

  return (
    <main className="min-h-dvh bg-background pb-10 text-foreground">
      <div className="sticky top-0 z-30 border-b border-border bg-card/95 shadow-sm backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-accent shadow-sm">
              <Image
                src="/images/logo.png"
                alt=""
                width={96}
                height={96}
                priority
                className="h-9 w-9 object-contain"
              />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-black uppercase tracking-[0.18em] text-muted-foreground">
                GarageOS Setup
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {session.tenant?.business_name ?? 'Pending setup tenant'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Badge variant="warning">{formatRequirementCode(onboardingState.tenant_status)}</Badge>
            <ButtonLink href="/auth/password/change" variant="secondary" size="sm">
              Change password
            </ButtonLink>
            <ButtonLink href="/auth/logout" variant="ghost" size="sm">
              Logout
            </ButtonLink>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
        <header className="grid gap-4 rounded-[2rem] border border-border bg-card p-5 shadow-sm sm:p-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-muted-foreground">
              Pending setup
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-foreground sm:text-4xl">
              Complete tenant onboarding
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
              Complete the documented setup checklist. The backend remains authoritative and
              operational modules stay blocked until the tenant is activated.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="secondary" onClick={() => void loadOnboarding()}>
              Refresh state
            </Button>
            <Button
              type="button"
              disabled={
                !onboardingState.can_complete_onboarding || completionStatus.status === 'submitting'
              }
              title={
                onboardingState.can_complete_onboarding
                  ? 'Complete onboarding'
                  : 'Resolve missing setup requirements first.'
              }
              onClick={() => void handleCompleteOnboarding()}
            >
              {completionStatus.status === 'submitting' ? 'Completing…' : 'Complete onboarding'}
            </Button>
          </div>
        </header>

        <Alert>
          <p className="text-sm font-bold">Pending setup access is intentionally limited.</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            This page only exposes onboarding, profile setup, subscription information, password
            management, and logout. Operational screens are unlocked only after the API completes
            onboarding and returns an active tenant through session state.
          </p>
        </Alert>

        <div className="grid gap-5 lg:grid-cols-[22rem_1fr] lg:items-start">
          <aside className="grid gap-5 lg:sticky lg:top-24">
            <Card>
              <CardHeader>
                <CardTitle>Setup checklist</CardTitle>
                <CardDescription>
                  Requirements reported by <code>GET /shop/onboarding-state</code>.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="grid gap-3">
                  {Object.entries(onboardingState.requirements).map(([requirement, completed]) => (
                    <ChecklistRow
                      key={requirement}
                      label={
                        REQUIREMENT_LABELS[
                          requirement as keyof OnboardingStateResponse['requirements']
                        ]
                      }
                      completed={completed}
                    />
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Subscription verification</CardTitle>
                <CardDescription>
                  Plan and expiration are loaded from <code>GET /auth/session</code>.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm">
                <InfoLine label="Plan" value={session.effective_plan?.name ?? 'Missing'} />
                <InfoLine
                  label="Expiration"
                  value={session.subscription?.expiration_date ?? 'Missing'}
                />
                <InfoLine
                  label="Operational access"
                  value={session.access.can_access_operational_modules ? 'Available' : 'Blocked'}
                />
              </CardContent>
            </Card>
          </aside>

          <section className="grid gap-5">
            <PanelNav activePanel={activePanel} onChange={setActivePanel} />

            {activePanel === 'profile' ? (
              <ShopProfilePanel
                values={profileValues}
                saveStatus={profileSaveStatus}
                onChange={setProfileValues}
                onSave={() => void handleSaveProfile()}
              />
            ) : null}

            {activePanel === 'branch' ? (
              <FirstBranchPanel
                values={branchValues}
                saveStatus={branchSaveStatus}
                requirementComplete={onboardingState.requirements.active_branch}
                onChange={setBranchValues}
                onCreate={() => void handleCreateBranch()}
              />
            ) : null}

            {activePanel === 'verify' ? (
              <VerificationPanel session={session} onboardingState={onboardingState} />
            ) : null}

            {activePanel === 'complete' ? (
              <CompletePanel
                onboardingState={onboardingState}
                completionStatus={completionStatus}
                onComplete={() => void handleCompleteOnboarding()}
              />
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}

function ShopProfilePanel({
  values,
  saveStatus,
  onChange,
  onSave,
}: {
  readonly values: ShopProfileOnboardingValues;
  readonly saveStatus: OnboardingSaveStatus;
  readonly onChange: (values: ShopProfileOnboardingValues) => void;
  readonly onSave: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Shop profile, tax, localization, and invoice prefix</CardTitle>
        <CardDescription>
          Saved through <code>PUT /shop/profile</code>. Invoice prefix must be uppercase letters or
          numbers and end with a dash.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            onSave();
          }}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              label="Shop name"
              value={values.shop_name}
              minLength={2}
              maxLength={150}
              required
              onChange={(shopName) => onChange({ ...values, shop_name: shopName })}
            />
            <TextField
              label="Email address"
              value={values.email}
              type="email"
              required
              onChange={(email) => onChange({ ...values, email })}
            />
            <TextField
              label="Contact number"
              value={values.contact_number}
              maxLength={50}
              required
              onChange={(contactNumber) => onChange({ ...values, contact_number: contactNumber })}
            />
            <TextField
              label="Invoice prefix"
              value={values.invoice_prefix}
              placeholder="MOTO-"
              maxLength={11}
              required
              onChange={(invoicePrefix) =>
                onChange({ ...values, invoice_prefix: invoicePrefix.trim().toUpperCase() })
              }
            />
            <TextField
              label="Country"
              value={values.country}
              maxLength={2}
              required
              onChange={(country) => onChange({ ...values, country: country.trim().toUpperCase() })}
            />
            <TextField
              label="Currency"
              value={values.currency}
              maxLength={3}
              required
              onChange={(currency) =>
                onChange({ ...values, currency: currency.trim().toUpperCase() })
              }
            />
            <TextField
              label="Timezone"
              value={values.timezone}
              required
              onChange={(timezone) => onChange({ ...values, timezone })}
            />
            <TextField
              label="Default invoice due days"
              value={values.default_invoice_due_days}
              type="number"
              min={0}
              max={365}
              required
              onChange={(defaultInvoiceDueDays) =>
                onChange({ ...values, default_invoice_due_days: defaultInvoiceDueDays })
              }
            />
          </div>

          <div className="grid gap-4">
            <TextAreaField
              label="Business address"
              value={values.address}
              minLength={5}
              maxLength={500}
              required
              onChange={(address) => onChange({ ...values, address })}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <SelectField
              label="Tax profile"
              value={values.tax_profile}
              options={[
                ['vat_registered', 'VAT registered'],
                ['non_vat', 'Non-VAT'],
                ['no_tax', 'No tax'],
              ]}
              onChange={(taxProfile) => {
                const nextTaxProfile = taxProfile as TaxProfile;
                onChange({
                  ...values,
                  tax_profile: nextTaxProfile,
                  tax_mode: nextTaxProfile === 'vat_registered' ? 'tax_exclusive' : 'no_tax',
                });
              }}
            />
            <SelectField
              label="Tax mode"
              value={values.tax_mode}
              options={
                values.tax_profile === 'vat_registered'
                  ? [
                      ['tax_exclusive', 'Tax exclusive'],
                      ['tax_inclusive', 'Tax inclusive'],
                    ]
                  : [['no_tax', 'No tax']]
              }
              onChange={(taxMode) => onChange({ ...values, tax_mode: taxMode as TaxMode })}
            />
            <TextField
              label="VAT rate"
              value={values.vat_rate}
              type="number"
              min={0}
              max={1}
              step="0.0001"
              required
              disabled={values.tax_profile !== 'vat_registered'}
              onChange={(vatRate) => onChange({ ...values, vat_rate: vatRate })}
            />
          </div>

          <BusinessHoursFields values={values} onChange={onChange} />

          <div className="grid gap-4 md:grid-cols-2">
            <TextAreaField
              label="Receipt footer text"
              value={values.receipt_footer_text}
              maxLength={500}
              onChange={(receiptFooterText) =>
                onChange({ ...values, receipt_footer_text: receiptFooterText })
              }
            />
            <TextField
              label="Reminder sender name"
              value={values.reminder_sender_name}
              maxLength={100}
              onChange={(reminderSenderName) =>
                onChange({ ...values, reminder_sender_name: reminderSenderName })
              }
            />
          </div>

          <SaveStatusAlert state={saveStatus} />

          <div className="flex flex-wrap justify-end gap-3">
            <Button type="submit" disabled={saveStatus.status === 'submitting'}>
              {saveStatus.status === 'submitting' ? 'Saving…' : 'Save setup settings'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function FirstBranchPanel({
  values,
  saveStatus,
  requirementComplete,
  onChange,
  onCreate,
}: {
  readonly values: FirstBranchOnboardingValues;
  readonly saveStatus: OnboardingSaveStatus;
  readonly requirementComplete: boolean;
  readonly onChange: (values: FirstBranchOnboardingValues) => void;
  readonly onCreate: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Create first active branch</CardTitle>
        <CardDescription>
          Created through <code>POST /branches</code>. The backend enforces plan limits and audit
          logs blocked branch creation attempts.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            onCreate();
          }}
        >
          {requirementComplete ? (
            <Alert>
              <p className="text-sm font-bold">An active branch already exists.</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                This step is satisfied. Creating more branches is still controlled by plan limits.
              </p>
            </Alert>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              label="Branch name"
              value={values.name}
              maxLength={150}
              required
              onChange={(name) => onChange({ ...values, name })}
            />
            <TextField
              label="Contact number"
              value={values.contact_number}
              maxLength={50}
              required
              onChange={(contactNumber) => onChange({ ...values, contact_number: contactNumber })}
            />
          </div>

          <TextAreaField
            label="Branch address"
            value={values.address}
            maxLength={500}
            required
            onChange={(address) => onChange({ ...values, address })}
          />

          <BranchBusinessHoursFields values={values} onChange={onChange} />

          <SaveStatusAlert state={saveStatus} />

          <div className="flex flex-wrap justify-end gap-3">
            <Button type="submit" disabled={saveStatus.status === 'submitting'}>
              {saveStatus.status === 'submitting' ? 'Creating…' : 'Create first branch'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function VerificationPanel({
  session,
  onboardingState,
}: {
  readonly session: AuthSessionResponseData;
  readonly onboardingState: OnboardingStateResponse;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Owner, role, and subscription verification</CardTitle>
        <CardDescription>
          These checks are backend-derived. The UI cannot override missing owner role or
          subscription blockers.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <VerificationCard
          title="Active Shop Owner"
          completed={onboardingState.requirements.active_shop_owner}
          description="At least one active tenant user must have the protected Shop Owner role."
        />
        <VerificationCard
          title="Subscription plan"
          completed={onboardingState.requirements.subscription_plan}
          description={session.effective_plan?.name ?? 'No effective plan returned by session.'}
        />
        <VerificationCard
          title="Subscription expiration"
          completed={onboardingState.requirements.subscription_expiration_date}
          description={
            session.subscription?.expiration_date ?? 'No expiration date returned by session.'
          }
        />
        <VerificationCard
          title="Operational access"
          completed={session.access.can_access_operational_modules}
          description={
            session.access.can_access_operational_modules
              ? 'Operational modules are available by session state.'
              : 'Operational modules remain blocked while pending setup.'
          }
        />
      </CardContent>
    </Card>
  );
}

function CompletePanel({
  onboardingState,
  completionStatus,
  onComplete,
}: {
  readonly onboardingState: OnboardingStateResponse;
  readonly completionStatus: OnboardingSaveStatus;
  readonly onComplete: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Complete onboarding</CardTitle>
        <CardDescription>
          The completion endpoint moves the tenant from <code>pending_setup</code> to{' '}
          <code>active</code>
          only when all requirements pass.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        {onboardingState.can_complete_onboarding ? (
          <Alert>
            <p className="text-sm font-bold">Ready to complete.</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              The backend will create the lifecycle event, set onboarding completion timestamp, and
              audit the completion action.
            </p>
          </Alert>
        ) : (
          <Alert variant="destructive">
            <p className="text-sm font-bold">Setup blockers remain.</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Missing: {onboardingState.missing_requirements.map(formatRequirementCode).join(', ')}.
            </p>
          </Alert>
        )}

        <SaveStatusAlert state={completionStatus} />

        <div className="flex justify-end">
          <Button
            type="button"
            disabled={
              !onboardingState.can_complete_onboarding || completionStatus.status === 'submitting'
            }
            onClick={onComplete}
          >
            {completionStatus.status === 'submitting' ? 'Completing…' : 'Complete onboarding'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PanelNav({
  activePanel,
  onChange,
}: {
  readonly activePanel: ActivePanel;
  readonly onChange: (panel: ActivePanel) => void;
}) {
  const panels: ReadonlyArray<{ readonly key: ActivePanel; readonly label: string }> = [
    { key: 'profile', label: 'Profile' },
    { key: 'branch', label: 'Branch' },
    { key: 'verify', label: 'Verify' },
    { key: 'complete', label: 'Complete' },
  ];

  return (
    <div className="flex gap-2 overflow-x-auto rounded-2xl border border-border bg-card p-2 shadow-sm">
      {panels.map((panel) => (
        <Button
          key={panel.key}
          type="button"
          variant={activePanel === panel.key ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => onChange(panel.key)}
        >
          {panel.label}
        </Button>
      ))}
    </div>
  );
}

function BusinessHoursFields({
  values,
  onChange,
}: {
  readonly values: ShopProfileOnboardingValues;
  readonly onChange: (values: ShopProfileOnboardingValues) => void;
}) {
  return (
    <section className="grid gap-4">
      <div>
        <h2 className="text-sm font-bold text-foreground">Business hours</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Use a consistent text format such as <code>08:00-17:00</code> or <code>Closed</code>.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <TextField
          label="Monday"
          value={values.monday_hours}
          required
          onChange={(value) => onChange({ ...values, monday_hours: value })}
        />
        <TextField
          label="Tuesday"
          value={values.tuesday_hours}
          required
          onChange={(value) => onChange({ ...values, tuesday_hours: value })}
        />
        <TextField
          label="Wednesday"
          value={values.wednesday_hours}
          required
          onChange={(value) => onChange({ ...values, wednesday_hours: value })}
        />
        <TextField
          label="Thursday"
          value={values.thursday_hours}
          required
          onChange={(value) => onChange({ ...values, thursday_hours: value })}
        />
        <TextField
          label="Friday"
          value={values.friday_hours}
          required
          onChange={(value) => onChange({ ...values, friday_hours: value })}
        />
        <TextField
          label="Saturday"
          value={values.saturday_hours}
          required
          onChange={(value) => onChange({ ...values, saturday_hours: value })}
        />
        <TextField
          label="Sunday"
          value={values.sunday_hours}
          required
          onChange={(value) => onChange({ ...values, sunday_hours: value })}
        />
      </div>
    </section>
  );
}

function BranchBusinessHoursFields({
  values,
  onChange,
}: {
  readonly values: FirstBranchOnboardingValues;
  readonly onChange: (values: FirstBranchOnboardingValues) => void;
}) {
  return (
    <section className="grid gap-4">
      <div>
        <h2 className="text-sm font-bold text-foreground">Branch business hours</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Branch hours are stored with the branch record.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <TextField
          label="Monday"
          value={values.monday_hours}
          required
          onChange={(value) => onChange({ ...values, monday_hours: value })}
        />
        <TextField
          label="Tuesday"
          value={values.tuesday_hours}
          required
          onChange={(value) => onChange({ ...values, tuesday_hours: value })}
        />
        <TextField
          label="Wednesday"
          value={values.wednesday_hours}
          required
          onChange={(value) => onChange({ ...values, wednesday_hours: value })}
        />
        <TextField
          label="Thursday"
          value={values.thursday_hours}
          required
          onChange={(value) => onChange({ ...values, thursday_hours: value })}
        />
        <TextField
          label="Friday"
          value={values.friday_hours}
          required
          onChange={(value) => onChange({ ...values, friday_hours: value })}
        />
        <TextField
          label="Saturday"
          value={values.saturday_hours}
          required
          onChange={(value) => onChange({ ...values, saturday_hours: value })}
        />
        <TextField
          label="Sunday"
          value={values.sunday_hours}
          required
          onChange={(value) => onChange({ ...values, sunday_hours: value })}
        />
      </div>
    </section>
  );
}

function TextField({
  label,
  value,
  onChange,
  ...inputProps
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'>) {
  const id = useMemo(() => toControlId(label), [label]);

  return (
    <label htmlFor={id} className="grid gap-2 text-sm font-semibold text-foreground">
      <span>{label}</span>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        {...inputProps}
      />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  ...textAreaProps
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
} & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'>) {
  const id = useMemo(() => toControlId(label), [label]);

  return (
    <label htmlFor={id} className="grid gap-2 text-sm font-semibold text-foreground">
      <span>{label}</span>
      <textarea
        id={id}
        value={value}
        rows={4}
        className="min-h-24 rounded-xl border border-input bg-background px-3 py-2 text-base text-foreground shadow-sm outline-none transition placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-destructive/20"
        onChange={(event) => onChange(event.target.value)}
        {...textAreaProps}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly options: ReadonlyArray<readonly [string, string]>;
  readonly onChange: (value: string) => void;
}) {
  const id = useMemo(() => toControlId(label), [label]);

  return (
    <label htmlFor={id} className="grid gap-2 text-sm font-semibold text-foreground">
      <span>{label}</span>
      <select
        id={id}
        value={value}
        className="min-h-11 rounded-xl border border-input bg-background px-3 py-2 text-base text-foreground shadow-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20"
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function OnboardingLoadState({
  state,
  onRetry,
}: {
  readonly state: Exclude<LoadState, { readonly status: 'ready' }>;
  readonly onRetry: () => void;
}) {
  return (
    <main className="min-h-dvh bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100dvh-3rem)] max-w-5xl place-items-center">
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <CardTitle>
              {state.status === 'loading' ? 'Loading onboarding' : 'Onboarding unavailable'}
            </CardTitle>
            <CardDescription>
              {state.status === 'loading' ? 'Resolving tenant setup requirements.' : state.message}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {state.status === 'loading' ? (
              <div className="grid gap-3" aria-busy="true" aria-live="polite">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : (
              <Alert variant="destructive">
                <p className="text-sm font-bold">{state.message}</p>
                {state.detail === null ? null : (
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{state.detail}</p>
                )}
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button type="button" variant="secondary" onClick={onRetry}>
                    Retry
                  </Button>
                  <ButtonLink href="/auth/login" variant="secondary">
                    Login
                  </ButtonLink>
                </div>
              </Alert>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function ChecklistRow({
  label,
  completed,
}: {
  readonly label: string;
  readonly completed: boolean;
}) {
  return (
    <li className="flex items-start gap-3 rounded-2xl border border-border bg-muted/50 p-4 text-sm">
      <Badge variant={completed ? 'success' : 'warning'}>{completed ? 'Done' : 'Missing'}</Badge>
      <span className="leading-6 text-muted-foreground">{label}</span>
    </li>
  );
}

function VerificationCard({
  title,
  completed,
  description,
}: {
  readonly title: string;
  readonly completed: boolean;
  readonly description: string;
}) {
  return (
    <section className="grid gap-3 rounded-2xl border border-border bg-muted/50 p-4 text-sm">
      <Badge variant={completed ? 'success' : 'warning'}>
        {completed ? 'Verified' : 'Blocked'}
      </Badge>
      <h2 className="font-bold text-foreground">{title}</h2>
      <p className="leading-6 text-muted-foreground">{description}</p>
    </section>
  );
}

function InfoLine({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-muted/50 p-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-bold text-foreground">{value}</span>
    </div>
  );
}

function SaveStatusAlert({ state }: { readonly state: OnboardingSaveStatus }) {
  if (state.status === 'idle') {
    return null;
  }

  if (state.status === 'submitting') {
    return (
      <Alert>
        <p className="text-sm font-bold">Submitting…</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Keep this page open until the backend responds.
        </p>
      </Alert>
    );
  }

  const detail = state.status === 'error' ? state.detail : null;

  return (
    <Alert variant={state.status === 'success' ? 'default' : 'destructive'}>
      <p className="text-sm font-bold">{state.message}</p>
      {detail === null ? null : (
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>
      )}
    </Alert>
  );
}

function buildProfileRequest(values: ShopProfileOnboardingValues): ShopProfileRequest {
  return {
    shop_name: values.shop_name.trim(),
    address: values.address.trim(),
    contact_number: values.contact_number.trim(),
    email: values.email.trim(),
    business_hours: toBusinessHours(values),
    tax_profile: values.tax_profile,
    tax_mode: values.tax_mode,
    vat_rate: values.tax_profile === 'vat_registered' ? Number(values.vat_rate) : 0,
    country: values.country.trim().toUpperCase(),
    timezone: values.timezone.trim(),
    currency: values.currency.trim().toUpperCase(),
    invoice_prefix: values.invoice_prefix.trim().toUpperCase(),
    receipt_footer_text: toNullableText(values.receipt_footer_text),
    reminder_sender_name: toNullableText(values.reminder_sender_name),
    default_invoice_due_days: Number(values.default_invoice_due_days),
  };
}

function buildBranchRequest(values: FirstBranchOnboardingValues): CreateBranchRequest {
  return {
    name: values.name.trim(),
    address: values.address.trim(),
    contact_number: values.contact_number.trim(),
    business_hours: toBusinessHours(values),
  };
}

function validateProfileRequest(request: ShopProfileRequest): string | null {
  if (request.shop_name.length < 2) {
    return 'Shop name must be at least 2 characters.';
  }

  if (request.address.length < 5) {
    return 'Business address must be at least 5 characters.';
  }

  if (request.contact_number.length === 0) {
    return 'Contact number is required.';
  }

  if (!request.email.includes('@')) {
    return 'Email address must be valid.';
  }

  if (!/^[A-Z0-9]{2,10}-$/.test(request.invoice_prefix)) {
    return 'Invoice prefix must match ^[A-Z0-9]{2,10}-$, for example MOTO-.';
  }

  if (!isValidTaxCombination(request.tax_profile, request.tax_mode)) {
    return 'Tax profile and tax mode combination is invalid.';
  }

  if (!Number.isFinite(request.vat_rate) || request.vat_rate < 0 || request.vat_rate > 1) {
    return 'VAT rate must be between 0 and 1.';
  }

  if (request.country.length !== 2) {
    return 'Country must be a two-letter code such as PH.';
  }

  if (request.currency.length !== 3) {
    return 'Currency must be a three-letter code such as PHP.';
  }

  if (!Number.isInteger(request.default_invoice_due_days)) {
    return 'Default invoice due days must be a whole number.';
  }

  return null;
}

function validateBranchRequest(request: CreateBranchRequest): string | null {
  if (request.name.length === 0) {
    return 'Branch name is required.';
  }

  if (request.address.length === 0) {
    return 'Branch address is required.';
  }

  if (request.contact_number.length === 0) {
    return 'Branch contact number is required.';
  }

  return null;
}

function isValidTaxCombination(taxProfile: TaxProfile, taxMode: TaxMode): boolean {
  return (
    (taxProfile === 'vat_registered' && ['tax_inclusive', 'tax_exclusive'].includes(taxMode)) ||
    (['non_vat', 'no_tax'].includes(taxProfile) && taxMode === 'no_tax')
  );
}

function toBusinessHours(
  values: Pick<
    ShopProfileOnboardingValues | FirstBranchOnboardingValues,
    | 'monday_hours'
    | 'tuesday_hours'
    | 'wednesday_hours'
    | 'thursday_hours'
    | 'friday_hours'
    | 'saturday_hours'
    | 'sunday_hours'
  >,
): Readonly<Record<string, string>> {
  return {
    monday: values.monday_hours.trim(),
    tuesday: values.tuesday_hours.trim(),
    wednesday: values.wednesday_hours.trim(),
    thursday: values.thursday_hours.trim(),
    friday: values.friday_hours.trim(),
    saturday: values.saturday_hours.trim(),
    sunday: values.sunday_hours.trim(),
  };
}

function toNullableText(value: string): string | null {
  const normalized = value.trim();

  return normalized.length > 0 ? normalized : null;
}

function shouldHydrateProfileDefaults(values: ShopProfileOnboardingValues): boolean {
  return values.shop_name.length === 0 && values.email.length === 0;
}

function shouldHydrateBranchDefaults(values: FirstBranchOnboardingValues): boolean {
  return values.address.length === 0 && values.contact_number.length === 0;
}

function resolveNextPanel(state: OnboardingStateResponse): ActivePanel {
  if (
    !state.requirements.shop_profile ||
    !state.requirements.invoice_prefix ||
    !state.requirements.tax_localization
  ) {
    return 'profile';
  }

  if (!state.requirements.active_branch) {
    return 'branch';
  }

  if (
    !state.requirements.active_shop_owner ||
    !state.requirements.subscription_plan ||
    !state.requirements.subscription_expiration_date
  ) {
    return 'verify';
  }

  return 'complete';
}

function resolveOnboardingRedirect(session: AuthSessionResponseData): string | null {
  if (!session.user.email_verified) {
    return '/auth/email-verification';
  }

  if (session.user.user_type === 'platform_admin') {
    return '/platform/tenants';
  }

  if (session.tenant?.status !== 'pending_setup') {
    return resolveAuthenticatedRedirect(session);
  }

  return null;
}

function toSafeErrorMessage(error: unknown, fallback: string): string {
  if (isApiClientError(error)) {
    return error.message;
  }

  return fallback;
}

function toSafeErrorDetail(error: unknown): string | null {
  if (!isApiClientError(error)) {
    return null;
  }

  const requestId = error.requestId === null ? 'N/A' : error.requestId;
  const correlationId = error.correlationId === null ? 'N/A' : error.correlationId;

  return `Code: ${error.code}. Request: ${requestId}. Correlation: ${correlationId}.`;
}

function formatRequirementCode(code: string): string {
  return code
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function toControlId(label: string): string {
  return `onboarding-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}
