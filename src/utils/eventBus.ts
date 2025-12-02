interface EventBus {
  emit: (event: string, payload?: any) => void
  on: (event: string, handler: (payload?: any) => void) => () => void
}

const eventBuses = new Map<string, EventBus>()

export const getEventBus = (busName: string): EventBus => {
  if (!eventBuses.has(busName)) {
    const handlers = new Map<string, Set<(payload?: any) => void>>()
    eventBuses.set(busName, {
      emit: (event, payload) => {
        handlers.get(event)?.forEach(handler => handler(payload))
      },
      on: (event, handler) => {
        if (!handlers.has(event)) {
          handlers.set(event, new Set())
        }
        handlers.get(event)!.add(handler)
        return () => {
          handlers.get(event)?.delete(handler)
          if (handlers.get(event)?.size === 0) {
            handlers.delete(event)
          }
        }
      }
    })
  }
  return eventBuses.get(busName)!
}
