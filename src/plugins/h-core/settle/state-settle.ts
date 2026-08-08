// 注释：单状态通用结算管线（erArk base_chara_state_common_settle，common_default.py:154-260）
// 2026-08-08 重构：从 h-core/index.ts 抽出独立模块——settle_state/talk_add_adjust（index.ts）与
// 绝顶附加状态（orgasm.ts settleOrgasmSideEffects）共用同一管线，禁止重复实现
//
// 能力系数：mark 状态（快乐/屈服/苦痛/恐怖/反感）用 get_mark_debuff_adjust（:374-378），
// 其余用 ability_lv_adjust 表
// 三件套：tenths_add（:233-240）/ 连续重复减值（:210-231，非负面非自己）/ 无意识心理门控（:196-208）
// 附带：素质修正（数据化）/ 催眠敏感（快感 + 欲情才 +2，erArk feel :304-305 + base :441）/
// 快感附加修正（眼罩/无觉/群交/怀孕灌肠/体位/喜欢体位/子宫奸）/ 攻略进度 / max(0) 钳制 /
// 苦痛快感化 / extra_feel；射精欲积累 → orgasm.ts 二段结算（ADD_SMALL_P_FEEL，2026-08-08 移出）
//
// ctx：结算上下文（settle_state 效果调用传 execCtx；绝顶附加等无 settlement 场景直接改 base）

import { modLoader } from '../../../core/mod-loader'
import { entitySystem } from '../../../core/entity-system'
import { gameContext } from '../../../core/game-context'
import { getEntityAttr, ATTR } from '../../../core/entity-utils'
import { getTalentStateAdjust } from './talent-adjust'
import { getFavoritePosition } from './position'
import { BAD_STATES, MENTAL_STATES } from './state'

// 部位状态ID → 属性名（attributes.toml 的 parameter 命名；erArk 22=兽部 未实现已移除）
export const ORGASM_PART_ATTR: Record<number, string> = {
  0: '皮肤', 1: '胸部', 2: '阴蒂', 3: '阴茎', 4: '阴道', 5: '后穴',
  6: '尿道', 7: '子宫', 21: '口喉', 23: '心理',
}

// 属性名 → 部位状态ID（反向映射，供 settle_state/tech_adjust 累积快感变化用）
export const ORGASM_ATTR_TO_PART: Record<string, number> = Object.fromEntries(
  Object.entries(ORGASM_PART_ATTR).map(([id, name]) => [name, Number(id)]),
)

/**
 * 累积本次指令的快感变化量到 h_state.pending_orgasm_feel
 * （对齐 erArk change_data.status_data[orgasm]：每次快感结算把变化量记入，二段结算时消耗）
 * 由 settle_state / tech_adjust 在写入部位快感后调用
 */
export function accumulateOrgasmFeel(char: any, partId: number, delta: number): void {
  if (!char?.h_state || !delta) return
  if (!char.h_state.pending_orgasm_feel) char.h_state.pending_orgasm_feel = {}
  char.h_state.pending_orgasm_feel[partId] = (char.h_state.pending_orgasm_feel[partId] ?? 0) + delta
}

// 部位属性名 → 感度能力名（tech_adjust 查目标感度等级用）
// erArk：feel_ability_id = state_id（0=皮肤感度…23=心理感度102）
export const PART_ABILITY: Record<string, string> = {
  '皮肤': '皮肤感度', '胸部': '胸部感度', '阴蒂': '阴蒂感度', '阴道': '阴道感度',
  '后穴': '后穴感度', '尿道': '尿道感度', '子宫': '子宫感度', '口喉': '口喉感度',
  '心理': '心理感度', '阴茎': '阴茎感度',
}

// 快感状态附加修正（erArk chara_feel_state_adjust，common_default.py:300-347）
// 眼罩 +0.2（body_item slot 6）/ 无意识时无觉刻印 +(adj-1)×2 / 群交 +0.02×其他人数(cap 10)
// V/W：怀孕 inflation +1 / 灌肠 enema_capacity×0.2
// 体位：V/A/U/W + pleasure_coefficient / 喜欢体位 +0.5 / 子宫奸（玩家 current_womb_sex_position==2）+2
export function getFeelExtraAdjust(ch: any, state: string, tbl: number[], isGroupSex: boolean): number {
  if (!ch) return 0
  let extra = 0
  if (ch?.body_items?.['6']) extra += 0.2
  if ((ch?.sp_flag?.unconscious_h ?? 0) >= 1) {
    const markLv = ch?.abilities?.['无觉刻印']?.level ?? 0
    extra += ((tbl[Math.min(markLv, 10)] ?? 4.0) - 1) * 2
  }
  if (isGroupSex && ch?.h_state?.is_h) {
    const others = Math.max(0, entitySystem.getAll('character').filter((c: any) => c.id !== ch.id && c.current_location === ch.current_location).length - 1)
    extra += Math.min(10, others) * 0.02
  }
  if (state === '阴道' || state === '子宫') {
    if (ch?.h_state?.inflation) extra += 1
    if (ch?.h_state?.enema) extra += (ch?.h_state?.enema_capacity ?? 0) * 0.2
  }
  // 体位修正（erArk chara_feel_state_adjust:314-325）——V/A/U/W 部位
  // 数据模型修正（上游缺陷）：erArk 门控读玩家体位（handle_dr_have_sex_position）、系数读被结算
  // 角色体位——但其体位字段"仅博士有的数据"（game_type.py:463-464），NPC 恒 -1 → 修正实际恒 0。
  // 引擎体位由指令 set_field 写在被结算角色 h_state（转换 TOML 行为），故门控+系数统一取被结算
  // 角色自身体位（= erArk 设计意图：性交体位中的部位快感加成）
  if ((state === '阴道' || state === '后穴' || state === '尿道' || state === '子宫')) {
    const pos = ch?.h_state?.current_sex_position
    if (typeof pos === 'number' && pos !== -1) {
      const hc = (modLoader.getMod()?.hConfig as any) ?? {}
      const posDef = (hc.sex_positions as Record<number, { pleasure_coefficient?: number }> | undefined)?.[pos]
      extra += posDef?.pleasure_coefficient ?? 0
      // 喜欢体位 +0.5（erArk :319-322 settle_favorite_sex_position）
      if (getFavoritePosition(ch, modLoader.getMod()) === pos) extra += 0.5
    }
    // 子宫奸 +2（erArk :323-325——读玩家 h_state.current_womb_sex_position == 2）
    const playerId = gameContext.getContext().player?.id ?? null
    const player = playerId ? entitySystem.get('character', playerId) as any : null
    if (state === '子宫' && player?.h_state?.current_womb_sex_position === 2) extra += 2
  }
  return extra
}

// 攻略等级（erArk get_character_fall_level，attr_calculation.py:891-921）
// 爱情/隶属系最高级 1-4（fall_1=思慕或屈从…fall_4=爱侣或奴隶）
const FALL_PAIRS: [string, string][] = [['思慕', '屈从'], ['恋慕', '驯服'], ['恋人', '宠物'], ['爱侣', '奴隶']]
export function getFallLevel(ch: any): number {
  if (!ch?.talents) return 0
  for (let i = FALL_PAIRS.length - 1; i >= 0; i--) {
    if (ch.talents[FALL_PAIRS[i][0]] || ch.talents[FALL_PAIRS[i][1]]) return i + 1
  }
  return 0
}

// 正面/负面 base 状态集合（erArk :455/:467）——攻略进度素质修正范围
const POSITIVE_BASE_STATES = new Set([ATTR.LUBE, ATTR.LEARN, ATTR.DEFERENCE, ATTR.FONDNESS, ATTR.AROUSAL, ATTR.PLEASURE, ATTR.ANTICIPATION, ATTR.OBEDIENCE, ATTR.SHAME])
const NEGATIVE_BASE_STATES = new Set([ATTR.PAIN, ATTR.FEAR, ATTR.DEPRESSION, ATTR.RESENTMENT])

// 刻印状态专用系数表（erArk chara_base_state_adjust:374-378 + attr_calculation.py:581-598）
// 快乐/屈服/苦痛/恐怖/反感 5 个状态的能力系数用 get_mark_debuff_adjust：0→1 / 1→1.5 / 2→3 / ≥3→5
// （不是 ability_lv_adjust 表！）
const MARK_DEBUFF_STATES = new Set([ATTR.PLEASURE, ATTR.OBEDIENCE, ATTR.PAIN, ATTR.FEAR, ATTR.RESENTMENT])
function getMarkDebuffAdjust(lv: number): number {
  if (lv >= 3) return 5
  if (lv === 2) return 3
  if (lv === 1) return 1.5
  return 1
}

// 额外快感（erArk extra_feel_settle:484-515）——恭顺/先导/羞耻/苦痛 对应能力≥5 时
// 心理快感 max(10, final/20)×内层系数 + 心理经验(155)
const EXTRA_FEEL_ABILITY: Record<string, string> = { '恭顺': ATTR.SUBMISSION, '先导': ATTR.SADISM, '羞耻': ATTR.EXPOSURE, '苦痛': ATTR.MASOCHISM }

// 内层心理快感结算（erArk 对 state 23 心理的完整 base_chara_state_common_settle 调用）
// 系数 = sqrt(ability表[心理感度] × ability表[给定能力]) + 催眠敏感 + feel 附加修正（chara_feel_state_adjust）
// 含无意识门控（:198）/ 连续减值 / max(0) 钳制（:353）；tenths_add=False
function settleInnerMind(
  ctx: { sourceId?: string | null; settlement?: any }, ch: any, id: string, innerBase: number,
  abilityKey: string, tbl: number[], isGroupSex: boolean, continuous: number,
): void {
  if (ch?.sp_flag?.unconscious_h === 3) return
  const abLv = ch?.abilities?.[abilityKey]?.level ?? 0
  const mindLv = ch?.abilities?.['心理感度']?.level ?? 0
  const innerAdjust = Math.sqrt((tbl[Math.min(mindLv, 10)] ?? 4.0) * (tbl[Math.min(abLv, 10)] ?? 4.0))
    + (ch?.hypnosis?.increase_body_sensitivity ? 2 : 0)
    + getFeelExtraAdjust(ch, '心理', tbl, isGroupSex)
  const innerContinuous = id !== ctx.sourceId ? continuous : 1
  const converted = Math.floor(Math.max(0, innerAdjust) * innerBase * innerContinuous)
  if (converted > 0) {
    applyStateChange(ctx, ch, id, ATTR.MIND, converted)
    const partId = ORGASM_ATTR_TO_PART[ATTR.MIND]
    if (partId !== undefined) accumulateOrgasmFeel(ch, partId, converted)
  }
}

// 状态变更写入：有 settlement → 走结算记录；否则直接改 base（clamp 0-99999，erArk status_data clamp）
export function applyStateChange(ctx: { settlement?: any }, ch: any, id: string, state: string, value: number): void {
  if (ctx.settlement) {
    ctx.settlement.applyChange(id, state, value)
    return
  }
  if (!ch?.base) return
  ch.base[state] = Math.min(99999, Math.max(0, (ch.base[state] ?? 0) + value))
}

// 单状态结算（settle_state / talk_add_adjust / 绝顶附加状态共用；erArk base_chara_state_common_settle）
// abilityLevel：显式等级覆盖（erArk ability_level 参数，可来自非结算对象——
// 如 501 传发起者.话术技能；null = 按 abilityKey 查目标自身）
// abilityKeyOverride：能力名覆盖（erArk ability id 对应，如 501 传 '话术技能'）
// tenthsAdd：tenths_add 开关（erArk 绝顶附加 middle 档为 True、small/large 为 False）
// extraAdjust：额外系数（erArk extra_adjust 参数——加法进 final_adjust，
// 如隐奸持续快感 4-mode+人数×0.1、露出 others×0.1）
// externalAbilityLevel：快感状态的外部能力等级（erArk ability_level 传外部等级时
// final_adjust = sqrt(目标部位感度 × 外部等级)，chara_feel_state_adjust:296-299；
// 仅 feel 状态生效，如 pain_to_h 心理快感 = sqrt(心理感度 × 发起者.技巧)）
export function settleOneState(
  ctx: { sourceId?: string | null; settlement?: any },
  ch: any, id: string, state: string, baseValue: number, timeCost: number,
  abilityLevel: number | null, abilityKeyOverride: string | null, isGroupSex: boolean, continuous: number,
  negate = false, tenthsAdd = true, extraAdjust = 0,
  externalAbilityLevel: number | null = null,
): void {
  if (!ch) return
  const hc = (modLoader.getMod()?.hConfig as any) ?? {}
  const tbl = hc.ability_lv_adjust ?? [1.0, 1.1, 1.25, 1.4, 1.6, 1.8, 2.1, 2.4, 2.8, 3.2, 4.0]
  const base = timeCost + baseValue
  // 确定使用哪个能力等级——优先显式 ability_level（erArk 参数），
  // 其次查 hConfig.state_ability 映射，快感状态 → 部位感度能力（PART_ABILITY），最后兜底 state 同名
  const stateAbility = (hc.state_ability as Record<string, string>) ?? {}
  const feelAbility = PART_ABILITY[state]
  const abilityKey = abilityKeyOverride ?? stateAbility[state] ?? feelAbility ?? state
  // 无意识/时停门控 per-id（erArk common_default.py:196-208）——心智状态与心理快感不结算
  // 睡眠/无意识系统未实装（L1.7），目前仅时停可判（sp_flag.unconscious_h===3）
  const isMental = MENTAL_STATES.has(state)
  const isBad = BAD_STATES.has(state)
  const isFeelState = ORGASM_ATTR_TO_PART[state] !== undefined
  // 死亡 → 不结算（erArk common_default.py:180-181）
  if (ch?.dead) return
  if (ch?.sp_flag?.unconscious_h === 3 && (isMental || state === '心理')) return
  // 能力等级——显式覆盖优先（501 传发起者.话术技能），否则按 abilityKey 查目标自身
  const al = abilityLevel !== null
    ? abilityLevel
    : (ch?.abilities?.[abilityKey]?.level ?? 0)
  // 快感状态 + 外部能力等级 → sqrt(目标部位感度 × 外部等级)（erArk chara_feel_state_adjust:294-299）
  const abilityCoeff = (isFeelState && externalAbilityLevel !== null)
    ? Math.sqrt((tbl[Math.min(al, 10)] ?? 4.0) * (tbl[Math.min(externalAbilityLevel, 10)] ?? 4.0))
    // 刻印状态（快乐/屈服/苦痛/恐怖/反感）用 mark_debuff 系数表（:374-378）
    : (MARK_DEBUFF_STATES as Set<string>).has(state)
      ? getMarkDebuffAdjust(al)
      : (tbl[Math.min(al, 10)] ?? 4.0)
  // 素质修正（数据化，erArk common_default.py:379-422）
  const talentAdj = getTalentStateAdjust(modLoader.getMod(), ch, state)
  // 催眠敏感——仅快感状态（chara_feel_state_adjust:304-305 全部位快感）
  // 与欲情（chara_base_state_adjust:441）才 +2；心智状态（好意/快乐等）不加
  const hypnosisAdj = (isFeelState || state === ATTR.AROUSAL) && ch?.hypnosis?.increase_body_sensitivity ? 2 : 0
  // 快感状态附加修正（眼罩/无觉刻印/群交 0.02/怀孕灌肠，chara_feel_state_adjust:300-347）；
  // base 状态群交 0.05（chara_base_state_adjust:444-450）
  let extraAdj = 0
  if (isFeelState) {
    extraAdj += getFeelExtraAdjust(ch, state, tbl, isGroupSex)
  } else if (isGroupSex && ch?.h_state?.is_h) {
    const others = Math.max(0, entitySystem.getAll('character').filter((c: any) => c.id !== ch.id && c.current_location === ch.current_location).length - 1)
    extraAdj += Math.min(10, others) * 0.05
  }
  // 攻略进度素质（erArk :455-477）——正面 +fall×0.05 / 负面 -fall×0.2（难度/信物 TODO）
  let fallAdj = 0
  if ((POSITIVE_BASE_STATES as Set<string>).has(state)) fallAdj = getFallLevel(ch) * 0.05
  else if ((NEGATIVE_BASE_STATES as Set<string>).has(state)) fallAdj = -(getFallLevel(ch) * 0.2)
  // 额外系数（erArk extra_adjust 参数：final_adjust = chara_base_state_adjust(...) + extra_adjust）
  // max(0) 钳制（erArk :353/:479——保证最终系数不为负）
  const coeff = Math.max(0, abilityCoeff + talentAdj + hypnosisAdj + extraAdj + fallAdj + extraAdjust)
  const raw = base * coeff
  // 连续重复指令减值（erArk common_default.py:210-231）——非负面状态、非自己
  const finalAdjust = (!isBad && id !== ctx.sourceId) ? continuous : 1
  const adjValue = raw * finalAdjust
  // tenths_add（erArk common_default.py:233-240）——追加 min(3×基础值, 当前状态值/10)
  // 当前值跨命名空间读取（与 applyChange/getEntityAttr 语义一致）
  const cur = getEntityAttr(ch, state)
  let finalValue = Math.floor(adjValue + (tenthsAdd && cur > 0 ? Math.min(3 * adjValue, cur / 10) : 0))
  // 心控-苦痛快感化（erArk common_default.py:242-245）——苦痛 → 心理快感
  // （内层 ability_level = ability[36] 受虐；tenths_add=False；转化后 return 不结算苦痛）
  if (state === ATTR.PAIN && ch?.hypnosis?.pain_as_pleasure) {
    settleInnerMind(ctx, ch, id, finalValue, ATTR.MASOCHISM, tbl, isGroupSex, continuous)
    return
  }
  const fv = negate ? -finalValue : finalValue
  if (fv !== 0) {
    applyStateChange(ctx, ch, id, state, fv)
    // 部位快感变化量 → 二段结算累积（extra 高潮用，对齐 erArk change_data.status_data）
    const partId = ORGASM_ATTR_TO_PART[state]
    if (partId !== undefined) accumulateOrgasmFeel(ch, partId, fv)
    // 注释：射精欲积累已移出本管线——对齐 erArk 二段结算 ADD_SMALL_P_FEEL
    // （Second_effect.py:657-679：每次 P 部位快感产生时 eja_point += 100 + int(eja_point×0.4)），
    // 由 orgasm.ts orgasmJudge 读 pending_orgasm_feel[3] 统一处理（orgasm.ts 顶部）
    // 额外快感（erArk extra_feel_settle:484-515）——恭顺/先导/羞耻/苦痛 对应能力≥5 时
    // 心理快感 max(10, final/20)×内层系数 + 心理经验(155)
    const extraAbility = EXTRA_FEEL_ABILITY[state]
    if (extraAbility && (ch?.abilities?.[extraAbility]?.level ?? 0) >= 5) {
      const innerBase = Math.max(10, Math.floor(finalValue / 20))
      settleInnerMind(ctx, ch, id, innerBase, extraAbility, tbl, isGroupSex, continuous)
      if (!ch.experience) ch.experience = {}
      ch.experience['155'] = (ch.experience['155'] ?? 0) + 1
    }
  }
}
