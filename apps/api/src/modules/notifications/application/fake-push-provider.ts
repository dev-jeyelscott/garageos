import {
  PushProvider,
  type PushNotificationInput,
  type PushNotificationResult,
} from './push-provider';

export class FakePushProvider extends PushProvider {
  readonly sent: PushNotificationInput[] = [];

  async send(input: PushNotificationInput): Promise<PushNotificationResult> {
    this.sent.push(input);

    return {
      providerMessageId: `fake-push-${this.sent.length}`,
    };
  }
}
