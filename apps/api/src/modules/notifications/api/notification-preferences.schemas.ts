import { z } from 'zod';

export const notificationTypeSchema = z.enum([
  'low_stock',
  'new_job_order',
  'assignment',
  'service_completion',
  'payment',
  'subscription_renewal_alert',
  'inventory_transfer_update',
  'purchase_receiving_update',
  'reminder_due_alert',
  'failed_reminder_delivery',
  'employee_deactivation',
  'role_permission_change',
]);

export const notificationChannelSchema = z.enum(['in_app', 'push', 'email', 'sms']);

export const notificationPreferenceRequestItemSchema = z.object({
  notification_type: notificationTypeSchema,
  channel: notificationChannelSchema,
  enabled: z.boolean(),
});

export const updateNotificationPreferencesRequestSchema = z
  .object({
    preferences: z.array(notificationPreferenceRequestItemSchema).max(48),
  })
  .superRefine((request, context) => {
    const seen = new Set<string>();

    for (const [index, preference] of request.preferences.entries()) {
      const key = `${preference.notification_type}:${preference.channel}`;

      if (seen.has(key)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Duplicate notification preference.',
          path: ['preferences', index],
        });
      }

      seen.add(key);
    }
  });

export type NotificationType = z.infer<typeof notificationTypeSchema>;
export type NotificationChannel = z.infer<typeof notificationChannelSchema>;
export type UpdateNotificationPreferencesRequest = z.infer<
  typeof updateNotificationPreferencesRequestSchema
>;
