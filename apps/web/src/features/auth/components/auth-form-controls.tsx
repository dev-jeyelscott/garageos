'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

import {
  type ApiClientError,
  type ApiErrorDetail,
  isApiClientError,
} from '../../../lib/api-envelope';
import { styles } from './auth-page-shell';

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

export function InputField({
  label,
  name,
  type,
  required = false,
  autoComplete,
  defaultValue,
}: {
  readonly label: string;
  readonly name: string;
  readonly type: string;
  readonly required?: boolean;
  readonly autoComplete?: string;
  readonly defaultValue?: string;
}) {
  return (
    <label style={styles.field}>
      <span style={styles.label}>{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        style={styles.input}
      />
    </label>
  );
}

export function PasswordPolicy() {
  return (
    <div style={styles.helpPanel}>
      <p style={styles.helpTitle}>Password rules</p>
      <ul style={styles.helpList}>
        <li>At least 8 characters</li>
        <li>At least 1 uppercase letter</li>
        <li>At least 1 lowercase letter</li>
        <li>At least 1 number</li>
      </ul>
    </div>
  );
}

export function PrimaryButton({
  disabled,
  children,
}: {
  readonly disabled: boolean;
  readonly children: ReactNode;
}) {
  return (
    <button type="submit" disabled={disabled} style={styles.primaryButton}>
      {children}
    </button>
  );
}

export function AuthLink({
  href,
  children,
}: {
  readonly href: string;
  readonly children: ReactNode;
}) {
  return (
    <Link href={href} style={styles.link}>
      {children}
    </Link>
  );
}

export function InfoPanel({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section style={styles.infoPanel}>
      <h2 style={styles.panelTitle}>{title}</h2>
      {children}
    </section>
  );
}

export function StatusMessage({ state }: { readonly state: ActionState }) {
  if (state.status === 'idle') {
    return null;
  }

  if (state.status === 'error' && state.error !== null) {
    return (
      <section role="alert" style={styles.errorPanel}>
        <h2 style={styles.panelTitle}>{state.message}</h2>
        <p style={styles.paragraph}>
          {state.error.message} <strong>({state.error.code})</strong>
        </p>

        {state.error.details.length === 0 ? null : (
          <ul style={styles.detailList}>
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
      style={state.status === 'success' ? styles.successPanel : styles.infoPanel}
    >
      <p style={styles.paragraph}>{state.message}</p>
    </section>
  );
}

export function getFormValue(formData: FormData, key: string): string {
  const value = formData.get(key);

  return typeof value === 'string' ? value.trim() : '';
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
    <dl style={styles.metadataList}>
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
