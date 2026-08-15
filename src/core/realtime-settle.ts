// 实时结算——每次指令执行后自动触发
// 对齐 erark Script/Settle/realtime_settle.py

import { getEntityAttr, setEntityAttr, ATTR, ATTR_CAPS, clampAttrValue } from './entity-utils'
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
  const tiredCap = ATTR_CAPS[ATTR.FATIGUE]?.cap ?? 160
  if (tired >= tiredCap) return
  const add = Math.max(1, Math.floor(minutes / 6))
  setEntityAttr(entity, '疲劳度', clampAttrValue(entity, '疲劳度', tired + add))
}
// ── 睡眠快感清零（G4 决策 2026-08-09）──
// erArk sleep_settle.py:124-128：睡眠结算时清零快感（type=0 部位，性别过滤）；
// 转宝珠部分因宝珠系统已砍（对账表 juel 有意删减）只留清零。
// 实现：按 attributes.toml daily_reset=true 标记清零（契约字段语义，mod 可控——
// daily_reset 标记首次有消费方）；对全员执行由 sleep-system 插件 updateSleepAll 编排
// （erArk update_sleep 对 npc_id_got + 玩家全量跑），core 只提供机制
export function settleDailyReset(entity: any): void {
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

// ── 睡眠体力/气力恢复（erArk settle_sleep，realtime_settle.py:388-391）──
// hp_base = 体力上限×0.0025 + 3；mp_base = 气力上限×0.005 + 6；恢复 = base × 分钟
// 方舟世界观修正（天赋 351/352、监禁、宿舍设施、管理员知识）为世界观专属，不搬（Q4 定案）
function sleepRecovery(entity: any, minutes: number): void {
  const hpMax = getEntityAttr(entity, ATTR.HP_MAX)
  const hp = getEntityAttr(entity, ATTR.HP)
  if (typeof hpMax === 'number' && hpMax > 0 && typeof hp === 'number' && hp < hpMax) {
    const hpBase = hpMax * 0.0025 + 3
    setEntityAttr(entity, ATTR.HP, clampAttrValue(entity, ATTR.HP, hp + Math.floor(hpBase * minutes)))
  }
  const mpMax = getEntityAttr(entity, ATTR.MP_MAX)
  const mp = getEntityAttr(entity, ATTR.MP)
  if (typeof mpMax === 'number' && mpMax > 0 && typeof mp === 'number' && mp < mpMax) {
    const mpBase = mpMax * 0.005 + 6
    setEntityAttr(entity, ATTR.MP, clampAttrValue(entity, ATTR.MP, mp + Math.floor(mpBase * minutes)))
  }
}

// ── 睡眠中的逐段结算（erArk realtime_settle.settle_sleep，:347-391）──
// 玩家睡眠（isSleep 分支）与 NPC 睡眠行为窗口（npc-ai-system windowSettle）共用：
// 疲劳 2 倍削减 + 熟睡值积累 + 体力/气力公式恢复。
// 熟睡积累（I6 修复 2026-08-11）：erArk 源码无 tired_adjust 系数（:362-367
// `add = int(t×1.5)` / `randint(int(t×-0.3), int(t×0.6))`）——2026-08-09 G6 旧决策
// 引用的 :409-418 行号在权威源码中对应不存在的系数，已修正为无系数（忠实源码）
// wake 侧（daily_reset 清零/愤怒重置/精液累积）不在本函数——erArk 只在 update_sleep 里跑
// （玩家睡眠时对全员执行），NPC 自然醒（玩家没睡）不触发 wake 侧（sleep-system 编排）。
export function sleepPassSettle(entity: any, minutes: number): void {
  if (!entity || minutes <= 0) return
  const tired = getEntityAttr(entity, ATTR.FATIGUE)
  if (typeof tired === 'number' && tired > 0) {
    const reduce = Math.max(1, Math.floor(minutes / 6) * 2)
    setEntityAttr(entity, ATTR.FATIGUE, Math.max(0, tired - reduce))
  }
  const sleepVal = getEntityAttr(entity, ATTR.SLEEP)
  if (typeof sleepVal === 'number') {
    const add = sleepVal <= 60
      ? Math.floor(minutes * 1.5)
      : Math.floor(minutes * (-0.3 + Math.random() * 0.9))
    setEntityAttr(entity, ATTR.SLEEP, Math.min(100, Math.max(0, sleepVal + add)))
  }
  sleepRecovery(entity, minutes)
}

// ── 休息/睡眠恢复体力气力（erark settle_rest/settle_sleep）──
function settleRestRecovery(entity: any, minutes: number, opts: SettleOptions): void {
  // 注释：休息的 HP/MP 恢复由指令 effect 处理（recover_permil），实时结算不重复恢复；
  // 睡眠例外——erArk settle_sleep 按公式恢复（上限×0.0025+3 / 上限×0.005+6 每分钟）
  if (opts.isSleep) {
    sleepPassSettle(entity, minutes)
  }
}

// ── 饥饿 ──
// G1 决策 2026-08-09：行动级唯一增长源（hunger-system 的 hour_changed 增长已删——双轨=双倍）。
// erArk realtime_settle.py:126-135：rand(0.8~1.2×t) × 体力比例系数(2-hp/max) × 气力比例系数(2-mp/max)，
// 上限 240；体力/气力越低系数越高（无体力时 2 倍，满时 1 倍）
export function settleHunger(entity: any, minutes: number): void {
  const hunger = getEntityAttr(entity, '饥饿值')
  if (typeof hunger !== 'number') return
  const hungerCap = ATTR_CAPS[ATTR.HUNGER]?.cap ?? 240
  if (hunger >= hungerCap) return
  const hp = getEntityAttr(entity, '体力')
  const hpMax = getEntityAttr(entity, '体力上限')
  const mp = getEntityAttr(entity, '气力')
  const mpMax = getEntityAttr(entity, '气力上限')
  const hpCoeff = typeof hp === 'number' && typeof hpMax === 'number' && hpMax > 0 ? 2 - hp / hpMax : 1
  const mpCoeff = typeof mp === 'number' && typeof mpMax === 'number' && mpMax > 0 ? 2 - mp / mpMax : 1
  const variance = 0.8 + Math.random() * 0.4
  const add = Math.floor(minutes * variance * hpCoeff * mpCoeff)
  if (add <= 0) return
  setEntityAttr(entity, '饥饿值', clampAttrValue(entity, '饥饿值', hunger + add))
}

// ── 尿意 ──
// G6 决策 2026-08-09：上限对齐 erArk 实际行为 300（realtime_settle.py:122 min(...,300)——
// game_type.py:1512 注释"4h=240 max"与代码矛盾，以代码为准）
export function settleUrine(entity: any, minutes: number): void {
  const urine = getEntityAttr(entity, '尿意')
  if (typeof urine !== 'number') return
  const urineCap = ATTR_CAPS[ATTR.URINE]?.cap ?? 300
  if (urine >= urineCap) return
  const variance = 0.8 + Math.random() * 0.4
  const add = Math.max(1, Math.floor(minutes * variance))
  setEntityAttr(entity, '尿意', clampAttrValue(entity, '尿意', urine + add))
}

// ── 精液量恢复 ──
function settleSemen(entity: any, minutes: number): void {
  const semen = getEntityAttr(entity, '精液量')
  const max = getEntityAttr(entity, '精液量上限')
  if (typeof semen !== 'number' || typeof max !== 'number') return
  if (semen >= max) return
  const add = Math.max(1, Math.floor(minutes / 20))
  setEntityAttr(entity, '精液量', clampAttrValue(entity, '精液量', semen + add))
}

// ── 体力/气力钳位 ──
export function clampHpMp(entity: any): void {
  const hp = getEntityAttr(entity, '体力')
  const hpMax = getEntityAttr(entity, '体力上限')
  if (typeof hp === 'number' && typeof hpMax === 'number' && hp > hpMax) {
    setEntityAttr(entity, '体力', clampAttrValue(entity, '体力', hp))
  }
  const mp = getEntityAttr(entity, '气力')
  const mpMax = getEntityAttr(entity, '气力上限')
  if (typeof mp === 'number' && typeof mpMax === 'number' && mp > mpMax) {
    setEntityAttr(entity, '气力', clampAttrValue(entity, '气力', mp))
  }
}

// ── 射精欲自然消退（G3 决策 2026-08-09，erArk realtime_settle.py:144-149）──
// 仅玩家、非 H、距上次射精 >30 分钟 → 射精欲 -10/分钟（下限 0）。
// 30 分钟门控依赖 action_info.last_eaj_add_time（h-ejaculation 射精时写入）
function settleEjaDecay(entity: any, minutes: number): void {
  // 注释：仅玩家（2026-08-13 审计——原硬编码 'player'/'0'，meta.toml player_character
  // 自定义 id 时射精欲永不衰减；改用 gameContext 玩家 id 判定）
  const playerId = gameContext.getContext().player?.id
  if (!playerId || entity.id !== playerId) return
  if (entity.h_state?.is_h) return
  const last = entity.action_info?.last_eaj_add_time
  if (typeof last !== 'number') return
  const now = gameTimeToTotalMinutes(gameContext.getContext().time)
  if (now - last <= 30) return
  const eja = getEntityAttr(entity, '射精欲')
  if (typeof eja !== 'number' || eja <= 0) return
  setEntityAttr(entity, '射精欲', clampAttrValue(entity, '射精欲', eja - minutes * 10))
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
