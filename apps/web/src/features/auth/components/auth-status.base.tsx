import { FormErrorSummary } from '../../../components/forms';
import { Alert } from '../../../components/ui';
import { type ApiClientError, isApiClientError } from '../../../lib/api-envelope';
import type { ActionState } from '../types/auth-action-state';
import { styles } from './auth.base';

export function StatusMessage({ state }: { readonly state: ActionState }) {
  if (state.status === 'idle') {
    return null;
  }

  if (state.status === 'error' && state.error !== null) {
    return <FormErrorSummary title={state.message} error={state.error} />;
  }

  return (
    <Alert
      role="status"
      variant={state.status === 'success' ? 'success' : 'default'}
      className={styles.infoPanel}
    >
      <p className={styles.paragraph}>{state.message}</p>
    </Alert>
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
