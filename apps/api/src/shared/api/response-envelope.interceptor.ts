import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { map, type Observable } from 'rxjs';
import {
  createCorrelationId,
  createRequestId,
  type GarageOsHttpRequest,
} from '../observability/request-context.middleware';

interface ApiResponseMeta {
  request_id: string;
  correlation_id: string;
}

interface ApiSuccessEnvelope<TData> {
  data: TData;
  meta: ApiResponseMeta;
}

@Injectable()
export class ResponseEnvelopeInterceptor<TData> implements NestInterceptor<
  TData,
  ApiSuccessEnvelope<TData>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<TData>,
  ): Observable<ApiSuccessEnvelope<TData>> {
    const request = context.switchToHttp().getRequest<GarageOsHttpRequest>();

    const requestId = request.request_id ?? createRequestId();
    const correlationId = request.correlation_id ?? createCorrelationId();

    return next.handle().pipe(
      map((data) => ({
        data,
        meta: {
          request_id: requestId,
          correlation_id: correlationId,
        },
      })),
    );
  }
}
