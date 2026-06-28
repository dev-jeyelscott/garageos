import type { ReactNode } from 'react';

import { AuthGate } from '../../src/features/app-shell/components/auth-gate.server';

export const dynamic = 'force-dynamic';

export default function TenantLayout({ children }: { readonly children: ReactNode }) {
  return <AuthGate>{children}</AuthGate>;
}
