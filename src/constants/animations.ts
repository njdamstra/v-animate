/**
 * Shared animation constants for Tailwind CSS and VueUse composables
 *
 * These values are read from CSS custom properties defined in @theme.
 * This ensures a single source of truth between CSS-based animations (Tailwind)
 * and JavaScript-based animations (useAnimation composable).
 *
 * Research-based timing from UI_ENHANCEMENTS.md:
 * - INSTANT: 100ms - Quick feedback (hover acknowledgment)
 * - FAST: 200ms (--transition-duration-fast) - Button hovers, simple selections
 * - NORMAL: 300ms (--transition-duration-medium) - Standard transitions, most animations
 * - SLOW: 500ms (--transition-duration-slow) - Page transitions (max recommended)
 * - CELEBRATION: 2000ms (--transition-duration-celebration) - Success celebrations, confetti
 */

/**
 * Helper to get animation duration from CSS custom properties
 * Falls back to hardcoded values for SSR/server environments
 */
const getCssDuration = (varName: string, fallback: number): number => {
  if (typeof document === 'undefined') return fallback;

  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim();

  if (!value) return fallback;

  // Parse ms values (e.g., "200ms")
  return parseInt(value);
};

export const ANIMATION_DURATION = {
  INSTANT: 100, // Not in CSS, keep as constant
  get FAST() { return getCssDuration('--transition-duration-fast', 200); },
  get NORMAL() { return getCssDuration('--transition-duration-medium', 300); },
  get SLOW() { return getCssDuration('--transition-duration-slow', 500); },
  get CELEBRATION() { return getCssDuration('--transition-duration-celebration', 2000); }
} as const

/**
 * Easing functions for smooth, natural motion
 *
 * - EASE_OUT: Most common (decelerating, snappy end)
 * - EASE_IN_OUT: Smooth start and end (transformations)
 * - BOUNCE: Playful overshoot (success states, selections)
 */
export const EASING = {
  EASE_OUT: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
  EASE_IN_OUT: 'cubic-bezier(0.42, 0, 0.58, 1)',
  BOUNCE: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  SMOOTH: 'cubic-bezier(0.16, 1, 0.3, 1)',
  SHARP: 'cubic-bezier(0.4, 0, 0.2, 1)',
  ELASTIC: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)'
} as const

/**
 * Animation fill modes for Web Animations API
 */
export const FILL_MODE = {
  FORWARDS: 'forwards',
  BACKWARDS: 'backwards',
  BOTH: 'both',
  NONE: 'none'
} as const

/**
 * Timing presets for common animation patterns
 */
export const TIMING_PRESETS = {
  // Quick interactions
  HOVER: {
    duration: ANIMATION_DURATION.FAST,
    easing: EASING.EASE_OUT
  },
  // Standard transitions
  TRANSITION: {
    duration: ANIMATION_DURATION.NORMAL,
    easing: EASING.EASE_OUT
  },
  // Bouncy selections
  SELECTION: {
    duration: ANIMATION_DURATION.NORMAL,
    easing: EASING.BOUNCE
  },
  // Smooth slides
  SLIDE: {
    duration: ANIMATION_DURATION.NORMAL,
    easing: EASING.SHARP
  },
  // Playful pops
  POP: {
    duration: ANIMATION_DURATION.SLOW,
    easing: EASING.ELASTIC
  }
} as const

/**
 * Type exports for TypeScript
 */
export type AnimationDuration = typeof ANIMATION_DURATION[keyof typeof ANIMATION_DURATION]
export type AnimationEasing = typeof EASING[keyof typeof EASING]
export type AnimationFillMode = typeof FILL_MODE[keyof typeof FILL_MODE]

/**
 * Type definition for conductor-specific animation events
 * Used by AiConductorGraphicV2 and child components for event coordination
 */
export type ConductorAnimationEvents = {
  'orchestrate-start': { mode: 'rotation' | 'unison', cycleDuration: number }
  'orb-pulse': { intensity: number }
  'pathway-activate': { index: number, provider: string, delay: number, mode: 'rotation' | 'unison' }
  'spark-travel': { pathwayIndex: number, duration: number }
  'icon-pulse': { pathwayIndex: number, intensity: number }
  'bubble-cycle-start': undefined
  'animation-complete': { component: string, type: 'enter' | 'exit' }
  'stop-all': undefined
}
