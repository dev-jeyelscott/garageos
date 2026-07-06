import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { ZodValidationPipe } from '../../../shared/api/zod-validation.pipe';
import { IdempotencyService } from '../../../shared/idempotency/idempotency.service';
import { AccessTokenAuthGuard } from '../../auth/api/access-token-auth.guard';
import { AuthService } from '../../auth/application/auth.service';
import { ExpenseCategoriesService } from '../application/expense-categories.service';
import {
  createExpenseCategoryRequestSchema,
  type CreateExpenseCategoryRequest,
  listExpenseCategoriesQuerySchema,
  type ListExpenseCategoriesQuery,
  expenseCategoryStatusChangeRequestSchema,
  type ExpenseCategoryStatusChangeRequest,
  updateExpenseCategoryRequestSchema,
  type UpdateExpenseCategoryRequest,
} from './expense-category.schemas';

@UseGuards(AccessTokenAuthGuard)
@Controller('expense-categories')
export class ExpenseCategoriesController {
  constructor(
    private readonly authService: AuthService,
    private readonly expenseCategoriesService: ExpenseCategoriesService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  @Get()
  async listExpenseCategories(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Query(new ZodValidationPipe(listExpenseCategoriesQuerySchema))
    query: ListExpenseCategoriesQuery,
  ): ReturnType<ExpenseCategoriesService['listExpenseCategories']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.expenseCategoriesService.listExpenseCategories(query, session.tenantContextSession);
  }

  @Post()
  async createExpenseCategory(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(createExpenseCategoryRequestSchema))
    request: CreateExpenseCategoryRequest,
  ): ReturnType<ExpenseCategoriesService['createExpenseCategory']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);
    const now = new Date();

    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: 'POST /api/v1/expense-categories',
      idempotencyKey,
      requestIntent: request,
      now,
      expiresAt: this.expenseCategoriesService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<ExpenseCategoriesService['createExpenseCategory']>
      >;
    }

    try {
      const response = await this.expenseCategoriesService.createExpenseCategory(
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

  @Get(':category_id')
  async getExpenseCategory(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('category_id') categoryId: string,
  ): ReturnType<ExpenseCategoriesService['getExpenseCategory']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.expenseCategoriesService.getExpenseCategory(
      categoryId,
      session.tenantContextSession,
    );
  }

  @Patch(':category_id')
  async updateExpenseCategory(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('category_id') categoryId: string,
    @Body(new ZodValidationPipe(updateExpenseCategoryRequestSchema))
    request: UpdateExpenseCategoryRequest,
  ): ReturnType<ExpenseCategoriesService['updateExpenseCategory']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.expenseCategoriesService.updateExpenseCategory(
      categoryId,
      request,
      session.tenantContextSession,
    );
  }

  @Post(':category_id/deactivate')
  @HttpCode(200)
  async deactivateExpenseCategory(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('category_id') categoryId: string,
    @Body(new ZodValidationPipe(expenseCategoryStatusChangeRequestSchema))
    request: ExpenseCategoryStatusChangeRequest,
  ): ReturnType<ExpenseCategoriesService['deactivateExpenseCategory']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);
    const now = new Date();
    const requestIntent = {
      category_id: categoryId,
      ...request,
    };

    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: 'POST /api/v1/expense-categories/{category_id}/deactivate',
      idempotencyKey,
      requestIntent,
      now,
      expiresAt: this.expenseCategoriesService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<ExpenseCategoriesService['deactivateExpenseCategory']>
      >;
    }

    try {
      const response = await this.expenseCategoriesService.deactivateExpenseCategory(
        categoryId,
        request,
        session.tenantContextSession,
      );

      await this.idempotencyService.completeSucceeded({
        id: idempotency.record.id,
        responseStatusCode: 200,
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

  @Post(':category_id/reactivate')
  @HttpCode(200)
  async reactivateExpenseCategory(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('category_id') categoryId: string,
    @Body(new ZodValidationPipe(expenseCategoryStatusChangeRequestSchema))
    request: ExpenseCategoryStatusChangeRequest,
  ): ReturnType<ExpenseCategoriesService['reactivateExpenseCategory']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);
    const now = new Date();
    const requestIntent = {
      category_id: categoryId,
      ...request,
    };

    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: 'POST /api/v1/expense-categories/{category_id}/reactivate',
      idempotencyKey,
      requestIntent,
      now,
      expiresAt: this.expenseCategoriesService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<ExpenseCategoriesService['reactivateExpenseCategory']>
      >;
    }

    try {
      const response = await this.expenseCategoriesService.reactivateExpenseCategory(
        categoryId,
        request,
        session.tenantContextSession,
      );

      await this.idempotencyService.completeSucceeded({
        id: idempotency.record.id,
        responseStatusCode: 200,
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
