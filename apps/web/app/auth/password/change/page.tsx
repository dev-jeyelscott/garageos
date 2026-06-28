import { Suspense } from 'react';

import { AuthLoading } from '../../../../src/features/auth/components/auth.loading';
import { ChangePasswordScreen } from '../../../../src/features/auth/components/auth.server';

export default function ChangePasswordPage() {
  return (
    <Suspense fallback={<AuthLoading />}>
      <ChangePasswordScreen />
    </Suspense>
  );
}
