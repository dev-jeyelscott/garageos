'use client';

import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '../../components/ui';
import { useMotionContext } from './motion-provider';

export interface MotionSafeProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  motionClassName?: string;
  reducedMotionClassName?: string;
}

export function MotionSafe({
  children,
  className,
  motionClassName,
  reducedMotionClassName,
  ...props
}: MotionSafeProps) {
  const { isMotionEnabled } = useMotionContext();

  return (
    <div
      {...props}
      data-motion-enabled={isMotionEnabled ? 'true' : 'false'}
      data-motion-safe="true"
      className={cn(className, isMotionEnabled ? motionClassName : reducedMotionClassName)}
    >
      {children}
    </div>
  );
}
