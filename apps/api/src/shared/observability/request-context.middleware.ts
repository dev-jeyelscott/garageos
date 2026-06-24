import { randomUUID } from 'node:crypto';
import { Injectable, type NestMiddleware } from '@nestjs/common';

export interface GarageOsHttpRequest {
  headers: Record<string, string | string[] | undefined>;
  request_id?: string;
  correlation_id?: string;
}

export interface GarageOsHttpResponse {
  setHeader(name: string, value: string): void;
}

type NextFunction = () => void;

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

export function createRequestId(): string {
  return `req_${randomUUID()}`;
}

export function createCorrelationId(): string {
  return `corr_${randomUUID()}`;
}

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(request: GarageOsHttpRequest, response: GarageOsHttpResponse, next: NextFunction): void {
    const requestId = createRequestId();

    const incomingCorrelationId = firstHeaderValue(request.headers['x-correlation-id']);

    const correlationId =
      incomingCorrelationId && incomingCorrelationId.trim().length > 0
        ? incomingCorrelationId
        : createCorrelationId();

    request.request_id = requestId;
    request.correlation_id = correlationId;

    response.setHeader('X-Request-ID', requestId);
    response.setHeader('X-Correlation-ID', correlationId);

    next();
  }
}
