import { describe, expect, it } from 'vitest';

import {
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
