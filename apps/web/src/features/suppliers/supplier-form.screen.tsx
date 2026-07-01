'use client';

import { useEffect, useState } from 'react';

import { Alert, Skeleton } from '../../components/ui';
import { isApiClientError, type ApiClientError } from '../../lib/api-envelope';
import { getCurrentSession } from '../auth/queries/get-current-session.query';
import type { AuthSessionResponseData } from '../auth/types/auth-session';

import { SupplierForm } from './components/supplier-form';
import { createSupplier, getSupplier, updateSupplier } from './supplier.api';
import { defaultSupplierFormValues } from './supplier.defaults';
import type { SupplierDetail, SupplierFormValues, SupplierMutationInput } from './supplier.types';
import {
  canUseSupplierWriteActions,
  getSupplierWriteBlockReason,
  hasPermission,
  toSafeErrorDetail,
  toSafeErrorMessage,
  useNetworkStatus,
} from './supplier.ui';

interface SupplierFormScreenProps {
  readonly mode: 'create' | 'edit';
  readonly supplierId?: string;
}

export function SupplierFormScreen({ mode, supplierId }: SupplierFormScreenProps) {
  const targetSupplierId =
    mode === 'edit' && supplierId !== undefined && supplierId.length > 0 ? supplierId : null;

  const [sessionState, setSessionState] = useState<
    | { readonly status: 'loading' }
    | { readonly status: 'ready'; readonly session: AuthSessionResponseData }
    | { readonly status: 'error'; readonly message: string; readonly detail: string | null }
  >({ status: 'loading' });
  const [formState, setFormState] = useState<
    | { readonly status: 'idle' | 'loading'; readonly supplier: SupplierDetail | null }
    | { readonly status: 'ready'; readonly supplier: SupplierDetail | null }
    | { readonly status: 'error'; readonly message: string; readonly detail: string | null }
  >({ status: mode === 'edit' ? 'loading' : 'ready', supplier: null });
  const [values, setValues] = useState<SupplierFormValues>(defaultSupplierFormValues);
  const [apiError, setApiError] = useState<ApiClientError | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const networkStatus = useNetworkStatus();

  useEffect(() => {
    let active = true;

    async function loadSession() {
      setSessionState({ status: 'loading' });

      try {
        const session = await getCurrentSession();

        if (!active) {
          return;
        }

        setSessionState({ status: 'ready', session });
      } catch (error) {
        if (!active) {
          return;
        }

        setSessionState({
          status: 'error',
          message: toSafeErrorMessage(error, 'Unable to load your GarageOS session.'),
          detail: toSafeErrorDetail(error),
        });
      }
    }

    void loadSession();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (mode !== 'edit') {
      return;
    }

    const supplierIdToLoad = targetSupplierId;

    if (supplierIdToLoad === null) {
      setFormState({
        status: 'error',
        message: 'Supplier ID is required for edit mode.',
        detail: null,
      });
      return;
    }

    let active = true;

    async function loadSupplier(currentSupplierId: string) {
      setFormState({ status: 'loading', supplier: null });

      try {
        const supplier = await getSupplier(currentSupplierId);

        if (!active) {
          return;
        }

        setFormState({ status: 'ready', supplier });
        setValues({
          name: supplier.name,
          contact_person: supplier.contact_person ?? '',
          mobile_number: supplier.mobile_number ?? '',
          email: supplier.email ?? '',
          address: supplier.address ?? '',
          notes: supplier.notes ?? '',
        });
      } catch (error) {
        if (!active) {
          return;
        }

        setFormState({
          status: 'error',
          message: toSafeErrorMessage(error, 'Unable to load this supplier.'),
          detail: toSafeErrorDetail(error),
        });
      }
    }

    void loadSupplier(supplierIdToLoad);

    return () => {
      active = false;
    };
  }, [mode, targetSupplierId]);

  const session = sessionState.status === 'ready' ? sessionState.session : null;
  const requiredPermission = mode === 'create' ? 'suppliers.create' : 'suppliers.update';
  const hasRequiredPermission = hasPermission(session, requiredPermission);
  const writeActionsAllowed = canUseSupplierWriteActions({ session, networkStatus });
  const canSubmit = hasRequiredPermission && writeActionsAllowed;
  const blockReason = canSubmit
    ? null
    : getSupplierWriteBlockReason({ session, networkStatus, requiredPermission });

  async function handleSubmit() {
    setApiError(null);
    setClientError(null);
    setSuccessMessage(null);

    const validationError = validateSupplierForm(values);

    if (validationError !== null) {
      setClientError(validationError);
      return;
    }

    if (!canSubmit) {
      setClientError(blockReason ?? 'Supplier writes are currently blocked.');
      return;
    }

    const input = toSupplierMutationInput(values);

    setIsSubmitting(true);

    try {
      if (mode === 'create') {
        const supplier = await createSupplier(input);
        setFormState({ status: 'ready', supplier });
        setValues({
          name: supplier.name,
          contact_person: supplier.contact_person ?? '',
          mobile_number: supplier.mobile_number ?? '',
          email: supplier.email ?? '',
          address: supplier.address ?? '',
          notes: supplier.notes ?? '',
        });
        setSuccessMessage('Supplier created.');
      } else {
        const currentSupplier = formState.status === 'ready' ? formState.supplier : null;

        if (currentSupplier === null) {
          setClientError('Supplier data is still loading. Please try again.');
          return;
        }

        const supplier = await updateSupplier(currentSupplier.id, {
          ...input,
          lock_version: currentSupplier.lock_version,
        });
        setFormState({ status: 'ready', supplier });
        setValues({
          name: supplier.name,
          contact_person: supplier.contact_person ?? '',
          mobile_number: supplier.mobile_number ?? '',
          email: supplier.email ?? '',
          address: supplier.address ?? '',
          notes: supplier.notes ?? '',
        });
        setSuccessMessage('Supplier updated.');
      }
    } catch (error) {
      if (isApiClientError(error)) {
        setApiError(error);
      } else {
        setClientError(toSafeErrorMessage(error, 'Unable to save supplier.'));
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (sessionState.status === 'error') {
    return (
      <Alert variant="destructive">
        <p className="text-sm font-bold">{sessionState.message}</p>
        {sessionState.detail === null ? null : (
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{sessionState.detail}</p>
        )}
      </Alert>
    );
  }

  if (formState.status === 'loading' || sessionState.status === 'loading') {
    return (
      <div className="grid gap-4" aria-busy="true" aria-live="polite">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (formState.status === 'error') {
    return (
      <Alert variant="destructive">
        <p className="text-sm font-bold">{formState.message}</p>
        {formState.detail === null ? null : (
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{formState.detail}</p>
        )}
      </Alert>
    );
  }

  return (
    <SupplierForm
      mode={mode}
      values={values}
      disabled={!canSubmit}
      submitting={isSubmitting}
      apiError={apiError}
      clientError={clientError}
      successMessage={successMessage}
      supplierId={targetSupplierId ?? undefined}
      blockReason={blockReason}
      onChange={setValues}
      onSubmit={() => void handleSubmit()}
    />
  );
}

function validateSupplierForm(values: SupplierFormValues): string | null {
  if (values.name.trim().length === 0) {
    return 'Supplier name is required.';
  }

  if (values.email.trim().length > 0 && !values.email.includes('@')) {
    return 'Email must be a valid email address.';
  }

  return null;
}

function toSupplierMutationInput(values: SupplierFormValues): SupplierMutationInput {
  return {
    name: values.name.trim(),
    contact_person: toNullableString(values.contact_person),
    mobile_number: toNullableString(values.mobile_number),
    email: toNullableString(values.email),
    address: toNullableString(values.address),
    notes: toNullableString(values.notes),
  };
}

function toNullableString(value: string): string | null {
  const trimmedValue = value.trim();

  return trimmedValue.length > 0 ? trimmedValue : null;
}
