import { GarageOsApiException } from '../api/api-exception';

export const LOCK_VERSION_FIELD = 'lock_version';
export const IF_MATCH_HEADER = 'If-Match';

export interface OptimisticLockable {
  readonly lockVersion: number;
}

export interface OptimisticUpdateResult {
  readonly rowCount: number | null;
}

export function normalizeLockVersion(lockVersion: unknown, field = LOCK_VERSION_FIELD): number {
  if (typeof lockVersion !== 'number') {
    throwInvalidLockVersion(field);
  }

  assertValidLockVersion(lockVersion, field);

  return lockVersion;
}

export function assertValidLockVersion(lockVersion: number, field = LOCK_VERSION_FIELD): void {
  if (!Number.isSafeInteger(lockVersion) || lockVersion < 0) {
    throwInvalidLockVersion(field);
  }
}

export function nextLockVersion(currentLockVersion: number): number {
  assertValidLockVersion(currentLockVersion);

  return currentLockVersion + 1;
}

export function didOptimisticUpdateSucceed(result: OptimisticUpdateResult): boolean {
  return result.rowCount === 1;
}

export function assertOptimisticUpdateSucceeded(result: OptimisticUpdateResult): void {
  if (!didOptimisticUpdateSucceed(result)) {
    throw GarageOsApiException.versionConflict();
  }
}

function throwInvalidLockVersion(field: string): never {
  throw GarageOsApiException.validationFailed([
    {
      field,
      code: 'invalid_lock_version',
      message: 'lock_version must be a non-negative integer.',
    },
  ]);
}
