// 注释：NarrativeLog 是 core 层的叙事日志存储
// 存储 entries 数组、write()、淘汰（默认1000条）、clear()
// write() 内部 emit 'narrative:written' 事件，bridge 监听 → game-store.addLogEntry
// core 不直接操作 Pinia，通过事件通知 UI 层

import type { EventBus } from './event-bus'

export interface LogDisplay {
  trigger?: 'auto' | 'click'
  display?: 'instant' | 'typewriter'
  speed?: number
  pause?: number
  color?: string
  size?: string
  font?: string
}

export interface LogEntry {
  id: string
  text: string
  type: string
  source?: string
  timestamp?: number
  interactive?: boolean
  consumed?: boolean
  payload?: any
  _display?: LogDisplay
}

const DEFAULT_LIMIT = 1000

export class NarrativeLog {
  private entries: LogEntry[] = []
  private limit: number
  private eventBus: EventBus | null = null
  private idCounter = 0

  constructor(limit: number = DEFAULT_LIMIT) {
    this.limit = limit
  }

  // 注释：注入事件总线，write() 时 emit 'narrative:written'
  setEventBus(bus: EventBus): void {
    this.eventBus = bus
  }

  // 注释：写入一条 entry，返回 entry id
  write(
    text: string,
    type: string,
    source?: string,
    interactive?: boolean,
    payload?: any,
    display?: LogDisplay,
  ): string {
    const id = `log-${++this.idCounter}`
    const entry: LogEntry = {
      id,
      text,
      type,
      source,
      timestamp: Date.now(),
      interactive,
      payload,
      _display: display,
    }

    this.entries.push(entry)
    // 注释：自动淘汰——超过 limit 删最旧
    if (this.entries.length > this.limit) {
      this.entries = this.entries.slice(-this.limit)
    }
    // 注释：emit 事件通知 UI 层（bridge 监听 → game-store.addLogEntry）
    if (this.eventBus) {
      this.eventBus.emit('narrative:written', entry)
    }
    return id
  }

  getEntries(): LogEntry[] {
    return [...this.entries]
  }

  // 注释：标记 interactive entry 已结束，防止重复交互
  markConsumed(id: string): void {
    const entry = this.entries.find(e => e.id === id)
    if (entry) {
      entry.consumed = true
    }
  }

  clear(): void {
    this.entries = []
  }

  get length(): number {
    return this.entries.length
  }
}

// 注释：全局单例
export const narrativeLog = new NarrativeLog()
