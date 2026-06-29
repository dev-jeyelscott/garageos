'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { useMotionContext } from '../motion-provider';
import { formatCounterMotionValue, getCounterMotionFrameValue } from './counter-motion-utils';

export {
  formatCounterMotionValue,
  getCounterMotionFrameValue,
  type CounterMotionFrameInput,
} from './counter-motion-utils';

export interface UseCounterMotionOptions {
  autoStart?: boolean;
  decimals?: number;
  disabled?: boolean;
  durationMs?: number;
  formatter?: (value: number) => string;
  from?: number;
  value: number;
}

export interface UseCounterMotionResult {
  formattedValue: string;
  isAnimating: boolean;
  reset: () => void;
  start: () => void;
  value: number;
}

function clampProgress(progress: number): number {
  return Math.min(Math.max(progress, 0), 1);
}

export function useCounterMotion({
  autoStart = false,
  decimals = 0,
  disabled = false,
  durationMs = 900,
  formatter,
  from,
  value,
}: UseCounterMotionOptions): UseCounterMotionResult {
  const { isMotionEnabled } = useMotionContext();
  const animationFrameRef = useRef<number | null>(null);
  const [displayValue, setDisplayValue] = useState(value);
  const [isAnimating, setIsAnimating] = useState(false);

  const startValue = from ?? value;
  const safeDurationMs = Math.max(durationMs, 0);

  const cancelAnimation = useCallback(() => {
    if (animationFrameRef.current === null) {
      return;
    }

    window.cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = null;
  }, []);

  const reset = useCallback(() => {
    cancelAnimation();
    setIsAnimating(false);
    setDisplayValue(value);
  }, [cancelAnimation, value]);

  const start = useCallback(() => {
    cancelAnimation();

    if (!isMotionEnabled || disabled || safeDurationMs === 0 || startValue === value) {
      setIsAnimating(false);
      setDisplayValue(value);
      return;
    }

    const startedAt = window.performance.now();

    setDisplayValue(startValue);
    setIsAnimating(true);

    const tick = (timestamp: number) => {
      const elapsedMs = timestamp - startedAt;
      const progress = clampProgress(elapsedMs / safeDurationMs);

      setDisplayValue(
        getCounterMotionFrameValue({
          from: startValue,
          progress,
          to: value,
        }),
      );

      if (progress < 1) {
        animationFrameRef.current = window.requestAnimationFrame(tick);
        return;
      }

      animationFrameRef.current = null;
      setIsAnimating(false);
      setDisplayValue(value);
    };

    animationFrameRef.current = window.requestAnimationFrame(tick);
  }, [cancelAnimation, disabled, isMotionEnabled, safeDurationMs, startValue, value]);

  useEffect(() => {
    if (autoStart) {
      start();
      return cancelAnimation;
    }

    setDisplayValue(value);
    return cancelAnimation;
  }, [autoStart, cancelAnimation, start, value]);

  return {
    formattedValue: formatter
      ? formatter(displayValue)
      : formatCounterMotionValue(displayValue, decimals),
    isAnimating,
    reset,
    start,
    value: displayValue,
  };
}
