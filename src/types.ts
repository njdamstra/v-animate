/**
 * Shared type definitions for useAnimation system
 * Re-exports from organized type modules
 */

// Re-export core types
export type {
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
  AnimationPreset,
  UseAnimationStaggerOptions
} from './types/core'

// Re-export plugin types
export type {
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
} from './types/plugins'

// FillMode type for Web Animations API
export type FillMode = 'none' | 'forwards' | 'backwards' | 'both' | 'auto'
