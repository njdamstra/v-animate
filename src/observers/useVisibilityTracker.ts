import { ref, watch, toValue, readonly, type Ref } from 'vue'
import type { MaybeRefOrGetter } from '@vueuse/core'
import { useIntersectionObserverManager } from './intersectionObserverManager'

export function useVisibilityTracker(
  target: MaybeRefOrGetter<Element | undefined>,
  options: IntersectionObserverInit
): { visible: Ref<boolean>; cleanup: () => void } {
  const visible = ref(false)
  const manager = useIntersectionObserverManager()

  let stopObserving: (() => void) | null = null

  const stopWatch = watch(
    () => toValue(target),
    (element) => {
      stopObserving?.()
      stopObserving = null

      if (!element) {
        visible.value = false
        return
      }

      stopObserving = manager.observe(element, options, (entry) => {
        visible.value = entry.isIntersecting
      })
    },
    { immediate: true }
  )

  const cleanup = () => {
    stopObserving?.()
    stopObserving = null
    stopWatch()
  }

  return { visible: readonly(visible) as Ref<boolean>, cleanup }
}
