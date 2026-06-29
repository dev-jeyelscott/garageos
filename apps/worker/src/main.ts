import { createWorkerRuntimeConfig, createWorkerStartupSnapshot } from './background-job-runner';

type LogLevel = 'info' | 'warn';

function main(): void {
  const config = createWorkerRuntimeConfig();
  const startupSnapshot = createWorkerStartupSnapshot(config);

  log('info', 'worker.started', startupSnapshot);
  log('warn', 'worker.observe_only', {
    message:
      'Worker runtime scaffold is active. It does not claim background jobs, execute tenant lifecycle jobs, generate tenant exports, execute hard deletion, or send warning notifications.',
  });

  const heartbeat = setInterval(() => {
    log('info', 'worker.heartbeat', createWorkerStartupSnapshot(config));
  }, config.heartbeatIntervalMs);

  registerShutdownHandler('SIGINT', heartbeat);
  registerShutdownHandler('SIGTERM', heartbeat);
}

function registerShutdownHandler(
  signal: NodeJS.Signals,
  heartbeat: ReturnType<typeof setInterval>,
): void {
  process.once(signal, () => {
    clearInterval(heartbeat);

    log('info', 'worker.stopped', {
      signal,
    });
  });
}

function log(level: LogLevel, event: string, metadata: object): void {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      service: 'garageos-worker',
      event,
      ...metadata,
    }),
  );
}

main();
