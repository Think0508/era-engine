// 注释：random-event-system 插件——复刻 erArk 行为期随机事件（event.py）
// 职责：行为挂钩（玩家 execution_end / NPC behavior_started）→ 事件选择 →
//       文本+效果结算 → 子事件选项挂起/选择 → 触发记录（全时/今日）→ 存档集成
// 玩家侧 current_behavior 镜像由本插件维护（L3 字段，与 npc-ai 共享语义）

import type { PluginContext } from '../../core/types'
import { modLoader } from '../../core/mod-loader'
import { entitySystem } from '../../core/entity-system'
import { errorReporter } from '../../core/error-reporter'
import { gameContext } from '../../core/game-context'
import { randomEventEngine } from '../../core/random-event'
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
  validateEventData()
}

export function onEnable(ctx: PluginContext): void {
  // 注释：1. 构建事件索引（幂等——HMR/重载安全）
  const mod = modLoader.getMod() as any
  randomEventEngine.registerAll(mod?.events ?? [])

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
  ctx.events.on('game:execution_end', async (payload: any) => {
    clearPendingOptions()
    const playerId = modLoader.getMod()?.playerCharacter
    if (!playerId) return
    const commandId = payload?.commandId as string | undefined
    if (!commandId) return
    const player = entitySystem.get('character', playerId) as any
    if (!player) return
    // 注释：玩家行为镜像 = 刚完成的指令 id（与 NPC 的 current_behavior 同字段语义）
    player.current_behavior = commandId
    const selected = gameContext.getContext().selectedCharacterId ?? null
    await triggerEventFor(playerId, commandId, selected)
  })

  // 注释：4. NPC 事件挂钩——新行为开始时（npc:behavior_started 同点）
  ctx.events.on('npc:behavior_started', async (payload: any) => {
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

// 注释：事件数据校验（加载时 warning——挂载键存在性提示；效果类型由加载时的 effect 校验兜底）
function validateEventData(): void {
  const mod = modLoader.getMod() as any
  if (!mod?.events?.length) return
  const instructions = new Set((mod.instructions ?? []).map((i: any) => i.id))
  const behaviors = new Set(Object.keys(mod.aiBehaviors ?? {}))
  for (const ev of mod.events) {
    if (!['move', 'wait'].includes(ev.behavior) && !instructions.has(ev.behavior) && !behaviors.has(ev.behavior)) {
      errorReporter.report({
        source: 'random-event-system',
        severity: 'warning',
        message: `事件 '${ev.id}' 挂载键 '${ev.behavior}' 未匹配已知指令/行为`,
        suggestion: '挂载键应为指令 id（native-instructions 或 mod 指令）、NPC 行为规格 id，或内置 move/wait',
      })
    }
  }
}

// 注释：供测试/重载清空
export function _resetForTest(): void {
  clearPendingOptions()
}
