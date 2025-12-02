import { ref, reactive, toValue, type Ref, type ComputedRef } from 'vue'
import { type MaybeRefOrGetter } from '@vueuse/core'
import type {
  AnimationPlugin,
  AnimationContext,
  PluginSystem,
  TimelinePhase,
  PhaseContext,
  TimelinePluginOptions,
  TimelineSystem
} from '../types'
import { animationPresets } from '../presets'
import { ANIMATION_DURATION, EASING } from '../constants/animations'
import { createRafControls } from '../rafCoordinator'

/**
 * Internal phase state tracking
 */
interface PhaseState {
  started: boolean
  completed: boolean
  animations: Animation[]
  lastProgress: number
}

/**
 * Timeline Plugin - Declarative multi-phase animation orchestration.
 *
 * Priority: 40 | Options: `timeline` | Optional: webAnimation
 *
 * Modes: sequential (phases chain), parallel (all start together), staggered (overlapping cascade)
 * Each phase: { name, target, delay, duration, animation?, onStart?, onComplete?, onProgress? }
 *
 * API: phases, currentPhase, currentCycle, cycleProgress
 * Supports loop, loopDelay, cycleDuration for infinite sequences.
 *
 * @example timeline: { cycleDuration: 3000, phases: [{ name: 'a', target: ref, delay: 0, duration: 500 }] }
 */
export const timelinePlugin: AnimationPlugin<TimelinePluginOptions, TimelineSystem> = {
  name: 'timeline',
  version: '1.0.0',
  priority: 40,
  optionalRequires: ['webAnimation'],

  setup(context: AnimationContext, options: TimelinePluginOptions): TimelineSystem {
    // Reactive state
    const phases = ref<TimelinePhase[]>(options.phases || [])
    const currentPhase = ref<string | null>(null)
    const currentCycle = ref(0)
    const cycleProgress = ref(0)

    // Internal state tracking
    const phaseStates = reactive<Map<string, PhaseState>>(new Map())
    const timelineState = reactive({
      startTime: 0,
      delayStartTime: 0,
      isInDelay: false
    })

    // Initialize phase states
    const initializePhaseStates = () => {
      phaseStates.clear()
      phases.value.forEach(phase => {
        phaseStates.set(phase.name, {
          started: false,
          completed: false,
          animations: [],
          lastProgress: 0
        })
      })
    }

    /**
     * Resolve target element(s) from MaybeRefOrGetter
     */
    const resolvePhaseTargets = (target: MaybeRefOrGetter<HTMLElement | HTMLElement[] | null>): HTMLElement[] => {
      const resolved = toValue(target)
      if (!resolved) return []
      return Array.isArray(resolved) ? resolved : [resolved]
    }

    /**
     * Activate a single phase
     */
    const activatePhase = (phase: TimelinePhase, elapsed: number) => {
      const state = phaseStates.get(phase.name)
      if (!state || state.started) return

      const targets = resolvePhaseTargets(phase.target)
      if (targets.length === 0) return

      state.started = true
      currentPhase.value = phase.name

      // Create phase context
      const phaseContext: PhaseContext = {
        phaseName: phase.name,
        phaseIndex: phases.value.findIndex(p => p.name === phase.name),
        cycleIndex: currentCycle.value,
        elapsed,
        progress: 0,
        targets
      }

      // Emit phase start event
      if (options.events?.onPhaseStart) {
        options.events.onPhaseStart(phase.name)
      }

      // Call onStart callback
      if (phase.onStart) {
        phase.onStart(phaseContext)
      }

      // Create animations if configured
      if (phase.animation && !context.canAnimate.value) {
        // Skip animation, just mark as started
        return
      }

      if (phase.animation) {
        const preset = phase.animation.preset || 'fadeIn'
        const presetConfig = animationPresets[preset as keyof typeof animationPresets]
        const keyframes = phase.animation.keyframes || presetConfig?.keyframes

        let duration = phase.animation.duration || phase.duration || ANIMATION_DURATION.NORMAL

        // Apply quality-based duration scaling
        const effectiveDuration = duration * (
          context.animationQuality.value === 'low' ? 0.3 :
          context.animationQuality.value === 'medium' ? 0.6 : 1
        )

        const easing = phase.animation.easing || EASING.EASE_OUT

        // Create Web Animation for each target
        targets.forEach(target => {
          if (!target) return

          const anim = target.animate(keyframes as Keyframe[], {
            duration: Math.max(1, effectiveDuration),
            easing: easing,
            fill: 'forwards' as FillMode
          })

          state.animations.push(anim)
        })
      }
    }

    /**
     * Update phase progress
     */
    const updatePhaseProgress = (phase: TimelinePhase, elapsed: number) => {
      const state = phaseStates.get(phase.name)
      if (!state || !state.started || state.completed) return

      const phaseElapsed = elapsed - phase.delay
      const progress = Math.min(1, Math.max(0, phaseElapsed / phase.duration))

      // Only call onProgress if progress changed significantly (>1%)
      if (phase.onProgress && Math.abs(progress - state.lastProgress) > 0.01) {
        const phaseContext: PhaseContext = {
          phaseName: phase.name,
          phaseIndex: phases.value.findIndex(p => p.name === phase.name),
          cycleIndex: currentCycle.value,
          elapsed: phaseElapsed,
          progress,
          targets: resolvePhaseTargets(phase.target)
        }

        phase.onProgress(progress, phaseContext)
        state.lastProgress = progress
      }

      // Check if phase completed
      if (phaseElapsed >= phase.duration && !state.completed) {
        state.completed = true

        const phaseContext: PhaseContext = {
          phaseName: phase.name,
          phaseIndex: phases.value.findIndex(p => p.name === phase.name),
          cycleIndex: currentCycle.value,
          elapsed: phaseElapsed,
          progress: 1,
          targets: resolvePhaseTargets(phase.target)
        }

        // Call onComplete callback
        if (phase.onComplete) {
          phase.onComplete(phaseContext)
        }

        // Emit phase complete event
        if (options.events?.onPhaseComplete) {
          options.events.onPhaseComplete(phase.name)
        }
      }
    }

    /**
     * Check if all phases completed
     */
    const allPhasesCompleted = (): boolean => {
      return Array.from(phaseStates.values()).every(state => state.completed)
    }

    /**
     * Reset timeline for new cycle
     */
    const resetTimeline = () => {
      initializePhaseStates()
      timelineState.startTime = 0
      timelineState.isInDelay = false
      currentPhase.value = null
      cycleProgress.value = 0
    }

    // RAF-based timeline orchestrator
    const timelineRaf = createRafControls(({ timestamp }) => {
      if (!context.isPlaying.value) {
        timelineRaf.pause()
        return
      }

      // Handle loop delay
      if (timelineState.isInDelay) {
        const delayElapsed = timestamp - timelineState.delayStartTime

        if (delayElapsed >= (options.loopDelay || 0)) {
          // Delay complete, start new cycle
          timelineState.isInDelay = false
          resetTimeline()
          currentCycle.value++

          if (options.events?.onCycleStart) {
            options.events.onCycleStart()
          }

          timelineState.startTime = timestamp
        }
        return
      }

      // Initialize start time on first frame
      if (timelineState.startTime === 0) {
        timelineState.startTime = timestamp

        if (options.events?.onCycleStart) {
          options.events.onCycleStart()
        }
      }

      const elapsed = timestamp - timelineState.startTime
      cycleProgress.value = Math.min(1, elapsed / options.cycleDuration)

      // Process each phase
      phases.value.forEach(phase => {
        // Check if phase should start
        if (elapsed >= phase.delay) {
          activatePhase(phase, elapsed)
        }

        // Update phase progress
        if (elapsed >= phase.delay) {
          updatePhaseProgress(phase, elapsed)
        }
      })

      // Check if cycle completed
      if (elapsed >= options.cycleDuration || allPhasesCompleted()) {
        if (options.events?.onCycleComplete) {
          options.events.onCycleComplete()
        }

        // Handle looping
        if (options.loop && context.isPlaying.value) {
          if (options.loopDelay && options.loopDelay > 0) {
            // Enter delay state
            timelineState.isInDelay = true
            timelineState.delayStartTime = timestamp
          } else {
            // Immediate restart
            resetTimeline()
            currentCycle.value++
            timelineState.startTime = timestamp

            if (options.events?.onCycleStart) {
              options.events.onCycleStart()
            }
          }
        } else {
          // Stop timeline
          timelineRaf.pause()
          context.isPlaying.value = false
        }
      }
    }, { immediate: false })

    const system: TimelineSystem = {
      phases,
      currentPhase,
      currentCycle,
      cycleProgress,

      play() {
        initializePhaseStates()
        context.isPlaying.value = true
        timelineRaf.resume()
        return Promise.resolve()
      },

      stop() {
        timelineRaf.pause()
        context.isPlaying.value = false

        // Cancel all active animations and clear references
        phaseStates.forEach(state => {
          state.animations.forEach(anim => {
            try {
              anim.cancel()
            } catch (e) {
              // Animation may already be finished, ignore
            }
          })
          state.animations = []
          state.started = false
          state.completed = false
        })

        resetTimeline()
        currentCycle.value = 0
      },

      pause() {
        timelineRaf.pause()
        context.isPaused.value = true
      },

      resume() {
        if (!context.isPaused.value) return
        context.isPaused.value = false
        timelineRaf.resume()
      },

      cleanup() {
        this.stop?.()
        timelineRaf.pause()
        phaseStates.clear()
      }
    }

    return system
  },

  contributeToAPI(systems) {
    const system = systems.get('timeline') as TimelineSystem | undefined
    if (!system) return {}

    return {
      timeline: {
        phases: system.phases,
        currentPhase: system.currentPhase,
        currentCycle: system.currentCycle,
        cycleProgress: system.cycleProgress
      }
    }
  }
}
