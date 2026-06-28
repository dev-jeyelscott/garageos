import type { ReactNode } from 'react';

import { AuthGateClient } from './auth-gate.client';

export async function AuthGate({ children }: { readonly children: ReactNode }) {
  // Existing auth/session access is client-backed by the browser-held access token.
  // Keep this server entrypoint thin until the project has request-cookie session access.
  return <AuthGateClient>{children}</AuthGateClient>;
}
