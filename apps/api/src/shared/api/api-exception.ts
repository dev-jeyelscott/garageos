import { HttpException, HttpStatus } from '@nestjs/common';
import { API_ERROR_CODES, type ApiErrorCode } from './api-error-code';
import type { ApiErrorDetail } from './api-error-detail';

interface GarageOsApiExceptionOptions {
  code: ApiErrorCode;
  message: string;
  status: HttpStatus;
  details?: ApiErrorDetail[];
}

export interface GarageOsApiErrorPayload {
  code: ApiErrorCode;
  message: string;
  details: ApiErrorDetail[];
}

export class GarageOsApiException extends HttpException {
  readonly code: ApiErrorCode;
  readonly details: ApiErrorDetail[];

  constructor(options: GarageOsApiExceptionOptions) {
    super(
      {
        code: options.code,
        message: options.message,
        details: options.details ?? [],
      },
      options.status,
    );

    this.code = options.code;
    this.details = options.details ?? [];
  }

  toErrorPayload(): GarageOsApiErrorPayload {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }

  static unauthenticated(message = 'Authentication is required.'): GarageOsApiException {
    return new GarageOsApiException({
      code: API_ERROR_CODES.UNAUTHENTICATED,
      message,
      status: HttpStatus.UNAUTHORIZED,
    });
  }

  static forbidden(
    requiredPermission?: string,
    message = 'You do not have permission to perform this action.',
  ): GarageOsApiException {
    return new GarageOsApiException({
      code: API_ERROR_CODES.FORBIDDEN,
      message,
      status: HttpStatus.FORBIDDEN,
      details: requiredPermission ? [{ required_permission: requiredPermission }] : [],
    });
  }

  static planLimitExceeded(message: string): GarageOsApiException {
    return new GarageOsApiException({
      code: API_ERROR_CODES.PLAN_LIMIT_EXCEEDED,
      message,
      status: HttpStatus.FORBIDDEN,
    });
  }

  static branchAccessDenied(): GarageOsApiException {
    return new GarageOsApiException({
      code: API_ERROR_CODES.BRANCH_ACCESS_DENIED,
      message: 'You do not have access to this branch.',
      status: HttpStatus.FORBIDDEN,
    });
  }

  static tenantAccessDenied(): GarageOsApiException {
    return new GarageOsApiException({
      code: API_ERROR_CODES.TENANT_ACCESS_DENIED,
      message: 'Tenant access is denied.',
      status: HttpStatus.FORBIDDEN,
    });
  }

  static subscriptionAccessBlocked(): GarageOsApiException {
    return new GarageOsApiException({
      code: API_ERROR_CODES.SUBSCRIPTION_ACCESS_BLOCKED,
      message: 'The tenant subscription status blocks this action.',
      status: HttpStatus.FORBIDDEN,
    });
  }

  static validationFailed(details: ApiErrorDetail[]): GarageOsApiException {
    return new GarageOsApiException({
      code: API_ERROR_CODES.VALIDATION_FAILED,
      message: 'One or more fields are invalid.',
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }

  static workflowTransitionBlocked(
    message = 'The requested workflow transition is not allowed.',
    details: ApiErrorDetail[] = [],
  ): GarageOsApiException {
    return new GarageOsApiException({
      code: API_ERROR_CODES.WORKFLOW_TRANSITION_BLOCKED,
      message,
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }

  static resourceNotFound(message = 'Resource not found.'): GarageOsApiException {
    return new GarageOsApiException({
      code: API_ERROR_CODES.RESOURCE_NOT_FOUND,
      message,
      status: HttpStatus.NOT_FOUND,
    });
  }

  static duplicateResource(message: string): GarageOsApiException {
    return new GarageOsApiException({
      code: API_ERROR_CODES.DUPLICATE_RESOURCE,
      message,
      status: HttpStatus.CONFLICT,
    });
  }

  static versionConflict(): GarageOsApiException {
    return new GarageOsApiException({
      code: API_ERROR_CODES.VERSION_CONFLICT,
      message: 'The request conflicts with the current resource version.',
      status: HttpStatus.CONFLICT,
    });
  }

  static idempotencyConflict(): GarageOsApiException {
    return new GarageOsApiException({
      code: API_ERROR_CODES.IDEMPOTENCY_CONFLICT,
      message: 'The idempotency key conflicts with a previous request.',
      status: HttpStatus.CONFLICT,
    });
  }

  static inventoryInsufficientAvailableStock(details: ApiErrorDetail[] = []): GarageOsApiException {
    return new GarageOsApiException({
      code: API_ERROR_CODES.INVENTORY_INSUFFICIENT_AVAILABLE_STOCK,
      message: 'Available stock is insufficient.',
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }

  static rateLimited(): GarageOsApiException {
    return new GarageOsApiException({
      code: API_ERROR_CODES.RATE_LIMITED,
      message: 'Rate limit exceeded.',
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
  }

  static serviceUnavailable(
    message = 'This service is temporarily unavailable.',
  ): GarageOsApiException {
    return new GarageOsApiException({
      code: API_ERROR_CODES.SERVICE_UNAVAILABLE,
      message,
      status: HttpStatus.SERVICE_UNAVAILABLE,
    });
  }
}
