export interface ApiMeta {
  readonly request_id: string;
  readonly correlation_id: string;
}

export interface ApiSuccessResponse<TData> {
  readonly data: TData;
  readonly meta: ApiMeta;
}

export interface ApiErrorDetail {
  readonly field?: string;
  readonly code?: string;
  readonly message?: string;
  readonly [key: string]: unknown;
}

export interface ApiErrorResponse {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details?: readonly ApiErrorDetail[];
    readonly request_id: string;
    readonly correlation_id: string;
  };
}

export interface ApiClientError {
  readonly code: string;
  readonly message: string;
  readonly status: number;
  readonly details: readonly ApiErrorDetail[];
  readonly requestId: string | null;
  readonly correlationId: string | null;
}

export async function readApiResponse<TData>(response: Response): Promise<TData> {
  const body = await readJsonBody(response);

  if (!response.ok) {
    throw toApiClientError(body, response.status);
  }

  if (isApiSuccessResponse<TData>(body)) {
    return body.data;
  }

  throw {
    code: 'invalid_api_response',
    message: 'The API returned an unexpected response shape.',
    status: response.status,
    details: [],
    requestId: null,
    correlationId: null,
  } satisfies ApiClientError;
}

export function isApiClientError(error: unknown): error is ApiClientError {
  return (
    isRecord(error) &&
    typeof error.code === 'string' &&
    typeof error.message === 'string' &&
    typeof error.status === 'number' &&
    Array.isArray(error.details)
  );
}

async function readJsonBody(response: Response): Promise<unknown> {
  const text = await response.text();

  if (text.trim().length === 0) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function toApiClientError(body: unknown, status: number): ApiClientError {
  if (isApiErrorResponse(body)) {
    return {
      code: body.error.code,
      message: body.error.message,
      status,
      details: body.error.details ?? [],
      requestId: body.error.request_id,
      correlationId: body.error.correlation_id,
    };
  }

  return {
    code: 'request_failed',
    message: 'The request failed before GarageOS could return a standard error envelope.',
    status,
    details: [],
    requestId: null,
    correlationId: null,
  };
}

function isApiSuccessResponse<TData>(value: unknown): value is ApiSuccessResponse<TData> {
  return isRecord(value) && 'data' in value && isRecord(value.meta);
}

function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  if (!isRecord(value) || !isRecord(value.error)) {
    return false;
  }

  return (
    typeof value.error.code === 'string' &&
    typeof value.error.message === 'string' &&
    typeof value.error.request_id === 'string' &&
    typeof value.error.correlation_id === 'string'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
