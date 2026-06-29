export interface CounterMotionFrameInput {
  from: number;
  progress: number;
  to: number;
}

function clampProgress(progress: number): number {
  return Math.min(Math.max(progress, 0), 1);
}

function easeOutCubic(progress: number): number {
  return 1 - Math.pow(1 - progress, 3);
}

export function getCounterMotionFrameValue({
  from,
  progress,
  to,
}: CounterMotionFrameInput): number {
  const easedProgress = easeOutCubic(clampProgress(progress));

  return from + (to - from) * easedProgress;
}

export function formatCounterMotionValue(value: number, decimals = 0): string {
  const safeDecimals = Math.min(Math.max(decimals, 0), 6);

  return value.toLocaleString(undefined, {
    maximumFractionDigits: safeDecimals,
    minimumFractionDigits: safeDecimals,
  });
}
