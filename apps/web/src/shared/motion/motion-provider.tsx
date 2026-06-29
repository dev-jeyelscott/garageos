'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { useReducedMotion } from './hooks/use-reduced-motion';

export type MotionPreferenceSource = 'system' | 'forced_reduced';

export interface MotionContextValue {
  isMotionEnabled: boolean;
  prefersReducedMotion: boolean;
  source: MotionPreferenceSource;
}

export interface MotionProviderProps {
  children: ReactNode;
  forceReducedMotion?: boolean;
}

const DEFAULT_MOTION_CONTEXT: MotionContextValue = {
  isMotionEnabled: false,
  prefersReducedMotion: true,
  source: 'system',
};

const MotionContext = createContext<MotionContextValue>(DEFAULT_MOTION_CONTEXT);

export function MotionProvider({ children, forceReducedMotion = false }: MotionProviderProps) {
  const systemPrefersReducedMotion = useReducedMotion();
  const prefersReducedMotion = forceReducedMotion || systemPrefersReducedMotion;

  const value = useMemo<MotionContextValue>(
    () => ({
      isMotionEnabled: !prefersReducedMotion,
      prefersReducedMotion,
      source: forceReducedMotion ? 'forced_reduced' : 'system',
    }),
    [forceReducedMotion, prefersReducedMotion],
  );

  return <MotionContext.Provider value={value}>{children}</MotionContext.Provider>;
}

export function useMotionContext(): MotionContextValue {
  return useContext(MotionContext);
}
