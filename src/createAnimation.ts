/**
 * Web Animation Builder API
 *
 * Simplified API for creating and controlling Web Animations with proper lifecycle management.
 * Provides preset-based animations with manual control (play, pause, cancel, reverse, seek).
 *
 * @example
 * ```ts
 * const fadeIn = createAnimation(elementRef, {
 *   preset: 'fadeIn',
 *   duration: 500,
 *   onComplete: () => console.log('Done!')
 * })
 *
 * await fadeIn.play()
 * fadeIn.seek(250) // Jump to 50%
 * fadeIn.reverse() // Play backward
 * ```
 */

import { computed, ref, unref, type MaybeRefOrGetter, type Ref } from 'vue'
import { toValue } from '@vueuse/core'
import { animationPresets } from './presets'
import { ANIMATION_DURATION, EASING, FILL_MODE } from './constants/animations'
import type { UseAnimateKeyframes } from './types'

/**
 * Web Animation Builder API options
 */
export interface CreateAnimationOptions {
  preset?: string
  keyframes?: UseAnimateKeyframes
  duration?: number
  easing?: string
  delay?: number
  fill?: FillMode
  onStart?: () => void
  onComplete?: () => void
  onCancel?: () => void
}

/**
 * Web Animation Builder API return type
 */
export interface CreateAnimationReturn {
  play: () => Promise<void>
  pause: () => void
  cancel: () => void
  reverse: () => void
  seek: (time: number) => void
  animation: Ref<Animation | undefined>
  cleanup: () => void
}

// Issue #5 Fix: WeakMap for listener tracking to prevent memory leaks
const createAnimationFinishListeners = new WeakMap<Animation, () => void>()
const createAnimationCancelListeners = new WeakMap<Animation, () => void>()

/**
 * Create a Web Animation with preset or custom keyframes
 *
 * @param target - Target element (ref or getter)
 * @param options - Animation configuration
 * @returns Animation controls and cleanup
 */
export function createAnimation(
  target: MaybeRefOrGetter<HTMLElement | undefined>,
  options: CreateAnimationOptions
): CreateAnimationReturn {
  const targetEl = computed(() => unref(target))
  const animRef = ref<Animation>()

  const play = async () => {
    const el = targetEl.value
    if (!el) return

    // Cancel existing animation and remove listeners
    if (animRef.value) {
      const currentAnim = animRef.value

      // Remove listeners BEFORE cancel to avoid race condition
      // Always remove listeners, even if animation already finished
      const finishListener = createAnimationFinishListeners.get(currentAnim)
      if (finishListener) {
        try {
          currentAnim.removeEventListener('finish', finishListener)
        } catch (e) {
          // Animation may already be finished, ignore
        }
        createAnimationFinishListeners.delete(currentAnim)
      }
      const cancelListener = createAnimationCancelListeners.get(currentAnim)
      if (cancelListener) {
        try {
          currentAnim.removeEventListener('cancel', cancelListener)
        } catch (e) {
          // Animation may already be finished, ignore
        }
        createAnimationCancelListeners.delete(currentAnim)
      }

      try {
        currentAnim.cancel()
      } catch (e) {
        // Animation may already be finished, ignore
      }
      animRef.value = undefined
    }

    const preset = options.preset || 'fadeIn'
    const presetConfig = animationPresets[preset as keyof typeof animationPresets]

    // Fallback for unknown presets
    const keyframes = options.keyframes || presetConfig?.keyframes || [
      { opacity: 1 },
      { opacity: 0 }
    ]
    const duration = options.duration || ANIMATION_DURATION.NORMAL

    options.onStart?.()

    const element = toValue(el)
    if (!element) return

    const anim = element.animate(keyframes as Keyframe[], {
      duration,
      easing: options.easing || EASING.EASE_OUT,
      delay: options.delay || 0,
      fill: options.fill || FILL_MODE.FORWARDS as FillMode
    })

    animRef.value = anim

    // Attach listeners with { once: true } to auto-cleanup
    if (options.onComplete) {
      const listener = () => options.onComplete!()
      anim.addEventListener('finish', listener, { once: true })
      createAnimationFinishListeners.set(anim, listener)
    }

    if (options.onCancel) {
      const listener = () => options.onCancel!()
      anim.addEventListener('cancel', listener, { once: true })
      createAnimationCancelListeners.set(anim, listener)
    }

    try {
      await anim.finished
    } catch {
      // Animation was cancelled, ignore
    }
  }

  const pause = () => animRef.value?.pause()

  const cancel = () => animRef.value?.cancel()

  const reverse = () => animRef.value?.reverse()

  const seek = (time: number) => {
    if (animRef.value) {
      animRef.value.currentTime = time
    }
  }

  const cleanup = () => {
    if (animRef.value) {
      const finishListener = createAnimationFinishListeners.get(animRef.value)
      if (finishListener) {
        try {
          animRef.value.removeEventListener('finish', finishListener)
        } catch (e) {
          // Animation may already be finished, ignore
        }
        createAnimationFinishListeners.delete(animRef.value)
      }
      const cancelListener = createAnimationCancelListeners.get(animRef.value)
      if (cancelListener) {
        try {
          animRef.value.removeEventListener('cancel', cancelListener)
        } catch (e) {
          // Animation may already be finished, ignore
        }
        createAnimationCancelListeners.delete(animRef.value)
      }
      try {
        animRef.value.cancel()
      } catch (e) {
        // Animation may already be finished, ignore
      }
      animRef.value = undefined
    }
  }

  // Note: Don't use onUnmounted here - createAnimation may be called outside component context
  // Caller is responsible for calling cleanup() manually

  return { play, pause, cancel, reverse, seek, animation: animRef, cleanup }
}
