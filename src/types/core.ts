/**
 * Core type definitions for useAnimation system
 * Plugin architecture types and core interfaces
 */

import type { Ref, ComputedRef, ComponentInternalInstance, WatchStopHandle } from 'vue'
import type { MaybeRefOrGetter, UseAnimateKeyframes, UseAnimateOptions } from '@vueuse/core'
import type { UseAnimationEnvironmentOptions } from '../composables/useEnvironment'
import type {
  UseAnimationAutoplayOptions,
  UseAnimationEnterExitOptions,
  UseAnimationGridOptions,
  UseAnimationMotionPathOptions,
  UseAnimationResponsiveOptions,
  UseAnimationSequenceOptions,
  UseAnimationSVGOptions,
  UseAnimationWebAnimationOptions,
  CSSVarsPluginOptions,
  CSSVarsSystem,
  GridSystem,
  RelationshipsPluginOptions,
  RelationshipsSystem,
  ResponsiveDimensions,
  SvgSystem,
  TimelinePluginOptions
} from './plugins'

// Re-export VueUse types
export type { UseAnimateKeyframes, UseAnimateOptions }

/**
 * Animation quality level based on environment detection
 */
export type AnimationQuality = 'none' | 'low' | 'medium' | 'high'

/**
 * Lifecycle callback options
 */
export interface UseAnimationLifecycleOptions {
  beforePlay?: () => void | Promise<void>
  afterPlay?: () => void
  beforePause?: () => void
  afterPause?: () => void
  beforeStop?: () => void
  afterStop?: () => void
  onProgress?: (progress: number) => void
  beforeResume?: () => void
  afterResume?: () => void
}

export interface UseAnimationEventsOptions {
  busName?: string
}

/**
 * Base options interface (extended by plugins)
 */
export interface UseAnimationOptions<T = any, TElement = any> {
  [key: string]: any
  autoplay?: boolean | MaybeRefOrGetter<boolean> | UseAnimationAutoplayOptions
  events?: UseAnimationEventsOptions
  stateName?: string
  initialState?: Record<string, any>
  environment?: boolean | UseAnimationEnvironmentOptions
  respectEnvironment?: boolean | UseAnimationEnvironmentOptions
  critical?: boolean
  playWhen?: MaybeRefOrGetter<boolean>
  animation?: UseAnimationWebAnimationOptions
  sequence?: UseAnimationSequenceOptions<T>
  stagger?: UseAnimationStaggerOptions
  motionPath?: UseAnimationMotionPathOptions
  enterExit?: UseAnimationEnterExitOptions
  lifecycle?: UseAnimationLifecycleOptions
  onStart?: () => void
  onStop?: () => void
  onComplete?: () => void
  responsive?: boolean | UseAnimationResponsiveOptions
  svg?: UseAnimationSVGOptions
  grid?: UseAnimationGridOptions
  timeline?: TimelinePluginOptions
  cssVars?: CSSVarsPluginOptions
  relationships?: RelationshipsPluginOptions
  cssAnimation?: UseCSSAnimationOptions
  /**
   * Optional list of plugin names to activate (defaults to all built-ins).
   */
  plugins?: string[]
}

/**
 * CSS-based animation options
 */
export interface UseCSSAnimationOptions {
  preset?: string
  className?: string
  duration?: number
  delay?: number
  easing?: string
  iterationCount?: number | 'infinite'
  direction?: 'normal' | 'reverse' | 'alternate' | 'alternate-reverse'
  fillMode?: 'none' | 'forwards' | 'backwards' | 'both'
  onStart?: () => void
  onComplete?: () => void
  onCancel?: () => void
  onIteration?: () => void
}

/**
 * Shared data store for cross-plugin communication
 */
export interface SharedDataStore {
  set<T>(key: string, value: T): void
  get<T>(key: string): T | undefined
  has(key: string): boolean
  delete(key: string): void
  clear(): void
}

/**
 * Animation context shared by all plugins
 */
export interface AnimationContext {
  target: MaybeRefOrGetter<HTMLElement | undefined>
  options: UseAnimationOptions
  isPlaying: Ref<boolean>
  isPaused: Ref<boolean>
  state: any
  lifecycle: UseAnimationLifecycleOptions
  canAnimate: ComputedRef<boolean>
  animationQuality: ComputedRef<AnimationQuality>
  shouldPauseAnimations: ComputedRef<boolean>
  sharedData: SharedDataStore
  instanceId: symbol
  componentInstance: ComponentInternalInstance | null
}

/**
 * Plugin system interface - methods returned by plugin.setup()
 */
export interface PluginSystem {
  play?: () => void | Promise<void>
  pause?: () => void
  resume?: () => void
  stop?: () => void
  cleanup?: () => void
  [key: string]: any
}

/**
 * Animation plugin interface
 */
export interface AnimationPlugin<TOptions = any, TSystem extends PluginSystem = PluginSystem> {
  name: string
  version: string
  setup: (context: AnimationContext, options: TOptions) => TSystem
  shouldActivate?: (options: UseAnimationOptions) => boolean
  optionsKey?: string
  beforePlay?: (context: AnimationContext) => void | Promise<void>
  afterPlay?: (context: AnimationContext) => void
  beforePause?: (context: AnimationContext) => void
  afterPause?: (context: AnimationContext) => void
  beforeStop?: (context: AnimationContext) => void
  afterStop?: (context: AnimationContext) => void
  cleanup?: () => void
  cleanupPriority?: number
  registerWatchers?: (context: AnimationContext) => WatchStopHandle[]
  provides?: string[]
  requires?: string[]
  optionalRequires?: string[]
  conflicts?: string[]
  contributeToAPI?: (systems: Map<string, PluginSystem>) => Record<string, any>
  priority?: number
}

/**
 * Registry setup result
 */
export interface PluginSetupResult {
  systems: Map<string, PluginSystem>
  api: Record<string, any>
  watchers: WatchStopHandle[]
}

/**
 * useAnimation return type
 */
export interface UseAnimationReturn<TState = any, TElement = any> {
  play: () => Promise<void>
  pause: () => void
  stop: () => void
  resume: () => void
  isPlaying: Ref<boolean>
  isPaused?: Ref<boolean>
  state: TState
  emit: <K extends string>(event: K, payload?: any) => void
  on: <K extends string>(event: K, handler: (payload?: any) => void) => () => void
  canAnimate: ComputedRef<boolean>
  animationQuality: ComputedRef<AnimationQuality>
  shouldPauseAnimations: ComputedRef<boolean>
  animate?: Ref<Animation | undefined>
  animateIn?: (customKeyframes?: UseAnimateKeyframes, customOptions?: UseAnimateOptions) => Promise<void | Animation | undefined>
  animateOut?: (outKeyframes?: UseAnimateKeyframes, outOptions?: UseAnimateOptions) => Promise<void | Animation | undefined>
  sequence?: {
    currentIndex: Ref<number>
    currentElement: ComputedRef<TElement | undefined>
    cycleIndex: Ref<number>
    next: () => void
    prev: () => void
    goTo: (index: number) => void
  }
  stagger?: {
    elements: Ref<HTMLElement[]>
    triggerStagger: () => void
    activeTimeouts?: Ref<Array<ReturnType<typeof setTimeout>>>
    activeAnimations?: Ref<Animation[]>
  }
  motionPath?: {
    progress: Ref<number>
    setProgress: (progress: number) => void
  }
  responsive?: {
    dimensions: Ref<ResponsiveDimensions>
    scaleValue: ComputedRef<(baseValue: number) => number>
    getResponsiveRadius: ComputedRef<(baseRadius: number) => number>
    getResponsiveOffset: ComputedRef<(baseOffset: { x: number; y: number }) => { x: number; y: number }>
    scaled: ComputedRef<Record<string, number>>
  }
  svg?: SvgSystem
  grid?: GridSystem
  relationships?: RelationshipsSystem
  setCSSVar: (name: string, value: string | number) => void
  getCSSVar: (name: string) => string
  syncCSSVars: (vars: Record<string, Ref<string | number> | ComputedRef<string | number>>) => () => void
  cleanup: () => void
}

/**
 * Animation preset configuration
 */
export interface AnimationPreset {
  keyframes: UseAnimateKeyframes
  options: number | UseAnimateOptions
}

/**
 * Stagger animation configuration
 */
export interface UseAnimationStaggerOptions {
  children: string | HTMLElement[] | Ref<HTMLElement[]>
  delay: number
  from?: 'start' | 'end' | 'center'
  ease?: 'linear' | 'ease-in' | 'ease-out' | string
  grid?: [number, number]
  resetOnRestart?: boolean
  loop?: boolean
  loopDelay?: number
}

