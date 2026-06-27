import { Suspense } from 'react';

import { PageLoading } from '../../../../src/components/page-loading';
import { ForgotPasswordScreen } from '../../../../src/features/auth/auth-screens';

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <ForgotPasswordScreen />
    </Suspense>
  );
}
