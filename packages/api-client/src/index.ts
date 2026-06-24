import type { ISODateTimeString } from '@garageos/shared';

export interface ApiMeta {
  request_id: string;
  correlation_id: string;
}

export interface ApiSuccessResponse<TData> {
  data: TData;
  meta: ApiMeta;
}

export interface ApiErrorDetail {
  field?: string;
  code: string;
  message: string;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: ApiErrorDetail[];
    request_id: string;
    correlation_id: string;
  };
}

export interface HealthResponse {
  status: 'ok';
  service: string;
  timestamp: ISODateTimeString;
}
