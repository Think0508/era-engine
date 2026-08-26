// 注释：H 状态前提——注册基础 H 状态前提 handler
// 前提列表对齐 erArk：NOT_H, TIRED_LE_84, HP_G_1, SCENE_ONLY_TWO 等

import { gameContext } from '../../../core/game-context'
import { entitySystem } from '../../../core/entity-system'
import { ATTR } from '../../../core/entity-utils'
import { getFavorabilityLevel } from '../settle/favorability'

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
// 注释：自己（发起者）——优先 ctx.sourceId（未来 NPC 发起），缺省玩家
function getSelfChar(ctx: any): any {
  const charId = ctx.sourceId ?? ctx.player?.id ?? gameContext.getContext().player?.id
  if (!charId) return null
  return entitySystem.get('character', charId) as any
}

export function registerHPremises(registry: any): void {
  registry.registerPremise('HAVE_TARGET', (ctx: any) => {
    return (ctx.selectedCharacterId ?? ctx.uiStore?.selectedCharacterId) != null
  })
// 注释：NO_TARGET——无选中目标（单人行动/无目标指令口上用；口上 TOML 可读写法）
  registry.registerPremise('NO_TARGET', (ctx: any) => {
    return (ctx.selectedCharacterId ?? ctx.uiStore?.selectedCharacterId) == null
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
// 注释：T_NORMAL_56_OR_UNCONSCIOUS_FLAG——交互对象56正常或无意识（erArk handle_premise/__init__.py:1456-1474）
  // 语义：目标 unnormal 位 5/6（0x10=意识模糊/弱交互，0x20=完全意识不清醒/无交互）均未置位 = 正常，
  // 或目标 sp_flag.unconscious_h != 0（睡奸/时停/无意识H）→ 通过（OR 关系）。
  // 玩家作为目标时直接视为正常（erArk character_id==0 分支）。
  // 实现：位运算直接读 sp_flag.unnormal_flag（sleep-system/h-time-stop 共同维护），
  // 与 T_NORMAL_6 语义不同：本前提允许"目标无意识"作为可交互条件，T_NORMAL_6 则要求非深度无意识。
  registry.registerPremise('T_NORMAL_56_OR_UNCONSCIOUS_FLAG', (ctx: any) => {
    const target = getTargetChar(ctx)
    if (!target) return false
    const playerId = gameContext.getContext().player?.id
    if (target.id === playerId) return true
    if ((target?.sp_flag?.unconscious_h ?? 0) !== 0) return true
    const unnormal = target?.sp_flag?.unnormal_flag ?? 0
    return (unnormal & 0x30) === 0
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

  // 注释：favorability_ge_3——指令双方中 NPC 对玩家的好感等级 ≥3
  // （erArk handle_premise_other.py handle_favorability_ge_3：发起者是玩家 → 查目标 NPC 对
  // 玩家好感；目标是玩家 → 查发起者 NPC 对玩家好感；好感等级 ≥3（阈值 1000）通过。
  // 由 chat_failed 高好感词条（1021-1028）使用——高好感时聊崩的委婉口上）
  registry.registerPremise('favorability_ge_3', (ctx: any) => {
    const playerId = gameContext.getContext().player?.id
    const sourceId = ctx.sourceId ?? playerId
    const targetId = ctx.selectedCharacterId ?? ctx.uiStore?.selectedCharacterId
    const npcId = sourceId === playerId ? targetId : (targetId === playerId ? sourceId : targetId)
    if (!npcId) return false
    const npc = entitySystem.get('character', npcId) as any
    if (!npc) return false
    const fav = npc.base?.[ATTR.FAVORABILITY] ?? 0
    return getFavorabilityLevel(fav).level >= 3
  })

  // ═══ 系统状态前提 ═══
  registry.registerPremise('sys_0', () => true)  // 普通状态
  // 注释：sys_1（erArk NO_PLAYER）——发起者非玩家（NPC 主动口上）
  // talk-common 上下文 sourceId = 口上发起者/actor；玩家指令路径 sourceId='player'，NPC 主动路径为 NPC id。
  registry.registerPremise('sys_1', (ctx: any) => {
    const playerId = gameContext.getContext().player?.id
    if (!playerId) return false
    const sourceId = ctx.sourceId ?? null
    return sourceId != null && sourceId !== playerId
  })
  registry.registerPremise('sys_2', () => false)
  registry.registerPremise('sys_3', () => false)
  // 注释：sys_4（erArk TARGET_IS_PLAYER）——交互对象/目标是玩家（NPC 对玩家口上）
  registry.registerPremise('sys_4', (ctx: any) => {
    const playerId = gameContext.getContext().player?.id
    if (!playerId) return false
    const targetId = ctx.selectedCharacterId ?? ctx.uiStore?.selectedCharacterId
    return targetId === playerId
  })
// ═══ 口上可读别名（口上 TOML 优先用这些可读名，erArk 原名保留兼容）═══
  // NPC_INITIATED = erArk sys_1（发起者非玩家）
  registry.registerPremise('NPC_INITIATED', (ctx: any) => {
    const playerId = gameContext.getContext().player?.id
    if (!playerId) return false
    const sourceId = ctx.sourceId ?? null
    return sourceId != null && sourceId !== playerId
  })
  // TARGET_IS_PLAYER = erArk sys_4（目标是玩家）
  registry.registerPremise('TARGET_IS_PLAYER', (ctx: any) => {
    const playerId = gameContext.getContext().player?.id
    if (!playerId) return false
    const targetId = ctx.selectedCharacterId ?? ctx.uiStore?.selectedCharacterId
    return targetId === playerId
  })
  registry.registerPremise('sys_5', () => false)
// ═══ 听牢骚前提（erArk handle_premise_other.py:674-723）═══
  // TARGET_ABD_OR_ANGRY_MOOD——目标心情不好或愤怒：angry_point > 30
  registry.registerPremise('TARGET_ABD_OR_ANGRY_MOOD', (ctx: any) => {
    const target = getTargetChar(ctx)
    return target ? Number(target?.base?.[ATTR.ANGER] ?? 0) > 30 : false
  })
  // TARGET_NOT_ANGRY_WITH_PLAYER——目标没有被玩家惹火：sp_flag.angry_with_player == false
  registry.registerPremise('TARGET_NOT_ANGRY_WITH_PLAYER', (ctx: any) => {
    const target = getTargetChar(ctx)
    return target ? !target.sp_flag?.angry_with_player : false
  })
// ═══ 愤怒/心情前提全量（erArk handle_premise_other.py:517-583 / handle_premise_sp_flag.py）═══
  const angryOf = (char: any): number => Number(char?.base?.[ATTR.ANGER] ?? 0)
  const moodGood = (v: number) => v <= 5
  const moodNormal = (v: number) => v > 5 && v <= 30
  const moodBad = (v: number) => v > 30 && v <= 50
  const moodAngry = (v: number) => v > 50
  // 自己心情档
  registry.registerPremise('GOOD_MOOD', (ctx: any) => moodGood(angryOf(getSelfChar(ctx))))
  registry.registerPremise('NORMAL_MOOD', (ctx: any) => moodNormal(angryOf(getSelfChar(ctx))))
  registry.registerPremise('BAD_MOOD', (ctx: any) => moodBad(angryOf(getSelfChar(ctx))))
  registry.registerPremise('ANGRY_MOOD', (ctx: any) => moodAngry(angryOf(getSelfChar(ctx))))
  // 目标心情档
  registry.registerPremise('TARGET_GOOD_MOOD', (ctx: any) => moodGood(angryOf(getTargetChar(ctx))))
  registry.registerPremise('TARGET_NORMAL_MOOD', (ctx: any) => moodNormal(angryOf(getTargetChar(ctx))))
  registry.registerPremise('TARGET_BAD_MOOD', (ctx: any) => moodBad(angryOf(getTargetChar(ctx))))
  registry.registerPremise('TARGET_ANGRY_MOOD', (ctx: any) => moodAngry(angryOf(getTargetChar(ctx))))
  // 自己/目标 是否被玩家惹火
  registry.registerPremise('SELF_ANGRY_WITH_PLAYER', (ctx: any) => !!getSelfChar(ctx)?.sp_flag?.angry_with_player)
  registry.registerPremise('SELF_NOT_ANGRY_WITH_PLAYER', (ctx: any) => !getSelfChar(ctx)?.sp_flag?.angry_with_player)
  registry.registerPremise('TARGET_ANGRY_WITH_PLAYER', (ctx: any) => !!getTargetChar(ctx)?.sp_flag?.angry_with_player)
// TARGET_HP_OR_MP_LOW——目标体力或气力有一项低于 30%（erArk handle_premise_base_value.py:331-348）
  registry.registerPremise('TARGET_HP_OR_MP_LOW', (ctx: any) => {
    const target = getTargetChar(ctx)
    if (!target) return false
    const hpMax = Number(target.base?.[ATTR.HP_MAX] ?? 0)
    const mpMax = Number(target.base?.[ATTR.MP_MAX] ?? 0)
    const hp = Number(target.base?.[ATTR.HP] ?? 0)
    const mp = Number(target.base?.[ATTR.MP] ?? 0)
    return (hpMax > 0 && hp / hpMax < 0.3) || (mpMax > 0 && mp / mpMax < 0.3)
  })
}
