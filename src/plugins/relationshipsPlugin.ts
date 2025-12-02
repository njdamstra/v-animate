import { ref, computed, toValue, watch, type Ref, type MaybeRefOrGetter } from 'vue'
import { createRafControls } from '../rafCoordinator'
import type {
  AnimationPlugin,
  AnimationContext,
  PluginSystem,
  ElementTarget,
  TrackingMode,
  UpdateMode,
  RelationshipConnection,
  ConnectionData,
  RelationshipsPluginOptions,
  RelationshipsSystem,
  ResponsiveDimensions
} from '../types'
import type { GridSystem } from '../types'

/**
 * Get center point of a rectangle
 */
function getRectCenter(rect: DOMRect): { x: number; y: number } {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2
  }
}

/**
 * Calculate closest point on rect edge to external point
 */
function getClosestEdgePoint(rect: DOMRect, point: { x: number; y: number }): { x: number; y: number } {
  return {
    x: Math.max(rect.left, Math.min(point.x, rect.right)),
    y: Math.max(rect.top, Math.min(point.y, rect.bottom))
  }
}

/**
 * Calculate distance between two points
 */
function calculateDistance(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * Calculate angle from p1 to p2 in radians
 */
function calculateAngle(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
  return Math.atan2(p2.y - p1.y, p2.x - p1.x)
}

/**
 * Calculate midpoint between two points
 */
function calculateMidpoint(p1: { x: number; y: number }, p2: { x: number; y: number }): { x: number; y: number } {
  return {
    x: (p1.x + p2.x) / 2,
    y: (p1.y + p2.y) / 2
  }
}

/**
 * Resolve element from ElementTarget specification
 */
function resolveElement(
  target: ElementTarget,
  context: AnimationContext,
  gridSystem?: GridSystem
): HTMLElement | undefined {
  // Direct ref takes priority
  if (target.ref) {
    return toValue(target.ref)
  }

  // Grid zone (requires grid plugin)
  if (target.zone) {
    if (!gridSystem) {
      console.warn(
        `[relationshipsPlugin] Zone "${target.zone}" specified but grid plugin not enabled. ` +
        `Add grid option to useAnimation to enable zone-based connections.`
      )
      // Fall through to selector as fallback
    } else {
      const containerEl = toValue(context.target)
      if (!containerEl) return undefined

      const zoneEl = containerEl.querySelector(`[data-zone="${target.zone}"]`) as HTMLElement
      return zoneEl || undefined
    }
  }

  // CSS selector
  if (target.selector) {
    const containerEl = toValue(context.target)
    if (!containerEl) return undefined

    return containerEl.querySelector(target.selector) as HTMLElement || undefined
  }

  return undefined
}

/**
 * Resolve multiple elements from ElementTarget specification
 */
function resolveElements(
  target: ElementTarget,
  context: AnimationContext,
  gridSystem?: GridSystem
): HTMLElement[] {
  // Direct refs array takes priority
  if (target.refs) {
    return toValue(target.refs).filter(el => el != null)
  }

  // Single ref handling
  if (target.ref) {
    const el = toValue(target.ref)
    return el ? [el] : []
  }

  // Grid zone returns single element as array
  if (target.zone) {
    const el = resolveElement(target, context, gridSystem)
    return el ? [el] : []
  }

  // CSS selector (can match multiple)
  if (target.selector) {
    const containerEl = toValue(context.target)
    if (!containerEl) return []

    return Array.from(containerEl.querySelectorAll(target.selector))
  }

  return []
}

/**
 * Calculate tracking point based on mode
 */
function getTrackingPoint(
  rect: DOMRect,
  mode: TrackingMode,
  referencePoint?: { x: number; y: number }
): { x: number; y: number } {
  switch (mode) {
    case 'center-to-center':
      return getRectCenter(rect)

    case 'edge-to-edge':
    case 'closest-point':
      if (!referencePoint) {
        // Fallback to center if no reference point
        return getRectCenter(rect)
      }
      return getClosestEdgePoint(rect, referencePoint)

    default:
      return getRectCenter(rect)
  }
}

/**
 * Relationships Plugin
 *
 * Tracks spatial relationships between source and target elements with rich metadata.
 * Supports multiple tracking modes and update strategies.
 *
 * Priority: 40 (runs after grid/responsive)
 * Depends: grid (optional)
 */
export const relationshipsPlugin: AnimationPlugin<RelationshipsPluginOptions, RelationshipsSystem> = {
  name: 'relationships',
  version: '1.0.0',
  priority: 40,
  optionsKey: 'relationships',

  setup(context: AnimationContext, options: RelationshipsPluginOptions): RelationshipsSystem {
    const connections = ref<Record<string, ConnectionData[]>>({})

    // Get grid system if available
    const gridSystem = context.sharedData.get<GridSystem>('grid.system')

    /**
     * Calculate all connection data
     */
    const calculateConnections = () => {
      const containerEl = toValue(context.target)
      if (!containerEl) return
      const containerRect = containerEl.getBoundingClientRect()

      // Synchronize coordinate space with responsive plugin dimensions (if available)
      // This ensures coordinates match the SVG viewBox which uses responsive.dimensions
      const responsiveDims = context.sharedData.get('responsive.dimensions') as Ref<ResponsiveDimensions> | undefined

      const coordinateSpace = {
        left: containerRect.left,
        top: containerRect.top,
        // Prefer responsive dimensions to match SVG viewBox, fallback to getBoundingClientRect
        // Check for truthy values (not just null/undefined) to handle initial 0 values
        width: (responsiveDims?.value?.width && responsiveDims.value.width > 0)
          ? responsiveDims.value.width
          : containerRect.width,
        height: (responsiveDims?.value?.height && responsiveDims.value.height > 0)
          ? responsiveDims.value.height
          : containerRect.height
      }

      const toLocalPoint = (point: { x: number; y: number }) => ({
        x: point.x - coordinateSpace.left,
        y: point.y - coordinateSpace.top
      })

      // PHASE 1: Batch all DOM reads
      const measurements: Array<{
        connection: RelationshipConnection
        sourceRect: DOMRect | null
        sourceEl: HTMLElement | undefined
        targetRects: Array<{ rect: DOMRect; el: HTMLElement }>
      }> = []

      for (const connection of options.connections) {
        // Skip if disabled
        if (connection.enabled !== undefined && !toValue(connection.enabled)) {
          connections.value[connection.id] = []
          continue
        }

        // Resolve elements
        const sourceEl = resolveElement(connection.source, context, gridSystem)
        const targetEls = resolveElements(connection.targets, context, gridSystem)

        if (!sourceEl || targetEls.length === 0) {
          connections.value[connection.id] = []
          continue
        }

        // Read all rectangles
        const sourceRect = sourceEl.getBoundingClientRect()
        const targetRects = targetEls.map(el => ({
          rect: el.getBoundingClientRect(),
          el
        }))

        measurements.push({
          connection,
          sourceRect,
          sourceEl,
          targetRects
        })
      }

      // PHASE 2: Calculate all relationships
      const results: Record<string, ConnectionData[]> = {}

      for (const { connection, sourceRect, sourceEl, targetRects } of measurements) {
        // Skip if sourceRect is null
        if (!sourceRect) {
          results[connection.id] = []
          continue
        }

        const mode = connection.trackingMode || 'center-to-center'
        const connectionData: ConnectionData[] = []

        // Get source tracking point
        const sourceCenter = getRectCenter(sourceRect)
        const sourcePoint = getTrackingPoint(sourceRect, mode)

        for (const { rect: targetRect, el: targetEl } of targetRects) {
          // For edge/closest modes, calculate target point relative to source
          let targetPoint: { x: number; y: number }

          if (mode === 'edge-to-edge' || mode === 'closest-point') {
            // First get target's closest point to source center
            const targetToSource = getTrackingPoint(targetRect, mode, sourceCenter)
            // Then get source's closest point to that target point
            const sourceToTarget = getTrackingPoint(sourceRect, mode, targetToSource)
            // Finally get target's closest point to the adjusted source point
            targetPoint = getTrackingPoint(targetRect, mode, sourceToTarget)
          } else {
            targetPoint = getTrackingPoint(targetRect, mode)
          }

          const sourceLocal = toLocalPoint(sourcePoint)
          const targetLocal = toLocalPoint(targetPoint)

          const distance = calculateDistance(sourceLocal, targetLocal)
          const angle = calculateAngle(sourceLocal, targetLocal)
          const midpoint = calculateMidpoint(sourceLocal, targetLocal)

          connectionData.push({
            source: {
              x: sourceLocal.x,
              y: sourceLocal.y,
              width: sourceRect.width,
              height: sourceRect.height,
              element: sourceEl
            },
            target: {
              x: targetLocal.x,
              y: targetLocal.y,
              width: targetRect.width,
              height: targetRect.height,
              element: targetEl
            },
            distance,
            angle,
            midpoint
          })
        }

        results[connection.id] = connectionData
      }

      // PHASE 3: Batch write
      connections.value = results

      // Debug: Log connection data for troubleshooting
      if (results['orb-to-cards']?.length) {
        console.log('[relationshipsPlugin] Connections calculated:', {
          containerRect: { left: containerRect.left, top: containerRect.top, width: containerRect.width, height: containerRect.height },
          coordinateSpace,
          connections: results['orb-to-cards'].map(c => ({
            source: { x: c.source.x, y: c.source.y },
            target: { x: c.target.x, y: c.target.y }
          }))
        })
      }
    }

    // Setup RAF-based updates using shared RAF coordinator
    const rafControls = createRafControls(() => {
      calculateConnections()
    }, { immediate: false })

    // Collect all update modes
    const updateModes = new Set(
      options.connections.map(conn => conn.updateMode || 'raf')
    )

    // ResizeObserver for 'resize' mode
    let resizeObserver: ResizeObserver | undefined

    // Store element watchers array
    let elementWatchers: Array<() => void> = []

    /**
     * Setup watchers for element ref changes
     * Updates ResizeObserver when connection element refs change
     */
    function setupElementRefWatchers(): Array<() => void> {
      const watchers: Array<() => void> = []

      if (!resizeObserver) return watchers

      for (const conn of options.connections) {
        if (conn.updateMode === 'resize') {
          // Watch source ref
          if (conn.source.ref) {
            const stopWatch = watch(conn.source.ref, (newEl, oldEl) => {
              if (resizeObserver) {
                if (oldEl) resizeObserver.unobserve(oldEl)
                if (newEl) resizeObserver.observe(newEl)
              }
            })
            watchers.push(stopWatch)
          }

          // Watch single target ref
          if (conn.targets.ref) {
            const stopWatch = watch(conn.targets.ref, (newEl, oldEl) => {
              if (resizeObserver) {
                if (oldEl) resizeObserver.unobserve(oldEl)
                if (newEl) resizeObserver.observe(newEl)
              }
            })
            watchers.push(stopWatch)
          }

          // Watch target refs array
          if (conn.targets.refs) {
            const stopWatch = watch(conn.targets.refs, (newEls, oldEls) => {
              if (resizeObserver) {
                oldEls?.forEach(el => resizeObserver!.unobserve(el))
                newEls?.forEach(el => resizeObserver!.observe(el))
              }
            })
            watchers.push(stopWatch)
          }
        }
      }

      return watchers
    }

    // Handle 'raf' mode
    if (updateModes.has('raf')) {
      rafControls.resume()
    }

    // Handle 'resize' mode
    if (updateModes.has('resize')) {
      if (typeof window !== 'undefined' && 'ResizeObserver' in window) {
        resizeObserver = new ResizeObserver(() => {
          calculateConnections()
        })

        const containerEl = toValue(context.target)
        if (containerEl) {
          resizeObserver.observe(containerEl)

          // Also observe all source/target elements for resize mode connections
          const observer = resizeObserver
          if (observer) {
            for (const conn of options.connections) {
              if (conn.updateMode === 'resize') {
                const sourceEl = resolveElement(conn.source, context, gridSystem)
                const targetEls = resolveElements(conn.targets, context, gridSystem)

                if (sourceEl) observer.observe(sourceEl)
                targetEls.forEach(el => observer.observe(el))
              }
            }
          }
        }

        // Watch element refs for changes and update ResizeObserver
        elementWatchers = setupElementRefWatchers()
      }
    }

    // 'manual' mode: do nothing, user calls .update()

    // Manual update function
    const update = () => {
      calculateConnections()
    }

    const system: RelationshipsSystem = {
      connections,
      update,
      pause: rafControls.pause,
      resume: rafControls.resume,

      cleanup() {
        rafControls.pause()
        resizeObserver?.disconnect()
        // Stop all element ref watchers
        elementWatchers.forEach(stop => stop())
      }
    }

    // Store system in shared data
    context.sharedData.set('relationships.system', system)

    return system
  },

  registerWatchers(context: AnimationContext) {
    const system = context.sharedData.get<RelationshipsSystem>('relationships.system')
    if (!system) return []

    const watchers = []

    // Watch target element changes
    const stopTargetWatcher = watch(
      () => toValue(context.target),
      (element) => {
        if (!element) {
          system.pause()
          return
        }

        // Recalculate when target element changes
        system.update()
      },
      { immediate: true }
    )

    watchers.push(stopTargetWatcher)

    return watchers
  },

  contributeToAPI(systems) {
    const system = systems.get('relationships') as RelationshipsSystem | undefined
    if (!system) return {}

    return {
      relationships: {
        connections: system.connections,
        update: system.update,
        pause: system.pause,
        resume: system.resume
      }
    }
  }
}
