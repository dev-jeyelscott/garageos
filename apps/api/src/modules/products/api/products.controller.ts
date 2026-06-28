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
import { ProductsService } from '../application/products.service';
import {
  createProductRequestSchema,
  type CreateProductRequest,
  listProductsQuerySchema,
  type ListProductsQuery,
  productStatusChangeRequestSchema,
  type ProductStatusChangeRequest,
  updateProductRequestSchema,
  type UpdateProductRequest,
} from './product.schemas';

@UseGuards(AccessTokenAuthGuard)
@Controller('products')
export class ProductsController {
  constructor(
    private readonly authService: AuthService,
    private readonly productsService: ProductsService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  @Get()
  async listProducts(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Query(new ZodValidationPipe(listProductsQuerySchema))
    query: ListProductsQuery,
  ): ReturnType<ProductsService['listProducts']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.productsService.listProducts(query, session.tenantContextSession);
  }

  @Post()
  async createProduct(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(createProductRequestSchema))
    request: CreateProductRequest,
  ): ReturnType<ProductsService['createProduct']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);
    const now = new Date();

    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: 'POST /api/v1/products',
      idempotencyKey,
      requestIntent: request,
      now,
      expiresAt: this.productsService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<ReturnType<ProductsService['createProduct']>>;
    }

    try {
      const response = await this.productsService.createProduct(
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

  @Get(':product_id')
  async getProduct(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('product_id') productId: string,
  ): ReturnType<ProductsService['getProduct']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.productsService.getProduct(productId, session.tenantContextSession);
  }

  @Patch(':product_id')
  async updateProduct(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('product_id') productId: string,
    @Body(new ZodValidationPipe(updateProductRequestSchema))
    request: UpdateProductRequest,
  ): ReturnType<ProductsService['updateProduct']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.productsService.updateProduct(productId, request, session.tenantContextSession);
  }

  @Post(':product_id/deactivate')
  @HttpCode(200)
  async deactivateProduct(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('product_id') productId: string,
    @Body(new ZodValidationPipe(productStatusChangeRequestSchema))
    request: ProductStatusChangeRequest,
  ): ReturnType<ProductsService['deactivateProduct']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);
    const now = new Date();
    const requestIntent = {
      product_id: productId,
      ...request,
    };

    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: 'POST /api/v1/products/{product_id}/deactivate',
      idempotencyKey,
      requestIntent,
      now,
      expiresAt: this.productsService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<ProductsService['deactivateProduct']>
      >;
    }

    try {
      const response = await this.productsService.deactivateProduct(
        productId,
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

  @Post(':product_id/reactivate')
  @HttpCode(200)
  async reactivateProduct(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('product_id') productId: string,
    @Body(new ZodValidationPipe(productStatusChangeRequestSchema))
    request: ProductStatusChangeRequest,
  ): ReturnType<ProductsService['reactivateProduct']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);
    const now = new Date();
    const requestIntent = {
      product_id: productId,
      ...request,
    };

    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: 'POST /api/v1/products/{product_id}/reactivate',
      idempotencyKey,
      requestIntent,
      now,
      expiresAt: this.productsService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<ProductsService['reactivateProduct']>
      >;
    }

    try {
      const response = await this.productsService.reactivateProduct(
        productId,
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
