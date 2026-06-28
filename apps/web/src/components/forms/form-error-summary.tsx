import type { ApiClientError, ApiErrorDetail } from '../../lib/api-envelope';
import { Alert, cn } from '../ui';
import { RequestMetadata } from './request-metadata';

export function FormErrorSummary({
  error,
  title,
  className,
}: {
  readonly error: ApiClientError;
  readonly title: string;
  readonly className?: string;
}) {
  return (
    <Alert role="alert" variant="destructive" className={cn('mt-4', className)}>
      <h2 className="mb-2 text-base font-bold text-foreground">{title}</h2>
      <p className="mb-2 text-sm leading-6 text-muted-foreground">
        {error.message} <strong>({error.code})</strong>
      </p>

      {error.details.length === 0 ? null : (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {error.details.map((detail, index) => (
            <li key={index}>{formatErrorDetail(detail)}</li>
          ))}
        </ul>
      )}

      <RequestMetadata error={error} />
    </Alert>
  );
}

function formatErrorDetail(detail: ApiErrorDetail): string {
  if (typeof detail.message === 'string' && detail.message.length > 0) {
    return detail.field === undefined ? detail.message : `${detail.field}: ${detail.message}`;
  }

  const safeEntries = Object.entries(detail)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => `${key}: ${String(value)}`);

  return safeEntries.length === 0 ? 'Additional validation error.' : safeEntries.join(', ');
}
