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
import type { IdempotencyService } from '../../../shared/idempotency/idempotency.service';
import { AccessTokenAuthGuard } from '../../auth/api/access-token-auth.guard';
import type { AuthService } from '../../auth/application/auth.service';
import type { ProductCategoriesService } from '../application/product-categories.service';
import {
  createProductCategoryRequestSchema,
  type CreateProductCategoryRequest,
  listProductCategoriesQuerySchema,
  type ListProductCategoriesQuery,
  productCategoryStatusChangeRequestSchema,
  type ProductCategoryStatusChangeRequest,
  updateProductCategoryRequestSchema,
  type UpdateProductCategoryRequest,
} from './product-category.schemas';

@UseGuards(AccessTokenAuthGuard)
@Controller('product-categories')
export class ProductCategoriesController {
  constructor(
    private readonly authService: AuthService,
    private readonly productCategoriesService: ProductCategoriesService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  @Get()
  async listProductCategories(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Query(new ZodValidationPipe(listProductCategoriesQuerySchema))
    query: ListProductCategoriesQuery,
  ): ReturnType<ProductCategoriesService['listProductCategories']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.productCategoriesService.listProductCategories(query, session.tenantContextSession);
  }

  @Post()
  async createProductCategory(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(createProductCategoryRequestSchema))
    request: CreateProductCategoryRequest,
  ): ReturnType<ProductCategoriesService['createProductCategory']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);
    const now = new Date();

    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: 'POST /api/v1/product-categories',
      idempotencyKey,
      requestIntent: request,
      now,
      expiresAt: this.productCategoriesService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<ProductCategoriesService['createProductCategory']>
      >;
    }

    try {
      const response = await this.productCategoriesService.createProductCategory(
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
  async getProductCategory(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('category_id') categoryId: string,
  ): ReturnType<ProductCategoriesService['getProductCategory']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.productCategoriesService.getProductCategory(
      categoryId,
      session.tenantContextSession,
    );
  }

  @Patch(':category_id')
  async updateProductCategory(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('category_id') categoryId: string,
    @Body(new ZodValidationPipe(updateProductCategoryRequestSchema))
    request: UpdateProductCategoryRequest,
  ): ReturnType<ProductCategoriesService['updateProductCategory']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.productCategoriesService.updateProductCategory(
      categoryId,
      request,
      session.tenantContextSession,
    );
  }

  @Post(':category_id/deactivate')
  @HttpCode(200)
  async deactivateProductCategory(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('category_id') categoryId: string,
    @Body(new ZodValidationPipe(productCategoryStatusChangeRequestSchema))
    request: ProductCategoryStatusChangeRequest,
  ): ReturnType<ProductCategoriesService['deactivateProductCategory']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);
    const now = new Date();
    const requestIntent = {
      category_id: categoryId,
      ...request,
    };

    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: 'POST /api/v1/product-categories/{category_id}/deactivate',
      idempotencyKey,
      requestIntent,
      now,
      expiresAt: this.productCategoriesService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<ProductCategoriesService['deactivateProductCategory']>
      >;
    }

    try {
      const response = await this.productCategoriesService.deactivateProductCategory(
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
  async reactivateProductCategory(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('category_id') categoryId: string,
    @Body(new ZodValidationPipe(productCategoryStatusChangeRequestSchema))
    request: ProductCategoryStatusChangeRequest,
  ): ReturnType<ProductCategoriesService['reactivateProductCategory']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);
    const now = new Date();
    const requestIntent = {
      category_id: categoryId,
      ...request,
    };

    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: 'POST /api/v1/product-categories/{category_id}/reactivate',
      idempotencyKey,
      requestIntent,
      now,
      expiresAt: this.productCategoriesService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<ProductCategoriesService['reactivateProductCategory']>
      >;
    }

    try {
      const response = await this.productCategoriesService.reactivateProductCategory(
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
