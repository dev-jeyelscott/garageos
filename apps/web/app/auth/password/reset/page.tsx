import { Suspense } from 'react';

import { AuthLoading } from '../../../../src/features/auth/components/auth.loading';
import { ResetPasswordScreen } from '../../../../src/features/auth/components/auth.server';

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<AuthLoading />}>
      <ResetPasswordScreen />
    </Suspense>
  );
}
