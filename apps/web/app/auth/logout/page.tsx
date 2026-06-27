import { Suspense } from 'react';

import { PageLoading } from '../../../src/components/page-loading';
import { LogoutScreen } from '../../../src/features/auth/auth-screens';

export default function LogoutPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <LogoutScreen />
    </Suspense>
  );
}
