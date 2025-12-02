/**
 * CSS Variable utilities
 *
 * Pure DOM manipulation utilities for managing CSS custom properties.
 * Provides reactive synchronization between Vue refs and CSS variables.
 */

import { watch, type Ref, type ComputedRef } from 'vue'

/**
 * Set a CSS custom property on an element
 *
 * @param element - Target HTML element
 * @param name - CSS variable name (with or without -- prefix)
 * @param value - Variable value
 *
 * @example
 * setCSSVar(element, 'motion-x', '100px')
 * setCSSVar(element, '--motion-x', '100px') // Both work
 */
export function setCSSVar(
  element: HTMLElement | null | undefined,
  name: string,
  value: string | number
): void {
  if (!element?.style) return
  const varName = name.startsWith('--') ? name : `--${name}`
  element.style.setProperty(varName, String(value))
}

const requestFrame: (cb: FrameRequestCallback) => number =
  typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
    ? window.requestAnimationFrame.bind(window)
    : ((cb) => setTimeout(() => cb(Date.now()), 16) as unknown as number)

const cancelFrame: (id: number) => void =
  typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function'
    ? window.cancelAnimationFrame.bind(window)
    : ((id) => clearTimeout(id as any))

const pendingVarUpdates = new Map<HTMLElement, Map<string, string>>()
let cssVarRafId: number | null = null

const flushCSSVarUpdates = () => {
  pendingVarUpdates.forEach((vars, element) => {
    vars.forEach((value, name) => {
      setCSSVar(element, name, value)
    })
  })
  pendingVarUpdates.clear()
  cssVarRafId = null
}

const scheduleCSSVarUpdate = (element: HTMLElement, name: string, value: string | number) => {
  if (!element?.style) return
  if (!pendingVarUpdates.has(element)) {
    pendingVarUpdates.set(element, new Map())
  }
  pendingVarUpdates.get(element)!.set(name, String(value))

  if (cssVarRafId === null) {
    cssVarRafId = requestFrame(flushCSSVarUpdates)
  }
}

/**
 * Get a CSS custom property value from an element
 *
 * @param element - Target HTML element
 * @param name - CSS variable name (with or without -- prefix)
 * @returns Variable value or undefined if not set
 *
 * @example
 * const value = getCSSVar(element, 'motion-x')
 */
export function getCSSVar(
  element: HTMLElement | null | undefined,
  name: string
): string | undefined {
  if (!element) return undefined
  const varName = name.startsWith('--') ? name : `--${name}`
  if (typeof window === 'undefined' || typeof getComputedStyle === 'undefined') {
    return element.style?.getPropertyValue(varName) || undefined
  }
  return getComputedStyle(element).getPropertyValue(varName) || undefined
}

/**
 * Synchronize Vue refs/computed with CSS variables
 *
 * Creates watchers that automatically update CSS variables when refs change.
 * Returns cleanup function to stop all watchers.
 *
 * @param element - Target HTML element
 * @param vars - Map of CSS variable names to Vue refs/computed
 * @returns Cleanup function to stop all watchers
 *
 * @example
 * const cleanup = syncCSSVars(element, {
 *   'motion-x': xPosition,
 *   'motion-y': yPosition
 * })
 * // Later: cleanup() to stop watching
 */
export function syncCSSVars(
  element: HTMLElement,
  vars: Record<string, Ref<string | number> | ComputedRef<string | number>>
): () => void {
  const stopHandles = Object.entries(vars).map(([name, valueRef]) => {
    return watch(
      valueRef,
      (value) => {
        scheduleCSSVarUpdate(element, name, value)
      },
      { immediate: true }
    )
  })

  return () => {
    stopHandles.forEach(stop => stop())
  }
}
