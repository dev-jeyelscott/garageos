import { Suspense } from 'react';

import { AuthLoading } from '../../../src/features/auth/components/auth.loading';
import { LoginScreen } from '../../../src/features/auth/components/auth.server';

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthLoading />}>
      <LoginScreen />
    </Suspense>
  );
}
