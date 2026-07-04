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

export function onLoad(_ctx: PluginContext): void {
  // 注释：TODO Task 3 — 注册效果类型
  // effectTypeRegistry.register('hidden_sex_set_mode', ...)
  // effectTypeRegistry.register('hidden_sex_clear', ...)
  // effectTypeRegistry.register('hidden_sex_discovery_tick', ...)
  // effectTypeRegistry.register('hidden_sex_orgasm_exposure', ...)
}

export async function onEnable(ctx: PluginContext): Promise<void> {
  // 注释：TODO Task 2 — 注册前提
  // const reg = (id, fn) => { try { ctx.api.call('h-core', 'registerPremise', id, fn) } catch {} }

  // 注释：TODO Task 3 — 注册公共 API
  // ctx.api.register('h-hidden', { getMode, setMode, getDiscoveryDegree, ... })

  // 注释：TODO Task 5 — 注册事件监听
  // ctx.events.on('game:execution_end', ...)
  // eventBus.on('h:orgasm', ...)
  // eventBus.on('h:end', ...)

  // 注释：TODO Task 6 — UI 插槽注册
}
