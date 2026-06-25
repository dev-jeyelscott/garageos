import { describe, expect, it } from 'vitest';

import { API_ERROR_CODES } from '../api/api-error-code';
import { GarageOsApiException } from '../api/api-exception';
import {
  IF_MATCH_HEADER,
  LOCK_VERSION_FIELD,
  assertOptimisticUpdateSucceeded,
  assertValidLockVersion,
  didOptimisticUpdateSucceed,
  nextLockVersion,
  normalizeLockVersion,
} from './optimistic-locking';

describe('optimistic locking convention', () => {
  it('uses the documented lock version field and optional If-Match header name', () => {
    expect(LOCK_VERSION_FIELD).toBe('lock_version');
    expect(IF_MATCH_HEADER).toBe('If-Match');
  });

  it('accepts non-negative integer lock versions', () => {
    expect(normalizeLockVersion(0)).toBe(0);
    expect(normalizeLockVersion(1)).toBe(1);
    expect(() => assertValidLockVersion(25)).not.toThrow();
  });

  it('rejects invalid lock versions with validation_failed', () => {
    expectValidationFailed(() => normalizeLockVersion(undefined));
    expectValidationFailed(() => normalizeLockVersion('1'));
    expectValidationFailed(() => normalizeLockVersion(-1));
    expectValidationFailed(() => normalizeLockVersion(1.25));
    expectValidationFailed(() => normalizeLockVersion(Number.NaN));
  });

  it('increments the current lock version by one', () => {
    expect(nextLockVersion(0)).toBe(1);
    expect(nextLockVersion(7)).toBe(8);
  });

  it('treats exactly one updated row as a successful optimistic update', () => {
    expect(didOptimisticUpdateSucceed({ rowCount: 1 })).toBe(true);
  });

  it('treats zero or unknown updated rows as an optimistic locking conflict', () => {
    expect(didOptimisticUpdateSucceed({ rowCount: 0 })).toBe(false);
    expect(didOptimisticUpdateSucceed({ rowCount: null })).toBe(false);
  });

  it('throws version_conflict when no row was updated', () => {
    expectVersionConflict(() => assertOptimisticUpdateSucceeded({ rowCount: 0 }));
    expectVersionConflict(() => assertOptimisticUpdateSucceeded({ rowCount: null }));
  });
});

function expectValidationFailed(action: () => unknown): void {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(GarageOsApiException);
    expect((error as GarageOsApiException).code).toBe(API_ERROR_CODES.VALIDATION_FAILED);

    return;
  }

  throw new Error('Expected validation_failed exception.');
}

function expectVersionConflict(action: () => unknown): void {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(GarageOsApiException);
    expect((error as GarageOsApiException).code).toBe(API_ERROR_CODES.VERSION_CONFLICT);

    return;
  }

  throw new Error('Expected version_conflict exception.');
}
