import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Logger,
  Param,
  Post,
  Query,
  Res,
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
  createInvoiceRefundRequestSchema,
  type CreateInvoiceRefundRequest,
  createDraftInvoiceRequestSchema,
  type CreateDraftInvoiceRequest,
  issueInvoiceRequestSchema,
  type IssueInvoiceRequest,
  listInvoicesQuerySchema,
  type ListInvoicesQuery,
  listReceiptsQuerySchema,
  type ListReceiptsQuery,
  voidInvoiceRequestSchema,
  type VoidInvoiceRequest,
} from './invoice.schemas';

interface PassthroughHttpResponse {
  status(statusCode: number): unknown;
}

const invoiceIdempotencyLogger = new Logger('InvoiceIdempotencyWorkflow');

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
    @Res({ passthrough: true }) httpResponse: PassthroughHttpResponse,
  ): ReturnType<InvoicesService['createDraftInvoice']> {
    return runInvoiceIdempotentWorkflow({
      authService: this.authService,
      invoicesService: this.invoicesService,
      idempotencyService: this.idempotencyService,
      authorizationHeader,
      idempotencyKey,
      endpoint: 'POST /api/v1/invoices',
      request,
      responseStatusCode: 201,
      httpResponse,
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
    @Res({ passthrough: true }) httpResponse: PassthroughHttpResponse,
  ): ReturnType<InvoicesService['issueInvoice']> {
    return runInvoiceIdempotentWorkflow({
      authService: this.authService,
      invoicesService: this.invoicesService,
      idempotencyService: this.idempotencyService,
      authorizationHeader,
      idempotencyKey,
      endpoint: 'POST /api/v1/invoices/{invoice_id}/issue',
      request: { invoice_id: invoiceId, ...request },
      responseStatusCode: 200,
      httpResponse,
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
    @Res({ passthrough: true }) httpResponse: PassthroughHttpResponse,
  ): ReturnType<InvoicesService['cancelInvoice']> {
    return runInvoiceIdempotentWorkflow({
      authService: this.authService,
      invoicesService: this.invoicesService,
      idempotencyService: this.idempotencyService,
      authorizationHeader,
      idempotencyKey,
      endpoint: 'POST /api/v1/invoices/{invoice_id}/cancel',
      request: { invoice_id: invoiceId, ...request },
      responseStatusCode: 200,
      httpResponse,
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
    @Res({ passthrough: true }) httpResponse: PassthroughHttpResponse,
  ): ReturnType<InvoicesService['voidInvoice']> {
    return runInvoiceIdempotentWorkflow({
      authService: this.authService,
      invoicesService: this.invoicesService,
      idempotencyService: this.idempotencyService,
      authorizationHeader,
      idempotencyKey,
      endpoint: 'POST /api/v1/invoices/{invoice_id}/void',
      request: { invoice_id: invoiceId, ...request },
      responseStatusCode: 200,
      httpResponse,
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
    @Res({ passthrough: true }) httpResponse: PassthroughHttpResponse,
  ): ReturnType<InvoicesService['recordPayment']> {
    return runInvoiceIdempotentWorkflow({
      authService: this.authService,
      invoicesService: this.invoicesService,
      idempotencyService: this.idempotencyService,
      authorizationHeader,
      idempotencyKey,
      endpoint: 'POST /api/v1/invoices/{invoice_id}/payments',
      request: { invoice_id: invoiceId, ...request },
      responseStatusCode: 201,
      httpResponse,
      handler: (session) => this.invoicesService.recordPayment(invoiceId, request, session),
    });
  }
}

@UseGuards(AccessTokenAuthGuard)
@Controller('receipts')
export class ReceiptsController {
  constructor(
    private readonly authService: AuthService,
    private readonly invoicesService: InvoicesService,
  ) {}

  @Get()
  async listReceipts(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Query(new ZodValidationPipe(listReceiptsQuerySchema))
    query: ListReceiptsQuery,
  ): ReturnType<InvoicesService['listReceipts']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.invoicesService.listReceipts(query, session.tenantContextSession);
  }

  @Get(':receipt_id')
  async getReceipt(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('receipt_id') receiptId: string,
  ): ReturnType<InvoicesService['getReceipt']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.invoicesService.getReceipt(receiptId, session.tenantContextSession);
  }

  @Get(':receipt_id/print')
  async getReceiptPrintMetadata(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('receipt_id') receiptId: string,
  ): ReturnType<InvoicesService['getReceiptPrintMetadata']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.invoicesService.getReceiptPrintMetadata(receiptId, session.tenantContextSession);
  }
}

@UseGuards(AccessTokenAuthGuard)
@Controller('payments/:payment_id/refunds')
export class PaymentsRefundsController {
  constructor(
    private readonly authService: AuthService,
    private readonly invoicesService: InvoicesService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  @Post()
  async recordRefund(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('payment_id') paymentId: string,
    @Body(new ZodValidationPipe(createInvoiceRefundRequestSchema))
    request: CreateInvoiceRefundRequest,
    @Res({ passthrough: true }) httpResponse: PassthroughHttpResponse,
  ): ReturnType<InvoicesService['recordRefund']> {
    return runInvoiceIdempotentWorkflow({
      authService: this.authService,
      invoicesService: this.invoicesService,
      idempotencyService: this.idempotencyService,
      authorizationHeader,
      idempotencyKey,
      endpoint: 'POST /api/v1/payments/{payment_id}/refunds',
      request: { payment_id: paymentId, ...request },
      responseStatusCode: 201,
      httpResponse,
      handler: (session) => this.invoicesService.recordRefund(paymentId, request, session),
    });
  }
}

async function runInvoiceIdempotentWorkflow<WorkflowResponse>(input: {
  readonly authService: AuthService;
  readonly invoicesService: InvoicesService;
  readonly idempotencyService: IdempotencyService;
  readonly authorizationHeader: string | undefined;
  readonly idempotencyKey: string | undefined;
  readonly endpoint: string;
  readonly request: unknown;
  readonly responseStatusCode: number;
  readonly httpResponse: PassthroughHttpResponse;
  readonly handler: (session: TenantContextAuthenticatedSession) => Promise<WorkflowResponse>;
}): Promise<WorkflowResponse> {
  const session = await input.authService.getAuthenticatedRouteSession(input.authorizationHeader);
  const now = new Date();

  const idempotency = await input.idempotencyService.begin({
    tenantId: session.tenantContextSession.actor.tenant_id,
    userId: session.tenantContextSession.actor.user_id,
    endpoint: input.endpoint,
    idempotencyKey: input.idempotencyKey,
    requestIntent: input.request,
    now,
    expiresAt: input.invoicesService.getIdempotencyExpiresAt(now),
  });

  if (idempotency.type === 'replayed') {
    input.httpResponse.status(idempotency.responseStatusCode);

    return idempotency.responseBodyJson as WorkflowResponse;
  }

  try {
    const response = await input.handler(session.tenantContextSession);

    await input.idempotencyService.completeSucceeded({
      id: idempotency.record.id,
      responseStatusCode: input.responseStatusCode,
      responseBodyJson: response,
      now: new Date(),
    });

    input.httpResponse.status(input.responseStatusCode);

    return response;
  } catch (error) {
    await markInvoiceIdempotencyFailed(input.idempotencyService, idempotency.record.id);

    throw error;
  }
}

async function markInvoiceIdempotencyFailed(
  idempotencyService: IdempotencyService,
  idempotencyRecordId: string,
): Promise<void> {
  try {
    await idempotencyService.completeFailed({
      id: idempotencyRecordId,
      now: new Date(),
    });
  } catch (cleanupError) {
    const errorMessage =
      cleanupError instanceof Error ? cleanupError.message : 'Unknown idempotency cleanup failure';

    invoiceIdempotencyLogger.warn(
      {
        message: 'Failed to mark invoice idempotency record as failed.',
        action: 'invoice_idempotency_cleanup_failed',
        idempotency_record_id: idempotencyRecordId,
        error: errorMessage,
      },
      cleanupError instanceof Error ? cleanupError.stack : undefined,
    );
  }
}
