import { getCurrentSession } from '../../auth/queries/get-current-session.query';
import type { AppShellSession } from '../types/app-shell-session';

export async function getAppShellSession(): Promise<AppShellSession> {
  return getCurrentSession();
}
