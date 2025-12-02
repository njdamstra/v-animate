import { ref, reactive, computed, nextTick, getCurrentInstance } from 'vue'
import type { MaybeRefOrGetter } from '@vueuse/core'
import type { AnimationContext, SharedDataStore, UseAnimationOptions } from './types'
import { useEnvironment, type EnvironmentSystem, type AnimationQuality } from './composables/useEnvironment'

/**
 * SharedDataStore Implementation
 *
 * Type-safe storage for cross-plugin communication.
 * Uses Map internally for fast lookups.
 */
export class SharedDataStoreImpl implements SharedDataStore {
  private store = new Map<string, any>()

  set<T>(key: string, value: T): void {
    this.store.set(key, value)
  }

  get<T>(key: string): T | undefined {
    return this.store.get(key) as T | undefined
  }

  has(key: string): boolean {
    return this.store.has(key)
  }

  delete(key: string): void {
    this.store.delete(key)
  }

  clear(): void {
    this.store.clear()
  }
}

/**
 * Animation state cache for shared state management
 * EXPORTED for use in index.ts to prevent duplication
 */
export const stateCache = new Map<string, any>()
export const initialStateCache = new Map<string, any>()

/**
 * Reference counting for state cache cleanup
 */
export const stateConsumers = new Map<string, Set<symbol>>()

/**
 * Create animation context for plugin initialization
 *
 * @param target - Target element (ref or getter)
 * @param options - Animation options
 * @returns Complete animation context
 */
export function createAnimationContext(
  target: MaybeRefOrGetter<HTMLElement | undefined>,
  options: UseAnimationOptions = {}
): AnimationContext {
  // Get or create shared state (ALWAYS reactive with isPlaying flag)
  let state: any
  if (options.stateName) {
    if (!stateCache.has(options.stateName)) {
      // Seed with initialState if provided, always include isPlaying
      const resolved = options.initialState || {}
      const cloned = structuredClone(resolved)
      stateCache.set(options.stateName, reactive({ isPlaying: false, ...cloned }))
      initialStateCache.set(options.stateName, structuredClone(cloned))
    }
    state = stateCache.get(options.stateName)!
  } else {
    // Local state - always reactive with isPlaying
    state = reactive({ isPlaying: false, ...(options.initialState || {}) })
  }

  // Create computed refs that read/write to state.isPlaying
  const isPlaying = computed({
    get: () => (state as any).isPlaying,
    set: (value: boolean) => {
      ;(state as any).isPlaying = value
    },
  })
  const isPaused = ref(false)

  // Environment detection (support both legacy and new option names)
  const envOption = options.environment
  const legacyEnvOption = options.respectEnvironment
  const environmentDisabled = envOption === false || legacyEnvOption === false

  const createStaticEnvironment = (): EnvironmentSystem => {
    const constant = <T>(value: T) => computed(() => value)
    return {
      canAnimate: constant(true),
      animationQuality: constant('high' as AnimationQuality),
      shouldPauseAnimations: constant(false),
      reducedMotion: constant(false),
      batteryOptimization: constant(false),
      lowFps: constant(false),
      userIdle: constant(false),
      pageLeft: constant(false)
    }
  }

  const resolveEnvironmentOptions = () => {
    if (typeof envOption === 'object' && envOption !== null) {
      return envOption
    }
    if (typeof legacyEnvOption === 'object' && legacyEnvOption !== null) {
      return legacyEnvOption
    }
    // Explicit opt-in with boolean true or default behavior
    return {}
  }

  const environment: EnvironmentSystem = environmentDisabled
    ? createStaticEnvironment()
    : useEnvironment(resolveEnvironmentOptions())
  const canAnimate = environment.canAnimate
  const animationQuality = environment.animationQuality
  const shouldPauseAnimations = environment.shouldPauseAnimations

  // Create shared data store
  const sharedData = new SharedDataStoreImpl()

  // Get component instance for debugging
  const componentInstance = getCurrentInstance()

  // Create unique instance ID
  const instanceId = Symbol('animation-instance')

  const context: AnimationContext = {
    target,
    options,
    isPlaying,
    isPaused,
    state,
    lifecycle: options.lifecycle || {},
    canAnimate,
    animationQuality,
    shouldPauseAnimations,
    sharedData,
    instanceId,
    componentInstance
  }

  return context
}

/**
 * Atomic state cache cleanup helper
 * Uses nextTick to ensure cleanup happens after all synchronous operations
 *
 * @param stateName - Name of the shared state to cleanup
 * @param consumers - Set of consumer IDs for this state
 */
export function cleanupSharedState(stateName: string, consumers: Set<symbol>): void {
  // Immediate check first (most common case)
  if (consumers.size === 0) {
    stateCache.delete(stateName)
    initialStateCache.delete(stateName)
    stateConsumers.delete(stateName)
    return
  }

  // Only defer if consumers exist (edge case)
  // Use nextTick to double-check when consumers may still be removing themselves asynchronously
  nextTick(() => {
    // Double-check atomically
    const currentConsumers = stateConsumers.get(stateName)
    if (!currentConsumers || currentConsumers.size === 0) {
      stateCache.delete(stateName)
      initialStateCache.delete(stateName)
      stateConsumers.delete(stateName)
    }
  })
}
