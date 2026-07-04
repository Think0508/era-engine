// 注释：h-hidden 插件——隐奸系统，完全对齐 erArk
// 4 级隐奸模式（0=否 1=双不隐 2=女隐 3=男隐 4=双隐）
// 发现度系统 + 羞耻/快感 tick + 绝顶暴露 + 经验 + NPC 隐匿 + 成就
//
// 参考 erArk 源文件：
//   hidden_sex_panel.py   — 发现度积累/衰减/概率判定、模式选择面板
//   realtime_settle.py:503-509  — 羞耻/心理快感 tick
//   Second_effect.py:3274-3343 — 绝顶暴露（411-414）
//   default.py:5191-5252       — 隐奸状态清零（471-473）
//   handle_npc_ai.py:800-815   — NPC 隐匿逻辑
//   settle_behavior.py:683-699 — 隐奸经验（35）
//   second_behavior.py:457-460 — 成就记录
//   handle_premise_sp_flag.py  — 全部 32+ 前提
//   constant_effect.py         — 效果 ID 常量
//   game_type.py               — 数据结构
//   Behavior_Effect.csv:380-382 — 指令效果链
//   InstructConfig.csv:200,214 — 指令配置
//   Hidden_Level.csv           — 4 级发现度阈值

import type { PluginContext } from '../../core/types'
import { effectTypeRegistry } from '../../core/effect-type-registry'
import { entitySystem } from '../../core/entity-system'
import { eventBus } from '../../core/event-bus'
import { gameContext } from '../../core/game-context'
import { narrativeLog } from '../../core/narrative-log'
import { commandRegistry } from '../../core/command-registry'
import { apiSystem } from '../../core/api'

// 注释：Hidden_Level.csv 的 4 级发现度阈值
const HIDDEN_LEVELS = [
  { cid: 0, name: '完全隐蔽', threshold: 30 },
  { cid: 1, name: '隐蔽', threshold: 60 },
  { cid: 2, name: '引人注意', threshold: 80 },
  { cid: 3, name: '随时暴露', threshold: 95 },
]

// 注释：4 级隐奸模式名称
const MODE_NAMES = ['无', '双不隐', '女隐', '男隐', '双隐']

function getSelfId(ctx: any): string | null {
  return ctx.gameStore?.player?.id ?? ctx.sourceId ?? null
}

function getTargetId(ctx: any): string | null {
  return ctx.selectedCharacterId ?? ctx.uiStore?.selectedCharacterId ?? null
}

// 注释：getAbilityAdjust — 能力等级修正表（与 h-bondage 共享一致逻辑）
// erArk get_ability_adjust: [1.0, 1.1, 1.25, 1.4, 1.6, 1.8, 2.1, 2.4, 2.8, 3.2, 4.0]
function getAbilityAdjust(lv: number): number {
  const tbl = [1.0, 1.1, 1.25, 1.4, 1.6, 1.8, 2.1, 2.4, 2.8, 3.2, 4.0]
  return tbl[Math.min(Math.max(0, lv), 10)] ?? 4.0
}

// 注释：获取指定角色的 hidden_sex_mode（0=无 1=双不隐 2=女隐 3=男隐 4=双隐）
function getMode(charId: string): number {
  const ch = entitySystem.get('character', charId) as any
  return ch?.sp_flag?.hidden_sex_mode ?? 0
}

export function onLoad(_ctx: PluginContext): void {
  // 注释：TODO Task 3 — 注册效果类型
  // effectTypeRegistry.register('hidden_sex_set_mode', ...)
  // effectTypeRegistry.register('hidden_sex_clear', ...)
  // effectTypeRegistry.register('hidden_sex_discovery_tick', ...)
  // effectTypeRegistry.register('hidden_sex_orgasm_exposure', ...)
}

export async function onEnable(ctx: PluginContext): Promise<void> {
  const reg = (id: string, fn: (c: any) => boolean) => {
    try { ctx.api.call('h-core', 'registerPremise', id, fn) } catch { }
  }

  function getTargetMode(ctx2: any): number {
    const id = getTargetId(ctx2)
    if (!id) return 0
    return getMode(id)
  }

  function getSelfMode(ctx2: any): number {
    const id = getSelfId(ctx2)
    if (!id) return 0
    return getMode(id)
  }

  // 注释：HIDDEN_SEX_MODE_0 — 不在隐奸中
  reg('HIDDEN_SEX_MODE_0', (ctx2: any) => getSelfMode(ctx2) === 0)
  reg('HIDDEN_SEX_MODE_GE_1', (ctx2: any) => getSelfMode(ctx2) >= 1)
  reg('HIDDEN_SEX_MODE_1', (ctx2: any) => getSelfMode(ctx2) === 1)
  reg('HIDDEN_SEX_MODE_2', (ctx2: any) => getSelfMode(ctx2) === 2)
  reg('HIDDEN_SEX_MODE_3', (ctx2: any) => getSelfMode(ctx2) === 3)
  reg('HIDDEN_SEX_MODE_4', (ctx2: any) => getSelfMode(ctx2) === 4)
  reg('HIDDEN_SEX_MODE_1_OR_2', (ctx2: any) => { const m = getSelfMode(ctx2); return m === 1 || m === 2 })
  reg('HIDDEN_SEX_MODE_3_OR_4', (ctx2: any) => { const m = getSelfMode(ctx2); return m === 3 || m === 4 })
  reg('HIDDEN_SEX_MODE_1_OR_3', (ctx2: any) => { const m = getSelfMode(ctx2); return m === 1 || m === 3 })
  reg('HIDDEN_SEX_MODE_2_OR_4', (ctx2: any) => { const m = getSelfMode(ctx2); return m === 2 || m === 4 })

  // 注释：目标的对应前提
  reg('TARGET_HIDDEN_SEX_MODE_GE_1', (ctx2: any) => getTargetMode(ctx2) >= 1)
  reg('TARGET_HIDDEN_SEX_MODE_1', (ctx2: any) => getTargetMode(ctx2) === 1)
  reg('TARGET_HIDDEN_SEX_MODE_2', (ctx2: any) => getTargetMode(ctx2) === 2)
  reg('TARGET_HIDDEN_SEX_MODE_3', (ctx2: any) => getTargetMode(ctx2) === 3)
  reg('TARGET_HIDDEN_SEX_MODE_4', (ctx2: any) => getTargetMode(ctx2) === 4)
  reg('TARGET_HIDDEN_SEX_MODE_1_OR_2', (ctx2: any) => { const m = getTargetMode(ctx2); return m === 1 || m === 2 })
  reg('TARGET_HIDDEN_SEX_MODE_3_OR_4', (ctx2: any) => { const m = getTargetMode(ctx2); return m === 3 || m === 4 })

  // 注释：TARGET_NOT_IN_HIDDEN_SEX_MODE — 目标不在隐奸中
  reg('TARGET_NOT_IN_HIDDEN_SEX_MODE', (ctx2: any) => getTargetMode(ctx2) === 0)

  // 注释：玩家相关前提
  reg('PLAYER_IN_HIDDEN_SEX_MODE', (ctx2: any) => {
    const id = getSelfId(ctx2); if (!id) return false
    return getMode(id) >= 1
  })
  reg('PLAYER_NOT_IN_HIDDEN_SEX_MODE', (ctx2: any) => {
    const id = getSelfId(ctx2); if (!id) return false
    return getMode(id) === 0
  })
  reg('PL_NOT_HIDDEN_SEX_MODE_3_OR_4', (ctx2: any) => {
    const playerId = entitySystem.getAll('character').find((c: any) => c.id === 'player' || c.id === '0')?.id
    if (!playerId) return true
    const m = getMode(playerId); return !(m === 3 || m === 4)
  })

  // 注释：复合前提
  reg('SLEEP_H_OR_HIDDEN_SEX', (ctx2: any) => {
    const id = getSelfId(ctx2); if (!id) return false
    const ch = entitySystem.get('character', id) as any
    // 注释：睡眠 H（unconscious_h=3）或 hidden_sex_mode >= 1
    return (ch?.sp_flag?.unconscious_h === 3) || (getMode(id) >= 1)
  })
  reg('TARGET_SLEEP_H_OR_HIDDEN_SEX', (ctx2: any) => {
    const id = getTargetId(ctx2); if (!id) return false
    const ch = entitySystem.get('character', id) as any
    return (ch?.sp_flag?.unconscious_h === 3) || (getMode(id) >= 1)
  })

  reg('PLAYER_NOT_H_OR_HIDDEN_SEX_MODE', (ctx2: any) => {
    const playerId = entitySystem.getAll('character').find((c: any) => c.id === 'player' || c.id === '0')?.id
    if (!playerId) return true
    const ch = entitySystem.get('character', playerId) as any
    // 注释：不在 H 中 或者在隐奸中
    return !ch?.h_state?.is_h || getMode(playerId) >= 1
  })

  // 注释：UI/场所相关前提
  reg('SHOW_NON_H_IN_HIDDEN_SEX', (ctx2: any) => {
    // 注释：cache 级标志，存于 game context
    return (gameContext.getContext() as any)?.show_non_h_in_hidden_sex === true
  })
  reg('NOT_SHOW_NON_H_IN_HIDDEN_SEX', (ctx2: any) => {
    return (gameContext.getContext() as any)?.show_non_h_in_hidden_sex !== true
  })

  reg('PLACE_SOMEONE_H_BUT_NOT_HIDDEN_SEX', (ctx2: any) => {
    // 注释：场景中有他人处于非隐奸 H 模式
    for (const ch of entitySystem.getAll('character')) {
      const c = ch as any
      if (c?.h_state?.is_h && (getMode(c.id) === 0)) return true
    }
    return false
  })

  reg('PLACE_SOMEONE_NOT_IN_HIDDEN_AND_CONSCIOUS', (ctx2: any) => {
    // 注释：场景中有他人不在隐奸中且有意识
    for (const ch of entitySystem.getAll('character')) {
      const c = ch as any
      if (c.id === 'player' || c.id === '0') continue
      if (getMode(c.id) === 0 && !c?.sp_flag?.unconscious_h) return true
    }
    return false
  })

  // 注释：TODO Task 3 — 注册公共 API
  // ctx.api.register('h-hidden', { getMode, setMode, getDiscoveryDegree, ... })

  // 注释：TODO Task 5 — 注册事件监听
  // ctx.events.on('game:execution_end', ...)
  // eventBus.on('h:orgasm', ...)
  // eventBus.on('h:end', ...)

  // 注释：TODO Task 6 — UI 插槽注册
}
