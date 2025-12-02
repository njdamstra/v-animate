import { computed, ref, watch, onUnmounted, getCurrentInstance, type WatchStopHandle } from 'vue'
import {
  toValue,
  type MaybeRefOrGetter,
  type UseAnimateKeyframes,
  type UseAnimateOptions,
} from '@vueuse/core'

// Import Phase 1 utilities
import { animationPresets, type AnimationPreset, type AnimationPresetKey } from './presets'
import { createAnimation, type CreateAnimationOptions, type CreateAnimationReturn } from './createAnimation'
import { createCssVarHelpers } from './utils/cssVarHelpers'

// Import types needed for options and API
import type { UseAnimationEnvironmentOptions, AnimationQuality } from './composables/useEnvironment'
import { createAutoPauseWatcher } from './composables/useEnvironment'

// Import types from central types file
import type {
  UseAnimationOptions,
  UseAnimationReturn,
  UseAnimationWebAnimationOptions,
  UseAnimationEnterExitOptions,
  UseAnimationAutoplayOptions,
  UseAnimationAutoplayBehavior,
  UseAnimationAutoplayBehaviorOptions,
  UseAnimationSequenceOptions,
  UseAnimationMotionPathOptions,
  UseAnimationSVGOptions,
  SvgSystem,
  UseAnimationGridOptions,
  GridSystem,
  UseAnimationResponsiveOptions,
  ResponsiveDimensions,
  TimelinePluginOptions,
  TimelineSystem,
  CSSVarsPluginOptions,
  CSSVarsSystem,
  RelationshipsPluginOptions,
  RelationshipsSystem
} from './types'

// Import plugin architecture
import { createAnimationContext, stateConsumers, cleanupSharedState } from './context'
import { AnimationPluginRegistry, globalRegistry, ensurePluginsLoaded } from './registry'
// CORE plugins - always loaded
import {
  responsivePlugin,
  webAnimationPlugin,
  cssAnimationPlugin,
  staggerPlugin,
  cssVarsPlugin,
  autoplayPlugin,
  scrollPlugin,
  timelinePlugin
} from './plugins'
// LAZY plugins (motionPath, grid, relationships) - loaded on-demand via preloadPlugins()
import { getEventBus } from './utils/eventBus'


/** Lifecycle hooks for animation playback events */
export interface UseAnimationLifecycleOptions {
  beforePlay?: () => void | Promise<void>
  afterPlay?: () => void
  beforePause?: () => void
  afterPause?: () => void
  beforeStop?: () => void
  afterStop?: () => void
  beforeResume?: () => void
  afterResume?: () => void
  onCancel?: () => void
  onProgress?: (progress: number) => void
}

// Type interfaces have moved to types/core.ts and are re-exported via ./types.

// ===============================
// GLOBAL PLUGIN REGISTRY SETUP
// ===============================
// CORE plugins - always registered at startup
const corePlugins = [
  responsivePlugin,
  webAnimationPlugin,
  cssAnimationPlugin,
  staggerPlugin,
  cssVarsPlugin,
  autoplayPlugin,
  scrollPlugin,
  timelinePlugin
]

// Register core plugins in global registry (imported from registry.ts)
corePlugins.forEach(plugin => globalRegistry.register(plugin))

const createRegistry = (pluginNames?: string[]): AnimationPluginRegistry => {
  if (!pluginNames?.length) {
    return globalRegistry
  }
  const registry = new AnimationPluginRegistry()
  pluginNames.forEach(name => {
    const plugin = globalRegistry.getPlugin(name)
    if (plugin) {
      registry.register(plugin)
    } else {
      console.warn(`[useAnimation] Plugin "${name}" not found. ` +
        `If using lazy plugins (motionPath, grid, relationships), ` +
        `call preloadPlugins(['${name}']) first.`)
    }
  })
  return registry
}

/** Preload lazy plugins (motionPath, grid, relationships) before using in useAnimation */
export async function preloadPlugins(pluginNames: string[]): Promise<void> {
  await ensurePluginsLoaded(pluginNames)
}

/**
 * Universal animation composable with plugin-based architecture.
 * Core plugins: webAnimation, stagger, responsive, autoplay, scroll, timeline, cssVars, cssAnimation
 * Lazy plugins: motionPath, grid, relationships (call preloadPlugins() first)
 *
 * @param target - Element ref/getter to animate
 * @param options - Plugin configs (animation, stagger, responsive, autoplay, timeline, etc.)
 * @returns Controls (play/pause/stop/resume), state refs, plugin APIs, cleanup()
 */
export function useAnimation<T = any, TElement = any>(
  target: MaybeRefOrGetter<HTMLElement | undefined>,
  options: UseAnimationOptions<T> = {}
): UseAnimationReturn<T, TElement> {
  // ===============================
  // CONTEXT CREATION
  // ===============================
  const context = createAnimationContext(target, options)
  const { isPlaying, isPaused, state } = context
  let manualOverride: 'play' | 'stop' | null = null

  // Register consumer for state cache management
  const consumerId = Symbol('animation-consumer')
  if (options.stateName) {
    if (!stateConsumers.has(options.stateName)) {
      stateConsumers.set(options.stateName, new Set())
    }
    stateConsumers.get(options.stateName)!.add(consumerId)
  }

  // ===============================
  const pluginWatchers: WatchStopHandle[] = []
  const localWatchers: WatchStopHandle[] = []
  const cleanupHandlers: Array<() => void> = []

  // ===============================
  // CSS VARIABLES (scoped to target element) - declare early for setup functions
  // ===============================
  const { setCSSVarLocal, unsetCSSVarLocal, getCSSVarLocal, syncCSSVarsLocal } = createCssVarHelpers(target, cleanupHandlers)

  // Make CSS helpers available to plugins that run during setupPlugins
  context.sharedData.set('orchestrator.setCSSVar', setCSSVarLocal)
  context.sharedData.set('orchestrator.unsetCSSVar', unsetCSSVarLocal)

  // ===============================
  // PLUGIN SETUP (Step 1/3: Setup plugin systems ONLY)
  // ===============================
  const registry = createRegistry(options.plugins)
  // Optimization: setupPlugins returns sortedPlugins to avoid redundant iterations in phase 2/3
  const { systems, sortedPlugins } = registry.setupPlugins(context, options)

  // Pre-compute lifecycle system arrays (avoids filtering on every play/pause/stop/resume call)
  const systemsArray = Array.from(systems.values())
  const playableSystems = systemsArray.filter(s => s.play)
  const pausableSystems = systemsArray.filter(s => s.pause)
  const stoppableSystems = systemsArray.filter(s => s.stop)
  const resumableSystems = systemsArray.filter(s => s.resume)
  const cleanableSystems = systemsArray.filter(s => s.cleanup)

  console.log('[useAnimation] Initialized', {
    target: toValue(context.target)?.tagName,
    plugins: Array.from(systems.keys()),
    autoplay: !!options.autoplay,
    environment: options.environment !== false
  })

  // ===============================
  // LIFECYCLE METHODS - declare early for setup functions
  // ===============================

  // Error boundaries for user-provided lifecycle callbacks
  const safeCall = (fn: (() => void) | undefined, hookName: string) => {
    if (!fn) return
    try {
      fn()
    } catch (e) {
      console.error(`[useAnimation] ${hookName} hook threw:`, e)
    }
  }

  const safeCallAsync = async (fn: (() => void | Promise<void>) | undefined, hookName: string) => {
    if (!fn) return
    try {
      await fn()
    } catch (e) {
      console.error(`[useAnimation] ${hookName} hook threw:`, e)
    }
  }

  const runPlay = async (reason: 'manual' | 'auto' = 'manual') => {
    if (reason === 'auto' && manualOverride === 'stop') {
      return
    }
    if (isPlaying.value) {
      console.log('[useAnimation] Already playing, skipping play()')
      return
    }

    if (reason === 'manual') {
      manualOverride = 'play'
    }

    // Set flags BEFORE async operations to prevent race condition
    // If play() is called twice rapidly, second call will see isPlaying=true and return
    isPlaying.value = true
    isPaused.value = false

    console.log('[useAnimation] play() called')

    await safeCallAsync(options.lifecycle?.beforePlay, 'beforePlay')
    safeCall(options.onStart, 'onStart')

    await Promise.all(playableSystems.map(s => s.play!()))

    safeCall(options.lifecycle?.afterPlay, 'afterPlay')
  }

  const play = async () => {
    await runPlay('manual')
  }

  const pause = () => {
    if (!isPlaying.value || isPaused.value) return

    console.log('[useAnimation] pause() called')

    safeCall(options.lifecycle?.beforePause, 'beforePause')

    pausableSystems.forEach(s => s.pause!())

    isPaused.value = true

    safeCall(options.lifecycle?.afterPause, 'afterPause')
  }

  const stop = (reason: 'manual' | 'auto' = 'manual') => {
    if (reason === 'auto' && manualOverride === 'play') {
      return
    }
    if (!isPlaying.value && !isPaused.value) return

    console.log('[useAnimation] stop() called')

    if (reason === 'manual') {
      manualOverride = 'stop'
    }

    safeCall(options.lifecycle?.beforeStop, 'beforeStop')

    stoppableSystems.forEach(s => s.stop!())

    isPlaying.value = false
    isPaused.value = false

    safeCall(options.lifecycle?.afterStop, 'afterStop')
    safeCall(options.onStop, 'onStop')
  }

  const resume = () => {
    if (!isPaused.value) return

    console.log('[useAnimation] resume() called')

    safeCall(options.lifecycle?.beforeResume, 'beforeResume')

    resumableSystems.forEach(s => s.resume!())

    isPaused.value = false

    safeCall(options.lifecycle?.afterResume, 'afterResume')
  }

  // ===============================
  // PLUGIN SETUP (Step 2/3: Store orchestrator callbacks in sharedData)
  // ===============================
  const playAuto = async () => {
    if (options.playWhen !== undefined && !toValue(options.playWhen)) {
      return
    }
    await runPlay('auto')
  }
  const stopAuto = () => stop('auto')

  // Store orchestrator callbacks BEFORE registerWatchers() so plugins can access them
  context.sharedData.set('orchestrator.play', playAuto)
  context.sharedData.set('orchestrator.pause', pause)
  context.sharedData.set('orchestrator.stop', stopAuto)
  context.sharedData.set('orchestrator.resume', resume)
  // Store plugin systems in sharedData for cross-plugin access
  if (systems.has('autoplay')) {
    context.sharedData.set('autoplay.system', systems.get('autoplay'))
  }
  if (systems.has('webAnimation')) {
    context.sharedData.set('webAnimation.system', systems.get('webAnimation'))
  }

  // ===============================
  // PLUGIN SETUP (Step 3/3: Register watchers and build API)
  // ===============================
  // NOW call registerWatchers() - plugins can access orchestrator callbacks
  // Pass sortedPlugins to avoid redundant getActivePlugins + sortByPriority
  pluginWatchers.push(...registry.registerWatchers(context, options, sortedPlugins))

  // Build combined API from all plugins (reuse sortedPlugins)
  const pluginAPI = registry.buildAPI(context, options, systems, sortedPlugins)

  // ===============================
  // FEATURES NOT YET IN PLUGINS
  // ===============================

  // animateIn/animateOut now provided by webAnimationPlugin (see pluginAPI below)

  // All systems now handled by plugins!

  // ===============================
  // EVENT SYSTEM
  // ===============================
  const busName = options.events?.busName || 'default'
  const eventBus = getEventBus(busName)

  const emit = <K extends string>(event: K, payload?: any) => {
    eventBus.emit(event, payload)
  }

  const on = <K extends string>(event: K, handler: (payload?: any) => void) => {
    const unsubscribe = eventBus.on(event, handler)
    cleanupHandlers.push(unsubscribe)
    return unsubscribe
  }

  // ===============================
  // WATCHERS
  // ===============================

  // Autoplay watcher now handled by autoplayPlugin.registerWatchers()

  // Environment pause watcher (idle, page leave, low battery hysteresis)
  const critical = options.critical ?? false
  const environmentDisabled = options.environment === false || options.respectEnvironment === false

  if (!environmentDisabled) {
    const stopEnvironmentWatch = createAutoPauseWatcher({
      shouldPauseAnimations: context.shouldPauseAnimations,
      critical,
      isPlaying,
      isPaused,
      pause,
      resume,
      debounceMs: 150
    })
    localWatchers.push(stopEnvironmentWatch)
  }

  // playWhen gate - declarative control for play/stop
  if (options.playWhen !== undefined) {
    const stopPlayWhenWatch = watch(
      () => !!toValue(options.playWhen),
      (shouldPlay) => {
        // Manual overrides expire when playWhen changes
        manualOverride = null

        if (shouldPlay) {
          if (!isPlaying.value && !isPaused.value) {
            runPlay('auto')
          }
        } else {
          if (isPlaying.value) {
            stop('auto')
          }
        }
      },
      { immediate: true }
    )
    localWatchers.push(stopPlayWhenWatch)
  }

  // ===============================
  // CLEANUP
  // ===============================
  const cleanup = () => {
    console.log('[useAnimation] Cleanup triggered')

    // Don't call stop() here - plugins handle their own stop() in cleanup()
    // Calling stop() here would result in double stop() calls (once here, once in plugin.cleanup())
    // Just reset flags directly
    isPlaying.value = false
    isPaused.value = false

    // Stop watchers FIRST to prevent race conditions
    // (watcher callbacks could create new timeouts after we clear them)
    pluginWatchers.forEach(stop => stop())
    localWatchers.forEach(stop => stop())

    // NOW clear timeouts (safe - no watchers running to recreate them)
    // autoplay debounce timeout now handled by autoplayPlugin cleanup

    // Cleanup all plugin systems (plugins handle their own stop() calls in cleanup())
    cleanableSystems.forEach(s => s.cleanup!())

    cleanupHandlers.forEach(fn => fn())
    cleanupHandlers.length = 0

    // Unregister consumer and cleanup state cache
    if (options.stateName && stateConsumers.has(options.stateName)) {
      const consumers = stateConsumers.get(options.stateName)!
      consumers.delete(consumerId)
      cleanupSharedState(options.stateName, consumers)
    }
  }

  // Auto-cleanup on unmount if in component context
  if (getCurrentInstance()) {
    onUnmounted(cleanup)
  }

  // ===============================
  // RETURN API
  // ===============================
  return {
    // Core lifecycle
    play,
    pause,
    stop,
    resume,

    // Core state
    isPlaying,
    isPaused,
    state,

    // Events
    emit,
    on,

    // Environment
    canAnimate: context.canAnimate,
    animationQuality: context.animationQuality,
    shouldPauseAnimations: context.shouldPauseAnimations,

    // Plugin-contributed APIs
    // Includes: animate, animateIn, animateOut, responsive.*, stagger.*, sequence.*, motionPath.*, svg.*, grid.*
    ...pluginAPI,

    // CSS Variables
    setCSSVar: setCSSVarLocal,
    getCSSVar: getCSSVarLocal,
    syncCSSVars: syncCSSVarsLocal,

    // Cleanup
    cleanup,
  } as UseAnimationReturn<T, TElement>
}

// Re-export Phase 1 utilities for backward compatibility
export { animationPresets, createAnimation, type AnimationPreset, type AnimationPresetKey, type CreateAnimationOptions, type CreateAnimationReturn }

// Re-export types from other modules
export type {
  UseAnimationOptions,
  UseAnimationReturn,
  UseAnimationResponsiveOptions,
  ResponsiveDimensions,
  UseAnimationSVGOptions,
  UseAnimationGridOptions,
  UseAnimationWebAnimationOptions,
  UseAnimationSequenceOptions,
  UseAnimationMotionPathOptions,
  UseAnimationAutoplayOptions,
  UseAnimationAutoplayBehavior,
  UseAnimationAutoplayBehaviorOptions,
  UseAnimationEnterExitOptions,
  AnimationQuality,
}

// UseAnimationOptions and UseAnimationReturn are defined in this file above
