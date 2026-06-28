export const DEFAULT_DOCUMENT_NUMBER_TIMEZONE = 'Asia/Manila';

export function buildNextEstimateNumber(
  datePart: string,
  latestEstimateNumber: string | null,
): string {
  const nextSequence =
    latestEstimateNumber === null ? 1 : Number(latestEstimateNumber.slice(-6)) + 1;

  return `EST-${datePart}-${String(nextSequence).padStart(6, '0')}`;
}

export function buildNextJobOrderNumber(
  datePart: string,
  latestJobOrderNumber: string | null,
): string {
  const nextSequence =
    latestJobOrderNumber === null ? 1 : Number(latestJobOrderNumber.slice(-6)) + 1;

  return `JO-${datePart}-${String(nextSequence).padStart(6, '0')}`;
}

export function formatTenantBusinessDate(value: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone || DEFAULT_DOCUMENT_NUMBER_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (year === undefined || month === undefined || day === undefined) {
    return value.toISOString().slice(0, 10).replaceAll('-', '');
  }

  return `${year}${month}${day}`;
}
