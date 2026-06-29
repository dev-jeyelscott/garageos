import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

import { API_ERROR_CODES, type ApiErrorCode } from './api-error-code';
import { GarageOsApiException } from './api-exception';
import type { ApiErrorDetail } from './api-error-detail';
import {
  createCorrelationId,
  createRequestId,
  type GarageOsHttpRequest,
} from '../observability/request-context.middleware';

interface ErrorResponseBody {
  error: {
    code: ApiErrorCode;
    message: string;
    details: ApiErrorDetail[];
    request_id: string;
    correlation_id: string;
  };
}

interface HttpResponseLike {
  status(code: number): {
    json(body: ErrorResponseBody): void;
  };
}

interface GarageOsErrorRequest extends GarageOsHttpRequest {
  readonly method?: string;
  readonly originalUrl?: string;
  readonly url?: string;
}

function defaultErrorCodeForStatus(status: number): ApiErrorCode {
  switch (status) {
    case HttpStatus.UNAUTHORIZED:
      return API_ERROR_CODES.UNAUTHENTICATED;
    case HttpStatus.FORBIDDEN:
      return API_ERROR_CODES.FORBIDDEN;
    case HttpStatus.NOT_FOUND:
      return API_ERROR_CODES.RESOURCE_NOT_FOUND;
    case HttpStatus.CONFLICT:
      return API_ERROR_CODES.VERSION_CONFLICT;
    case HttpStatus.UNPROCESSABLE_ENTITY:
      return API_ERROR_CODES.VALIDATION_FAILED;
    case HttpStatus.TOO_MANY_REQUESTS:
      return API_ERROR_CODES.RATE_LIMITED;
    case HttpStatus.SERVICE_UNAVAILABLE:
      return API_ERROR_CODES.SERVICE_UNAVAILABLE;
    default:
      return status >= 500 ? API_ERROR_CODES.INTERNAL_SERVER_ERROR : API_ERROR_CODES.BAD_REQUEST;
  }
}

function defaultMessageForStatus(status: number): string {
  switch (status) {
    case HttpStatus.UNAUTHORIZED:
      return 'Authentication is required.';
    case HttpStatus.FORBIDDEN:
      return 'You do not have permission to perform this action.';
    case HttpStatus.NOT_FOUND:
      return 'Resource not found.';
    case HttpStatus.CONFLICT:
      return 'The request conflicts with the current resource state.';
    case HttpStatus.UNPROCESSABLE_ENTITY:
      return 'One or more fields are invalid.';
    case HttpStatus.TOO_MANY_REQUESTS:
      return 'Rate limit exceeded.';
    case HttpStatus.SERVICE_UNAVAILABLE:
      return 'The service is temporarily unavailable.';
    default:
      return status >= 500
        ? 'An unexpected error occurred.'
        : 'The request could not be processed.';
  }
}

function extractMessage(exception: HttpException, status: number): string {
  const response = exception.getResponse();

  if (typeof response === 'string') {
    return response;
  }

  if (typeof response === 'object' && response !== null && 'message' in response) {
    const message = response.message;

    if (typeof message === 'string') {
      return message;
    }

    if (Array.isArray(message) && typeof message[0] === 'string') {
      return message[0];
    }
  }

  return defaultMessageForStatus(status);
}

function extractErrorPayload(
  exception: unknown,
  status: number,
): {
  code: ApiErrorCode;
  message: string;
  details: ApiErrorDetail[];
} {
  if (exception instanceof GarageOsApiException) {
    return exception.toErrorPayload();
  }

  if (status === HttpStatus.NOT_FOUND) {
    return {
      code: API_ERROR_CODES.RESOURCE_NOT_FOUND,
      message: defaultMessageForStatus(status),
      details: [],
    };
  }

  if (exception instanceof HttpException) {
    return {
      code: defaultErrorCodeForStatus(status),
      message: extractMessage(exception, status),
      details: [],
    };
  }

  return {
    code: defaultErrorCodeForStatus(status),
    message: defaultMessageForStatus(status),
    details: [],
  };
}

@Catch()
export class ErrorEnvelopeFilter implements ExceptionFilter {
  private readonly logger = new Logger(ErrorEnvelopeFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();

    const request = http.getRequest<GarageOsErrorRequest>();
    const response = http.getResponse<HttpResponseLike>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const error = extractErrorPayload(exception, status);

    const requestId = request.request_id ?? createRequestId();
    const correlationId = request.correlation_id ?? createCorrelationId();

    this.logUnexpectedException({
      exception,
      request,
      status,
      errorCode: error.code,
      requestId,
      correlationId,
    });

    response.status(status).json({
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
        request_id: requestId,
        correlation_id: correlationId,
      },
    });
  }

  private logUnexpectedException(input: {
    readonly exception: unknown;
    readonly request: GarageOsErrorRequest;
    readonly status: number;
    readonly errorCode: ApiErrorCode;
    readonly requestId: string;
    readonly correlationId: string;
  }): void {
    if (input.exception instanceof GarageOsApiException) {
      return;
    }

    if (input.exception instanceof HttpException && input.status < 500) {
      return;
    }

    const method = input.request.method ?? 'UNKNOWN';
    const url = input.request.originalUrl ?? input.request.url ?? 'UNKNOWN_URL';

    const message = [
      `Unhandled API exception ${method} ${url}`,
      `status=${input.status}`,
      `code=${input.errorCode}`,
      `request_id=${input.requestId}`,
      `correlation_id=${input.correlationId}`,
    ].join(' ');

    if (input.exception instanceof Error) {
      this.logger.error(message, input.exception.stack);
      return;
    }

    this.logger.error(`${message} exception=${String(input.exception)}`);
  }
}
