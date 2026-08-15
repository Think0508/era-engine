// 注释：random-event-system 插件——复刻 erArk 行为期随机事件（event.py）
// 职责：行为挂钩（玩家 execution_end / NPC behavior_started）→ 事件选择 →
//       文本+效果结算 → 子事件选项挂起/选择 → 触发记录（全时/今日）→ 存档集成
// 玩家侧 current_behavior 镜像由本插件维护（L3 字段，与 npc-ai 共享语义）

import type { PluginContext } from '../../core/types'
import { modLoader } from '../../core/mod-loader'
import { entitySystem } from '../../core/entity-system'
import { errorReporter } from '../../core/error-reporter'
import { gameContext } from '../../core/game-context'
import { eventBus } from '../../core/event-bus'
import { apiSystem } from '../../core/api'
import { randomEventEngine } from '../../core/random-event'
import { commandRegistry } from '../../core/command-registry'
import { conditionRegistry } from '../../core/condition-registry'
import { registerGameStateProvider } from '../../core/save-system'
import { registerSystemEffects } from './system-effects'
import {
  triggerEventFor,
  choosePendingOption,
  clearPendingOptions,
  getPendingOption,
} from './trigger'
import type { PendingOption } from './types'

export function onLoad(_ctx: PluginContext): void {
  registerSystemEffects()
}

export function onEnable(ctx: PluginContext): void {
  // 注释：1. 构建事件索引 + 数据校验（幂等——HMR/重载安全）
  // 注意：校验必须在 onEnable 执行——onLoad 时 mod 尚未加载（初始化顺序：插件 onLoad
  // → 模组加载 → 插件 onEnable），getMod() 为 null 会静默跳过
  const mod = modLoader.getMod() as any
  randomEventEngine.registerAll(mod?.events ?? [])
  validateEventData()

  // 注释：2. API
  ctx.api.register('random-event', {
    triggerFor: async (subjectId: string, behaviorId: string, targetId: string | null): Promise<void> => {
      await triggerEventFor(subjectId, behaviorId, targetId)
    },
    chooseOption: async (index: number): Promise<boolean> => {
      return choosePendingOption(index)
    },
    getPending: (): PendingOption | null => getPendingOption(),
    clearPending: (): void => clearPendingOptions(),
  })

  // 注释：3. 玩家事件挂钩——每次指令/移动/等待结算后
  // 2026-08-15 审计 B-I-2：时停中玩家行动/移动不再触发随机事件——世界冻结（文本/子选项
  // 会破坏自动时停移动的静默承诺，advance_time 类效果还会让冻结时钟漂移——移动路径无
  // execution_end 回拨）。可选集成：h-time-stop 缺失 → 正常触发。
  const timeStopActive = (): boolean => {
    try { return !!apiSystem.callSync('h-time-stop', 'isActive') } catch { return false }
  }
  ctx.events.on('game:execution_end', async (payload: any) => {
    if (timeStopActive()) return
    const playerId = modLoader.getMod()?.playerCharacter
    if (!playerId) return
    const commandId = payload?.commandId as string | undefined
    if (!commandId) return
    // 注释：move 指令只打开地图界面（map 模式），不移动——移动事件由 location:enter 触发
    if (commandId === 'move') return
    const player = entitySystem.get('character', playerId) as any
    if (!player) return
    // 注释：玩家行为镜像 = 刚完成的指令 id（与 NPC 的 current_behavior 同字段语义）
    player.current_behavior = commandId
    eventBus.emit('character:changed', { id: playerId })
    const selected = gameContext.getContext().selectedCharacterId ?? null
    await triggerEventFor(playerId, commandId, selected)
  })

  // 注释：3a. 玩家主动行动开始 → 挂起选项作废（设计 Q15：不选就去执行其他指令 = 放弃）。
  // 注意：不清 execution_end 里的——玩家指令结算中（advanceTime）NPC 事件挂起的选项
  // 必须保留到玩家 IDLE 显示（execution_end 不再清——2026-08-10 排查：无条件清会把
  // 玩家从未见到的 NPC 选项静默丢弃）
  ctx.events.on('game:execution_start', () => {
    clearPendingOptions()
  })

  // 注释：3b. 玩家移动事件挂钩——地图移动不经 commandExecutor（moveTo 直达），
  // location:enter {from} 是移动完成的信号（erArk 移动行为事件挂载键 move）
  ctx.events.on('location:enter', async (payload: any) => {
    if (timeStopActive()) return
    clearPendingOptions()
    const playerId = modLoader.getMod()?.playerCharacter
    if (!playerId) return
    if (payload?.to === undefined || payload?.from === undefined) return
    const player = entitySystem.get('character', playerId) as any
    if (!player) return
    player.current_behavior = 'move'
    eventBus.emit('character:changed', { id: playerId })
    const selected = gameContext.getContext().selectedCharacterId ?? null
    await triggerEventFor(playerId, 'move', selected)
  })

  // 注释：4. NPC 事件挂钩——新行为开始时（npc:behavior_started 同点）
  // 2026-08-15 复查 M-3：时停守卫——正常路径冻结 NPC 不结算不发事件（settle-pass 跳过），
  // 但程序化 setBehavior（mod 脚本）可对冻结 NPC 强发 → 时停中不触发（世界冻结）
  ctx.events.on('npc:behavior_started', async (payload: any) => {
    if (timeStopActive()) return
    const charId = payload?.character as string | undefined
    const behaviorId = payload?.behavior_id as string | undefined
    if (!charId || !behaviorId) return
    // 注释：NPC 事件 interactant 默认 = 同地点玩家；无玩家同地点 → null
    //（文本事件由地点门控挡掉，静默事件照常触发）
    const playerId = modLoader.getMod()?.playerCharacter ?? null
    const npc = entitySystem.get('character', charId) as any
    const player = playerId ? entitySystem.get('character', playerId) as any : null
    const targetId = (player && npc?.current_location && player?.current_location === npc.current_location) ? playerId : null
    await triggerEventFor(charId, behaviorId, targetId)
  })

  // 注释：5. 触发记录——今日记录每日重置
  ctx.events.on('game:new_day', () => {
    randomEventEngine.resetToday()
  })

  // 注释：5b. 读档后清挂起选项（瞬态状态不入存档——旧选项在恢复的游戏状态下执行会语义错位）
  ctx.events.on('game:load', () => {
    clearPendingOptions()
  })

  // 注释：6. 存档集成（触发记录随存档，gameState provider）
  registerGameStateProvider({
    id: 'random-event',
    serialize: () => randomEventEngine.serialize(),
    restore: (data: Record<string, any>) => {
      randomEventEngine.restore({
        all: Array.isArray(data?.all) ? data.all : [],
        today: Array.isArray(data?.today) ? data.today : [],
      })
    },
  })
}

// 注释：事件数据校验（onEnable 时执行——warning：挂载键/condition/字段合法值提示；
// 效果类型由加载时的 effect 校验兜底；premises 未知前提由运行时 strict 淘汰兜底）
// 挂载键合法来源：内置 move/wait、commandRegistry 已注册指令（native-instructions 或 mod 指令）、
// NPC 行为规格（ai-behaviors.toml）
function validateEventData(): void {
  const mod = modLoader.getMod() as any
  if (!mod?.events?.length) return
  const charIds = new Set<string>()
  for (const [id] of mod.entities.get('character') ?? []) charIds.add(id)
  const validTypes = new Set([0, 1, 2])
  const validSides = new Set(['self', 'target', 'any', 'both'])
  const validGuards = new Set(['seen_once', 'unseen_once', 'seen_today', 'unseen_today'])
  for (const ev of mod.events) {
    if (['move', 'wait'].includes(ev.behavior)) continue
    if (commandRegistry.getById(ev.behavior)) continue
    if (mod.aiBehaviors?.[ev.behavior]) continue
    errorReporter.report({
      source: 'random-event-system',
      severity: 'warning',
      message: `事件 '${ev.id}' 挂载键 '${ev.behavior}' 未匹配已知指令/行为`,
      suggestion: '挂载键应为指令 id（native-instructions 或 mod 指令）、NPC 行为规格 id，或内置 move/wait',
    })
  }
  for (const ev of mod.events) {
    if (!validTypes.has(ev.type)) {
      errorReporter.report({
        source: 'random-event-system',
        severity: 'warning',
        message: `事件 '${ev.id}' 的 type 非法：${String(ev.type)}`,
        suggestion: 'type 取值：0/1 结算事件（合并语义），2 静默事件',
      })
    }
    if (ev.side !== undefined && !validSides.has(ev.side)) {
      errorReporter.report({
        source: 'random-event-system',
        severity: 'warning',
        message: `事件 '${ev.id}' 的 side 非法：'${ev.side}'`,
        suggestion: 'side 取值：self/target/any/both（省略=any）',
      })
    }
    if (ev.trigger_guard !== undefined && !validGuards.has(ev.trigger_guard)) {
      errorReporter.report({
        source: 'random-event-system',
        severity: 'warning',
        message: `事件 '${ev.id}' 的 trigger_guard 非法：'${ev.trigger_guard}'`,
        suggestion: 'trigger_guard 取值：seen_once/unseen_once/seen_today/unseen_today',
      })
    }
    if (ev.adv && !charIds.has(ev.adv)) {
      errorReporter.report({
        source: 'random-event-system',
        severity: 'warning',
        message: `事件 '${ev.id}' 的 adv 引用不存在的角色：'${ev.adv}'`,
        suggestion: 'adv 应为角色 id（characters/ 下定义的实体）',
      })
    }
    if (!ev.condition) continue
    const res = conditionRegistry.validateExpression(ev.condition)
    if (!res.ok) {
      errorReporter.report({
        source: 'random-event-system',
        severity: 'warning',
        message: `事件 '${ev.id}' 的条件引用了未注册字段：${res.unknown.join(', ')}`,
        suggestion: '检查 condition 拼写；可用字段见 可用条件属性手册.md',
      })
    }
  }
}

// 注释：供测试/重载清空
export function _resetForTest(): void {
  clearPendingOptions()
}
