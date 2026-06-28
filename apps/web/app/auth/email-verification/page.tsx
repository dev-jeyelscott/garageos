import { Suspense } from 'react';

import { AuthLoading } from '../../../src/features/auth/components/auth.loading';
import { EmailVerificationRequiredScreen } from '../../../src/features/auth/components/auth.server';

export default function EmailVerificationRequiredPage() {
  return (
    <Suspense fallback={<AuthLoading />}>
      <EmailVerificationRequiredScreen />
    </Suspense>
  );
}
