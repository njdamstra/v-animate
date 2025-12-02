import { ref, reactive, watch, toValue, nextTick, unref, type Ref, type ComputedRef } from 'vue'
import type {
  AnimationPlugin,
  AnimationContext,
  PluginSystem,
  UseAnimationStaggerOptions,
  StaggerPluginOptions,
  StaggerSystem
} from '../types'
import { calculateStaggerDelays } from '../staggerDelays'
import { animationPresets } from '../presets'
import { ANIMATION_DURATION, EASING } from '../constants/animations'
import { createRafControls } from '../rafCoordinator'

/**
 * Stagger Plugin - Cascading animations for lists and grids.
 *
 * Priority: 50 | Options: `stagger` | Optional: responsive.scale
 *
 * Animates children with progressive delays via RAF-based timing.
 * Patterns: from (start|end|center), grid [cols, rows] for 2D stagger.
 *
 * API: elements, triggerStagger(), activeTimeouts, activeAnimations
 * Children: CSS selector, element array, or reactive ref
 *
 * @example stagger: { children: '.item', delay: 100, from: 'start' }
 * @example stagger: { children: '.cell', delay: 50, from: 'center', grid: [4, 3] }
 * @example stagger: { children: elements, loop: true, loopDelay: 2000 }
 */
export const staggerPlugin: AnimationPlugin<StaggerPluginOptions, StaggerSystem> = {
  name: 'stagger',
  version: '1.0.0',
  priority: 50,
  // No conflicts - stagger animates children, webAnimation animates target
  optionalRequires: ['responsive.scale'],

  setup(context: AnimationContext, options: StaggerPluginOptions): StaggerSystem {
    // Get responsive scale if available (soft dependency)
    const responsiveScale = context.sharedData.get<ComputedRef<number>>('responsive.scale')

    const elements = ref<HTMLElement[]>([])
    const activeTimeouts = ref<Array<ReturnType<typeof setTimeout>>>([])
    const activeAnimations = ref<Animation[]>([])
    const initialElementStates = new WeakMap<HTMLElement, { opacity: string; transform: string }>()

    // RAF-based stagger state
    const staggerState = reactive({
      startTime: 0,
      activatedIndices: new Set<number>()
    })

    let staggerLoopTimeoutId: ReturnType<typeof setTimeout> | null = null

    // Pause/resume timing tracking
    let pausedAt = 0
    let totalPausedTime = 0

    // Update element list from target
    const updateElements = () => {
      const targetEl = toValue(context.target)
      if (!targetEl) return

      if (typeof options.children === 'string') {
        elements.value = Array.from(targetEl.querySelectorAll(options.children))
      } else if (Array.isArray(options.children)) {
        elements.value = options.children
      } else {
        elements.value = unref(options.children) || []
      }
    }

    // Activate a single child element
    const activateChild = (el: HTMLElement, index: number, allElements: HTMLElement[]) => {
      // Skip animation if quality is none or cannot animate
      if (!context.canAnimate.value || context.animationQuality.value === 'none') {
        // Apply final state immediately without animation
        const preset = options.preset || 'fadeIn'
        const presetConfig = animationPresets[preset as keyof typeof animationPresets]
        const keyframes = options.keyframes || presetConfig?.keyframes
        if (Array.isArray(keyframes) && keyframes.length > 0) {
          const finalFrame = keyframes[keyframes.length - 1] as Record<string, any>
          Object.assign(el.style, finalFrame)
        }
        return
      }

      // Get preset configuration
      const preset = options.preset || 'fadeIn'
      const presetConfig = animationPresets[preset as keyof typeof animationPresets]
      const keyframes = options.keyframes || presetConfig?.keyframes
      let duration = options.duration || ANIMATION_DURATION.NORMAL

      // Apply responsive scaling to duration
      if (options.scaleWithResponsive && responsiveScale) {
        duration = Math.round(duration * responsiveScale.value)
      }

      // Apply quality-based duration scaling
      const effectiveDuration = duration * (
        context.animationQuality.value === 'low' ? 0.3 :
        context.animationQuality.value === 'medium' ? 0.6 : 1
      )

      const easing = options.easing || EASING.EASE_OUT

      // Create Web Animation
      const anim = el.animate(keyframes as Keyframe[], {
        duration: Math.max(1, effectiveDuration),
        easing: easing,
        fill: 'forwards' as FillMode
      })

      activeAnimations.value.push(anim)

      // Handle completion on last element
      if (index === allElements.length - 1) {
        anim.addEventListener('finish', () => {
          // Handle loop if enabled
          if (options.loop && context.isPlaying.value) {
            const loopDelay = options.loopDelay || 0
            staggerLoopTimeoutId = setTimeout(() => {
              if (context.isPlaying.value) {
                trigger()
              }
            }, loopDelay)
          }
        })
      }
    }

    // RAF-based stagger loop
    const staggerRaf = createRafControls(({ timestamp }) => {
      const elementList = elements.value

      if (!elementList.length) {
        staggerRaf.pause()
        return
      }

      // Initialize start time on first frame
      if (staggerState.startTime === 0) {
        staggerState.startTime = timestamp
      }

      // Calculate elapsed time excluding paused duration
      const elapsed = (timestamp - staggerState.startTime) - totalPausedTime
      let delays = calculateStaggerDelays(elementList.length, options)

      // Apply responsive scaling to delays
      if (options.scaleWithResponsive && responsiveScale) {
        delays = delays.map(d => Math.round(d * responsiveScale.value))
      }

      // Check each element for activation
      elementList.forEach((el, index) => {
        const activationTime = delays[index]

        if (elapsed >= activationTime && !staggerState.activatedIndices.has(index)) {
          activateChild(el, index, elementList)
          staggerState.activatedIndices.add(index)
        }
      })

      // Pause RAF when all elements activated
      if (staggerState.activatedIndices.size >= elementList.length) {
        staggerRaf.pause()
        staggerState.startTime = 0 // Reset for next trigger
        return // Early exit to prevent unnecessary frame execution
      }
    }, { immediate: false })

    // Trigger stagger animation
    const trigger = async () => {
      // Clear any existing timeouts to prevent overlapping animations
      activeTimeouts.value.forEach(id => clearTimeout(id))
      activeTimeouts.value = []

      // Clear any existing animations
      activeAnimations.value.forEach(anim => anim.cancel())
      activeAnimations.value = []

      // Wait for DOM to be ready
      await nextTick()
      updateElements()

      const elementList = elements.value

      if (!elementList.length) {
        return
      }

      // Reset elements to initial state if resetOnRestart is enabled (default: true)
      const shouldReset = options.resetOnRestart !== false
      if (shouldReset) {
        elementList.forEach(el => {
          // Capture initial state on first run
          if (!initialElementStates.has(el)) {
            const computedStyle = getComputedStyle(el)
            initialElementStates.set(el, {
              opacity: computedStyle.opacity,
              transform: computedStyle.transform
            })
          }

          // Reset to initial state
          const initialState = initialElementStates.get(el)
          if (initialState) {
            el.style.opacity = initialState.opacity
            el.style.transform = initialState.transform
          }
        })

        // Small delay to ensure style reset applies before animation starts
        await new Promise(resolve => setTimeout(resolve, 16)) // ~1 frame at 60fps
      }

      // Reset stagger state for new animation
      staggerState.startTime = 0
      staggerState.activatedIndices.clear()

      // Reset pause tracking for new animation
      totalPausedTime = 0
      pausedAt = 0

      // Start RAF loop
      staggerRaf.resume()
    }

    const system: StaggerSystem = {
      elements,
      trigger,
      activeTimeouts,
      activeAnimations,

      play() {
        return trigger()
      },

      stop() {
        // Clear loop timeout
        if (staggerLoopTimeoutId !== null) {
          clearTimeout(staggerLoopTimeoutId)
          staggerLoopTimeoutId = null
        }

        // Stop RAF
        staggerRaf.pause()

        // Clear timeouts
        activeTimeouts.value.forEach(id => clearTimeout(id))
        activeTimeouts.value = []

        // Cancel animations
        activeAnimations.value.forEach(anim => anim.cancel())
        activeAnimations.value = []

        // Reset state
        staggerState.startTime = 0
        staggerState.activatedIndices.clear()
      },

      pause() {
        // Track when paused for timing adjustment
        pausedAt = performance.now()
        staggerRaf.pause()

        // Clear loop timeout to free memory (will be rescheduled on next completion if still looping)
        if (staggerLoopTimeoutId !== null) {
          clearTimeout(staggerLoopTimeoutId)
          staggerLoopTimeoutId = null
        }
      },

      resume() {
        // Accumulate paused duration when resuming
        if (pausedAt > 0) {
          totalPausedTime += performance.now() - pausedAt
          pausedAt = 0
        }
        staggerRaf.resume()
      },

      cleanup() {
        // Stop everything
        this.stop?.()

        // Clear loop timeout (defensive - ensure it's cleared even if stop() didn't handle it)
        if (staggerLoopTimeoutId !== null) {
          clearTimeout(staggerLoopTimeoutId)
          staggerLoopTimeoutId = null
        }

        // Disconnect RAF
        staggerRaf.pause()

        // WeakMap (initialElementStates) doesn't need manual cleanup - GC handles it
      }
    }

    return system
  },

  contributeToAPI(systems) {
    const system = systems.get('stagger') as StaggerSystem | undefined
    if (!system) return {}

    // Wrap in 'stagger' object for backward compatibility
    return {
      stagger: {
        elements: system.elements,
        triggerStagger: system.trigger,
        activeTimeouts: system.activeTimeouts,
        activeAnimations: system.activeAnimations
      }
    }
  }
}
