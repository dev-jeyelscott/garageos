import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../../components/ui';

import type { PlatformAuditLogListItem } from '../platform-audit-log.types';
import { PlatformAuditLogMobileCard } from './platform-audit-log-mobile-card';

export function PlatformAuditLogResults({
  auditLogs,
}: {
  readonly auditLogs: readonly PlatformAuditLogListItem[];
}) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 lg:hidden">
        {auditLogs.map((auditLog) => (
          <PlatformAuditLogMobileCard key={auditLog.id} auditLog={auditLog} />
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-2xl border border-border bg-card lg:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/70 hover:bg-muted/70">
              <TableHead>Action</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Tenant</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {auditLogs.map((auditLog) => (
              <TableRow key={auditLog.id}>
                <TableCell>
                  <p className="font-bold text-foreground">{auditLog.action}</p>
                  <p className="mt-1 text-xs text-muted-foreground">ID: {auditLog.id}</p>
                </TableCell>

                <TableCell className="text-muted-foreground">
                  {auditLog.platform_admin_user_id ?? 'System / not returned'}
                </TableCell>

                <TableCell className="text-muted-foreground">
                  {auditLog.tenant_id ?? 'Platform-level'}
                </TableCell>

                <TableCell className="text-muted-foreground">
                  {auditLog.entity_type}
                  {auditLog.entity_id === null ? '' : ` · ${auditLog.entity_id}`}
                </TableCell>

                <TableCell className="text-muted-foreground">{auditLog.created_at}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
