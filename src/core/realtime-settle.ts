// 实时结算——每次指令执行后自动触发
// 对齐 erark Script/Settle/realtime_settle.py

import { getEntityAttr, setEntityAttr } from './entity-utils'

export interface SettleOptions {
  /** 是否为休息/睡眠行为——不积累疲劳、改为恢复 HP/MP */
  isRest?: boolean
  /** 是否为睡眠行为——加速疲劳减少 + 积累熟睡值 */
  isSleep?: boolean
}

// ── 疲劳 ──
function settleTired(entity: any, minutes: number, opts: SettleOptions): void {
  // 休息/睡眠时不积累疲劳
  if (opts.isRest || opts.isSleep) return
  const tired = getEntityAttr(entity, '疲劳度')
  if (typeof tired !== 'number') return
  if (tired >= 160) return
  const add = Math.max(1, Math.floor(minutes / 6))
  setEntityAttr(entity, '疲劳度', Math.min(160, tired + add))
}

// ── 休息/睡眠恢复体力气力（erark settle_rest/settle_sleep）──
function settleRestRecovery(entity: any, minutes: number, opts: SettleOptions): void {
  // 注释：HP/MP 恢复由指令 effect 处理（recover_permil），实时结算不重复恢复
  
  // 睡眠时额外减少疲劳（erark: 2倍速度）
  if (opts.isSleep) {
    const tired = getEntityAttr(entity, '疲劳度')
    if (typeof tired === 'number' && tired > 0) {
      const reduce = Math.max(1, Math.floor(minutes / 6) * 2)
      setEntityAttr(entity, '疲劳度', Math.max(0, tired - reduce))
    }
    // 熟睡值积累（erark: 浅睡时 +1.5/分钟，深睡后随机）
    const sleepVal = getEntityAttr(entity, '熟睡值')
    if (typeof sleepVal === 'number') {
      const add = sleepVal <= 60
        ? Math.floor(minutes * 1.5)
        : Math.floor(minutes * (0.3 + Math.random() * 0.9))
      setEntityAttr(entity, '熟睡值', Math.min(100, sleepVal + add))
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
}

// ── 饥饿 ──
function settleHunger(entity: any, minutes: number): void {
  const hunger = getEntityAttr(entity, '饥饿值')
  if (typeof hunger !== 'number') return
  if (hunger >= 240) return
  const variance = 0.8 + Math.random() * 0.4
  const add = Math.max(1, Math.floor(minutes * variance))
  setEntityAttr(entity, '饥饿值', Math.min(240, hunger + add))
}

// ── 尿意 ──
function settleUrine(entity: any, minutes: number): void {
  const urine = getEntityAttr(entity, '尿意')
  if (typeof urine !== 'number') return
  if (urine >= 240) return
  const variance = 0.8 + Math.random() * 0.4
  const add = Math.max(1, Math.floor(minutes * variance))
  setEntityAttr(entity, '尿意', Math.min(240, urine + add))
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

// ── 入口 ──
export function realtimeSettle(entity: any, minutes: number, opts: SettleOptions = {}): void {
  if (!entity || minutes <= 0) return
  settleTired(entity, minutes, opts)
  settleRestRecovery(entity, minutes, opts)
  settleHunger(entity, minutes)
  settleUrine(entity, minutes)
  settleSemen(entity, minutes)
  clampHpMp(entity)
}
