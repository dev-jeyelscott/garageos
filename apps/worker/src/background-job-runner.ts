const DEFAULT_HEARTBEAT_INTERVAL_MS = 60_000;
const MIN_HEARTBEAT_INTERVAL_MS = 5_000;
const MAX_HEARTBEAT_INTERVAL_MS = 300_000;

export const WORKER_RUNTIME_MODE = 'observe_only' as const;

export const WORKER_KNOWN_QUEUED_JOB_TYPES = ['tenant_export.generate'] as const;

export const WORKER_DEFERRED_CAPABILITIES = [
  'tenant lifecycle job execution',
  'tenant export generation',
  'tenant hard deletion execution',
  'tenant deletion warning notification delivery',
] as const;

export type WorkerRuntimeMode = typeof WORKER_RUNTIME_MODE;
export type WorkerKnownQueuedJobType = (typeof WORKER_KNOWN_QUEUED_JOB_TYPES)[number];

export interface WorkerRuntimeConfig {
  readonly serviceName: 'garageos-worker';
  readonly runtimeMode: WorkerRuntimeMode;
  readonly workerId: string;
  readonly heartbeatIntervalMs: number;
  readonly knownQueuedJobTypes: readonly WorkerKnownQueuedJobType[];
  readonly deferredCapabilities: readonly string[];
}

export interface WorkerStartupSnapshot {
  readonly service_name: string;
  readonly runtime_mode: WorkerRuntimeMode;
  readonly worker_id: string;
  readonly heartbeat_interval_ms: number;
  readonly known_queued_job_types: readonly WorkerKnownQueuedJobType[];
  readonly deferred_capabilities: readonly string[];
  readonly claims_jobs: false;
  readonly executes_jobs: false;
}

type RuntimeEnv = Readonly<Record<string, string | undefined>>;

export function createWorkerRuntimeConfig(env: RuntimeEnv = process.env): WorkerRuntimeConfig {
  return {
    serviceName: 'garageos-worker',
    runtimeMode: WORKER_RUNTIME_MODE,
    workerId: normalizeOptionalText(env['GARAGEOS_WORKER_ID']) ?? `garageos-worker-${process.pid}`,
    heartbeatIntervalMs: parseBoundedInteger({
      value: env['GARAGEOS_WORKER_HEARTBEAT_INTERVAL_MS'],
      fallback: DEFAULT_HEARTBEAT_INTERVAL_MS,
      minimum: MIN_HEARTBEAT_INTERVAL_MS,
      maximum: MAX_HEARTBEAT_INTERVAL_MS,
    }),
    knownQueuedJobTypes: WORKER_KNOWN_QUEUED_JOB_TYPES,
    deferredCapabilities: WORKER_DEFERRED_CAPABILITIES,
  };
}

export function createWorkerStartupSnapshot(config: WorkerRuntimeConfig): WorkerStartupSnapshot {
  return {
    service_name: config.serviceName,
    runtime_mode: config.runtimeMode,
    worker_id: config.workerId,
    heartbeat_interval_ms: config.heartbeatIntervalMs,
    known_queued_job_types: config.knownQueuedJobTypes,
    deferred_capabilities: config.deferredCapabilities,
    claims_jobs: false,
    executes_jobs: false,
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
