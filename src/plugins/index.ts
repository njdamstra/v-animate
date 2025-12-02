/**
 * Animation Plugins
 *
 * Self-contained modules that add specific animation capabilities.
 * Each plugin follows the AnimationPlugin interface contract.
 *
 * CORE plugins (always loaded):
 * - responsivePlugin (priority: 100) - Layout scaling and dimensions
 * - webAnimationPlugin (priority: 50) - Single-element Web Animations
 * - staggerPlugin (priority: 50) - Grouped element animations
 * - cssVarsPlugin (priority: 50) - CSS variable synchronization with lifecycle cleanup
 * - cssAnimationPlugin (priority: 50) - CSS-based animations
 * - autoplayPlugin (priority: 40) - Visibility/state-triggered playback (w/ teleport support)
 * - scrollPlugin (priority: 35) - Scroll-triggered animations
 * - timelinePlugin (priority: 40) - Multi-element choreography with declarative phases
 *
 * LAZY plugins (loaded on-demand via preloadPlugins):
 * - motionPathPlugin (priority: 50) - Circular/path animations
 * - gridPlugin - CSS Grid zone system
 * - relationshipsPlugin - Spatial relationship tracking between elements
 *
 * @see preloadPlugins() in index.ts to load lazy plugins before use
 */

// CORE plugins - Always loaded, commonly used
export { responsivePlugin } from './responsivePlugin'
export { webAnimationPlugin } from './webAnimationPlugin'
export { cssAnimationPlugin } from './cssAnimationPlugin'
export { staggerPlugin } from './staggerPlugin'
export { cssVarsPlugin } from './cssVarsPlugin'
export { autoplayPlugin } from './autoplayPlugin'
export { scrollPlugin } from './scrollPlugin'
export { timelinePlugin } from './timelinePlugin'

// LAZY plugins - Not exported, use preloadPlugins(['motionPath', ...]) before useAnimation
// These are dynamically imported via registry.ensurePluginsLoaded() when requested
// - motionPathPlugin (use: plugins: ['motionPath'])
// - gridPlugin (use: plugins: ['grid'])
// - relationshipsPlugin (use: plugins: ['relationships'])
