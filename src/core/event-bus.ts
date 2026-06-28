type EventHandler = (payload: any) => void | Promise<void>

interface ListenerEntry {
  handler: EventHandler
  priority: number
  once: boolean
}

class EventBus {
  private listeners = new Map<string, ListenerEntry[]>()
  private emitting = new Set<string>()

  on(event: string, handler: EventHandler, priority: number = 0): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, [])
    }
    this.listeners.get(event)!.push({ handler, priority, once: false })
    this.sortListeners(event)
  }

  once(event: string, handler: EventHandler, priority: number = 0): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, [])
    }
    this.listeners.get(event)!.push({ handler, priority, once: true })
    this.sortListeners(event)
  }

  off(event: string, handler: EventHandler): void {
    const entries = this.listeners.get(event)
    if (entries) {
      this.listeners.set(event, entries.filter(e => e.handler !== handler))
    }
  }

  async emit(event: string, payload: any): Promise<void> {
    if (this.emitting.has(event)) {
      return
    }

    this.emitting.add(event)
    try {
      const entries = this.getMatchingListeners(event)
      const toRemove: { event: string; handler: EventHandler }[] = []

      for (const entry of entries) {
        try {
          await entry.handler(payload)
        } catch {
        }
        if (entry.once) {
          toRemove.push({ event: entry.matchedEvent, handler: entry.handler })
        }
      }

      for (const { event: ev, handler } of toRemove) {
        this.off(ev, handler)
      }
    } finally {
      this.emitting.delete(event)
    }
  }

  clear(): void {
    this.listeners.clear()
    this.emitting.clear()
  }

  private getMatchingListeners(event: string): (ListenerEntry & { matchedEvent: string })[] {
    const exact = this.listeners.get(event) || []
    const wildcardMatches: (ListenerEntry & { matchedEvent: string })[] = []

    for (const [pattern, entries] of this.listeners) {
      if (pattern.endsWith(':*')) {
        const prefix = pattern.slice(0, -1)
        if (event.startsWith(prefix)) {
          for (const entry of entries) {
            wildcardMatches.push({ ...entry, matchedEvent: pattern })
          }
        }
      }
    }

    return [...exact.map(e => ({ ...e, matchedEvent: event })), ...wildcardMatches]
      .sort((a, b) => a.priority - b.priority)
  }

  private sortListeners(event: string): void {
    const entries = this.listeners.get(event)
    if (entries) {
      entries.sort((a, b) => a.priority - b.priority)
    }
  }
}

export { EventBus }

export const eventBus = new EventBus()
