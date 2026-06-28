import { describe, expect, it } from 'vitest';

import {
  assertCanApproveEstimate,
  assertCanPresentEstimate,
  buildNextEstimateNumber,
  calculateEstimateLineTotal,
  formatTenantBusinessDate,
} from './estimates.service';

describe('EstimatesService baseline helpers', () => {
  it('generates the first tenant-scoped estimate number for a business date', () => {
    expect(buildNextEstimateNumber('20260628', null)).toBe('EST-20260628-000001');
  });

  it('increments the tenant-scoped estimate number for a business date', () => {
    expect(buildNextEstimateNumber('20260628', 'EST-20260628-000009')).toBe('EST-20260628-000010');
  });

  it('calculates estimate line totals using fixed money precision', () => {
    expect(calculateEstimateLineTotal('1.500', '100.00')).toBe('150.00');
    expect(calculateEstimateLineTotal('2.000', '75.25')).toBe('150.50');
  });

  it('formats the estimate business date in the tenant timezone', () => {
    const value = new Date('2026-06-27T16:30:00.000Z');

    expect(formatTenantBusinessDate(value, 'Asia/Manila')).toBe('20260628');
  });
});

describe('estimate workflow validators', () => {
  it('allows draft estimates with lines and valid-until date to be presented', () => {
    expect(() =>
      assertCanPresentEstimate({
        status: 'draft',
        validUntilDate: '2026-07-28',
        lines: [{} as never],
      }),
    ).not.toThrow();
  });

  it('blocks non-draft estimates from presentation', () => {
    expect(() =>
      assertCanPresentEstimate({
        status: 'presented',
        validUntilDate: '2026-07-28',
        lines: [{} as never],
      }),
    ).toThrow('Only draft estimates can be presented.');
  });

  it('blocks draft presentation when valid-until date is missing', () => {
    expect(() =>
      assertCanPresentEstimate({
        status: 'draft',
        validUntilDate: null,
        lines: [{} as never],
      }),
    ).toThrow('One or more fields are invalid.');
  });

  it('blocks draft presentation when line items are missing', () => {
    expect(() =>
      assertCanPresentEstimate({
        status: 'draft',
        validUntilDate: '2026-07-28',
        lines: [],
      }),
    ).toThrow('One or more fields are invalid.');
  });

  it('allows presented estimates to be approved', () => {
    expect(() =>
      assertCanApproveEstimate({
        status: 'presented',
      }),
    ).not.toThrow();
  });

  it('blocks non-presented estimates from approval', () => {
    expect(() =>
      assertCanApproveEstimate({
        status: 'draft',
      }),
    ).toThrow('Only presented estimates can be approved.');
  });
});
