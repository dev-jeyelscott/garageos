import { createSchedulerRuntimeConfig, createSchedulerStartupSnapshot } from './job-scheduler';

type LogLevel = 'info' | 'warn';

function main(): void {
  const config = createSchedulerRuntimeConfig();
  const startupSnapshot = createSchedulerStartupSnapshot(config);

  log('info', 'scheduler.started', startupSnapshot);
  log('warn', 'scheduler.observe_only', {
    message:
      'Scheduler runtime scaffold is active. It does not enqueue lifecycle jobs, tenant export jobs, hard deletion jobs, or warning notification jobs.',
  });

  const heartbeat = setInterval(() => {
    log('info', 'scheduler.heartbeat', createSchedulerStartupSnapshot(config));
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

    log('info', 'scheduler.stopped', {
      signal,
    });
  });
}

function log(level: LogLevel, event: string, metadata: object): void {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      service: 'garageos-scheduler',
      event,
      ...metadata,
    }),
  );
}

main();
