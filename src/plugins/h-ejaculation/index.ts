// 注释：h-ejaculation 插件——射精系统，完全对齐 erArk
// - eja_add: 射精积累（公式对齐 default.py）
// - eja_climax: 射精判定 + 避孕套检查
// - eja_shoot: 射精量计算（含全部 7 个乘数）
// - eja_decay: 非 H 模式下的射精欲衰减
// - absorbSemen: 精液吸收（对齐 realtime_settle.py:231-260）
// - penis_dirty_dict: 玩家阴茎精液污浊追踪

import type { PluginContext } from '../../core/types'
import { effectTypeRegistry } from '../../core/effect-type-registry'
import { entitySystem } from '../../core/entity-system'
import { eventBus } from '../../core/event-bus'
import { narrativeLog } from '../../core/narrative-log'
import { premiseRegistry } from '../../core/premise-registry'
import { gameContext } from '../../core/game-context'
import { BODY_PART_CID } from './body-parts'

// 身体部位最大容量(ml)——对齐 erArk config_body_part
const BODY_PART_MAX_VOLUME: Record<number, number> = {
  8: 200,   // 肛
  15: 500,  // 胃/体内
}

export interface AbsorbResult {
  absorbed: number
  remaining: number
  newLevel: number
  newHunger: number
}

// 注释：精液等级——对齐 erArk attr_calculation.py:716 get_semen_now_level
// 等级阈值: L1=1% L2=5% L3=10% L4=20% L5+=20%+每15%+1 最高10级
export function calcSemenLevel(value: number, maxVolume: number): number {
  if (value <= 0 || maxVolume <= 0) return 0
  const ratio = value / maxVolume
  if (ratio >= 1.0) return 10
  if (ratio >= 0.2) return Math.min(10, 4 + Math.floor((ratio - 0.2) / 0.15))
  if (ratio >= 0.1) return 3
  if (ratio >= 0.05) return 2
  if (ratio >= 0.01) return 1
  return 0
}

// 注释：精液吸收——对齐 erArk realtime_settle.py:231-260
// 每5分钟1ml或当前量1%取较大值，<3ml清零
// hunger削减留待饥饿系统实现
export function calcSemenAbsorb(
  currentMl: number,
  addTime: number,
  maxVolume: number,
  currentHunger: number,
): AbsorbResult | null {
  if (currentMl <= 0) return null
  let absorb = Math.max(Math.floor(addTime / 5), Math.floor(currentMl * 0.01))
  absorb = Math.min(absorb, currentMl)
  let remaining = currentMl - absorb
  if (remaining < 3) remaining = 0
  const newLevel = calcSemenLevel(remaining, maxVolume)
  const newHunger = Math.max(0, currentHunger - absorb)
  // 注释：erArk 同时削减 hunger_point，留待饥饿系统接入
  return { absorbed, remaining, newLevel, newHunger }
}

// 注释：设置玩家阴茎精液污浊标志
function setPenisSemenDirty(char: any, dirty: boolean): void {
  if (!char.dirty) char.dirty = {}
  if (!char.dirty.penis_dirty_dict) char.dirty.penis_dirty_dict = {}
  char.dirty.penis_dirty_dict.semen = dirty
}

// 注释：精液等级重算——对齐 erArk get_semen_now_level 百分位阈值
function recalcSemenLevel(char: any, positionId: number): void {
  if (!char.body_semen?.[positionId]) return
  const currentMl = char.body_semen[positionId][1] ?? 0
  const maxVol = BODY_PART_MAX_VOLUME[positionId] ?? 100
  char.body_semen[positionId][2] = calcSemenLevel(currentMl, maxVol)
}

export function onLoad(_ctx: PluginContext): void {
  // 注释：射精积累——对齐 erArk default.py:3669
  // 公式：eja += addTime + 10 + floor(eja × 0.4)  （无上限，睡觉得到衰减）
  effectTypeRegistry.register('eja_add', (params: any, ctx: any) => {
    const targetIds = ctx._targetIds as string[]
    const addTime = ctx._timeCost ?? params.addTime ?? 10
    for (const id of targetIds) {
      const char = entitySystem.get('character', id) as any
      if (!char?.base) continue
      const current = char.base['射精欲'] ?? 0
      char.base['射精欲'] = current + addTime + 10 + Math.floor(current * 0.4)
    }
    return true
  })

  // 注释：射精判定 + 玩家阴茎污浊追踪
  effectTypeRegistry.register('eja_climax', (params: any, ctx: any) => {
    const targetIds = ctx._targetIds as string[]
    for (const id of targetIds) {
      const char = entitySystem.get('character', id) as any
      if (!char?.base) continue
      const eja = char.base['射精欲'] ?? 0
      if (eja < 1000) continue
      char.base['射精欲'] = 0
      const semenCount = calcSemenAmount(char, params.level ?? 'normal')
      const hasCondom = char.body_items?.['13']?.active === true
      if (hasCondom) {
        const hstate = char.h_state
        if (hstate) {
          hstate.condom_count[0]++
          hstate.condom_count[1] += semenCount
        }
        delete char.body_items['13']
        narrativeLog.write(`${char.name} 射精了！(避孕套 ${semenCount}ml)`, 'system', 'h-ejaculation')
        eventBus.emit('h:shoot', { character: id, amount: semenCount, position: params.positionId, condom: true })
      } else {
        trackSemen(char, params.positionId ?? 0, semenCount)
        // 注释：玩家射精 → 设置阴茎精液污浊（erArk ejaculation_panel.py:193）
        if (id === 'player' || id === '0') setPenisSemenDirty(char, true)
        narrativeLog.write(`${char.name} 射精了！(${semenCount}ml)`, 'system', 'h-ejaculation')
        eventBus.emit('h:shoot', { character: id, amount: semenCount, position: params.positionId, condom: false })
      }
    }
    return true
  })

  // 注释：射精量计算（直接 effect 版）+ 玩家阴茎污浊追踪
  effectTypeRegistry.register('eja_shoot', (params: any, ctx: any) => {
    const targetIds = ctx._targetIds as string[]
    for (const id of targetIds) {
      const char = entitySystem.get('character', id) as any
      if (!char?.base) return
      const amount = calcSemenAmount(char, params.level ?? 'normal')
      trackSemen(char, params.positionId ?? 0, amount)
      if (id === 'player' || id === '0') setPenisSemenDirty(char, true)
      narrativeLog.write(`射精 ${amount}ml`, 'system', 'h-ejaculation')
    }
    return true
  })

  // 注释：射精欲衰减——非 H 模式下每小时减 10×60
  effectTypeRegistry.register('eja_decay', (_p: any, ctx: any) => {
    const ids = ctx._targetIds as string[]
    for (const id of ids) {
      const char = entitySystem.get('character', id) as any
      if (!char?.base || char?.h_state?.is_h) continue
      if (char.base['射精欲'] > 0) {
        char.base['射精欲'] = Math.max(0, char.base['射精欲'] - 600)
      }
    }
    return true
  })

  // 注释：clean_penis_semen——清洗玩家阴茎精液（erArk default.py:4174）
  effectTypeRegistry.register('clean_penis_semen', (_p: any, _execCtx: any) => {
    const player = entitySystem.get('character', '0') as any
    if (player?.dirty?.penis_dirty_dict) {
      player.dirty.penis_dirty_dict.semen = false
    }
    return true
  })

  // 注释：clear_body_semen——清空指定部位精液（含中文别名清理）
  effectTypeRegistry.register('clear_body_semen', (params: any, execCtx: any) => {
    const partId = params.partId as number | undefined
    for (const id of execCtx._targetIds as string[]) {
      const ch = entitySystem.get('character', id) as any
      if (!ch?.body_semen) continue
      if (partId !== undefined) {
        // 注释：同时删除中文别名（如 阴道、后穴 等）
        for (const [name, cid] of Object.entries(BODY_PART_CID)) {
          if (cid === partId) delete ch.body_semen[name]
        }
        delete ch.body_semen[partId]
      } else {
        ch.body_semen = {}
      }
    }
    return true
  })
}

export function onEnable(ctx: PluginContext): void {
  // 注释：玩家阴茎精液污浊前提
  premiseRegistry.register('pl_penis_semen_dirty', () => {
    const player = entitySystem.get('character', '0') as any
    return !!player?.dirty?.penis_dirty_dict?.semen
  })
  premiseRegistry.register('pl_penis_not_semen_dirty', () => {
    const player = entitySystem.get('character', '0') as any
    return !player?.dirty?.penis_dirty_dict?.semen
  })

  // 注释：阴茎大小前提（jj_0~3）——查 actor（行为发起者）的阴茎大小
  // erArk handle_premise_other.py:1912-1966
  // actorId 从 talk-common premiseCtx 传入，默认查玩家
  for (let size = 0; size <= 3; size++) {
    const targetSize = size
    premiseRegistry.register(`jj_${size}`, (ctx: any) => {
      const actorId = ctx?.actorId ?? '0'
      const actor = entitySystem.get('character', actorId) as any
      return (actor?.base?.['阴茎大小'] ?? 1) === targetSize
    })
  }

  // 注释：每小时衰减射精欲
  ctx.events.on('game:hour_changed', () => {
    for (const ch of entitySystem.getAll('character')) {
      const c = ch as any
      if (!c?.base || c?.h_state?.is_h) continue
      if ((c.base['射精欲'] ?? 0) > 0) {
        c.base['射精欲'] = Math.max(0, c.base['射精欲'] - 600)
      }
    }
  })

  // 注释：H 每次行动后 → 精液吸收（erArk realtime_settle.py:130-139）
  ctx.events.on('game:execution_end', async (_payload: any) => {
    const mode = gameContext.getCurrentMode()
    if (mode !== 'h_scene') return
    for (const ch of entitySystem.getAll('character')) {
      const c = ch as any
      if (!c?.body_semen || !c?.h_state?.is_h) continue
      const addTime = 10  // 每次行动约10分钟
      // 注释：仅 body_part 8(肛) 和 15(胃) 触发吸收（erArk 行为）
      for (const partId of [8, 15]) {
        const currentMl = c.body_semen[partId]?.[1] ?? 0
        if (currentMl <= 0) continue
        const maxVol = BODY_PART_MAX_VOLUME[partId] ?? 100
        const hunger = c.base?.['饥饿度'] ?? 0
        const result = calcSemenAbsorb(currentMl, addTime, maxVol, hunger)
        if (!result) continue
        c.body_semen[partId][1] = result.remaining
        c.body_semen[partId][2] = result.newLevel
        // TODO: hunger 削减（留待饥饿系统）
      }
    }
  })

  ctx.api.register('h-ejaculation', {
    getEja: (charId: string) => {
      const char = entitySystem.get('character', charId) as any
      return char?.base?.['射精欲'] ?? 0
    },
    setEja: (charId: string, val: number) => {
      const char = entitySystem.get('character', charId) as any
      if (char?.base) char.base['射精欲'] = Math.max(0, val)
    },
    getSemenOnBody: (charId: string) => {
      const char = entitySystem.get('character', charId) as any
      return char?.body_semen ?? {}
    },
    absorbSemen: (charId: string, addTime: number = 10) => {
      const char = entitySystem.get('character', charId) as any
      if (!char?.body_semen) return
      for (const partId of [8, 15]) {
        const currentMl = char.body_semen[partId]?.[1] ?? 0
        if (currentMl <= 0) continue
        const maxVol = BODY_PART_MAX_VOLUME[partId] ?? 100
        const hunger = char.base?.['饥饿度'] ?? 0
        const result = calcSemenAbsorb(currentMl, addTime, maxVol, hunger)
        if (!result) continue
        char.body_semen[partId][1] = result.remaining
        char.body_semen[partId][2] = result.newLevel
      }
    },
    resetPenisDirty: () => {
      const player = entitySystem.get('character', '0') as any
      if (player?.dirty?.penis_dirty_dict) player.dirty.penis_dirty_dict.semen = false
    },
  })
}

// 注释：射精量计算——对齐 erArk ejaculation_panel.py
// 所有乘数累乘，最后 × ±20% 浮动
function calcSemenAmount(char: any, level: string): number {
  const baseMap: Record<string, number> = { small: 10, normal: 20, strong: 50 }
  let amount = baseMap[level] ?? 20

  const endure = char.h_state?.endure_not_shoot_count ?? 0
  amount *= (endure + 1)

  const shotInHSession = char.h_state?.shoot_semen_amount ?? 0
  if (shotInHSession === 0) amount *= 2

  if (char.h_state?.used_semen_energy_agent) amount *= 2

  const extra = char.base?.['额外精液量'] ?? 0
  if (extra >= 100) amount *= 2

  if (char.h_state?.thick_semen) amount *= 2

  // TODO: 目标榨精能力调整——ability[77]（榨精）
  // TODO: 精液存量检查——不超出 semen_point + extra_semen_point

  amount *= 0.8 + Math.random() * 0.4
  return Math.max(1, Math.floor(amount))
}

// 注释：精液追踪——对齐 erArk 索引：[0]=未使用, [1]=当前量, [2]=等级, [3]=总量
// 等级使用 erArk 百分位阈值公式
// 自动填充中文名别名（如 body_semen.阴道 = body_semen.6），让条件表达式支持
//   selected.body_semen.阴道.1 > 50  代替 selected.body_semen.6.1 > 50
function trackSemen(char: any, positionId: number, amount: number): void {
  if (!char.body_semen) char.body_semen = {}
  const existing = char.body_semen[positionId]
  if (existing) {
    existing[1] = (existing[1] ?? 0) + amount
    existing[3] = (existing[3] ?? 0) + amount
  } else {
    char.body_semen[positionId] = [0, amount, 0, amount]
    // 注释：同时注册中文名别名（如 body_semen['阴道'] = body_semen[6]）
    for (const [name, cid] of Object.entries(BODY_PART_CID)) {
      if (cid === positionId) {
        char.body_semen[name] = char.body_semen[positionId]
        break
      }
    }
  }
  // 注释：等级用 erArk 百分位公式（含阈值 L1=1% L5=20%+每15%+1）
  recalcSemenLevel(char, positionId)
  if (char.h_state) {
    char.h_state.shoot_semen_amount = (char.h_state.shoot_semen_amount ?? 0) + amount
  }
}
