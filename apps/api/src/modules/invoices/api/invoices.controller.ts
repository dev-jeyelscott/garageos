import { Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from '@nestjs/common';

import { ZodValidationPipe } from '../../../shared/api/zod-validation.pipe';
import { IdempotencyService } from '../../../shared/idempotency/idempotency.service';
import { AccessTokenAuthGuard } from '../../auth/api/access-token-auth.guard';
import { AuthService } from '../../auth/application/auth.service';
import { InvoicesService } from '../application/invoices.service';
import {
  createDraftInvoiceRequestSchema,
  type CreateDraftInvoiceRequest,
  listInvoicesQuerySchema,
  type ListInvoicesQuery,
} from './invoice.schemas';

@UseGuards(AccessTokenAuthGuard)
@Controller('invoices')
export class InvoicesController {
  constructor(
    private readonly authService: AuthService,
    private readonly invoicesService: InvoicesService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  @Get()
  async listInvoices(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Query(new ZodValidationPipe(listInvoicesQuerySchema))
    query: ListInvoicesQuery,
  ): ReturnType<InvoicesService['listInvoices']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.invoicesService.listInvoices(query, session.tenantContextSession);
  }

  @Post()
  async createDraftInvoice(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(createDraftInvoiceRequestSchema))
    request: CreateDraftInvoiceRequest,
  ): ReturnType<InvoicesService['createDraftInvoice']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);
    const now = new Date();

    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: 'POST /api/v1/invoices',
      idempotencyKey,
      requestIntent: request,
      now,
      expiresAt: this.invoicesService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<InvoicesService['createDraftInvoice']>
      >;
    }

    try {
      const response = await this.invoicesService.createDraftInvoice(
        request,
        session.tenantContextSession,
      );

      await this.idempotencyService.completeSucceeded({
        id: idempotency.record.id,
        responseStatusCode: 201,
        responseBodyJson: response,
        now: new Date(),
      });

      return response;
    } catch (error) {
      await this.idempotencyService.completeFailed({
        id: idempotency.record.id,
        now: new Date(),
      });

      throw error;
    }
  }

  @Get(':invoice_id')
  async getInvoice(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('invoice_id') invoiceId: string,
  ): ReturnType<InvoicesService['getInvoice']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.invoicesService.getInvoice(invoiceId, session.tenantContextSession);
  }

  @Get(':invoice_id/status-events')
  async listStatusEvents(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('invoice_id') invoiceId: string,
  ): ReturnType<InvoicesService['listStatusEvents']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.invoicesService.listStatusEvents(invoiceId, session.tenantContextSession);
  }
}
