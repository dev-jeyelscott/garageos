import { Suspense } from 'react';

import { AuthLoading } from '../../../../src/features/auth/components/auth.loading';
import { ForgotPasswordScreen } from '../../../../src/features/auth/components/auth.server';

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<AuthLoading />}>
      <ForgotPasswordScreen />
    </Suspense>
  );
}
