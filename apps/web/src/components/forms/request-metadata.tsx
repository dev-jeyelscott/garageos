import type { ApiClientError } from '../../lib/api-envelope';
import { cn } from '../ui';

export function RequestMetadata({
  error,
  className,
}: {
  readonly error: Pick<ApiClientError, 'requestId' | 'correlationId'>;
  readonly className?: string;
}) {
  if (error.requestId === null && error.correlationId === null) {
    return null;
  }

  return (
    <dl
      className={cn(
        'mt-3 grid grid-cols-[120px_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground',
        className,
      )}
    >
      {error.requestId === null ? null : (
        <>
          <dt>Request ID</dt>
          <dd>{error.requestId}</dd>
        </>
      )}
      {error.correlationId === null ? null : (
        <>
          <dt>Correlation ID</dt>
          <dd>{error.correlationId}</dd>
        </>
      )}
    </dl>
  );
}
