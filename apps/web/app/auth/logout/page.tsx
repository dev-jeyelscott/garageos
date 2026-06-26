import { Suspense } from 'react';
import { LogoutScreen } from '../../../src/features/auth/auth-screens';

export default function LogoutPage() {
  return (
    <Suspense fallback={<LogoutFallback />}>
      <LogoutScreen />
    </Suspense>
  );
}

function LogoutFallback() {
  return (
    <main style={{ padding: '32px 16px', fontFamily: 'system-ui, sans-serif' }}>
      <section style={{ maxWidth: '720px', margin: '0 auto' }}>
        <p>Loading page...</p>
      </section>
    </main>
  );
}
