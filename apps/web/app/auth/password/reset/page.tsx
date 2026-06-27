import { Suspense } from 'react';

import { PageLoading } from '../../../../src/components/page-loading';
import { ResetPasswordScreen } from '../../../../src/features/auth/auth-screens';

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <ResetPasswordScreen />
    </Suspense>
  );
}
