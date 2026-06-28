import type { ApiClientError } from '../../../lib/api-envelope';

export type ActionStatus = 'idle' | 'submitting' | 'success' | 'error';

export interface ActionState {
  readonly status: ActionStatus;
  readonly message: string;
  readonly error: ApiClientError | null;
}

export const initialActionState: ActionState = {
  status: 'idle',
  message: '',
  error: null,
};
