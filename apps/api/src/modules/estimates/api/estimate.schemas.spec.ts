import { describe, expect, it } from 'vitest';

import { createEstimateRequestSchema, updateEstimateRequestSchema } from './estimate.schemas';

const branchId = '11111111-1111-4111-8111-111111111111';
const customerId = '22222222-2222-4222-8222-222222222222';

describe('estimate schemas', () => {
  it('accepts a baseline draft estimate with service and labor lines', () => {
    const result = createEstimateRequestSchema.safeParse({
      branch_id: branchId,
      customer_id: customerId,
      valid_until_date: '2026-07-28',
      lines: [
        {
          line_type: 'service',
          description: 'Change oil',
          quantity: '1.000',
          unit_price: '350.00',
        },
        {
          line_type: 'labor',
          description: 'Diagnostic labor',
          quantity: '1.500',
          unit_price: '200.00',
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it('rejects part lines in the estimate baseline slice', () => {
    const result = createEstimateRequestSchema.safeParse({
      branch_id: branchId,
      customer_id: customerId,
      lines: [
        {
          line_type: 'part',
          description: 'Spark plug',
          quantity: '1.000',
          unit_price: '150.00',
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it('requires lock_version for draft updates', () => {
    const result = updateEstimateRequestSchema.safeParse({
      valid_until_date: '2026-07-28',
      lines: [
        {
          line_type: 'labor',
          description: 'Diagnostic labor',
          quantity: '1.000',
          unit_price: '200.00',
        },
      ],
    });

    expect(result.success).toBe(false);
  });
});
