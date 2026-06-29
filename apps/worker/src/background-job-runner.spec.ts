import { describe, expect, it } from 'vitest';

import {
  WORKER_RUNTIME_MODE,
  createWorkerRuntimeConfig,
  createWorkerStartupSnapshot,
} from './background-job-runner';

describe('worker runtime scaffold', () => {
  it('starts in observe-only mode with known queued job types documented', () => {
    const config = createWorkerRuntimeConfig({
      GARAGEOS_WORKER_ID: 'worker-platform-admin-test',
      GARAGEOS_WORKER_HEARTBEAT_INTERVAL_MS: '15000',
    });

    expect(config).toEqual({
      serviceName: 'garageos-worker',
      runtimeMode: WORKER_RUNTIME_MODE,
      workerId: 'worker-platform-admin-test',
      heartbeatIntervalMs: 15_000,
      knownQueuedJobTypes: ['tenant_export.generate'],
      deferredCapabilities: [
        'tenant lifecycle job execution',
        'tenant export generation',
        'tenant hard deletion execution',
        'tenant deletion warning notification delivery',
      ],
    });
  });

  it('creates a startup snapshot that explicitly does not claim or execute jobs', () => {
    const snapshot = createWorkerStartupSnapshot(
      createWorkerRuntimeConfig({
        GARAGEOS_WORKER_ID: 'worker-platform-admin-test',
      }),
    );

    expect(snapshot).toMatchObject({
      service_name: 'garageos-worker',
      runtime_mode: 'observe_only',
      worker_id: 'worker-platform-admin-test',
      known_queued_job_types: ['tenant_export.generate'],
      claims_jobs: false,
      executes_jobs: false,
    });
  });

  it('bounds heartbeat interval configuration for safer runtime behavior', () => {
    expect(
      createWorkerRuntimeConfig({
        GARAGEOS_WORKER_HEARTBEAT_INTERVAL_MS: '1',
      }).heartbeatIntervalMs,
    ).toBe(5_000);

    expect(
      createWorkerRuntimeConfig({
        GARAGEOS_WORKER_HEARTBEAT_INTERVAL_MS: '999999999',
      }).heartbeatIntervalMs,
    ).toBe(300_000);

    expect(
      createWorkerRuntimeConfig({
        GARAGEOS_WORKER_HEARTBEAT_INTERVAL_MS: 'not-a-number',
      }).heartbeatIntervalMs,
    ).toBe(60_000);
  });
});
