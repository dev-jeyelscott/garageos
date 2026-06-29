'use client';

export {
  MotionProvider,
  useMotionContext,
  type MotionContextValue,
  type MotionPreferenceSource,
  type MotionProviderProps,
} from './motion-provider';
export { MotionSafe, type MotionSafeProps } from './motion-safe';
export {
  WorkflowActionMotion,
  type WorkflowActionMotionProps,
  type WorkflowActionMotionState,
} from './workflow-action-motion';
export { useReducedMotion } from './hooks/use-reduced-motion';
export {
  useRevealMotion,
  type RevealMotionDirection,
  type UseRevealMotionOptions,
  type UseRevealMotionResult,
} from './hooks/use-reveal-motion';
export {
  useScrollRevealMotion,
  type UseScrollRevealMotionOptions,
  type UseScrollRevealMotionResult,
} from './hooks/use-scroll-reveal-motion';
export {
  formatCounterMotionValue,
  getCounterMotionFrameValue,
  useCounterMotion,
  type CounterMotionFrameInput,
  type UseCounterMotionOptions,
  type UseCounterMotionResult,
} from './hooks/use-counter-motion';
