import type { Provider } from '@nestjs/common';

import {
  API_DATABASE_CLIENT,
  type DatabaseQueryClient,
  type DatabaseQueryResult,
} from '../../../shared/database/database-client';

export const AUTH_DATABASE_CLIENT = Symbol('AUTH_DATABASE_CLIENT');

export type { DatabaseQueryClient, DatabaseQueryResult };

export const AUTH_DATABASE_CLIENT_PROVIDER: Provider = {
  provide: AUTH_DATABASE_CLIENT,
  useExisting: API_DATABASE_CLIENT,
};
