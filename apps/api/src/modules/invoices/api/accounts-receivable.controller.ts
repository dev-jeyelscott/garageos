import { Controller, Get, Headers, Query, UseGuards } from '@nestjs/common';

import { ZodValidationPipe } from '../../../shared/api/zod-validation.pipe';
import { AccessTokenAuthGuard } from '../../auth/api/access-token-auth.guard';
import { AuthService } from '../../auth/application/auth.service';
import { AccountsReceivableService } from '../application/accounts-receivable.service';
import {
  listAccountsReceivableQuerySchema,
  type ListAccountsReceivableQuery,
  summarizeAccountsReceivableQuerySchema,
  type SummarizeAccountsReceivableQuery,
} from './accounts-receivable.schemas';

@UseGuards(AccessTokenAuthGuard)
@Controller('accounts/receivable')
export class AccountsReceivableController {
  constructor(
    private readonly authService: AuthService,
    private readonly accountsReceivableService: AccountsReceivableService,
  ) {}

  @Get()
  async listAccountsReceivable(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Query(new ZodValidationPipe(listAccountsReceivableQuerySchema))
    query: ListAccountsReceivableQuery,
  ): ReturnType<AccountsReceivableService['listAccountsReceivable']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.accountsReceivableService.listAccountsReceivable(
      query,
      session.tenantContextSession,
    );
  }

  @Get('summary')
  async summarizeAccountsReceivable(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Query(new ZodValidationPipe(summarizeAccountsReceivableQuerySchema))
    query: SummarizeAccountsReceivableQuery,
  ): ReturnType<AccountsReceivableService['summarizeAccountsReceivable']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.accountsReceivableService.summarizeAccountsReceivable(
      query,
      session.tenantContextSession,
    );
  }
}
