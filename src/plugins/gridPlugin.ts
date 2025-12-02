import { computed, toValue, type ComputedRef, type CSSProperties } from 'vue'
import type {
  AnimationPlugin,
  AnimationContext,
  PluginSystem,
  UseAnimationGridOptions,
  GridSystem
} from '../types'

/**
 * Grid Plugin
 *
 * Provides utilities for querying grid zones and positioning elements
 * within a CSS Grid layout.
 *
 * Priority: 50 (default)
 */
export const gridPlugin: AnimationPlugin<UseAnimationGridOptions, GridSystem> = {
  name: 'grid',
  version: '1.0.0',
  priority: 50,
  optionsKey: 'grid',

  setup(context: AnimationContext, options: UseAnimationGridOptions): GridSystem {
    const gridTemplateColumns = computed(() => options.columns)
    const gridTemplateRows = computed(() => options.rows || '1fr')
    const gridGap = computed(() => options.gap || '0')

    // Get the bounding rectangle of a grid zone
    const getZoneRect = (zoneName: string): DOMRect | undefined => {
      const element = toValue(context.target)
      if (!element) return undefined

      const zone = options.zones?.[zoneName]
      if (!zone) {
        console.warn(`[useAnimation] Zone "${zoneName}" not found`)
        return undefined
      }

      // Query for the zone element using data attribute or class
      const zoneEl = element.querySelector(`[data-zone="${zoneName}"]`) as HTMLElement
      if (!zoneEl) {
        console.warn(`[useAnimation] Zone element for "${zoneName}" not found. Add data-zone="${zoneName}" attribute.`)
        return undefined
      }

      return zoneEl.getBoundingClientRect()
    }

    // Get the center point of a grid zone
    const getZoneCenter = (zoneName: string): { x: number; y: number } | undefined => {
      const rect = getZoneRect(zoneName)
      if (!rect) return undefined

      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      }
    }

    // Generate CSS grid positioning for a zone
    const zoneToStyle = computed(
      () =>
        (zoneName: string): CSSProperties => {
          const zone = options.zones?.[zoneName]
          if (!zone) {
            console.warn(`[useAnimation] Zone "${zoneName}" not found`)
            return {}
          }

          return {
            gridColumn: String(zone.column),
            gridRow: zone.row ? String(zone.row) : '1',
          }
        }
    )

    const system: GridSystem = {
      getZoneRect,
      getZoneCenter,
      zoneToStyle,
      gridTemplateColumns,
      gridTemplateRows,
      gridGap,
    }

    return system
  },

  contributeToAPI(systems) {
    const system = systems.get('grid') as GridSystem | undefined
    if (!system) return {}

    return {
      grid: {
        getZoneRect: system.getZoneRect,
        getZoneCenter: system.getZoneCenter,
        zoneToStyle: system.zoneToStyle,
        gridTemplateColumns: system.gridTemplateColumns,
        gridTemplateRows: system.gridTemplateRows,
        gridGap: system.gridGap
      }
    }
  }
}
