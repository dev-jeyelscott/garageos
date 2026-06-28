import { Badge } from '../../../components/ui';
import type { AppShellSession } from '../types/app-shell-session';

export function BranchContextIndicator({ session }: { readonly session: AppShellSession }) {
  if (session.tenant_wide_branch_access) {
    return <Badge>All branches</Badge>;
  }

  if (session.branches.length === 1) {
    return <Badge>{session.branches[0]?.name}</Badge>;
  }

  if (session.branches.length > 1) {
    return <Badge>{session.branches.length} assigned branches</Badge>;
  }

  return <Badge>Branch access pending</Badge>;
}
