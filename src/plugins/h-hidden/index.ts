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
//
// 接线层（W1 拆分）：插件生命周期 onLoad/onEnable 编排。
// 效果注册在 effects.ts；前提注册在 premises.ts；公共 API 在 api.ts；
// 场景生命周期/发现度/成就/UI 标签在 scene.ts（含全部内部 helper 与数据表）。

import type { PluginContext } from '../../core/types'
import { registerHiddenSexEffects } from './effects'
import { registerHiddenSexPremises } from './premises'
import { registerHiddenSexApi } from './api'
import { registerHiddenSexSceneLogic, isCharacterHiddenFromNPC } from './scene'

export function onLoad(_ctx: PluginContext): void {
  registerHiddenSexEffects()
}

export async function onEnable(ctx: PluginContext): Promise<void> {
  registerHiddenSexPremises(ctx)
  registerHiddenSexApi(ctx)
  registerHiddenSexSceneLogic(ctx)
}

export { isCharacterHiddenFromNPC }
