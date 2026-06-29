const DEFAULT_HEARTBEAT_INTERVAL_MS = 60_000;
const MIN_HEARTBEAT_INTERVAL_MS = 5_000;
const MAX_HEARTBEAT_INTERVAL_MS = 300_000;

export const SCHEDULER_RUNTIME_MODE = 'observe_only' as const;

export const SCHEDULER_DEFERRED_CAPABILITIES = [
  'tenant lifecycle evaluation scheduling',
  'tenant deletion warning scheduling',
  'tenant hard deletion scheduling',
  'tenant export scheduling',
] as const;

export type SchedulerRuntimeMode = typeof SCHEDULER_RUNTIME_MODE;

export interface SchedulerRuntimeConfig {
  readonly serviceName: 'garageos-scheduler';
  readonly runtimeMode: SchedulerRuntimeMode;
  readonly schedulerId: string;
  readonly heartbeatIntervalMs: number;
  readonly deferredCapabilities: readonly string[];
}

export interface SchedulerStartupSnapshot {
  readonly service_name: string;
  readonly runtime_mode: SchedulerRuntimeMode;
  readonly scheduler_id: string;
  readonly heartbeat_interval_ms: number;
  readonly deferred_capabilities: readonly string[];
  readonly enqueues_jobs: false;
  readonly executes_lifecycle_jobs: false;
  readonly executes_tenant_exports: false;
  readonly executes_hard_deletion: false;
  readonly sends_warning_notifications: false;
}

type RuntimeEnv = Readonly<Record<string, string | undefined>>;

export function createSchedulerRuntimeConfig(
  env: RuntimeEnv = process.env,
): SchedulerRuntimeConfig {
  return {
    serviceName: 'garageos-scheduler',
    runtimeMode: SCHEDULER_RUNTIME_MODE,
    schedulerId:
      normalizeOptionalText(env['GARAGEOS_SCHEDULER_ID']) ?? `garageos-scheduler-${process.pid}`,
    heartbeatIntervalMs: parseBoundedInteger({
      value: env['GARAGEOS_SCHEDULER_HEARTBEAT_INTERVAL_MS'],
      fallback: DEFAULT_HEARTBEAT_INTERVAL_MS,
      minimum: MIN_HEARTBEAT_INTERVAL_MS,
      maximum: MAX_HEARTBEAT_INTERVAL_MS,
    }),
    deferredCapabilities: SCHEDULER_DEFERRED_CAPABILITIES,
  };
}

export function createSchedulerStartupSnapshot(
  config: SchedulerRuntimeConfig,
): SchedulerStartupSnapshot {
  return {
    service_name: config.serviceName,
    runtime_mode: config.runtimeMode,
    scheduler_id: config.schedulerId,
    heartbeat_interval_ms: config.heartbeatIntervalMs,
    deferred_capabilities: config.deferredCapabilities,
    enqueues_jobs: false,
    executes_lifecycle_jobs: false,
    executes_tenant_exports: false,
    executes_hard_deletion: false,
    sends_warning_notifications: false,
  };
}

function normalizeOptionalText(value: string | undefined): string | null {
  const normalized = value?.trim();

  return normalized === undefined || normalized.length === 0 ? null : normalized;
}

function parseBoundedInteger(input: {
  readonly value: string | undefined;
  readonly fallback: number;
  readonly minimum: number;
  readonly maximum: number;
}): number {
  if (input.value === undefined) {
    return input.fallback;
  }

  const parsed = Number.parseInt(input.value, 10);

  if (!Number.isInteger(parsed)) {
    return input.fallback;
  }

  if (parsed < input.minimum) {
    return input.minimum;
  }

  if (parsed > input.maximum) {
    return input.maximum;
  }

  return parsed;
}
