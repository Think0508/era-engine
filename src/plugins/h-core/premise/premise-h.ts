// 注释：H 状态前提——注册基础 H 状态前提 handler
// 前提列表对齐 erArk：NOT_H, TIRED_LE_84, HP_G_1, SCENE_ONLY_TWO 等

import { gameContext } from '../../../core/game-context'
import { entitySystem } from '../../../core/entity-system'
import { ATTR } from '../../../core/entity-utils'

function getTargetChar(ctx: any): any {
  const charId = ctx.selectedCharacterId ?? ctx.uiStore?.selectedCharacterId
  if (!charId) return null
  return entitySystem.get('character', charId) as any
}

// 注释：玩家（发起者）实体——erArk 无 T_ 前缀的前提查"自己"（character_data = cache[character_id]，
// 引擎当前指令只由玩家发起 → 自己 = 玩家）。NPC 发起指令时（未来 npc_active_h）需扩展 ctx.sourceId
function getPlayerChar(): any {
  const player = gameContext.getContext().player
  if (!player?.id) return null
  return entitySystem.get('character', player.id) as any
}

export function registerHPremises(registry: any): void {
  registry.registerPremise('HAVE_TARGET', (ctx: any) => {
    return (ctx.selectedCharacterId ?? ctx.uiStore?.selectedCharacterId) != null
  })

  // 注释：NOT_H——玩家或目标均不在 H（erArk handle_premise_other.py:1392）
  registry.registerPremise('NOT_H', (ctx: any) => {
    const player = getPlayerChar()
    const target = getTargetChar(ctx)
    if (player?.h_state?.is_h) return false
    if (target?.h_state?.is_h) return false
    return true
  })

  // ⚠️ 半成品（2026-08-13 审计）：T_NORMAL——目标正常状态（erArk handle_premise/__init__.py:439-455）
  // 目标状态检查未实现（睡眠/无意识/时停/监禁等由各系统前提分别处理），恒 true 占位；
  // 各状态系统实装后按 erArk 语义补全（目标非睡眠/无意识/时停/监禁 且 状态正常）
  registry.registerPremise('T_NORMAL', (_ctx: any) => {
    return true
  })

  // 注释：TIRED_LE_84——玩家疲劳≤84%（=≤134，erArk handle_premise_base_value.py:444 查自己）
  registry.registerPremise('TIRED_LE_84', (_ctx: any) => {
    const player = getPlayerChar()
    if (!player) return false
    const tired = player?.base?.[ATTR.FATIGUE] ?? 0
    return tired <= 134
  })

  // 注释：TIRED_LE_74——玩家疲劳≤74%（=≤118，erArk handle_premise_base_value.py:405）
  // 2026-08-08 新增：erArk 指令疲劳类型 tired_type=2（特定疲劳）自动注入 TIRED_LE_74 + HP_G_1 +
  // DRUNK_LEVEL_NOT_3（handle_instruct.py:147-149）——stroke/make_food/kiss 等指令迁移时需要
  registry.registerPremise('TIRED_LE_74', (_ctx: any) => {
    const player = getPlayerChar()
    if (!player) return false
    const tired = player?.base?.[ATTR.FATIGUE] ?? 0
    return tired <= 118
  })

  // 注释：NOT_SHOW_NON_H_IN_HIDDEN_SEX——隐奸中是否显示非 H 指令（erArk 全局开关
  // cache.show_non_h_in_hidden_sex 取反，handle_premise_other.py:1675-1687）
  // 2026-08-08 新增（erArk 指令 h_mode_show_type=1 自动注入）：
  // 我们引擎无该全局开关（隐奸 UI 设置未实装）→ 恒 true = erArk 默认值（show=False → NOT_SHOW=True）
  // TODO 隐奸设置面板实装后接全局开关
  registry.registerPremise('NOT_SHOW_NON_H_IN_HIDDEN_SEX', () => true)

  // 注释：DRUNK_LEVEL_NOT_3——醉酒等级≠3（erArk handle_premise_base_value.py:1197，
  // drunk_sex_common.get_drunk_level 判定）
  // 2026-08-08 新增（erArk 指令 tired_type 自动注入）：醉酒等级系统未实装 → 角色永不醉酒 3 级，
  // 恒 true 即语义正确的降级（TODO 醉酒系统实装后接酒气等级映射）
  registry.registerPremise('DRUNK_LEVEL_NOT_3', () => true)

  // 注释：HP_G_1——玩家体力>1（erArk handle_self_not_tired，handle_premise_base_value.py:35）
  registry.registerPremise('HP_G_1', (_ctx: any) => {
    const player = getPlayerChar()
    if (!player) return false
    const 体力 = player?.base?.[ATTR.HP] ?? 0
    return 体力 > 1
  })

  // 注释：NO_TARGET_OR_TARGET_CAN_COOPERATE_OR_IMPRISONMENT_1——无目标或目标可协同或被监禁
  // erArk handle_premise/__init__.py:834 + :811-831（handle_no_target_or_target_can_cooperate）
  // 目标可协同 = 目标 HP>1 且 疲劳≤84%（=≤134，tired/160）且 未睡眠 且 状态2/6/7 正常
  // 状态2（临盆/产后/监禁）→ 妊娠/监狱系统未实装，恒正常（TODO）
  // 状态6（睡眠/无意识/时停/空气）→ 睡眠/无意识未实装（L1.7）；时停用 sp_flag.unconscious_h===3 同步代理
  // 状态7（装袋/外勤/婴儿/外交/逃跑）→ 未实装，恒正常（TODO）
  // 被监禁 → 监狱系统未实装，恒 false（TODO）
  registry.registerPremise('NO_TARGET_OR_TARGET_CAN_COOPERATE_OR_IMPRISONMENT_1', (ctx: any) => {
    const target = getTargetChar(ctx)
    if (!target) return true
    if ((target?.base?.[ATTR.HP] ?? 0) <= 1) return false
    if ((target?.base?.[ATTR.FATIGUE] ?? 0) > 134) return false
    if (target?.sp_flag?.unconscious_h === 3) return false
    return true
  })

  // 注释：IS_H——玩家或目标任一在 H（erArk handle_premise_other.py:1376）
  registry.registerPremise('IS_H', (ctx: any) => {
    const player = getPlayerChar()
    const target = getTargetChar(ctx)
    return player?.h_state?.is_h === true || target?.h_state?.is_h === true
  })

  // 注释：TARGET_IS_H——目标（selected）在 H 中（erArk TARGET_IS_H；
  // H 指令基础前提——绝大多数 H 内指令前置，h-npc-ai 过滤链依赖）
  registry.registerPremise('TARGET_IS_H', (ctx: any) => {
    const target = getTargetChar(ctx)
    return target?.h_state?.is_h === true
  })

  // 注释：TARGET_NOT_IS_H——目标不在 H 中
  registry.registerPremise('TARGET_NOT_IS_H', (ctx: any) => {
    const target = getTargetChar(ctx)
    return target?.h_state?.is_h !== true
  })

  registry.registerPremise('SCENE_ONLY_TWO', (_ctx: any) => {
    const loc = gameContext.getContext().location
    if (!loc) return false
    let count = 0
    for (const char of entitySystem.getAll('character')) {
      if ((char as any).current_location === loc.id) count++
    }
    return count <= 2
  })

  // 注释：TECHNIQUE_GE_3——自己技巧≥3（erArk handle_premise_ability.py:1017 查自己）
  registry.registerPremise('TECHNIQUE_GE_3', (_ctx: any) => {
    const player = getPlayerChar()
    if (!player) return false
    return (player?.abilities?.[ATTR.TECHNIQUE]?.level ?? 0) >= 3
  })

  // ═══ 权重前提 — high_1 ~ high_10、high_999 ═══
  // erArk：high_N 是"空白权重前提"（handle_premise/__init__.py:546-603）——handler 恒通过，
  // 权重值 = N（口上/地文权重区间随机用，getWeight 按 high_ 前缀取 N）。
  // 原实现误用为"参数等级≥N"（erArk high_* 无此语义），已修复。
  for (let i = 1; i <= 10; i++) {
    registry.registerPremise(`high_${i}`, () => true)
  }

  registry.registerPremise('high_999', () => true)

  // ═══ 系统状态前提 ═══
  registry.registerPremise('sys_0', () => true)  // 普通状态
  registry.registerPremise('sys_1', () => false) // 占位：待实现
  registry.registerPremise('sys_2', () => false)
  registry.registerPremise('sys_3', () => false)
  registry.registerPremise('sys_4', () => false)
  registry.registerPremise('sys_5', () => false)
}
