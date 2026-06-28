import { Suspense } from 'react';

import { AuthLoading } from '../../../src/features/auth/components/auth.loading';
import { LogoutScreen } from '../../../src/features/auth/components/auth.server';

export default function LogoutPage() {
  return (
    <Suspense fallback={<AuthLoading />}>
      <LogoutScreen />
    </Suspense>
  );
}
