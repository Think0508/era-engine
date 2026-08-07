// 注释：h-core 插件——核心入口

import type { PluginContext } from '../../core/types'
import { createHState } from './types'
import type { BodyItemSlot } from './types'
import { effectTypeRegistry } from '../../core/effect-type-registry'
import { entitySystem } from '../../core/entity-system'
import { eventBus } from '../../core/event-bus'
import { gameContext } from '../../core/game-context'
import { narrativeLog } from '../../core/narrative-log'
import type { CommandDef } from '../../core/command-registry'
import { premiseRegistry } from '../../core/premise-registry'
import { errorReporter } from '../../core/error-reporter'
import { registerHPremises } from './premise/premise-h'
import { registerTargetPremises } from './premise/premise-target'
import { registerFallPremises } from './premise/premise-fall'
import { registerClothingPremises } from './premise/premise-clothing'
import { registerBodyItemPremises } from './premise/premise-body-item'
import { registerInstructPremises } from './premise/premise-instruct'
import { loadInstructions, validateInstructionData } from '../instruction-loader'
import { calcFavorability, getFavorabilityLevel, getTrustLevel } from './settle/favorability'
import { calcStateChange } from './settle/state'
import { calcTrust } from './settle/trust'
import { calcJudge, mergeJudgeResult, type JudgeResult } from './settle/judge'
import { calcHpMpChange, type HpMpInput } from './settle/hp-mp'
import { getLevel } from '../../core/entity-utils'
import { orgasmJudge, accumulateOrgasmFeel, ORGASM_ATTR_TO_PART, insertPositionToBodyCid } from './settle/orgasm'
import { modLoader } from '../../core/mod-loader'
import { apiSystem } from '../../core/api'
import { ATTR } from '../../core/entity-utils'
import { registerNoSaveMode } from '../../core/save-system'
import type { SecondSettleResult } from './settle/orgasm'

// 注释：game:plugins_loaded 监听器只注册一次（onEnable 重复执行时不重复监听）
let hCorePluginsLoadedListener = false

// 注释：处理二段结算结果——输出绝顶/多重绝顶日志与事件（execution_end 与 h_orgasm_check 共用）
function handleOrgasmResults(id: string, ch: any, result: SecondSettleResult): void {
  for (const ev of result.orgasms) {
    const degreeName = ['小', '普通', '强', '超强'][ev.degree] ?? '普通'
    narrativeLog.write(`${ch.name || id} ${degreeName}绝顶！`, 'dialogue', 'h-core')
    eventBus.emit('h:orgasm', { character: id, partId: ev.partId, level: ev.degree, count: ev.count, extra: ev.extra })
  }
  if (result.pluralCount >= 2) {
    narrativeLog.write(`${ch.name || id} 多重绝顶（${result.pluralCount}部位）！`, 'dialogue', 'h-core')
    eventBus.emit('h:plural_orgasm', { character: id, count: result.pluralCount })
  }
}

export function onLoad(_ctx: PluginContext): void {
  // 注释：judge_check——实行判定（公式#3），在效果前运行
  // 结果存 execCtx._judgeResult，settle_* 效果跳过 retreated
  // judge_class → calcJudge 查 hConfig [judge.adjustments] 特殊修正表
  effectTypeRegistry.register('judge_check', async (_p: any, execCtx: any) => {
    const targetIds = execCtx._targetIds as string[]
    const judgeBase = _p.base ?? 0
    const judgeClass = _p.judge_class as string | undefined
    // 注释：空目标 → fail-closed（判定失败 + 警告），禁止"无目标静默通过判定"
    if (!targetIds || targetIds.length === 0) {
      errorReporter.report({
        source: 'h-core',
        severity: 'warning',
        message: `judge_check 无目标角色，判定失败（retreated）`,
        suggestion: '指令的 target 应解析到选中角色；检查 uiStore.selectedCharacterId 是否为空',
      })
      execCtx._judgeResult = { success: false, partial: false, retreated: true }
      return true
    }
    // 注释：判定结果按"最坏者胜出"合并——多目标时任一 retreated 则整组 retreated
    let merged: JudgeResult = { success: true, partial: false, retreated: false }
    let bonus = 0
    // 注释：时停修正 +9999（可选 API——仅"插件未注册"被忽略，其他错误照报）
    try {
      if (await apiSystem.call('h-time-stop', 'isActive')) bonus += 9999
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!msg.includes('h-time-stop') && !msg.includes('未注册')) {
        errorReporter.report({
          source: 'h-core',
          severity: 'error',
          message: `judge_check 查时停状态失败：${msg}`,
        })
      }
    }
    for (const id of targetIds) {
      const char = entitySystem.get('character', id) as any
      const f = char?.base?.好感度 ?? 0
      const t = char?.base?.信赖度 ?? 0
      const r = calcJudge(judgeBase + bonus, f, t, id, judgeClass)
      merged = mergeJudgeResult(merged, r)
      if (r.retreated) {
        narrativeLog.write(`${char?.name ?? id} 退缩了`, 'dialogue', 'h-core')
      }
    }
    execCtx._judgeResult = merged
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
      if (fv !== 0) {
        execCtx.settlement.applyChange(id, _p.state, fv)
        // 注释：部位快感变化量 → 二段结算累积（extra 高潮用，对齐 erArk change_data.status_data）
        const partId = ORGASM_ATTR_TO_PART[_p.state]
        if (partId !== undefined) accumulateOrgasmFeel(ch, partId, fv)
        // 注释：阴茎部位快感 → 射精欲积累（erArk ADD_SMALL_P_FEEL 内嵌 eja_point +=）
        // 公式：now_add_lust = (add_time + 50) × adjust(技巧) + 阴茎快感/8（default.py:8304）
        if (_p.state === '阴茎') {
          const techLv2 = ch?.abilities?.['技巧']?.level ?? 0
          const adjust2 = tbl[Math.min(techLv2, 10)] ?? 4.0
          const penisFeel2 = ch?.base?.['阴茎'] ?? 0
          const nowAddLust = Math.floor((tc + 50) * adjust2 + penisFeel2 / 8)
          if (ch?.base) ch.base['射精欲'] = (ch.base['射精欲'] ?? 0) + nowAddLust
        }
      }
    }
    return true
  })

  // 注释：settle_hp_mp——体力气力变化（公式#7），精确复刻 erArk common_default.py
  // 参数: { hpValue=-1, mpValue=0, degree=0, addTime? }
  // hpValue/mpValue: -1=程度减少, 1=程度增加, 其他=固定值
  // degree: 0=少(HP1/MP3·分), 1=中(HP3/MP6·分), 2=大(HP5/MP10·分)
  effectTypeRegistry.register('settle_hp_mp', async (_p: any, execCtx: any) => {
    // 注释：判定退缩时与 settle_favorability/trust/state 一致，不结算行动耗损
    // （时间流逝的疲劳/饥饿衰减由 realtimeSettle 独立处理，不受此门控影响）
    if (!canApply(execCtx)) return true
    const ids = execCtx._targetIds as string[]
    const addTime = execCtx._timeCost ?? _p.addTime ?? 10
    const hpValue = _p.hpValue ?? -1
    const mpValue = _p.mpValue ?? 0
    const degree = _p.degree ?? 0
    // 注释：群交修正（可选能力——仅"插件未注册"被忽略，真实错误照报）
    let isGroupSex = false
    try {
      isGroupSex = await apiSystem.call('h-group-sex', 'isActive')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!msg.includes('h-group-sex') && !msg.includes('未注册')) {
        errorReporter.report({
          source: 'h-core',
          severity: 'error',
          message: `settle_hp_mp 查群交状态失败：${msg}`,
        })
      }
    }
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
        // 注释：部位快感变化量 → 二段结算累积（extra 高潮用）
        const feelPartId = ORGASM_ATTR_TO_PART[_p.part]
        if (feelPartId !== undefined) accumulateOrgasmFeel(target, feelPartId, feel)
        // 注释：阴茎部位快感 → 射精欲积累（erArk ADD_SMALL_P_FEEL 内嵌 eja_point +=）
        // 公式：now_add_lust = (add_time + 50) × adjust(技巧) + 阴茎快感/8（default.py:8304）
        // 注：同步内联（避免跨插件 async void 乱序）；h-ejaculation 的 eja_add effect 保留供 TOML 手动用
        if (_p.part === '阴茎') {
          const techLv2 = target?.abilities?.['技巧']?.level ?? 0
          const adjust2 = tbl[Math.min(techLv2, 10)] ?? 4.0
          const penisFeel2 = target.base?.['阴茎'] ?? 0
          const nowAddLust = Math.floor((tc + 50) * adjust2 + penisFeel2 / 8)
          target.base['射精欲'] = (target.base['射精欲'] ?? 0) + nowAddLust
        }
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

  // 注释：h_orgasm_check——手动触发二段高潮结算（兼容旧指令；自动结算走 game:execution_end）
  effectTypeRegistry.register('h_orgasm_check', (_p: any, execCtx: any) => {
    const ids = execCtx._targetIds as string[]
    for (const id of ids) {
      const ch = entitySystem.get('character', id) as any
      if (!ch?.h_state) continue
      // 注释：extra 累积走 pending_orgasm_feel（settle_state/tech_adjust 已写入）；statusDelta 兼容参数已弃用
      const result = orgasmJudge(id)
      handleOrgasmResults(id, ch, result)
      // 注释：玩家射精触发（与 execution_end 一致）
      if (result.shouldEjaculate && (id === '0' || id === 'player')) {
        if (effectTypeRegistry.has('eja_climax')) {
          void apiSystem.call('effect-system', 'execute', [
            { type: 'eja_climax', params: { positionId: insertPositionToBodyCid(ch.h_state?.insert_position ?? -1) }, target: 'self' },
          ], { sourceId: id, _targetIds: [id] })
        }
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

  // 注释：绝顶寸止开关（对齐 erArk default.py:2255-2297）
  // orgasm_edge_on：置 orgasm_edge=1，清空寸止计数
  // orgasm_edge_off：置 orgasm_edge=0
  function setOrgasmEdge(ids: string[], edge: number, resetCount: boolean): void {
    for (const id of ids) {
      const ch = entitySystem.get('character', id) as any
      if (!ch?.h_state) continue
      ch.h_state.orgasm_edge = edge
      if (resetCount) ch.h_state.orgasm_edge_count = {}
    }
  }

  effectTypeRegistry.register('orgasm_edge_on', (_p: any, execCtx: any) => {
    setOrgasmEdge(execCtx._targetIds as string[], 1, true)
    return true
  })
  effectTypeRegistry.register('orgasm_edge_off', (_p: any, execCtx: any) => {
    setOrgasmEdge(execCtx._targetIds as string[], 0, false)
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

  // 注释：每次 H 行动后自动二段结算（对齐 erArk check_second_effect）
  // 流程：body_item_tick（道具 tick）→ orgasmJudge（高潮判定）→ 玩家射精时调 eja_climax
  ctx.events.on('game:execution_end', async () => {
    const mode = gameContext.getCurrentMode()
    if (mode !== 'h_scene') return
    const inH: string[] = []
    for (const ch of entitySystem.getAll('character')) {
      const c = ch as any
      if (c.h_state?.is_h) inH.push(c.id)
    }
    if (inH.length === 0) return
    // 注释：1. 对每个 H 中角色应用 body_item_tick（道具持续效果）
    await apiSystem.call('effect-system', 'execute', [{ type: 'body_item_tick', params: { target: 'self' } }], {
      sourceId: inH[0],
      _targetIds: inH,
    })
    // 注释：2. 自动二段结算——高潮判定（erArk orgasm_judge + orgasm_settle）
    for (const id of inH) {
      const ch = entitySystem.get('character', id) as any
      if (!ch?.h_state) continue
      const result = orgasmJudge(id)
      handleOrgasmResults(id, ch, result)
      // 注释：3. 玩家射精触发（erArk orgasm_judge 射精分支）
      // 忍耐判定（概率+手动弹窗延后）和射精量公式都在 eja_climax 内部（h-ejaculation），此处只触发
      if (result.shouldEjaculate && (id === '0' || id === 'player')) {
        if (effectTypeRegistry.has('eja_climax')) {
          await apiSystem.call('effect-system', 'execute', [
            { type: 'eja_climax', params: { positionId: insertPositionToBodyCid(ch.h_state?.insert_position ?? -1) }, target: 'self' },
          ], { sourceId: id, _targetIds: [id] })
        } else {
          // 射精系统未启用（h-ejaculation 插件缺失）——登记 warning 而非静默
          errorReporter.report({
            source: 'h-core',
            severity: 'warning',
            message: `玩家射精欲已满但 eja_climax 未注册（h-ejaculation 插件未启用）`,
            suggestion: '检查 h-ejaculation 插件是否已加载',
          })
        }
      }
    }
  })

  ctx.api.register('h-core', {
    evaluatePremises: (premises: string[], evalCtx: any) => premiseRegistry.evaluate(premises, evalCtx),
    startHScene, endHScene, getLevel, calcFavorability, calcTrust, calcJudge,
    getFavorabilityLevel, getTrustLevel,
    registerPremise: (id: string, handler: any) => premiseRegistry.register(id, handler),
  })

  loadInstructions()
  // 注释：指令 condition/premises/调整表校验依赖全部插件的字段注册完毕，
  // 监听 plugin-manager 全部 onEnable 后的生命周期事件再校验（防重复注册）
  if (!hCorePluginsLoadedListener) {
    hCorePluginsLoadedListener = true
    eventBus.on('game:plugins_loaded', () => { validateInstructionData() })
  }

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
  t.h_state.target_character_id = allyId
  const a = entitySystem.get('character', allyId) as any
  if (a) {
    a.h_state = createHState()
    a.h_state.target_character_id = targetId
  }
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
