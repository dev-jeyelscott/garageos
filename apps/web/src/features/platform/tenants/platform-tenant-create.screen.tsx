'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import {
  Alert,
  Button,
  ButtonLink,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
} from '../../../components/ui';
import { isApiClientError } from '../../../lib/api-envelope';

import { PlatformTenantForbiddenState } from './components/platform-tenant-results';
import { createPlatformTenant } from './platform-tenant.api';
import { defaultPlatformTenantCreateForm } from './platform-tenant.defaults';
import type {
  PlatformTenantCreateForm,
  PlatformTenantCreateSubmitState,
} from './platform-tenant.types';

export function PlatformTenantCreateContent({
  canCreateTenant,
}: {
  readonly canCreateTenant: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState<PlatformTenantCreateForm>(defaultPlatformTenantCreateForm);
  const [submitState, setSubmitState] = useState<PlatformTenantCreateSubmitState>({
    status: 'idle',
  });
  const isOffline = usePlatformOfflineStatus();

  function updateFormField<K extends keyof PlatformTenantCreateForm>(
    field: K,
    value: PlatformTenantCreateForm[K],
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleCreateTenantSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canCreateTenant || submitState.status === 'submitting' || isOffline) {
      return;
    }

    setSubmitState({ status: 'submitting' });

    try {
      const response = await createPlatformTenant(form);
      router.push(`/platform/tenants/${response.tenant.id}`);
    } catch (error) {
      setSubmitState({
        status: 'error',
        message: toSafeErrorMessage(error, 'Unable to create platform tenant.'),
        detail: toSafeErrorDetail(error),
        code: getApiErrorCode(error),
        fieldErrors: getApiFieldErrors(error),
      });
    }
  }

  const isSubmitting = submitState.status === 'submitting';
  const fieldErrors = submitState.status === 'error' ? submitState.fieldErrors : {};

  if (!canCreateTenant) {
    return (
      <PlatformTenantForbiddenState
        title="Platform tenant creation unavailable"
        requiredPermission="platform.tenants.create"
        description="Your platform session does not include permission to create tenant records."
      />
    );
  }

  return (
    <>
      <Alert>
        <p className="text-sm leading-6">
          This screen wires only the documented platform-created tenant flow. It creates a
          pending-setup tenant, assigns the selected plan ID and subscription dates, and sends a
          shop owner invitation. Subscription overrides, support access, exports, deletion jobs, and
          platform audit log search remain separate workflow slices.
        </p>
      </Alert>

      {submitState.status === 'error' ? (
        <Alert variant="destructive">
          <p className="text-sm font-bold">{submitState.message}</p>
          {submitState.detail === null ? null : (
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{submitState.detail}</p>
          )}
          {submitState.code === 'duplicate_resource' ? (
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              A matching non-deleted tenant already exists. Review the tenant carefully before
              enabling duplicate approval and providing an approval reason.
            </p>
          ) : null}
          {submitState.code === 'idempotency_conflict' ? (
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              The creation request conflicts with a previous retry. Reload the form before
              submitting again so the backend receives a fresh idempotency key.
            </p>
          ) : null}
        </Alert>
      ) : null}

      {isOffline ? (
        <Alert variant="destructive">
          <p className="text-sm font-bold">Offline mode</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Tenant creation is disabled while GarageOS is offline. Reconnect before submitting.
          </p>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Tenant setup</CardTitle>
          <CardDescription>
            Enter the tenant identity, subscription baseline, and owner invitation details required
            by the platform tenant creation API.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-6" onSubmit={handleCreateTenantSubmit}>
            <fieldset
              className="grid gap-6 disabled:pointer-events-none disabled:opacity-70"
              disabled={isSubmitting}
            >
              <section className="grid gap-4 rounded-2xl border border-border bg-muted/40 p-4">
                <div>
                  <h2 className="font-bold text-foreground">Business information</h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Tenant identity fields are used for duplicate detection and platform
                    administration. Country, currency, timezone, contact number, and address are
                    completed later because the current backend create contract does not accept
                    those fields.
                  </p>
                </div>

                <label className="grid gap-2">
                  <span className="text-sm font-bold text-foreground">Business name</span>
                  <Input
                    value={form.business_name}
                    onChange={(event) =>
                      updateFormField('business_name', event.currentTarget.value)
                    }
                    required
                    maxLength={200}
                    placeholder="Example Moto Garage"
                  />
                  <FieldError message={fieldErrors.business_name} />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-bold text-foreground">Shop email</span>
                  <Input
                    type="email"
                    value={form.shop_email}
                    onChange={(event) => updateFormField('shop_email', event.currentTarget.value)}
                    required
                    placeholder="owner@example.com"
                  />
                  <FieldError message={fieldErrors.shop_email} />
                </label>
              </section>

              <section className="grid gap-4 rounded-2xl border border-border bg-muted/40 p-4">
                <div>
                  <h2 className="font-bold text-foreground">Subscription baseline</h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Use an active Basic, Mid, or High plan ID after external subscription
                    confirmation. A plan selector should replace this field when the platform plan
                    list API is wired.
                  </p>
                </div>

                <label className="grid gap-2">
                  <span className="text-sm font-bold text-foreground">Plan ID</span>
                  <Input
                    value={form.plan_id}
                    onChange={(event) => updateFormField('plan_id', event.currentTarget.value)}
                    required
                    placeholder="UUID of an active subscription plan"
                  />
                  <FieldError message={fieldErrors.plan_id} />
                </label>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="grid gap-2">
                    <span className="text-sm font-bold text-foreground">
                      Subscription start date
                    </span>
                    <Input
                      type="date"
                      value={form.subscription_start_date}
                      onChange={(event) =>
                        updateFormField('subscription_start_date', event.currentTarget.value)
                      }
                      required
                    />
                    <FieldError message={fieldErrors.subscription_start_date} />
                  </label>

                  <label className="grid gap-2">
                    <span className="text-sm font-bold text-foreground">
                      Subscription expiration date
                    </span>
                    <Input
                      type="date"
                      value={form.subscription_expiration_date}
                      onChange={(event) =>
                        updateFormField('subscription_expiration_date', event.currentTarget.value)
                      }
                      required
                    />
                    <FieldError message={fieldErrors.subscription_expiration_date} />
                  </label>
                </div>
              </section>

              <section className="grid gap-4 rounded-2xl border border-border bg-muted/40 p-4">
                <div>
                  <h2 className="font-bold text-foreground">Shop owner invitation</h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    The current backend contract creates a single-use owner invitation for the
                    tenant. Create-owner mode and temporary plaintext passwords are not supported by
                    this API contract.
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="grid gap-2">
                    <span className="text-sm font-bold text-foreground">Owner full name</span>
                    <Input
                      value={form.owner_full_name}
                      onChange={(event) =>
                        updateFormField('owner_full_name', event.currentTarget.value)
                      }
                      required
                      maxLength={200}
                      placeholder="Juan Dela Cruz"
                    />
                    <FieldError
                      message={fieldErrors.owner_full_name ?? fieldErrors['owner.full_name']}
                    />
                  </label>

                  <label className="grid gap-2">
                    <span className="text-sm font-bold text-foreground">Owner email</span>
                    <Input
                      type="email"
                      value={form.owner_email}
                      onChange={(event) =>
                        updateFormField('owner_email', event.currentTarget.value)
                      }
                      required
                      placeholder="owner@example.com"
                    />
                    <FieldError message={fieldErrors.owner_email ?? fieldErrors['owner.email']} />
                  </label>
                </div>
              </section>

              <section className="grid gap-4 rounded-2xl border border-border bg-muted/40 p-4">
                <div>
                  <h2 className="font-bold text-foreground">Duplicate approval</h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Use this only when a platform admin intentionally approves a tenant with the
                    same normalized business name and shop email combination.
                  </p>
                </div>

                <label className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
                  <input
                    type="checkbox"
                    checked={form.approve_duplicate}
                    onChange={(event) =>
                      updateFormField('approve_duplicate', event.currentTarget.checked)
                    }
                    className="mt-1 h-5 w-5 rounded border border-input"
                  />
                  <span>
                    <span className="block text-sm font-bold text-foreground">
                      Approve duplicate tenant
                    </span>
                    <span className="mt-1 block text-sm leading-6 text-muted-foreground">
                      Requires a clear reason and will be audited by the backend.
                    </span>
                  </span>
                </label>
                <FieldError message={fieldErrors.approve_duplicate} />

                <label className="grid gap-2">
                  <span className="text-sm font-bold text-foreground">
                    Duplicate approval reason
                  </span>
                  <textarea
                    value={form.duplicate_approval_reason}
                    onChange={(event) =>
                      updateFormField('duplicate_approval_reason', event.currentTarget.value)
                    }
                    required={form.approve_duplicate}
                    disabled={!form.approve_duplicate || isSubmitting}
                    maxLength={500}
                    rows={4}
                    className="min-h-28 rounded-xl border border-input bg-background px-3 py-2 text-base text-foreground shadow-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
                    placeholder="Reason for approving the duplicate tenant..."
                  />
                  <FieldError message={fieldErrors.duplicate_approval_reason} />
                </label>
              </section>

              <section className="grid gap-4 rounded-2xl border border-border bg-muted/40 p-4">
                <div>
                  <h2 className="font-bold text-foreground">Review</h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Tenant will start in pending setup until onboarding is complete and effective
                    plan access is available.
                  </p>
                </div>

                <dl className="grid gap-3 text-sm md:grid-cols-2">
                  <ReviewItem label="Business" value={form.business_name || 'Not entered'} />
                  <ReviewItem label="Shop email" value={form.shop_email || 'Not entered'} />
                  <ReviewItem label="Plan ID" value={form.plan_id || 'Not entered'} />
                  <ReviewItem
                    label="Expiration"
                    value={form.subscription_expiration_date || 'Not entered'}
                  />
                  <ReviewItem label="Owner setup" value="Invite owner" />
                  <ReviewItem label="Owner email" value={form.owner_email || 'Not entered'} />
                </dl>
              </section>
            </fieldset>

            <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
              <ButtonLink href="/platform/tenants" variant="secondary">
                Cancel
              </ButtonLink>
              <Button type="submit" variant="primary" disabled={isSubmitting || isOffline}>
                {isSubmitting ? 'Creating tenant...' : 'Create tenant and invite owner'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </>
  );
}

function ReviewItem({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <dt className="font-bold text-foreground">{label}</dt>
      <dd className="mt-1 break-words text-muted-foreground">{value}</dd>
    </div>
  );
}

function FieldError({ message }: { readonly message: string | undefined }) {
  if (message === undefined || message.length === 0) {
    return null;
  }

  return <p className="text-sm font-semibold text-destructive">{message}</p>;
}

function usePlatformOfflineStatus(): boolean {
  const [isOffline, setIsOffline] = useState(() =>
    typeof navigator === 'undefined' ? false : !navigator.onLine,
  );

  useEffect(() => {
    function handleOnline() {
      setIsOffline(false);
    }

    function handleOffline() {
      setIsOffline(true);
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOffline;
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

function getApiErrorCode(error: unknown): string | null {
  return isApiClientError(error) ? error.code : null;
}

function getApiFieldErrors(error: unknown): Record<string, string> {
  if (!isApiClientError(error)) {
    return {};
  }

  return error.details.reduce<Record<string, string>>((fieldErrors, detail) => {
    if (typeof detail.field === 'string' && typeof detail.message === 'string') {
      fieldErrors[detail.field] = detail.message;
    }

    return fieldErrors;
  }, {});
}
