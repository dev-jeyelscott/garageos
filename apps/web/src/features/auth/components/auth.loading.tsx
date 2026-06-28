import { Skeleton } from '../../../components/ui';
import { AuthPageShell, styles } from './auth.base';

export function AuthLoading() {
  return (
    <AuthPageShell title="Loading" description="Preparing the GarageOS auth experience.">
      <div className={styles.form} aria-busy="true" aria-live="polite">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    </AuthPageShell>
  );
}
