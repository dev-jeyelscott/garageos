import { describe, expect, it } from 'vitest';

import { FakePushProvider } from './fake-push-provider';

describe('FakePushProvider', () => {
  it('records a push request and returns a stable provider message id', async () => {
    const provider = new FakePushProvider();

    await expect(
      provider.send({
        recipientId: 'user-1',
        title: 'Service reminder',
        body: 'Your motorcycle service is due.',
        data: { reminderId: 'reminder-1' },
      }),
    ).resolves.toEqual({ providerMessageId: 'fake-push-1' });

    expect(provider.sent).toEqual([
      {
        recipientId: 'user-1',
        title: 'Service reminder',
        body: 'Your motorcycle service is due.',
        data: { reminderId: 'reminder-1' },
      },
    ]);
  });
});
