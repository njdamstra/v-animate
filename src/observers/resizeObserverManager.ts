type ResizeCallback = (entry: ResizeObserverEntry) => void

const noop = () => {}
const DEBUG = typeof process !== 'undefined' ? process.env.NODE_ENV !== 'production' : true

class ResizeObserverManager {
  private observer: ResizeObserver | null = null
  private targets = new Map<Element, Set<ResizeCallback>>()

  private ensureObserver(): void {
    if (this.observer || typeof window === 'undefined' || typeof ResizeObserver === 'undefined') {
      return
    }

    this.observer = new ResizeObserver(entries => {
      entries.forEach(entry => {
        const callbacks = this.targets.get(entry.target)
        if (!callbacks) return

        callbacks.forEach(cb => cb(entry))
      })
    })
  }

  observe(element: Element, callback: ResizeCallback): () => void {
    if (!element || typeof window === 'undefined' || typeof ResizeObserver === 'undefined') {
      return noop
    }

    this.ensureObserver()
    if (!this.observer) return noop

    if (!this.targets.has(element)) {
      this.targets.set(element, new Set())
      this.observer.observe(element)
      if (DEBUG) {
        console.debug('[ResizeObserver] observing', element.tagName || element)
      }
    }

    this.targets.get(element)!.add(callback)

    return () => this.unobserve(element, callback)
  }

  private unobserve(element: Element, callback: ResizeCallback): void {
    const callbacks = this.targets.get(element)
    if (!callbacks) return

    callbacks.delete(callback)

    if (callbacks.size === 0) {
      this.targets.delete(element)
      this.observer?.unobserve(element)
      if (DEBUG) {
        console.debug('[ResizeObserver] stopped observing', element.tagName || element)
      }
    }

    if (this.targets.size === 0 && this.observer) {
      this.observer.disconnect()
      this.observer = null
    }
  }
}

let singleton: ResizeObserverManager | null = null

export function useResizeObserverManager(): ResizeObserverManager {
  if (!singleton) {
    singleton = new ResizeObserverManager()
  }
  return singleton
}
