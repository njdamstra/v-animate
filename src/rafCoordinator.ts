type FrameCallback = (time: number) => void

const hasWindow = typeof window !== 'undefined'
const raf: (cb: FrameRequestCallback) => number =
  hasWindow && typeof window.requestAnimationFrame === 'function'
    ? window.requestAnimationFrame.bind(window)
    : ((cb) => setTimeout(() => cb(Date.now()), 16) as unknown as number)

const caf: (id: number) => void =
  hasWindow && typeof window.cancelAnimationFrame === 'function'
    ? window.cancelAnimationFrame.bind(window)
    : ((id) => clearTimeout(id as any))

class RafCoordinator {
  private callbacks = new Map<symbol, FrameCallback>()
  private rafId: number | null = null

  add(callback: FrameCallback): symbol {
    const id = Symbol('raf-subscriber')
    this.callbacks.set(id, callback)
    console.log('[RAF] Subscriber added, total:', this.callbacks.size)
    this.ensureLoop()
    return id
  }

  remove(id: symbol): void {
    if (!this.callbacks.has(id)) return
    this.callbacks.delete(id)
    console.log('[RAF] Subscriber removed, remaining:', this.callbacks.size)

    if (this.callbacks.size === 0 && this.rafId !== null) {
      caf(this.rafId)
      this.rafId = null
      console.log('[RAF] Loop stopped (no subscribers)')
    }
  }

  private ensureLoop(): void {
    if (this.rafId !== null) return
    console.log('[RAF] Loop started')
    const step = (timestamp: number) => {
      this.callbacks.forEach(cb => cb(timestamp))
      if (this.callbacks.size > 0) {
        this.rafId = raf(step)
      } else {
        this.rafId = null
      }
    }

    this.rafId = raf(step)
  }
}

const coordinator = new RafCoordinator()

export interface RafControls {
  pause: () => void
  resume: () => void
}

interface CreateRafOptions {
  immediate?: boolean
}

export function createRafControls(
  callback: (ctx: { timestamp: number; delta: number }) => void,
  options?: CreateRafOptions
): RafControls {
  let subscriptionId: symbol | null = null
  let lastTimestamp = 0

  const wrappedCallback = (timestamp: number) => {
    const delta = lastTimestamp ? timestamp - lastTimestamp : 0
    lastTimestamp = timestamp
    callback({ timestamp, delta })
  }

  const resume = () => {
    if (subscriptionId) return
    lastTimestamp = 0
    subscriptionId = coordinator.add(wrappedCallback)
  }

  const pause = () => {
    if (!subscriptionId) return
    coordinator.remove(subscriptionId)
    subscriptionId = null
    lastTimestamp = 0
  }

  if (options?.immediate !== false) {
    resume()
  }

  return { pause, resume }
}
