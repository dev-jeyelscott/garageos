import { Inject, Injectable } from '@nestjs/common';

import {
  API_DATABASE_CLIENT,
  type DatabaseQueryClient,
  type DatabaseRow,
} from '../../../shared/database/database-client';
import {
  InAppNotificationStore,
  type InAppNotificationRecord,
} from '../application/in-app-notification.store';

interface NotificationRow extends DatabaseRow {
  readonly id: string;
  readonly type: InAppNotificationRecord['type'];
  readonly title: string;
  readonly body: string;
  readonly read_at: Date | string | null;
  readonly dismissed_at: Date | string | null;
  readonly created_at: Date | string;
}

@Injectable()
export class PostgresInAppNotificationRepository extends InAppNotificationStore {
  constructor(@Inject(API_DATABASE_CLIENT) private readonly database: DatabaseQueryClient) {
    super();
  }

  async isActiveShopOwner(input: { tenantId: string; userId: string }): Promise<boolean> {
    const result = await this.database.query<{ value: boolean }>(
      `select exists (select 1 from user_roles ur inner join roles r on r.tenant_id = ur.tenant_id and r.id = ur.role_id and r.status = 'active' and r.role_type = 'shop_owner' where ur.tenant_id = $1 and ur.user_id = $2 and ur.removed_at is null) as value`,
      [input.tenantId, input.userId],
    );
    return result.rows[0]?.value ?? false;
  }

  async listForUser(tenantId: string, userId: string, client = this.database) {
    const result = await client.query<NotificationRow>(
      `select id, type, title, body, read_at, dismissed_at, created_at
       from in_app_notifications
       where tenant_id = $1 and user_id = $2 and dismissed_at is null
       order by created_at desc, id desc
       limit 100`,
      [tenantId, userId],
    );
    return result.rows.map(mapRow);
  }

  markRead(tenantId: string, userId: string, notificationId: string, client = this.database) {
    return this.update(tenantId, userId, notificationId, 'read_at', client);
  }

  dismiss(tenantId: string, userId: string, notificationId: string, client = this.database) {
    return this.update(tenantId, userId, notificationId, 'dismissed_at', client);
  }

  private async update(
    tenantId: string,
    userId: string,
    notificationId: string,
    column: 'read_at' | 'dismissed_at',
    client: DatabaseQueryClient,
  ): Promise<InAppNotificationRecord | null> {
    const result = await client.query<NotificationRow>(
      `update in_app_notifications set ${column} = coalesce(${column}, now())
       where tenant_id = $1 and user_id = $2 and id = $3
       returning id, type, title, body, read_at, dismissed_at, created_at`,
      [tenantId, userId, notificationId],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }
}

function mapRow(row: NotificationRow): InAppNotificationRecord {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    readAt: row.read_at instanceof Date ? row.read_at : row.read_at ? new Date(row.read_at) : null,
    dismissedAt:
      row.dismissed_at instanceof Date
        ? row.dismissed_at
        : row.dismissed_at
          ? new Date(row.dismissed_at)
          : null,
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
  };
}
