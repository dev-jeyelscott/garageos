import { describe, expect, it } from 'vitest';

import {
  SCHEDULER_RUNTIME_MODE,
  createSchedulerRuntimeConfig,
  createSchedulerStartupSnapshot,
} from './job-scheduler';

describe('scheduler runtime scaffold', () => {
  it('starts in observe-only mode with deferred capabilities documented', () => {
    const config = createSchedulerRuntimeConfig({
      GARAGEOS_SCHEDULER_ID: 'scheduler-platform-admin-test',
      GARAGEOS_SCHEDULER_HEARTBEAT_INTERVAL_MS: '15000',
    });

    expect(config).toEqual({
      serviceName: 'garageos-scheduler',
      runtimeMode: SCHEDULER_RUNTIME_MODE,
      schedulerId: 'scheduler-platform-admin-test',
      heartbeatIntervalMs: 15_000,
      deferredCapabilities: [
        'tenant lifecycle evaluation scheduling',
        'tenant deletion warning scheduling',
        'tenant hard deletion scheduling',
        'tenant export scheduling',
      ],
    });
  });

  it('creates a startup snapshot that explicitly does not enqueue or execute jobs', () => {
    const snapshot = createSchedulerStartupSnapshot(
      createSchedulerRuntimeConfig({
        GARAGEOS_SCHEDULER_ID: 'scheduler-platform-admin-test',
      }),
    );

    expect(snapshot).toMatchObject({
      service_name: 'garageos-scheduler',
      runtime_mode: 'observe_only',
      scheduler_id: 'scheduler-platform-admin-test',
      enqueues_jobs: false,
      executes_lifecycle_jobs: false,
      executes_tenant_exports: false,
      executes_hard_deletion: false,
      sends_warning_notifications: false,
    });
  });

  it('bounds heartbeat interval configuration for safer runtime behavior', () => {
    expect(
      createSchedulerRuntimeConfig({
        GARAGEOS_SCHEDULER_HEARTBEAT_INTERVAL_MS: '1',
      }).heartbeatIntervalMs,
    ).toBe(5_000);

    expect(
      createSchedulerRuntimeConfig({
        GARAGEOS_SCHEDULER_HEARTBEAT_INTERVAL_MS: '999999999',
      }).heartbeatIntervalMs,
    ).toBe(300_000);

    expect(
      createSchedulerRuntimeConfig({
        GARAGEOS_SCHEDULER_HEARTBEAT_INTERVAL_MS: 'not-a-number',
      }).heartbeatIntervalMs,
    ).toBe(60_000);
  });
});
