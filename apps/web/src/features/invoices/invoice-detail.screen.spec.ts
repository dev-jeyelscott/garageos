import { describe, expect, it } from 'vitest';

import { canEnterInvoiceCancelReason } from './invoice.ui';
import type { InvoiceStatus } from './invoice.types';

describe('canEnterInvoiceCancelReason', () => {
  it.each<InvoiceStatus>(['draft', 'pending'])(
    'allows cancel reason entry for %s invoices',
    (status) => {
      expect(canEnterInvoiceCancelReason(status)).toBe(true);
    },
  );

  it.each<InvoiceStatus>(['partially_paid', 'paid', 'overdue', 'cancelled', 'voided', 'refunded'])(
    'blocks cancel reason entry for %s invoices',
    (status) => {
      expect(canEnterInvoiceCancelReason(status)).toBe(false);
    },
  );
});
