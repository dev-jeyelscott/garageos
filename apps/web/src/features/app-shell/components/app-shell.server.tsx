import type { ReactNode } from 'react';

import { getAppShellSession } from '../queries/get-app-shell-session.query';
import { AppShellClient } from './app-shell.client';

export async function AppShell({ children }: { readonly children: ReactNode }) {
  const session = await getAppShellSession();

  return <AppShellClient session={session}>{children}</AppShellClient>;
}
