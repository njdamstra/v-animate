/**
 * Plugin-specific type definitions
 */

import type { Ref, ComputedRef, WatchStopHandle, CSSProperties } from 'vue'
import type { MaybeRefOrGetter, UseAnimateKeyframes, UseAnimateOptions } from '@vueuse/core'
import type { PluginSystem } from './core'

// ============================================================================
// Web Animation Plugin
// ============================================================================

export interface UseAnimationWebAnimationOptions {
  preset?: string
  keyframes?: UseAnimateKeyframes
  duration?: number
  easing?: string
  delay?: number
  fill?: FillMode
  onStart?: () => void
  onComplete?: () => void
  onCancel?: () => void
  scaleWithResponsive?: boolean
}

export interface WebAnimationSystem extends PluginSystem {
  animation: Ref<Animation | undefined>
  play: () => Promise<void>
  pause: () => void
  resume: () => void
  cancel: () => void
  reverse: () => void
  seek: (time: number) => void
  animateIn: (customKeyframes?: UseAnimateKeyframes, customOptions?: UseAnimateOptions) => Promise<void | Animation | undefined>
  animateOut: (outKeyframes?: UseAnimateKeyframes, outOptions?: UseAnimateOptions) => Promise<void | Animation | undefined>
  cleanup: () => void
}

// ============================================================================
// Responsive Plugin
// ============================================================================

export interface ResponsiveDimensions {
  width: number
  height: number
  scale: number
  widthScale: number
  heightScale: number
  effectiveScale: number
  aspectRatio: number
  constraintMode: 'width' | 'height' | 'both'
}

export interface UseAnimationResponsiveOptions {
  enabled?: boolean
  baselineWidth?: number
  baselineHeight?: number
  measureTarget?: 'self' | 'parent'
  minScale?: number
  maxScale?: number
  debounce?: number
  scalingMode?: 'width' | 'height' | 'both' | 'container' | 'viewport' | 'svg' | 'grid'
  baseValues?: Record<string, number>
  mobileOverrides?: Record<string, number>
  mobileBreakpoint?: number
}

export interface ResponsiveSystem extends PluginSystem {
  dimensions: Ref<ResponsiveDimensions>
  scale: ComputedRef<number>
  scaleValue: ComputedRef<(baseValue: number) => number>
  getResponsiveRadius: ComputedRef<(baseRadius: number) => number>
  getResponsiveOffset: ComputedRef<(baseOffset: { x: number; y: number }) => { x: number; y: number }>
  scaled: ComputedRef<Record<string, number>>
}

// ============================================================================
// Stagger Plugin
// ============================================================================

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

export interface StaggerPluginOptions extends UseAnimationStaggerOptions {
  preset?: string
  keyframes?: any
  duration?: number
  easing?: string
  scaleWithResponsive?: boolean
}

export interface StaggerSystem extends PluginSystem {
  elements: Ref<HTMLElement[]>
  trigger: () => Promise<void>
  activeTimeouts: Ref<Array<ReturnType<typeof setTimeout>>>
  activeAnimations: Ref<Animation[]>
}

// ============================================================================
// CSS Variables Plugin
// ============================================================================

export interface CSSVarTracking {
  varName: string
  initialValue: string | null
  watchStop: WatchStopHandle | null
}

export interface CSSVarsPluginOptions {
  vars?: Record<string, Ref<string | number> | ComputedRef<string | number>>
  keyframeVars?: string[]
  restoreOnPause?: boolean
  restoreOnStop?: boolean
}

export interface CSSVarsSystem extends PluginSystem {
  trackedVars: Ref<CSSVarTracking[]>
  setVar: (name: string, value: string | number) => void
  getVar: (name: string) => string | undefined
  restoreAll: () => void
}

// ============================================================================
// Autoplay Plugin
// ============================================================================

export type UseAnimationAutoplayBehavior = 'stop' | 'pause'

export interface UseAnimationAutoplayBehaviorOptions {
  visibility?: UseAnimationAutoplayBehavior
  environment?: UseAnimationAutoplayBehavior
}

export interface UseAnimationAutoplayOptions {
  threshold?: number
  enabled?: MaybeRefOrGetter<boolean>
  includeNavigation?: boolean
  observeTarget?: boolean
  behavior?: MaybeRefOrGetter<UseAnimationAutoplayBehaviorOptions | undefined>
  debounceMs?: number
  adaptiveDebounce?: boolean
  maxAdaptiveDebounce?: number
  sentinel?: MaybeRefOrGetter<HTMLElement | undefined>
  visibilityOverride?: Ref<boolean>
}

export interface AutoplaySystem extends PluginSystem {
  shouldAutoplay: ComputedRef<boolean>
  elementVisible: Ref<boolean> | ComputedRef<boolean>
  documentVisible: Ref<'visible' | 'hidden'>
  autoplayEnabled: ComputedRef<boolean>
  autoplayBehavior: ComputedRef<UseAnimationAutoplayBehaviorOptions>
  pausedByVisibility: Ref<boolean>
  pausedByEnvironment: Ref<boolean>
  debounceTimeout: Ref<ReturnType<typeof setTimeout> | null>
  baseDebounce: number
  adaptiveDebounce: boolean
  maxAdaptiveDebounce: number
  cleanup: () => void
}

// ============================================================================
// Scroll Plugin
// ============================================================================

export interface ScrollTriggerOptions {
  threshold?: number
  onEnter?: () => void
  onLeave?: () => void
  onEnterBack?: () => void
  onLeaveBack?: () => void
}

export interface ScrollPluginOptions {
  trigger?: ScrollTriggerOptions
  scrub?: boolean
  container?: MaybeRefOrGetter<HTMLElement | Window>
  throttle?: number
  onUpdate?: (progress: number) => void
}

export interface ScrollSystem extends PluginSystem {
  position: Ref<{ x: number; y: number }>
  progress: Ref<number>
  isScrolling: Ref<boolean>
  direction: Ref<{ up: boolean; down: boolean }>
  scrollTo: (opts: { y?: number; x?: number; behavior?: ScrollBehavior }) => void
  refresh: () => void
  cleanup: () => void
}

// ============================================================================
// Timeline Plugin
// ============================================================================

export interface PhaseContext {
  phaseName: string
  phaseIndex: number
  cycleIndex: number
  elapsed: number
  progress: number
  targets: HTMLElement[]
}

export interface TimelinePhase {
  name: string
  target: MaybeRefOrGetter<HTMLElement | HTMLElement[] | null>
  delay: number
  duration: number
  animation?: {
    preset?: string
    keyframes?: any
    duration?: number
    easing?: string
  }
  onStart?: (context: PhaseContext) => void
  onProgress?: (progress: number, context: PhaseContext) => void
  onComplete?: (context: PhaseContext) => void
}

export interface TimelinePluginOptions {
  phases: TimelinePhase[]
  cycleDuration: number
  mode?: 'sequential' | 'parallel' | 'staggered'
  loop?: boolean
  loopDelay?: number
  events?: {
    onCycleStart?: () => void
    onCycleComplete?: () => void
    onPhaseStart?: (phaseName: string) => void
    onPhaseComplete?: (phaseName: string) => void
  }
}

export interface TimelineSystem extends PluginSystem {
  phases: Ref<TimelinePhase[]>
  currentPhase: Ref<string | null>
  currentCycle: Ref<number>
  cycleProgress: Ref<number>
}

export interface PhaseState {
  started: boolean
  completed: boolean
  animation: Animation | null
  lastProgress: number
}

// ============================================================================
// Sequence Plugin
// ============================================================================

export interface UseAnimationSequenceOptions<T = any> {
  elements: T[] | Ref<T[]>
  interval: number | Ref<number>
  mode?: 'sequence' | 'loop' | 'stagger' | 'unison'
  onActivate: (element: T, index: number, context: {
    cycleIndex: number
    elapsedInCycle: number
    totalElapsed: number
  }) => void
  onCycleComplete?: () => void
}

export interface SequenceSystem<T = any> extends PluginSystem {
  currentIndex: Ref<number>
  currentElement: ComputedRef<T | undefined>
  cycleIndex: Ref<number>
  next: () => void
  prev: () => void
  goTo: (index: number) => void
  pause: () => void
  resume: () => void
  cleanup: () => void
}

// ============================================================================
// Motion Path Plugin
// ============================================================================

export interface UseAnimationMotionPathOptions {
  type: 'circular' | 'elliptical' | 'custom'
  radius?: number | { x: number; y: number }
  startAngle?: number
  duration: number
  direction?: 'clockwise' | 'counterclockwise'
  path?: string
  autoRotate?: boolean
  /**
   * Multi-element support: Array of elements to animate along the path.
   * When provided, CSS vars (--motion-x, --motion-y, --motion-rotation)
   * are set directly on each element instead of the target.
   * Static - read once at setup, no runtime watchers.
   */
  elements?: MaybeRefOrGetter<HTMLElement[]>
  /**
   * Per-element start angles in degrees.
   * Index corresponds to elements array.
   * Falls back to startAngle if not provided for an element.
   */
  elementAngles?: number[]
}

export interface MotionPathSystem extends PluginSystem {
  progress: Ref<number>
  setProgress: (progress: number) => void
  pause: () => void
  resume: () => void
  cleanup: () => void
}

// ============================================================================
// SVG Plugin
// ============================================================================

export interface UseAnimationSVGOptions {
  viewBox: { width: number; height: number }
  preserveAspectRatio?: string
  anchors?: Record<string, { x: number; y: number }>
}

export interface SvgSystem extends PluginSystem {
  svgToScreen: ComputedRef<(svgX: number, svgY: number) => { x: number; y: number }>
  screenToSvg: ComputedRef<(screenX: number, screenY: number) => { x: number; y: number }>
  getAnchor: (name: string) => { x: number; y: number } | undefined
  anchorToStyle: ComputedRef<(anchorName: string, offsetX?: number, offsetY?: number) => CSSProperties>
  viewBoxString: ComputedRef<string>
  svgScale: ComputedRef<{ x: number; y: number }>
}

// ============================================================================
// Grid Plugin
// ============================================================================

export interface UseAnimationGridOptions {
  columns: string
  rows?: string
  gap?: string
  zones?: Record<string, { column: number; row?: number }>
}

export interface GridSystem extends PluginSystem {
  getZoneRect: (zoneName: string) => DOMRect | undefined
  getZoneCenter: (zoneName: string) => { x: number; y: number } | undefined
  zoneToStyle: ComputedRef<(zoneName: string) => CSSProperties>
  gridTemplateColumns: ComputedRef<string>
  gridTemplateRows: ComputedRef<string>
  gridGap: ComputedRef<string>
}

// ============================================================================
// Enter/Exit Plugin
// ============================================================================

export interface UseAnimationEnterExitOptions {
  trigger: Ref<boolean>
  enter?: UseAnimationWebAnimationOptions
  exit?: UseAnimationWebAnimationOptions
  skipInitial?: boolean
  onEnterStart?: () => void
  onEnterComplete?: () => void
  onExitStart?: () => void
  onExitComplete?: () => void
}

export interface EnterExitSystem extends PluginSystem {
  hasEntered: Ref<boolean>
  cleanup: () => void
}

// ============================================================================
// Progress Plugin
// ============================================================================

export interface ProgressSystem extends PluginSystem {
  cleanup: () => void
}

// ============================================================================
// Relationships Plugin
// ============================================================================

export interface ElementTarget {
  zone?: string
  selector?: string
  ref?: Ref<HTMLElement | undefined>
  refs?: Ref<HTMLElement[]>
}

export type TrackingMode = 'center-to-center' | 'edge-to-edge' | 'closest-point'
export type UpdateMode = 'raf' | 'resize' | 'manual'

export interface RelationshipConnection {
  id: string
  source: ElementTarget
  targets: ElementTarget
  trackingMode?: TrackingMode
  updateMode?: UpdateMode
  enabled?: MaybeRefOrGetter<boolean>
}

export interface ConnectionData {
  source: {
    x: number
    y: number
    width: number
    height: number
    element?: HTMLElement
  }
  target: {
    x: number
    y: number
    width: number
    height: number
    element?: HTMLElement
  }
  distance: number
  angle: number
  midpoint: { x: number; y: number }
}

export interface RelationshipsPluginOptions {
  connections: RelationshipConnection[]
}

export interface RelationshipsSystem extends PluginSystem {
  connections: Ref<Record<string, ConnectionData[]>>
  update: () => void
  pause: () => void
  resume: () => void
  cleanup: () => void
}


// ============================================================================
// CSS Animation Plugin
// ============================================================================

export interface CSSAnimationSystem extends PluginSystem {
  play: () => void
  pause: () => void
  resume: () => void
  stop: () => void
  cleanup: () => void
}

