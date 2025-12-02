/**
 * Animation preset definitions
 *
 * Pure data module containing 13 animation presets with keyframes and timing options.
 * Zero dependencies - safe to import anywhere.
 */

import { ANIMATION_DURATION, EASING, FILL_MODE } from './constants/animations'
import type { AnimationPreset } from './types'

export type { AnimationPreset }

export const animationPresets = {
  slideUp: {
    keyframes: [
      { opacity: 0, transform: 'translateY(20px)' },
      { opacity: 1, transform: 'translateY(0px)' }
    ],
    options: {
      duration: ANIMATION_DURATION.NORMAL,
      easing: EASING.BOUNCE,
      fill: FILL_MODE.FORWARDS
    }
  } as AnimationPreset,

  slideDown: {
    keyframes: [
      { opacity: 0, transform: 'translateY(-20px)' },
      { opacity: 1, transform: 'translateY(0px)' }
    ],
    options: {
      duration: ANIMATION_DURATION.NORMAL,
      easing: EASING.BOUNCE,
      fill: FILL_MODE.FORWARDS
    }
  } as AnimationPreset,

  fadeIn: {
    keyframes: [
      { opacity: 0 },
      { opacity: 1 }
    ],
    options: {
      duration: ANIMATION_DURATION.FAST,
      easing: EASING.SMOOTH,
      fill: FILL_MODE.FORWARDS
    }
  } as AnimationPreset,

  fadeOut: {
    keyframes: [
      { opacity: 1 },
      { opacity: 0 }
    ],
    options: {
      duration: ANIMATION_DURATION.FAST,
      easing: EASING.SMOOTH,
      fill: FILL_MODE.FORWARDS
    }
  } as AnimationPreset,

  scaleUp: {
    keyframes: [
      { opacity: 0, transform: 'scale(0.8)' },
      { opacity: 1, transform: 'scale(1.05)' },
      { opacity: 1, transform: 'scale(1)' }
    ],
    options: {
      duration: ANIMATION_DURATION.NORMAL,
      easing: EASING.BOUNCE,
      fill: FILL_MODE.FORWARDS
    }
  } as AnimationPreset,

  scaleDown: {
    keyframes: [
      { opacity: 1, transform: 'scale(1)' },
      { opacity: 0, transform: 'scale(0.8)' }
    ],
    options: {
      duration: ANIMATION_DURATION.FAST,
      easing: EASING.EASE_OUT,
      fill: FILL_MODE.FORWARDS
    }
  } as AnimationPreset,

  scaleIn: {
    keyframes: [
      { opacity: 0, transform: 'scale(0.8)' },
      { opacity: 1, transform: 'scale(1)' }
    ],
    options: {
      duration: ANIMATION_DURATION.NORMAL,
      easing: EASING.BOUNCE,
      fill: FILL_MODE.FORWARDS
    }
  } as AnimationPreset,

  scaleOut: {
    keyframes: [
      { opacity: 1, transform: 'scale(1)' },
      { opacity: 0, transform: 'scale(0.8)' }
    ],
    options: {
      duration: ANIMATION_DURATION.FAST,
      easing: EASING.EASE_OUT,
      fill: FILL_MODE.FORWARDS
    }
  } as AnimationPreset,

  staggerFadeIn: {
    keyframes: [
      { opacity: 0, transform: 'translateY(10px)' },
      { opacity: 1, transform: 'translateY(0px)' }
    ],
    options: {
      duration: ANIMATION_DURATION.NORMAL,
      easing: EASING.SMOOTH,
      fill: FILL_MODE.FORWARDS
    }
  } as AnimationPreset,

  popIn: {
    keyframes: [
      { opacity: 0, transform: 'scale(0.5) rotate(-10deg)' },
      { opacity: 1, transform: 'scale(1.05) rotate(2deg)' },
      { opacity: 1, transform: 'scale(1) rotate(0deg)' }
    ],
    options: {
      duration: ANIMATION_DURATION.SLOW,
      easing: EASING.ELASTIC,
      fill: FILL_MODE.FORWARDS
    }
  } as AnimationPreset,

  rotate45: {
    keyframes: [
      { transform: 'rotate(0deg)' },
      { transform: 'rotate(45deg)' }
    ],
    options: {
      duration: ANIMATION_DURATION.FAST,
      easing: EASING.SMOOTH,
      fill: FILL_MODE.FORWARDS
    }
  } as AnimationPreset,

  rotateBack: {
    keyframes: [
      { transform: 'rotate(45deg)' },
      { transform: 'rotate(0deg)' }
    ],
    options: {
      duration: ANIMATION_DURATION.FAST,
      easing: EASING.SMOOTH,
      fill: FILL_MODE.FORWARDS
    }
  } as AnimationPreset,

  slideInRight: {
    keyframes: [
      { opacity: 0, transform: 'translateX(100%)' },
      { opacity: 1, transform: 'translateX(0%)' }
    ],
    options: {
      duration: ANIMATION_DURATION.NORMAL,
      easing: EASING.SHARP,
      fill: FILL_MODE.FORWARDS
    }
  } as AnimationPreset,

  slideOutRight: {
    keyframes: [
      { opacity: 1, transform: 'translateX(0%)' },
      { opacity: 0, transform: 'translateX(100%)' }
    ],
    options: {
      duration: ANIMATION_DURATION.FAST,
      easing: EASING.SHARP,
      fill: FILL_MODE.FORWARDS
    }
  } as AnimationPreset,

  slideInLeft: {
    keyframes: [
      { opacity: 0, transform: 'translateX(-100%)' },
      { opacity: 1, transform: 'translateX(0%)' }
    ],
    options: {
      duration: ANIMATION_DURATION.NORMAL,
      easing: EASING.SHARP,
      fill: FILL_MODE.FORWARDS
    }
  } as AnimationPreset,

  slideOutLeft: {
    keyframes: [
      { opacity: 1, transform: 'translateX(0%)' },
      { opacity: 0, transform: 'translateX(-100%)' }
    ],
    options: {
      duration: ANIMATION_DURATION.FAST,
      easing: EASING.SHARP,
      fill: FILL_MODE.FORWARDS
    }
  } as AnimationPreset,
} as const

export type AnimationPresetKey = keyof typeof animationPresets
