import { toValue, type MaybeRefOrGetter } from '@vueuse/core'
import type { Ref, ComputedRef } from 'vue'
import { setCSSVar, getCSSVar, syncCSSVars } from '../cssVars'

export interface CssVarHelpers {
  setCSSVarLocal: (name: string, value: string | number) => void
  unsetCSSVarLocal: (name: string) => void
  getCSSVarLocal: (name: string) => string
  syncCSSVarsLocal: (vars: Record<string, Ref<string | number> | ComputedRef<string | number>>) => () => void
}

/**
 * Factory for CSS variable helpers scoped to a target element.
 * Keeps cleanup wiring in one place so useAnimation stays lean.
 */
export function createCssVarHelpers(
  target: MaybeRefOrGetter<HTMLElement | undefined>,
  cleanupHandlers: Array<() => void>
): CssVarHelpers {
  const setCSSVarLocal = (name: string, value: string | number) => {
    const el = toValue(target)
    if (el) setCSSVar(el, name, value)
  }

  const unsetCSSVarLocal = (name: string) => {
    const el = toValue(target)
    if (!el) return
    const varName = name.startsWith('--') ? name : `--${name}`
    el.style.removeProperty(varName)
  }

  const getCSSVarLocal = (name: string) => {
    const el = toValue(target)
    return el ? (getCSSVar(el, name) || '') : ''
  }

  const syncCSSVarsLocal = (
    vars: Record<string, Ref<string | number> | ComputedRef<string | number>>
  ) => {
    const el = toValue(target)
    if (!el) return () => {}

    const stopWatcher = syncCSSVars(el, vars)
    let isCleanedUp = false

    const cleanup = () => {
      if (isCleanedUp) return
      isCleanedUp = true

      stopWatcher()
      Object.keys(vars).forEach(name => {
        unsetCSSVarLocal(name)
      })
    }
    cleanupHandlers.push(cleanup)
    return cleanup
  }

  return { setCSSVarLocal, unsetCSSVarLocal, getCSSVarLocal, syncCSSVarsLocal }
}
