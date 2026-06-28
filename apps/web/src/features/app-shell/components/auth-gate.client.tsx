'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { getAppShellSession } from '../queries/get-app-shell-session.query';
import type { AppShellSession } from '../types/app-shell-session';
import { AppShellClient } from './app-shell.client';
import { AppShellLoading } from './app-shell.loading';

export function AuthGateClient({ children }: { readonly children: ReactNode }) {
  const [session, setSession] = useState<AppShellSession | null>(null);

  useEffect(() => {
    let isMounted = true;

    getAppShellSession()
      .then((nextSession) => {
        if (!isMounted) {
          return;
        }

        if (!nextSession.user.email_verified) {
          window.location.assign('/auth/email-verification');
          return;
        }

        setSession(nextSession);
      })
      .catch(() => {
        window.location.assign('/auth/login');
      });

    return () => {
      isMounted = false;
    };
  }, []);

  if (session === null) {
    return <AppShellLoading />;
  }

  return <AppShellClient session={session}>{children}</AppShellClient>;
}
