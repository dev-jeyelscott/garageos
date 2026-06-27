import { Suspense } from 'react';

import { PageLoading } from '../../../src/components/page-loading';
import { OwnerSignupScreen } from '../../../src/features/auth/auth-screens';

export default function OwnerSignupPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <OwnerSignupScreen />
    </Suspense>
  );
}
