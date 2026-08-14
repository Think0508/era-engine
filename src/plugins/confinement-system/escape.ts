// 注释：逃脱结算 + 追捕委托（阶段A/B）——每日 game:new_day 触发（erArk settle_prisoners）
// 公式原样复刻（erArk calculate_escape_probability :37 / judge_can_escape :84 / escape_success :138）：
//   累积：add = (战斗+学识) × 系数 / 设施效率
//     系数 = (生活条件+1)×0.5 − 屈服×0.1 + 反发×0.2 − 陷落×0.2
//   单次上限 = (100−当前)×0.1，下限 1
//   无监狱长：概率 > 30 → 逃脱
//   有监狱长：阈值 50+设施效果，且 囚犯对抗值 > 监狱长对抗值
//     对抗值 = (概率/100)×(条件+1)×0.4×战斗×hp%×mp%
// 追捕委托（阶段B，erArk field_commission_function.create_capture_fugitive_commission :527）：
//   逃脱成功 → 藏匿点（随机非监狱地点）→ 动态 scene（objective→combat→reward 重囚）
//   → 3 游戏日未抓回 → 脱逃成功
//
// ⚠️ 设计注记（grill Q5/Q10 定案，ADR：confinement-0003）：
//   - 战斗/学识技能：当前用 erArk 迁移的能力（tag 聚合，optional_ability_tags），
//     TODO(confinement-system)：自研 mod 时按我们的公式与技能改（可能换 tag/换权重）
//   - 设施效率：A 阶段恒 1，公式留 facilityEfficiency 变量；provider 留 facilityLevels 字段
//   - hp/mp 走绑定系统（required_attributes，ADR：confinement-0002）
//   - 追捕形式（藏匿点+战斗+重囚）为阶段B定案，自研 mod 可针对性改（见 docs 设计注记）
//   本文件所有可调参数集中于此，改动前先读 docs/confinement-system.md「设计注记与演进预留」

import { entitySystem } from '../../core/entity-system'
import { eventBus } from '../../core/event-bus'
import { narrativeLog } from '../../core/narrative-log'
import { errorReporter } from '../../core/error-reporter'
import { apiSystem } from '../../core/api'
import { bindingResolver } from '../../core/binding-resolver'
import { modLoader } from '../../core/mod-loader'
import { gameContext, gameTimeToTotalMinutes } from '../../core/game-context'
import { UNNORMAL_BIT_2, getPrisoners, getSettings, getWardenId, getState } from './state'
import { getFallLevel, getUnusedPrisonCell, charaBecomePrisoner } from './prisoner'
// 注释：追捕 scene 构造在独立文件（fugitive-scene.ts，单一数据源——createFugitiveCommission
// 与读档重建共用；2026-08-14 四轮审查：抽离打破 state ↔ escape 循环依赖）
import { buildFugitiveScene } from './fugitive-scene'

// 注释：逃脱触发阈值（erArk :91——无监狱长时概率 > 30 直接逃脱）
const ESCAPE_THRESHOLD_NO_WARDEN = 30
// 注释：有监狱长时的基础阈值（erArk :103——50 + 设施效果，最高 99）
const ESCAPE_THRESHOLD_WARDEN = 50
// 注释：单日单囚犯的最长链路（防御性——正常 1 次）
const MAX_SETTLE_PER_DAY = 1
// 注释：追捕超时（游戏日，erArk 委托 3 天）
const FUGITIVE_TIMEOUT_DAYS = 3

// 注释：facilityEfficiency 默认值（无设施数据时 = 1，erArk calc_facility_efficiency 为 0 时除零
// 防护：erArk 设施效率 ≥1；本引擎无设施系统 → 恒 1。接入设施后按等级查效果表）
export function getFacilityEfficiency(_facilityId = 'detention'): number {
  return 1
}

// 注释：战斗/学识技能等级和（erArk ability[42]+ability[45]）
// 经 abilities.getByTag 聚合（engine API——getByTag 按 tag 查角色能力等级和）
// ⚠️ TODO(confinement-system)：当前 tag 聚合是 erArk 迁移近似，自研 mod 时按我们的公式改
async function getSkillTotal(charId: string, tag: string): Promise<number> {
  try {
    const list = await apiSystem.call('engine', 'abilities.getByTag', charId, tag) as
      { id: string; level: number; xp: number }[] | null
    if (!Array.isArray(list)) return 0
    let sum = 0
    for (const a of list) {
      const lv = typeof a?.level === 'number' ? a.level : 0
      sum += lv
    }
    return sum
  } catch {
    return 0 // 未注册（engine API 缺失）→ 按 0 处理，不报错
  }
}

// 注释：逃脱概率累积（erArk calculate_escape_probability）
// 返回本次增加的概率（0=无变化）
export async function calculateEscapeProbability(charId: string): Promise<number> {
  const prisoners = getPrisoners()
  const rec = prisoners[charId]
  if (!rec) return 0

  const combat = await getSkillTotal(charId, 'combat')
  const knowledge = await getSkillTotal(charId, 'knowledge')
  const totalSkill = combat + knowledge

  // 系数（erArk :42-47）
  const s = getSettings()
  let coefficient = (s.living_condition + 1) * 0.5
  // 屈服刻印削减（markId 14）
  const yieldLv = await getMarkLevelSafe(charId, 14)
  coefficient -= yieldLv * 0.1
  // 反发刻印增加（markId 18）
  const hateLv = await getMarkLevelSafe(charId, 18)
  coefficient += hateLv * 0.2
  // 陷落降低（erArk now_fall 负数 → -(-负) = +；陷落越高（负越多）系数越低）
  const fall = await getFallLevel(charId)
  coefficient -= fall * 0.2
  // 设施效率（除数为 0 防护）
  const facility = getFacilityEfficiency()
  coefficient /= facility > 0 ? facility : 1

  let add = totalSkill * coefficient
  // 已逃脱概率越高越难提升，单次上限 (100-当前)×0.1，最少也有 1（erArk :49-51）
  const maxAdd = (100 - rec.escapeProbability) * 0.1
  add = Math.min(add, maxAdd)
  add = Math.max(add, 1)

  rec.escapeProbability = Math.min(100, rec.escapeProbability + add)
  return add
}

// 注释：逃脱判定（erArk judge_can_escape）
// 返回 true = 逃脱成功
export async function judgeCanEscape(charId: string): Promise<boolean> {
  const prisoners = getPrisoners()
  const rec = prisoners[charId]
  if (!rec) return false

  const wardenId = getWardenId()

  // 无监狱长：概率 > 30 直接逃脱（erArk :91-93）
  if (!wardenId) {
    return rec.escapeProbability > ESCAPE_THRESHOLD_NO_WARDEN
  }

  // 有监狱长：阈值 = 50 + 设施效果（最高 99，erArk :103-104）
  const facilityEffect = 0 // TODO(confinement-system)：设施等级效果表（facilityLevels 接入后）
  const need = Math.min(99, ESCAPE_THRESHOLD_WARDEN + facilityEffect)
  if (rec.escapeProbability < need) return false

  // 对抗：囚犯逃脱值 vs 监狱长对抗值（erArk :105-114）
  const escapeValue = await calcEscapeValue(charId, rec.escapeProbability)
  const wardenValue = await calcWardenValue(wardenId)
  return escapeValue > wardenValue
}

// 注释：囚犯逃脱值（erArk :108-110）
// (概率/100) × (条件+1)×0.4 × 战斗技能 × (hp/100) × (mp/100)
async function calcEscapeValue(charId: string, probability: number): Promise<number> {
  const combat = await getSkillTotal(charId, 'combat')
  const hp = getHpPercent(charId)
  const mp = getMpPercent(charId)
  const s = getSettings()
  return (probability / 100) * (s.living_condition + 1) * 0.4 * combat * (hp / 100) * (mp / 100)
}

// 注释：监狱长对抗值（erArk :112-113）
// 监狱长战斗技能 × (hp/100) × (mp/100)
async function calcWardenValue(wardenId: string): Promise<number> {
  const combat = await getSkillTotal(wardenId, 'combat')
  const hp = getHpPercent(wardenId)
  const mp = getMpPercent(wardenId)
  return combat * (hp / 100) * (mp / 100)
}

// 注释：绑定 hp/mp 读取（ADR：confinement-0002——经绑定系统，不硬编码属性名）
// 未绑定 → 100（中性值，不惩罚不奖励）
// ⚠️ 2026-08-14 五轮审查修复：原 `Math.min(100, hp)` 把当前值当百分比——mod 的
// hp 上限 >100 时百分比系统性偏大（当前 200/上限 300 应 67% 却算 100%）。优先用
// hp_max 归一化（上限属性由绑定值推导：绑定 hp 对应的属性 + "_max" 后缀探测），
// 无上限时回退"当前值封顶 100"（旧近似）
function getHpPercent(charId: string): number {
  const hp = bindingResolver.getForPlugin('confinement-system', charId, 'hp')
  if (typeof hp !== 'number' || hp < 0) return 100
  const hpMax = getBoundMax(charId, 'hp')
  if (hpMax > 0) {
    return Math.max(0, Math.min(100, (hp / hpMax) * 100))
  }
  return Math.min(100, hp)
}

function getMpPercent(charId: string): number {
  const mp = bindingResolver.getForPlugin('confinement-system', charId, 'mp')
  if (typeof mp !== 'number' || mp < 0) return 100
  const mpMax = getBoundMax(charId, 'mp')
  if (mpMax > 0) {
    return Math.max(0, Math.min(100, (mp / mpMax) * 100))
  }
  return Math.min(100, mp)
}

// 注释：绑定属性的上限探测——绑定键名 + '_max' 后缀（如 hp → hp_max），经绑定系统读。
// 找不到 → 0（回退旧近似）
function getBoundMax(charId: string, key: 'hp' | 'mp'): number {
  const maxKey = `${key}_max`
  const val = bindingResolver.getForPlugin('confinement-system', charId, maxKey)
  return typeof val === 'number' && val > 0 ? val : 0
}

// 注释：逃脱成功（erArk escape_success :138）——escaping + 离线 + 删囚犯记录 + 追捕委托
export async function escapeSuccess(charId: string): Promise<void> {
  const char = entitySystem.get('character', charId) as any
  if (!char) return
  if (!char.sp_flag) char.sp_flag = {}
  char.sp_flag.escaping = true
  char.sp_flag.imprisonment = false
  char.sp_flag.unnormal_flag = (char.sp_flag.unnormal_flag ?? 0) & ~UNNORMAL_BIT_2
  delete getPrisoners()[charId]

  try {
    await apiSystem.call('character', 'setOffline', charId, 'escaping')
  } catch (err) {
    // ⚠️ 2026-08-14 二次审查：setOffline 失败 = 逃犯仍在线（escaping 标记与位置不一致，
    // 且 createFugitiveCommission 的 setOnline 幂等跳过 → 逃犯留在牢房）——上报 + 直接置位
    errorReporter.report({
      source: 'confinement-system',
      severity: 'warning',
      message: `逃脱离线失败：${err instanceof Error ? err.message : String(err)}（已直接置 offline 标记）`,
    })
    char.sp_flag.offline = true
    char.current_location = null
  }
  eventBus.emit('confinement:escaped', { character: charId })
  eventBus.emit('character:changed', { id: charId })
  narrativeLog.write(`${char.name ?? charId} 从监狱逃跑了！`, 'system', 'confinement-system')
  await createFugitiveCommission(charId)
}

// 注释：逃脱失败——概率清零（erArk escape_fail :163「监狱长加强了监视」）
export function escapeFail(charId: string): void {
  const rec = getPrisoners()[charId]
  if (!rec) return
  rec.escapeProbability = 0
  const char = entitySystem.get('character', charId) as any
  narrativeLog.write(`监狱长加强了监视，${char?.name ?? charId} 的逃脱企图失败了。`, 'system', 'confinement-system')
}

// 注释：每日结算（game:new_day 触发——erArk settle_prisoners）
// ⚠️ 2026-08-14 三轮审查：清理幽灵记录（角色不存在但囚犯列表有记录——读档后角色
// 被删/数据损坏时永久残留，每日结算对幽灵记录空跑 + 概率累积）
export async function settlePrisoners(): Promise<void> {
  const prisoners = getPrisoners()
  for (const charId of Object.keys(prisoners)) {
    if (!entitySystem.get('character', charId)) {
      errorReporter.report({
        source: 'confinement-system',
        severity: 'warning',
        message: `囚犯记录 '${charId}' 的角色不存在，已清理（幽灵记录）`,
        suggestion: '检查角色是否被删除或存档数据是否损坏',
      })
      delete prisoners[charId]
    }
  }
  const ids = Object.keys(prisoners)
  let settled = 0
  for (const charId of ids) {
    if (settled >= MAX_SETTLE_PER_DAY * ids.length) break
    settled++
    try {
      await calculateEscapeProbability(charId)
      const canEscape = await judgeCanEscape(charId)
      if (canEscape) {
        await escapeSuccess(charId)
      } else if (getPrisoners()[charId]?.escapeProbability > 0) {
        // 注释：概率>0 但判定失败 → 清零（erArk :170-171）
        escapeFail(charId)
      }
    } catch (err) {
      errorReporter.report({
        source: 'confinement-system',
        severity: 'warning',
        message: `囚犯 '${charId}' 逃脱结算异常：${err instanceof Error ? err.message : String(err)}`,
      })
    }
  }
}

// ── 追捕委托（阶段B）──

// 注释：逃犯记录读写（state.ts 持久化——provider fugitives 字段）
export function getFugitives(): Record<string, { hideout: string; escapedAt: number }> {
  return getState().fugitives
}

function setFugitive(fugitiveId: string, info: { hideout: string; escapedAt: number }): void {
  getState().fugitives[fugitiveId] = info
}

function deleteFugitive(fugitiveId: string): void {
  delete getState().fugitives[fugitiveId]
}

export function resetFugitives(): void {
  getState().fugitives = {}
}

// 注释：随机藏匿点（非监狱地点；玩家所在地点优先排除——逃犯躲到别处）
function pickHideout(): string {
  const mod = modLoader.getMod()
  if (!mod) return ''
  const playerId = gameContext.getContext().player?.id
  const playerLoc = playerId
    ? (entitySystem.get('character', playerId) as any)?.current_location
    : undefined
  const candidates: string[] = []
  for (const [locId, loc] of mod.locations) {
    if (loc.tags?.includes('prison')) continue
    if (loc.tags?.includes('detention')) continue
    if (locId === playerLoc) continue
    candidates.push(locId)
  }
  if (candidates.length === 0) return ''
  return candidates[Math.floor(Math.random() * candidates.length)]
}

// 注释：生成追捕委托（逃脱时调用——erArk create_capture_fugitive_commission）
export async function createFugitiveCommission(fugitiveId: string): Promise<void> {
  const hideout = pickHideout()
  if (!hideout) {
    errorReporter.report({
      source: 'confinement-system',
      severity: 'warning',
      message: `逃犯 '${fugitiveId}' 无可用藏匿点（mod 地图无非监狱地点），追捕委托未生成`,
      suggestion: '检查 mod 地图是否只有监狱地点；至少需要一个非监狱地点供逃犯藏匿',
    })
    return
  }
  const fugitive = entitySystem.get('character', fugitiveId) as any
  // 藏匿点上线（escaping 标记保留——npc-ai 跳过集拦截，不参与 AI 结算）
  try {
    await apiSystem.call('character', 'setOnline', fugitiveId, hideout)
  } catch (err) {
    errorReporter.report({
      source: 'confinement-system',
      severity: 'warning',
      message: `逃犯藏匿上线失败：${err instanceof Error ? err.message : String(err)}`,
    })
  }
  const escapedAt = gameTimeToTotalMinutes(gameContext.getContext().time)
  setFugitive(fugitiveId, { hideout, escapedAt })

  const scene = buildFugitiveScene(fugitiveId, hideout)
  try {
    await apiSystem.call('quest', 'startDynamicScene', scene.id, scene)
    narrativeLog.write(`发布了追捕 ${fugitive?.name ?? fugitiveId} 的委托（藏匿于 ${hideout}）。`, 'quest', 'confinement-system')
  } catch (err) {
    errorReporter.report({
      source: 'confinement-system',
      severity: 'warning',
      message: `追捕委托生成失败：${err instanceof Error ? err.message : String(err)}`,
      suggestion: '检查 quest-system 是否已加载（startDynamicScene API）',
    })
  }
}

// 注释：抓回逃犯（reward step 效果——confinement_recapture effect 调用）
// 需要空牢房（erArk get_unused_prison_dormitory 判空——无空牢房委托无法归还）
export async function recaptureFugitive(fugitiveId: string): Promise<void> {
  const emptyCell = getUnusedPrisonCell()
  const fugitive = entitySystem.get('character', fugitiveId) as any
  if (!fugitive) return
  if (!emptyCell) {
    narrativeLog.write(`没有空牢房，无法关押 ${fugitive?.name ?? fugitiveId}。`, 'system', 'confinement-system')
    return
  }
  // 移到空牢房 + 重囚（charaBecomePrisoner 全流程：清 escaping/位2/囚犯记录/服装/刻印）
  try {
    await apiSystem.call('character', 'moveTo', fugitiveId, emptyCell)
  } catch {
    // moveTo 可能校验可达性——直接写 current_location 兜底（重囚是剧情传送）
    fugitive.current_location = emptyCell
  }
  await charaBecomePrisoner(fugitiveId)
  deleteFugitive(fugitiveId)
  try {
    await apiSystem.call('quest', 'unregisterDynamicScene', `capture_${fugitiveId}`)
  } catch { /* quest 未加载，忽略 */ }
  eventBus.emit('confinement:recaptured', { character: fugitiveId })
  eventBus.emit('character:changed', { id: fugitiveId })
  narrativeLog.write(`${fugitive?.name ?? fugitiveId} 被押回监狱。`, 'system', 'confinement-system')
}

// 注释：逃犯超时检查（每日结算时调用）——3 游戏日未抓回 → 脱逃成功（永久自由）
// ⚠️ 修复（2026-08-14 审查）：原用 day 差值（day - escapedDay），跨月重置（30→1）导致
// 月末逃脱的逃犯 day 差为负、永不超时——改用总分钟数（gameTimeToTotalMinutes，跨月安全）
export async function checkFugitiveDeadline(): Promise<void> {
  const nowMinutes = gameTimeToTotalMinutes(gameContext.getContext().time)
  for (const [fugitiveId, info] of Object.entries(getFugitives())) {
    // ⚠️ 2026-08-14 三轮审查：逃犯幽灵记录清理（角色不存在）
    if (!entitySystem.get('character', fugitiveId)) {
      errorReporter.report({
        source: 'confinement-system',
        severity: 'warning',
        message: `逃犯记录 '${fugitiveId}' 的角色不存在，已清理（幽灵记录）`,
      })
      deleteFugitive(fugitiveId)
      continue
    }
    const escapedMinutes = info.escapedAt
    if (nowMinutes - escapedMinutes >= FUGITIVE_TIMEOUT_DAYS * 24 * 60) {
      const fugitive = entitySystem.get('character', fugitiveId) as any
      if (fugitive?.sp_flag) {
        fugitive.sp_flag.escaping = false
        fugitive.sp_flag.offline = false
      }
      deleteFugitive(fugitiveId)
      try {
        await apiSystem.call('quest', 'unregisterDynamicScene', `capture_${fugitiveId}`)
      } catch { /* quest 未加载，忽略 */ }
      eventBus.emit('confinement:escaped_forever', { character: fugitiveId })
      eventBus.emit('character:changed', { id: fugitiveId })
      narrativeLog.write(`${fugitive?.name ?? fugitiveId} 成功脱逃，再也找不到她了。`, 'system', 'confinement-system')
    }
  }
}

// 注释：刻印等级读取（h-mark API，失败 → 0）
async function getMarkLevelSafe(charId: string, markId: number): Promise<number> {
  try {
    const level = await apiSystem.call('h-mark', 'getLevel', charId, markId)
    return typeof level === 'number' ? level : 0
  } catch {
    return 0
  }
}

// 注释：调试辅助——打印所有囚犯的逃脱概率（@ 前缀 debug 命令可用）
export function debugPrisoners(): string[] {
  const result: string[] = []
  for (const [charId, rec] of Object.entries(getPrisoners())) {
    const c = entitySystem.get('character', charId) as any
    const name = c?.name ?? charId
    result.push(`${name}: 逃脱概率 ${Math.round(rec.escapeProbability)}%`)
  }
  if (result.length === 0) result.push('无囚犯')
  return result
}
