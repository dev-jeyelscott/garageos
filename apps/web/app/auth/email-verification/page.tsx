import { Suspense } from 'react';

import { PageLoading } from '../../../src/components/page-loading';
import { EmailVerificationRequiredScreen } from '../../../src/features/auth/auth-screens';

export default function EmailVerificationRequiredPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <EmailVerificationRequiredScreen />
    </Suspense>
  );
}
