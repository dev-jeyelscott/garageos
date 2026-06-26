import { Suspense } from 'react';
import { ForgotPasswordScreen } from '../../../../src/features/auth/auth-screens';

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<ForgotPasswordFallback />}>
      <ForgotPasswordScreen />
    </Suspense>
  );
}

function ForgotPasswordFallback() {
  return (
    <main style={{ padding: '32px 16px', fontFamily: 'system-ui, sans-serif' }}>
      <section style={{ maxWidth: '720px', margin: '0 auto' }}>
        <p>Loading page...</p>
      </section>
    </main>
  );
}
