'use client';

import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '../../components/ui';
import { MotionSafe } from './motion-safe';

export type WorkflowActionMotionState =
  | 'idle'
  | 'emphasis'
  | 'server_confirmed_success'
  | 'blocked';

export interface WorkflowActionMotionProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  motionClassName?: string;
  reducedMotionClassName?: string;
  state?: WorkflowActionMotionState;
}

/**
 * Motion wrapper for workflow-action UI.
 *
 * Do not pass `server_confirmed_success` until the backend/API has confirmed
 * the workflow result. Critical operational screens must not show fake success.
 */
export function WorkflowActionMotion({
  children,
  className,
  motionClassName,
  reducedMotionClassName,
  state = 'idle',
  ...props
}: WorkflowActionMotionProps) {
  return (
    <MotionSafe
      {...props}
      data-motion-state={state}
      className={cn('motion-workflow-action', className)}
      motionClassName={cn('motion-workflow-action--enabled', motionClassName)}
      reducedMotionClassName={cn('motion-workflow-action--reduced', reducedMotionClassName)}
    >
      {children}
    </MotionSafe>
  );
}
