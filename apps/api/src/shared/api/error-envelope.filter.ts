import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import {
  createCorrelationId,
  createRequestId,
  type GarageOsHttpRequest,
} from '../observability/request-context.middleware';

interface ErrorDetail {
  field?: string;
  code?: string;
  message?: string;
  required_permission?: string;
}

interface ErrorResponseBody {
  error: {
    code: string;
    message: string;
    details: ErrorDetail[];
    request_id: string;
    correlation_id: string;
  };
}

interface HttpResponseLike {
  status(code: number): {
    json(body: ErrorResponseBody): void;
  };
}

function defaultErrorCodeForStatus(status: number): string {
  switch (status) {
    case HttpStatus.UNAUTHORIZED:
      return 'unauthenticated';
    case HttpStatus.FORBIDDEN:
      return 'forbidden';
    case HttpStatus.NOT_FOUND:
      return 'resource_not_found';
    case HttpStatus.CONFLICT:
      return 'version_conflict';
    case HttpStatus.UNPROCESSABLE_ENTITY:
      return 'validation_failed';
    case HttpStatus.TOO_MANY_REQUESTS:
      return 'rate_limited';
    default:
      return status >= 500 ? 'internal_server_error' : 'bad_request';
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

@Catch()
export class ErrorEnvelopeFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();

    const request = http.getRequest<GarageOsHttpRequest>();
    const response = http.getResponse<HttpResponseLike>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      status === HttpStatus.NOT_FOUND
        ? defaultMessageForStatus(status)
        : exception instanceof HttpException
          ? extractMessage(exception, status)
          : defaultMessageForStatus(status);

    const requestId = request.request_id ?? createRequestId();
    const correlationId = request.correlation_id ?? createCorrelationId();

    response.status(status).json({
      error: {
        code: defaultErrorCodeForStatus(status),
        message,
        details: [],
        request_id: requestId,
        correlation_id: correlationId,
      },
    });
  }
}
