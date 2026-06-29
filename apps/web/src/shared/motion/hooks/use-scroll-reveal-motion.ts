'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import { cn } from '../../../components/ui';
import { useMotionContext } from '../motion-provider';
import type { RevealMotionDirection } from './use-reveal-motion';

export interface UseScrollRevealMotionOptions {
  className?: string;
  delayMs?: number;
  direction?: RevealMotionDirection;
  disabled?: boolean;
  once?: boolean;
  rootMargin?: string;
  threshold?: number;
}

export interface UseScrollRevealMotionResult<TElement extends HTMLElement = HTMLElement> {
  className: string;
  hasEntered: boolean;
  isMotionActive: boolean;
  ref: (node: TElement | null) => void;
  style: CSSProperties;
}

export function useScrollRevealMotion<TElement extends HTMLElement = HTMLElement>({
  className,
  delayMs = 0,
  direction = 'up',
  disabled = false,
  once = true,
  rootMargin = '0px 0px -10% 0px',
  threshold = 0.2,
}: UseScrollRevealMotionOptions = {}): UseScrollRevealMotionResult<TElement> {
  const { isMotionEnabled } = useMotionContext();
  const elementRef = useRef<TElement | null>(null);
  const [hasEntered, setHasEntered] = useState(false);

  const setRef = useCallback((node: TElement | null) => {
    elementRef.current = node;
  }, []);

  useEffect(() => {
    const element = elementRef.current;

    if (!element || !isMotionEnabled || disabled) {
      setHasEntered(true);
      return;
    }

    if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') {
      setHasEntered(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setHasEntered(true);

          if (once) {
            observer.disconnect();
          }

          return;
        }

        if (!once) {
          setHasEntered(false);
        }
      },
      {
        rootMargin,
        threshold,
      },
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [disabled, isMotionEnabled, once, rootMargin, threshold]);

  const isMotionActive = isMotionEnabled && hasEntered && !disabled;
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
    hasEntered,
    isMotionActive,
    ref: setRef,
    style,
  };
}
