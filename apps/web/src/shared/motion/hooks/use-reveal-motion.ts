'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';

import { cn } from '../../../components/ui';
import { useMotionContext } from '../motion-provider';

export type RevealMotionDirection = 'up' | 'down' | 'left' | 'right' | 'none';

export interface UseRevealMotionOptions {
  className?: string;
  delayMs?: number;
  direction?: RevealMotionDirection;
  disabled?: boolean;
}

export interface UseRevealMotionResult {
  className: string;
  isMotionActive: boolean;
  style: CSSProperties;
}

export function useRevealMotion({
  className,
  delayMs = 0,
  direction = 'up',
  disabled = false,
}: UseRevealMotionOptions = {}): UseRevealMotionResult {
  const { isMotionEnabled } = useMotionContext();
  const [isMotionActive, setIsMotionActive] = useState(false);

  useEffect(() => {
    if (!isMotionEnabled || disabled) {
      setIsMotionActive(false);
      return;
    }

    const animationFrame = window.requestAnimationFrame(() => {
      setIsMotionActive(true);
    });

    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, [disabled, isMotionEnabled]);

  const safeDelayMs = Math.max(0, delayMs);

  const style = useMemo<CSSProperties>(() => {
    if (!isMotionActive || safeDelayMs === 0) {
      return {};
    }

    return {
      animationDelay: `${safeDelayMs}ms`,
    };
  }, [isMotionActive, safeDelayMs]);

  return {
    className: cn(
      className,
      isMotionActive && 'motion-reveal',
      isMotionActive && `motion-reveal--${direction}`,
    ),
    isMotionActive,
    style,
  };
}
