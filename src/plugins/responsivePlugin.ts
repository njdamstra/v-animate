import { ref, computed, watch, toValue, readonly, type Ref, type ComputedRef } from 'vue'
import type {
  AnimationPlugin,
  AnimationContext,
  ResponsiveDimensions,
  UseAnimationResponsiveOptions,
  ResponsiveSystem
} from '../types'
import { useResizeObserverManager } from '../observers'

/**
 * Responsive Plugin - Container-aware animation scaling.
 *
 * Priority: 100 (first) | Options: `responsive` | Provides: responsive.scale, responsive.dimensions
 *
 * Scales timing/values based on container size via ResizeObserver.
 * Scale = containerWidth / baselineWidth (clamped to minScale..maxScale)
 *
 * API: dimensions, scaleValue(n), getResponsiveRadius(r), getResponsiveOffset({x,y}), scaled
 *
 * @example responsive: true // defaults: baselineWidth=1440, minScale=0.5, maxScale=1.5
 * @example responsive: { baselineWidth: 1920, mobileOverrides: { duration: 200 } }
 */
export const responsivePlugin: AnimationPlugin<UseAnimationResponsiveOptions, ResponsiveSystem> = {
  name: 'responsive',
  version: '1.0.0',
  priority: 100, // Initialize first (provides data to others)
  provides: ['responsive.scale', 'responsive.dimensions'],

  setup(context: AnimationContext, options: UseAnimationResponsiveOptions): ResponsiveSystem {
    // Default options
    const config = {
      enabled: true,
      baselineWidth: 1440,
      baselineHeight: options.baselineHeight || options.baselineWidth || 1440, // Default to baselineWidth for backward compat
      measureTarget: 'self' as const, // Default: measure self (backward compatible)
      minScale: 0.5,
      maxScale: 1.5,
      debounce: 100,
      scalingMode: 'width' as const, // Default: width-only (backward compatible)
      mobileBreakpoint: 768,
      ...options
    }

    const dimensions = ref<ResponsiveDimensions>({
      width: 0,
      height: 0,
      scale: 1,
      widthScale: 1,
      heightScale: 1,
      effectiveScale: 1,
      aspectRatio: 1,
      constraintMode: 'width'
    })

    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    let stopObserving: (() => void) | null = null
    let isCleanedUp = false
    const resizeManager = useResizeObserverManager()

    const handleResize = (entry: ResizeObserverEntry) => {
      if (debounceTimer) clearTimeout(debounceTimer)

      debounceTimer = setTimeout(() => {
        // Guard against cleanup race condition
        if (isCleanedUp) return

        try {
          const { width, height } = entry.contentRect

          // Validate dimensions are positive numbers
          if (!width || !height || width <= 0 || height <= 0) {
            return
          }

          // Calculate both width and height scales
          const widthScale = width / config.baselineWidth
          const heightScale = height / config.baselineHeight

          // Determine effective scale based on scalingMode
          let effectiveScale: number
          let constraintMode: 'width' | 'height' | 'both'

          // Handle legacy 'container' mode as 'width' for backward compat
          const mode = config.scalingMode === 'container' ? 'width' : config.scalingMode

          if (mode === 'width') {
            effectiveScale = widthScale
            constraintMode = 'width'
          } else if (mode === 'height') {
            effectiveScale = heightScale
            constraintMode = 'height'
          } else if (mode === 'both') {
            // Use most constrained dimension (smallest scale)
            effectiveScale = Math.min(widthScale, heightScale)
            constraintMode = widthScale < heightScale ? 'width' : (widthScale > heightScale ? 'height' : 'both')
          } else {
            // Fallback to width for unhandled modes (viewport, svg, grid - future)
            effectiveScale = widthScale
            constraintMode = 'width'
          }

          // Clamp effective scale
          const clampedScale = Math.max(
            config.minScale,
            Math.min(config.maxScale, effectiveScale)
          )

          dimensions.value = {
            width,
            height,
            scale: clampedScale,  // Effective scale
            widthScale,           // Raw width scale (for diagnostics)
            heightScale,          // Raw height scale (for diagnostics)
            effectiveScale: clampedScale,
            aspectRatio: width / height || 1,
            constraintMode
          }
        } catch (error) {
          // Silently handle ResizeObserver errors to prevent crashes
          // Only log if not cleaned up (to avoid console spam during cleanup)
          if (!isCleanedUp) {
            console.warn('[responsivePlugin] resize update failed:', error)
          }
        }
      }, config.debounce)
    }

    // Consolidated helpers - single dependency graph for all scale-related computations
    const helpers = computed(() => {
      const currentScale = dimensions.value.scale
      const currentWidth = dimensions.value.width || config.baselineWidth

      const scaleValueFn = (baseValue: number) => baseValue * currentScale

      return {
        scaleValue: scaleValueFn,
        getResponsiveRadius: (baseRadius: number) => Math.round(scaleValueFn(baseRadius)),
        getResponsiveOffset: (baseOffset: { x: number; y: number }) => ({
          x: Math.round(scaleValueFn(baseOffset.x)),
          y: Math.round(scaleValueFn(baseOffset.y))
        }),
        scaled: config.baseValues
          ? Object.fromEntries(
              Object.entries(config.baseValues).map(([key, val]) => {
                let result = Math.round(val * currentScale)
                if (currentWidth < config.mobileBreakpoint && config.mobileOverrides?.[key]) {
                  result = Math.max(result, config.mobileOverrides[key])
                }
                return [key, result]
              })
            )
          : {}
      }
    })

    // Expose as individual refs for API compatibility
    const scale = computed(() => dimensions.value.scale)
    const scaleValue = computed(() => helpers.value.scaleValue)
    const getResponsiveRadius = computed(() => helpers.value.getResponsiveRadius)
    const getResponsiveOffset = computed(() => helpers.value.getResponsiveOffset)
    const scaled = computed(() => helpers.value.scaled)

    // Publish to shared data for other plugins
    context.sharedData.set('responsive.scale', scale)
    context.sharedData.set('responsive.dimensions', dimensions)

    // Setup ResizeObserver via watcher
    const setupObserver = (element: HTMLElement) => {
      stopObserving?.()

      // Determine what element to observe based on measureTarget option
      const elementToObserve = config.measureTarget === 'parent' && element.parentElement
        ? element.parentElement
        : element

      stopObserving = resizeManager.observe(elementToObserve, handleResize)

      // Initial measurement
      const rect = elementToObserve.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        handleResize({
          contentRect: rect,
          target: elementToObserve
        } as unknown as ResizeObserverEntry)
      }
    }

    const teardownObserver = () => {
      stopObserving?.()
      stopObserving = null
    }

    const system: ResponsiveSystem = {
      dimensions,
      scale,
      scaleValue,
      getResponsiveRadius,
      getResponsiveOffset,
      scaled,

      cleanup() {
        isCleanedUp = true
        if (debounceTimer) {
          clearTimeout(debounceTimer)
          debounceTimer = null
        }
        teardownObserver()
      }
    }

    context.sharedData.set('responsive.system', system)

    // Store initial setup/teardown functions for watcher
    ;(system as any)._setupObserver = setupObserver
    ;(system as any)._teardownObserver = teardownObserver

    return system
  },

  registerWatchers(context: AnimationContext) {
    const system = context.sharedData.get<ResponsiveSystem>('responsive.system')
    if (!system) return []

    const setupObserver = (system as any)._setupObserver
    const teardownObserver = (system as any)._teardownObserver

    // Watch target element changes
    const stopWatcher = watch(
      () => toValue(context.target),
      (element) => {
        if (!element) {
          teardownObserver()
          return
        }

        setupObserver(element)
      },
      { immediate: true }
    )

    return [stopWatcher]
  },

  contributeToAPI(systems) {
    const system = systems.get('responsive') as ResponsiveSystem | undefined
    if (!system) return {}

    // Wrap in 'responsive' object for backward compatibility
    return {
      responsive: {
        dimensions: system.dimensions,
        scaleValue: system.scaleValue,
        getResponsiveRadius: system.getResponsiveRadius,
        getResponsiveOffset: system.getResponsiveOffset,
        scaled: system.scaled
      }
    }
  }
}
