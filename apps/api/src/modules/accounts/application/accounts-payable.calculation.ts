export interface AccountsPayableCalculationInput {
  readonly creditPurchaseReceivedTotal: string;
  readonly supplierPaymentTotal: string;
  readonly supplierCreditTotal: string;
}

export interface AccountsPayableCalculationResult extends AccountsPayableCalculationInput {
  readonly payableBalance: string;
}

export function calculateAccountsPayableBalance(
  input: AccountsPayableCalculationInput,
): AccountsPayableCalculationResult {
  return {
    ...input,
    payableBalance: formatMoneyCents(
      parseMoneyCents(input.creditPurchaseReceivedTotal) -
        parseMoneyCents(input.supplierPaymentTotal) -
        parseMoneyCents(input.supplierCreditTotal),
    ),
  };
}

export function sumAccountsPayableCalculations(
  calculations: readonly AccountsPayableCalculationResult[],
): AccountsPayableCalculationResult {
  return calculations.reduce<AccountsPayableCalculationResult>(
    (total, calculation) => ({
      creditPurchaseReceivedTotal: addMoney(
        total.creditPurchaseReceivedTotal,
        calculation.creditPurchaseReceivedTotal,
      ),
      supplierPaymentTotal: addMoney(total.supplierPaymentTotal, calculation.supplierPaymentTotal),
      supplierCreditTotal: addMoney(total.supplierCreditTotal, calculation.supplierCreditTotal),
      payableBalance: addMoney(total.payableBalance, calculation.payableBalance),
    }),
    {
      creditPurchaseReceivedTotal: '0.00',
      supplierPaymentTotal: '0.00',
      supplierCreditTotal: '0.00',
      payableBalance: '0.00',
    },
  );
}

function addMoney(left: string, right: string): string {
  return formatMoneyCents(parseMoneyCents(left) + parseMoneyCents(right));
}

function parseMoneyCents(value: string): bigint {
  const normalizedValue = value.trim();
  const isNegative = normalizedValue.startsWith('-');
  const unsignedValue = isNegative ? normalizedValue.slice(1) : normalizedValue;
  const [wholePart = '0', decimalPart = ''] = unsignedValue.split('.');
  const cents = BigInt(wholePart) * 100n + BigInt(decimalPart.padEnd(2, '0').slice(0, 2));

  return isNegative ? -cents : cents;
}

function formatMoneyCents(value: bigint): string {
  const isNegative = value < 0n;
  const absoluteValue = isNegative ? -value : value;
  const wholePart = absoluteValue / 100n;
  const decimalPart = absoluteValue % 100n;

  return `${isNegative ? '-' : ''}${wholePart.toString()}.${decimalPart.toString().padStart(2, '0')}`;
}
