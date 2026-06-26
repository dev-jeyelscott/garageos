import { GarageOsApiException } from '../api/api-exception';
import type {
  ResolvedTenantContext,
  TenantContextAuthenticatedSession,
} from '../tenant-context/tenant-context';
import type { BranchAccessRouteSource } from './route-access.decorators';

type HeaderValue = string | readonly string[] | undefined;
type StringValueMap = Record<string, string | undefined>;

export interface GarageOsRouteAccessRequest {
  readonly headers?: Record<string, HeaderValue>;
  readonly params?: StringValueMap;
  readonly query?: Record<string, HeaderValue>;
  readonly body?: unknown;
  garageOsAuthenticatedSession?: TenantContextAuthenticatedSession;
  garageOsTenantContext?: ResolvedTenantContext;
}

export function getAuthorizationHeaderFromRequest(
  request: GarageOsRouteAccessRequest,
): string | null {
  return normalizeHeaderValue(request.headers?.authorization ?? request.headers?.Authorization);
}

export function setAuthenticatedSessionOnRequest(
  request: GarageOsRouteAccessRequest,
  session: TenantContextAuthenticatedSession,
): void {
  request.garageOsAuthenticatedSession = session;
}

export function getRequiredAuthenticatedSessionFromRequest(
  request: GarageOsRouteAccessRequest,
): TenantContextAuthenticatedSession {
  if (request.garageOsAuthenticatedSession === undefined) {
    throw GarageOsApiException.unauthenticated('Authenticated session context is missing.');
  }

  return request.garageOsAuthenticatedSession;
}

export function setTenantContextOnRequest(
  request: GarageOsRouteAccessRequest,
  context: ResolvedTenantContext,
): void {
  request.garageOsTenantContext = context;
}

export function getRequiredTenantContextFromRequest(
  request: GarageOsRouteAccessRequest,
): ResolvedTenantContext {
  if (request.garageOsTenantContext === undefined) {
    throw GarageOsApiException.unauthenticated(
      'Tenant context is missing from authenticated request.',
    );
  }

  return request.garageOsTenantContext;
}

export function getRouteValueFromRequest(
  request: GarageOsRouteAccessRequest,
  source: BranchAccessRouteSource,
  key: string,
): string | null {
  switch (source) {
    case 'param':
      return normalizeTextValue(request.params?.[key]);
    case 'query':
      return normalizeHeaderValue(request.query?.[key]);
    case 'body':
      return normalizeTextValue(getRecordValue(request.body, key));
  }
}

function normalizeHeaderValue(value: HeaderValue): string | null {
  const normalizedValue = Array.isArray(value) ? value[0] : value;

  return normalizeTextValue(normalizedValue);
}

function normalizeTextValue(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalizedValue = value.trim();

  return normalizedValue.length > 0 ? normalizedValue : null;
}

function getRecordValue(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }

  return (value as Record<string, unknown>)[key];
}
