import { describe, expect, it } from 'vitest';

import {
  buildNextJobOrderNumber,
  formatTenantBusinessDate,
} from '../../../shared/numbering/document-numbering';
import { assertCanUpdateJobOrderBaseline } from './job-orders.service';

describe('JobOrdersService baseline helpers', () => {
  it('generates the first tenant-scoped job order number for a business date', () => {
    expect(buildNextJobOrderNumber('20260628', null)).toBe('JO-20260628-000001');
  });

  it('increments the tenant-scoped job order number for a business date', () => {
    expect(buildNextJobOrderNumber('20260628', 'JO-20260628-000009')).toBe('JO-20260628-000010');
  });

  it('formats the job order business date in the tenant timezone', () => {
    const value = new Date('2026-06-27T16:30:00.000Z');

    expect(formatTenantBusinessDate(value, 'Asia/Manila')).toBe('20260628');
  });
});

describe('job order baseline validators', () => {
  it('allows pending job orders to be updated in the baseline slice', () => {
    expect(() =>
      assertCanUpdateJobOrderBaseline({
        status: 'pending',
      }),
    ).not.toThrow();
  });

  it('blocks non-pending job orders from baseline updates', () => {
    expect(() =>
      assertCanUpdateJobOrderBaseline({
        status: 'in_progress',
      }),
    ).toThrow('One or more fields are invalid.');
  });
});
