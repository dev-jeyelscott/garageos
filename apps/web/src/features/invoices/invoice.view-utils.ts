export function formatDate(value: string | null): string | null {
  if (value === null || value.length === 0) {
    return null;
  }

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
  }).format(date);
}

export function formatDateTime(value: string | null): string {
  if (value === null || value.length === 0) {
    return '-';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function formatMoney(value: string | null): string | null {
  if (value === null || value.length === 0) {
    return null;
  }

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return value;
  }

  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(numericValue);
}

export function formatQuantity(value: string | null): string | null {
  if (value === null || value.length === 0) {
    return null;
  }

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return value;
  }

  return new Intl.NumberFormat('en-PH', {
    maximumFractionDigits: 3,
    minimumFractionDigits: 0,
  }).format(numericValue);
}

export function formatStatusLabel(status: string): string {
  return status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
