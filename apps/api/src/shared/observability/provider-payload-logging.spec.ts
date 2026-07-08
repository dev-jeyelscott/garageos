import { describe, expect, it, vi } from 'vitest';

import {
  REDACTED_PROVIDER_LOG_VALUE,
  createProviderPayloadLogEntry,
  isProviderLogRedactedField,
  logSanitizedProviderPayload,
  sanitizeProviderLogPayload,
  type ProviderPayloadLogger,
} from './provider-payload-logging';

describe('provider payload logging', () => {
  it('detects provider-sensitive fields across common field naming styles', () => {
    expect(isProviderLogRedactedField('authorization')).toBe(true);
    expect(isProviderLogRedactedField('x-provider-signature')).toBe(true);
    expect(isProviderLogRedactedField('apiKey')).toBe(true);
    expect(isProviderLogRedactedField('signed.url')).toBe(true);
    expect(isProviderLogRedactedField('phoneNumber')).toBe(true);
    expect(isProviderLogRedactedField('external_message_id')).toBe(false);
    expect(isProviderLogRedactedField('status')).toBe(false);
  });

  it('sanitizes provider payloads without removing safe operational context', () => {
    const payload = {
      provider_event_id: 'evt_123',
      external_message_id: 'msg_123',
      status: 'delivered',
      delivered_at: new Date('2026-07-08T08:30:00.000Z'),
      to: 'customer@example.test',
      phoneNumber: '+639171234567',
      subject: 'Service reminder',
      body: 'Your motorcycle is due for service.',
      authorization: 'Bearer provider-token',
      nested: {
        provider_secret: 'secret-value',
        retry_after_seconds: 60,
      },
      attempts: [
        {
          signature: 'signed-payload',
          status: 'retryable_failure',
        },
      ],
    };

    expect(sanitizeProviderLogPayload(payload)).toEqual({
      provider_event_id: 'evt_123',
      external_message_id: 'msg_123',
      status: 'delivered',
      delivered_at: '2026-07-08T08:30:00.000Z',
      to: REDACTED_PROVIDER_LOG_VALUE,
      phoneNumber: REDACTED_PROVIDER_LOG_VALUE,
      subject: REDACTED_PROVIDER_LOG_VALUE,
      body: REDACTED_PROVIDER_LOG_VALUE,
      authorization: REDACTED_PROVIDER_LOG_VALUE,
      nested: {
        provider_secret: REDACTED_PROVIDER_LOG_VALUE,
        retry_after_seconds: 60,
      },
      attempts: [
        {
          signature: REDACTED_PROVIDER_LOG_VALUE,
          status: 'retryable_failure',
        },
      ],
    });
  });

  it('creates a structured log entry with normalized identifiers and sanitized payload', () => {
    expect(
      createProviderPayloadLogEntry({
        event: ' provider.delivery.received ',
        provider: ' sandbox_email ',
        channel: ' email ',
        direction: 'inbound',
        correlationId: ' corr_123 ',
        requestId: '',
        tenantId: ' tenant_123 ',
        actorUserId: null,
        jobId: ' job_123 ',
        deliveryAttemptId: ' attempt_123 ',
        errorCode: ' provider_rejected ',
        payload: {
          status: 'failed',
          recipient: 'customer@example.test',
          token: 'provider-token',
        },
      }),
    ).toEqual({
      event: 'provider.delivery.received',
      provider: 'sandbox_email',
      channel: 'email',
      direction: 'inbound',
      correlation_id: 'corr_123',
      tenant_id: 'tenant_123',
      job_id: 'job_123',
      delivery_attempt_id: 'attempt_123',
      error_code: 'provider_rejected',
      payload: {
        status: 'failed',
        recipient: REDACTED_PROVIDER_LOG_VALUE,
        token: REDACTED_PROVIDER_LOG_VALUE,
      },
    });
  });

  it('writes sanitized structured JSON to the selected logger level', () => {
    const logger: ProviderPayloadLogger = {
      debug: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const entry = logSanitizedProviderPayload({
      logger,
      level: 'warn',
      event: 'provider.delivery.failed',
      provider: 'sandbox_sms',
      channel: 'sms',
      direction: 'outbound',
      payload: {
        status: 'failed',
        phone: '+639171234567',
        provider_token: 'provider-token',
      },
    });

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(JSON.stringify(entry));
    expect(JSON.stringify(entry)).not.toContain('+639171234567');
    expect(JSON.stringify(entry)).not.toContain('provider-token');
  });
});
