import { describe, expect, it } from 'vitest';

import { GarageOsApiException } from '../../../shared/api/api-exception';
import type { EstimateRecord } from './estimate.store';
import { assertCanConvertEstimate, buildNextJobOrderNumber } from './estimates.service';

type ConvertibleEstimateShape = Pick<
  EstimateRecord,
  'status' | 'motorcycleId' | 'convertedJobOrderId' | 'lines'
>;

function buildEstimate(
  overrides: Partial<ConvertibleEstimateShape> = {},
): ConvertibleEstimateShape {
  return {
    status: 'approved',
    motorcycleId: '8b6b4d33-9ac7-4c16-9a9e-7f93f19f24dd',
    convertedJobOrderId: null,
    lines: [
      {
        id: '0cf3c40b-64dd-4945-993f-989be73f5c7d',
        tenantId: '2e62f456-0d6e-49d6-b1f0-08d4f03a9fef',
        estimateId: '1c1c9430-7867-4738-bf71-0571a0572f0d',
        lineType: 'service',
        serviceId: '44564c42-ec82-4702-8f55-37c75c6f27a9',
        productId: null,
        description: 'General service',
        quantity: '1.000',
        unitPrice: '500.00',
        lineTotal: '500.00',
        lineOrder: 0,
      },
    ],
    ...overrides,
  };
}

describe('estimate conversion boundary', () => {
  it('allows approved estimates with a motorcycle and non-inventory lines', () => {
    expect(() => assertCanConvertEstimate(buildEstimate())).not.toThrow();
  });

  it('blocks non-approved estimates', () => {
    expect(() =>
      assertCanConvertEstimate(
        buildEstimate({
          status: 'presented',
        }),
      ),
    ).toThrow(GarageOsApiException);
  });

  it('blocks estimates without a motorcycle because job orders require one', () => {
    try {
      assertCanConvertEstimate(
        buildEstimate({
          motorcycleId: null,
        }),
      );

      throw new Error('Expected conversion validation to fail.');
    } catch (error) {
      expect(error).toBeInstanceOf(GarageOsApiException);
      expect((error as GarageOsApiException).details).toContainEqual({
        field: 'motorcycle_id',
        code: 'estimate_motorcycle_required_for_job_order_conversion',
        message:
          'Approved estimate must be linked to a motorcycle before conversion to a job order.',
      });
    }
  });

  it('blocks part lines until inventory reservation support exists', () => {
    const estimate = buildEstimate({
      lines: [
        {
          id: '0cf3c40b-64dd-4945-993f-989be73f5c7d',
          tenantId: '2e62f456-0d6e-49d6-b1f0-08d4f03a9fef',
          estimateId: '1c1c9430-7867-4738-bf71-0571a0572f0d',
          lineType: 'part',
          serviceId: null,
          productId: '393a3c37-3abf-4b1e-8c8c-6de43727efb0',
          description: 'Oil filter',
          quantity: '1.000',
          unitPrice: '250.00',
          lineTotal: '250.00',
          lineOrder: 0,
        },
      ],
    });

    try {
      assertCanConvertEstimate(estimate);

      throw new Error('Expected conversion validation to fail.');
    } catch (error) {
      expect(error).toBeInstanceOf(GarageOsApiException);
      expect((error as GarageOsApiException).details).toContainEqual({
        field: 'lines',
        code: 'estimate_part_lines_not_supported_for_conversion_boundary',
        message:
          'Estimate part lines cannot be converted until inventory reservation support is implemented.',
      });
    }
  });

  it('builds tenant-wide daily-reset job order numbers', () => {
    expect(buildNextJobOrderNumber('20260628', null)).toBe('JO-20260628-000001');
    expect(buildNextJobOrderNumber('20260628', 'JO-20260628-000009')).toBe('JO-20260628-000010');
  });
});
