import { toValue } from '@vueuse/core'
import type { UseAnimationAutoplayOptions, UseAnimationAutoplayBehaviorOptions, UseAnimationResponsiveOptions, UseAnimationStaggerOptions } from '../types'

/**
 * Centralized defaulting for common plugin options to reduce per-plugin boilerplate.
 */
export function normalizeAutoplay(
  options: UseAnimationAutoplayOptions = {},
  overrides: Partial<UseAnimationAutoplayOptions> = {}
): Required<Omit<UseAnimationAutoplayOptions, 'sentinel' | 'visibilityOverride'>> & Pick<UseAnimationAutoplayOptions, 'sentinel' | 'visibilityOverride'> {
  const merged = { ...options, ...overrides }
  const behavior = toValue(merged.behavior) as UseAnimationAutoplayBehaviorOptions | undefined
  return {
    threshold: merged.threshold ?? 0.25,
    enabled: merged.enabled ?? true,
    includeNavigation: merged.includeNavigation ?? false,
    debounceMs: merged.debounceMs ?? 150,
    adaptiveDebounce: merged.adaptiveDebounce ?? true,
    maxAdaptiveDebounce: merged.maxAdaptiveDebounce ?? 500,
    behavior: {
      visibility: behavior?.visibility ?? 'stop',
      environment: behavior?.environment ?? 'stop'
    },
    sentinel: merged.sentinel,
    visibilityOverride: merged.visibilityOverride,
    observeTarget: merged.observeTarget ?? true
  }
}

export function normalizeResponsive(options: boolean | UseAnimationResponsiveOptions = {}): UseAnimationResponsiveOptions {
  if (options === true || options === undefined) return {}
  return options as UseAnimationResponsiveOptions
}

export function normalizeStagger(options: UseAnimationStaggerOptions): UseAnimationStaggerOptions {
  return {
    ...options,
    delay: options.delay ?? 0,
    from: options.from ?? 'start',
    ease: options.ease ?? 'linear',
    loop: options.loop ?? false,
    loopDelay: options.loopDelay ?? 0,
    resetOnRestart: options.resetOnRestart ?? false
  }
}
