import { watch, computed, toValue, type Ref, type ComputedRef, type WatchStopHandle } from 'vue'
import type {
  AnimationPlugin,
  AnimationContext,
  PluginSystem,
  CSSVarsPluginOptions,
  CSSVarsSystem
} from '../types'
import { setCSSVar, getCSSVar } from '../cssVars'

/**
 * CSS variable tracking entry
 */
interface CSSVarTracking {
  varName: string
  initialValue: string | null
  watchStop: WatchStopHandle | null
}

/**
 * CSS Variables Lifecycle Plugin
 *
 * Automatic tracking and cleanup of CSS custom properties used in animations.
 * Syncs Vue refs to CSS variables and restores initial values on pause/stop.
 *
 * Priority: 50 (runs with other core plugins)
 * Conflicts: None
 * Optional: Works independently
 *
 * Features:
 * - Auto-sync Vue refs/computed to CSS variables
 * - Track keyframe vars for cleanup
 * - Restore initial values on pause/stop
 * - WeakMap-based tracking (no memory leaks)
 * - Per-element isolation (stagger-safe)
 *
 * @example
 * const animation = useAnimation(container, {
 *   cssVars: {
 *     vars: {
 *       'motion-x': computed(() => `${position.x}px`),
 *       'motion-y': computed(() => `${position.y}px`)
 *     },
 *     keyframeVars: ['--motion-x', '--motion-y'],
 *     restoreOnStop: true
 *   }
 * })
 */
export const cssVarsPlugin: AnimationPlugin<CSSVarsPluginOptions, CSSVarsSystem> = {
  name: 'cssVars',
  version: '1.0.0',
  priority: 50,

  setup(context: AnimationContext, options: CSSVarsPluginOptions): CSSVarsSystem {
    // WeakMap for per-element tracking (prevents memory leaks)
    const elementVarRegistry = new WeakMap<HTMLElement, Map<string, CSSVarTracking>>()

    // Reactive tracked vars - returns current element's tracking array
    const trackedVars = computed<CSSVarTracking[]>(() => {
      const element = toValue(context.target)
      if (!element) return []

      const tracking = elementVarRegistry.get(element)
      if (!tracking) return []

      return Array.from(tracking.values())
    })

    // Watch stop handles for cleanup
    const watchStops: WatchStopHandle[] = []

    /**
     * Get or create tracking map for element
     */
    const getElementTracking = (element: HTMLElement): Map<string, CSSVarTracking> => {
      let tracking = elementVarRegistry.get(element)
      if (!tracking) {
        tracking = new Map()
        elementVarRegistry.set(element, tracking)
      }
      return tracking
    }

    /**
     * Normalize CSS var name (ensure -- prefix)
     */
    const normalizeVarName = (name: string): string => {
      return name.startsWith('--') ? name : `--${name}`
    }

    /**
     * Set a CSS variable on target element
     */
    const setVar = (name: string, value: string | number) => {
      const element = toValue(context.target)
      if (!element) return

      const varName = normalizeVarName(name)
      const tracking = getElementTracking(element)

      // Capture initial value if not already tracked
      if (!tracking.has(varName)) {
        const initialValue = getCSSVar(element, varName) || null
        tracking.set(varName, {
          varName,
          initialValue,
          watchStop: null
        })
      }

      // Set the value
      setCSSVar(element, varName, value)
    }

    /**
     * Get a CSS variable from target element
     */
    const getVar = (name: string): string | undefined => {
      const element = toValue(context.target)
      if (!element) return undefined

      const varName = normalizeVarName(name)
      return getCSSVar(element, varName)
    }

    /**
     * Restore all tracked variables to initial values
     */
    const restoreAll = () => {
      const element = toValue(context.target)
      if (!element) return

      const tracking = elementVarRegistry.get(element)
      if (!tracking) return

      tracking.forEach((entry) => {
        if (entry.initialValue !== null) {
          setCSSVar(element, entry.varName, entry.initialValue)
        } else {
          // Remove the variable if it didn't exist initially
          element.style.removeProperty(entry.varName)
        }
      })
    }

    /**
     * Setup watchers for reactive vars
     */
    const setupReactiveVars = () => {
      const element = toValue(context.target)
      if (!element || !options.vars) return

      const tracking = getElementTracking(element)

      Object.entries(options.vars).forEach(([name, valueRef]) => {
        const varName = normalizeVarName(name)

        // Capture initial value
        if (!tracking.has(varName)) {
          const initialValue = getCSSVar(element, varName) || null
          tracking.set(varName, {
            varName,
            initialValue,
            watchStop: null
          })
        }

        // Setup watcher for reactive updates
        const stopWatch = watch(
          valueRef,
          (value) => {
            setCSSVar(element, varName, value)
          },
          { immediate: true }
        )

        watchStops.push(stopWatch)

        // Update tracking with watch stop
        const entry = tracking.get(varName)
        if (entry) {
          entry.watchStop = stopWatch
        }
      })
    }

    /**
     * Track keyframe vars for cleanup
     */
    const setupKeyframeVars = () => {
      const element = toValue(context.target)
      if (!element || !options.keyframeVars) return

      const tracking = getElementTracking(element)

      options.keyframeVars.forEach(name => {
        const varName = normalizeVarName(name)

        // Capture initial value if not already tracked
        if (!tracking.has(varName)) {
          const initialValue = getCSSVar(element, varName) || null
          tracking.set(varName, {
            varName,
            initialValue,
            watchStop: null
          })
        }
      })
    }

    // Watch context.target for reactive rebinding
    const targetWatcher = watch(
      () => toValue(context.target),
      (newElement, oldElement) => {
        // Cleanup old element's watchers
        if (oldElement) {
          const oldTracking = elementVarRegistry.get(oldElement)
          oldTracking?.forEach(entry => {
            entry.watchStop?.()
          })
        }

        // Clear old watch stops
        watchStops.forEach(stop => stop())
        watchStops.length = 0

        // Setup new element
        if (newElement) {
          setupReactiveVars()
          setupKeyframeVars()
        }
      },
      { immediate: true, flush: 'post' }
    )

    // Store target watcher for cleanup
    watchStops.push(targetWatcher)

    const system: CSSVarsSystem = {
      trackedVars,
      setVar,
      getVar,
      restoreAll,

      play() {
        // No action needed on play
        return Promise.resolve()
      },

      stop() {
        // Restore initial values on stop if configured
        if (options.restoreOnStop !== false) {
          restoreAll()
        }
      },

      pause() {
        // Restore initial values on pause if configured
        if (options.restoreOnPause === true) {
          restoreAll()
        }
      },

      resume() {
        // Re-apply current values on resume
        // Watchers will handle this automatically for reactive vars
      },

      cleanup() {
        // Cleanup watchers for current element
        const element = toValue(context.target)
        if (element) {
          const tracking = elementVarRegistry.get(element)
          tracking?.forEach(entry => {
            entry.watchStop?.()
            entry.watchStop = null
          })
        }

        // Stop all global watchers (including targetWatcher)
        watchStops.forEach(stop => stop())
        watchStops.length = 0

        // Optionally restore on cleanup
        if (options.restoreOnStop !== false) {
          restoreAll()
        }

        // Note: WeakMap entries will be garbage collected automatically
        // when elements are removed from DOM
      }
    }

    return system
  },

  contributeToAPI(systems) {
    const system = systems.get('cssVars') as CSSVarsSystem | undefined
    if (!system) return {}

    return {
      cssVars: {
        setVar: system.setVar,
        getVar: system.getVar,
        restoreAll: system.restoreAll,
        trackedVars: system.trackedVars
      }
    }
  }
}

/**
 * Helper: Convert timeline phases to CSS variables
 *
 * @example
 * const vars = timelineToCSSVars(timeline.phases, 'motion')
 * // Creates: --motion-progress, --motion-phase, etc.
 */
export function timelineToCSSVars(
  currentPhase: Ref<string | null>,
  cycleProgress: Ref<number>,
  varPrefix: string = 'timeline'
): Record<string, ComputedRef<string>> {
  return {
    [`${varPrefix}-progress`]: computed(() => `${cycleProgress.value}`),
    [`${varPrefix}-phase`]: computed(() => currentPhase.value || 'none')
  }
}
