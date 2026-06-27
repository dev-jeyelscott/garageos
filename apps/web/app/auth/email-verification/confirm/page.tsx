import { Suspense } from 'react';

import { PageLoading } from '../../../../src/components/page-loading';
import { EmailVerificationConfirmScreen } from '../../../../src/features/auth/auth-screens';

export default function EmailVerificationConfirmPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <EmailVerificationConfirmScreen />
    </Suspense>
  );
}
