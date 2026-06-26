import { Suspense } from 'react';
import { EmailVerificationRequiredScreen } from '../../../src/features/auth/auth-screens';

export default function EmailVerificationRequiredPage() {
  return (
    <Suspense fallback={<EmailVerificationRequiredFallback />}>
      <EmailVerificationRequiredScreen />
    </Suspense>
  );
}

function EmailVerificationRequiredFallback() {
  return (
    <main style={{ padding: '32px 16px', fontFamily: 'system-ui, sans-serif' }}>
      <section style={{ maxWidth: '720px', margin: '0 auto' }}>
        <p>Loading page...</p>
      </section>
    </main>
  );
}
