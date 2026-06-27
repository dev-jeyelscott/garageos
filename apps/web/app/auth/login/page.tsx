import { Suspense } from 'react';

import { PageLoading } from '../../../src/components/page-loading';
import { LoginScreen } from '../../../src/features/auth/auth-screens';

export default function LoginPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <LoginScreen />
    </Suspense>
  );
}
