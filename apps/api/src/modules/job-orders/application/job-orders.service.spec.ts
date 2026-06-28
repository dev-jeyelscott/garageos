import { describe, expect, it } from 'vitest';

import {
  buildNextJobOrderNumber,
  formatTenantBusinessDate,
} from '../../../shared/numbering/document-numbering';
import {
  assertBaselinePartLinesBlocked,
  assertCanEditJobOrderLines,
  assertCanUpdateJobOrderBaseline,
  calculateJobOrderLineAuthorizedAmount,
} from './job-orders.service';

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

describe('job order line scaffolding validators', () => {
  it.each(['pending', 'in_progress', 'waiting_for_parts'] as const)(
    'allows service/labor line edits while job order is %s',
    (status) => {
      expect(() =>
        assertCanEditJobOrderLines({
          status,
        }),
      ).not.toThrow();
    },
  );

  it.each(['completed', 'released', 'cancelled'] as const)(
    'blocks service/labor line edits while job order is %s',
    (status) => {
      expect(() =>
        assertCanEditJobOrderLines({
          status,
        }),
      ).toThrow('One or more fields are invalid.');
    },
  );

  it('calculates authorized line amount from quantity and unit price', () => {
    expect(calculateJobOrderLineAuthorizedAmount('2.000', '125.50')).toBe('251.00');
  });

  it('blocks part lines until inventory reservation support exists', () => {
    expect(() => assertBaselinePartLinesBlocked()).toThrow('One or more fields are invalid.');
  });
});
