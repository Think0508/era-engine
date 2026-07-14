// 注释：h-core 插件——核心入口

import type { PluginContext } from '../../core/types'
import { createHState } from './types'
import type { H_STATE, BodyItemSlot } from './types'
import { effectTypeRegistry } from '../../core/effect-type-registry'
import { entitySystem } from '../../core/entity-system'
import { eventBus } from '../../core/event-bus'
import { gameContext } from '../../core/game-context'
import { narrativeLog } from '../../core/narrative-log'
import type { CommandDef } from '../../core/command-registry'
import { premiseRegistry } from '../../core/premise-registry'
import { registerHPremises } from './premise/premise-h'
import { registerTargetPremises } from './premise/premise-target'
import { registerFallPremises } from './premise/premise-fall'
import { registerClothingPremises } from './premise/premise-clothing'
import { registerBodyItemPremises } from './premise/premise-body-item'
import { registerInstructPremises } from './premise/premise-instruct'
import { loadHInstructions } from './h-instruction-loader'
import { loadInstructions } from '../instruction-loader'
import { calcFavorability, getFavorabilityLevel, getTrustLevel } from './settle/favorability'
import { calcStateChange } from './settle/state'
import { calcTrust } from './settle/trust'
import { calcJudge } from './settle/judge'
import { calcHpMpChange } from './settle/hp-mp'
import { getLevel } from '../../core/entity-utils'
import { checkOrgasm } from './settle/orgasm'
import { modLoader } from '../../core/mod-loader'
import { apiSystem } from '../../core/api'
import { ATTR, getEntityAttr, setEntityAttr } from '../../core/entity-utils'
import { registerNoSaveMode } from '../../core/save-system'

export function onLoad(_ctx: PluginContext): void {
  // 注释：judge_check——实行判定（公式#3），在效果前运行
  // 结果存 execCtx._judgeResult，settle_* 效果跳过 retreated
  effectTypeRegistry.register('judge_check', async (_p: any, execCtx: any) => {
    const targetIds = execCtx._targetIds as string[]
    const judgeBase = _p.base ?? 0
    let bonus = 0
    // 注释：时停修正 +9999（可选 API，未注册时不生效）
    try { if (await apiSystem.call('h-time-stop', 'isActive')) bonus += 9999 } catch { }
    for (const id of targetIds) {
      const char = entitySystem.get('character', id) as any
      const f = char?.base?.好感度 ?? 0
      const t = char?.base?.信赖度 ?? 0
      const r = calcJudge(judgeBase + bonus, f, t, id)
      execCtx._judgeResult = r
      if (r.retreated) {
        narrativeLog.write(`${char?.name ?? id} 退缩了`, 'dialogue', 'h-core')
      }
    }
    return true
  })

  function canApply(ctx: any): boolean {
    const r = ctx._judgeResult
    return !r?.retreated
  }

  effectTypeRegistry.register('settle_favorability', (_p: any, execCtx: any) => {
    if (!canApply(execCtx)) return true
    const ids = execCtx._targetIds as string[]
    const tc = execCtx._timeCost ?? _p.base ?? 10
    for (const id of ids) {
      const r = calcFavorability(id, tc)
      if (r !== 0) execCtx.settlement.applyChange(id, ATTR.FAVORABILITY, r)
    }
    return true
  })

  effectTypeRegistry.register('settle_trust', (_p: any, execCtx: any) => {
    if (!canApply(execCtx)) return true
    const ids = execCtx._targetIds as string[]
    const tc = execCtx._timeCost ?? 10
    for (const id of ids) {
      const r = calcTrust(tc, 0)
      if (r > 0) execCtx.settlement.applyChange(id, ATTR.TRUST, r)
    }
    return true
  })

  effectTypeRegistry.register('settle_state', (_p: any, execCtx: any) => {
    if (!canApply(execCtx)) return true
    const ids = execCtx._targetIds as string[]
    const hc = (modLoader.getMod()?.hConfig as any) ?? {}
    const tbl = hc.ability_lv_adjust ?? [1.0, 1.1, 1.25, 1.4, 1.6, 1.8, 2.1, 2.4, 2.8, 3.2, 4.0]
    const tc = execCtx._timeCost ?? 10
    const bv = _p.baseValue ?? 30
    const base = tc + bv
    // 注释：确定使用哪个能力等级——优先 _p.ability_level，其次查 hConfig.state_ability 映射，最后使用 state 同名
    const stateAbility = (hc.state_ability as Record<string, string>) ?? {}
    const abilityKey = _p.ability_level ?? stateAbility[_p.state] ?? _p.state
    for (const id of ids) {
      const ch = entitySystem.get('character', id) as any
      const al = ch?.abilities?.[abilityKey]?.level ?? 0
      const raw = calcStateChange(base, al, tbl)
      const fv = _p.negate ? -raw : raw
      if (fv !== 0) execCtx.settlement.applyChange(id, _p.state, fv)
    }
    return true
  })

  // 注释：settle_hp_mp——体力气力变化（公式#7），精确复刻 erArk common_default.py
  // 参数: { hpValue=-1, mpValue=0, degree=0, addTime? }
  // hpValue/mpValue: -1=程度减少, 1=程度增加, 其他=固定值
  // degree: 0=少(HP1/MP3·分), 1=中(HP3/MP6·分), 2=大(HP5/MP10·分)
  effectTypeRegistry.register('settle_hp_mp', async (_p: any, execCtx: any) => {
    const ids = execCtx._targetIds as string[]
    const addTime = execCtx._timeCost ?? _p.addTime ?? 10
    const hpValue = _p.hpValue ?? -1
    const mpValue = _p.mpValue ?? 0
    const degree = _p.degree ?? 0
    const isGroupSex = await apiSystem.call('h-group-sex', 'isActive').catch(() => false)
    for (const id of ids) {
      const ch = entitySystem.get('character', id) as any
      if (!ch?.base) continue
      const input: HpMpInput = {
        charId: id, addTime, hpValue, mpValue, degree,
        hpMax: ch.base['体力上限'] ?? 99999,
        mpMax: ch.base['气力上限'] ?? 99999,
        currentHp: ch.base['体力'] ?? 0,
        currentMp: ch.base['气力'] ?? 0,
        isGroupSex, isPlayer: id === 'player' || id === '0',
        isDead: ch.dead ?? false, isTimeStop: false,
      }
      const result = calcHpMpChange(input)
      if (!result.self) continue
      if (result.self.hp !== 0) execCtx.settlement.applyChange(id, '体力', result.self.hp)
      if (result.self.mp !== 0) execCtx.settlement.applyChange(id, '气力', result.self.mp)
      if (result.self.hpCritical) eventBus.emit('character:hp_critical', { characterId: id })
    }
    return true
  })

  // 注释：tech_adjust——体技修正的部位快感/欲情（erArk TECH_ADD_*: default.py:7864-7970）
  // erArk 公式:
  //   部位快感: (add_time + baseValue) × sqrt(getAbilityAdj[发起者.技巧] × getAbilityAdj[目标.部位感度])
  //   欲情:     (add_time + baseValue) × sqrt(getAbilityAdj[目标.部位感度] × getAbilityAdj[目标.欲情感度])
  // 注意: 欲情的 "体技" 系数用的是目标该部位的感度，不是发起者的技巧！
  // 参数: { part: "皮肤|胸部|阴蒂|阴道|肛肠|尿道|子宫|口喉", baseValue?: 50 }
  effectTypeRegistry.register('tech_adjust', (_p: any, execCtx: any) => {
    const ids = execCtx._targetIds as string[]
    const tc = execCtx._timeCost ?? 10
    const bv = _p.baseValue ?? 50
    const base = tc + bv
    const hc = (modLoader.getMod()?.hConfig as any) ?? {}
    const tbl = hc.ability_lv_adjust ?? [1.0, 1.1, 1.25, 1.4, 1.6, 1.8, 2.1, 2.4, 2.8, 3.2, 4.0]

    for (const id of ids) {
      const target = entitySystem.get('character', id) as any
      if (!target) continue
      const initId = execCtx.sourceId
      const initiator = initId ? entitySystem.get('character', initId) as any : null

      if (_p.part) {
        // 注释：发起者的技巧 ability[30]
        const techLv = initiator?.abilities?.['技巧']?.level ?? 0
        const techAdj = tbl[Math.min(techLv, 10)] ?? 4.0
        // 注释：目标的部位感度 ability[part_id]
        const feelLv = target?.abilities?.[_p.part]?.level ?? 0
        const feelAdj = tbl[Math.min(feelLv, 10)] ?? 4.0
        // 注释：部位快感 = base × sqrt(techAdj × feelAdj)
        const feel = Math.floor(base * Math.sqrt(techAdj * feelAdj))
        if (!target.base) target.base = {}
        target.base[_p.part] = Math.min(99999, (target.base[_p.part] ?? 0) + feel)
        // 注释：欲情 = base × sqrt(目标.部位感度 × 目标.欲情感度)
        // erArk: 第二个 ability_level = target_data.ability[part_id](不是技巧)
        const lustFeelLv = target?.abilities?.['欲情']?.level ?? 0
        const lustFeelAdj = tbl[Math.min(lustFeelLv, 10)] ?? 4.0
        const lust = Math.floor(base * Math.sqrt(feelAdj * lustFeelAdj))
        if (!target.base) target.base = {}
        target.base[ATTR.AROUSAL] = Math.min(99999, (target.base[ATTR.AROUSAL] ?? 0) + lust)
      }
    }
    return true
  })

  effectTypeRegistry.register('h_start_h', async (_p: any, execCtx: any) => {
    const allyId = execCtx.sourceId
    const targetId = _p.targetId ?? execCtx._targetIds?.[0]
    if (!allyId || !targetId) return
    // 注释：H 开始时自动脱 auto_off 槽位（胸罩/内裤等）
    autoClothOff(allyId)
    autoClothOff(targetId)
    await startHScene(allyId, targetId)
    return true
  })

  effectTypeRegistry.register('h_end_h', async (_p: any, execCtx: any) => {
    const allyId = execCtx.sourceId
    if (allyId) await endHScene(allyId)
    return true
  })

  // 注释：cloth_remove——H 中脱衣（equipment → equipment_off）
  effectTypeRegistry.register('cloth_remove', (_p: any, execCtx: any) => {
    const ids = execCtx._targetIds as string[]
    for (const id of ids) {
      const ch = entitySystem.get('character', id) as any
      if (!ch) continue
      const slot = _p.slot as string
      if (!ch.equipment?.[slot]) continue
      if (!ch.equipment_off) ch.equipment_off = {}
      ch.equipment_off[slot] = ch.equipment[slot]
      delete ch.equipment[slot]
    }
    return true
  })

  // 注释：cloth_wear——H 中穿衣（equipment_off → equipment）
  effectTypeRegistry.register('cloth_wear', (_p: any, execCtx: any) => {
    const ids = execCtx._targetIds as string[]
    for (const id of ids) {
      const ch = entitySystem.get('character', id) as any
      if (!ch) continue
      const slot = _p.slot as string
      if (!ch.equipment_off?.[slot]) continue
      if (!ch.equipment) ch.equipment = {}
      ch.equipment[slot] = ch.equipment_off[slot]
      delete ch.equipment_off[slot]
    }
    return true
  })

  // 注释：cloth_remove_all——全裸
  effectTypeRegistry.register('cloth_remove_all', (_p: any, execCtx: any) => {
    const ids = execCtx._targetIds as string[]
    const mod = modLoader.getMod()
    const autoSlots = new Set(mod?.equipmentSlots?.filter(s => s.removable).map(s => s.id) ?? [])
    for (const id of ids) {
      const ch = entitySystem.get('character', id) as any
      if (!ch?.equipment) continue
      if (!ch.equipment_off) ch.equipment_off = {}
      for (const [slot, item] of Object.entries(ch.equipment) as [string, any][]) {
        if (autoSlots.has(slot)) {
          ch.equipment_off[slot] = item
          delete ch.equipment[slot]
        }
      }
    }
    return true
  })

  // 注释：cloth_wear_all——全部穿回
  effectTypeRegistry.register('cloth_wear_all', (_p: any, execCtx: any) => {
    const ids = execCtx._targetIds as string[]
    for (const id of ids) {
      const ch = entitySystem.get('character', id) as any
      if (!ch?.equipment_off) continue
      if (!ch.equipment) ch.equipment = {}
      for (const [slot, item] of Object.entries(ch.equipment_off) as [string, any][]) {
        ch.equipment[slot] = item
      }
      ch.equipment_off = {}
    }
    return true
  })

  // 注释：cloth_set_visible——设置某槽位可见性
  effectTypeRegistry.register('cloth_set_visible', (_p: any, execCtx: any) => {
    const ids = execCtx._targetIds as string[]
    for (const id of ids) {
      const ch = entitySystem.get('character', id) as any
      if (!ch) continue
      if (!ch.equipment_visible) ch.equipment_visible = {}
      ch.equipment_visible[_p.slot as string] = _p.visible ?? true
    }
    return true
  })

  effectTypeRegistry.register('h_state_change', (_p: any, execCtx: any) => {
    const ids = execCtx._targetIds as string[]
    for (const id of ids) execCtx.settlement.applyChange(id, _p.statusId, _p.value)
    return true
  })

  effectTypeRegistry.register('h_orgasm_check', (_p: any, execCtx: any) => {
    const ids = execCtx._targetIds as string[]
    const pt = _p.partId ?? 0
    for (const id of ids) {
      const ch = entitySystem.get('character', id) as any
      if (!ch?.h_state) continue
      const hs = ch.h_state as H_STATE
      const sv = ch.base?.[_p.statusKey] ?? 0
      const r = checkOrgasm(pt, sv, hs.orgasm_level[pt] ?? 0)
      if (r) {
        if (!hs.orgasm_count[pt]) hs.orgasm_count[pt] = [0, 0]
        hs.orgasm_count[pt][0]++; hs.orgasm_count[pt][1]++
        if (!hs.orgasm_level[pt]) hs.orgasm_level[pt] = 0
        hs.orgasm_level[pt]++
        narrativeLog.write(`${ch.name || id} ${r.level} 绝顶！`, 'dialogue', 'h-core')
        eventBus.emit('h:orgasm', { character: id, partId: pt, level: r.level })
      }
    }
    return true
  })

  effectTypeRegistry.register('h_experience', (_p: any, execCtx: any) => {
    const ids = execCtx._targetIds as string[]
    for (const id of ids) {
      const ch = entitySystem.get('character', id) as any
      if (!ch) continue
      if (!ch.experience) ch.experience = {}
      ch.experience[_p.expId] = (ch.experience[_p.expId] ?? 0) + (_p.value ?? 1)
    }
    return true
  })

  // ═══════════════════════════════════════════════════════════
  // H 药物效果——精准复刻 erArk 公式
  // ═══════════════════════════════════════════════════════════

  // 注释：润滑液——TARGET_ADD_HUGE_LUBRICATION (效果1001)
  // 公式：润滑 += min(99999, 10000 - floor(当前 * 0.1))
  effectTypeRegistry.register('apply_lubricant', (_p: any, execCtx: any) => {
    for (const id of execCtx._targetIds as string[]) {
      const ch = entitySystem.get('character', id) as any
      if (!ch?.base) continue
      const cur = ch.base['润滑'] ?? 0
      ch.base['润滑'] = Math.min(99999, cur + (10000 - Math.floor(cur * 0.1)))
    }
    return true
  })

  // 注释：媚药——TARGET_ADD_HUGE_DESIRE_AND_SUBMIT (效果1002)
  // 公式：欲情 += min(99999, 10000 - floor(当前 * 0.016))
  //       屈服 += min(99999, 10000 - floor(当前 * 0.016))
  //       desire_point = 100（满值）
  effectTypeRegistry.register('apply_aphrodisiac', (_p: any, execCtx: any) => {
    for (const id of execCtx._targetIds as string[]) {
      const ch = entitySystem.get('character', id) as any
      if (!ch?.base) continue
      const curD = ch.base[ATTR.AROUSAL] ?? 0
      ch.base[ATTR.AROUSAL] = Math.min(99999, curD + (10000 - Math.floor(curD * 0.016)))
      const curS = ch.base[ATTR.OBEDIENCE] ?? 0
      ch.base[ATTR.OBEDIENCE] = Math.min(99999, curS + (10000 - Math.floor(curS * 0.016)))
      // 注释：desire_point 满值
      if (!ch.desire_point) ch.desire_point = 0
      ch.desire_point = Math.min(100, (ch.desire_point ?? 0) + 100)
    }
    return true
  })

  // 注释：灌肠液——TARGET_ENEMA (效果1003) —— 完整复刻 erArk item_effect.py:1231

  // 注释：一次性玩具（跳蛋/按摩棒）——即时快感
  // params: part (部位), base (基础快感)
  effectTypeRegistry.register('apply_instant_toy', (_p: any, execCtx: any) => {
    const ids = execCtx._targetIds as string[]
    const part = (_p.part as string) ?? 'clit'
    const base = (_p.base as number) ?? 50
    for (const id of ids) {
      const ch = entitySystem.get('character', id) as any
      if (!ch?.base) continue
      ch.base[part] = (ch.base[part] ?? 0) + base
    }
    return true
  })

  // ═══════════════════════════════════════════════════════════
  // body_item 效果
  // ═══════════════════════════════════════════════════════════

  // 注释：body_item_equip——装备到身体物品槽
  // 从 sourceId 背包扣除，设 target 的 body_items[slot]
  effectTypeRegistry.register('body_item_equip', async (_p: any, execCtx: any) => {
    const slot = (_p.slot as number) ?? -1
    if (slot < 0) return true
    const itemId = execCtx._itemId ?? execCtx.sourceItemId
    // 注释：扣 source 背包
    const srcId = execCtx.sourceId
    if (srcId && itemId) {
      try { await apiSystem.call('inventory', 'removeItem', srcId, itemId, 1) } catch { }
    }
    // 注释：设 target 的 body_items[slot]
    for (const id of execCtx._targetIds as string[]) {
      const ch = entitySystem.get('character', id) as any
      if (!ch) continue
      if (!ch.body_items) ch.body_items = {}
      const itemDef = (modLoader.getMod()?.items as any)?.[itemId ?? ''] as any
      const slotData: BodyItemSlot = {
        itemId: itemId ?? '',
        active: true,
      }
      if (itemDef?.duration) {
        const ct = gameContext.getContext().time
        slotData.expiry = ct.hour * 60 + ct.minute + itemDef.duration
      }
      ch.body_items[String(slot)] = slotData
      eventBus.emit('character:changed', { id })
    }
    return true
  })

  // 注释：body_item_unequip——卸下身体物品
  effectTypeRegistry.register('body_item_unequip', (_p: any, execCtx: any) => {
    const slot = (_p.slot as number) ?? -1
    if (slot < 0) return true
    for (const id of execCtx._targetIds as string[]) {
      const ch = entitySystem.get('character', id) as any
      if (!ch?.body_items) continue
      delete ch.body_items[String(slot)]
      eventBus.emit('character:changed', { id })
    }
    return true
  })

  // 注释：body_item_clear_all——清除所有 body_item（H 结束用）
  effectTypeRegistry.register('body_item_clear_all', (_p: any, execCtx: any) => {
    for (const id of execCtx._targetIds as string[]) {
      const ch = entitySystem.get('character', id) as any
      if (!ch?.body_items) continue
      ch.body_items = {}
      eventBus.emit('character:changed', { id })
    }
    return true
  })

  // ═══════════════════════════════════════════════════════════
  // 震动棒系统——档位控制 + 每次行动后 tick
  // ═══════════════════════════════════════════════════════════

  // 注释：vibrator_set——设置震动棒档位 0-3
  effectTypeRegistry.register('vibrator_set', (_p: any, execCtx: any) => {
    const level = (_p.level as number) ?? 0
    for (const id of execCtx._targetIds as string[]) {
      const ch = entitySystem.get('character', id) as any
      if (ch?.h_state) ch.h_state.sex_toy_level = Math.max(0, Math.min(3, level))
    }
    return true
  })

  effectTypeRegistry.register('vibrator_up', (_p: any, execCtx: any) => {
    for (const id of execCtx._targetIds as string[]) {
      const ch = entitySystem.get('character', id) as any
      if (ch?.h_state && ch.h_state.sex_toy_level < 3) ch.h_state.sex_toy_level++
    }
    return true
  })

  effectTypeRegistry.register('vibrator_down', (_p: any, execCtx: any) => {
    for (const id of execCtx._targetIds as string[]) {
      const ch = entitySystem.get('character', id) as any
      if (ch?.h_state && ch.h_state.sex_toy_level > 0) ch.h_state.sex_toy_level--
    }
    return true
  })

  // 注释：body_item_tick——每次 H 行动后触发，遍历 active body_item 产生持续快感
  // erArk SecondEffect 公式：
  //   toy_adjust = sex_toy_level × 0.5
  //   adjust = getAbilityAdjust(part_ability_lv)
  //   pleasure = tick_base × adjust × toy_adjust
  effectTypeRegistry.register('body_item_tick', (_p: any, execCtx: any) => {
    const ids = execCtx._targetIds as string[]
    const mod = modLoader.getMod()
    const adjTable = (mod?.hConfig as any)?.ability_lv_adjust ?? [1.0, 1.1, 1.25, 1.4, 1.6, 1.8, 2.1, 2.4, 2.8, 3.2, 4.0]
    const getAdj = (lv: number) => adjTable[Math.min(Math.max(0, lv), 10)] ?? 4.0

    for (const id of ids) {
      const ch = entitySystem.get('character', id) as any
      if (!ch?.body_items || !ch.h_state) continue
      const toyLevel = ch.h_state.sex_toy_level ?? 0
      if (toyLevel <= 0) continue
      const toyAdj = toyLevel * 0.5

      for (const slotData of Object.values(ch.body_items) as BodyItemSlot[]) {
        if (!slotData.active) continue
        const itemDef = (mod?.items as any)?.[slotData.itemId]
        const tickPart = (itemDef as any)?.tick_part
        if (!tickPart) continue
        const tickBase = (itemDef as any)?.tick_base ?? 20
        const abLv = ch.abilities?.[tickPart.ability]?.level ?? 0
        const abAdj = getAdj(abLv)
        const pleasure = Math.floor(tickBase * abAdj * toyAdj)
        if (pleasure > 0) {
          if (!ch.base) ch.base = {}
          for (const pName of (tickPart.params as string[]) ?? []) {
            ch.base[pName] = Math.min(99999, (ch.base[pName] ?? 0) + pleasure)
          }
        }
      }
    }
    return true
  })
}

export function onEnable(ctx: PluginContext): void {
  registerNoSaveMode('h_scene')
  registerHPremises(premiseRegistry)
  registerTargetPremises(premiseRegistry)
  registerFallPremises(premiseRegistry)
  registerClothingPremises(premiseRegistry)
  registerBodyItemPremises(premiseRegistry)
  registerInstructPremises(premiseRegistry)

  // 注释：每次 H 行动后自动触发 body_item_tick
  ctx.events.on('game:execution_end', async () => {
    const mode = gameContext.getCurrentMode()
    if (mode !== 'h_scene') return
    const inH: string[] = []
    for (const ch of entitySystem.getAll('character')) {
      const c = ch as any
      if (c.h_state?.is_h) inH.push(c.id)
    }
    if (inH.length === 0) return
    // 注释：对每个 H 中角色应用 body_item_tick
    await apiSystem.call('effect-system', 'execute', [{ type: 'body_item_tick', params: { target: 'self' } }], {
      sourceId: inH[0],
      _targetIds: inH,
    })
  })

  ctx.api.register('h-core', {
    evaluatePremises: (premises: string[], evalCtx: any) => premiseRegistry.evaluate(premises, evalCtx),
    startHScene, endHScene, getLevel, calcFavorability, calcTrust, calcJudge,
    getFavorabilityLevel, getTrustLevel,
    registerPremise: (id: string, handler: any) => premiseRegistry.register(id, handler),
  })

  loadHInstructions()
  loadInstructions()

  const doHCmd: CommandDef = {
    id: 'do_h', label: '邀请H', group: 'character_commands',
    modes: ['exploration'], priority: 80, timeCost: 10,
    condition: 'premises:HAVE_TARGET,NOT_H,T_NORMAL,SCENE_ONLY_TWO,TIRED_LE_74',
    source: 'plugin:h-core',
    handler: async (execCtx: any) => {
      const s = execCtx?.uiStore?.selectedCharacterId
      const p = execCtx?.gameStore?.player?.id
      if (s && p) await startHScene(p, s)
    },
  }
  ctx.commands.register(doHCmd)

  const endHCmd: CommandDef = {
    id: 'end_h', label: '结束H', group: 'character_commands',
    modes: ['h_scene'], priority: 1, source: 'plugin:h-core',
    handler: async (execCtx: any) => {
      const p = execCtx?.gameStore?.player?.id
      if (p) await endHScene(p)
    },
  }
  ctx.commands.register(endHCmd)
}

async function startHScene(allyId: string, targetId: string): Promise<void> {
  const t = entitySystem.get('character', targetId) as any
  if (!t) return
  t.h_state = createHState()
  const a = entitySystem.get('character', allyId) as any
  if (a) a.h_state = createHState()
  await gameContext.enterMode('h_scene')
  await eventBus.emit('h:start', { ally: allyId, target: targetId })
  narrativeLog.write('开始 H', 'dialogue', 'h-core')
}

async function endHScene(allyId: string): Promise<void> {
  for (const ch of entitySystem.getAll('character')) {
    const c = ch as any
    if (c.h_state?.is_h) {
      c.h_state = undefined
      // 注释：H 结束自动穿回 equipment_off → equipment
      if (c.equipment_off) {
        if (!c.equipment) c.equipment = {}
        for (const [slot, item] of Object.entries(c.equipment_off) as [string, any][]) {
          c.equipment[slot] = item
        }
        c.equipment_off = {}
      }
      // 注释：H 结束自动清理 body_auto_remove=h_end 的 body_item
      if (c.body_items) {
        const mod = modLoader.getMod()
        for (const [slotKey, slotData] of Object.entries(c.body_items) as [string, any][]) {
          const sd = slotData as BodyItemSlot
          if (sd.active) {
            const itemDef = (mod?.items as any)?.[sd.itemId] as any
            if (itemDef?.body_auto_remove === 'h_end') {
              delete c.body_items[slotKey]
            }
          }
        }
      }
    }
  }
  await gameContext.exitMode()
  await eventBus.emit('h:end', { ally: allyId })
  narrativeLog.write('结束 H', 'dialogue', 'h-core')
}

// 注释：H 开始时自动脱 auto_off 槽位（胸罩/内裤），但跳过饰品 (cloth_tag=6)
function autoClothOff(charId: string): void {
  const ch = entitySystem.get('character', charId) as any
  if (!ch) return
  const mod = modLoader.getMod()
  const autoSlots = mod?.equipmentSlots?.filter(s => (s as any).auto_off).map(s => s.id) ?? []
  for (const slot of autoSlots) {
    if (ch.equipment?.[slot]) {
      const itemId = ch.equipment[slot]
      const itemDef = mod?.items[itemId] as any
      // 注释：饰品（cloth_tag=6）不自动脱
      if (itemDef?.cloth_tag === 6) continue
      if (!ch.equipment_off) ch.equipment_off = {}
      ch.equipment_off[slot] = ch.equipment[slot]
      delete ch.equipment[slot]
    }
  }
}
