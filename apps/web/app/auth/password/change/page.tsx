import { Suspense } from 'react';
import { ChangePasswordScreen } from '../../../../src/features/auth/auth-screens';

export default function ChangePasswordPage() {
  return (
    <Suspense fallback={<ChangePasswordFallback />}>
      <ChangePasswordScreen />
    </Suspense>
  );
}

function ChangePasswordFallback() {
  return (
    <main style={{ padding: '32px 16px', fontFamily: 'system-ui, sans-serif' }}>
      <section style={{ maxWidth: '720px', margin: '0 auto' }}>
        <p>Loading page...</p>
      </section>
    </main>
  );
}
