'use client';

import { useEffect, useState } from 'react';

import { Alert } from '../../../components/ui';

export function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) {
    return null;
  }

  return (
    <Alert role="status">
      <p className="font-semibold">Offline read-only mode</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Reconnect before creating, editing, approving, uploading, changing settings, or recording
        payments. Writes are not queued for sync.
      </p>
    </Alert>
  );
}
