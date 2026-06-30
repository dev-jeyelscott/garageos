import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { ZodValidationPipe } from '../../../shared/api/zod-validation.pipe';
import type { IdempotencyService } from '../../../shared/idempotency/idempotency.service';
import { AccessTokenAuthGuard } from '../../auth/api/access-token-auth.guard';
import type { AuthService } from '../../auth/application/auth.service';
import type { CustomersService } from '../application/customers.service';
import {
  createCustomerRequestSchema,
  type CreateCustomerRequest,
  listCustomersQuerySchema,
  type ListCustomersQuery,
  updateCustomerRequestSchema,
  type UpdateCustomerRequest,
} from './customer.schemas';

@UseGuards(AccessTokenAuthGuard)
@Controller('customers')
export class CustomersController {
  constructor(
    private readonly authService: AuthService,
    private readonly customersService: CustomersService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  @Get()
  async listCustomers(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Query(new ZodValidationPipe(listCustomersQuerySchema))
    query: ListCustomersQuery,
  ): ReturnType<CustomersService['listCustomers']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.customersService.listCustomers(query, session.tenantContextSession);
  }

  @Post()
  async createCustomer(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(createCustomerRequestSchema))
    request: CreateCustomerRequest,
  ): ReturnType<CustomersService['createCustomer']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);
    const now = new Date();

    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: 'POST /api/v1/customers',
      idempotencyKey,
      requestIntent: request,
      now,
      expiresAt: this.customersService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<CustomersService['createCustomer']>
      >;
    }

    try {
      const response = await this.customersService.createCustomer(
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

  @Get(':customer_id')
  async getCustomer(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('customer_id') customerId: string,
  ): ReturnType<CustomersService['getCustomer']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.customersService.getCustomer(customerId, session.tenantContextSession);
  }

  @Patch(':customer_id')
  async updateCustomer(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('customer_id') customerId: string,
    @Body(new ZodValidationPipe(updateCustomerRequestSchema))
    request: UpdateCustomerRequest,
  ): ReturnType<CustomersService['updateCustomer']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.customersService.updateCustomer(customerId, request, session.tenantContextSession);
  }
}
