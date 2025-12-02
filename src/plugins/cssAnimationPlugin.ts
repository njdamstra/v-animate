/**
 * CSS Animation Plugin
 *
 * Integrates CSS-based animations with the useAnimation system by applying
 * CSS animation classes and controlling lifecycle via inline animation-play-state.
 *
 * @remarks
 * **Phase 1 Limitation:** cssAnimation and timeline are mutually exclusive.
 * Use options.animation with timeline for WAAPI-based timelines.
 *
 * @example
 * ```typescript
 * // ✅ Valid - CSS animation with preset
 * useAnimation(el, {
 *   cssAnimation: { preset: 'fadeIn', duration: 300 }
 * })
 *
 * // ✅ Valid - Custom CSS class
 * useAnimation(el, {
 *   cssAnimation: { className: 'my-custom-animation' }
 * })
 *
 * // ❌ Invalid - Cannot use with timeline
 * useAnimation(el, {
 *   cssAnimation: { preset: 'fadeIn' },
 *   timeline: [...]
 * })
 * ```
 */

import { toValue, watch, type WatchStopHandle } from 'vue'
import { useMounted } from '@vueuse/core'
import { setCSSVar } from '../cssVars'
import { animationPresets } from '../presets'
import type {
  AnimationPlugin,
  AnimationContext,
  UseCSSAnimationOptions,
  CSSAnimationSystem
} from '../types'

/**
 * Preset name translation map
 * Maps preset names from presets.ts to their corresponding @keyframes names
 */
const presetNameMap: Record<string, string> = {
  slideUp: 'slideInUp',
  slideDown: 'slideInDown',
  fadeIn: 'fadeIn',
  fadeOut: 'fadeOut',
  scaleUp: 'scaleUp',
  scaleDown: 'scaleOut',
  scaleIn: 'scaleIn',
  scaleOut: 'scaleOut',
  staggerFadeIn: 'slideInUp', // Uses same as slideUp
  popIn: 'popIn',
  rotate45: 'rotate45',
  rotateBack: 'rotateBack',
  slideInRight: 'slideInRight',
  slideOutRight: 'slideOutRight',
  slideInLeft: 'slideInLeft',
  slideOutLeft: 'slideOutLeft'
}

/**
 * WeakMaps for event listener tracking and class tracking
 * Enables proper cleanup without memory leaks
 */
const animationStartListeners = new WeakMap<HTMLElement, (e: AnimationEvent) => void>()
const animationEndListeners = new WeakMap<HTMLElement, (e: AnimationEvent) => void>()
const animationCancelListeners = new WeakMap<HTMLElement, (e: AnimationEvent) => void>()
const animationIterationListeners = new WeakMap<HTMLElement, (e: AnimationEvent) => void>()

/**
 * Track which animation classes were added by this plugin
 * Prevents removing unrelated animate-* classes
 */
const currentAnimationClasses = new WeakMap<HTMLElement, Set<string>>()

export const cssAnimationPlugin: AnimationPlugin<UseCSSAnimationOptions, CSSAnimationSystem> = {
  name: 'cssAnimation',
  version: '1.0.0',
  optionsKey: 'cssAnimation',
  conflicts: ['timeline'],
  priority: 50,

  setup(context: AnimationContext, options: UseCSSAnimationOptions) {
    const isMounted = useMounted()
    let envWatcherStop: WatchStopHandle | null = null

    // Helper to remove only plugin-added classes
    const removePluginClasses = (el: HTMLElement) => {
      const classes = currentAnimationClasses.get(el)
      if (classes) {
        classes.forEach(c => el.classList.remove(c))
        currentAnimationClasses.delete(el)
      }
    }

    // Helper to remove event listeners
    const removeAllListeners = (el: HTMLElement) => {
      const startListener = animationStartListeners.get(el)
      if (startListener) {
        try {
          el.removeEventListener('animationstart', startListener)
        } catch (e) {
          // Animation may have finished, ignore
        }
        animationStartListeners.delete(el)
      }

      const endListener = animationEndListeners.get(el)
      if (endListener) {
        try {
          el.removeEventListener('animationend', endListener)
        } catch (e) {
          // Animation may have finished, ignore
        }
        animationEndListeners.delete(el)
      }

      const cancelListener = animationCancelListeners.get(el)
      if (cancelListener) {
        try {
          el.removeEventListener('animationcancel', cancelListener)
        } catch (e) {
          // Animation may have finished, ignore
        }
        animationCancelListeners.delete(el)
      }

      const iterationListener = animationIterationListeners.get(el)
      if (iterationListener) {
        try {
          el.removeEventListener('animationiteration', iterationListener)
        } catch (e) {
          // Animation may have finished, ignore
        }
        animationIterationListeners.delete(el)
      }
    }

    // Play implementation
    const play = () => {
      if (!isMounted.value) {
        console.warn('[cssAnimationPlugin] Cannot play during SSR')
        return
      }

      const el = toValue(context.target)
      if (!el) return

      // Check if animation should run
      if (!context.canAnimate.value) {
        // Apply final state without animation
        el.style.opacity = '1'
        // Update state to reflect that animation is not playing
        context.isPlaying.value = false
        context.isPaused.value = false
        return
      }

      // Get preset or use custom class
      let animationClassName: string
      let duration = options.duration ?? 300
      let delay = options.delay ?? 0
      let easing = options.easing ?? 'ease-out'

      if (options.preset) {
        // Use preset
        const preset = animationPresets[options.preset as keyof typeof animationPresets]
        if (!preset) {
          console.warn(`[cssAnimationPlugin] Preset "${options.preset}" not found`)
          return
        }

        // Translate preset name
        animationClassName = presetNameMap[options.preset] || options.preset

        // Use preset defaults if not overridden
        // Handle preset.options being either number (shorthand for duration) or full options object
        if (typeof preset.options === 'number') {
          duration = options.duration ?? preset.options
          easing = options.easing ?? 'ease-out'
        } else {
          duration = options.duration ?? (typeof preset.options.duration === 'number' ? preset.options.duration : 300)
          easing = options.easing ?? (preset.options.easing as string || 'ease-out')
        }
      } else if (options.className) {
        // Use custom class name
        animationClassName = options.className
      } else {
        console.warn('[cssAnimationPlugin] No preset or className provided')
        return
      }

      // Remove existing listeners before adding new ones to prevent leaks
      removeAllListeners(el)

      // Remove existing classes to enable replay (force reflow)
      removePluginClasses(el)

      // Force reflow to restart animation
      void el.offsetHeight

      // Set CSS custom properties with units
      setCSSVar(el, 'animation-duration', `${duration}ms`)
      setCSSVar(el, 'animation-delay', `${delay}ms`)
      setCSSVar(el, 'animation-easing', easing)

      // Set additional CSS properties if provided
      if (options.iterationCount !== undefined) {
        el.style.animationIterationCount = options.iterationCount.toString()
      }
      if (options.direction) {
        el.style.animationDirection = options.direction
      }
      if (options.fillMode) {
        el.style.animationFillMode = options.fillMode
      }

      // Apply classes and track them
      const classesToAdd = ['animate-active', `animate-${animationClassName}`]
      classesToAdd.forEach(c => el.classList.add(c))
      currentAnimationClasses.set(el, new Set(classesToAdd))

      // Set up event listeners (AFTER removing old ones)
      if (options.onStart) {
        const onStart = (e: AnimationEvent) => {
          if (e.target === el) {
            options.onStart?.()
          }
        }
        el.addEventListener('animationstart', onStart)
        animationStartListeners.set(el, onStart)
      }

      // Always set up animationend to enable replay
      const onEnd = (e: AnimationEvent) => {
        if (e.target === el) {
          // Call user callback if provided
          options.onComplete?.()

          // Remove classes to reset state and enable replay
          removePluginClasses(el)

          // Update state
          context.isPlaying.value = false
        }
      }
      el.addEventListener('animationend', onEnd)
      animationEndListeners.set(el, onEnd)

      // Always set up animationcancel to handle state cleanup
      const onCancel = (e: AnimationEvent) => {
        if (e.target === el) {
          // Call user callback if provided
          options.onCancel?.()

          // Remove classes to reset state
          removePluginClasses(el)

          // Update state
          context.isPlaying.value = false
          context.isPaused.value = false
        }
      }
      el.addEventListener('animationcancel', onCancel)
      animationCancelListeners.set(el, onCancel)

      if (options.onIteration) {
        const onIteration = (e: AnimationEvent) => {
          if (e.target === el) {
            options.onIteration?.()
          }
        }
        el.addEventListener('animationiteration', onIteration)
        animationIterationListeners.set(el, onIteration)
      }

      // Update state
      context.isPlaying.value = true
      context.isPaused.value = false
    }

    // Pause implementation
    const pause = () => {
      const el = toValue(context.target)
      if (!el) return

      // Only pause if animation is currently playing
      if (context.isPlaying.value) {
        el.style.animationPlayState = 'paused'
        context.isPaused.value = true
      }
    }

    // Resume implementation
    const resume = () => {
      const el = toValue(context.target)
      if (!el) return

      // Only resume if animation is paused
      if (context.isPaused.value && context.isPlaying.value) {
        el.style.animationPlayState = 'running'
        context.isPaused.value = false
      }
    }

    // Stop implementation
    const stop = () => {
      const el = toValue(context.target)
      if (!el) return

      // Remove only plugin-added classes
      removePluginClasses(el)

      // Reset inline styles
      el.style.animationPlayState = ''
      el.style.animationIterationCount = ''
      el.style.animationDirection = ''
      el.style.animationFillMode = ''
      el.style.removeProperty('--animation-duration')
      el.style.removeProperty('--animation-delay')
      el.style.removeProperty('--animation-easing')

      // Update state
      context.isPlaying.value = false
      context.isPaused.value = false
    }

    // Cleanup implementation
    const cleanup = () => {
      const el = toValue(context.target)
      if (el) {
        // Remove event listeners
        removeAllListeners(el)

        // Call stop to clean up classes and styles
        stop()
      }

      // Stop environment watcher
      if (envWatcherStop) {
        envWatcherStop()
        envWatcherStop = null
      }
    }

    // Watch for environment pause triggers and store stop handle
    envWatcherStop = watch(
      () => context.shouldPauseAnimations.value,
      (should) => {
        if (should && context.isPlaying.value) {
          pause()
        } else if (!should && context.isPaused.value) {
          resume()
        }
      }
    )

    return {
      play,
      pause,
      resume,
      stop,
      cleanup
    }
  }
}
