'use client';

import { useEffect, useState, type FormEvent } from 'react';

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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../../../components/ui';
import type { AuthSessionResponseData, AuthTenantStatus } from '../../auth/types/auth-session';
import { isApiClientError } from '../../../lib/api-envelope';

import {
  defaultPlatformSupportAccessEndForm,
  defaultPlatformSupportAccessForm,
  defaultPlatformTenantDeletionJobForm,
  defaultPlatformTenantExportForm,
  defaultPlatformTenantReadOnlyOverrideForm,
  defaultPlatformTenantSubscriptionForm,
  defaultPlatformTenantSuspensionForm,
} from './platform-tenant.defaults';
import {
  applyPlatformTenantReadOnlyOverride,
  applyPlatformTenantSuspension,
  endPlatformSupportAccessSession,
  getPlatformTenantDetail,
  queuePlatformTenantDeletionJob,
  queuePlatformTenantExport,
  startPlatformSupportAccessSession,
  updatePlatformTenantSubscription,
} from './platform-tenant.api';
import type {
  PlatformSupportAccessEndForm,
  PlatformSupportAccessEndSubmitState,
  PlatformSupportAccessForm,
  PlatformSupportAccessMode,
  PlatformSupportAccessSubmitState,
  PlatformTenantDeletionJobForm,
  PlatformTenantDeletionJobSubmitState,
  PlatformTenantDetail,
  PlatformTenantDetailState,
  PlatformTenantExportForm,
  PlatformTenantExportSubmitState,
  PlatformTenantReadOnlyOverrideForm,
  PlatformTenantReadOnlyOverrideSubmitState,
  PlatformTenantSubscriptionForm,
  PlatformTenantSubscriptionSubmitState,
  PlatformTenantSuspensionForm,
  PlatformTenantSuspensionSubmitState,
} from './platform-tenant.types';

export function PlatformTenantDetailHeaderActions() {
  return (
    <>
      <ButtonLink href="/platform/tenants" variant="secondary">
        Back to tenants
      </ButtonLink>

      <ButtonLink href="#tenant-detail-tabs" variant="primary">
        Review sections
      </ButtonLink>
    </>
  );
}

export function PlatformTenantDetailContent({
  tenantId,
  session,
}: {
  readonly tenantId: string;
  readonly session: AuthSessionResponseData;
}) {
  const [tenantDetailState, setTenantDetailState] = useState<PlatformTenantDetailState>({
    status: 'idle',
  });

  const [subscriptionForm, setSubscriptionForm] = useState<PlatformTenantSubscriptionForm>(
    defaultPlatformTenantSubscriptionForm,
  );
  const [subscriptionSubmitState, setSubscriptionSubmitState] =
    useState<PlatformTenantSubscriptionSubmitState>({
      status: 'idle',
    });

  const [readOnlyOverrideForm, setReadOnlyOverrideForm] =
    useState<PlatformTenantReadOnlyOverrideForm>(defaultPlatformTenantReadOnlyOverrideForm);
  const [readOnlyOverrideSubmitState, setReadOnlyOverrideSubmitState] =
    useState<PlatformTenantReadOnlyOverrideSubmitState>({
      status: 'idle',
    });

  const [tenantSuspensionForm, setTenantSuspensionForm] = useState<PlatformTenantSuspensionForm>(
    defaultPlatformTenantSuspensionForm,
  );
  const [tenantSuspensionSubmitState, setTenantSuspensionSubmitState] =
    useState<PlatformTenantSuspensionSubmitState>({
      status: 'idle',
    });

  const [supportAccessForm, setSupportAccessForm] = useState<PlatformSupportAccessForm>(
    defaultPlatformSupportAccessForm,
  );
  const [supportAccessSubmitState, setSupportAccessSubmitState] =
    useState<PlatformSupportAccessSubmitState>({
      status: 'idle',
    });

  const [supportAccessEndForm, setSupportAccessEndForm] = useState<PlatformSupportAccessEndForm>(
    defaultPlatformSupportAccessEndForm,
  );
  const [supportAccessEndSubmitState, setSupportAccessEndSubmitState] =
    useState<PlatformSupportAccessEndSubmitState>({
      status: 'idle',
    });

  const [tenantExportForm, setTenantExportForm] = useState<PlatformTenantExportForm>(
    defaultPlatformTenantExportForm,
  );
  const [tenantExportSubmitState, setTenantExportSubmitState] =
    useState<PlatformTenantExportSubmitState>({
      status: 'idle',
    });

  const [tenantDeletionJobForm, setTenantDeletionJobForm] = useState<PlatformTenantDeletionJobForm>(
    defaultPlatformTenantDeletionJobForm,
  );
  const [tenantDeletionJobSubmitState, setTenantDeletionJobSubmitState] =
    useState<PlatformTenantDeletionJobSubmitState>({
      status: 'idle',
    });

  const isOffline = usePlatformOfflineStatus();
  const canReadTenantDetail = hasEffectivePermission(session, 'platform.tenants.read');
  const hasSubscriptionUpdatePermission = hasEffectivePermission(
    session,
    'platform.subscriptions.update',
  );
  const hasSupportAccessPermission = hasEffectivePermission(session, 'platform.support_access');
  const hasTenantUpdatePermission = hasEffectivePermission(session, 'platform.tenants.update');
  const canUpdateSubscription = hasSubscriptionUpdatePermission && !isOffline;
  const canStartSupportAccess = hasSupportAccessPermission && !isOffline;
  const canQueueTenantExport = hasTenantUpdatePermission && !isOffline;
  const canQueueTenantDeletionJob = hasTenantUpdatePermission && !isOffline;

  useEffect(() => {
    if (!canReadTenantDetail || tenantId.length === 0) {
      return;
    }

    let active = true;

    async function loadTenantDetail() {
      setTenantDetailState({ status: 'loading' });
      setSubscriptionSubmitState({ status: 'idle' });
      setReadOnlyOverrideSubmitState({ status: 'idle' });
      setTenantSuspensionSubmitState({ status: 'idle' });
      setSupportAccessSubmitState({ status: 'idle' });
      setSupportAccessEndSubmitState({ status: 'idle' });
      setTenantExportSubmitState({ status: 'idle' });
      setTenantDeletionJobSubmitState({ status: 'idle' });

      try {
        const tenant = await getPlatformTenantDetail(tenantId);

        if (!active) {
          return;
        }

        setTenantDetailState({
          status: 'loaded',
          tenant,
        });
      } catch (error) {
        if (!active) {
          return;
        }

        setTenantDetailState({
          status: 'error',
          message: toSafeErrorMessage(error, 'Unable to load platform tenant detail.'),
          detail: toSafeErrorDetail(error),
          code: getApiErrorCode(error),
        });
      }
    }

    void loadTenantDetail();

    return () => {
      active = false;
    };
  }, [canReadTenantDetail, tenantId]);

  useEffect(() => {
    if (tenantDetailState.status !== 'loaded') {
      return;
    }

    setSubscriptionForm(createPlatformTenantSubscriptionFormFromTenant(tenantDetailState.tenant));
  }, [tenantDetailState]);

  function updateSubscriptionFormField<K extends keyof PlatformTenantSubscriptionForm>(
    field: K,
    value: PlatformTenantSubscriptionForm[K],
  ) {
    setSubscriptionForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleTenantSubscriptionSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      !canUpdateSubscription ||
      subscriptionSubmitState.status === 'submitting' ||
      tenantDetailState.status !== 'loaded'
    ) {
      return;
    }

    const nextForm: PlatformTenantSubscriptionForm = {
      plan_id: subscriptionForm.plan_id.trim(),
      subscription_start_date: subscriptionForm.subscription_start_date,
      subscription_expiration_date: subscriptionForm.subscription_expiration_date,
      reason: subscriptionForm.reason.trim(),
    };

    const fieldErrors: Record<string, string> = {};

    if (nextForm.plan_id.length === 0) {
      fieldErrors.plan_id = 'Plan ID is required.';
    }

    if (nextForm.subscription_start_date.length === 0) {
      fieldErrors.subscription_start_date = 'Subscription start date is required.';
    }

    if (nextForm.subscription_expiration_date.length === 0) {
      fieldErrors.subscription_expiration_date = 'Subscription expiration date is required.';
    }

    if (
      nextForm.subscription_start_date.length > 0 &&
      nextForm.subscription_expiration_date.length > 0 &&
      nextForm.subscription_expiration_date < nextForm.subscription_start_date
    ) {
      fieldErrors.subscription_expiration_date =
        'Subscription expiration date must be on or after start date.';
    }

    if (nextForm.reason.length === 0) {
      fieldErrors.reason = 'Reason is required.';
    }

    if (Object.keys(fieldErrors).length > 0) {
      setSubscriptionSubmitState({
        status: 'error',
        message: 'Review the subscription update fields.',
        detail: null,
        code: 'validation_failed',
        fieldErrors,
      });
      return;
    }

    setSubscriptionSubmitState({ status: 'submitting' });

    try {
      await updatePlatformTenantSubscription(tenantId, nextForm);
      const refreshedTenant = await getPlatformTenantDetail(tenantId);

      setTenantDetailState({
        status: 'loaded',
        tenant: refreshedTenant,
      });
      setSubscriptionSubmitState({
        status: 'success',
        message: 'Tenant subscription was updated and the detail view was refreshed.',
      });
    } catch (error) {
      setSubscriptionSubmitState({
        status: 'error',
        message: toSafeErrorMessage(error, 'Unable to update tenant subscription.'),
        detail: toSafeErrorDetail(error),
        code: getApiErrorCode(error),
        fieldErrors: getApiFieldErrors(error),
      });
    }
  }

  function updateReadOnlyOverrideFormField<K extends keyof PlatformTenantReadOnlyOverrideForm>(
    field: K,
    value: PlatformTenantReadOnlyOverrideForm[K],
  ) {
    setReadOnlyOverrideForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleTenantReadOnlyOverrideSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      !canUpdateSubscription ||
      readOnlyOverrideSubmitState.status === 'submitting' ||
      tenantDetailState.status !== 'loaded'
    ) {
      return;
    }

    const nextForm: PlatformTenantReadOnlyOverrideForm = {
      reason: readOnlyOverrideForm.reason.trim(),
      expires_at: readOnlyOverrideForm.expires_at.trim(),
    };

    const fieldErrors: Record<string, string> = {};

    if (nextForm.reason.length === 0) {
      fieldErrors.reason = 'Reason is required.';
    }

    if (nextForm.expires_at.length > 0 && Number.isNaN(Date.parse(nextForm.expires_at))) {
      fieldErrors.expires_at = 'Expiry must be a valid date and time.';
    }

    if (Object.keys(fieldErrors).length > 0) {
      setReadOnlyOverrideSubmitState({
        status: 'error',
        message: 'Review the read-only override fields.',
        detail: null,
        code: 'validation_failed',
        fieldErrors,
      });
      return;
    }

    setReadOnlyOverrideSubmitState({ status: 'submitting' });

    try {
      await applyPlatformTenantReadOnlyOverride(tenantId, nextForm);
      const refreshedTenant = await getPlatformTenantDetail(tenantId);

      setTenantDetailState({
        status: 'loaded',
        tenant: refreshedTenant,
      });
      setReadOnlyOverrideForm(defaultPlatformTenantReadOnlyOverrideForm);
      setReadOnlyOverrideSubmitState({
        status: 'success',
        message: 'Read-only override was applied and the tenant detail view was refreshed.',
      });
    } catch (error) {
      setReadOnlyOverrideSubmitState({
        status: 'error',
        message: toSafeErrorMessage(error, 'Unable to apply tenant read-only override.'),
        detail: toSafeErrorDetail(error),
        code: getApiErrorCode(error),
        fieldErrors: getApiFieldErrors(error),
      });
    }
  }

  function updateTenantSuspensionFormField<K extends keyof PlatformTenantSuspensionForm>(
    field: K,
    value: PlatformTenantSuspensionForm[K],
  ) {
    setTenantSuspensionForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleTenantSuspensionSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      !canUpdateSubscription ||
      tenantSuspensionSubmitState.status === 'submitting' ||
      tenantDetailState.status !== 'loaded'
    ) {
      return;
    }

    const nextForm: PlatformTenantSuspensionForm = {
      reason: tenantSuspensionForm.reason.trim(),
      expires_at: tenantSuspensionForm.expires_at.trim(),
    };

    const fieldErrors: Record<string, string> = {};

    if (nextForm.reason.length === 0) {
      fieldErrors.reason = 'Reason is required.';
    }

    if (nextForm.expires_at.length > 0 && Number.isNaN(Date.parse(nextForm.expires_at))) {
      fieldErrors.expires_at = 'Expiry must be a valid date and time.';
    }

    if (Object.keys(fieldErrors).length > 0) {
      setTenantSuspensionSubmitState({
        status: 'error',
        message: 'Review the suspension fields.',
        detail: null,
        code: 'validation_failed',
        fieldErrors,
      });
      return;
    }

    setTenantSuspensionSubmitState({ status: 'submitting' });

    try {
      await applyPlatformTenantSuspension(tenantId, nextForm);
      const refreshedTenant = await getPlatformTenantDetail(tenantId);

      setTenantDetailState({
        status: 'loaded',
        tenant: refreshedTenant,
      });
      setTenantSuspensionForm(defaultPlatformTenantSuspensionForm);
      setTenantSuspensionSubmitState({
        status: 'success',
        message: 'Tenant suspension was applied and the tenant detail view was refreshed.',
      });
    } catch (error) {
      setTenantSuspensionSubmitState({
        status: 'error',
        message: toSafeErrorMessage(error, 'Unable to apply tenant suspension.'),
        detail: toSafeErrorDetail(error),
        code: getApiErrorCode(error),
        fieldErrors: getApiFieldErrors(error),
      });
    }
  }

  function updateSupportAccessFormField<K extends keyof PlatformSupportAccessForm>(
    field: K,
    value: PlatformSupportAccessForm[K],
  ) {
    setSupportAccessForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSupportAccessSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      !canStartSupportAccess ||
      supportAccessSubmitState.status === 'submitting' ||
      tenantDetailState.status !== 'loaded'
    ) {
      return;
    }

    const nextForm: PlatformSupportAccessForm = {
      mode: supportAccessForm.mode,
      reason: supportAccessForm.reason.trim(),
      expires_at: supportAccessForm.expires_at.trim(),
    };

    const fieldErrors: Record<string, string> = {};
    const parsedExpiry = Date.parse(nextForm.expires_at);

    if (nextForm.mode !== 'read_only' && nextForm.mode !== 'write_allowed') {
      fieldErrors.mode = 'Support access mode is required.';
    }

    if (nextForm.reason.length === 0) {
      fieldErrors.reason = 'Reason is required.';
    }

    if (nextForm.expires_at.length === 0) {
      fieldErrors.expires_at = 'Expiration is required.';
    } else if (Number.isNaN(parsedExpiry)) {
      fieldErrors.expires_at = 'Expiration must be a valid date and time.';
    } else if (parsedExpiry <= Date.now()) {
      fieldErrors.expires_at = 'Expiration must be in the future.';
    }

    if (Object.keys(fieldErrors).length > 0) {
      setSupportAccessSubmitState({
        status: 'error',
        message: 'Review the support access fields.',
        detail: null,
        code: 'validation_failed',
        fieldErrors,
      });
      return;
    }

    setSupportAccessSubmitState({ status: 'submitting' });

    try {
      const response = await startPlatformSupportAccessSession(tenantId, nextForm);

      setSupportAccessForm(defaultPlatformSupportAccessForm);
      setSupportAccessSubmitState({
        status: 'success',
        message:
          'Support access session was started. Keep this visible marker active while working in support context.',
        session: response.support_access_session,
      });
    } catch (error) {
      setSupportAccessSubmitState({
        status: 'error',
        message: toSafeErrorMessage(error, 'Unable to start support access session.'),
        detail: toSafeErrorDetail(error),
        code: getApiErrorCode(error),
        fieldErrors: getApiFieldErrors(error),
      });
    }
  }

  function updateSupportAccessEndFormField<K extends keyof PlatformSupportAccessEndForm>(
    field: K,
    value: PlatformSupportAccessEndForm[K],
  ) {
    setSupportAccessEndForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSupportAccessEndSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canStartSupportAccess || supportAccessEndSubmitState.status === 'submitting') {
      return;
    }

    const activeSupportAccessSession =
      supportAccessSubmitState.status === 'success' &&
      supportAccessSubmitState.session.ended_at === null
        ? supportAccessSubmitState.session
        : null;

    if (activeSupportAccessSession === null) {
      setSupportAccessEndSubmitState({
        status: 'error',
        message: 'No active support access session is available to end from this screen.',
        detail:
          'Start a support access session first, or reload once an active support-session list API is available.',
        code: 'workflow_transition_blocked',
        fieldErrors: {},
      });
      return;
    }

    const nextForm: PlatformSupportAccessEndForm = {
      reason: supportAccessEndForm.reason.trim(),
    };

    const fieldErrors: Record<string, string> = {};

    if (nextForm.reason.length === 0) {
      fieldErrors.reason = 'Reason is required.';
    }

    if (Object.keys(fieldErrors).length > 0) {
      setSupportAccessEndSubmitState({
        status: 'error',
        message: 'Review the support access end fields.',
        detail: null,
        code: 'validation_failed',
        fieldErrors,
      });
      return;
    }

    setSupportAccessEndSubmitState({ status: 'submitting' });

    try {
      const response = await endPlatformSupportAccessSession(
        activeSupportAccessSession.id,
        nextForm,
      );

      setSupportAccessEndForm(defaultPlatformSupportAccessEndForm);
      setSupportAccessEndSubmitState({
        status: 'success',
        message: 'Support access session was ended and the visible marker was updated.',
        session: response.support_access_session,
      });
      setSupportAccessSubmitState({
        status: 'success',
        message:
          'Support access session has ended. Start a new explicit session only if continued support work is required.',
        session: response.support_access_session,
      });
    } catch (error) {
      setSupportAccessEndSubmitState({
        status: 'error',
        message: toSafeErrorMessage(error, 'Unable to end support access session.'),
        detail: toSafeErrorDetail(error),
        code: getApiErrorCode(error),
        fieldErrors: getApiFieldErrors(error),
      });
    }
  }

  function updateTenantExportFormField<K extends keyof PlatformTenantExportForm>(
    field: K,
    value: PlatformTenantExportForm[K],
  ) {
    setTenantExportForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleTenantExportSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      !canQueueTenantExport ||
      tenantExportSubmitState.status === 'submitting' ||
      tenantDetailState.status !== 'loaded'
    ) {
      return;
    }

    const nextForm: PlatformTenantExportForm = {
      reason: tenantExportForm.reason.trim(),
      include_attachments: tenantExportForm.include_attachments,
    };

    const fieldErrors: Record<string, string> = {};

    if (nextForm.reason.length === 0) {
      fieldErrors.reason = 'Reason is required.';
    }

    if (Object.keys(fieldErrors).length > 0) {
      setTenantExportSubmitState({
        status: 'error',
        message: 'Review the tenant export fields.',
        detail: null,
        code: 'validation_failed',
        fieldErrors,
      });
      return;
    }

    setTenantExportSubmitState({ status: 'submitting' });

    try {
      const response = await queuePlatformTenantExport(tenantId, nextForm);

      setTenantExportForm(defaultPlatformTenantExportForm);
      setTenantExportSubmitState({
        status: 'success',
        message:
          'Tenant export job was queued. Full package generation and download links are completed by the export worker slice.',
        job: response.export_job,
      });
    } catch (error) {
      setTenantExportSubmitState({
        status: 'error',
        message: toSafeErrorMessage(error, 'Unable to queue tenant export.'),
        detail: toSafeErrorDetail(error),
        code: getApiErrorCode(error),
        fieldErrors: getApiFieldErrors(error),
      });
    }
  }

  function updateTenantDeletionJobFormField<K extends keyof PlatformTenantDeletionJobForm>(
    field: K,
    value: PlatformTenantDeletionJobForm[K],
  ) {
    setTenantDeletionJobForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleTenantDeletionJobSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      !canQueueTenantDeletionJob ||
      tenantDeletionJobSubmitState.status === 'submitting' ||
      tenantDetailState.status !== 'loaded'
    ) {
      return;
    }

    const nextForm: PlatformTenantDeletionJobForm = {
      reason: tenantDeletionJobForm.reason.trim(),
      confirmation: tenantDeletionJobForm.confirmation.trim(),
    };

    const fieldErrors: Record<string, string> = {};
    const expectedConfirmation = tenantDetailState.tenant.business_name;

    if (nextForm.reason.length === 0) {
      fieldErrors.reason = 'Reason is required.';
    }

    if (nextForm.confirmation !== expectedConfirmation) {
      fieldErrors.confirmation = `Type "${expectedConfirmation}" to confirm deletion job queueing.`;
    }

    if (tenantDetailState.tenant.status !== 'pending_deletion') {
      fieldErrors.confirmation =
        'Tenant must be pending deletion before a deletion job can be queued.';
    }

    if (
      tenantDetailState.tenant.deletion_scheduled_for === null ||
      tenantDetailState.tenant.deletion_scheduled_for === undefined
    ) {
      fieldErrors.confirmation =
        'Tenant must have deletion_scheduled_for before a deletion job can be queued.';
    }

    if (Object.keys(fieldErrors).length > 0) {
      setTenantDeletionJobSubmitState({
        status: 'error',
        message: 'Review the tenant deletion job fields.',
        detail: null,
        code: 'validation_failed',
        fieldErrors,
      });
      return;
    }

    setTenantDeletionJobSubmitState({ status: 'submitting' });

    try {
      const response = await queuePlatformTenantDeletionJob(tenantId, nextForm);

      setTenantDeletionJobForm(defaultPlatformTenantDeletionJobForm);
      setTenantDeletionJobSubmitState({
        status: 'success',
        message:
          'Tenant deletion job was queued. Permanent deletion execution remains handled by the tenant deletion worker slice.',
        job: response.deletion_job,
      });
    } catch (error) {
      setTenantDeletionJobSubmitState({
        status: 'error',
        message: toSafeErrorMessage(error, 'Unable to queue tenant deletion job.'),
        detail: toSafeErrorDetail(error),
        code: getApiErrorCode(error),
        fieldErrors: getApiFieldErrors(error),
      });
    }
  }

  const isLoadingTenant =
    tenantDetailState.status === 'idle' || tenantDetailState.status === 'loading';
  const subscriptionFieldErrors =
    subscriptionSubmitState.status === 'error' ? subscriptionSubmitState.fieldErrors : {};
  const readOnlyOverrideFieldErrors =
    readOnlyOverrideSubmitState.status === 'error' ? readOnlyOverrideSubmitState.fieldErrors : {};
  const tenantSuspensionFieldErrors =
    tenantSuspensionSubmitState.status === 'error' ? tenantSuspensionSubmitState.fieldErrors : {};
  const supportAccessFieldErrors =
    supportAccessSubmitState.status === 'error' ? supportAccessSubmitState.fieldErrors : {};
  const supportAccessEndFieldErrors =
    supportAccessEndSubmitState.status === 'error' ? supportAccessEndSubmitState.fieldErrors : {};
  const tenantExportFieldErrors =
    tenantExportSubmitState.status === 'error' ? tenantExportSubmitState.fieldErrors : {};
  const tenantDeletionJobFieldErrors =
    tenantDeletionJobSubmitState.status === 'error' ? tenantDeletionJobSubmitState.fieldErrors : {};

  if (!canReadTenantDetail) {
    return (
      <ForbiddenState
        title="Platform tenant detail unavailable"
        requiredPermission="platform.tenants.read"
        description="Your platform session does not include permission to view tenant records."
      />
    );
  }

  return (
    <>
      <Alert>
        <p className="text-sm leading-6">
          This screen reads platform tenant detail and wires the documented subscription management,
          read-only override, suspension, support access session, tenant export job trigger, and
          tenant deletion job queueing workflows. Plan management, platform audit logs, and full
          export packaging remain separate workflow slices.
        </p>
      </Alert>

      {isOffline ? (
        <Alert variant="destructive">
          <p className="text-sm font-bold">Offline mode</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            You're offline. Reconnect to perform platform actions.
          </p>
        </Alert>
      ) : null}

      {isLoadingTenant ? <TenantDetailSkeleton /> : null}

      {tenantDetailState.status === 'error' ? (
        tenantDetailState.code === 'forbidden' ? (
          <ForbiddenState
            title="Platform tenant detail blocked"
            requiredPermission="platform.tenants.read"
            description={tenantDetailState.message}
            detail={tenantDetailState.detail}
          />
        ) : (
          <Alert variant="destructive">
            <p className="text-sm font-bold">{tenantDetailState.message}</p>
            {tenantDetailState.detail === null ? null : (
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {tenantDetailState.detail}
              </p>
            )}
          </Alert>
        )
      ) : null}

      {tenantDetailState.status === 'loaded' ? (
        <PlatformTenantDetailTabs
          tenant={tenantDetailState.tenant}
          canUpdateSubscription={canUpdateSubscription}
          canStartSupportAccess={canStartSupportAccess}
          canQueueTenantExport={canQueueTenantExport}
          canQueueTenantDeletionJob={canQueueTenantDeletionJob}
          subscriptionForm={subscriptionForm}
          subscriptionSubmitState={subscriptionSubmitState}
          subscriptionFieldErrors={subscriptionFieldErrors}
          onSubscriptionChange={updateSubscriptionFormField}
          onSubscriptionSubmit={handleTenantSubscriptionSubmit}
          readOnlyOverrideForm={readOnlyOverrideForm}
          readOnlyOverrideSubmitState={readOnlyOverrideSubmitState}
          readOnlyOverrideFieldErrors={readOnlyOverrideFieldErrors}
          onReadOnlyOverrideChange={updateReadOnlyOverrideFormField}
          onReadOnlyOverrideSubmit={handleTenantReadOnlyOverrideSubmit}
          tenantSuspensionForm={tenantSuspensionForm}
          tenantSuspensionSubmitState={tenantSuspensionSubmitState}
          tenantSuspensionFieldErrors={tenantSuspensionFieldErrors}
          onTenantSuspensionChange={updateTenantSuspensionFormField}
          onTenantSuspensionSubmit={handleTenantSuspensionSubmit}
          supportAccessForm={supportAccessForm}
          supportAccessSubmitState={supportAccessSubmitState}
          supportAccessFieldErrors={supportAccessFieldErrors}
          supportAccessEndForm={supportAccessEndForm}
          supportAccessEndSubmitState={supportAccessEndSubmitState}
          supportAccessEndFieldErrors={supportAccessEndFieldErrors}
          onSupportAccessChange={updateSupportAccessFormField}
          onSupportAccessSubmit={handleSupportAccessSubmit}
          onSupportAccessEndChange={updateSupportAccessEndFormField}
          onSupportAccessEndSubmit={handleSupportAccessEndSubmit}
          tenantExportForm={tenantExportForm}
          tenantExportSubmitState={tenantExportSubmitState}
          tenantExportFieldErrors={tenantExportFieldErrors}
          onTenantExportChange={updateTenantExportFormField}
          onTenantExportSubmit={handleTenantExportSubmit}
          tenantDeletionJobForm={tenantDeletionJobForm}
          tenantDeletionJobSubmitState={tenantDeletionJobSubmitState}
          tenantDeletionJobFieldErrors={tenantDeletionJobFieldErrors}
          onTenantDeletionJobChange={updateTenantDeletionJobFormField}
          onTenantDeletionJobSubmit={handleTenantDeletionJobSubmit}
        />
      ) : null}
    </>
  );
}

function PlatformTenantDetailTabs({
  tenant,
  canUpdateSubscription,
  canStartSupportAccess,
  canQueueTenantExport,
  canQueueTenantDeletionJob,
  subscriptionForm,
  subscriptionSubmitState,
  subscriptionFieldErrors,
  onSubscriptionChange,
  onSubscriptionSubmit,
  readOnlyOverrideForm,
  readOnlyOverrideSubmitState,
  readOnlyOverrideFieldErrors,
  onReadOnlyOverrideChange,
  onReadOnlyOverrideSubmit,
  tenantSuspensionForm,
  tenantSuspensionSubmitState,
  tenantSuspensionFieldErrors,
  onTenantSuspensionChange,
  onTenantSuspensionSubmit,
  supportAccessForm,
  supportAccessSubmitState,
  supportAccessFieldErrors,
  supportAccessEndForm,
  supportAccessEndSubmitState,
  supportAccessEndFieldErrors,
  onSupportAccessChange,
  onSupportAccessSubmit,
  onSupportAccessEndChange,
  onSupportAccessEndSubmit,
  tenantExportForm,
  tenantExportSubmitState,
  tenantExportFieldErrors,
  onTenantExportChange,
  onTenantExportSubmit,
  tenantDeletionJobForm,
  tenantDeletionJobSubmitState,
  tenantDeletionJobFieldErrors,
  onTenantDeletionJobChange,
  onTenantDeletionJobSubmit,
}: {
  readonly tenant: PlatformTenantDetail;
  readonly canUpdateSubscription: boolean;
  readonly canStartSupportAccess: boolean;
  readonly canQueueTenantExport: boolean;
  readonly canQueueTenantDeletionJob: boolean;
  readonly subscriptionForm: PlatformTenantSubscriptionForm;
  readonly subscriptionSubmitState: PlatformTenantSubscriptionSubmitState;
  readonly subscriptionFieldErrors: Record<string, string>;
  readonly onSubscriptionChange: <K extends keyof PlatformTenantSubscriptionForm>(
    field: K,
    value: PlatformTenantSubscriptionForm[K],
  ) => void;
  readonly onSubscriptionSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly readOnlyOverrideForm: PlatformTenantReadOnlyOverrideForm;
  readonly readOnlyOverrideSubmitState: PlatformTenantReadOnlyOverrideSubmitState;
  readonly readOnlyOverrideFieldErrors: Record<string, string>;
  readonly onReadOnlyOverrideChange: <K extends keyof PlatformTenantReadOnlyOverrideForm>(
    field: K,
    value: PlatformTenantReadOnlyOverrideForm[K],
  ) => void;
  readonly onReadOnlyOverrideSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly tenantSuspensionForm: PlatformTenantSuspensionForm;
  readonly tenantSuspensionSubmitState: PlatformTenantSuspensionSubmitState;
  readonly tenantSuspensionFieldErrors: Record<string, string>;
  readonly onTenantSuspensionChange: <K extends keyof PlatformTenantSuspensionForm>(
    field: K,
    value: PlatformTenantSuspensionForm[K],
  ) => void;
  readonly onTenantSuspensionSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly supportAccessForm: PlatformSupportAccessForm;
  readonly supportAccessSubmitState: PlatformSupportAccessSubmitState;
  readonly supportAccessFieldErrors: Record<string, string>;
  readonly supportAccessEndForm: PlatformSupportAccessEndForm;
  readonly supportAccessEndSubmitState: PlatformSupportAccessEndSubmitState;
  readonly supportAccessEndFieldErrors: Record<string, string>;
  readonly onSupportAccessChange: <K extends keyof PlatformSupportAccessForm>(
    field: K,
    value: PlatformSupportAccessForm[K],
  ) => void;
  readonly onSupportAccessSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly onSupportAccessEndChange: <K extends keyof PlatformSupportAccessEndForm>(
    field: K,
    value: PlatformSupportAccessEndForm[K],
  ) => void;
  readonly onSupportAccessEndSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly tenantExportForm: PlatformTenantExportForm;
  readonly tenantExportSubmitState: PlatformTenantExportSubmitState;
  readonly tenantExportFieldErrors: Record<string, string>;
  readonly onTenantExportChange: <K extends keyof PlatformTenantExportForm>(
    field: K,
    value: PlatformTenantExportForm[K],
  ) => void;
  readonly onTenantExportSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly tenantDeletionJobForm: PlatformTenantDeletionJobForm;
  readonly tenantDeletionJobSubmitState: PlatformTenantDeletionJobSubmitState;
  readonly tenantDeletionJobFieldErrors: Record<string, string>;
  readonly onTenantDeletionJobChange: <K extends keyof PlatformTenantDeletionJobForm>(
    field: K,
    value: PlatformTenantDeletionJobForm[K],
  ) => void;
  readonly onTenantDeletionJobSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="grid gap-5">
      <div className="grid gap-4 lg:grid-cols-4">
        <SummaryCard
          title="Tenant status"
          value={formatTenantStatus(tenant.status)}
          description="Lifecycle access remains backend-authoritative."
        />
        <SummaryCard
          title="Plan"
          value={formatTenantPlan(tenant)}
          description={`Source: ${tenant.subscription?.status_source ?? 'Not returned'}`}
        />
        <SummaryCard
          title="Expiration"
          value={tenant.subscription?.expiration_date ?? 'Not returned'}
          description="Subscription lifecycle dates are interpreted by the backend."
        />
        <SummaryCard
          title="Onboarding"
          value={
            tenant.onboarding_completed_at === null || tenant.onboarding_completed_at === undefined
              ? 'Incomplete or not returned'
              : 'Completed'
          }
          description={tenant.onboarding_completed_at ?? 'Completion timestamp not returned'}
        />
      </div>

      <Tabs defaultValue="overview" id="tenant-detail-tabs" className="grid gap-5">
        <TabsList className="flex h-auto flex-wrap justify-start gap-2 rounded-2xl border border-border bg-muted/40 p-2">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="subscription">Subscription</TabsTrigger>
          <TabsTrigger value="support-access">Support Access</TabsTrigger>
          <TabsTrigger value="exports">Exports</TabsTrigger>
          <TabsTrigger value="deletion">Deletion</TabsTrigger>
          <TabsTrigger value="lifecycle">Lifecycle</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="grid gap-5">
          <Card>
            <CardHeader>
              <CardTitle>Tenant metadata</CardTitle>
              <CardDescription>
                Platform-visible tenant identity and localization fields from the tenant detail API.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <KeyValue label="Tenant ID" value={tenant.id} />
              <KeyValue label="Business name" value={tenant.business_name} />
              <KeyValue label="Shop email" value={tenant.shop_email ?? 'Not returned'} />
              <KeyValue
                label="Timezone / Country / Currency"
                value={formatTenantLocation(tenant)}
              />
              <KeyValue label="Created" value={tenant.created_at ?? 'Not returned'} />
              <KeyValue label="Last updated" value={tenant.updated_at ?? 'Not returned'} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Subscription snapshot</CardTitle>
              <CardDescription>
                Current subscription summary returned by the platform tenant detail API.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <KeyValue
                label="Plan ID"
                value={tenant.subscription?.plan_id ?? tenant.plan?.id ?? 'Not returned'}
              />
              <KeyValue label="Plan name" value={formatTenantPlan(tenant)} />
              <KeyValue
                label="Start date"
                value={tenant.subscription?.start_date ?? 'Not returned'}
              />
              <KeyValue
                label="Expiration date"
                value={tenant.subscription?.expiration_date ?? 'Not returned'}
              />
              <KeyValue
                label="Status source"
                value={tenant.subscription?.status_source ?? 'Not returned'}
              />
              <KeyValue
                label="Last renewal"
                value={tenant.subscription?.last_renewal_at ?? 'Not returned'}
              />
              <KeyValue
                label="Updated by platform admin"
                value={tenant.subscription?.updated_by_platform_admin_user_id ?? 'Not returned'}
              />
              <KeyValue
                label="Subscription updated"
                value={tenant.subscription?.updated_at ?? 'Not returned'}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="subscription" className="grid gap-5">
          <PlatformTenantSubscriptionManagementPanel
            tenant={tenant}
            canUpdateSubscription={canUpdateSubscription}
            form={subscriptionForm}
            submitState={subscriptionSubmitState}
            fieldErrors={subscriptionFieldErrors}
            onChange={onSubscriptionChange}
            onSubmit={onSubscriptionSubmit}
          />
        </TabsContent>

        <TabsContent value="support-access" className="grid gap-5">
          <PlatformTenantSupportAccessPanel
            tenant={tenant}
            canStartSupportAccess={canStartSupportAccess}
            form={supportAccessForm}
            submitState={supportAccessSubmitState}
            fieldErrors={supportAccessFieldErrors}
            endForm={supportAccessEndForm}
            endSubmitState={supportAccessEndSubmitState}
            endFieldErrors={supportAccessEndFieldErrors}
            onChange={onSupportAccessChange}
            onSubmit={onSupportAccessSubmit}
            onEndChange={onSupportAccessEndChange}
            onEndSubmit={onSupportAccessEndSubmit}
          />
        </TabsContent>

        <TabsContent value="exports" className="grid gap-5">
          <PlatformTenantExportPanel
            tenant={tenant}
            canQueueTenantExport={canQueueTenantExport}
            form={tenantExportForm}
            submitState={tenantExportSubmitState}
            fieldErrors={tenantExportFieldErrors}
            onChange={onTenantExportChange}
            onSubmit={onTenantExportSubmit}
          />
        </TabsContent>

        <TabsContent value="deletion" className="grid gap-5">
          <Card>
            <CardHeader>
              <CardTitle>Deletion readiness</CardTitle>
              <CardDescription>
                Read-only deletion lifecycle fields. Queueing is available below only when the
                backend confirms the tenant is pending deletion with a scheduled deletion timestamp.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <KeyValue label="Current status" value={formatTenantStatus(tenant.status)} />
              <KeyValue
                label="Deletion scheduled for"
                value={tenant.deletion_scheduled_for ?? 'Not returned'}
              />
              <KeyValue label="Deleted at" value={tenant.deleted_at ?? 'Not returned'} />
              <KeyValue
                label="Required permission"
                value="platform.tenants.update plus backend eligibility"
              />
            </CardContent>
          </Card>

          <PlatformTenantDeletionJobPanel
            tenant={tenant}
            canQueueTenantDeletionJob={canQueueTenantDeletionJob}
            form={tenantDeletionJobForm}
            submitState={tenantDeletionJobSubmitState}
            fieldErrors={tenantDeletionJobFieldErrors}
            onChange={onTenantDeletionJobChange}
            onSubmit={onTenantDeletionJobSubmit}
          />
        </TabsContent>

        <TabsContent value="lifecycle" className="grid gap-5">
          <Card>
            <CardHeader>
              <CardTitle>Lifecycle detail</CardTitle>
              <CardDescription>
                Read-only lifecycle fields used for platform operations and deletion safeguards.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <KeyValue label="Current status" value={formatTenantStatus(tenant.status)} />
              <KeyValue
                label="Onboarding completed"
                value={tenant.onboarding_completed_at ?? 'Not returned'}
              />
              <KeyValue
                label="Deletion scheduled for"
                value={tenant.deletion_scheduled_for ?? 'Not returned'}
              />
              <KeyValue label="Deleted at" value={tenant.deleted_at ?? 'Not returned'} />
            </CardContent>
          </Card>

          <PlatformTenantReadOnlyOverridePanel
            tenant={tenant}
            canUpdateSubscription={canUpdateSubscription}
            form={readOnlyOverrideForm}
            submitState={readOnlyOverrideSubmitState}
            fieldErrors={readOnlyOverrideFieldErrors}
            onChange={onReadOnlyOverrideChange}
            onSubmit={onReadOnlyOverrideSubmit}
          />

          <PlatformTenantSuspensionPanel
            tenant={tenant}
            canUpdateSubscription={canUpdateSubscription}
            form={tenantSuspensionForm}
            submitState={tenantSuspensionSubmitState}
            fieldErrors={tenantSuspensionFieldErrors}
            onChange={onTenantSuspensionChange}
            onSubmit={onTenantSuspensionSubmit}
          />
        </TabsContent>

        <TabsContent value="audit" className="grid gap-5">
          <Card>
            <CardHeader>
              <CardTitle>Audit placeholders</CardTitle>
              <CardDescription>
                Platform audit visibility remains planned until the audit-log API slice is wired.
                This tab documents placement without inventing audit data.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-2">
              <PlannedWorkflowCard
                title="Platform audit log search planned"
                requiredPermission="platform.audit_logs.read"
                description="Platform audit log search should use the documented /platform/audit-logs route when the backend API is available."
              />
              <PlannedWorkflowCard
                title="Tenant lifecycle history planned"
                requiredPermission="platform.tenants.read"
                description="Lifecycle status history should show actor, timestamp, previous status, next status, and reason only after the backend exposes safe history fields."
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function createPlatformTenantSubscriptionFormFromTenant(
  tenant: PlatformTenantDetail,
): PlatformTenantSubscriptionForm {
  return {
    plan_id: tenant.subscription?.plan_id ?? tenant.plan?.id ?? '',
    subscription_start_date: tenant.subscription?.start_date ?? '',
    subscription_expiration_date: tenant.subscription?.expiration_date ?? '',
    reason: '',
  };
}

function TenantDetailSkeleton() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-live="polite">
      <div className="grid gap-4 lg:grid-cols-4">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

function KeyValue({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-muted/50 p-4">
      <dt className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-2 break-words text-sm font-semibold leading-6 text-foreground">{value}</dd>
    </div>
  );
}

function PlatformTenantSubscriptionManagementPanel({
  tenant,
  canUpdateSubscription,
  form,
  submitState,
  fieldErrors,
  onChange,
  onSubmit,
}: {
  readonly tenant: PlatformTenantDetail;
  readonly canUpdateSubscription: boolean;
  readonly form: PlatformTenantSubscriptionForm;
  readonly submitState: PlatformTenantSubscriptionSubmitState;
  readonly fieldErrors: Record<string, string>;
  readonly onChange: <K extends keyof PlatformTenantSubscriptionForm>(
    field: K,
    value: PlatformTenantSubscriptionForm[K],
  ) => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const isSubmitting = submitState.status === 'submitting';
  const currentPlanId = tenant.subscription?.plan_id ?? tenant.plan?.id ?? 'Not returned';
  const currentStartDate = tenant.subscription?.start_date ?? 'Not returned';
  const currentExpirationDate = tenant.subscription?.expiration_date ?? 'Not returned';

  return (
    <Card id="tenant-subscription-management">
      <CardHeader>
        <CardTitle>Subscription management</CardTitle>
        <CardDescription>
          Update the tenant plan ID and subscription dates after external payment confirmation or
          platform subscription correction. A reason is required for auditability.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid gap-4 md:grid-cols-3">
          <KeyValue label="Current plan ID" value={currentPlanId} />
          <KeyValue label="Current start date" value={currentStartDate} />
          <KeyValue label="Current expiration date" value={currentExpirationDate} />
        </div>

        {!canUpdateSubscription ? (
          <Alert>
            <p className="text-sm font-bold">Subscription update unavailable</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Your platform session can view tenant subscription data, but it cannot submit
              subscription updates. Required permission:{' '}
              <strong>platform.subscriptions.update</strong>.
            </p>
          </Alert>
        ) : null}

        {submitState.status === 'success' ? (
          <Alert>
            <p className="text-sm font-bold">Subscription updated</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{submitState.message}</p>
          </Alert>
        ) : null}

        {submitState.status === 'error' ? (
          <Alert variant="destructive">
            <p className="text-sm font-bold">{submitState.message}</p>
            {submitState.detail === null ? null : (
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{submitState.detail}</p>
            )}
            {submitState.code === 'idempotency_conflict' ? (
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                The request was detected as a duplicate or retry conflict. Reload the tenant detail
                before submitting again.
              </p>
            ) : null}
          </Alert>
        ) : null}

        <form className="grid gap-5" onSubmit={onSubmit}>
          <fieldset
            className="grid gap-5 disabled:pointer-events-none disabled:opacity-70"
            disabled={!canUpdateSubscription || isSubmitting}
          >
            <section className="grid gap-4 rounded-2xl border border-border bg-muted/40 p-4">
              <div>
                <h2 className="font-bold text-foreground">Subscription update fields</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Use an active Basic, Mid, or High plan ID. The platform plan selector remains a
                  separate plan-management slice.
                </p>
              </div>

              <label className="grid gap-2">
                <span className="text-sm font-bold text-foreground">Plan ID</span>
                <Input
                  value={form.plan_id}
                  onChange={(event) => onChange('plan_id', event.currentTarget.value)}
                  required
                  placeholder="UUID of an active subscription plan"
                />
                <FieldError message={fieldErrors.plan_id} />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-sm font-bold text-foreground">Subscription start date</span>
                  <Input
                    type="date"
                    value={form.subscription_start_date}
                    onChange={(event) =>
                      onChange('subscription_start_date', event.currentTarget.value)
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
                      onChange('subscription_expiration_date', event.currentTarget.value)
                    }
                    required
                  />
                  <FieldError message={fieldErrors.subscription_expiration_date} />
                </label>
              </div>

              <label className="grid gap-2">
                <span className="text-sm font-bold text-foreground">Reason</span>
                <textarea
                  value={form.reason}
                  onChange={(event) => onChange('reason', event.currentTarget.value)}
                  required
                  maxLength={500}
                  rows={4}
                  className="min-h-28 rounded-xl border border-input bg-background px-3 py-2 text-base text-foreground shadow-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
                  placeholder="Example: External subscription payment confirmed for renewal."
                />
                <FieldError message={fieldErrors.reason} />
              </label>
            </section>
          </fieldset>

          <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
            <Button
              type="submit"
              variant="primary"
              disabled={!canUpdateSubscription || isSubmitting}
            >
              {isSubmitting ? 'Updating subscription...' : 'Update subscription'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function PlatformTenantReadOnlyOverridePanel({
  tenant,
  canUpdateSubscription,
  form,
  submitState,
  fieldErrors,
  onChange,
  onSubmit,
}: {
  readonly tenant: PlatformTenantDetail;
  readonly canUpdateSubscription: boolean;
  readonly form: PlatformTenantReadOnlyOverrideForm;
  readonly submitState: PlatformTenantReadOnlyOverrideSubmitState;
  readonly fieldErrors: Record<string, string>;
  readonly onChange: <K extends keyof PlatformTenantReadOnlyOverrideForm>(
    field: K,
    value: PlatformTenantReadOnlyOverrideForm[K],
  ) => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const isSubmitting = submitState.status === 'submitting';

  return (
    <Card id="tenant-read-only-override">
      <CardHeader>
        <CardTitle>Read-only override</CardTitle>
        <CardDescription>
          Force the tenant into read-only mode through the documented platform override workflow. A
          reason is required for auditability. Expiry is optional when the override is temporary.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid gap-4 md:grid-cols-2">
          <KeyValue label="Current tenant status" value={formatTenantStatus(tenant.status)} />
          <KeyValue
            label="Optional expiry behavior"
            value="Leave blank for an open-ended platform override"
          />
        </div>

        {!canUpdateSubscription ? (
          <Alert>
            <p className="text-sm font-bold">Read-only override unavailable</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Your platform session can view tenant lifecycle data, but it cannot apply read-only
              overrides. Required permission: <strong>platform.subscriptions.update</strong>.
            </p>
          </Alert>
        ) : null}

        {submitState.status === 'success' ? (
          <Alert>
            <p className="text-sm font-bold">Read-only override applied</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{submitState.message}</p>
          </Alert>
        ) : null}

        {submitState.status === 'error' ? (
          <Alert variant="destructive">
            <p className="text-sm font-bold">{submitState.message}</p>
            {submitState.detail === null ? null : (
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{submitState.detail}</p>
            )}
            {submitState.code === 'idempotency_conflict' ? (
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                The request was detected as a duplicate or retry conflict. Reload the tenant detail
                before submitting again.
              </p>
            ) : null}
          </Alert>
        ) : null}

        <form className="grid gap-5" onSubmit={onSubmit}>
          <fieldset
            className="grid gap-5 disabled:pointer-events-none disabled:opacity-70"
            disabled={!canUpdateSubscription || isSubmitting}
          >
            <section className="grid gap-4 rounded-2xl border border-border bg-muted/40 p-4">
              <div>
                <h2 className="font-bold text-foreground">Override fields</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  This does not process payment or suspend the tenant. It only applies the
                  documented read-only override and relies on backend authorization as
                  authoritative.
                </p>
              </div>

              <label className="grid gap-2">
                <span className="text-sm font-bold text-foreground">Reason</span>
                <textarea
                  value={form.reason}
                  onChange={(event) => onChange('reason', event.currentTarget.value)}
                  required
                  maxLength={500}
                  rows={4}
                  className="min-h-28 rounded-xl border border-input bg-background px-3 py-2 text-base text-foreground shadow-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
                  placeholder="Example: External billing issue requires temporary read-only access."
                />
                <FieldError message={fieldErrors.reason} />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-bold text-foreground">Optional expiry</span>
                <Input
                  type="datetime-local"
                  value={form.expires_at}
                  onChange={(event) => onChange('expires_at', event.currentTarget.value)}
                />
                <p className="text-sm leading-6 text-muted-foreground">
                  Optional. When provided, the frontend sends it to the API as an ISO timestamp.
                </p>
                <FieldError message={fieldErrors.expires_at} />
              </label>
            </section>
          </fieldset>

          <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
            <Button
              type="submit"
              variant="primary"
              disabled={!canUpdateSubscription || isSubmitting}
            >
              {isSubmitting ? 'Applying read-only override...' : 'Apply read-only override'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function PlatformTenantSuspensionPanel({
  tenant,
  canUpdateSubscription,
  form,
  submitState,
  fieldErrors,
  onChange,
  onSubmit,
}: {
  readonly tenant: PlatformTenantDetail;
  readonly canUpdateSubscription: boolean;
  readonly form: PlatformTenantSuspensionForm;
  readonly submitState: PlatformTenantSuspensionSubmitState;
  readonly fieldErrors: Record<string, string>;
  readonly onChange: <K extends keyof PlatformTenantSuspensionForm>(
    field: K,
    value: PlatformTenantSuspensionForm[K],
  ) => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const isSubmitting = submitState.status === 'submitting';

  return (
    <Card id="tenant-suspension">
      <CardHeader>
        <CardTitle>Tenant suspension</CardTitle>
        <CardDescription>
          Suspend tenant operational access through the documented platform override workflow. A
          reason is required for auditability. Expiry is optional when the suspension is temporary.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid gap-4 md:grid-cols-2">
          <KeyValue label="Current tenant status" value={formatTenantStatus(tenant.status)} />
          <KeyValue
            label="Suspension effect"
            value="Shop Owner renewal/export only; non-owner access blocked"
          />
        </div>

        <Alert variant="destructive">
          <p className="text-sm font-bold">High-impact tenant lifecycle action</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Suspension blocks operational access for tenant users. The backend remains authoritative
            for lifecycle enforcement and audit logging.
          </p>
        </Alert>

        {!canUpdateSubscription ? (
          <Alert>
            <p className="text-sm font-bold">Tenant suspension unavailable</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Your platform session can view tenant lifecycle data, but it cannot suspend tenants.
              Required permission: <strong>platform.subscriptions.update</strong>.
            </p>
          </Alert>
        ) : null}

        {submitState.status === 'success' ? (
          <Alert>
            <p className="text-sm font-bold">Tenant suspended</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{submitState.message}</p>
          </Alert>
        ) : null}

        {submitState.status === 'error' ? (
          <Alert variant="destructive">
            <p className="text-sm font-bold">{submitState.message}</p>
            {submitState.detail === null ? null : (
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{submitState.detail}</p>
            )}
            {submitState.code === 'idempotency_conflict' ? (
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                The request was detected as a duplicate or retry conflict. Reload the tenant detail
                before submitting again.
              </p>
            ) : null}
          </Alert>
        ) : null}

        <form className="grid gap-5" onSubmit={onSubmit}>
          <fieldset
            className="grid gap-5 disabled:pointer-events-none disabled:opacity-70"
            disabled={!canUpdateSubscription || isSubmitting}
          >
            <section className="grid gap-4 rounded-2xl border border-border bg-muted/40 p-4">
              <div>
                <h2 className="font-bold text-foreground">Suspension fields</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  This does not process payment, create support access, trigger export, or queue
                  deletion. It only applies the documented suspension override.
                </p>
              </div>

              <label className="grid gap-2">
                <span className="text-sm font-bold text-foreground">Reason</span>
                <textarea
                  value={form.reason}
                  onChange={(event) => onChange('reason', event.currentTarget.value)}
                  required
                  maxLength={500}
                  rows={4}
                  className="min-h-28 rounded-xl border border-input bg-background px-3 py-2 text-base text-foreground shadow-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
                  placeholder="Example: External subscription non-payment confirmed after grace and read-only period."
                />
                <FieldError message={fieldErrors.reason} />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-bold text-foreground">Optional expiry</span>
                <Input
                  type="datetime-local"
                  value={form.expires_at}
                  onChange={(event) => onChange('expires_at', event.currentTarget.value)}
                />
                <p className="text-sm leading-6 text-muted-foreground">
                  Optional. When provided, the frontend sends it to the API as an ISO timestamp.
                </p>
                <FieldError message={fieldErrors.expires_at} />
              </label>
            </section>
          </fieldset>

          <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
            <Button
              type="submit"
              variant="destructive"
              disabled={!canUpdateSubscription || isSubmitting}
            >
              {isSubmitting ? 'Suspending tenant...' : 'Suspend tenant'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function PlatformTenantSupportAccessPanel({
  tenant,
  canStartSupportAccess,
  form,
  submitState,
  fieldErrors,
  endForm,
  endSubmitState,
  endFieldErrors,
  onChange,
  onSubmit,
  onEndChange,
  onEndSubmit,
}: {
  readonly tenant: PlatformTenantDetail;
  readonly canStartSupportAccess: boolean;
  readonly form: PlatformSupportAccessForm;
  readonly submitState: PlatformSupportAccessSubmitState;
  readonly fieldErrors: Record<string, string>;
  readonly endForm: PlatformSupportAccessEndForm;
  readonly endSubmitState: PlatformSupportAccessEndSubmitState;
  readonly endFieldErrors: Record<string, string>;
  readonly onChange: <K extends keyof PlatformSupportAccessForm>(
    field: K,
    value: PlatformSupportAccessForm[K],
  ) => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly onEndChange: <K extends keyof PlatformSupportAccessEndForm>(
    field: K,
    value: PlatformSupportAccessEndForm[K],
  ) => void;
  readonly onEndSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const isSubmitting = submitState.status === 'submitting';
  const isEnding = endSubmitState.status === 'submitting';
  const isWriteAllowed = form.mode === 'write_allowed';
  const visibleSupportAccessState = submitState.status === 'success' ? submitState : null;
  const visibleSupportAccessSession = visibleSupportAccessState?.session ?? null;
  const visibleSupportAccessMessage = visibleSupportAccessState?.message ?? null;
  const canEndVisibleSession = visibleSupportAccessSession?.ended_at === null;

  return (
    <Card id="tenant-support-access">
      <CardHeader>
        <CardTitle>Support access</CardTitle>
        <CardDescription>
          Start an audited platform support access session for this tenant. This does not silently
          impersonate a tenant user and does not enter the tenant workspace.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid gap-4 md:grid-cols-3">
          <KeyValue label="Tenant" value={tenant.business_name} />
          <KeyValue label="Current status" value={formatTenantStatus(tenant.status)} />
          <KeyValue label="Default mode" value="Read-only" />
        </div>

        {!canStartSupportAccess ? (
          <Alert>
            <p className="text-sm font-bold">Support access unavailable</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Your platform session can view tenant data, but it cannot start support access.
              Required permission: <strong>platform.support_access</strong>.
            </p>
          </Alert>
        ) : null}

        {visibleSupportAccessSession !== null ? (
          <Alert>
            <p className="text-sm font-bold">
              {visibleSupportAccessSession.ended_at === null
                ? 'Visible support access marker'
                : 'Support access session ended'}
            </p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {visibleSupportAccessMessage}
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <KeyValue label="Session ID" value={visibleSupportAccessSession.id} />
              <KeyValue
                label="Mode"
                value={formatSupportAccessMode(visibleSupportAccessSession.mode)}
              />
              <KeyValue label="Started" value={visibleSupportAccessSession.started_at} />
              <KeyValue label="Expires" value={visibleSupportAccessSession.expires_at} />
              <KeyValue label="Ended" value={visibleSupportAccessSession.ended_at ?? 'Active'} />
            </div>
          </Alert>
        ) : null}

        {submitState.status === 'error' ? (
          <Alert variant="destructive">
            <p className="text-sm font-bold">{submitState.message}</p>
            {submitState.detail === null ? null : (
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{submitState.detail}</p>
            )}
            {submitState.code === 'idempotency_conflict' ? (
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                The request was detected as a duplicate or retry conflict. Reload the tenant detail
                before submitting again.
              </p>
            ) : null}
          </Alert>
        ) : null}

        {isWriteAllowed ? (
          <Alert variant="destructive">
            <p className="text-sm font-bold">Write-allowed support access selected</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              This mode must be explicit and should be used only when support, investigation,
              compliance, or recovery work requires it. Backend authorization and audit logging
              remain authoritative.
            </p>
          </Alert>
        ) : null}

        {endSubmitState.status === 'success' ? (
          <Alert>
            <p className="text-sm font-bold">Support access ended</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{endSubmitState.message}</p>
          </Alert>
        ) : null}

        {endSubmitState.status === 'error' ? (
          <Alert variant="destructive">
            <p className="text-sm font-bold">{endSubmitState.message}</p>
            {endSubmitState.detail === null ? null : (
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {endSubmitState.detail}
              </p>
            )}
          </Alert>
        ) : null}

        {visibleSupportAccessSession !== null ? (
          <form className="grid gap-5" onSubmit={onEndSubmit}>
            <fieldset
              className="grid gap-5 disabled:pointer-events-none disabled:opacity-70"
              disabled={!canStartSupportAccess || !canEndVisibleSession || isEnding}
            >
              <section className="grid gap-4 rounded-2xl border border-border bg-muted/40 p-4">
                <div>
                  <h2 className="font-bold text-foreground">End current support access</h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    End the currently visible support access session when support, investigation,
                    compliance, or recovery work is complete. A reason is required for auditability.
                  </p>
                </div>

                {!canEndVisibleSession ? (
                  <Alert>
                    <p className="text-sm font-bold">Session is not active</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      This support access session has already ended or is no longer available from
                      this screen.
                    </p>
                  </Alert>
                ) : null}

                <label className="grid gap-2">
                  <span className="text-sm font-bold text-foreground">End reason</span>
                  <textarea
                    value={endForm.reason}
                    onChange={(event) => onEndChange('reason', event.currentTarget.value)}
                    required
                    maxLength={500}
                    rows={3}
                    className="min-h-24 rounded-xl border border-input bg-background px-3 py-2 text-base text-foreground shadow-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
                    placeholder="Example: Support investigation completed."
                  />
                  <FieldError message={endFieldErrors.reason} />
                </label>
              </section>
            </fieldset>

            <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
              <Button
                type="submit"
                variant="destructive"
                disabled={!canStartSupportAccess || !canEndVisibleSession || isEnding}
              >
                {isEnding ? 'Ending support access...' : 'End support access'}
              </Button>
            </div>
          </form>
        ) : null}

        <form className="grid gap-5" onSubmit={onSubmit}>
          <fieldset
            className="grid gap-5 disabled:pointer-events-none disabled:opacity-70"
            disabled={!canStartSupportAccess || isSubmitting}
          >
            <section className="grid gap-4 rounded-2xl border border-border bg-muted/40 p-4">
              <div>
                <h2 className="font-bold text-foreground">Support access fields</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Reason, mode, and expiration are required. Read-only is the default mode.
                </p>
              </div>

              <label className="grid gap-2">
                <span className="text-sm font-bold text-foreground">Mode</span>
                <select
                  value={form.mode}
                  onChange={(event) =>
                    onChange('mode', event.currentTarget.value as PlatformSupportAccessMode)
                  }
                  required
                  className="min-h-11 rounded-xl border border-input bg-background px-3 py-2 text-base text-foreground shadow-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="read_only">Read-only</option>
                  <option value="write_allowed">Write-allowed</option>
                </select>
                <FieldError message={fieldErrors.mode} />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-bold text-foreground">Reason</span>
                <textarea
                  value={form.reason}
                  onChange={(event) => onChange('reason', event.currentTarget.value)}
                  required
                  maxLength={500}
                  rows={4}
                  className="min-h-28 rounded-xl border border-input bg-background px-3 py-2 text-base text-foreground shadow-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
                  placeholder="Example: Investigate support ticket without tenant impersonation."
                />
                <FieldError message={fieldErrors.reason} />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-bold text-foreground">Expiration</span>
                <Input
                  type="datetime-local"
                  value={form.expires_at}
                  onChange={(event) => onChange('expires_at', event.currentTarget.value)}
                  required
                />
                <p className="text-sm leading-6 text-muted-foreground">
                  Required. The frontend sends this to the API as an ISO timestamp.
                </p>
                <FieldError message={fieldErrors.expires_at} />
              </label>
            </section>
          </fieldset>

          <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
            <Button
              type="submit"
              variant={isWriteAllowed ? 'destructive' : 'primary'}
              disabled={!canStartSupportAccess || isSubmitting}
            >
              {isSubmitting ? 'Starting support access...' : 'Start support access'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function PlatformTenantExportPanel({
  tenant,
  canQueueTenantExport,
  form,
  submitState,
  fieldErrors,
  onChange,
  onSubmit,
}: {
  readonly tenant: PlatformTenantDetail;
  readonly canQueueTenantExport: boolean;
  readonly form: PlatformTenantExportForm;
  readonly submitState: PlatformTenantExportSubmitState;
  readonly fieldErrors: Record<string, string>;
  readonly onChange: <K extends keyof PlatformTenantExportForm>(
    field: K,
    value: PlatformTenantExportForm[K],
  ) => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const isSubmitting = submitState.status === 'submitting';
  const isLifecycleBlocked = tenant.status === 'pending_deletion' || tenant.status === 'deleted';
  const isSubmitDisabled = !canQueueTenantExport || isSubmitting || isLifecycleBlocked;

  return (
    <Card id="tenant-export">
      <CardHeader>
        <CardTitle>Tenant export</CardTitle>
        <CardDescription>
          Queue an audited async tenant export job. This slice creates the background job; the
          export worker, ZIP package, signed download URL, and manifest validation remain separate
          slices.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid gap-4 md:grid-cols-3">
          <KeyValue label="Tenant" value={tenant.business_name} />
          <KeyValue label="Current status" value={formatTenantStatus(tenant.status)} />
          <KeyValue label="Required permission" value="platform.tenants.update" />
        </div>

        {!canQueueTenantExport ? (
          <Alert>
            <p className="text-sm font-bold">Tenant export unavailable</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Your platform session can view tenant data, but it cannot queue tenant exports.
              Required permission: <strong>platform.tenants.update</strong>.
            </p>
          </Alert>
        ) : null}

        {isLifecycleBlocked ? (
          <Alert variant="destructive">
            <p className="text-sm font-bold">Tenant export blocked by lifecycle state</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Export jobs are not queued for deleted tenants or tenants pending deletion in this
              slice. Emergency-extension behavior belongs to the later deletion/export lifecycle
              hardening slice.
            </p>
          </Alert>
        ) : null}

        {form.include_attachments ? (
          <Alert>
            <p className="text-sm font-bold">Attachment binaries requested</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              The queued job records this option for the future export worker. Actual attachment
              packaging remains blocked until the files/object-storage export slice is implemented.
            </p>
          </Alert>
        ) : null}

        {submitState.status === 'success' ? (
          <Alert>
            <p className="text-sm font-bold">Tenant export queued</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{submitState.message}</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <KeyValue label="Job ID" value={submitState.job.id} />
              <KeyValue label="Status" value={submitState.job.status} />
              <KeyValue label="Job type" value={submitState.job.job_type} />
              <KeyValue label="Run after" value={submitState.job.run_after} />
            </div>
          </Alert>
        ) : null}

        {submitState.status === 'error' ? (
          <Alert variant="destructive">
            <p className="text-sm font-bold">{submitState.message}</p>
            {submitState.detail === null ? null : (
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{submitState.detail}</p>
            )}
            {submitState.code === 'idempotency_conflict' ? (
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                The request was detected as a duplicate or retry conflict. Reload the tenant detail
                before submitting again.
              </p>
            ) : null}
          </Alert>
        ) : null}

        <form className="grid gap-5" onSubmit={onSubmit}>
          <fieldset
            className="grid gap-5 disabled:pointer-events-none disabled:opacity-70"
            disabled={isSubmitDisabled}
          >
            <section className="grid gap-4 rounded-2xl border border-border bg-muted/40 p-4">
              <div>
                <h2 className="font-bold text-foreground">Export request fields</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  A reason is required for auditability. The export job is queued asynchronously and
                  does not generate a download link in this slice.
                </p>
              </div>

              <label className="grid gap-2">
                <span className="text-sm font-bold text-foreground">Reason</span>
                <textarea
                  value={form.reason}
                  onChange={(event) => onChange('reason', event.currentTarget.value)}
                  required
                  maxLength={500}
                  rows={4}
                  className="min-h-28 rounded-xl border border-input bg-background px-3 py-2 text-base text-foreground shadow-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
                  placeholder="Example: Tenant requested a full data export for account review."
                />
                <FieldError message={fieldErrors.reason} />
              </label>

              <label className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
                <input
                  type="checkbox"
                  checked={form.include_attachments}
                  onChange={(event) => onChange('include_attachments', event.currentTarget.checked)}
                  className="mt-1 h-5 w-5 rounded border border-input"
                />
                <span>
                  <span className="block text-sm font-bold text-foreground">
                    Request attachment binaries
                  </span>
                  <span className="mt-1 block text-sm leading-6 text-muted-foreground">
                    Records the attachment-binary option for the future export worker. Metadata-only
                    export is used when this is unchecked.
                  </span>
                </span>
              </label>
              <FieldError message={fieldErrors.include_attachments} />
            </section>
          </fieldset>

          <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
            <Button type="submit" variant="primary" disabled={isSubmitDisabled}>
              {isSubmitting ? 'Queueing tenant export...' : 'Queue tenant export'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function PlatformTenantDeletionJobPanel({
  tenant,
  canQueueTenantDeletionJob,
  form,
  submitState,
  fieldErrors,
  onChange,
  onSubmit,
}: {
  readonly tenant: PlatformTenantDetail;
  readonly canQueueTenantDeletionJob: boolean;
  readonly form: PlatformTenantDeletionJobForm;
  readonly submitState: PlatformTenantDeletionJobSubmitState;
  readonly fieldErrors: Record<string, string>;
  readonly onChange: <K extends keyof PlatformTenantDeletionJobForm>(
    field: K,
    value: PlatformTenantDeletionJobForm[K],
  ) => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const isSubmitting = submitState.status === 'submitting';
  const isEligible =
    tenant.status === 'pending_deletion' &&
    tenant.deletion_scheduled_for !== null &&
    tenant.deletion_scheduled_for !== undefined;
  const expectedConfirmation = tenant.business_name;
  const confirmationValue = form.confirmation.trim();
  const hasConfirmation = confirmationValue === expectedConfirmation;
  const isFormDisabled = !canQueueTenantDeletionJob || isSubmitting || !isEligible;
  const isSubmitDisabled = isFormDisabled || !hasConfirmation;

  return (
    <Card id="tenant-deletion-job">
      <CardHeader>
        <CardTitle>Tenant deletion job</CardTitle>
        <CardDescription>
          Queue an audited tenant deletion job only after the tenant is in pending deletion and has
          a deletion scheduled date. Permanent deletion execution remains a worker-controlled
          lifecycle step.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid gap-4 md:grid-cols-3">
          <KeyValue label="Tenant" value={tenant.business_name} />
          <KeyValue label="Current status" value={formatTenantStatus(tenant.status)} />
          <KeyValue
            label="Deletion scheduled for"
            value={tenant.deletion_scheduled_for ?? 'Not scheduled'}
          />
        </div>

        {!canQueueTenantDeletionJob ? (
          <Alert>
            <p className="text-sm font-bold">Tenant deletion job unavailable</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Your platform session can view tenant data, but it cannot queue deletion jobs.
              Required permission: <strong>platform.tenants.update</strong>.
            </p>
          </Alert>
        ) : null}

        {!isEligible ? (
          <Alert variant="destructive">
            <p className="text-sm font-bold">Tenant deletion job blocked</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Deletion jobs can be queued only for tenants in <strong>pending_deletion</strong> with
              a populated <strong>deletion_scheduled_for</strong> timestamp. Active, grace-period,
              read-only, suspended, and deleted tenants are blocked.
            </p>
          </Alert>
        ) : null}

        {isEligible ? (
          <Alert variant="destructive">
            <p className="text-sm font-bold">Deletion job confirmation required</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Queueing a deletion job is a high-risk platform workflow. Type the tenant business
              name exactly before submitting: <strong>{expectedConfirmation}</strong>.
            </p>
          </Alert>
        ) : null}

        {submitState.status === 'success' ? (
          <Alert>
            <p className="text-sm font-bold">Tenant deletion job queued</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{submitState.message}</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <KeyValue label="Deletion job ID" value={submitState.job.id} />
              <KeyValue label="Status" value={submitState.job.status} />
              <KeyValue label="Scheduled for" value={submitState.job.scheduled_for} />
              <KeyValue label="Queued at" value={submitState.job.created_at} />
            </div>
          </Alert>
        ) : null}

        {submitState.status === 'error' ? (
          <Alert variant="destructive">
            <p className="text-sm font-bold">{submitState.message}</p>
            {submitState.detail === null ? null : (
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{submitState.detail}</p>
            )}
            {submitState.code === 'idempotency_conflict' ? (
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                The request was detected as a duplicate or retry conflict. Reload the tenant detail
                before submitting again.
              </p>
            ) : null}
          </Alert>
        ) : null}

        <form className="grid gap-5" onSubmit={onSubmit}>
          <fieldset
            className="grid gap-5 disabled:pointer-events-none disabled:opacity-70"
            disabled={isFormDisabled}
          >
            <section className="grid gap-4 rounded-2xl border border-border bg-muted/40 p-4">
              <div>
                <h2 className="font-bold text-foreground">Deletion queue fields</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  A reason is required for auditability. This does not execute permanent deletion
                  immediately.
                </p>
              </div>

              <label className="grid gap-2">
                <span className="text-sm font-bold text-foreground">Reason</span>
                <textarea
                  value={form.reason}
                  onChange={(event) => onChange('reason', event.currentTarget.value)}
                  required
                  maxLength={500}
                  rows={4}
                  className="min-h-28 rounded-xl border border-input bg-background px-3 py-2 text-base text-foreground shadow-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
                  placeholder="Example: Retention window completed and tenant is eligible for deletion."
                />
                <FieldError message={fieldErrors.reason} />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-bold text-foreground">
                  Confirm tenant business name
                </span>
                <Input
                  value={form.confirmation}
                  onChange={(event) => onChange('confirmation', event.currentTarget.value)}
                  required
                  placeholder={expectedConfirmation}
                />
                <p className="text-sm leading-6 text-muted-foreground">
                  Type <strong>{expectedConfirmation}</strong> exactly to enable deletion job
                  queueing.
                </p>
                {confirmationValue.length > 0 && !hasConfirmation ? (
                  <p className="text-sm font-semibold text-destructive">
                    Confirmation does not match the tenant business name.
                  </p>
                ) : null}
                <FieldError message={fieldErrors.confirmation} />
              </label>
            </section>
          </fieldset>

          <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
            <Button type="submit" variant="destructive" disabled={isSubmitDisabled}>
              {isSubmitting ? 'Queueing deletion job...' : 'Queue deletion job'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function PlannedWorkflowCard({
  title,
  requiredPermission,
  description,
  detail = null,
}: {
  readonly title: string;
  readonly requiredPermission: string;
  readonly description: string;
  readonly detail?: string | null;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <Badge variant="outline">Planned</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        <KeyValue label="Required permission" value={requiredPermission} />
        {detail === null ? null : (
          <Alert>
            <p className="text-sm leading-6 text-muted-foreground">{detail}</p>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

function FieldError({ message }: { readonly message: string | undefined }) {
  if (message === undefined || message.length === 0) {
    return null;
  }

  return <p className="text-sm font-semibold text-destructive">{message}</p>;
}

function ForbiddenState({
  title,
  requiredPermission,
  description,
  detail = null,
}: {
  readonly title: string;
  readonly requiredPermission: string;
  readonly description: string;
  readonly detail?: string | null;
}) {
  return (
    <Alert variant="destructive">
      <p className="text-sm font-bold">{title}</p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Required permission: <strong>{requiredPermission}</strong>
      </p>
      {detail === null ? null : (
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>
      )}
    </Alert>
  );
}

function SummaryCard({
  title,
  value,
  description,
}: {
  readonly title: string;
  readonly value: string;
  readonly description: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
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

function hasEffectivePermission(session: AuthSessionResponseData, permission: string): boolean {
  return session.effective_permissions.includes(permission);
}

function getApiErrorCode(error: unknown): string | null {
  return isApiClientError(error) ? error.code : null;
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

function formatTenantStatus(status: AuthTenantStatus | undefined): string {
  if (status === undefined) {
    return 'Unknown';
  }

  return status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatSupportAccessMode(mode: string): string {
  return mode
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
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

function formatTenantPlan(tenant: PlatformTenantDetail): string {
  return (
    tenant.subscription?.plan_name ??
    tenant.plan?.name ??
    tenant.subscription?.plan_code?.toUpperCase() ??
    tenant.plan?.code?.toUpperCase() ??
    'Plan not returned'
  );
}

function formatTenantLocation(
  tenant: Pick<PlatformTenantDetail, 'timezone' | 'country' | 'currency'>,
): string {
  const locationParts = [tenant.timezone, tenant.country, tenant.currency].filter(
    (part): part is string => part !== null && part !== undefined && part.length > 0,
  );

  return locationParts.length === 0 ? 'Timezone not returned' : locationParts.join(' · ');
}
