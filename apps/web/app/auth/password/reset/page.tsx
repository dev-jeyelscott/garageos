import { Suspense } from 'react';

import { ResetPasswordScreen } from '../../../../src/features/auth/auth-screens';

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetPasswordFallback />}>
      <ResetPasswordScreen />
    </Suspense>
  );
}

function ResetPasswordFallback() {
  return (
    <main style={{ padding: '32px 16px', fontFamily: 'system-ui, sans-serif' }}>
      <section style={{ maxWidth: '720px', margin: '0 auto' }}>
        <p>Loading page...</p>
      </section>
    </main>
  );
}
