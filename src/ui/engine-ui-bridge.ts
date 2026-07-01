// 注释：engine-ui-bridge 连接 core GameContext 与 Pinia game-store
// GameContext（core）是 source of truth，game-store（Pinia）是响应式镜像
// core → Pinia：通过事件总线监听 → 更新 game-store
// Pinia → core：UI 操作 → bridge → 调 core API
// narrativeLog.write → emit narrative:written → bridge → game-store.addLogEntry

import type { Pinia } from 'pinia'
import { gameContext } from '../core/game-context'
import { eventBus } from '../core/event-bus'
import { entitySystem } from '../core/entity-system'
import { narrativeLog } from '../core/narrative-log'
import { useGameStore, type LogEntry } from './stores/game-store'
import { useUIStore } from './stores/ui-store'

// 注释：handler 类型与 event-bus 的 BridgeHandler 一致
type BridgeHandler = (payload: any) => void | Promise<void>

export class EngineUIBridge {
  private pinia: Pinia
  private handlers: { event: string; handler: BridgeHandler }[] = []

  constructor(pinia: Pinia) {
    this.pinia = pinia
  }

  // 注释：启动 bridge——监听 core 事件，同步到 game-store
  start(): void {
    const gameStore = useGameStore(this.pinia)
    const uiStore = useUIStore(this.pinia)

    // 注释：监听 game:mode_changed → pushMode/popMode
    const modeHandler: BridgeHandler = (payload: any) => {
      if (payload.action === 'enter') {
        gameStore.pushMode(payload.mode)
      } else if (payload.action === 'exit') {
        gameStore.popMode()
      }
    }
    eventBus.on('game:mode_changed', modeHandler)
    this.handlers.push({ event: 'game:mode_changed', handler: modeHandler })

    // 注释：监听 game:execution_start/end → setExecutionState
    const execStartHandler: BridgeHandler = () => {
      gameStore.setExecutionState('EXECUTING')
    }
    eventBus.on('game:execution_start', execStartHandler)
    this.handlers.push({ event: 'game:execution_start', handler: execStartHandler })

    const execEndHandler: BridgeHandler = () => {
      gameStore.setExecutionState('IDLE')
    }
    eventBus.on('game:execution_end', execEndHandler)
    this.handlers.push({ event: 'game:execution_end', handler: execEndHandler })

    // 注释：监听 location:enter → setLocation + refreshCharactersAtLocation
    const locationEnterHandler: BridgeHandler = (payload: any) => {
      const loc = entitySystem.get('location', payload.to) as any
      if (loc) {
        gameStore.setLocation(loc)
      }
      this.refreshCharactersAtLocation(payload.to)
      // 注释：切换地点时清空选中角色
      uiStore.clearSelection()
    }
    eventBus.on('location:enter', locationEnterHandler)
    this.handlers.push({ event: 'location:enter', handler: locationEnterHandler })

    // 注释：监听 game:hour_changed → refreshCharactersAtLocation
    const hourHandler: BridgeHandler = () => {
      // 注释：角色 AI 移动（Phase 5 机制到位无触发源）
      const loc = gameStore.location
      if (loc) {
        this.refreshCharactersAtLocation(loc.id)
      }
    }
    eventBus.on('game:hour_changed', hourHandler)
    this.handlers.push({ event: 'game:hour_changed', handler: hourHandler })

    // 注释：监听 character:changed → 更新 player entity（Phase 5 监听到位无触发源）
    const charHandler: BridgeHandler = (payload: any) => {
      if (payload?.id === gameStore.player?.id) {
        gameStore.setPlayer(entitySystem.get('character', payload.id))
      }
    }
    eventBus.on('character:changed', charHandler)
    this.handlers.push({ event: 'character:changed', handler: charHandler })

    // 注释：监听 game:new_day → 检查 reason，非 'forced' → pushMode('daily_menu')
    const newDayHandler: BridgeHandler = (payload: any) => {
      if (payload?.reason !== 'forced') {
        gameStore.pushMode('daily_menu')
      }
    }
    eventBus.on('game:new_day', newDayHandler)
    this.handlers.push({ event: 'game:new_day', handler: newDayHandler })

    // 注释：监听 combat:start → 写入参战者到 game-store
    const combatStartHandler: BridgeHandler = (payload: any) => {
      gameStore.setCombatAllies(payload.allies ?? payload.participants ?? [])
      gameStore.setCombatEnemies(payload.enemies ?? [])
    }
    eventBus.on('combat:start', combatStartHandler)
    this.handlers.push({ event: 'combat:start', handler: combatStartHandler })

    // 注释：监听 combat:end → 清除参战者
    const combatEndHandler: BridgeHandler = () => {
      gameStore.setCombatAllies([])
      gameStore.setCombatEnemies([])
    }
    eventBus.on('combat:end', combatEndHandler)
    this.handlers.push({ event: 'combat:end', handler: combatEndHandler })
    const narrativeHandler: BridgeHandler = (entry: LogEntry) => {
      gameStore.addLogEntry(entry)
    }
    eventBus.on('narrative:written', narrativeHandler)
    this.handlers.push({ event: 'narrative:written', handler: narrativeHandler })

    // 注释：设置 narrativeLog 的 eventBus
    narrativeLog.setEventBus(eventBus)
  }

  // 注释：刷新当前地点角色列表
  refreshCharactersAtLocation(locationId: string): void {
    const gameStore = useGameStore(this.pinia)
    const characters: any[] = []
    // 注释：遍历所有 character 实体，过滤 current_location === locationId
    // TODO(phase-6): 用 home_locations + behavior 初始化 current_location
    const allChars = entitySystem.getAll('character')
    for (const char of allChars) {
      if (char.current_location === locationId) {
        characters.push(char)
      }
    }
    gameStore.setCharactersAtLocation(characters)
  }

  // 注释：同步初始状态——从 core 到 game-store
  syncInitialState(): void {
    const gameStore = useGameStore(this.pinia)
    const ctx = gameContext.getContext()
    gameStore.setPlayer(ctx.player)
    gameStore.setLocation(ctx.location)
    gameStore.setTime(ctx.time)
    gameStore.setExecutionState(gameContext.getExecutionState())
  }

  // 注释：停止 bridge——移除所有监听
  stop(): void {
    for (const { event, handler } of this.handlers) {
      eventBus.off(event, handler)
    }
    this.handlers = []
  }

  // 注释：创建 ExecutionContext 供 commandExecutor 使用
  createExecutionContext(): any {
    const uiStore = useUIStore(this.pinia)
    const gameStore = useGameStore(this.pinia)
    return {
      uiStore,
      gameStore,
      engine: gameContext,
      evaluateCondition: () => true, // TODO: 接入 condition-registry 求值
    }
  }
}
