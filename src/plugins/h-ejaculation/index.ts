// 注释：h-ejaculation 插件——射精系统，完全对齐 erArk
// - 射精积累：二段结算 ADD_SMALL_P_FEEL（Second_effect.py:657-679 + 04-射精系统.md:50-54）——
//   每次 P 部位快感产生时 eja_point += 100 + int(eja_point×0.4)；由 h-core orgasmJudge
//   读 pending_orgasm_feel[3] 后经本插件 API（getEja/addEja）写入（2026-08-08 重构：
//   原内联在 h-core tech_adjust/settle_state 的 (tc+50)×技巧+P快/8 公式已废弃——来源不明）
// - eja_climax: 射精判定 + 忍耐判定 + 避孕套检查 + 射精量公式
// - eja_shoot: 直接射精量计算（TOML 手动触发）
// - absorbSemen: 精液吸收（对齐 realtime_settle.py:231-260）
// - penis_dirty_dict: 玩家阴茎精液污浊追踪

import { conditionEngine } from '../../core/condition-engine'
import type { PluginContext, GameContext, EntityData } from '../../core/types'
import { effectTypeRegistry } from '../../core/effect-type-registry'
import { entitySystem } from '../../core/entity-system'
import { ATTR } from '../../core/entity-utils'
import { eventBus } from '../../core/event-bus'
import { narrativeLog } from '../../core/narrative-log'
import { apiSystem } from '../../core/api'
import { gameContext, gameTimeToTotalMinutes, isPlayerChar } from '../../core/game-context'
import { modLoader } from '../../core/mod-loader'
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
  return { absorbed: absorb, remaining, newLevel, newHunger }
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

// 注释：射精欲增加时写上次增加时间（B6 修复，audit-b I5）——
// erArk add_eaj 语义：last_eaj_add_time 在射精欲增加时写入，30 分钟消退门控依赖此字段
function touchLastEajAddTime(char: any): void {
  if (!char) return
  if (!char.action_info) char.action_info = {}
  char.action_info.last_eaj_add_time = gameTimeToTotalMinutes(gameContext.getContext().time)
}

export function onLoad(_ctx: PluginContext): void {
  // 注释：射精积累由 h-core orgasmJudge 二段结算处理（ADD_SMALL_P_FEEL 公式，经本插件 API 写入）——
  // 见文件头注释；TOML 如需手动增加射精欲可用 addEja API 或 h_experience 类效果

  // 注释：射精判定 + 玩家阴茎污浊追踪（对齐 erArk orgasm_judge 射精分支 + common_ejaculation）
  effectTypeRegistry.register('eja_climax', (params: any, ctx: any) => {
    const targetIds = ctx._targetIds as string[]
    for (const id of targetIds) {
      const char = entitySystem.get('character', id) as any
      if (!char?.base) continue
      const eja = char.base[ATTR.EJA_GAUGE] ?? 0
      const ejaMax = char.base[ATTR.EJA_GAUGE_MAX] ?? 1000
      if (eja < ejaMax) continue
      char.base[ATTR.EJA_GAUGE] = 0
      // 注释：忍耐射精判定（erArk show_endure_ejaculation_panel）
      // 概率: now_count <= 技巧 → 100%；超出后 rate = 100 - over×(50 - 技巧×5)，下限 0
      // 手动弹窗模式（系统设置11==2）未实现（依赖 UI 弹窗），默认自动概率判定
      const endureCount = char.h_state?.endure_not_shoot_count ?? 0
      const techLv = char.abilities?.[ATTR.TECHNIQUE]?.level ?? 0
      let endureRate = 100
      if (endureCount > techLv) {
        const downRate = 50 - techLv * 5
        endureRate = 100 - (endureCount - techLv) * downRate
        endureRate = Math.max(0, endureRate)
      }
      // 忍住的结算（erArk：endure_not_shoot_count+1，eja_point=0，本次不射精）
      if (Math.random() * 100 <= endureRate) {
        if (char.h_state) {
          char.h_state.endure_not_shoot_count = (char.h_state.endure_not_shoot_count ?? 0) + 1
        }
        narrativeLog.write(`${char.name} 忍住了射精`, 'dialogue', 'h-ejaculation')
        continue
      }
      // 射出——按忍耐次数决定强度（erArk：0→small, ≥4→strong, 其他→normal）
      const level = endureCount === 0 ? 'small' : (endureCount >= 4 ? 'strong' : 'normal')
      const semenResult = calcSemenAmount(char, level)
      // 精液≤2 → 只流前列腺液，射精流程完全不走（erArk common_ejaculation 直接 return）
      if (semenResult.noSemen) {
        narrativeLog.write(`${char.name} 只流出了些许前列腺液，已经射不出精液了`, 'system', 'h-ejaculation')
        if (char.h_state) char.h_state.endure_not_shoot_count = 0
        continue
      }
      const hasCondom = char.body_items?.['13']?.active === true
      // 注释：确定被射者（erArk ejaculation_flow：精液记到 target_character_id，无目标时记自己）
      const targetId = char.h_state?.target_character_id ?? id
      const targetChar = entitySystem.get('character', targetId) as any
      if (hasCondom) {
        const hstate = char.h_state
        if (hstate) {
          hstate.condom_count[0]++
          hstate.condom_count[1] += semenResult.amount
        }
        delete char.body_items['13']
        narrativeLog.write(`${char.name} 射精了！(避孕套 ${semenResult.amount}ml)`, 'system', 'h-ejaculation')
        eventBus.emit('h:shoot', { character: id, target: targetId, amount: semenResult.amount, position: params.positionId, condom: true })
      } else {
        // 注释：精液记到被射者身上（erArk update_semen_dirty(target_character_id, ...)）
        trackSemen(targetChar ?? char, params.positionId ?? 6, semenResult.amount)
        // 注释：设置被射者的射精部位（erArk update_semen_dirty: shoot_position_body = part_cid）
        if (targetChar?.h_state) {
          targetChar.h_state.shoot_position_body = params.positionId ?? 6
        }
        // 注释：玩家射精 → 设置阴茎精液污浊（erArk ejaculation_panel.py:193）
        if (isPlayerChar(id)) setPenisSemenDirty(char, true)
        narrativeLog.write(`${char.name} 射精了！(${semenResult.amount}ml)`, 'system', 'h-ejaculation')
        eventBus.emit('h:shoot', { character: id, target: targetId, amount: semenResult.amount, position: params.positionId, condom: false })
      }
      // 注释：射精后状态更新（erArk common_ejaculation 尾部）
      // shoot_semen_amount 记射精者（erArk ejaculation_flow）；trackSemen 记被射者的 body_semen，不冲突
      if (char.h_state) {
        const hs = char.h_state
        hs.orgasm_level = hs.orgasm_level ?? {}
        hs.orgasm_level[3] = (hs.orgasm_level[3] ?? 0) + 1  // 射精次数
        hs.just_shoot = 1
        hs.endure_not_shoot_count = 0
        hs.shoot_semen_amount = (hs.shoot_semen_amount ?? 0) + semenResult.amount
        // 注释：射精后重置插入位置（erArk shoot_here: insert_position = part_cid 已由射精面板设置）
        // 我们无射精面板，射精后重置为 -1（erArk ejaculation_flow 尾部重置双方）
        if (hs.insert_position !== undefined) hs.insert_position = -1
        if (targetChar?.h_state && targetChar !== char) {
          if (targetChar.h_state.insert_position !== undefined) targetChar.h_state.insert_position = -1
        }
      }
      // 注释：精液量扣减（erArk：优先扣临时额外精液，再扣基础精液）
      deductSemen(char, semenResult.amount)
      // 注释：每日首射标记 + 上次射精时间（G3 决策 2026-08-09：射精欲自然消退的
      // 30 分钟门控依赖 last_eaj_add_time——erArk realtime_settle.py:144-149；
      // 此前无写入 → 消退无从实现）
      if (char.action_info) {
        char.action_info.day_first_shoot_semen = false
        char.action_info.last_eaj_add_time = gameTimeToTotalMinutes(gameContext.getContext().time)
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
      const result = calcSemenAmount(char, params.level ?? 'normal')
      if (result.noSemen || result.amount <= 0) {
        narrativeLog.write(`${char.name} 射不出精液了`, 'system', 'h-ejaculation')
        continue
      }
      // 精液记到被射者（与 eja_climax 一致）
      const targetId = char.h_state?.target_character_id ?? id
      const targetChar = entitySystem.get('character', targetId) as any
      trackSemen(targetChar ?? char, params.positionId ?? 6, result.amount)
      if (targetChar?.h_state) targetChar.h_state.shoot_position_body = params.positionId ?? 6
      if (isPlayerChar(id)) setPenisSemenDirty(char, true)
      narrativeLog.write(`射精 ${result.amount}ml`, 'system', 'h-ejaculation')
      // 射精后状态更新（2026-08-09 审查修复：与 eja_climax 对齐——原缺精液扣减/
      // just_shoot/day_first_shoot_semen/last_eaj_add_time，未来 B3 指令用上时
      // 射精不扣精液 + G3 射精欲消退永不触发 = 静默失效）
      if (char.h_state) {
        const hs = char.h_state
        hs.orgasm_level = hs.orgasm_level ?? {}
        hs.orgasm_level[3] = (hs.orgasm_level[3] ?? 0) + 1
        hs.just_shoot = 1
        hs.endure_not_shoot_count = 0
        hs.shoot_semen_amount = (hs.shoot_semen_amount ?? 0) + result.amount
        if (hs.insert_position !== undefined) hs.insert_position = -1
        if (targetChar?.h_state && targetChar !== char) {
          if (targetChar.h_state.insert_position !== undefined) targetChar.h_state.insert_position = -1
        }
      }
      deductSemen(char, result.amount)
      if (char.action_info) {
        char.action_info.day_first_shoot_semen = false
        char.action_info.last_eaj_add_time = gameTimeToTotalMinutes(gameContext.getContext().time)
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
  // 注释：玩家阴茎精液污浊前提（2026-08-08 审查修复：原硬编码角色 '0'——
  // 引擎玩家 id 由 meta.toml player_character 决定（如 'player'），查 '0' 恒 undefined → 静默失效）
  // handler 上下文 = 完整 GameContext（ctx.player 即玩家实体）
  conditionEngine.registerPremise('pl_penis_semen_dirty', (pctx: GameContext) => {
    return !!pctx.player?.dirty?.penis_dirty_dict?.semen
  })
  conditionEngine.registerPremise('pl_penis_not_semen_dirty', (pctx: GameContext) => {
    return !pctx.player?.dirty?.penis_dirty_dict?.semen
  })

  // 注释：阴茎大小前提（jj_0~3）——查 actor（行为发起者）的阴茎大小
  // erArk handle_premise_other.py:1912-1966
  // actor = 行为发起者：handler ctx 的 sourceId（talk-common 传 actorId 映射；默认玩家）
  for (let size = 0; size <= 3; size++) {
    const targetSize = size
    conditionEngine.registerPremise(`jj_${size}`, (pctx: GameContext) => {
      const actorId = pctx.sourceId ?? pctx.player?.id ?? null
      const actor = actorId ? entitySystem.get('character', actorId) as any : null
      return (actor?.base?.[ATTR.PENIS_SIZE] ?? 1) === targetSize
    })
  }

  // 注释：阴茎大小写入方（jj_0~3 前提修复，2026-08-13）——角色注册时幂等初始化。
  // 此前全库无写入方（attributes.toml default=1）→ 恒 1 档 → jj_0 地文（1418 条）不可达、
  // jj_1 错误常显（h-ejaculation/index.ts 原半成品标记）。erArk 无权威分布数据可查
  // （宝珠成长系统已砍），采用保守分布假设（文档记录）：0 档 5% / 1 档 55% / 2 档 30% / 3 档 10%。
  // 已有值（存档恢复/其他写入方）跳过，幂等。
  const initPenisSize = (payload: { characters: { id: string; data: EntityData }[] }): void => {
    for (const { data } of payload.characters ?? []) {
      const ch = data as any
      if (!ch || typeof ch !== 'object') continue
      if (ch.base && typeof ch.base[ATTR.PENIS_SIZE] === 'number') continue
      const roll = Math.random()
      const size = roll < 0.05 ? 0 : roll < 0.6 ? 1 : roll < 0.9 ? 2 : 3
      if (!ch.base || typeof ch.base !== 'object') ch.base = {}
      ch.base[ATTR.PENIS_SIZE] = size
    }
  }
  ctx.events.on('character:registered', initPenisSize)
  // 注释：onEnable 时已注册角色补初始化（幂等）
  for (const ch of entitySystem.getAll('character')) {
    initPenisSize({ characters: [{ id: (ch as any).id, data: ch }] })
  }

  // 注：射精欲自然消退只有一条路径——core realtime-settle.settleEjaDecay（行动级，
  // 仅玩家、非 H、距上次射精 >30 分钟、-10/分钟）。曾经的 game:hour_changed 监听
  // 与之重复导致双重衰减（2026-08-15 审查 C1 修复，erArk realtime_settle.py:102-108 语义）

  // 注释：H 每次行动后 → 精液吸收（erArk realtime_settle.py:130-139）
  // 2026-08-15 复查轮 3 I-2：时停守卫——时停中 H 行动推进的时间在 execution_end 回拨，
  // 精液吸收副作用不回滚（冻结世界内精液被吸收，偏离 erArk realtime_settle 时停冻结语义）
  ctx.events.on('game:execution_end', (payload: any) => {
    let tsActive = false
    try { tsActive = !!apiSystem.callSync('h-time-stop', 'isActive') } catch { /* 插件缺失 */ }
    if (tsActive) return
    const mode = gameContext.getCurrentMode()
    if (mode !== 'h_scene') return
    const addTime = payload?.timeCost ?? 10
    for (const ch of entitySystem.getAll('character')) {
      const c = ch as any
      if (!c?.body_semen || !c?.h_state?.is_h) continue
      // 注释：仅 body_part 8(肛) 和 15(胃) 触发吸收（erArk 行为）
      for (const partId of [8, 15]) {
        const currentMl = c.body_semen[partId]?.[1] ?? 0
        if (currentMl <= 0) continue
        const maxVol = BODY_PART_MAX_VOLUME[partId] ?? 100
          const hunger = c.base?.[ATTR.HUNGER] ?? 0
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
      return char?.base?.[ATTR.EJA_GAUGE] ?? 0
    },
    setEja: (charId: string, val: number) => {
      const char = entitySystem.get('character', charId) as any
      if (char?.base) char.base[ATTR.EJA_GAUGE] = Math.max(0, val)
    },
    // 注释：射精欲增加（delta 可为负——非 H 衰减走本 API 的减法语义）
    // 射精欲字段的唯一写入口（h-core 结算经此 API 写入，禁止直接改字段）
    // B6：增加时写 last_eaj_add_time（erArk add_eaj 语义——消退门控前提）
    addEja: (charId: string, delta: number) => {
      const char = entitySystem.get('character', charId) as any
      if (char?.base) {
        char.base[ATTR.EJA_GAUGE] = Math.max(0, (char.base[ATTR.EJA_GAUGE] ?? 0) + (delta ?? 0))
        if ((delta ?? 0) > 0) touchLastEajAddTime(char)
      }
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
          const hunger = char.base?.[ATTR.HUNGER] ?? 0
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

// 注释：射精量计算——完整对齐 erArk ejaculation_panel.py common_ejaculation()
// 流程：
//   1. 精液量 ≤ 2ml → 只流出前列腺液，射精量 0（handle_pl_semen_le_2）
//   2. 基础射精量（small=10/normal=20/strong=50，Semen_Shoot_Amount.csv）× 随机权重(0.8~1.2)
//      普通/强射精 × (endure_not_shoot_count + 1)
//   3. 目标榨精调整：× get_ability_adjust(目标.榨精)（ability[77]）
//   4. 每日首射 × 2（action_info.day_first_shoot_semen）
//   5. 精力剂 × 2（h_state.used_semen_energy_agent，用后清零）
//   6. 积攒精液 × 2（semen_point ≥ semen_point_max）
//   7. 浓厚精液 × 2（h_state.thick_semen）
//   8. 射精量 ≤ 剩余精液量
// 注：香薰疗愈（aromatherapy_flag_7）不用（无香薰系统）
interface SemenResult {
  amount: number
  noSemen: boolean  // 精液不足，只流前列腺液
}

function calcSemenAmount(char: any, level: string): SemenResult {
  const baseMap: Record<string, number> = { small: 10, normal: 20, strong: 50 }
  // 1. 精液量 ≤ 2 → 无精液可射
  const semenPoint = char.base?.[ATTR.SEMEN] ?? 0
  const extraSemen = char.base?.[ATTR.EXTRA_SEMEN] ?? 0
  if (semenPoint + extraSemen <= 2) {
    return { amount: 0, noSemen: true }
  }

  // 2. 基础值 × 随机权重
  const randomWeight = 0.8 + Math.random() * 0.4
  let amount = baseMap[level] ?? 20
  if (level !== 'small') {
    const endure = char.h_state?.endure_not_shoot_count ?? 0
    amount = Math.floor(amount * randomWeight) * (endure + 1)
  } else {
    amount = Math.floor(amount * randomWeight)
  }

  // 3. 目标榨精调整（erArk ability[77]；目标无榨精能力 → ×1）
  const targetId = char.target_character_id
  if (targetId) {
    const target = entitySystem.get('character', targetId) as any
    const squeezeLv = target?.abilities?.['榨精']?.level ?? 0
    const hc = (modLoader.getMod()?.hConfig as any) ?? {}
    const tbl = hc.ability_lv_adjust ?? [1.0, 1.1, 1.25, 1.4, 1.6, 1.8, 2.1, 2.4, 2.8, 3.2, 4.0]
    amount *= tbl[Math.min(squeezeLv, 10)] ?? 4.0
  }

  // 4. 每日首射 ×2（erArk action_info.day_first_shoot_semen）
  if (char.action_info?.day_first_shoot_semen) {
    amount *= 2
  }

  // 5. 精力剂 ×2（erArk handle_self_semen_energy_agent，用后清零）
  if (char.h_state?.used_semen_energy_agent) {
    amount *= 2
    char.h_state.used_semen_energy_agent = false
  }

  // 6. 积攒精液 ×2（erArk handle_pl_semen_tmp_ge_max：额外精液量 ≥ 最大精液量）
  if (extraSemen >= (char.base?.[ATTR.SEMEN_MAX] ?? 100)) {
    amount *= 2
  }

  // 7. 浓厚精液 ×2（erArk talent[33] 浓厚精液：睡眠累积满额外精液获得；h_state.thick_semen 兼容旧标记）
  if (char.talents?.['浓厚精液'] || char.h_state?.thick_semen) {
    amount *= 2
  }

  // 8. 不超出剩余精液量（erArk min(semen_count, semen_point + tem_extra_semen_point)）
  amount = Math.min(amount, semenPoint + extraSemen)

  return { amount: Math.max(0, Math.floor(amount)), noSemen: false }
}

// 注释：精液量扣减（erArk common_ejaculation 尾部：优先扣临时额外精液，再扣基础精液）
function deductSemen(char: any, amount: number): void {
  let remaining = amount
  const extraSemen = char.base?.[ATTR.EXTRA_SEMEN] ?? 0
  if (extraSemen > remaining) {
    char.base[ATTR.EXTRA_SEMEN] = extraSemen - remaining
    return
  }
  remaining -= extraSemen
  char.base[ATTR.EXTRA_SEMEN] = 0
  char.base[ATTR.SEMEN] = Math.max(0, (char.base[ATTR.SEMEN] ?? 0) - remaining)
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
  // 注：shoot_semen_amount 是射精者字段（erArk ejaculation_flow），由 eja_climax 统一累加，
  //     trackSemen 只负责被射者的 body_semen 记录，不在此处理
}
