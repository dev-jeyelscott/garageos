import { describe, expect, it } from 'vitest';

import type { ApiSuccessResponse, HealthResponse } from './index';

describe('@garageos/api-client', () => {
  it('supports typed API success responses', () => {
    const response: ApiSuccessResponse<HealthResponse> = {
      data: {
        status: 'ok',
        service: 'api',
        timestamp: '2026-06-24T00:00:00.000Z',
      },
      meta: {
        request_id: 'req_test',
        correlation_id: 'corr_test',
      },
    };

    expect(response.data.status).toBe('ok');
    expect(response.meta.request_id).toBe('req_test');
  });
});
