import { Controller, Get, Headers, Query, UseGuards } from '@nestjs/common';

import { ZodValidationPipe } from '../../../shared/api/zod-validation.pipe';
import { AccessTokenAuthGuard } from '../../auth/api/access-token-auth.guard';
import { AuthService } from '../../auth/application/auth.service';
import { FinancialReportsService } from '../application/financial-reports.service';
import { financialReportQuerySchema, type FinancialReportQuery } from './financial-report.schemas';

@UseGuards(AccessTokenAuthGuard)
@Controller('reports')
export class FinancialReportsController {
  constructor(
    private readonly authService: AuthService,
    private readonly financialReportsService: FinancialReportsService,
  ) {}

  @Get('financial')
  async getFinancialReport(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Query(new ZodValidationPipe(financialReportQuerySchema)) query: FinancialReportQuery,
  ): ReturnType<FinancialReportsService['getFinancialReport']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.financialReportsService.getFinancialReport(query, session.tenantContextSession);
  }
}
