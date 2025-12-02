
import { computed, watch, type Ref, type ComputedRef } from 'vue'
import {
  usePreferredReducedMotion,
  useBattery,
  useFps,
  useIdle,
  usePageLeave,
  useMounted,
} from '@vueuse/core'

/**
 * Helper to create the environment-driven auto-pause watcher used by useAnimation.
 * Encapsulates debounce and critical-animation guard so orchestrator code stays lean.
 */
export function createAutoPauseWatcher(config: AutoPauseConfig): () => void {
  const { shouldPauseAnimations, critical, isPlaying, isPaused, pause, resume, debounceMs = 150 } = config

  // No-op for critical animations; return a stable cleanup fn
  if (critical) {
    return () => {}
  }

  let debounceHandle: ReturnType<typeof setTimeout> | null = null

  const stop = watch(shouldPauseAnimations, (shouldPause) => {
    if (debounceHandle) {
      clearTimeout(debounceHandle)
      debounceHandle = null
    }

    if (shouldPause && isPlaying.value) {
      debounceHandle = setTimeout(() => {
        if (isPlaying.value) {
          pause()
        }
        debounceHandle = null
      }, debounceMs)
    } else if (!shouldPause && isPaused.value) {
      resume()
    }
  })

  return () => {
    stop()
    if (debounceHandle) {
      clearTimeout(debounceHandle)
      debounceHandle = null
    }
  }
}

/**
 * Environment respect configuration
 */
export interface UseAnimationEnvironmentOptions {
  reducedMotion?: boolean
  battery?: boolean
  fps?: boolean
  idle?: boolean
  pageLeave?: boolean
}

/**
 * Animation quality level
 */
export type AnimationQuality = 'none' | 'low' | 'medium' | 'high'

/**
 * Environment system return type
 */
export interface EnvironmentSystem {
  canAnimate: ComputedRef<boolean>
  animationQuality: ComputedRef<AnimationQuality>
  shouldPauseAnimations: ComputedRef<boolean>
  reducedMotion: ComputedRef<boolean>
  batteryOptimization: ComputedRef<boolean>
  lowFps: ComputedRef<boolean>
  userIdle: ComputedRef<boolean>
  pageLeft: ComputedRef<boolean>
}

export interface AutoPauseConfig {
  shouldPauseAnimations: ComputedRef<boolean>
  critical: boolean
  isPlaying: Ref<boolean>
  isPaused: Ref<boolean>
  pause: () => void
  resume: () => void
  debounceMs?: number
}

/**
 * Global environment cache (singleton)
 * Shared across all useAnimation instances for performance
 */
let cachedEnvironment: {
  prefersReducedMotion: Ref<'reduce' | 'no-preference'>
  batteryInfo: ReturnType<typeof useBattery>
  fps: Ref<number> | null
  idle: { idle: Ref<boolean>; lastActive: Ref<number>; reset: () => void } | null
  isPageLeft: Ref<boolean> | null
} | null = null

/**
 * useEnvironment composable
 *
 * Uses singleton pattern to share environment detection across all animation instances.
 * This prevents creating multiple battery monitors, FPS trackers, etc.
 *
 * @param options - Environment detection options
 * @returns Environment system with computed flags
 */
export function useEnvironment(
  options: UseAnimationEnvironmentOptions = {}
): EnvironmentSystem {
  const isMounted = useMounted()

  const resolvedOptions = {
    reducedMotion: options.reducedMotion !== false,
    battery: options.battery !== false,
    fps: options.fps !== false,
    idle: options.idle !== false,
    pageLeave: options.pageLeave !== false,
  }

  // Initialize singleton on first call
  if (!cachedEnvironment) {
    const prefersReducedMotion = usePreferredReducedMotion()
    const batteryInfo = useBattery()
    const fps = resolvedOptions.fps ? useFps({ every: 10 }) : null
    const idle = resolvedOptions.idle
      ? useIdle(5 * 60 * 1000) // 5 minutes
      : null
    const isPageLeft = resolvedOptions.pageLeave ? usePageLeave() : null

    cachedEnvironment = {
      prefersReducedMotion,
      batteryInfo,
      fps,
      idle,
      isPageLeft,
    }
  }

  const env = cachedEnvironment

  // Computed environment flags
  const reducedMotion = computed(
    () => !!(resolvedOptions.reducedMotion && isMounted.value && env.prefersReducedMotion.value === 'reduce')
  )

  const batteryOptimization = computed(() => {
    if (!resolvedOptions.battery) return false
    const level = env.batteryInfo.level.value
    // Trigger at < 20% battery and not charging
    return typeof level === 'number' ? level < 0.2 && !env.batteryInfo.charging.value : false
  })

  const lowFps = computed(() => resolvedOptions.fps && env.fps ? env.fps.value < 30 : false)

  const userIdle = computed(() => resolvedOptions.idle && env.idle ? env.idle.idle.value : false)

  const pageLeft = computed(() => resolvedOptions.pageLeave && env.isPageLeft ? env.isPageLeft.value : false)

  const canAnimate = computed(
    () => !reducedMotion.value && !batteryOptimization.value && !lowFps.value
  )

  const shouldPauseAnimations = computed(
    () => userIdle.value || pageLeft.value || (batteryOptimization.value && env.batteryInfo.level.value < 0.1)
  )

  const animationQuality = computed<AnimationQuality>(() => {
    if (reducedMotion.value) return 'none'
    if (batteryOptimization.value) return 'low'
    if (lowFps.value) return 'medium'
    return 'high'
  })

  return {
    canAnimate,
    animationQuality,
    shouldPauseAnimations,
    reducedMotion,
    batteryOptimization,
    lowFps,
    userIdle,
    pageLeft,
  }
}
