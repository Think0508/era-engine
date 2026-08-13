import { errorReporter } from './error-reporter'

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
    // 注释：same-tick 再入保护（防死循环，AGENTS §7）——丢弃并上报一次
    // （2026-08-13 审计：原静默 return，文档声称"断链报错"但实现无提示——
    // 再入通常是 handler 内 emit 同事件的代码缺陷信号，静默吞掉会掩盖问题）
    if (this.emitting.has(event)) {
      errorReporter.report({
        source: 'event-bus',
        severity: 'warning',
        message: `事件 '${event}' 在分发中再次触发（same-tick 再入），本次触发被丢弃`,
        suggestion: '检查是否有 handler 在监听同一事件时又 emit 该事件（死循环防护；若是有意的级联触发，改用不同事件名或 nextTick 延迟）',
      })
      return
    }

    this.emitting.add(event)
    try {
      const entries = this.getMatchingListeners(event)
      const toRemove: { event: string; handler: EventHandler }[] = []

      for (const entry of entries) {
        try {
          await entry.handler(payload)
        } catch (err) {
          // 注释：错误隔离——handler 抛错不阻断后续 handler（AGENTS §7），但必须上报
          // （2026-08-12 全面审计：原 catch{} 完全静默，插件运行时异常不可见）
          errorReporter.report({
            source: 'event-bus',
            severity: 'error',
            message: `事件 '${entry.matchedEvent}' 的 handler 抛错：${err instanceof Error ? err.message : String(err)}`,
            suggestion: '检查该事件的监听器实现（错误已隔离，不影响其他监听器）',
          })
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
