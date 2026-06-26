import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import { GarageOsApiException } from '../../../shared/api/api-exception';
import type { AuthSessionResponseData } from '../contracts';
import type { GarageOsAuthenticatedRequest } from './access-token-auth.guard';

export const CurrentAuthSessionResponse = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthSessionResponseData => {
    const request = context.switchToHttp().getRequest<GarageOsAuthenticatedRequest>();

    if (request.garageOsAuthSessionResponse === undefined) {
      throw GarageOsApiException.unauthenticated('Authenticated session response is missing.');
    }

    return request.garageOsAuthSessionResponse;
  },
);
