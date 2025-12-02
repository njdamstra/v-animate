import { ref, computed, watch, toValue, type Ref, type ComputedRef, type WatchStopHandle } from 'vue'
import { useDocumentVisibility, type MaybeRefOrGetter } from '@vueuse/core'
import type {
  AnimationPlugin,
  AnimationContext,
  PluginSystem,
  UseAnimationAutoplayBehavior,
  UseAnimationAutoplayBehaviorOptions,
  UseAnimationAutoplayOptions,
  AutoplaySystem
} from '../types'
import { useVisibilityTracker } from '../observers/useVisibilityTracker'
import { normalizeAutoplay } from '../utils/pluginOptionDefaults'

/**
 * Autoplay Plugin - Visibility-based automatic animation control.
 *
 * Priority: 40 | Options: `autoplay` | Requires: orchestrator callbacks
 *
 * Features: IntersectionObserver visibility, Page Visibility API (tab switching),
 * debounced triggers, sentinel pattern for teleported elements, SPA navigation.
 *
 * Behaviors: visibility (play-once|play-pause|play-stop|pause|stop|none),
 * environment (pause|stop|none), navigation (restart|resume|none)
 *
 * @example autoplay: true // immediate
 * @example autoplay: { threshold: 0.5, behavior: { visibility: 'play-once' } }
 * @example autoplay: { sentinel: modalContainer } // teleported elements
 */
export const autoplayPlugin: AnimationPlugin<UseAnimationAutoplayOptions, AutoplaySystem> = {
  name: 'autoplay',
  version: '1.0.0',
  priority: 40,
  optionsKey: 'autoplay',

  setup(context: AnimationContext, options: UseAnimationAutoplayOptions): AutoplaySystem {
    const parsedOptions = normalizeAutoplay(options, { observeTarget: true, behavior: { visibility: 'stop', environment: 'stop' } })

    const cleanupHandlers: Array<() => void> = []

    const targetElement = computed(() => toValue(context.target))
    const observeTarget = parsedOptions.observeTarget

    // Element visibility tracking with priority system
    // Priority 1: Manual override
    // Priority 2: Sentinel element (for teleported components)
    // Priority 3: Default target element
    let visibilityTrackerCleanup: (() => void) | null = null
    const createTracker = (source: MaybeRefOrGetter<Element | undefined>) => {
      const tracker = useVisibilityTracker(source, { threshold: parsedOptions.threshold })
      visibilityTrackerCleanup?.()
      visibilityTrackerCleanup = () => {
        tracker.cleanup()
        visibilityTrackerCleanup = null
      }
      return tracker.visible
    }

    const elementVisible = parsedOptions.visibilityOverride
      ? parsedOptions.visibilityOverride
      : parsedOptions.sentinel
        ? createTracker(computed(() => toValue(parsedOptions.sentinel)))
        : observeTarget
          ? createTracker(targetElement)
          : computed(() => true)

    // Document visibility tracking
    const documentVisible = useDocumentVisibility()

    // Enabled flag
    const autoplayEnabled = computed(() => {
      return !!toValue(parsedOptions.enabled)
    })

    // Behavior configuration
    const autoplayBehavior = computed(() => {
      const behavior = toValue(parsedOptions.behavior)
      return {
        visibility: behavior?.visibility ?? 'stop',
        environment: behavior?.environment ?? 'stop'
      }
    })

    // Navigation tracking (Astro-specific)
    const currentPath = ref(typeof window !== 'undefined' ? window.location.pathname : '')
    let navigationCleanup: (() => void) | null = null

    const detachNavigation = () => {
      navigationCleanup?.()
      navigationCleanup = null
    }

    const attachNavigation = () => {
      // Always cleanup first to prevent memory leaks from multiple attachments
      detachNavigation()
      
      if (typeof window === 'undefined' || typeof document === 'undefined') return

      const getStopCallback = () => context.sharedData.get<() => void>('orchestrator.stop')

      const handleNavigationChange = () => {
        const newPath = window.location.pathname
        if (newPath !== currentPath.value) {
          currentPath.value = newPath
          getStopCallback()?.()
        }
      }

      window.addEventListener('popstate', handleNavigationChange)
      document.addEventListener('astro:before-preparation', handleNavigationChange)
      document.addEventListener('astro:page-load', handleNavigationChange)

      navigationCleanup = () => {
        window.removeEventListener('popstate', handleNavigationChange)
        document.removeEventListener('astro:before-preparation', handleNavigationChange)
        document.removeEventListener('astro:page-load', handleNavigationChange)
      }
    }

    if (parsedOptions.includeNavigation && typeof window !== 'undefined' && typeof document !== 'undefined') {
      const stopNavWatch = watch(autoplayEnabled, (enabled) => {
        if (enabled) {
          attachNavigation()
        } else {
          detachNavigation()
        }
      }, { immediate: true })

      cleanupHandlers.push(() => {
        stopNavWatch()
        detachNavigation()
      })
    }

    // Combined shouldAutoplay flag
    const shouldAutoplay = computed(() => {
      if (!autoplayEnabled.value) return false
      if (documentVisible.value !== 'visible') return false
      if (!context.canAnimate.value) return false
      return elementVisible.value
    })

    // Paused state tracking
    const pausedByVisibility = ref(false)
    const pausedByEnvironment = ref(false)

    // Debounce timeout tracking for proper cleanup
    const debounceTimeout = ref<ReturnType<typeof setTimeout> | null>(null)

    const system: AutoplaySystem = {
      shouldAutoplay,
      elementVisible,
      documentVisible,
      autoplayEnabled,
      autoplayBehavior,
      pausedByVisibility,
      pausedByEnvironment,
      debounceTimeout,
      baseDebounce: parsedOptions.debounceMs,
      adaptiveDebounce: parsedOptions.adaptiveDebounce,
      maxAdaptiveDebounce: parsedOptions.maxAdaptiveDebounce,

      cleanup() {
        // Clear debounce timeout if active
        if (debounceTimeout.value) {
          clearTimeout(debounceTimeout.value)
          debounceTimeout.value = null
        }

        // Cleanup navigation listeners
        navigationCleanup?.()
        navigationCleanup = null

        // Cleanup visibility tracker
        visibilityTrackerCleanup?.()
        visibilityTrackerCleanup = null

        cleanupHandlers.forEach(handler => handler())
        cleanupHandlers.length = 0
      }
    }

    return system
  },

  registerWatchers(context: AnimationContext): WatchStopHandle[] {
    const system = context.sharedData.get<AutoplaySystem>('autoplay.system')
    if (!system) return []

    const baseDebounce = system.baseDebounce ?? 150
    const adaptiveDebounce = system.adaptiveDebounce ?? true
    const maxAdaptiveDebounce = system.maxAdaptiveDebounce ?? 500
    const getTime = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())
    let lastToggleTime = 0
    let rapidToggleCount = 0
    const getEffectiveDebounce = () => {
      if (!adaptiveDebounce) return baseDebounce
      const now = getTime()
      if (now - lastToggleTime < 120) {
        rapidToggleCount++
      } else {
        rapidToggleCount = 0
      }
      lastToggleTime = now
      return Math.min(baseDebounce + rapidToggleCount * 40, maxAdaptiveDebounce)
    }

    // Retrieve orchestrator callbacks from sharedData
    const play = context.sharedData.get<() => Promise<void>>('orchestrator.play')
    const pause = context.sharedData.get<() => void>('orchestrator.pause')
    const stop = context.sharedData.get<() => void>('orchestrator.stop')
    const resume = context.sharedData.get<() => void>('orchestrator.resume')

    if (!play || !pause || !stop || !resume) {
      console.warn('[autoplayPlugin] Orchestrator callbacks not found in sharedData')
      return []
    }

    // Autoplay watcher with 150ms debounce for exit (prevents jitter)
    const stopWatcher = watch(system.shouldAutoplay, (should) => {
      console.log('[autoplayPlugin] shouldAutoplay changed:', should, {
        elementVisible: system.elementVisible.value,
        documentVisible: system.documentVisible.value,
        enabled: system.autoplayEnabled.value
      })

      // Clear any pending debounce timeout
      if (system.debounceTimeout.value) {
        clearTimeout(system.debounceTimeout.value)
        system.debounceTimeout.value = null
      }

      if (should) {
        // Immediate entry (responsive UX)
        if (!context.isPlaying.value) {
          play()
        } else if (context.isPaused.value) {
          resume()
        }
        system.pausedByVisibility.value = false
        system.pausedByEnvironment.value = false
        return
      }

      const delay = getEffectiveDebounce()

      // Delayed exit to prevent jitter
      system.debounceTimeout.value = setTimeout(() => {
        // Guard: Check if shouldAutoplay changed back to true
        if (system.shouldAutoplay.value) {
          system.debounceTimeout.value = null
          return
        }

        if (!context.isPlaying.value && !context.isPaused.value) {
          system.debounceTimeout.value = null
          return
        }

        // Check if autoplay is disabled
        if (!system.autoplayEnabled.value) {
          stop()
          system.pausedByVisibility.value = false
          system.pausedByEnvironment.value = false
          system.debounceTimeout.value = null
          return
        }

        // Check element visibility (if observing target)
        if (!system.elementVisible.value) {
          if (system.autoplayBehavior.value.visibility === 'pause') {
            if (!context.isPaused.value) {
              pause()
            }
            system.pausedByVisibility.value = true
          } else {
            // visibility === 'stop'
            stop()
            system.pausedByVisibility.value = false
            system.pausedByEnvironment.value = false
          }
          system.debounceTimeout.value = null
          return
        }

        // Check document visibility and environment
        if (system.documentVisible.value !== 'visible' || !context.canAnimate.value) {
          if (system.autoplayBehavior.value.environment === 'pause') {
            if (!context.isPaused.value) {
              pause()
            }
            system.pausedByEnvironment.value = true
          } else {
            // environment === 'stop'
            stop()
            system.pausedByVisibility.value = false
            system.pausedByEnvironment.value = false
          }
          system.debounceTimeout.value = null
          return
        }

        // Fallback: stop
        stop()
        system.pausedByVisibility.value = false
        system.pausedByEnvironment.value = false
        system.debounceTimeout.value = null
      }, delay)
    }, { immediate: true })

    return [() => {
      stopWatcher()
      if (system.debounceTimeout.value) {
        clearTimeout(system.debounceTimeout.value)
        system.debounceTimeout.value = null
      }
    }]
  },

  cleanup() {
    // Cleanup is handled by system.cleanup() which is called by registry
  }
}
