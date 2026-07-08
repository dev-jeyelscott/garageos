import { Inject, Injectable } from '@nestjs/common';

import {
  API_DATABASE_CLIENT,
  type DatabaseQueryClient,
  type DatabaseRow,
} from '../../../shared/database/database-client';
import type { NotificationChannel } from '../../reminders/domain/reminder-rules';
import {
  NotificationPreferenceStore,
  type NotificationPreferenceRecord,
  type ReplaceNotificationPreferencesInput,
} from '../application/notification-preference.store';

interface BooleanRow extends DatabaseRow {
  readonly value: boolean;
}

interface PlanLimitRow extends DatabaseRow {
  readonly capability_code: string;
  readonly value_type: string;
  readonly numeric_value: number | string | null;
  readonly boolean_value: boolean | null;
}

interface NotificationPreferenceRow extends DatabaseRow {
  readonly notification_type: NotificationPreferenceRecord['notificationType'];
  readonly channel: NotificationChannel;
  readonly enabled: boolean;
  readonly updated_at: Date | string;
}

@Injectable()
export class PostgresNotificationPreferenceRepository extends NotificationPreferenceStore {
  constructor(
    @Inject(API_DATABASE_CLIENT)
    private readonly database: DatabaseQueryClient,
  ) {
    super();
  }

  async isActiveShopOwner(input: {
    readonly tenantId: string;
    readonly userId: string;
  }): Promise<boolean> {
    const result = await this.database.query<BooleanRow>(
      `
        select exists (
          select 1
          from user_roles ur
          inner join roles r
            on r.tenant_id = ur.tenant_id
           and r.id = ur.role_id
           and r.status = 'active'
           and r.role_type = 'shop_owner'
          where ur.tenant_id = $1
            and ur.user_id = $2
            and ur.removed_at is null
        ) as value
      `,
      [input.tenantId, input.userId],
    );

    return result.rows[0]?.value ?? false;
  }

  async getEffectivePlanChannelLimits(
    tenantId: string,
    client: DatabaseQueryClient = this.database,
  ): Promise<Record<string, boolean | number | string | null>> {
    const result = await client.query<PlanLimitRow>(
      `
        with active_subscription as (
          select plan_id
          from tenant_subscriptions
          where tenant_id = $1
          limit 1
        ),
        plan_limits as (
          select
            spl.capability_code,
            spl.value_type,
            spl.numeric_value,
            spl.boolean_value
          from subscription_plan_limits spl
          inner join active_subscription sub
            on sub.plan_id = spl.plan_id
        ),
        active_overrides as (
          select distinct on (capability_code)
            capability_code,
            override_value_json
          from tenant_plan_overrides
          where tenant_id = $1
            and (expires_at is null or expires_at > now())
          order by capability_code, effective_at desc, created_at desc
        )
        select
          pl.capability_code,
          pl.value_type,
          case
            when ao.override_value_json ? 'numeric_value'
              then nullif(ao.override_value_json ->> 'numeric_value', '')::numeric
            when ao.override_value_json ? 'value' and pl.value_type = 'numeric'
              then nullif(ao.override_value_json ->> 'value', '')::numeric
            else pl.numeric_value
          end as numeric_value,
          case
            when ao.override_value_json ? 'boolean_value'
              then (ao.override_value_json ->> 'boolean_value')::boolean
            when ao.override_value_json ? 'value' and pl.value_type = 'boolean'
              then (ao.override_value_json ->> 'value')::boolean
            else pl.boolean_value
          end as boolean_value
        from plan_limits pl
        left join active_overrides ao
          on ao.capability_code = pl.capability_code
        where pl.capability_code in (
          'in_app_notifications',
          'push_notifications',
          'email_notifications',
          'sms_notifications'
        )
        order by pl.capability_code asc
      `,
      [tenantId],
    );

    const limits: Record<string, boolean | number | string | null> = {};

    for (const row of result.rows) {
      limits[row.capability_code] = mapPlanLimitValue(row);
    }

    return limits;
  }

  async listForUser(
    tenantId: string,
    userId: string,
    client: DatabaseQueryClient = this.database,
  ): Promise<readonly NotificationPreferenceRecord[]> {
    const result = await client.query<NotificationPreferenceRow>(
      `
        select notification_type, channel, enabled, updated_at
        from user_notification_preferences
        where tenant_id = $1
          and user_id = $2
        order by notification_type asc, channel asc
      `,
      [tenantId, userId],
    );

    return result.rows.map(mapNotificationPreferenceRow);
  }

  async replaceForUser(
    input: ReplaceNotificationPreferencesInput,
    client: DatabaseQueryClient,
  ): Promise<readonly NotificationPreferenceRecord[]> {
    await client.query(
      `
        delete from user_notification_preferences
        where tenant_id = $1
          and user_id = $2
      `,
      [input.tenantId, input.userId],
    );

    for (const preference of input.preferences) {
      await client.query(
        `
          insert into user_notification_preferences (
            tenant_id,
            user_id,
            notification_type,
            channel,
            enabled,
            created_at,
            updated_at
          )
          values ($1, $2, $3, $4, $5, $6, $6)
        `,
        [
          input.tenantId,
          input.userId,
          preference.notificationType,
          preference.channel,
          preference.enabled,
          input.updatedAt,
        ],
      );
    }

    return this.listForUser(input.tenantId, input.userId, client);
  }
}

function mapNotificationPreferenceRow(
  row: NotificationPreferenceRow,
): NotificationPreferenceRecord {
  return {
    notificationType: row.notification_type,
    channel: row.channel,
    enabled: row.enabled,
    updatedAt: row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at),
  };
}

function mapPlanLimitValue(row: PlanLimitRow): boolean | number | string | null {
  switch (row.value_type) {
    case 'boolean':
      return row.boolean_value ?? false;
    case 'numeric':
      return row.numeric_value === null ? null : Number(row.numeric_value);
    default:
      return row.boolean_value ?? row.numeric_value ?? null;
  }
}
