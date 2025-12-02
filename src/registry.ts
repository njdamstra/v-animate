import type {
  AnimationPlugin,
  AnimationContext,
  PluginSystem,
  PluginSetupResult,
  UseAnimationOptions
} from './types'
import type { WatchStopHandle } from 'vue'

/**
 * Animation Plugin Registry - Central orchestrator for plugin lifecycle.
 * 3-phase init: setupPlugins() → registerWatchers() → buildAPI()
 * Handles dependency resolution, priority ordering, and cleanup coordination.
 */
export class AnimationPluginRegistry {
  private plugins = new Map<string, AnimationPlugin>()

  /** Register a plugin. Validates required fields (name, version, setup). */
  register(plugin: AnimationPlugin): void {
    // Validate required fields
    if (!plugin.name || !plugin.version || !plugin.setup) {
      throw new Error(
        `Invalid plugin: missing required fields (name, version, setup). ` +
        `Received: ${JSON.stringify({ name: plugin.name, version: plugin.version, hasSetup: !!plugin.setup })}`
      )
    }

    // Check for duplicate registration
    if (this.plugins.has(plugin.name)) {
      console.warn(`Plugin '${plugin.name}' already registered, overwriting`)
    }

    this.plugins.set(plugin.name, plugin)
  }

  /** Phase 1: Initialize plugin systems. Returns systems Map + sorted plugins for reuse. */
  setupPlugins(
    context: AnimationContext,
    options: UseAnimationOptions
  ): { systems: Map<string, PluginSystem>; sortedPlugins: AnimationPlugin[] } {
    // 1. Get active plugins
    const activePlugins = this.getActivePlugins(options)

    // 2. Validate dependencies
    this.validateDependencies(activePlugins)

    // 3. Check conflicts
    this.checkConflicts(activePlugins)

    // 4. Sort by priority (high to low)
    const sortedPlugins = this.sortByPriority(activePlugins)

    // 5. Setup plugins
    const systems = new Map<string, PluginSystem>()
    sortedPlugins.forEach(plugin => {
      try {
        const pluginOptions = this.extractPluginOptions(plugin, options)
        const system = plugin.setup(context, pluginOptions)
        systems.set(plugin.name, system)
        console.log(`[Plugin:${plugin.name}] Initialized`)

        // Store system reference in shared data for cross-plugin access
        context.sharedData.set(`${plugin.name}.system`, system)
      } catch (error) {
        console.error(`[Plugin:${plugin.name}] Setup failed:`, error)
        // Rethrow to prevent partial initialization
        throw error
      }
    })

    // Return both systems and sortedPlugins to avoid redundant calculations in phase 2/3
    return { systems, sortedPlugins }
  }

  /** Phase 2: Register reactive watchers. Call AFTER storing orchestrator callbacks in sharedData. */
  registerWatchers(
    context: AnimationContext,
    options: UseAnimationOptions,
    sortedPlugins?: AnimationPlugin[]
  ): WatchStopHandle[] {
    // Use provided sortedPlugins or calculate (backward compatibility)
    const plugins = sortedPlugins ?? this.sortByPriority(this.getActivePlugins(options))

    const watchers: WatchStopHandle[] = []
    plugins.forEach(plugin => {
      if (plugin.registerWatchers) {
        watchers.push(...plugin.registerWatchers(context))
      }
    })

    return watchers
  }

  /** Phase 3: Build combined API from all plugin contributeToAPI() methods. */
  buildAPI(
    context: AnimationContext,
    options: UseAnimationOptions,
    systems: Map<string, PluginSystem>,
    sortedPlugins?: AnimationPlugin[]
  ): Record<string, any> {
    // Use provided sortedPlugins or calculate (backward compatibility)
    const plugins = sortedPlugins ?? this.sortByPriority(this.getActivePlugins(options))

    const api: Record<string, any> = {}
    plugins.forEach(plugin => {
      if (plugin.contributeToAPI) {
        Object.assign(api, plugin.contributeToAPI(systems))
      }
    })

    return api
  }

  /** @deprecated Use 3-phase pattern: setupPlugins() → registerWatchers() → buildAPI() */
  setupAll(
    context: AnimationContext,
    options: UseAnimationOptions
  ): PluginSetupResult {
    const { systems, sortedPlugins } = this.setupPlugins(context, options)
    const watchers = this.registerWatchers(context, options, sortedPlugins)
    const api = this.buildAPI(context, options, systems, sortedPlugins)

    return { systems, api, watchers }
  }

  private getActivePlugins(options: UseAnimationOptions): AnimationPlugin[] {
    const active: AnimationPlugin[] = []

    this.plugins.forEach(plugin => {
      const shouldActivate = plugin.shouldActivate?.(options) ?? this.hasPluginOptions(plugin, options)

      if (shouldActivate) {
        active.push(plugin)
      }
    })

    return active
  }

  private hasPluginOptions(plugin: AnimationPlugin, options: UseAnimationOptions): boolean {
    const optionsKey = plugin.optionsKey || plugin.name
    const value = (options as Record<string, unknown>)[optionsKey]

    if (value === undefined || value === null) {
      return false
    }

    if (typeof value === 'boolean') {
      return value
    }

    return true
  }

  private extractPluginOptions(plugin: AnimationPlugin, options: UseAnimationOptions): any {
    const optionsKey = plugin.optionsKey || plugin.name
    return options[optionsKey]
  }

  private validateDependencies(activePlugins: AnimationPlugin[]): void {
    const activeNames = new Set(activePlugins.map(p => p.name))

    activePlugins.forEach(plugin => {
      if (plugin.requires) {
        plugin.requires.forEach(required => {
          // Extract plugin name from namespaced key (e.g., 'responsive.scale' � 'responsive')
          const requiredPlugin = required.split('.')[0]

          if (!activeNames.has(requiredPlugin)) {
            throw new Error(
              `Plugin '${plugin.name}' requires '${requiredPlugin}' but it is not enabled. ` +
              `Add ${requiredPlugin}: {...} to your options.`
            )
          }
        })
      }
    })
  }

  private checkConflicts(activePlugins: AnimationPlugin[]): void {
    const activeNames = new Set(activePlugins.map(p => p.name))

    activePlugins.forEach(plugin => {
      if (plugin.conflicts) {
        plugin.conflicts.forEach(conflictName => {
          if (activeNames.has(conflictName)) {
            throw new Error(
              `Plugin '${plugin.name}' conflicts with '${conflictName}'. ` +
              `You cannot use both plugins simultaneously.`
            )
          }
        })
      }
    })
  }

  private sortByPriority(plugins: AnimationPlugin[]): AnimationPlugin[] {
    return [...plugins].sort((a, b) => {
      const priorityA = a.priority ?? 50
      const priorityB = b.priority ?? 50
      return priorityB - priorityA // High to low
    })
  }

  getCleanupOrder(plugins: AnimationPlugin[]): AnimationPlugin[] {
    const sorted = this.sortByPriority(plugins)

    // Further sort by cleanupPriority if defined
    return sorted.sort((a, b) => {
      const cleanupA = a.cleanupPriority ?? a.priority ?? 50
      const cleanupB = b.cleanupPriority ?? b.priority ?? 50
      return cleanupA - cleanupB // Low to high (reverse of setup)
    })
  }

  getRegisteredPlugins(): string[] {
    return Array.from(this.plugins.keys())
  }

  getPlugin(name: string): AnimationPlugin | undefined {
    return this.plugins.get(name)
  }

  hasPlugin(name: string): boolean {
    return this.plugins.has(name)
  }

  unregister(name: string): boolean {
    return this.plugins.delete(name)
  }

  clear(): void {
    this.plugins.clear()
  }
}

export const globalRegistry = new AnimationPluginRegistry()

/** Lazy plugin imports - dynamically loaded via preloadPlugins() */
export const lazyPluginImports: Record<string, () => Promise<{ default: AnimationPlugin }>> = {
  motionPath: () => import('./plugins/motionPathPlugin').then(m => ({ default: m.motionPathPlugin })),
  grid: () => import('./plugins/gridPlugin').then(m => ({ default: m.gridPlugin })),
  relationships: () => import('./plugins/relationshipsPlugin').then(m => ({ default: m.relationshipsPlugin }))
}

/** Load and register lazy plugins by name. Skips already-registered plugins. */
export async function ensurePluginsLoaded(pluginNames: string[]): Promise<void> {
  const loadPromises: Promise<void>[] = []

  for (const name of pluginNames) {
    // Skip if already registered
    if (globalRegistry.hasPlugin(name)) continue

    // Check if it's a lazy plugin
    const importer = lazyPluginImports[name]
    if (importer) {
      loadPromises.push(
        importer().then(({ default: plugin }) => {
          globalRegistry.register(plugin)
          console.log(`[LazyPlugin:${name}] Loaded and registered`)
        })
      )
    }
  }

  await Promise.all(loadPromises)
}
