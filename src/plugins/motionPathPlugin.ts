import { ref, watch, toValue, type Ref } from 'vue'
import type {
  AnimationPlugin,
  AnimationContext,
  PluginSystem,
  UseAnimationMotionPathOptions,
  MotionPathSystem
} from '../types'
import { createRafControls } from '../rafCoordinator'

/**
 * Motion Path Plugin
 *
 * RAF-based circular or elliptical motion paths with CSS variable integration.
 * Sets --motion-x, --motion-y, and --motion-rotation CSS variables for positioning.
 *
 * Supports multi-element mode: animate multiple elements along the path with
 * individual start angles via `elements` and `elementAngles` options.
 *
 * Priority: 50 (default)
 * Requires: orchestrator.setCSSVar (for CSS variable setting on single-element mode)
 */
export const motionPathPlugin: AnimationPlugin<UseAnimationMotionPathOptions, MotionPathSystem> = {
  name: 'motionPath',
  version: '1.0.0',
  priority: 50,
  optionsKey: 'motionPath',

  setup(context: AnimationContext, options: UseAnimationMotionPathOptions): MotionPathSystem {
    const motionProgress = ref(0)
    const motionStartTime = ref<number | null>(null)

    // Get CSS var helpers from sharedData (for single-element mode)
    const setCSSVar = context.sharedData.get<(name: string, value: string) => void>('orchestrator.setCSSVar') || (() => {})
    const unsetCSSVar = context.sharedData.get<(name: string) => void>('orchestrator.unsetCSSVar') || (() => {})

    // Determine if multi-element mode (static - read once at setup)
    const isMultiElement = !!options.elements
    // Cache elements at setup time for performance
    const cachedElements: HTMLElement[] = isMultiElement ? (toValue(options.elements) || []) : []

    /**
     * Helper to set CSS vars on an element (used in multi-element mode)
     */
    const setElementCSSVar = (el: HTMLElement, name: string, value: string) => {
      el.style.setProperty(name, value)
    }

    /**
     * Helper to calculate position for a given start angle
     */
    const calculateCircularPosition = (progress: number, startAngleDeg: number) => {
      const radius = typeof options.radius === 'number'
        ? options.radius
        : options.radius?.x || 100

      const startAngle = startAngleDeg * (Math.PI / 180)
      const direction = options.direction === 'counterclockwise' ? -1 : 1
      const angle = startAngle + (direction * 2 * Math.PI * progress)

      return {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        rotation: options.autoRotate ? -angle * (180 / Math.PI) : 0
      }
    }

    const calculateEllipticalPosition = (progress: number, startAngleDeg: number) => {
      const radiusX = typeof options.radius === 'object'
        ? options.radius.x
        : options.radius || 100
      const radiusY = typeof options.radius === 'object'
        ? options.radius.y
        : options.radius || 60

      const startAngle = startAngleDeg * (Math.PI / 180)
      const direction = options.direction === 'counterclockwise' ? -1 : 1
      const angle = startAngle + (direction * 2 * Math.PI * progress)

      return {
        x: Math.cos(angle) * radiusX,
        y: Math.sin(angle) * radiusY,
        rotation: options.autoRotate ? -angle * (180 / Math.PI) : 0
      }
    }

    const updateMotionPathPosition = () => {
      const progress = motionProgress.value

      if (options.type === 'custom' && options.path) {
        console.warn('Custom motion paths not yet fully implemented')
        return
      }

      // Multi-element mode: animate each element with its own start angle
      if (isMultiElement) {
        cachedElements.forEach((el, index) => {
          if (!el) return

          // Get per-element start angle, fallback to global startAngle
          const elementStartAngle = options.elementAngles?.[index] ?? (options.startAngle || 0)

          const pos = options.type === 'circular'
            ? calculateCircularPosition(progress, elementStartAngle)
            : calculateEllipticalPosition(progress, elementStartAngle)

          setElementCSSVar(el, '--motion-x', `${pos.x}px`)
          setElementCSSVar(el, '--motion-y', `${pos.y}px`)
          setElementCSSVar(el, '--motion-rotation', `${pos.rotation}deg`)
        })
        return
      }

      // Single-element mode: use context.target and shared CSS var helpers
      const targetEl = toValue(context.target)
      if (!targetEl) return

      const startAngle = options.startAngle || 0
      const pos = options.type === 'circular'
        ? calculateCircularPosition(progress, startAngle)
        : calculateEllipticalPosition(progress, startAngle)

      setCSSVar('--motion-x', `${pos.x}px`)
      setCSSVar('--motion-y', `${pos.y}px`)
      setCSSVar('--motion-rotation', `${pos.rotation}deg`)
    }

    const setProgress = (progress: number) => {
      motionProgress.value = Math.max(0, Math.min(1, progress))
      updateMotionPathPosition()
    }

    // Animation loop for motion path
    const motionRafControls = createRafControls(
      (args) => {
        if (!context.isPlaying.value || context.isPaused.value) {
          motionRafControls.pause()
          return
        }

        const now = args.timestamp
        if (motionStartTime.value === null) {
          motionStartTime.value = now
        }

        const elapsed = now - motionStartTime.value
        motionProgress.value = (elapsed % options.duration) / options.duration

        updateMotionPathPosition()
      },
      { immediate: false }
    )

    // Auto-start/stop motion path with animation
    const unwatchPlaying = watch(context.isPlaying, (playing) => {
      if (playing) {
        // Reset state for new cycle (initialization happens in RAF)
        motionRafControls.resume()
      } else {
        motionRafControls.pause()
        motionStartTime.value = null
      }
    })

    const system: MotionPathSystem = {
      progress: motionProgress,
      setProgress,
      pause: motionRafControls.pause,
      resume: motionRafControls.resume,
      cleanup() {
        motionRafControls.pause()
        unwatchPlaying()
        motionStartTime.value = null
        motionProgress.value = 0

        // Multi-element mode: remove CSS vars from each element
        if (isMultiElement) {
          cachedElements.forEach(el => {
            if (el) {
              el.style.removeProperty('--motion-x')
              el.style.removeProperty('--motion-y')
              el.style.removeProperty('--motion-rotation')
            }
          })
        } else {
          // Single-element mode: use shared unsetCSSVar helper
          unsetCSSVar('--motion-x')
          unsetCSSVar('--motion-y')
          unsetCSSVar('--motion-rotation')
        }
      }
    }

    return system
  },

  contributeToAPI(systems) {
    const system = systems.get('motionPath') as MotionPathSystem | undefined
    if (!system) return {}

    return {
      motionPath: {
        progress: system.progress,
        setProgress: system.setProgress
      }
    }
  }
}
