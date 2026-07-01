'use client';

import { useEffect, useState } from 'react';

import { isApiClientError, type ApiClientError } from '../../lib/api-envelope';
import type { AuthSessionResponseData } from '../auth/types/auth-session';

export type NetworkStatus = 'online' | 'offline';

export function useNetworkStatus(): NetworkStatus {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
    }

    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline ? 'online' : 'offline';
}

export function hasPermission(
  session: AuthSessionResponseData | null,
  permission: string,
): boolean {
  return session?.effective_permissions.includes(permission) === true;
}

export function canViewPurchaseOrders(session: AuthSessionResponseData | null): boolean {
  return (
    session !== null &&
    session.access.can_access_operational_modules === true &&
    hasPermission(session, 'purchases.read')
  );
}

export function canUsePurchaseWriteActions({
  session,
  networkStatus,
}: {
  readonly session: AuthSessionResponseData | null;
  readonly networkStatus: NetworkStatus;
}): boolean {
  return (
    session !== null &&
    session.access.can_access_operational_modules === true &&
    session.access.read_only !== true &&
    networkStatus === 'online'
  );
}

export function toSafeErrorMessage(error: unknown, fallback: string): string {
  if (isApiClientError(error)) {
    return error.message;
  }

  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return fallback;
}

export function toSafeErrorDetail(error: unknown): string | null {
  if (!isApiClientError(error)) {
    return null;
  }

  const identifiers = [
    error.requestId === null ? null : `request ${error.requestId}`,
    error.correlationId === null ? null : `correlation ${error.correlationId}`,
  ].filter((value): value is string => value !== null);

  return identifiers.length > 0 ? `Reference: ${identifiers.join(' · ')}` : null;
}

export function getApiErrorCode(error: unknown): string | null {
  return isApiClientError(error) ? error.code : null;
}

export function getFieldErrorMap(error: ApiClientError | null): ReadonlyMap<string, string> {
  const errors = new Map<string, string>();

  if (error === null) {
    return errors;
  }

  for (const detail of error.details) {
    if (
      typeof detail.field === 'string' &&
      detail.field.length > 0 &&
      typeof detail.message === 'string' &&
      detail.message.length > 0
    ) {
      errors.set(detail.field, detail.message);
    }
  }

  return errors;
}
