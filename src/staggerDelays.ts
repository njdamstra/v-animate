/**
 * Stagger delay calculation utilities
 *
 * Pure math function for calculating animation delays in stagger sequences.
 * Supports both 1D (linear) and 2D (grid) stagger patterns with easing.
 */

import type { UseAnimationStaggerOptions } from './types'

/**
 * Calculate stagger delays for animation sequencing
 *
 * @param count - Number of elements to stagger
 * @param options - Stagger configuration options
 * @returns Array of delay values in milliseconds
 *
 * @example
 * // Linear stagger from start
 * calculateStaggerDelays(3, { delay: 100, from: 'start' })
 * // Returns: [0, 100, 200]
 *
 * @example
 * // Grid stagger from center
 * calculateStaggerDelays(4, { delay: 100, grid: [2, 2], from: 'center' })
 * // Returns delays based on distance from center
 */
export function calculateStaggerDelays(count: number, options: UseAnimationStaggerOptions): number[] {
  const { delay, from = 'start', ease = 'linear', grid } = options
  const delays: number[] = []

  if (grid) {
    // 2D grid stagger
    const [cols, rows] = grid
    for (let i = 0; i < count; i++) {
      const col = i % cols
      const row = Math.floor(i / cols)
      const distance = from === 'center'
        ? Math.sqrt(Math.pow(col - cols / 2, 2) + Math.pow(row - rows / 2, 2))
        : from === 'end'
          ? (cols - col) + (rows - row)
          : col + row

      delays.push(distance * delay)
    }
  } else {
    // 1D linear stagger
    for (let i = 0; i < count; i++) {
      const position = from === 'start'
        ? i
        : from === 'end'
          ? count - 1 - i
          : Math.abs(i - count / 2)

      let normalizedDelay = position * delay

      // Apply easing
      if (ease !== 'linear') {
        const t = position / (count - 1 || 1)
        let easedT = t

        if (ease === 'ease-in') {
          easedT = t * t
        } else if (ease === 'ease-out') {
          easedT = 1 - Math.pow(1 - t, 2)
        } else if (ease.startsWith('cubic-bezier')) {
          // Simple approximation for cubic-bezier - would need full implementation
          easedT = t
        }

        normalizedDelay = easedT * delay * count
      }

      delays.push(normalizedDelay)
    }
  }

  return delays
}
