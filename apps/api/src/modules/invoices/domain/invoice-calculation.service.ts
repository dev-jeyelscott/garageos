import type { InvoiceLineType, TaxMode, TaxProfile } from '../application/invoice.records';

const MONEY_SCALE = 100n;
const QUANTITY_SCALE = 1000n;
const RATE_SCALE = 10000n;
const PERCENT_SCALE = 1000000n;
const ZERO_MONEY = '0.00';

export interface InvoiceCalculationValidationDetail {
  readonly field?: string;
  readonly code?: string;
  readonly message?: string;
}

export class InvoiceCalculationError extends Error {
  constructor(readonly details: readonly InvoiceCalculationValidationDetail[]) {
    super('Invoice calculation failed.');
  }
}

export type InvoiceLevelDiscountInput =
  | {
      readonly type: 'fixed';
      readonly amount: string;
      readonly reason?: string | null;
    }
  | {
      readonly type: 'percentage';
      readonly percentage: string;
      readonly reason?: string | null;
    };

export interface InvoiceCalculationTaxSettings {
  readonly taxProfile: TaxProfile;
  readonly taxMode: TaxMode;
  readonly vatRate: string;
}

export interface InvoiceCalculationLineInput {
  readonly originatingJobOrderLineId: string | null;
  readonly lineType: InvoiceLineType;
  readonly productId: string | null;
  readonly serviceId: string | null;
  readonly description: string;
  readonly quantity: string;
  readonly unitPrice: string;
  readonly lineDiscountAmount?: string | null;
  readonly lineOrder: number;
}

export interface CalculateInvoiceInput {
  readonly taxSettings: InvoiceCalculationTaxSettings;
  readonly invoiceLevelDiscount?: InvoiceLevelDiscountInput | null;
  readonly lines: readonly InvoiceCalculationLineInput[];
}

export interface CalculatedInvoiceLine {
  readonly originatingJobOrderLineId: string | null;
  readonly lineType: InvoiceLineType;
  readonly productId: string | null;
  readonly serviceId: string | null;
  readonly description: string;
  readonly quantity: string;
  readonly unitPrice: string;
  readonly lineDiscountAmount: string;
  readonly allocatedInvoiceDiscountAmount: string;
  readonly taxableBaseAmount: string;
  readonly taxAmount: string;
  readonly lineTotal: string;
  readonly lineOrder: number;
}

export interface CalculatedInvoiceTotals {
  readonly subtotalAmount: string;
  readonly discountAmount: string;
  readonly taxAmount: string;
  readonly totalAmount: string;
  readonly remainingCollectibleBalance: string;
  readonly discountReason: string | null;
}

export interface CalculatedInvoice {
  readonly lines: readonly CalculatedInvoiceLine[];
  readonly totals: CalculatedInvoiceTotals;
}

interface PreparedLine {
  readonly input: InvoiceCalculationLineInput;
  readonly lineSubtotalCents: bigint;
  readonly lineDiscountCents: bigint;
  readonly preInvoiceDiscountCents: bigint;
}

export function calculateInvoice(input: CalculateInvoiceInput): CalculatedInvoice {
  if (input.lines.length === 0) {
    throw new InvoiceCalculationError([
      {
        field: 'lines',
        code: 'invoice_requires_lines',
        message: 'At least one invoice line is required.',
      },
    ]);
  }

  const preparedLines = input.lines.map(prepareLine);
  const discountAllocations = allocateInvoiceLevelDiscount({
    discount: input.invoiceLevelDiscount ?? null,
    lines: preparedLines,
  });
  const taxMode = resolveTaxMode(input.taxSettings);
  const vatBasisPoints = parseVatBasisPoints(input.taxSettings.vatRate);

  const calculatedLines = preparedLines.map((line, index) => {
    const allocatedInvoiceDiscountCents = discountAllocations.allocations[index] ?? 0n;
    const discountedLineAmountCents = line.preInvoiceDiscountCents - allocatedInvoiceDiscountCents;

    if (discountedLineAmountCents < 0n) {
      throw new InvoiceCalculationError([
        {
          field: 'invoice_level_discount',
          code: 'invoice_line_net_negative',
          message:
            'Line discount plus allocated invoice discount cannot make a line net amount negative.',
        },
      ]);
    }

    const tax = calculateLineTax({
      amountCents: discountedLineAmountCents,
      taxMode,
      vatBasisPoints,
    });

    return {
      originatingJobOrderLineId: line.input.originatingJobOrderLineId,
      lineType: line.input.lineType,
      productId: line.input.productId,
      serviceId: line.input.serviceId,
      description: line.input.description,
      quantity: line.input.quantity,
      unitPrice: line.input.unitPrice,
      lineDiscountAmount: formatMoneyCents(line.lineDiscountCents),
      allocatedInvoiceDiscountAmount: formatMoneyCents(allocatedInvoiceDiscountCents),
      taxableBaseAmount: formatMoneyCents(tax.taxableBaseCents),
      taxAmount: formatMoneyCents(tax.taxAmountCents),
      lineTotal: formatMoneyCents(tax.lineTotalCents),
      lineOrder: line.input.lineOrder,
    };
  });

  const subtotalCents = preparedLines.reduce(
    (total, line) => total + line.preInvoiceDiscountCents,
    0n,
  );
  const taxAmountCents = calculatedLines.reduce(
    (total, line) => total + parseMoneyCents(line.taxAmount),
    0n,
  );
  const totalAmountCents = calculatedLines.reduce(
    (total, line) => total + parseMoneyCents(line.lineTotal),
    0n,
  );

  return {
    lines: calculatedLines,
    totals: {
      subtotalAmount: formatMoneyCents(subtotalCents),
      discountAmount: formatMoneyCents(discountAllocations.totalDiscountCents),
      taxAmount: formatMoneyCents(taxAmountCents),
      totalAmount: formatMoneyCents(totalAmountCents),
      remainingCollectibleBalance: formatMoneyCents(totalAmountCents),
      discountReason: discountAllocations.reason,
    },
  };
}

function prepareLine(line: InvoiceCalculationLineInput): PreparedLine {
  const lineSubtotalCents = multiplyMoneyByQuantity(line.unitPrice, line.quantity);
  const lineDiscountCents = parseMoneyCents(line.lineDiscountAmount ?? ZERO_MONEY);

  if (lineDiscountCents > lineSubtotalCents) {
    throw new InvoiceCalculationError([
      {
        field: 'lines.line_discount_amount',
        code: 'invoice_line_discount_exceeds_subtotal',
        message: 'Line discount cannot exceed the line subtotal.',
      },
    ]);
  }

  return {
    input: line,
    lineSubtotalCents,
    lineDiscountCents,
    preInvoiceDiscountCents: lineSubtotalCents - lineDiscountCents,
  };
}

function allocateInvoiceLevelDiscount(input: {
  readonly discount: InvoiceLevelDiscountInput | null;
  readonly lines: readonly PreparedLine[];
}): {
  readonly allocations: readonly bigint[];
  readonly totalDiscountCents: bigint;
  readonly reason: string | null;
} {
  if (input.discount === null) {
    return {
      allocations: input.lines.map(() => 0n),
      totalDiscountCents: 0n,
      reason: null,
    };
  }

  const eligibleLineIndexes = input.lines
    .map((line, index) => ({ index, line }))
    .filter((entry) => entry.line.preInvoiceDiscountCents > 0n)
    .sort((left, right) => left.line.input.lineOrder - right.line.input.lineOrder)
    .map((entry) => entry.index);

  if (eligibleLineIndexes.length === 0) {
    throw new InvoiceCalculationError([
      {
        field: 'invoice_level_discount',
        code: 'invoice_discount_requires_eligible_lines',
        message: 'Invoice-level discount requires at least one eligible line.',
      },
    ]);
  }

  const eligibleSubtotalCents = eligibleLineIndexes.reduce(
    (total, index) => total + input.lines[index]!.preInvoiceDiscountCents,
    0n,
  );
  const totalDiscountCents = calculateTotalInvoiceDiscount(input.discount, eligibleSubtotalCents);

  if (totalDiscountCents > eligibleSubtotalCents) {
    throw new InvoiceCalculationError([
      {
        field: 'invoice_level_discount',
        code: 'invoice_discount_exceeds_eligible_subtotal',
        message: 'Invoice-level discount cannot exceed the eligible invoice subtotal.',
      },
    ]);
  }

  const allocations = input.lines.map(() => 0n);
  let allocatedCents = 0n;

  for (const [eligibleIndex, lineIndex] of eligibleLineIndexes.entries()) {
    const isLastEligibleLine = eligibleIndex === eligibleLineIndexes.length - 1;
    const allocation = isLastEligibleLine
      ? totalDiscountCents - allocatedCents
      : calculateLineDiscountAllocation({
          discount: input.discount,
          lineAmountCents: input.lines[lineIndex]!.preInvoiceDiscountCents,
          totalDiscountCents,
          eligibleSubtotalCents,
        });

    allocations[lineIndex] = allocation;
    allocatedCents += allocation;
  }

  return {
    allocations,
    totalDiscountCents,
    reason: normalizeReason(input.discount.reason ?? null),
  };
}

function calculateTotalInvoiceDiscount(
  discount: InvoiceLevelDiscountInput,
  eligibleSubtotalCents: bigint,
): bigint {
  if (discount.type === 'fixed') {
    return parseMoneyCents(discount.amount);
  }

  const percentageUnits = parsePercentageUnits(discount.percentage);

  return roundDivide(eligibleSubtotalCents * percentageUnits, PERCENT_SCALE);
}

function calculateLineDiscountAllocation(input: {
  readonly discount: InvoiceLevelDiscountInput;
  readonly lineAmountCents: bigint;
  readonly totalDiscountCents: bigint;
  readonly eligibleSubtotalCents: bigint;
}): bigint {
  if (input.discount.type === 'percentage') {
    return roundDivide(
      input.lineAmountCents * parsePercentageUnits(input.discount.percentage),
      PERCENT_SCALE,
    );
  }

  return roundDivide(input.totalDiscountCents * input.lineAmountCents, input.eligibleSubtotalCents);
}

function calculateLineTax(input: {
  readonly amountCents: bigint;
  readonly taxMode: TaxMode;
  readonly vatBasisPoints: bigint;
}): {
  readonly taxableBaseCents: bigint;
  readonly taxAmountCents: bigint;
  readonly lineTotalCents: bigint;
} {
  if (input.taxMode === 'no_tax') {
    return {
      taxableBaseCents: input.amountCents,
      taxAmountCents: 0n,
      lineTotalCents: input.amountCents,
    };
  }

  if (input.taxMode === 'tax_inclusive') {
    const divisor = RATE_SCALE + input.vatBasisPoints;
    const taxAmountCents = roundDivide(input.amountCents * input.vatBasisPoints, divisor);

    return {
      taxableBaseCents: input.amountCents - taxAmountCents,
      taxAmountCents,
      lineTotalCents: input.amountCents,
    };
  }

  const taxAmountCents = roundDivide(input.amountCents * input.vatBasisPoints, RATE_SCALE);

  return {
    taxableBaseCents: input.amountCents,
    taxAmountCents,
    lineTotalCents: input.amountCents + taxAmountCents,
  };
}

function resolveTaxMode(settings: InvoiceCalculationTaxSettings): TaxMode {
  if (settings.taxProfile !== 'vat_registered') {
    return 'no_tax';
  }

  return settings.taxMode;
}

function multiplyMoneyByQuantity(money: string, quantity: string): bigint {
  const cents = parseMoneyCents(money);
  const thousandths = parseQuantityThousandths(quantity);

  return roundDivide(cents * thousandths, QUANTITY_SCALE);
}

function parseMoneyCents(value: string): bigint {
  const [wholePart = '0', fractionalPart = ''] = value.split('.');
  const normalizedFractionalPart = fractionalPart.padEnd(2, '0').slice(0, 2);

  return BigInt(wholePart) * MONEY_SCALE + BigInt(normalizedFractionalPart);
}

function parseQuantityThousandths(value: string): bigint {
  const [wholePart = '0', fractionalPart = ''] = value.split('.');
  const normalizedFractionalPart = fractionalPart.padEnd(3, '0').slice(0, 3);

  return BigInt(wholePart) * QUANTITY_SCALE + BigInt(normalizedFractionalPart);
}

function parseVatBasisPoints(value: string): bigint {
  const [wholePart = '0', fractionalPart = ''] = value.split('.');
  const normalizedFractionalPart = fractionalPart.padEnd(4, '0').slice(0, 4);

  return BigInt(wholePart) * RATE_SCALE + BigInt(normalizedFractionalPart);
}

function parsePercentageUnits(value: string): bigint {
  const [wholePart = '0', fractionalPart = ''] = value.split('.');
  const normalizedFractionalPart = fractionalPart.padEnd(4, '0').slice(0, 4);

  return BigInt(wholePart) * RATE_SCALE + BigInt(normalizedFractionalPart);
}

function roundDivide(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator / 2n) / denominator;
}

function formatMoneyCents(value: bigint): string {
  const wholePart = value / MONEY_SCALE;
  const fractionalPart = value % MONEY_SCALE;

  return `${wholePart.toString()}.${fractionalPart.toString().padStart(2, '0')}`;
}

function normalizeReason(reason: string | null): string | null {
  const normalized = reason?.trim() ?? '';

  return normalized.length === 0 ? null : normalized;
}
