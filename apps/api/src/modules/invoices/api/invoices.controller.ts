import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { ZodValidationPipe } from '../../../shared/api/zod-validation.pipe';
import { IdempotencyService } from '../../../shared/idempotency/idempotency.service';
import type { TenantContextAuthenticatedSession } from '../../../shared/tenant-context/tenant-context';
import { AccessTokenAuthGuard } from '../../auth/api/access-token-auth.guard';
import { AuthService } from '../../auth/application/auth.service';
import { InvoicesService } from '../application/invoices.service';
import {
  cancelInvoiceRequestSchema,
  type CancelInvoiceRequest,
  createInvoicePaymentRequestSchema,
  type CreateInvoicePaymentRequest,
  createDraftInvoiceRequestSchema,
  type CreateDraftInvoiceRequest,
  issueInvoiceRequestSchema,
  type IssueInvoiceRequest,
  listInvoicesQuerySchema,
  type ListInvoicesQuery,
  voidInvoiceRequestSchema,
  type VoidInvoiceRequest,
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
    return this.runIdempotentWorkflow({
      authorizationHeader,
      idempotencyKey,
      endpoint: 'POST /api/v1/invoices',
      request,
      responseStatusCode: 201,
      handler: (session) => this.invoicesService.createDraftInvoice(request, session),
    });
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

  @Post(':invoice_id/issue')
  @HttpCode(200)
  async issueInvoice(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('invoice_id') invoiceId: string,
    @Body(new ZodValidationPipe(issueInvoiceRequestSchema))
    request: IssueInvoiceRequest,
  ): ReturnType<InvoicesService['issueInvoice']> {
    return this.runIdempotentWorkflow({
      authorizationHeader,
      idempotencyKey,
      endpoint: 'POST /api/v1/invoices/{invoice_id}/issue',
      request: { invoice_id: invoiceId, ...request },
      responseStatusCode: 200,
      handler: (session) => this.invoicesService.issueInvoice(invoiceId, request, session),
    });
  }

  @Post(':invoice_id/cancel')
  @HttpCode(200)
  async cancelInvoice(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('invoice_id') invoiceId: string,
    @Body(new ZodValidationPipe(cancelInvoiceRequestSchema))
    request: CancelInvoiceRequest,
  ): ReturnType<InvoicesService['cancelInvoice']> {
    return this.runIdempotentWorkflow({
      authorizationHeader,
      idempotencyKey,
      endpoint: 'POST /api/v1/invoices/{invoice_id}/cancel',
      request: { invoice_id: invoiceId, ...request },
      responseStatusCode: 200,
      handler: (session) => this.invoicesService.cancelInvoice(invoiceId, request, session),
    });
  }

  @Post(':invoice_id/void')
  @HttpCode(200)
  async voidInvoice(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('invoice_id') invoiceId: string,
    @Body(new ZodValidationPipe(voidInvoiceRequestSchema))
    request: VoidInvoiceRequest,
  ): ReturnType<InvoicesService['voidInvoice']> {
    return this.runIdempotentWorkflow({
      authorizationHeader,
      idempotencyKey,
      endpoint: 'POST /api/v1/invoices/{invoice_id}/void',
      request: { invoice_id: invoiceId, ...request },
      responseStatusCode: 200,
      handler: (session) => this.invoicesService.voidInvoice(invoiceId, request, session),
    });
  }

  @Post(':invoice_id/payments')
  async recordPayment(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('invoice_id') invoiceId: string,
    @Body(new ZodValidationPipe(createInvoicePaymentRequestSchema))
    request: CreateInvoicePaymentRequest,
  ): ReturnType<InvoicesService['recordPayment']> {
    return this.runIdempotentWorkflow({
      authorizationHeader,
      idempotencyKey,
      endpoint: 'POST /api/v1/invoices/{invoice_id}/payments',
      request: { invoice_id: invoiceId, ...request },
      responseStatusCode: 201,
      handler: (session) => this.invoicesService.recordPayment(invoiceId, request, session),
    });
  }

  private async runIdempotentWorkflow<Response>(input: {
    readonly authorizationHeader: string | undefined;
    readonly idempotencyKey: string | undefined;
    readonly endpoint: string;
    readonly request: unknown;
    readonly responseStatusCode: number;
    readonly handler: (session: TenantContextAuthenticatedSession) => Promise<Response>;
  }): Promise<Response> {
    const session = await this.authService.getAuthenticatedRouteSession(input.authorizationHeader);
    const now = new Date();

    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: input.endpoint,
      idempotencyKey: input.idempotencyKey,
      requestIntent: input.request,
      now,
      expiresAt: this.invoicesService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Response;
    }

    try {
      const response = await input.handler(session.tenantContextSession);

      await this.idempotencyService.completeSucceeded({
        id: idempotency.record.id,
        responseStatusCode: input.responseStatusCode,
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
}
