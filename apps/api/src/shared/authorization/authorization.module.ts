import { Module } from '@nestjs/common';

import {
  AUTHORIZATION_POLICY_EXPORTS,
  AUTHORIZATION_POLICY_PROVIDERS,
} from './authorization.providers';

@Module({
  providers: [...AUTHORIZATION_POLICY_PROVIDERS],
  exports: [...AUTHORIZATION_POLICY_EXPORTS],
})
export class AuthorizationModule {}
