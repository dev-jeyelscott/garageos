import { Suspense } from 'react';

import { AuthLoading } from '../../../../src/features/auth/components/auth.loading';
import { EmailVerificationConfirmScreen } from '../../../../src/features/auth/components/auth.server';

export default function EmailVerificationConfirmPage() {
  return (
    <Suspense fallback={<AuthLoading />}>
      <EmailVerificationConfirmScreen />
    </Suspense>
  );
}
