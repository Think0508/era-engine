// 注释：h-npc-ai 插件——H 内 NPC AI（复刻 erArk handle_npc_ai_in_h.py + handle_npc_ai.py H 分支）
// 本次范围（2026-08-11 grill 定案）：
//   ① 每时间片 H 状态判定（锁死 h_wait / 不同地点结束 H / 木头人锁死）+ 完整疲劳/HP 退出
//   ⑤ 逆推 AI（部位喜好加权 → 指令过滤链 → 随机选行为赋给玩家执行）+ change_top_and_bottom/keep_enjoy/try_pl_active_h
//   ⑥⑦ 群交 AI（type 1 自慰 / 2 补位 / 3 抢占）
// 后置：②④③ 无意识组（睡奸恢复/醒来/继续H判定，依赖睡眠系统）、性爱助手（依赖监禁系统）、
//   催眠体控-逆推自动触发 H（归 h-hypnosis）——见 docs/master-todo.md

import type { PluginContext } from '../../core/types'
import { entitySystem } from '../../core/entity-system'
import { effectTypeRegistry } from '../../core/effect-type-registry'
import { getNpcActiveH, setNpcActiveH, enterHBlocksForAllInH, exitHBlock } from './state'
import { judgeCharacterHStateTick, groupSexModeOff } from './per-tick'
import { npcActiveH, tryPlActiveH } from './active-h'
import { onTemplateExecute } from './group-sex-ai'
import { validateTagVocabulary } from './filter'

// 注释：h:end 时把所有 h_* 行为块转 h_end（立即过期）——endHScene 会清空 is_h，
// 遍历 is_h 会漏；按行为块类型兜底（任何 H 退出路径都收敛到这里）
function onHEnd(): void {
  for (const char of entitySystem.getAll('character')) {
    const c = char as any
    const type = c?.ai_behavior?.type
    if (typeof type === 'string' && type.startsWith('h_') && type !== 'h_end') {
      exitHBlock(c)
    }
  }
}

// 注释：onLoad——效果类型注册
export function onLoad(_ctx: PluginContext): void {
  // 注释：npc_active_h_on——开启目标逆推（erArk 1403 TARGET_NPC_ACTIVE_H_ON）
  effectTypeRegistry.register('npc_active_h_on', (_p: any, execCtx: any) => {
    const ids = (execCtx._targetIds as string[]) ?? []
    for (const id of ids) {
      setNpcActiveH(entitySystem.get('character', id) as any, true)
    }
    return true
  })

  // 注释：npc_active_h_off——关闭目标逆推（erArk 1404）
  effectTypeRegistry.register('npc_active_h_off', (_p: any, execCtx: any) => {
    const ids = (execCtx._targetIds as string[]) ?? []
    for (const id of ids) {
      setNpcActiveH(entitySystem.get('character', id) as any, false)
    }
    return true
  })

  // 注释：npc_active_h_act——逆推执行器（keep_enjoy 效果链）
  // NPC 按部位喜好选行为赋给玩家执行（erArk keep_enjoy → npc_active_h）
  effectTypeRegistry.register('npc_active_h_act', async (_p: any, execCtx: any) => {
    const ids = (execCtx._targetIds as string[]) ?? []
    for (const id of ids) {
      await npcActiveH(id)
    }
    return true
  })

  // 注释：try_pl_active_h——尝试掌握主动权（grill Q8 定案：复用实行判定）
  // 成功 → 关逆推 + 叙事；失败 → 继续逆推 + 纯叙事（无惩罚）
  effectTypeRegistry.register('try_pl_active_h', async (params: any, execCtx: any) => {
    const ids = (execCtx._targetIds as string[]) ?? []
    for (const id of ids) {
      await tryPlActiveH(id, typeof params?.base === 'number' ? params.base : 100)
    }
    return true
  })
}

// 注释：onEnable——事件监听 + API + tag 词表校验
export async function onEnable(ctx: PluginContext): Promise<void> {
  // 注释：逆推前提 T_NPC_ACTIVE_H/T_NPC_NOT_ACTIVE_H/NPC_ACTIVE_H 已在 h-core
  // premise-instruct.ts 注册真语义（2026-08-11 从恒 false 占位升级）——本插件只消费

  // 注释：事件监听
  ctx.events.on('game:time_advanced', async (payload: any) => {
    await judgeCharacterHStateTick(payload?.minutes ?? 0)
  })
  ctx.events.on('h:start', () => {
    enterHBlocksForAllInH()
  })
  ctx.events.on('h:end', async () => {
    onHEnd()
    // 注释：任何 H 结束路径统一关群交模式（玩家 end_h 结束群交不经过疲劳分流；
    // 模式残留会让下次 H 的群交 AI 误触发——2026-08-11 审查修复）
    await groupSexModeOff()
  })
  ctx.events.on('group_sex:template_execute', async (payload: any) => {
    if (payload?.charId) await onTemplateExecute(payload.charId, payload.useTemplateB === true)
  })

  // 注释：公共 API（其他插件/GM 指令调用）
  ctx.api.register('h-npc-ai', {
    // 注释：查询 NPC 是否逆推状态
    isActiveH: (charId: string): boolean => getNpcActiveH(entitySystem.get('character', charId) as any),
    // 注释：手动开关逆推（脚本/GM；无 h_state 时自动创建，setNpcActiveH 内部处理）
    setActiveH: (charId: string, on: boolean): void => {
      setNpcActiveH(entitySystem.get('character', charId) as any, on)
    },
    // 注释：触发一次逆推执行器（NPC 选行为赋给玩家）
    triggerActiveH: (npcId: string): Promise<boolean> => npcActiveH(npcId),
    // 注释：尝试夺回主动权（复用实行判定，默认 base=150——100 时恒成功，见 active-h.ts）
    tryActiveH: (npcId: string, judgeBase?: number): Promise<boolean> =>
      tryPlActiveH(npcId, judgeBase ?? 150),
  })

  // 注释：tag 词表校验（未知 part:/flag: 值 → warning；指令数据驱动 AI，词表是契约）
  validateTagVocabulary()
}
