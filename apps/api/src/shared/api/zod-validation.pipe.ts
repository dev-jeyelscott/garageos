import { type PipeTransform } from '@nestjs/common';
import { ZodError, type ZodIssue, type ZodTypeAny, z } from 'zod';

import { GarageOsApiException } from './api-exception.js';
import type { ApiErrorDetail } from './api-error-detail.js';

function toDotPath(path: ZodIssue['path']): string | undefined {
  if (path.length === 0) {
    return undefined;
  }

  return path.map(String).join('.');
}

function toValidationDetail(issue: ZodIssue): ApiErrorDetail {
  const detail: ApiErrorDetail = {
    code: issue.code,
    message: issue.message,
  };

  const field = toDotPath(issue.path);

  if (field !== undefined) {
    detail.field = field;
  }

  return detail;
}

export class ZodValidationPipe<TSchema extends ZodTypeAny> implements PipeTransform<
  unknown,
  z.infer<TSchema>
> {
  constructor(private readonly schema: TSchema) {}

  transform(value: unknown): z.infer<TSchema> {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      throw GarageOsApiException.validationFailed(result.error.issues.map(toValidationDetail));
    }

    return result.data;
  }
}

export function toApiValidationDetails(error: ZodError): ApiErrorDetail[] {
  return error.issues.map(toValidationDetail);
}
