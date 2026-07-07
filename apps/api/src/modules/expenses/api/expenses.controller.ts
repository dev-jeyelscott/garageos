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
import { IdempotencyService } from '../../../shared/idempotency/idempotency.service';
import { AccessTokenAuthGuard } from '../../auth/api/access-token-auth.guard';
import { AuthService } from '../../auth/application/auth.service';
import { ExpensesService } from '../application/expenses.service';
import {
  createExpenseRequestSchema,
  expenseIdParamsSchema,
  listExpensesQuerySchema,
  updateExpenseRequestSchema,
  voidExpenseRequestSchema,
  type CreateExpenseRequest,
  type ExpenseIdParams,
  type ListExpensesQuery,
  type UpdateExpenseRequest,
  type VoidExpenseRequest,
} from './expense.schemas';

@UseGuards(AccessTokenAuthGuard)
@Controller('expenses')
export class ExpensesController {
  constructor(
    private readonly authService: AuthService,
    private readonly expensesService: ExpensesService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  @Get()
  async listExpenses(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Query(new ZodValidationPipe(listExpensesQuerySchema)) query: ListExpensesQuery,
  ): ReturnType<ExpensesService['listExpenses']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.expensesService.listExpenses(query, session.tenantContextSession);
  }

  @Post()
  async createExpense(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(createExpenseRequestSchema)) request: CreateExpenseRequest,
  ): ReturnType<ExpensesService['createExpense']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);
    const now = new Date();
    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: 'POST /api/v1/expenses',
      idempotencyKey,
      requestIntent: request,
      now,
      expiresAt: this.expensesService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<ReturnType<ExpensesService['createExpense']>>;
    }

    try {
      const response = await this.expensesService.createExpense(
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

  @Get(':expense_id')
  async getExpense(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param(new ZodValidationPipe(expenseIdParamsSchema)) params: ExpenseIdParams,
  ): ReturnType<ExpensesService['getExpense']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.expensesService.getExpense(params.expense_id, session.tenantContextSession);
  }

  @Patch(':expense_id')
  async updateExpense(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param(new ZodValidationPipe(expenseIdParamsSchema)) params: ExpenseIdParams,
    @Body(new ZodValidationPipe(updateExpenseRequestSchema)) request: UpdateExpenseRequest,
  ): ReturnType<ExpensesService['updateExpense']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.expensesService.updateExpense(
      params.expense_id,
      request,
      session.tenantContextSession,
    );
  }

  @Post(':expense_id/void')
  async voidExpense(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param(new ZodValidationPipe(expenseIdParamsSchema)) params: ExpenseIdParams,
    @Body(new ZodValidationPipe(voidExpenseRequestSchema)) request: VoidExpenseRequest,
  ): ReturnType<ExpensesService['voidExpense']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);
    const now = new Date();
    const requestIntent = {
      expense_id: params.expense_id,
      ...request,
    };
    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: 'POST /api/v1/expenses/{expense_id}/void',
      idempotencyKey,
      requestIntent,
      now,
      expiresAt: this.expensesService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<ReturnType<ExpensesService['voidExpense']>>;
    }

    try {
      const response = await this.expensesService.voidExpense(
        params.expense_id,
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
