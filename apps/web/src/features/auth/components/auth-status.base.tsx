import {
  type ApiClientError,
  type ApiErrorDetail,
  isApiClientError,
} from '../../../lib/api-envelope';
import type { ActionState } from '../types/auth-action-state';
import { styles } from './auth.base';

export function StatusMessage({ state }: { readonly state: ActionState }) {
  if (state.status === 'idle') {
    return null;
  }

  if (state.status === 'error' && state.error !== null) {
    return (
      <section role="alert" className={styles.errorPanel}>
        <h2 className={styles.panelTitle}>{state.message}</h2>
        <p className={styles.paragraph}>
          {state.error.message} <strong>({state.error.code})</strong>
        </p>

        {state.error.details.length === 0 ? null : (
          <ul className={styles.detailList}>
            {state.error.details.map((detail, index) => (
              <li key={index}>{formatErrorDetail(detail)}</li>
            ))}
          </ul>
        )}

        <RequestMetadata error={state.error} />
      </section>
    );
  }

  return (
    <section
      role="status"
      className={state.status === 'success' ? styles.successPanel : styles.infoPanel}
    >
      <p className={styles.paragraph}>{state.message}</p>
    </section>
  );
}

export function toErrorState(error: unknown, fallbackMessage: string): ActionState {
  if (isApiClientError(error)) {
    return {
      status: 'error',
      message: fallbackMessage,
      error,
    };
  }

  return {
    status: 'error',
    message: fallbackMessage,
    error: {
      code: 'unexpected_client_error',
      message: error instanceof Error ? error.message : 'An unexpected client error occurred.',
      status: 0,
      details: [],
      requestId: null,
      correlationId: null,
    },
  };
}

function RequestMetadata({ error }: { readonly error: ApiClientError }) {
  if (error.requestId === null && error.correlationId === null) {
    return null;
  }

  return (
    <dl className={styles.metadataList}>
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

function formatErrorDetail(detail: ApiErrorDetail): string {
  if (typeof detail.message === 'string' && detail.message.length > 0) {
    return detail.field === undefined ? detail.message : `${detail.field}: ${detail.message}`;
  }

  const safeEntries = Object.entries(detail)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => `${key}: ${String(value)}`);

  return safeEntries.length === 0 ? 'Additional validation error.' : safeEntries.join(', ');
}
