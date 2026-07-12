export type PushNotificationInput = {
  readonly recipientId: string;
  readonly title: string;
  readonly body: string;
  readonly data?: Readonly<Record<string, string>>;
};

export type PushNotificationResult = {
  readonly providerMessageId: string;
};

/** Vendor-neutral boundary for internal push notification delivery. */
export abstract class PushProvider {
  abstract send(input: PushNotificationInput): Promise<PushNotificationResult>;
}
