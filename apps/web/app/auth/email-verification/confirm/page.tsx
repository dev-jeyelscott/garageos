import { Suspense } from 'react';

import { EmailVerificationConfirmScreen } from '../../../../src/features/auth/auth-screens';

export default function EmailVerificationConfirmPage() {
  return (
    <Suspense fallback={<EmailVerificationConfirmFallback />}>
      <EmailVerificationConfirmScreen />
    </Suspense>
  );
}

function EmailVerificationConfirmFallback() {
  return (
    <main style={{ padding: '32px 16px', fontFamily: 'system-ui, sans-serif' }}>
      <section style={{ maxWidth: '720px', margin: '0 auto' }}>
        <p>Loading page...</p>
      </section>
    </main>
  );
}
