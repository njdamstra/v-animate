type IntersectionCallback = (entry: IntersectionObserverEntry) => void

const noop = () => {}
const DEBUG = typeof process !== 'undefined' ? process.env.NODE_ENV !== 'production' : true

interface ObserverRecord {
  observer: IntersectionObserver
  targets: Map<Element, Set<IntersectionCallback>>
  options: IntersectionObserverInit
}

const rootKeyMap = new WeakMap<Element | Document, string>()
let rootKeyCounter = 0

function getRootKey(root?: Element | Document | null): string {
  if (!root) return 'viewport'

  if (!rootKeyMap.has(root)) {
    rootKeyMap.set(root, `root-${++rootKeyCounter}`)
  }

  return rootKeyMap.get(root)!
}

function serializeOptions(options: IntersectionObserverInit = {}): string {
  const root = getRootKey(options.root as Element | Document | null)
  const rootMargin = options.rootMargin ?? '0px'
  const threshold = Array.isArray(options.threshold)
    ? options.threshold.join(',')
    : options.threshold ?? 0

  return `${root}|${rootMargin}|${threshold}`
}

class IntersectionObserverManager {
  private observers = new Map<string, ObserverRecord>()

  observe(element: Element, options: IntersectionObserverInit, callback: IntersectionCallback): () => void {
    if (!element || typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') {
      return noop
    }

    const key = serializeOptions(options)
    const record = this.getOrCreateRecord(key, options)

    if (!record.targets.has(element)) {
      record.targets.set(element, new Set())
      record.observer.observe(element)
      if (DEBUG) {
        console.debug('[IntersectionObserver] observing', element.tagName || element, options)
      }
    }

    record.targets.get(element)!.add(callback)

    return () => this.unobserve(element, key, callback)
  }

  private getOrCreateRecord(key: string, options: IntersectionObserverInit): ObserverRecord {
    if (this.observers.has(key)) {
      return this.observers.get(key)!
    }

    const record: ObserverRecord = {
      observer: new IntersectionObserver(entries => {
        entries.forEach(entry => {
          const callbacks = record.targets.get(entry.target)
          if (!callbacks) return
          callbacks.forEach(cb => cb(entry))
        })
      }, options),
      targets: new Map(),
      options
    }

    this.observers.set(key, record)
    return record
  }

  private unobserve(element: Element, key: string, callback: IntersectionCallback): void {
    const record = this.observers.get(key)
    if (!record) return

    const callbacks = record.targets.get(element)
    if (!callbacks) return

    callbacks.delete(callback)
    if (callbacks.size === 0) {
      record.targets.delete(element)
      record.observer.unobserve(element)
      if (DEBUG) {
        console.debug('[IntersectionObserver] stopped observing', element.tagName || element)
      }
    }

    if (record.targets.size === 0) {
      record.observer.disconnect()
      this.observers.delete(key)
      if (DEBUG) {
        console.debug('[IntersectionObserver] observer group cleaned up')
      }
    }
  }
}

let singleton: IntersectionObserverManager | null = null

export function useIntersectionObserverManager(): IntersectionObserverManager {
  if (!singleton) {
    singleton = new IntersectionObserverManager()
  }
  return singleton
}
