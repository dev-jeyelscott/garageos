import { describe, expect, it } from 'vitest';

import { hashIdempotencyKey, hashRequestIntent } from './idempotency-hash';

describe('idempotency hashing', () => {
  it('hashes idempotency keys without exposing the plaintext key', () => {
    const hash = hashIdempotencyKey('payment-01HZR3EGHDZCZ6S7M2F7VX48NK');

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain('payment');
    expect(hash).not.toContain('01HZR3EGHDZCZ6S7M2F7VX48NK');
  });

  it('produces a stable request-intent hash regardless of object key order', () => {
    const firstHash = hashRequestIntent({
      method: 'post',
      route: '/api/v1/invoices/inv_123/payments',
      body: {
        amount: '1000.00',
        payment_method: 'cash',
      },
    });

    const secondHash = hashRequestIntent({
      method: 'POST',
      route: '/api/v1/invoices/inv_123/payments',
      body: {
        payment_method: 'cash',
        amount: '1000.00',
      },
    });

    expect(firstHash).toBe(secondHash);
  });

  it('changes the request-intent hash when the request intent changes', () => {
    const originalHash = hashRequestIntent({
      method: 'POST',
      route: '/api/v1/invoices/inv_123/payments',
      body: {
        amount: '1000.00',
        payment_method: 'cash',
      },
    });

    const changedHash = hashRequestIntent({
      method: 'POST',
      route: '/api/v1/invoices/inv_123/payments',
      body: {
        amount: '1500.00',
        payment_method: 'cash',
      },
    });

    expect(changedHash).not.toBe(originalHash);
  });
});
