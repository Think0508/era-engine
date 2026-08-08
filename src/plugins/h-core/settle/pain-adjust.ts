// 注释：pain 系列结算（erArk 独立 settle 函数，default.py:8255-8680）
// 独立 effect 类型（2026-08-08 grilling 决策：对齐 erArk 独立 settle 函数，与 tech_adjust 平级）：
//   pain_by_lubrication (121 TARGET_LUBRICATION_ADJUST_ADD_PAIN)  润滑 → 苦痛
//   pain_by_part        (122-125 TARGET_V/A/U/W_ADJUST_ADD_PAIN)  润滑+腰技+扩张+阴茎大小 → 苦痛
//   feel_by_sex         (131-134 TARGET_V/A/U/W_ADJUST_ADD_BY_SEX) 阴茎大小+腰技 → 部位快感+欲情
//   pain_to_h           (135 TARGET_PAIN_TO_H_ADJUST)              技巧+受虐 → 心理快感+欲情+苦痛
// 全走 settleOneState 通用管线（三件套/素质/门控/钳制自动生效）
//
// get_pain_adjust：移植 erArk attr_calculation.py:635-678（按润滑/扩张等级映射苦痛系数）

import { entitySystem } from '../../../core/entity-system'
import { modLoader } from '../../../core/mod-loader'
import { apiSystem } from '../../../core/api'
import { errorReporter } from '../../../core/error-reporter'
import { getContinuousAdjust } from '../../../core/command-executor'
import { getEntityAttr, ATTR } from '../../../core/entity-utils'
import { settleOneState, PART_ABILITY } from './state-settle'
import { getStatusLevel } from './orgasm'

/** 苦痛系数表（erArk attr_calculation.py:648-678 get_pain_adjust） */
const PAIN_ADJUST_TABLE: Record<number, number> = {
  [-4]: 50, [-3]: 20, [-2]: 10, [-1]: 5, [0]: 3, [1]: 2.5, [2]: 2.1,
  [3]: 1.8, [4]: 1.5, [5]: 1.2, [6]: 1.0, [7]: 0.8, [8]: 0.6, [9]: 0.4,
}

/**
 * 按值（润滑等）或直接等级映射苦痛系数（erArk get_pain_adjust）
 * @param value 输入值
 * @param levelFlag true = 输入值直接是等级（不再算 get_status_level）
 */
export function getPainAdjust(value: number, levelFlag = false): number {
  const level = levelFlag ? value : getStatusLevel(value)
  if (level <= -4) return 50
  if (level >= 10) return 0.2
  return PAIN_ADJUST_TABLE[level] ?? 1.0
}

/** 群交修正查询（可选能力——仅"插件未注册"被忽略，真实错误照报；tech_adjust/talk_add_adjust 共用） */
export async function getGroupSexActive(): Promise<boolean> {
  try {
    return !!(await apiSystem.call('h-group-sex', 'isActive'))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!msg.includes('h-group-sex') && !msg.includes('未注册')) {
      errorReporter.report({
        source: 'h-core',
        severity: 'error',
        message: `查群交状态失败：${msg}`,
      })
    }
    return false
  }
}

function getAdj(tbl: number[], lv: number): number {
  return tbl[Math.min(Math.max(0, lv), 10)] ?? 4.0
}

function getAbilityLv(ch: any, name: string): number {
  return ch?.abilities?.[name]?.level ?? 0
}

/** 退缩门控（与 settle_favorability/state 一致：judge_check 判定退缩 → 整链跳过） */
function retreated(execCtx: any): boolean {
  return !!(execCtx as any)?._judgeResult?.retreated
}

interface PainPartCfg {
  dilateAbility: string   // 扩张能力名（erArk ability[9-12]：V/A/U/W 扩张）
  baseValue: number       // 苦痛基础值（erArk U=1000/W=100，V/A=默认30）
  levelOffset: number     // 扩张-阴茎大小等级偏移（erArk：V/A +1 / U -3 / W -1）
}

const PAIN_PARTS: Record<string, PainPartCfg> = {
  '阴道': { dilateAbility: '阴道扩张', baseValue: 30, levelOffset: 1 },
  '后穴': { dilateAbility: '后穴扩张', baseValue: 30, levelOffset: 1 },
  '尿道': { dilateAbility: '尿道扩张', baseValue: 1000, levelOffset: -3 },
  '子宫': { dilateAbility: '子宫扩张', baseValue: 100, levelOffset: -1 },
}

// 注释：121 TARGET_LUBRICATION_ADJUST_ADD_PAIN（default.py:8255-8284）
// 苦痛 += base_chara_state_common_settle(target, tc, 17, ability_level=目标.苦痛刻印,
//   extra_adjust = get_pain_adjust(目标.润滑))——base_value 默认 30
export async function runPainByLubrication(execCtx: any): Promise<boolean> {
  if (retreated(execCtx)) return true
  const ids = execCtx._targetIds as string[]
  const tc = execCtx._timeCost ?? 10
  const continuous = getContinuousAdjust()
  const isGroupSex = await getGroupSexActive()
  for (const id of ids) {
    const target = entitySystem.get('character', id) as any
    if (!target) continue
    const painAdjust = getPainAdjust(getEntityAttr(target, ATTR.LUBE), false)
    const painLv = getAbilityLv(target, '苦痛刻印')
    settleOneState(execCtx, target, id, ATTR.PAIN, 30, tc, painLv, '苦痛刻印', isGroupSex, continuous, false, true, painAdjust)
  }
  return true
}

// 注释：122-125 TARGET_V/A/U/W_ADJUST_ADD_PAIN（default.py:8287-8468）
// final_adjust = max(get_pain_adjust(润滑) - (adj(发起者.腰技)-1), 0) × get_pain_adjust(扩张-阴茎大小+偏移, level)
// W 子宫奸（发起者 current_womb_sex_position==2）→ size_adjust ×3；U base=1000 / W base=100
export async function runPainByPart(execCtx: any, part: string): Promise<boolean> {
  if (retreated(execCtx)) return true
  const cfg = PAIN_PARTS[part]
  if (!cfg) {
    errorReporter.report({
      source: 'h-core',
      severity: 'warning',
      message: `pain_by_part：未知部位 '${part}'（支持：${Object.keys(PAIN_PARTS).join('/')}），效果被跳过`,
    })
    return true
  }
  const ids = execCtx._targetIds as string[]
  const tc = execCtx._timeCost ?? 10
  const continuous = getContinuousAdjust()
  const isGroupSex = await getGroupSexActive()
  const hc = (modLoader.getMod()?.hConfig as any) ?? {}
  const tbl = hc.ability_lv_adjust ?? [1.0, 1.1, 1.25, 1.4, 1.6, 1.8, 2.1, 2.4, 2.8, 3.2, 4.0]
  const initiator = execCtx.sourceId ? entitySystem.get('character', execCtx.sourceId) as any : null
  // 发起者阴茎大小（erArk pl_ability.jj_size，默认 1）
  const jjSize = getEntityAttr(initiator, '阴茎大小') || 1
  const waistLv = getAbilityLv(initiator, '腰技')
  const waistAdjust = getAdj(tbl, waistLv) - 1
  const wombSex = initiator?.h_state?.current_womb_sex_position === 2
  for (const id of ids) {
    const target = entitySystem.get('character', id) as any
    if (!target) continue
    const painAdjust = getPainAdjust(getEntityAttr(target, ATTR.LUBE), false)
    const dilateLv = getAbilityLv(target, cfg.dilateAbility)
    const finalLevel = dilateLv - jjSize + cfg.levelOffset
    let sizeAdjust = getPainAdjust(finalLevel, true)
    // 子宫奸 → 尺寸调整 ×3（default.py:8462-8463）
    if (part === '子宫' && wombSex) sizeAdjust *= 3
    const finalAdjust = Math.max(painAdjust - waistAdjust, 0) * sizeAdjust
    const painLv = getAbilityLv(target, '苦痛刻印')
    settleOneState(execCtx, target, id, ATTR.PAIN, cfg.baseValue, tc, painLv, '苦痛刻印', isGroupSex, continuous, false, true, finalAdjust)
  }
  return true
}

// 注释：131-134 TARGET_V/A/U/W_ADJUST_ADD_BY_SEX（default.py:8471-8636）
// extra_adjust = adj(发起者.阴茎大小)/2 + adj(发起者.腰技)/2
// 快感：sqrt(目标部位感度 × 发起者.技巧) + extra（base=50）
// 欲情：目标部位感度系数 + extra（A/后穴 只用 size_adjust——erArk :8552 源码原样）
export async function runFeelBySex(execCtx: any, part: string): Promise<boolean> {
  if (retreated(execCtx)) return true
  if (!PAIN_PARTS[part]) {
    errorReporter.report({
      source: 'h-core',
      severity: 'warning',
      message: `feel_by_sex：未知部位 '${part}'（支持：${Object.keys(PAIN_PARTS).join('/')}），效果被跳过`,
    })
    return true
  }
  const ids = execCtx._targetIds as string[]
  const tc = execCtx._timeCost ?? 10
  const continuous = getContinuousAdjust()
  const isGroupSex = await getGroupSexActive()
  const hc = (modLoader.getMod()?.hConfig as any) ?? {}
  const tbl = hc.ability_lv_adjust ?? [1.0, 1.1, 1.25, 1.4, 1.6, 1.8, 2.1, 2.4, 2.8, 3.2, 4.0]
  const initiator = execCtx.sourceId ? entitySystem.get('character', execCtx.sourceId) as any : null
  const jjSize = getEntityAttr(initiator, '阴茎大小') || 1
  const sizeAdjust = getAdj(tbl, jjSize) / 2
  const waistAdjust = getAdj(tbl, getAbilityLv(initiator, '腰技')) / 2
  const extraAdjust = sizeAdjust + waistAdjust
  const techLv = getAbilityLv(initiator, '技巧')
  for (const id of ids) {
    const target = entitySystem.get('character', id) as any
    if (!target) continue
    // 快感（sqrt(目标感度 × 发起者技巧)，base=50）
    settleOneState(execCtx, target, id, part, 50, tc, null, null, isGroupSex, continuous, false, true, extraAdjust, techLv)
    // 欲情（目标部位感度系数；A/后穴 extra 只用 size_adjust——erArk :8552）
    const sensLv = getAbilityLv(target, PART_ABILITY[part] ?? part)
    const lustExtra = part === '后穴' ? sizeAdjust : extraAdjust
    settleOneState(execCtx, target, id, ATTR.AROUSAL, 50, tc, sensLv, null, isGroupSex, continuous, false, true, lustExtra)
  }
  return true
}

// 注释：135 TARGET_PAIN_TO_H_ADJUST（default.py:8639-8680）
// extra = adj(发起者.技巧) + adj(目标.受虐)
// 心理快感：sqrt(目标心理感度 × 发起者.技巧) + extra=adj(目标.受虐)（base=50，:8676）
// 欲情：目标.欲望 系数 + extra（base=50，:8678）
// 苦痛：目标.苦痛刻印 系数 + extra（base=50，:8680）
export async function runPainToH(execCtx: any): Promise<boolean> {
  if (retreated(execCtx)) return true
  const ids = execCtx._targetIds as string[]
  const tc = execCtx._timeCost ?? 10
  const continuous = getContinuousAdjust()
  const isGroupSex = await getGroupSexActive()
  const hc = (modLoader.getMod()?.hConfig as any) ?? {}
  const tbl = hc.ability_lv_adjust ?? [1.0, 1.1, 1.25, 1.4, 1.6, 1.8, 2.1, 2.4, 2.8, 3.2, 4.0]
  const initiator = execCtx.sourceId ? entitySystem.get('character', execCtx.sourceId) as any : null
  const techLv = getAbilityLv(initiator, '技巧')
  const techAdjust = getAdj(tbl, techLv)
  for (const id of ids) {
    const target = entitySystem.get('character', id) as any
    if (!target) continue
    const masochismAdjust = getAdj(tbl, getAbilityLv(target, '受虐'))
    const extraAdjust = techAdjust + masochismAdjust
    // 心理快感（extra = 受虐系数）
    settleOneState(execCtx, target, id, '心理', 50, tc, null, null, isGroupSex, continuous, false, true, masochismAdjust, techLv)
    // 欲情（能力 = 目标.欲望 33）
    settleOneState(execCtx, target, id, ATTR.AROUSAL, 50, tc, getAbilityLv(target, '欲望'), null, isGroupSex, continuous, false, true, extraAdjust)
    // 苦痛（能力 = 目标.苦痛刻印 15）
    settleOneState(execCtx, target, id, ATTR.PAIN, 50, tc, getAbilityLv(target, '苦痛刻印'), null, isGroupSex, continuous, false, true, extraAdjust)
  }
  return true
}
