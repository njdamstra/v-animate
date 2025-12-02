import { ref, computed, toValue, type Ref, type ComputedRef } from 'vue'
import { useMounted, type UseAnimateOptions } from '@vueuse/core'
import type {
  AnimationPlugin,
  AnimationContext,
  PluginSystem,
  UseAnimationWebAnimationOptions,
  WebAnimationSystem,
  UseAnimateKeyframes
} from '../types'
import { createAnimation, type CreateAnimationOptions } from '../createAnimation'
import { animationPresets, type AnimationPresetKey } from '../presets'
import { ANIMATION_DURATION, EASING } from '../constants/animations'

/**
 * Web Animation Plugin - Browser-native WAAPI animations with preset support.
 *
 * Priority: 50 | Options: `animation` | Optional: responsive.scale
 * Skips if stagger is configured (stagger handles children).
 *
 * Presets: fadeIn, slideUp/Down, slideInRight/Left, scaleUp/Down, popIn, rotate45/Back
 * API: animate (ref), animateIn(keyframes, opts), animateOut(keyframes, opts)
 *
 * @example animation: { preset: 'fadeIn' }
 * @example animation: { keyframes: [...], duration: 300, easing: 'ease-out' }
 * @example animation: { preset: 'slideUp', scaleWithResponsive: true }
 */
export const webAnimationPlugin: AnimationPlugin<UseAnimationWebAnimationOptions, WebAnimationSystem> = {
  name: 'webAnimation',
  version: '1.0.0',
  priority: 50,
  // No conflicts - webAnimation animates the target, stagger animates children
  optionalRequires: ['responsive.scale'], // Can use responsive scaling if available
  optionsKey: 'animation', // Activate with options.animation (not options.webAnimation)
  shouldActivate(options) {
    // Skip container animation if stagger is configured (matches legacy behavior)
    if (options.stagger) return false
    return !!options.animation
  },

  setup(context: AnimationContext, options: UseAnimationWebAnimationOptions): WebAnimationSystem {
    // Get responsive scale if available (soft dependency)
    const responsiveScale = context.sharedData.get<ComputedRef<number>>('responsive.scale')

    // Apply responsive scaling to timing if enabled
    const effectiveOptions: CreateAnimationOptions = {
      ...options
    }

    if (options.scaleWithResponsive && responsiveScale) {
      const scale = responsiveScale.value
      if (options.duration) {
        effectiveOptions.duration = Math.round(options.duration * scale)
      }
      if (options.delay) {
        effectiveOptions.delay = Math.round(options.delay * scale)
      }
    }

    // Create the animation using existing createAnimation module
    const animationController = createAnimation(context.target, effectiveOptions)

    // Track playing state
    const isCurrentlyPlaying = ref(false)
    const isMounted = useMounted()

    const system: WebAnimationSystem = {
      animation: animationController.animation,

      async play() {
        isCurrentlyPlaying.value = true
        await animationController.play()
        isCurrentlyPlaying.value = false
      },

      pause() {
        animationController.pause()
        isCurrentlyPlaying.value = false
      },

      resume() {
        const anim = animationController.animation.value
        if (!anim) return

        // Handle different play states
        if (anim.playState === 'paused') {
          anim.play()
          isCurrentlyPlaying.value = true
        } else if (anim.playState === 'finished' || anim.playState === 'idle') {
          // Restart finished/idle animations
          animationController.play()
        }
      },

      stop() {
        animationController.cancel()
        isCurrentlyPlaying.value = false
      },

      cancel() {
        animationController.cancel()
        isCurrentlyPlaying.value = false
      },

      reverse() {
        animationController.reverse()
      },

      seek(time: number) {
        animationController.seek(time)
      },

      async animateIn(customKeyframes?: UseAnimateKeyframes, customOptions?: UseAnimateOptions) {
        if (!isMounted.value) return

        // Quality fallback - apply final frame when animations disabled
        if (context.animationQuality.value === 'none' || !context.canAnimate.value) {
          // Cancel any running animation first to avoid style conflicts
          if (animationController.animation.value) {
            animationController.cancel()
          }

          const element = toValue(context.target)
          if (element) {
            let fallbackKeyframes: UseAnimateKeyframes | undefined

            if (customKeyframes && Array.isArray(customKeyframes) && customKeyframes.length > 0) {
              fallbackKeyframes = customKeyframes
            } else if (options.preset || options.keyframes) {
              const presetName = (options.preset || 'fadeIn') as AnimationPresetKey
              const presetConfig = animationPresets[presetName]
              fallbackKeyframes = options.keyframes || presetConfig?.keyframes
            }

            if (fallbackKeyframes && Array.isArray(fallbackKeyframes) && fallbackKeyframes.length > 0) {
              const finalFrame = fallbackKeyframes[fallbackKeyframes.length - 1] as Record<string, any>
              Object.assign(element.style, finalFrame)
            }
          }
          options.onComplete?.()
          return
        }

        const element = toValue(context.target)
        if (element && customKeyframes) {
          const anim = element.animate(customKeyframes as Keyframe[], {
            duration: ANIMATION_DURATION.NORMAL,
            easing: EASING.EASE_OUT,
            fill: 'forwards' as FillMode,
            ...customOptions
          })
          if (options.onComplete) {
            anim.addEventListener('finish', options.onComplete, { once: true })
          }
          return anim
        } else {
          // Fallback to play if no custom keyframes
          await this.play()
        }
      },

      async animateOut(outKeyframes?: UseAnimateKeyframes, outOptions?: UseAnimateOptions) {
        if (!isMounted.value) return

        const defaultOutKeyframes = [
          { opacity: 1, transform: 'scale(1)' },
          { opacity: 0, transform: 'scale(0.8)' }
        ]

        // Quality fallback - apply final frame when animations disabled
        if (context.animationQuality.value === 'none' || !context.canAnimate.value) {
          // Cancel any running animation first to avoid style conflicts
          if (animationController.animation.value) {
            animationController.cancel()
          }

          const element = toValue(context.target)
          if (element) {
            const finalFrame = (outKeyframes && Array.isArray(outKeyframes) && outKeyframes.length > 0
              ? outKeyframes[outKeyframes.length - 1]
              : defaultOutKeyframes[1]) as Record<string, any>
            Object.assign(element.style, finalFrame)
          }
          options.onComplete?.()
          return
        }

        const element = toValue(context.target)
        if (element) {
          const anim = element.animate((outKeyframes || defaultOutKeyframes) as Keyframe[], {
            duration: ANIMATION_DURATION.FAST,
            easing: EASING.EASE_OUT,
            fill: 'forwards' as FillMode,
            ...outOptions
          })
          if (options.onComplete) {
            anim.addEventListener('finish', options.onComplete, { once: true })
          }
          return anim
        }
      },

      cleanup() {
        animationController.cleanup()
        isCurrentlyPlaying.value = false
      }
    }

    return system
  },

  beforePlay(context: AnimationContext) {
    // Invoke user's onStart callback if provided
    const options = context.options.animation as UseAnimationWebAnimationOptions
    if (options?.onStart) {
      options.onStart()
    }
  },

  afterPlay(context: AnimationContext) {
    // Could add analytics/logging here
  },

  contributeToAPI(systems) {
    const system = systems.get('webAnimation') as WebAnimationSystem | undefined
    if (!system) return {}

    // Return root-level properties for backward compatibility
    // Old API had: animate (ref), animateIn (function), animateOut (function)
    return {
      animate: system.animation,
      animateIn: system.animateIn,
      animateOut: system.animateOut
    }
  }
}
