import { Suspense } from 'react';
import { OwnerSignupScreen } from '../../../src/features/auth/auth-screens';

export default function OwnerSignupPage() {
  return (
    <Suspense fallback={<OwnerSignupFallback />}>
      <OwnerSignupScreen />
    </Suspense>
  );
}

function OwnerSignupFallback() {
  return (
    <main style={{ padding: '32px 16px', fontFamily: 'system-ui, sans-serif' }}>
      <section style={{ maxWidth: '720px', margin: '0 auto' }}>
        <p>Loading page...</p>
      </section>
    </main>
  );
}
