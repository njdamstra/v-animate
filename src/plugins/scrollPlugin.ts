import { ref, computed, watch, toValue, type Ref, type WatchStopHandle } from 'vue'
import { useScroll, useElementBounding, type MaybeRefOrGetter } from '@vueuse/core'
import type {
  AnimationPlugin,
  AnimationContext,
  ScrollPluginOptions,
  ScrollSystem,
  WebAnimationSystem
} from '../types'
import { useIntersectionObserverManager } from '../observers/intersectionObserverManager'

/**
 * Scroll Plugin
 *
 * Provides scroll-triggered animations and scroll-linked animation scrubbing.
 * - Trigger mode: Play/pause animations based on element visibility (IntersectionObserver)
 * - Scrub mode: Sync animation progress to scroll position
 *
 * Priority: 35 (after responsive, before autoplay)
 * Optional dependency: webAnimation (for scrub mode)
 */
export const scrollPlugin: AnimationPlugin<ScrollPluginOptions, ScrollSystem> = {
  name: 'scroll',
  version: '1.0.0',
  priority: 35,
  optionsKey: 'scroll',
  optionalRequires: ['webAnimation'],
  provides: ['scroll.position', 'scroll.progress', 'scroll.direction'],

  setup(context: AnimationContext, options: ScrollPluginOptions): ScrollSystem {
    const target = computed(() => toValue(context.target))
    const container = toValue(options.container) ?? (typeof window !== 'undefined' ? window : undefined)

    // Initialize VueUse scroll tracking (100ms default throttle prevents perf cliff)
    const { x, y, isScrolling, directions } = useScroll(container, {
      throttle: options.throttle ?? 100,
      idle: 200,
      behavior: 'smooth'
    })

    // Track element bounding box for progress calculation
    const elementBounds = useElementBounding(target)

    // Calculate scroll progress (0-1) based on element position relative to viewport
    // Progress is 0 when element top reaches viewport top, 1 when element bottom reaches viewport bottom
    // Note: getBoundingClientRect() returns values relative to viewport, not document
    const scrollProgress = computed(() => {
      const targetEl = target.value
      if (!targetEl || typeof window === 'undefined') return 0

      const containerHeight = container instanceof Window ? window.innerHeight : (container as HTMLElement).clientHeight

      // Get element position relative to viewport (getBoundingClientRect is viewport-relative)
      if (!elementBounds.height.value) return 0

      const elementTop = elementBounds.top.value
      const elementBottom = elementBounds.bottom.value
      const elementHeight = elementBounds.height.value

      // Element is completely above viewport (bottom is negative or 0)
      if (elementBottom <= 0) return 0
      // Element is completely below viewport (top is greater than viewport height)
      if (elementTop >= containerHeight) return 1

      // Element is in viewport - calculate progress
      // Progress = 0 when element top aligns with viewport top (elementTop = 0)
      // Progress = 1 when element bottom aligns with viewport bottom (elementBottom = containerHeight)
      const scrollRange = containerHeight + elementHeight
      // Distance scrolled: when elementTop = 0, scrolledDistance = containerHeight
      // when elementBottom = containerHeight, scrolledDistance = scrollRange
      const scrolledDistance = containerHeight - elementTop

      // Normalize to 0-1 range
      const progress = Math.max(0, Math.min(1, scrolledDistance / scrollRange))
      return progress
    })

    // Create scroll system
    const system: ScrollSystem = {
      position: computed(() => ({ x: x.value, y: y.value })),
      progress: scrollProgress as Ref<number>,
      isScrolling,
      direction: computed(() => ({
        up: directions.top,
        down: directions.bottom
      })),

      scrollTo: (opts) => {
        const scrollContainer = container instanceof Window ? window : container as HTMLElement
        if (!scrollContainer) return

        if (opts.behavior) {
          // Use scrollTo with behavior option
          if (scrollContainer instanceof Window) {
            scrollContainer.scrollTo({
              top: opts.y ?? scrollContainer.scrollY,
              left: opts.x ?? scrollContainer.scrollX,
              behavior: opts.behavior
            })
          } else {
            scrollContainer.scrollTo({
              top: opts.y ?? scrollContainer.scrollTop,
              left: opts.x ?? scrollContainer.scrollLeft,
              behavior: opts.behavior
            })
          }
        } else {
          // Direct assignment (VueUse handles this)
          if (opts.y !== undefined) y.value = opts.y
          if (opts.x !== undefined) x.value = opts.x
        }
      },

      refresh: () => {
        // Trigger recomputation by updating element bounds
        elementBounds.update()
      },

      cleanup: () => {
        // VueUse handles cleanup automatically when target becomes null
      }
    }

    // Store in sharedData for other plugins
    context.sharedData.set('scroll.position', { x, y })
    context.sharedData.set('scroll.progress', scrollProgress)
    context.sharedData.set('scroll.direction', system.direction)
    context.sharedData.set('scroll.system', system)

    return system
  },

  registerWatchers(context: AnimationContext) {
    const watchers: WatchStopHandle[] = []
    const options = context.options.scroll as ScrollPluginOptions
    const system = context.sharedData.get('scroll.system') as ScrollSystem

    if (!options || !system) return []

    // Get orchestrator controls
    const play = context.sharedData.get<() => void | Promise<void>>('orchestrator.play')
    const pause = context.sharedData.get<() => void>('orchestrator.pause')

    // TRIGGER MODE: IntersectionObserver-based visibility triggering (uses pooled manager)
    if (options.trigger) {
      const target = toValue(context.target)
      if (!target) return watchers

      let isInView = false
      let previousScrollY = system.position.value.y

      // Use pooled IntersectionObserverManager instead of creating individual observer
      const manager = useIntersectionObserverManager()
      const unobserve = manager.observe(
        target,
        {
          threshold: options.trigger.threshold ?? 0.25,
          rootMargin: '0px'
        },
        (entry) => {
          const wasInView = isInView
          isInView = entry.isIntersecting

          // Detect scroll direction by comparing scroll positions
          const currentScrollY = system.position.value.y
          const scrollDirection = currentScrollY > previousScrollY ? 'down' :
                                 currentScrollY < previousScrollY ? 'up' :
                                 system.direction.value.down ? 'down' : 'up'
          previousScrollY = currentScrollY

          if (isInView && !wasInView) {
            // Entering viewport
            if (scrollDirection === 'down') {
              options.trigger?.onEnter?.()
              play?.()
            } else {
              options.trigger?.onEnterBack?.()
              play?.()
            }
          } else if (!isInView && wasInView) {
            // Leaving viewport
            if (scrollDirection === 'down') {
              options.trigger?.onLeave?.()
              if (!options.scrub) pause?.()
            } else {
              options.trigger?.onLeaveBack?.()
              if (!options.scrub) pause?.()
            }
          }
        }
      )

      watchers.push(unobserve)
    }

    // SCRUB MODE: Sync animation progress to scroll position
    if (options.scrub) {
      const webAnimationSystem = context.sharedData.get('webAnimation.system') as WebAnimationSystem

      if (!webAnimationSystem) {
        console.warn('[scrollPlugin] scrub mode requires webAnimationPlugin')
      } else {
        // Watch scroll progress and update animation currentTime
        const stopProgressWatch = watch(system.progress, (progress) => {
          const animation = webAnimationSystem.animation?.value
          if (animation) {
            const timing = animation.effect?.getTiming()
            const duration = (timing?.duration as number) ?? 1000

            // Sync animation to scroll progress
            animation.currentTime = duration * progress

            // Pause animation so it doesn't auto-play
            if (animation.playState === 'running') {
              animation.pause()
            }
          }
        }, { immediate: true })

        watchers.push(stopProgressWatch)
      }
    }

    // onUpdate callback
    if (options.onUpdate) {
      const stopUpdateWatch = watch(system.progress, (progress) => {
        options.onUpdate?.(progress)
      })
      watchers.push(stopUpdateWatch)
    }

    return watchers
  },

  contributeToAPI(systems) {
    const scrollSystem = systems.get('scroll') as ScrollSystem
    if (!scrollSystem) return {}

    return {
      scroll: {
        position: scrollSystem.position,
        progress: scrollSystem.progress,
        isScrolling: scrollSystem.isScrolling,
        direction: scrollSystem.direction,
        scrollTo: scrollSystem.scrollTo.bind(scrollSystem),
        refresh: scrollSystem.refresh.bind(scrollSystem)
      }
    }
  }
}
