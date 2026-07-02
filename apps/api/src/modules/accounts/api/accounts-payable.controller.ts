import { Controller, Get, Headers, Query, UseGuards } from '@nestjs/common';

import { ZodValidationPipe } from '../../../shared/api/zod-validation.pipe';
import { AccessTokenAuthGuard } from '../../auth/api/access-token-auth.guard';
import { AuthService } from '../../auth/application/auth.service';
import { AccountsPayableService } from '../application/accounts-payable.service';
import {
  accountsPayableListQuerySchema,
  type AccountsPayableListQuery,
  accountsPayableSummaryQuerySchema,
  type AccountsPayableSummaryQuery,
} from './accounts-payable.schemas';

@UseGuards(AccessTokenAuthGuard)
@Controller('accounts')
export class AccountsPayableController {
  constructor(
    private readonly authService: AuthService,
    private readonly accountsPayableService: AccountsPayableService,
  ) {}

  @Get('payable')
  async listPayables(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Query(new ZodValidationPipe(accountsPayableListQuerySchema)) query: AccountsPayableListQuery,
  ): ReturnType<AccountsPayableService['listPayables']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.accountsPayableService.listPayables(query, session.tenantContextSession);
  }

  @Get('payable/summary')
  async getPayableSummary(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Query(new ZodValidationPipe(accountsPayableSummaryQuerySchema))
    query: AccountsPayableSummaryQuery,
  ): ReturnType<AccountsPayableService['getPayableSummary']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.accountsPayableService.getPayableSummary(query, session.tenantContextSession);
  }
}
