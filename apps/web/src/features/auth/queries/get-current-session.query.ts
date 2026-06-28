import { getAccessTokenOrRefresh, getAuthJson } from '../actions/login.action';
import type { AuthSessionResponseData } from '../types/auth-session';

export async function getCurrentSession(): Promise<AuthSessionResponseData> {
  const accessToken = await getAccessTokenOrRefresh();

  return getAuthJson<AuthSessionResponseData>('/auth/session', {
    accessToken,
  });
}
