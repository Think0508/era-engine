// 注释：跟随系统前提——注册 follow 相关前提 handler
// 语义来源：erArk handle_premise_sp_flag.py + handle_premise/__init__.py
// 维度核对：无 T_ 前缀查"自己"（发起者），T_ 前缀查目标

import { gameContext } from '../../../core/game-context'
import { entitySystem } from '../../../core/entity-system'
import { getEntityAttr, ATTR } from '../../../core/entity-utils'
import { bindingResolver } from '../../../core/binding-resolver'

// 注释：目标角色（UI 选中）
function getTargetChar(ctx: any): any {
  const charId = ctx.selectedCharacterId ?? ctx.uiStore?.selectedCharacterId
  if (!charId) return null
  return entitySystem.get('character', charId) as any
}

// 注释：自己（发起者）——erArk 无 T_ 前缀查 character_data[character_id]；
// 引擎当前指令只由玩家发起 → 自己 = sourceId ?? 玩家
function getSelfChar(ctx: any): any {
  const charId = ctx.sourceId ?? gameContext.getContext().player?.id
  if (!charId) return null
  return entitySystem.get('character', charId) as any
}

function getFollowMode(char: any): number {
  return (char?.sp_flag?.is_follow ?? 0) as number
}

export function registerFollowPremises(registry: any): void {
  // 注释：TARGET_IS_FOLLOW——目标正跟随玩家（erArk handle_premise_sp_flag.py:697）
  registry.registerPremise('TARGET_IS_FOLLOW', (ctx: any) => {
    const target = getTargetChar(ctx)
    return target ? getFollowMode(target) !== 0 : false
  })

  // 注释：TARGET_NOT_FOLLOW——目标没跟随玩家（erArk handle_premise_sp_flag.py:721）
  registry.registerPremise('TARGET_NOT_FOLLOW', (ctx: any) => {
    const target = getTargetChar(ctx)
    return target ? getFollowMode(target) === 0 : false
  })

  // 注释：IS_FOLLOW——自己正跟随（erArk handle_premise_sp_flag.py:612，非 0 即跟随）
  registry.registerPremise('IS_FOLLOW', (ctx: any) => {
    const char = getSelfChar(ctx)
    return char ? getFollowMode(char) !== 0 : false
  })

  // 注释：NOT_FOLLOW——自己没跟随（erArk handle_premise_sp_flag.py:635）
  registry.registerPremise('NOT_FOLLOW', (ctx: any) => {
    const char = getSelfChar(ctx)
    return char ? getFollowMode(char) === 0 : false
  })

  // 注释：IS_FOLLOW_4——自己处"前往博士当前位置"态（erArk handle_premise_sp_flag.py:682）
  // 2026-08-10：模式4 = 召唤，AI 未实现（TODO）——前提先注册作提醒位
  registry.registerPremise('IS_FOLLOW_4', (ctx: any) => {
    const char = getSelfChar(ctx)
    return char ? getFollowMode(char) === 4 : false
  })

  // 注释：NO_TARGET_OR_TARGET_CAN_COOPERATE——无目标或目标可协同
  // erArk handle_premise/__init__.py:811（follow 用的短版本，无监禁分支）
  // 目标可协同 = 目标 HP>1 且 疲劳≤84%（=≤134，tired/160）且 未睡眠 且 状态2/6/7 正常
  // 状态2（临盆/产后/监禁）→ 妊娠/监狱系统未实装，恒正常（TODO）
  // 状态6（睡眠/无意识/时停/空气）→ 睡眠/无意识未实装；时停用 sp_flag.unconscious_h===3 同步代理
  // 状态7（装袋/外勤/婴儿/外交/逃跑）→ 未实装；我们引擎的离线概念（sp_flag.offline）即状态7代理
  // hp 门：优先读 follow-system 自己的绑定（mod 把 hp 绑到气血等时用实际属性），
  // 未绑定回退 erArk 的 体力（h-core 默认层提供，default=100）
  registry.registerPremise('NO_TARGET_OR_TARGET_CAN_COOPERATE', (ctx: any) => {
    const target = getTargetChar(ctx)
    if (!target) return true
    const hp = bindingResolver.getForPlugin('follow-system', target.id, 'hp') ?? getEntityAttr(target, ATTR.HP)
    if (hp !== null && hp !== undefined && Number(hp) <= 1) return false
    if ((getEntityAttr(target, ATTR.FATIGUE) ?? 0) > 134) return false
    if (target?.sp_flag?.unconscious_h === 3) return false
    if (target?.sp_flag?.offline) return false
    return true
  })
}
