import { describe, expect, it } from 'vitest';

import {
  calculateInvoice,
  InvoiceCalculationError,
  type CalculateInvoiceInput,
  type InvoiceCalculationLineInput,
} from './invoice-calculation.service';

const baseLine = {
  originatingJobOrderLineId: '11111111-1111-4111-8111-111111111111',
  lineType: 'service',
  productId: null,
  serviceId: '22222222-2222-4222-8222-222222222222',
  description: 'Tune up service',
  quantity: '1.000',
  unitPrice: '1000.00',
  lineDiscountAmount: '0.00',
  lineOrder: 0,
} satisfies InvoiceCalculationLineInput;

const baseInput = {
  taxSettings: {
    taxProfile: 'vat_registered',
    taxMode: 'tax_exclusive',
    vatRate: '0.1200',
  },
  lines: [baseLine],
} satisfies CalculateInvoiceInput;

describe('calculateInvoice', () => {
  it('calculates VAT-registered tax-exclusive totals', () => {
    const result = calculateInvoice(baseInput);

    expect(result.totals).toMatchObject({
      subtotalAmount: '1000.00',
      discountAmount: '0.00',
      taxAmount: '120.00',
      totalAmount: '1120.00',
      remainingCollectibleBalance: '1120.00',
      discountReason: null,
    });
    expect(result.lines[0]).toMatchObject({
      taxableBaseAmount: '1000.00',
      taxAmount: '120.00',
      lineTotal: '1120.00',
    });
  });

  it('extracts VAT from VAT-registered tax-inclusive lines', () => {
    const result = calculateInvoice({
      ...baseInput,
      taxSettings: {
        taxProfile: 'vat_registered',
        taxMode: 'tax_inclusive',
        vatRate: '0.1200',
      },
      lines: [
        {
          ...baseLine,
          unitPrice: '1120.00',
        },
      ],
    });

    expect(result.totals).toMatchObject({
      subtotalAmount: '1120.00',
      discountAmount: '0.00',
      taxAmount: '120.00',
      totalAmount: '1120.00',
      remainingCollectibleBalance: '1120.00',
    });
    expect(result.lines[0]).toMatchObject({
      taxableBaseAmount: '1000.00',
      taxAmount: '120.00',
      lineTotal: '1120.00',
    });
  });

  it('uses no-tax behavior for non-VAT tenants', () => {
    const result = calculateInvoice({
      ...baseInput,
      taxSettings: {
        taxProfile: 'non_vat',
        taxMode: 'no_tax',
        vatRate: '0.1200',
      },
    });

    expect(result.totals).toMatchObject({
      subtotalAmount: '1000.00',
      discountAmount: '0.00',
      taxAmount: '0.00',
      totalAmount: '1000.00',
    });
    expect(result.lines[0]).toMatchObject({
      taxableBaseAmount: '1000.00',
      taxAmount: '0.00',
      lineTotal: '1000.00',
    });
  });

  it('allocates fixed invoice-level discount proportionally before tax', () => {
    const result = calculateInvoice({
      ...baseInput,
      invoiceLevelDiscount: {
        type: 'fixed',
        amount: '40.00',
        reason: 'Loyal customer discount.',
      },
      lines: [
        {
          ...baseLine,
          quantity: '1.000',
          unitPrice: '100.00',
          lineOrder: 0,
        },
        {
          ...baseLine,
          originatingJobOrderLineId: '33333333-3333-4333-8333-333333333333',
          quantity: '1.000',
          unitPrice: '300.00',
          lineOrder: 1,
        },
      ],
    });

    expect(result.lines.map((line) => line.allocatedInvoiceDiscountAmount)).toEqual([
      '10.00',
      '30.00',
    ]);
    expect(result.totals).toMatchObject({
      subtotalAmount: '400.00',
      discountAmount: '40.00',
      taxAmount: '43.20',
      totalAmount: '403.20',
      discountReason: 'Loyal customer discount.',
    });
  });

  it('allocates percentage invoice-level discount before tax', () => {
    const result = calculateInvoice({
      ...baseInput,
      invoiceLevelDiscount: {
        type: 'percentage',
        percentage: '10',
        reason: 'Promo.',
      },
      lines: [
        {
          ...baseLine,
          quantity: '1.000',
          unitPrice: '100.00',
          lineOrder: 0,
        },
        {
          ...baseLine,
          originatingJobOrderLineId: '33333333-3333-4333-8333-333333333333',
          quantity: '1.000',
          unitPrice: '300.00',
          lineOrder: 1,
        },
      ],
    });

    expect(result.lines.map((line) => line.allocatedInvoiceDiscountAmount)).toEqual([
      '10.00',
      '30.00',
    ]);
    expect(result.totals).toMatchObject({
      subtotalAmount: '400.00',
      discountAmount: '40.00',
      taxAmount: '43.20',
      totalAmount: '403.20',
    });
  });

  it('applies rounding remainder to the last eligible line by line order', () => {
    const result = calculateInvoice({
      ...baseInput,
      taxSettings: {
        taxProfile: 'no_tax',
        taxMode: 'no_tax',
        vatRate: '0.1200',
      },
      invoiceLevelDiscount: {
        type: 'fixed',
        amount: '0.01',
        reason: 'Rounding test discount.',
      },
      lines: [
        {
          ...baseLine,
          unitPrice: '0.01',
          lineOrder: 0,
        },
        {
          ...baseLine,
          originatingJobOrderLineId: '33333333-3333-4333-8333-333333333333',
          unitPrice: '0.01',
          lineOrder: 1,
        },
        {
          ...baseLine,
          originatingJobOrderLineId: '44444444-4444-4444-8444-444444444444',
          unitPrice: '0.01',
          lineOrder: 2,
        },
      ],
    });

    expect(result.lines.map((line) => line.allocatedInvoiceDiscountAmount)).toEqual([
      '0.00',
      '0.00',
      '0.01',
    ]);
    expect(result.totals).toMatchObject({
      subtotalAmount: '0.03',
      discountAmount: '0.01',
      totalAmount: '0.02',
    });
  });

  it('blocks invoice-level discount exceeding eligible subtotal', () => {
    expect(() =>
      calculateInvoice({
        ...baseInput,
        invoiceLevelDiscount: {
          type: 'fixed',
          amount: '1000.01',
          reason: 'Invalid discount test.',
        },
      }),
    ).toThrowError(InvoiceCalculationError);

    try {
      calculateInvoice({
        ...baseInput,
        invoiceLevelDiscount: {
          type: 'fixed',
          amount: '1000.01',
          reason: 'Invalid discount test.',
        },
      });
    } catch (error) {
      expect(error).toBeInstanceOf(InvoiceCalculationError);
      expect((error as InvoiceCalculationError).details[0]).toMatchObject({
        code: 'invoice_discount_exceeds_eligible_subtotal',
      });
    }
  });

  it('blocks line-level discount that would make line net amount negative', () => {
    expect(() =>
      calculateInvoice({
        ...baseInput,
        lines: [
          {
            ...baseLine,
            lineDiscountAmount: '1000.01',
          },
        ],
      }),
    ).toThrowError(InvoiceCalculationError);

    try {
      calculateInvoice({
        ...baseInput,
        lines: [
          {
            ...baseLine,
            lineDiscountAmount: '1000.01',
          },
        ],
      });
    } catch (error) {
      expect(error).toBeInstanceOf(InvoiceCalculationError);
      expect((error as InvoiceCalculationError).details[0]).toMatchObject({
        code: 'invoice_line_discount_exceeds_subtotal',
      });
    }
  });

  it('blocks invoice-level discounts without a reason', () => {
    expect(() =>
      calculateInvoice({
        ...baseInput,
        invoiceLevelDiscount: {
          type: 'fixed',
          amount: '10.00',
        },
      }),
    ).toThrowError(InvoiceCalculationError);

    try {
      calculateInvoice({
        ...baseInput,
        invoiceLevelDiscount: {
          type: 'fixed',
          amount: '10.00',
        },
      });
    } catch (error) {
      expect(error).toBeInstanceOf(InvoiceCalculationError);
      expect((error as InvoiceCalculationError).details[0]).toMatchObject({
        field: 'invoice_level_discount.reason',
        code: 'invoice_discount_reason_required',
      });
    }
  });
});
