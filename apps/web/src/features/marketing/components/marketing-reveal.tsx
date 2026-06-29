'use client';

import type { ReactNode } from 'react';

import {
  useScrollRevealMotion,
  type RevealMotionDirection,
  type UseScrollRevealMotionOptions,
} from '../../../shared/motion';

export interface MarketingRevealProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly delayMs?: number;
  readonly direction?: RevealMotionDirection;
}

export function MarketingReveal({
  children,
  className,
  delayMs = 0,
  direction = 'up',
}: MarketingRevealProps) {
  const revealOptions: UseScrollRevealMotionOptions = {
    delayMs,
    direction,
    rootMargin: '0px 0px -12% 0px',
    threshold: 0.12,
  };

  if (className !== undefined) {
    revealOptions.className = className;
  }

  const revealMotion = useScrollRevealMotion<HTMLDivElement>(revealOptions);

  return (
    <div
      ref={revealMotion.ref}
      className={revealMotion.className}
      data-marketing-reveal={revealMotion.isMotionActive ? 'active' : 'idle'}
      style={revealMotion.style}
    >
      {children}
    </div>
  );
}
