// 注释：engine-ui-bridge 连接 core GameContext 与 Pinia game-store
// GameContext（core）是 source of truth，game-store（Pinia）是响应式镜像
// core → Pinia：通过事件总线监听 → 更新 game-store
// Pinia → core：UI 操作 → bridge → 调 core API
// narrativeLog.write → emit narrative:written → bridge → game-store.addLogEntry

import type { Pinia } from 'pinia'
import { watch } from 'vue'
import { gameContext } from '../core/game-context'
import { eventBus } from '../core/event-bus'
import { entitySystem } from '../core/entity-system'
import { narrativeLog } from '../core/narrative-log'
import { apiSystem } from '../core/api'
import { useGameStore, type LogEntry } from './stores/game-store'
import { useUIStore } from './stores/ui-store'
import { createCommandEvaluators } from './utils/command-eval'

// 注释：handler 类型与 event-bus 的 BridgeHandler 一致
type BridgeHandler = (payload: any) => void | Promise<void>

export class EngineUIBridge {
  private pinia: Pinia
  private handlers: { event: string; handler: BridgeHandler }[] = []
  private watchStops: (() => void)[] = []
  // 注释：错误订阅退订函数（stop() 时清理，round 13）
  private errorUnsub: (() => void) | null = null

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
      // 注释：新行动开始 → 作废挂起的随机事件选项
      uiStore.setEventOptions(null)
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
        const entity = entitySystem.get('character', payload.id)
        if (entity) {
          gameStore.setPlayer(JSON.parse(JSON.stringify(entity)))
        }
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

    // 注释：监听 narrative:written → game-store.addLogEntry
    const narrativeHandler: BridgeHandler = (entry: LogEntry) => {
      gameStore.addLogEntry(entry)
    }
    eventBus.on('narrative:written', narrativeHandler)
    this.handlers.push({ event: 'narrative:written', handler: narrativeHandler })

    // 注释：设置 narrativeLog 的 eventBus
    narrativeLog.setEventBus(eventBus)

    // 注释：UI 选中角色 → 核心（条件引擎 selected/target 根路径依赖）
    // 初始化 + 变更同步；stop() 时清理 watcher
    const syncSelection = () => {
      gameContext.setSelectedCharacterId(uiStore.selectedCharacterId)
    }
    syncSelection()
    const selectionWatch = watch(() => uiStore.selectedCharacterId, syncSelection)
    this.watchStops.push(selectionWatch)

    // 注释：监听时间变化 → 同步到 game-store
    const timeHandler: BridgeHandler = () => {
      const ctx = gameContext.getContext()
      gameStore.setTime(ctx.time)
    }
    eventBus.on('game:hour_changed', timeHandler)
    eventBus.on('game:new_day', timeHandler)
    // 注释：audit-d I-1 修复——不跨整点的行动（8:00+10min=8:10）此前 UI 时间陈旧
    // （只监 hour_changed/new_day）；补 game:time_advanced 全覆盖
    eventBus.on('game:time_advanced', timeHandler)
    this.handlers.push({ event: 'game:hour_changed', handler: timeHandler })
    this.handlers.push({ event: 'game:new_day', handler: timeHandler })
    this.handlers.push({ event: 'game:time_advanced', handler: timeHandler })

    // 注释：随机事件选项条——挂起/清除同步到 ui-store
    const eventOptionsHandler: BridgeHandler = (payload: any) => {
      uiStore.setEventOptions(Array.isArray(payload?.options) ? payload.options : null)
    }
    eventBus.on('random-event:options', eventOptionsHandler)
    this.handlers.push({ event: 'random-event:options', handler: eventOptionsHandler })
    const eventOptionsClearHandler: BridgeHandler = () => {
      uiStore.setEventOptions(null)
    }
    eventBus.on('random-event:options_clear', eventOptionsClearHandler)
    this.handlers.push({ event: 'random-event:options_clear', handler: eventOptionsClearHandler })

    // 注释：睡醒自动存档（sleep-system 发出——插件无 uiState，UI 层提供存档数据）
    // 对齐 erArk pl_sleep_save_flag → sleep_settle.update_save()（auto 槽）
    const autosaveHandler: BridgeHandler = async (payload: any) => {
      try {
        const { autoSave } = await import('../core/save-system')
        await autoSave(uiStore.toSaveData(), payload?.label ?? '睡醒自动存档')
      } catch (err) {
        // M14 修复：错误处理铁律——UI 层同样走 errorReporter（console.warn 静默无痕）
        const { errorReporter } = await import('../core/error-reporter')
        errorReporter.report({
          source: 'engine-ui-bridge',
          severity: 'warning',
          message: `睡醒自动存档失败：${err instanceof Error ? err.message : String(err)}`,
        })
      }
    }
    eventBus.on('game:autosave_requested', autosaveHandler)
    this.handlers.push({ event: 'game:autosave_requested', handler: autosaveHandler })

    // 注释：读档后清选项条 UI（旧选项在恢复的游戏状态下执行会语义错位）
    const gameLoadHandler: BridgeHandler = () => {
      uiStore.setEventOptions(null)
    }
    eventBus.on('game:load', gameLoadHandler)
    this.handlers.push({ event: 'game:load', handler: gameLoadHandler })
    // 注释：事件效果（set_interactant player_target_to_me）让玩家选中某角色——
    // gameContext 已同步（条件层），此处同步 UI 选中（bridge 的 watch 是单向 uiStore→gameContext）
    const selectCharacterHandler: BridgeHandler = (payload: any) => {
      if (payload?.characterId) uiStore.selectCharacter(payload.characterId)
    }
    eventBus.on('random-event:select_character', selectCharacterHandler)
    this.handlers.push({ event: 'random-event:select_character', handler: selectCharacterHandler })

    // 注释：round 13 接线修复——错误上报 → 游戏内红色警告（AGENTS §7"弹红色警告"此前断链：
    // 错误只进 console，玩家无感知；@errors 调试命令默认隐藏）。经 errorReporter.onReport
    // 订阅（非事件总线——避免 event-bus 自身报错 → report → 事件循环）。只显示 error 级
    // （warning 仍进 console/@errors，避免刷屏）。订阅者只写日志，不再触发上报（无环）。
    import('../core/error-reporter').then(({ errorReporter }) => {
      this.errorUnsub = errorReporter.onReport((err) => {
        if (err.severity !== 'error') return
        const gameStore = useGameStore(this.pinia)
        gameStore.addLogEntry({
          id: `err-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          text: `⚠️ [${err.source}] ${err.message}${err.suggestion ? `（${err.suggestion}）` : ''}`,
          type: 'system',
          source: 'error-reporter',
        })
      })
    })
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

  // 注释：停止 bridge——移除所有监听与 watcher
  stop(): void {
    for (const { event, handler } of this.handlers) {
      eventBus.off(event, handler)
    }
    this.handlers = []
    for (const stop of this.watchStops) stop()
    if (this.errorUnsub) {
      this.errorUnsub()
      this.errorUnsub = null
    }
    this.watchStops = []
  }

  // 注释：创建 ExecutionContext 供 commandExecutor 使用
  createExecutionContext(): any {
    const uiStore = useUIStore(this.pinia)
    const gameStore = useGameStore(this.pinia)
    return {
      uiStore,
      gameStore,
      engine: gameContext,
      api: apiSystem,
      ...createCommandEvaluators({ uiStore, gameStore }),
      sourceId: gameStore.player?.id ?? null,
    }
  }
}
