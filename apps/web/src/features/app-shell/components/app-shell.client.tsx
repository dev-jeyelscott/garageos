'use client';

import type { ReactNode } from 'react';

import type { AppShellSession } from '../types/app-shell-session';
import { AppShellBase } from './app-shell.base';

export function AppShellClient({
  children,
  session,
}: {
  readonly children: ReactNode;
  readonly session: AppShellSession;
}) {
  return <AppShellBase session={session}>{children}</AppShellBase>;
}
