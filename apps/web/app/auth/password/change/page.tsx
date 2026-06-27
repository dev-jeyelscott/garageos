import { Suspense } from 'react';

import { PageLoading } from '../../../../src/components/page-loading';
import { ChangePasswordScreen } from '../../../../src/features/auth/auth-screens';

export default function ChangePasswordPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <ChangePasswordScreen />
    </Suspense>
  );
}
