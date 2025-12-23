/**
 * @njdamstra/v-animate
 * Vue 3 animation composable with plugin-based architecture
 */

// Main composable
export { useAnimation, preloadPlugins } from './useAnimation'

// Supporting composable
export { useEnvironment, createAutoPauseWatcher } from './composables/useEnvironment'

// Animation creation utilities
export { createAnimation } from './createAnimation'
export type { CreateAnimationOptions, CreateAnimationReturn } from './createAnimation'

// RAF coordination utilities
export { createRafControls, type RafControls } from './rafCoordinator'

// Presets
export { animationPresets } from './presets'
export type { AnimationPreset, AnimationPresetKey } from './presets'

// Constants (user can override)
export {
  ANIMATION_DURATION,
  EASING,
  FILL_MODE,
  TIMING_PRESETS
} from './constants/animations'

// Re-export all types from central types file
export type {
  // Core types
  UseAnimateKeyframes,
  UseAnimateOptions,
  AnimationQuality,
  UseAnimationLifecycleOptions,
  UseAnimationEventsOptions,
  UseAnimationOptions,
  UseCSSAnimationOptions,
  SharedDataStore,
  AnimationContext,
  PluginSystem,
  AnimationPlugin,
  PluginSetupResult,
  UseAnimationReturn,
  UseAnimationStaggerOptions,
  FillMode,

  // Plugin types
  UseAnimationWebAnimationOptions,
  WebAnimationSystem,
  ResponsiveDimensions,
  UseAnimationResponsiveOptions,
  ResponsiveSystem,
  StaggerPluginOptions,
  StaggerSystem,
  CSSVarTracking,
  CSSVarsPluginOptions,
  CSSVarsSystem,
  UseAnimationAutoplayBehavior,
  UseAnimationAutoplayBehaviorOptions,
  UseAnimationAutoplayOptions,
  AutoplaySystem,
  ScrollTriggerOptions,
  ScrollPluginOptions,
  ScrollSystem,
  PhaseContext,
  TimelinePhase,
  TimelinePluginOptions,
  TimelineSystem,
  PhaseState,
  UseAnimationSequenceOptions,
  SequenceSystem,
  UseAnimationMotionPathOptions,
  MotionPathSystem,
  UseAnimationSVGOptions,
  SvgSystem,
  UseAnimationGridOptions,
  GridSystem,
  UseAnimationEnterExitOptions,
  EnterExitSystem,
  ProgressSystem,
  ElementTarget,
  TrackingMode,
  UpdateMode,
  RelationshipConnection,
  ConnectionData,
  RelationshipsPluginOptions,
  RelationshipsSystem,
  CSSAnimationSystem
} from './types'

// Environment types
export type { UseAnimationEnvironmentOptions } from './composables/useEnvironment'
