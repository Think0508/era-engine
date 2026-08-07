import type { GameContext, LocationData, EntityData, GameTimeData } from './types'
import { entitySystem } from './entity-system'
import { eventBus } from './event-bus'

const NIGHT_START_HOUR = 22
const DAYS_PER_MONTH = 30
const MONTHS_PER_YEAR = 12

class GameContextManager {
  private player: EntityData | null = null
  private location: LocationData | null = null
  private time: GameTimeData = {
    minute: 0, hour: 8, day: 1, month: 1, year: 1
  }
  // 注释：执行状态——IDLE 时玩家可操作，EXECUTING 时行动执行中
  private executionState: 'IDLE' | 'EXECUTING' = 'IDLE'
  // 注释：模式栈——enterMode push，exitMode pop
  private modeStack: string[] = ['exploration']
  // 注释：实体字段别名（插件注册，如 status → status_effects）
  private fieldAliases: Record<string, string> = {}
  // 注释：当前选中角色（UI 层通过 bridge 同步；条件引擎 selected/target 根路径使用）
  private selectedCharacterId: string | null = null

  getContext(): GameContext {
    return {
      player: this.player,
      location: this.location,
      time: { ...this.time },
      getEntity: (type: string, id: string) => entitySystem.get(type, id),
      selectedCharacterId: this.selectedCharacterId ?? undefined,
      fieldAliases: this.fieldAliases,
    }
  }

  // 注释：注册实体字段别名（供条件路径解析，如 status → status_effects）
  setFieldAliases(aliases: Record<string, string>): void {
    this.fieldAliases = { ...this.fieldAliases, ...aliases }
  }

  // 注释：同步 UI 选中角色到核心（条件引擎 selected/target 根路径）
  setSelectedCharacterId(charId: string | null): void {
    this.selectedCharacterId = charId
  }

  setPlayer(charId: string): void {
    this.player = entitySystem.get('character', charId)
    if (!this.player) {
      throw new Error(`玩家角色 '${charId}' 不存在`)
    }
  }

  setLocation(location: LocationData): void {
    this.location = location
  }

  setTime(time: GameTimeData): void {
    this.time = { ...time }
  }

  async advanceTime(minutes: number): Promise<void> {
    let remaining = minutes
    while (remaining > 0) {
      const minutesToNextHour = 60 - this.time.minute
      if (remaining < minutesToNextHour) {
        this.time.minute += remaining
        remaining = 0
      } else {
        this.time.minute = 0
        this.time.hour++
        remaining -= minutesToNextHour
        await eventBus.emit('game:hour_changed', { hour: this.time.hour })

        if (this.time.hour === NIGHT_START_HOUR) {
          await eventBus.emit('game:night_start', { hour: this.time.hour })
        }

        if (this.time.hour >= 24) {
          this.time.hour -= 24
          this.time.day++
          // 注释：game:new_day payload 带 reason 字段
          // 'natural' = 自然睡眠/时间流逝，'forced' = 被动昏迷
          // forced 不触发每日菜单（bridge 监听 reason 判断）
          await eventBus.emit('game:new_day', { day: this.time.day, reason: 'natural' })
          if (this.time.day > DAYS_PER_MONTH) {
            this.time.day = 1
            this.time.month++
            if (this.time.month > MONTHS_PER_YEAR) {
              this.time.month = 1
              this.time.year++
            }
          }
        }
      }
    }
  }

  // 注释：移动到目标地点——command-executor 的 move 指令调用
  // 注释：可达性检查由 map-system 插件的 getReachable() 完成
  // 注释：此方法只做移动 + 时间推进 + 事件发射
  async moveTo(targetLocationId: string, timeCost?: number): Promise<void> {
    if (!this.location) {
      throw new Error('moveTo 失败：当前地点未设置')
    }
    // 注释：timeCost 默认 5 分钟
    const cost = timeCost ?? 5
    // 注释：先 leave 后 enter，符合"离开→到达"直觉
    await eventBus.emit('location:leave', { from: this.location.id })
    await this.advanceTime(cost)
    // 注释：从 entity-system 获取目标地点数据
    const targetEntity = entitySystem.get('location', targetLocationId)
    if (targetEntity) {
      this.location = targetEntity as unknown as LocationData
    }
    await eventBus.emit('location:enter', { to: targetLocationId })
  }

  // 注释：设置执行状态——command-executor 调用
  setExecutionState(state: 'IDLE' | 'EXECUTING'): void {
    this.executionState = state
  }

  getExecutionState(): 'IDLE' | 'EXECUTING' {
    return this.executionState
  }

  // 注释：push 模式到栈——enter_mode effect / ctx.api.call('engine', 'enterMode', id)
  // 注释：模式栈由进入模式的系统负责调用 exitMode，引擎不自动 pop
  async enterMode(id: string): Promise<void> {
    this.modeStack.push(id)
    await eventBus.emit('game:mode_changed', { mode: id, action: 'enter' })
  }

  // 注释：pop 模式出栈
  async exitMode(): Promise<string | undefined> {
    const popped = this.modeStack.pop()
    if (popped) {
      await eventBus.emit('game:mode_changed', { mode: popped, action: 'exit' })
    }
    return popped
  }

  getCurrentMode(): string {
    return this.modeStack[this.modeStack.length - 1] ?? 'exploration'
  }

  getModeStack(): string[] {
    return [...this.modeStack]
  }

  // 注释：供 bridge 调用——emit 事件的便捷方法
  async emit(event: string, payload?: any): Promise<void> {
    await eventBus.emit(event, payload)
  }

  // 注释：已完成的 scene（event/quest）ID 集合——存档持久化
  private completedScenes: Set<string> = new Set()

  addCompletedScene(id: string): void {
    this.completedScenes.add(id)
  }

  isCompleted(id: string): boolean {
    return this.completedScenes.has(id)
  }

  getCompletedScenes(): string[] {
    return Array.from(this.completedScenes)
  }

  setCompletedScenes(ids: string[]): void {
    this.completedScenes = new Set(ids)
  }

  reset(): void {
    this.player = null
    this.location = null
    this.time = { minute: 0, hour: 8, day: 1, month: 1, year: 1 }
    this.executionState = 'IDLE'
    this.modeStack = ['exploration']
    this.completedScenes.clear()
  }
}

export const gameContext = new GameContextManager()
