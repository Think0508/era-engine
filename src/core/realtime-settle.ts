// 实时结算——每次指令执行后自动触发
// 对齐 erark Script/Settle/realtime_settle.py

import { getEntityAttr, setEntityAttr } from './entity-utils'
import { gameContext, gameTimeToTotalMinutes } from './game-context'
import { modLoader } from './mod-loader'

export interface SettleOptions {
  /** 是否为休息/睡眠行为——不积累疲劳、改为恢复 HP/MP */
  isRest?: boolean
  /** 是否为睡眠行为——加速疲劳减少 + 积累熟睡值 */
  isSleep?: boolean
}

// ── 疲劳 ──
// 注释：opts.isRest/isSleep 时跳过——玩家侧（指令休息/睡眠不积累疲劳，恢复走指令 effect）。
// erArk 原义（realtime_settle.py:326-357）：仅 SLEEP 行为跳过，REST 行为照常积累——
// NPC 侧由 npc-ai-system 用 opts={} 调用（休息也积累，erArk 同构）。
export function settleTired(entity: any, minutes: number, opts: SettleOptions = {}): void {
  // 休息/睡眠时不积累疲劳
  if (opts.isRest || opts.isSleep) return
  const tired = getEntityAttr(entity, '疲劳度')
  if (typeof tired !== 'number') return
  if (tired >= 160) return
  const add = Math.max(1, Math.floor(minutes / 6))
  setEntityAttr(entity, '疲劳度', Math.min(160, tired + add))
}
// ── 睡眠快感清零（G4 决策 2026-08-09）──
// erArk sleep_settle.py:124-128：睡眠结算时清零快感（type=0 部位，性别过滤）；
// 转宝珠部分因宝珠系统已砍（对账表 juel 有意删减）只留清零。
// 实现：按 attributes.toml daily_reset=true 标记清零（契约字段语义，mod 可控——
// daily_reset 标记首次有消费方）；机制挂 isSleep 分支，L1.7 sleep 指令化时自动生效
function settleDailyReset(entity: any): void {
  const attributes = modLoader.getMod()?.attributes
  if (!attributes) return
  for (const [attrName, def] of Object.entries(attributes)) {
    if (!def.daily_reset) continue
    const cur = getEntityAttr(entity, attrName)
    if (typeof cur === 'number' && cur !== 0) {
      setEntityAttr(entity, attrName, 0)
    }
  }
}

// ── 睡眠中的逐段结算（erArk realtime_settle.settle_sleep，:397-417）──
// NPC 睡眠行为期间的每 pass 窗口结算：疲劳 2 倍削减 + 熟睡值积累（乘 tired_adjust）。
// 与 sleepSettle（玩家睡眠一次性的完整结算，含 wake 侧 daily_reset/愤怒/精液）区分：
// erArk 中 wake 侧效果（daily_reset 清零/愤怒重置/精液累积）只在 update_sleep 里跑
// （玩家睡眠时对全员执行），NPC 自然醒（玩家没睡）不触发 wake 侧——本函数即"NPC
// 睡眠期间的逐段积累"，行为完成时不再补 wake 侧（erArk 同构）。
export function sleepPassSettle(entity: any, minutes: number): void {
  if (!entity || minutes <= 0) return
  const tired = getEntityAttr(entity, '疲劳度')
  if (typeof tired === 'number' && tired > 0) {
    const reduce = Math.max(1, Math.floor(minutes / 6) * 2)
    setEntityAttr(entity, '疲劳度', Math.max(0, tired - reduce))
  }
  const sleepVal = getEntityAttr(entity, '熟睡值')
  if (typeof sleepVal === 'number') {
    const tiredAdjust = 1 + (typeof tired === 'number' ? tired : 0) / 160
    const add = sleepVal <= 60
      ? Math.floor(minutes * tiredAdjust * 1.5)
      : Math.floor(minutes * tiredAdjust * (-0.3 + Math.random() * 0.9))
    setEntityAttr(entity, '熟睡值', Math.min(100, Math.max(0, sleepVal + add)))
  }
}

// ── 睡眠结算（共享函数，G4/G5/G6 决策 2026-08-09 对齐 erArk）──
// erArk sleep_settle.py 对应物：玩家睡眠（isSleep 分支）与 NPC 睡眠行为完成（npc-ai-system）
// 共用同一逻辑——玩家与 NPC 的睡眠结算必须一致（erArk sleep_settle 对全部角色同构）。
// 包含：daily_reset 清零（:124-128）、愤怒重置（:80 rand(1,35)）、疲劳 2 倍削减、
// 熟睡值积累（:409-418）、射精欲清零 + 今日首射标记 + 额外精液累积 + 浓厚精液天赋（:56-57/:124-128）
export function sleepSettle(entity: any, minutes: number): void {
  if (!entity || minutes <= 0) return
  // 快感清零（G4：daily_reset 标记属性睡眠结算归零——erArk sleep_settle.py:124-128）
  settleDailyReset(entity)
  // 愤怒重置（G5：erArk sleep_settle.py:80——睡眠醒来愤怒回到 rand(1,35)，不睡不重置）
  if (!entity.base) entity.base = {}
  entity.base['愤怒'] = 1 + Math.floor(Math.random() * 35)
  const tired = getEntityAttr(entity, '疲劳度')
  if (typeof tired === 'number' && tired > 0) {
    const reduce = Math.max(1, Math.floor(minutes / 6) * 2)
    setEntityAttr(entity, '疲劳度', Math.max(0, tired - reduce))
  }
  // 熟睡值积累（erArk realtime_settle.py:409-418——G6 决策 2026-08-09 对齐）：
  // 两分支都乘 tired_adjust = 1 + 疲劳/160；浅睡 +1.5/分钟，深睡 rand(-0.3~0.6)（可为负，
  // 下界钳 0 防御——erArk 未钳下界属其瑕疵）
  const sleepVal = getEntityAttr(entity, '熟睡值')
  if (typeof sleepVal === 'number') {
    const tiredAdjust = 1 + (typeof tired === 'number' ? tired : 0) / 160
    const add = sleepVal <= 60
      ? Math.floor(minutes * tiredAdjust * 1.5)
      : Math.floor(minutes * tiredAdjust * (-0.3 + Math.random() * 0.9))
    setEntityAttr(entity, '熟睡值', Math.min(100, Math.max(0, sleepVal + add)))
  }
  // 额外精液累积（对齐 erArk sleep_settle.py refresh_temp_semen_max）
  // 睡≥6h(360分钟)：额外精液 += 当前精液/2，上限 精液上限×4；满则获得"浓厚精液"天赋
  if (minutes >= 360) {
    // 清零射精欲（erArk sleep_settle.py:56）
    setEntityAttr(entity, '射精欲', 0)
    // 重置今日首射标记（erArk sleep_settle.py:57——睡醒后今日首射翻倍）
    if (!entity.action_info) entity.action_info = {}
    entity.action_info.day_first_shoot_semen = true
    const semen = getEntityAttr(entity, '精液量')
    const semenMax = getEntityAttr(entity, '精液量上限')
    if (typeof semen === 'number' && semen > 0 && typeof semenMax === 'number' && semenMax > 0) {
      const extraMax = semenMax * 4
      const extra = getEntityAttr(entity, '额外精液量')
      const newExtra = Math.min(extraMax, (typeof extra === 'number' ? extra : 0) + Math.floor(semen / 2))
      setEntityAttr(entity, '额外精液量', newExtra)
      // 浓厚精液天赋（erArk talent[33]：额外精液满上限时获得）
      if (!entity.talents) entity.talents = {}
      if (newExtra >= extraMax) {
        entity.talents['浓厚精液'] = 1
      } else {
        delete entity.talents['浓厚精液']
      }
    }
  }
}

// ── 休息/睡眠恢复体力气力（erark settle_rest/settle_sleep）──
function settleRestRecovery(entity: any, minutes: number, opts: SettleOptions): void {
  // 注释：HP/MP 恢复由指令 effect 处理（recover_permil），实时结算不重复恢复

  // 睡眠时额外减少疲劳（erark: 2倍速度）
  if (opts.isSleep) {
    // 注释：睡眠结算统一走共享函数（玩家/ NPC 同构，G4/G5/G6 决策）
    sleepSettle(entity, minutes)
  }
}

// ── 饥饿 ──
// G1 决策 2026-08-09：行动级唯一增长源（hunger-system 的 hour_changed 增长已删——双轨=双倍）。
// erArk realtime_settle.py:126-135：rand(0.8~1.2×t) × 体力比例系数(2-hp/max) × 气力比例系数(2-mp/max)，
// 上限 240；体力/气力越低系数越高（无体力时 2 倍，满时 1 倍）
export function settleHunger(entity: any, minutes: number): void {
  const hunger = getEntityAttr(entity, '饥饿值')
  if (typeof hunger !== 'number') return
  if (hunger >= 240) return
  const hp = getEntityAttr(entity, '体力')
  const hpMax = getEntityAttr(entity, '体力上限')
  const mp = getEntityAttr(entity, '气力')
  const mpMax = getEntityAttr(entity, '气力上限')
  const hpCoeff = typeof hp === 'number' && typeof hpMax === 'number' && hpMax > 0 ? 2 - hp / hpMax : 1
  const mpCoeff = typeof mp === 'number' && typeof mpMax === 'number' && mpMax > 0 ? 2 - mp / mpMax : 1
  const variance = 0.8 + Math.random() * 0.4
  const add = Math.floor(minutes * variance * hpCoeff * mpCoeff)
  if (add <= 0) return
  setEntityAttr(entity, '饥饿值', Math.min(240, hunger + add))
}

// ── 尿意 ──
// G6 决策 2026-08-09：上限对齐 erArk 实际行为 300（realtime_settle.py:122 min(...,300)——
// game_type.py:1512 注释"4h=240 max"与代码矛盾，以代码为准）
export function settleUrine(entity: any, minutes: number): void {
  const urine = getEntityAttr(entity, '尿意')
  if (typeof urine !== 'number') return
  if (urine >= 300) return
  const variance = 0.8 + Math.random() * 0.4
  const add = Math.max(1, Math.floor(minutes * variance))
  setEntityAttr(entity, '尿意', Math.min(300, urine + add))
}

// ── 精液量恢复 ──
function settleSemen(entity: any, minutes: number): void {
  const semen = getEntityAttr(entity, '精液量')
  const max = getEntityAttr(entity, '精液量上限')
  if (typeof semen !== 'number' || typeof max !== 'number') return
  if (semen >= max) return
  const add = Math.max(1, Math.floor(minutes / 20))
  setEntityAttr(entity, '精液量', Math.min(max, semen + add))
}

// ── 体力/气力钳位 ──
export function clampHpMp(entity: any): void {
  const hp = getEntityAttr(entity, '体力')
  const hpMax = getEntityAttr(entity, '体力上限')
  if (typeof hp === 'number' && typeof hpMax === 'number' && hp > hpMax) {
    setEntityAttr(entity, '体力', hpMax)
  }
  const mp = getEntityAttr(entity, '气力')
  const mpMax = getEntityAttr(entity, '气力上限')
  if (typeof mp === 'number' && typeof mpMax === 'number' && mp > mpMax) {
    setEntityAttr(entity, '气力', mpMax)
  }
}

// ── 射精欲自然消退（G3 决策 2026-08-09，erArk realtime_settle.py:144-149）──
// 仅玩家、非 H、距上次射精 >30 分钟 → 射精欲 -10/分钟（下限 0）。
// 30 分钟门控依赖 action_info.last_eaj_add_time（h-ejaculation 射精时写入）
function settleEjaDecay(entity: any, minutes: number): void {
  if (entity.id !== 'player' && entity.id !== '0') return
  if (entity.h_state?.is_h) return
  const last = entity.action_info?.last_eaj_add_time
  if (typeof last !== 'number') return
  const now = gameTimeToTotalMinutes(gameContext.getContext().time)
  if (now - last <= 30) return
  const eja = getEntityAttr(entity, '射精欲')
  if (typeof eja !== 'number' || eja <= 0) return
  setEntityAttr(entity, '射精欲', Math.max(0, eja - minutes * 10))
}

// ── 入口 ──
export function realtimeSettle(entity: any, minutes: number, opts: SettleOptions = {}): void {
  if (!entity || minutes <= 0) return
  settleTired(entity, minutes, opts)
  settleRestRecovery(entity, minutes, opts)
  settleHunger(entity, minutes)
  settleUrine(entity, minutes)
  settleSemen(entity, minutes)
  settleEjaDecay(entity, minutes)
  clampHpMp(entity)
}
