import { Badge } from '../../../../components/ui';

import type { PlatformAuditLogListItem } from '../platform-audit-log.types';

export function PlatformAuditLogMobileCard({
  auditLog,
}: {
  readonly auditLog: PlatformAuditLogListItem;
}) {
  return (
    <article className="grid gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{auditLog.entity_type}</Badge>
        <Badge variant="info">Platform audit</Badge>
      </div>

      <div>
        <h2 className="break-words font-bold text-foreground">{auditLog.action}</h2>
        <p className="mt-1 break-words text-sm text-muted-foreground">{auditLog.created_at}</p>
      </div>

      <dl className="grid gap-3 rounded-2xl border border-border bg-muted/40 p-3 text-sm">
        <div>
          <dt className="font-bold text-foreground">Actor admin</dt>
          <dd className="mt-1 break-words text-muted-foreground">
            {auditLog.platform_admin_user_id ?? 'System / not returned'}
          </dd>
        </div>

        <div>
          <dt className="font-bold text-foreground">Tenant</dt>
          <dd className="mt-1 break-words text-muted-foreground">
            {auditLog.tenant_id ?? 'Platform-level'}
          </dd>
        </div>

        <div>
          <dt className="font-bold text-foreground">Entity</dt>
          <dd className="mt-1 break-words text-muted-foreground">
            {auditLog.entity_type}
            {auditLog.entity_id === null ? '' : ` · ${auditLog.entity_id}`}
          </dd>
        </div>
      </dl>
    </article>
  );
}
