import { Suspense } from 'react';

import { AuthLoading } from '../../../src/features/auth/components/auth.loading';
import { OwnerSignupScreen } from '../../../src/features/auth/components/auth.server';

export default function OwnerSignupPage() {
  return (
    <Suspense fallback={<AuthLoading />}>
      <OwnerSignupScreen />
    </Suspense>
  );
}
