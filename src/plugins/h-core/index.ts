// 注释：h-core 插件——核心入口

import type { PluginContext } from '../../core/types'
import { createHState } from './types'
import type { BodyItemSlot } from './types'
import { effectTypeRegistry, type Effect } from '../../core/effect-type-registry'
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
import { calcFavorability, getFavorabilityLevel, getTrustLevel, clearTalentAdjustIndex } from './settle/favorability'
import { calcTrust } from './settle/trust'
import { calcJudge, mergeJudgeResult, type JudgeResult } from './settle/judge'
import { calcHpMpChange, type HpMpInput } from './settle/hp-mp'
import { settleOneState, PART_ABILITY, getFeelExtraAdjust, getFallLevel } from './settle/state-settle'
import { getTalentStateAdjust } from './settle/talent-adjust'
import { grantFavoritePositionIfDue } from './settle/position'
import { runPainByLubrication, runPainByPart, runFeelBySex, runPainToH, getGroupSexActive } from './settle/pain-adjust'
import { addEja } from './settle/eja'
import { decayTalkCount } from './settle/talk'
import { isSettleGated } from '../../utils/settle-gate'
import { getContinuousAdjust } from '../../core/command-executor'
import { getLevel, getEntityAttr } from '../../core/entity-utils'
import { orgasmJudge, accumulateOrgasmFeel, ORGASM_ATTR_TO_PART, insertPositionToBodyCid, releaseOrgasmEdge, releaseTimeStopOrgasm, type OrgasmSettleOptions } from './settle/orgasm'
import { modLoader, revalidateCharacterContract } from '../../core/mod-loader'
import { apiSystem } from '../../core/api'
import { ATTR } from '../../core/entity-utils'
import { registerNoSaveMode } from '../../core/save-system'
import { registerCharacterValidator } from '../../core/character-contract'
import type { SecondSettleResult } from './settle/orgasm'

// 注释：game:plugins_loaded 监听器只注册一次（onEnable 重复执行时不重复监听）
let hCorePluginsLoadedListener = false
// 注释：talk_count 衰减监听器只注册一次（同 plugins_loaded 模式）
let hCoreTalkDecayListener = false
// 注释：execution_end 二段结算监听器只注册一次——2026-08-08 eja 重构后此监听器
// 承担射精欲积累 + 绝顶判定，重复注册会双倍结算（plugin-manager 的 loadPlugins 无幂等守卫）
let hCoreExecutionEndListener = false

// 注释：处理二段结算结果——输出绝顶/多重绝顶日志与事件（execution_end 与 h_orgasm_check 共用）
// 2026-08-08 对齐 erArk orgasm_settle_flag 去重（second_behavior.py:168-195）：
// 同一部位多个高潮事件只显示最高程度（日志/口上），数值效果照常；
// h:orgasm 事件逐条保留（h-hidden 发现度 / h-time-stop 累计等数值消费方依赖每条）
// 注：必须逐条 await emit——eventBus 有防重入保护（同事件并发 emit 会被吞），
// 同步连发 3 次只发 1 条（2026-08-08 审查发现并修复）
async function handleOrgasmResults(id: string, ch: any, result: SecondSettleResult): Promise<void> {
  const partMaxDegree = new Map<number, number>()
  for (const ev of result.orgasms) {
    const cur = partMaxDegree.get(ev.partId)
    if (cur === undefined || ev.degree > cur) partMaxDegree.set(ev.partId, ev.degree)
    await eventBus.emit('h:orgasm', { character: id, partId: ev.partId, level: ev.degree, count: ev.count, extra: ev.extra })
  }
  for (const [, degree] of partMaxDegree) {
    const degreeName = ['小', '普通', '强', '超强'][degree] ?? '普通'
    narrativeLog.write(`${ch.name || id} ${degreeName}绝顶！`, 'dialogue', 'h-core')
  }
  if (result.pluralCount >= 2) {
    narrativeLog.write(`${ch.name || id} 多重绝顶（${result.pluralCount}部位）！`, 'dialogue', 'h-core')
    await eventBus.emit('h:plural_orgasm', { character: id, count: result.pluralCount })
  }
}

export function onLoad(_ctx: PluginContext): void {
  // 注释：角色契约校验器（标准角色契约 spec §10.1——最小必需集）
  registerCharacterContractValidator()
  // 注释：补跑已加载 mod 的角色校验——main.ts 顺序 = loadMod 先、插件 onLoad 后，
  // 首次加载时本校验器未注册（必需集校验永不执行）；注册后立即补跑。
  // 插件先行的启动顺序无需补跑（parseModData 时校验器已注册，revalidate 幂等无害）
  revalidateCharacterContract()
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
    const continuous = getContinuousAdjust()
    for (const id of ids) {
      const ch = entitySystem.get('character', id) as any
      // 注释：死亡/无意识（时停）→ 不结算（erArk common_default.py:551-557；睡眠/无意识未实装，仅时停可判）
      if (isSettleGated(ch, 'settle_favorability')) continue
      let r = calcFavorability(id, tc)
      // 注释：连续重复指令减值——仅正收益（erArk common_default.py:616-618）
      if (r > 0) r = Math.floor(r * continuous)
      if (r !== 0) execCtx.settlement.applyChange(id, ATTR.FAVORABILITY, r)
    }
    return true
  })

  effectTypeRegistry.register('settle_trust', (_p: any, execCtx: any) => {
    if (!canApply(execCtx)) return true
    const ids = execCtx._targetIds as string[]
    const tc = execCtx._timeCost ?? 10
    const continuous = getContinuousAdjust()
    for (const id of ids) {
      const ch = entitySystem.get('character', id) as any
      // 注释：死亡/无意识（时停）→ 不结算（erArk common_default.py:548-557）
      if (isSettleGated(ch, 'settle_trust')) continue
      // 注释：erArk base_chara_favorability_and_trust_common_settle:628-669
      // add_trust = calculation_trust(...)（float），>0 时乘连续减值；封顶 300 由 settlement 钳制
      let r = calcTrust(id, tc)
      if (r > 0) r = r * continuous
      if (r > 0) execCtx.settlement.applyChange(id, ATTR.TRUST, r)
    }
    return true
  })

  effectTypeRegistry.register('settle_state', async (_p: any, execCtx: any) => {
    if (!canApply(execCtx)) return true
    // 注释：兽部全砍（同 tech_adjust）——不静默写死属性，报 warning 后跳过
    if (_p.state === '兽部' || _p.state === '兽部快感') {
      errorReporter.report({
        source: 'h-core',
        severity: 'warning',
        message: `settle_state：状态 '兽部' 未实现（兽部全砍决策），效果被跳过`,
        suggestion: '检查指令 TOML 是否误用兽部状态；本引擎不支持兽部（方舟世界观专属）',
      })
      return true
    }
    const ids = execCtx._targetIds as string[]
    const tc = execCtx._timeCost ?? 10
    const bv = _p.baseValue ?? 30
    const continuous = getContinuousAdjust()
    // 注释：群交修正（可选能力——仅"插件未注册"被忽略，真实错误照报）
    const isGroupSex = await getGroupSexActive()
    for (const id of ids) {
      const ch = entitySystem.get('character', id) as any
      // 注释：单状态结算（与 talk_add_adjust 共用同一管线——erArk base_chara_state_common_settle）
      settleOneState(execCtx, ch, id, _p.state, bv, tc, null, _p.ability_level ?? null, isGroupSex, continuous, _p.negate)
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
      // 注释：时停 → 不结算（erArk common_default.py:51-53 handle_time_stop_on 直接 return）
      const isTimeStop = ch?.sp_flag?.unconscious_h === 3
      const input: HpMpInput = {
        charId: id, addTime, hpValue, mpValue, degree,
        hpMax: ch.base['体力上限'] ?? 99999,
        mpMax: ch.base['气力上限'] ?? 99999,
        currentHp: ch.base['体力'] ?? 0,
        currentMp: ch.base['气力'] ?? 0,
        isGroupSex, isPlayer: id === 'player' || id === '0',
        isDead: ch.dead ?? false, isTimeStop,
      }
      const result = calcHpMpChange(input)
      if (!result.self) continue
      if (result.self.hp !== 0) execCtx.settlement.applyChange(id, '体力', result.self.hp)
      if (result.self.mp !== 0) execCtx.settlement.applyChange(id, '气力', result.self.mp)
      if (result.self.hpCritical) eventBus.emit('character:hp_critical', { characterId: id })
    }
    return true
  })


  // 注释：tech_adjust——体技修正的部位快感/欲情（erArk TECH_ADD_*: default.py:7918-8265）
  // erArk 公式（均经 base_chara_state_common_settle）：
  //   部位快感(state 0..7, feel 分支): base × sqrt(ability表[发起者.技巧] × ability表[目标.部位感度])
  //     （chara_feel_state_adjust:299；口喉→感度100、心理→感度102 按名查天然对齐）
  //   欲情(state 12, 非快感分支): base × ability表[目标.部位感度]（chara_base_state_adjust:377，
  //     ability_level = target_data.ability[部位id]，非 sqrt！）
  //   三件套：tenths_add（+min(3×基础, 当前/10)）/ 连续重复减值（非自己）/ 无意识时心理快感跳过
  // 参数: { part: "皮肤|胸部|阴蒂|阴道|肛肠|尿道|子宫|口喉|心理", baseValue?: 50 }
  effectTypeRegistry.register('tech_adjust', async (_p: any, execCtx: any) => {
    // 注释：兽部全砍（2026-08-08 决策：无属性/无感度/无绝顶，方舟兽人世界观专属）——
    // 不静默（原实现会静默写 base['兽部'] 死属性），报 warning 后跳过
    if (_p.part === '兽部' || _p.part === '兽部快感') {
      errorReporter.report({
        source: 'h-core',
        severity: 'warning',
        message: `tech_adjust：部位 '兽部' 未实现（兽部全砍决策），效果被跳过`,
        suggestion: '检查指令 TOML 是否误用兽部部位；本引擎不支持兽部（方舟世界观专属）',
      })
      return true
    }
    const ids = execCtx._targetIds as string[]
    const tc = execCtx._timeCost ?? 10
    const bv = _p.baseValue ?? 50
    const base = tc + bv
    const hc = (modLoader.getMod()?.hConfig as any) ?? {}
    const tbl = hc.ability_lv_adjust ?? [1.0, 1.1, 1.25, 1.4, 1.6, 1.8, 2.1, 2.4, 2.8, 3.2, 4.0]
    const getAdj = (lv: number) => tbl[Math.min(Math.max(0, lv), 10)] ?? 4.0
    const continuous = getContinuousAdjust()
    // 注释：群交修正（可选能力——仅"插件未注册"被忽略，真实错误照报）
    const isGroupSex = await getGroupSexActive()

    for (const id of ids) {
      const target = entitySystem.get('character', id) as any
      if (!target) continue
      const initId = execCtx.sourceId
      const initiator = initId ? entitySystem.get('character', initId) as any : null

      if (_p.part) {
        // 注释：无意识/时停——心理快感不结算（erArk common_default.py:198-199）
        if (_p.part === '心理' && target?.sp_flag?.unconscious_h === 3) continue
        // 注释：发起者的技巧 ability[30]
        const techLv = initiator?.abilities?.['技巧']?.level ?? 0
        const techAdj = getAdj(techLv)
        // 注释：目标的部位感度 ability[part_id]（部位属性名 → 感度能力名，如 皮肤→皮肤感度）
        const feelAbility = PART_ABILITY[_p.part] ?? _p.part
        const feelLv = target?.abilities?.[feelAbility]?.level ?? 0
        const feelAdj = getAdj(feelLv)
        // 注释：连续重复指令减值——快感/欲情均非负面状态（erArk common_default.py:210-231）
        const adjust = id !== execCtx.sourceId ? continuous : 1
        // 注释：催眠敏感 +2（chara_feel_state_adjust:304-305 全部位快感 / chara_base_state_adjust:441 欲情）
        const hypnosisAdj = target?.hypnosis?.increase_body_sensitivity ? 2 : 0
        // 注释：快感附加修正（眼罩/无觉刻印/群交 0.02/怀孕灌肠，chara_feel_state_adjust:300-347）
        const feelExtraAdj = getFeelExtraAdjust(target, _p.part, tbl, isGroupSex)
        // 注释：部位快感 = base × max(0, sqrt(techAdj × feelAdj) + 催眠敏感 + 附加修正)
        // （erArk :299 sqrt + :353 max(0) 钳制）
        const feelCoeff = Math.max(0, Math.sqrt(techAdj * feelAdj) + hypnosisAdj + feelExtraAdj)
        const rawFeel = base * feelCoeff * adjust
        const curFeel = getEntityAttr(target, _p.part)
        const feel = Math.floor(rawFeel + (curFeel > 0 ? Math.min(3 * rawFeel, curFeel / 10) : 0))
        if (!target.base) target.base = {}
        target.base[_p.part] = Math.min(99999, (target.base[_p.part] ?? 0) + feel)
        // 注释：部位快感变化量 → 二段结算累积（extra 高潮用）
        const feelPartId = ORGASM_ATTR_TO_PART[_p.part]
        if (feelPartId !== undefined) accumulateOrgasmFeel(target, feelPartId, feel)
        // 注释：射精欲积累已移出本效果——对齐 erArk 二段结算 ADD_SMALL_P_FEEL
        // （Second_effect.py:657-679：每次 P 部位快感产生时 eja_point += 100 + int(eja_point×0.4)），
        // 由 orgasm.ts orgasmJudge 读 pending_orgasm_feel[3] 统一处理（h-ejaculation API 写入）
        // 欲情 = base × max(0, ability表[目标.部位感度] + 催眠敏感 + 素质修正 + 攻略进度 + 群交0.05)
        // state 12 非快感分支（chara_base_state_adjust:358-454 + :455-458 fall + :479 max(0) 钳制，非 sqrt；
        // 欲情吃羞耻/开放天赋修正 + fall×0.05——2026-08-08 审查补：原手写公式漏攻略进度修正）
        const lustTalentAdj = getTalentStateAdjust(modLoader.getMod(), target, ATTR.AROUSAL)
        const lustFallAdj = getFallLevel(target) * 0.05
        let lustExtraAdj = hypnosisAdj + lustTalentAdj + lustFallAdj
        if (isGroupSex && target?.h_state?.is_h) {
          const others = Math.max(0, entitySystem.getAll('character').filter((c: any) => c.id !== target.id && c.current_location === target.current_location).length - 1)
          lustExtraAdj += Math.min(10, others) * 0.05
        }
        const rawLust = base * Math.max(0, feelAdj + lustExtraAdj) * adjust
        const curLust = getEntityAttr(target, ATTR.AROUSAL)
        const lust = Math.floor(rawLust + (curLust > 0 ? Math.min(3 * rawLust, curLust / 10) : 0))
        target.base[ATTR.AROUSAL] = Math.min(99999, (target.base[ATTR.AROUSAL] ?? 0) + lust)
      }
    }
    return true
  })

  // ═══════════════════════════════════════════════════════════
  // pain 系列（erArk 独立 settle 函数，default.py:8255-8680）
  // ═══════════════════════════════════════════════════════════

  // 注释：121 润滑 → 苦痛（TARGET_LUBRICATION_ADJUST_ADD_PAIN）
  effectTypeRegistry.register('pain_by_lubrication', async (_p: any, execCtx: any) => {
    return runPainByLubrication(execCtx)
  })

  // 注释：122-125 V/A/U/W 苦痛（TARGET_*_ADJUST_ADD_PAIN）——params: part
  effectTypeRegistry.register('pain_by_part', async (_p: any, execCtx: any) => {
    return runPainByPart(execCtx, _p.part as string)
  })

  // 注释：131-134 V/A/U/W 快感+欲情（TARGET_*_ADJUST_ADD_BY_SEX）——params: part
  effectTypeRegistry.register('feel_by_sex', async (_p: any, execCtx: any) => {
    return runFeelBySex(execCtx, _p.part as string)
  })

  // 注释：135 心理快感+欲情+苦痛（TARGET_PAIN_TO_H_ADJUST）
  effectTypeRegistry.register('pain_to_h', async (_p: any, execCtx: any) => {
    return runPainToH(execCtx)
  })

  // ═══════════════════════════════════════════════════════════
  // PL_P 系列（对发起者自己的 P快/射精欲，erArk TECH_ADD_PL_P_ADJUST: default.py:8239-8252 +
  // FINGER/TONGUE/FEET/BREAST/VAGINA/ANUS: :8683-8725）
  // ═══════════════════════════════════════════════════════════

  // 注释：pl_p_adjust——被服务时发起者自己的射精欲积累
  // 120（无 skill 参数）：adjust = adj(服务者.技巧)
  // 141-146（skill = 指技/舌技/足技/胸技/膣技/肛技）：adjust = adj(服务者.技巧)/2 + adj(服务者.技能)
  // eja += int((tc+50) × adjust + 自己当前P快/8)（erArk now_lust = status_data[3]）
  // 服务者 = 发起者 h_state.target_character_id（erArk target_data = character_data.target_character_id）
  effectTypeRegistry.register('pl_p_adjust', async (_p: any, execCtx: any) => {
    if (!canApply(execCtx)) return true
    const srcId = execCtx.sourceId
    const src = srcId ? entitySystem.get('character', srcId) as any : null
    if (!src) return true
    const tc = execCtx._timeCost ?? 10
    const hc = (modLoader.getMod()?.hConfig as any) ?? {}
    const tbl = hc.ability_lv_adjust ?? [1.0, 1.1, 1.25, 1.4, 1.6, 1.8, 2.1, 2.4, 2.8, 3.2, 4.0]
    const getAdj = (lv: number) => tbl[Math.min(Math.max(0, lv), 10)] ?? 4.0
    const partnerId = src?.h_state?.target_character_id
    const partner = partnerId ? entitySystem.get('character', partnerId) as any : null
    if (!partner) return true
    const techAdj = getAdj(partner?.abilities?.['技巧']?.level ?? 0)
    const adjust = _p.skill
      ? techAdj / 2 + getAdj(partner?.abilities?.[_p.skill]?.level ?? 0)
      : techAdj
    // 自己当前 P 快感（erArk status_data[3]）
    const ownPFeel = getEntityAttr(src, '阴茎')
    const delta = Math.floor((tc + 50) * adjust + ownPFeel / 8)
    // 注释：跨插件写射精欲走 h-ejaculation API（唯一通信路径铁律；h-ejaculation 未启用 → 静默降级）
    await addEja(srcId, delta)
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
  effectTypeRegistry.register('h_orgasm_check', async (_p: any, execCtx: any) => {
    const ids = execCtx._targetIds as string[]
    // 注释：二段结算上下文（连续减值/群交/结算记录——绝顶附加状态用）
    let isGroupSex = false
    try {
      isGroupSex = await apiSystem.call('h-group-sex', 'isActive')
    } catch { /* 群交插件未注册 */ }
    const opts: OrgasmSettleOptions = { continuous: getContinuousAdjust(), isGroupSex, settlement: execCtx.settlement }
    for (const id of ids) {
      const ch = entitySystem.get('character', id) as any
      if (!ch?.h_state) continue
      // 注释：extra 累积走 pending_orgasm_feel（settle_state/tech_adjust 已写入）；statusDelta 兼容参数已弃用
      const result = await orgasmJudge(id, undefined, opts)
      await handleOrgasmResults(id, ch, result)
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

  // 注释：release_time_stop_orgasm——时停绝顶解放（对齐 erArk TIME_STOP_ORGASM_RELEASE，
  // default.py:6764-6800）。由 h-time-stop 在时停解除时经 effect 通道调用（跨插件禁直接 import），
  // 把时停中累计的绝顶转成真实高潮结算
  effectTypeRegistry.register('release_time_stop_orgasm', async (_p: any, execCtx: any) => {
    for (const id of execCtx._targetIds as string[]) {
      const ch = entitySystem.get('character', id) as any
      if (!ch?.h_state) continue
      const result = releaseTimeStopOrgasm(id, { continuous: getContinuousAdjust(), settlement: execCtx.settlement })
      if (result.orgasms.length > 0) await handleOrgasmResults(id, ch, result)
    }
    return true
  })

  effectTypeRegistry.register('h_experience', (_p: any, execCtx: any) => {
    // 注释：判定退缩时经验不结算（与 settle_* 门控一致——erArk 退缩走失败替代行为，原链效果全跳过）
    if (!canApply(execCtx)) return true
    const ids = execCtx._targetIds as string[]
    for (const id of ids) {
      const ch = entitySystem.get('character', id) as any
      if (!ch) continue
      if (!ch.experience) ch.experience = {}
      ch.experience[_p.expId] = (ch.experience[_p.expId] ?? 0) + (_p.value ?? 1)
    }
    return true
  })

  // 注释：chat_settle——聊天专用结算（= erArk handle_chat，handle_instruct.py:455-465）
  // 流程：
  //   1. 分支：talk_count > 发起者.话术技能+1 → 执行 fail_effects（erArk CHAT_FAILED 链 [12]），
  //      否则执行 success_effects（erArk CHAT 链 21-12-CVE_A2-CVE_A1-53-55-501）
  //   2. 无论如何 talk_count += 1（存 target.action_info.talk_count）
  // talk_count 时间衰减由 game:execution_start 监听负责（erArk 挂整个行动循环，character_behavior.py:413）
  // fail_effects/success_effects 可为 TOML effect_blocks 块名（字符串）或内联 Effect 数组；
  // 嵌套执行用副本 ctx（executeEffects 会 Object.assign 覆盖 _targetIds/settlement）
  effectTypeRegistry.register('chat_settle', async (_p: any, execCtx: any) => {
    const targetIds = execCtx._targetIds as string[]
    const targetId = targetIds[0]
    const target = targetId ? entitySystem.get('character', targetId) as any : null
    const src = execCtx.sourceId ? entitySystem.get('character', execCtx.sourceId) as any : null
    if (!target) return true
    if (!target.action_info) target.action_info = {}

    // 1. 分支（erArk：talk_count > 发起者 ability[40] + 1 → CHAT_FAILED）
    const talkLv = src?.abilities?.['话术技能']?.level ?? 0
    const failed = (target.action_info.talk_count ?? 0) > talkLv + 1
    const rawChain = (failed ? _p.fail_effects : _p.success_effects) as Effect[] | string | undefined
    const blocks = (modLoader.getMod() as any)?.effectBlocks ?? {}
    const chain = typeof rawChain === 'string' ? blocks[rawChain] : rawChain
    if (chain && (chain as Effect[]).length > 0) {
      // 注释：嵌套执行必须用副本 ctx——executeEffects 会 Object.assign 覆盖 _targetIds/settlement
      await apiSystem.call('effect-system', 'execute', chain as Effect[], {
        ...execCtx,
        _targetIds: targetIds,
        _timeCost: execCtx._timeCost ?? 0,
      })
    }

    // 2. 计数器 +1（成败都加，erArk handle_chat:464）
    target.action_info.talk_count = (target.action_info.talk_count ?? 0) + 1
    return true
  })

  // 注释：talk_add_adjust——聊天专用结算（erArk 效果 501 TALK_ADD_ADJUST，default.py:5875-5912）
  // 结算条件（erArk :5894-5900）：有目标 且（发起者或目标任一为玩家）→ NPC→NPC 跳过；
  // 当前引擎指令仅玩家发起 → 玩家→NPC 场景（注释语义 2026-08-08 修正：
  // 原文"仅玩家→NPC"是误读——NPC→玩家 也会结算）
  // 公式（均经 erArk 完整通用结算函数）：
  //   好感度：base_chara_favorability_and_trust_common_settle(..., extra_adjust=话术 adjust)
  //     → int(calcFavorability × adjust)；>0 时再乘连续减值（common_default.py:616-618）；难度修正 TODO
  //   好意/快乐：base_chara_state_common_settle(target, add_time, 11/13, ability_level=话术)
  //     → 全管线（ability_lv_adjust[话术] / 快乐属刻印状态 → get_mark_debuff_adjust(话术)，
  //     erArk state 13 ∈ [13,15,17,18,20]；素质/攻略修正；连续减值；tenths_add）
  //     （2026-08-08 审查修复：原只算 floor((tc+30)×adjust)，缺 tenths/连续减值/素质——违反"禁止简化"）
  //   记录 target.action_info.talk_time = 当前 {day, hour}（衰减用）
  effectTypeRegistry.register('talk_add_adjust', async (_p: any, execCtx: any) => {
    const srcId = execCtx.sourceId
    const src = srcId ? entitySystem.get('character', srcId) as any : null
    if (!src) return true
    const tc = execCtx._timeCost ?? 5
    const hc = (modLoader.getMod()?.hConfig as any) ?? {}
    const tbl = hc.ability_lv_adjust ?? [1.0, 1.1, 1.25, 1.4, 1.6, 1.8, 2.1, 2.4, 2.8, 3.2, 4.0]
    const talkLv = src?.abilities?.['话术技能']?.level ?? 0
    const adjust = tbl[Math.min(Math.max(0, talkLv), 10)] ?? 4.0
    const continuous = getContinuousAdjust()
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
          message: `talk_add_adjust 查群交状态失败：${msg}`,
        })
      }
    }
    for (const id of execCtx._targetIds as string[]) {
      const target = entitySystem.get('character', id) as any
      if (!target) continue
      // 注释：死亡/无意识（时停）→ 不结算（erArk default.py:5897 dead；favorability 门控 :551-557）
      // 与 settle_favorability（21）门控一致——时停中 chat 的好感/好意/快乐整体冻结
      if (isSettleGated(target, 'talk_add_adjust')) continue
      if (!target.action_info) target.action_info = {}
      // 好感度（extra_adjust = adjust；>0 时连续减值；难度/信物修正 TODO）
      const favBase = calcFavorability(id, tc)
      const fav = favBase > 0
        ? Math.floor(favBase * adjust * continuous)
        : Math.floor(favBase * adjust)
      if (fav !== 0) execCtx.settlement.applyChange(id, ATTR.FAVORABILITY, fav)
      // 好意（ability_level = 发起者.话术技能——完整通用管线；等级来自发起者，非目标）
      settleOneState(execCtx, target, id, ATTR.FONDNESS, 30, tc, talkLv, '话术技能', isGroupSex, continuous)
      // 快乐（同上；快乐属刻印状态 → 系数 = get_mark_debuff_adjust(话术)，erArk 原样）
      settleOneState(execCtx, target, id, ATTR.PLEASURE, 30, tc, talkLv, '话术技能', isGroupSex, continuous)
      // 记录谈话时间
      const now = gameContext.getContext().time
      target.action_info.talk_time = { day: now.day, hour: now.hour }
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

// 注释：execution_end 二段结算处理（对齐 erArk check_second_effect）
// 流程：body_item_tick（道具 tick）→ orgasmJudge（高潮判定 + 射精欲积累）→ 玩家射精时调 eja_climax
// 模块级函数 + 只注册一次守卫（plugin-manager 的 loadPlugins 无幂等守卫，重复 onEnable 会双倍结算）
async function handleExecutionEnd(): Promise<void> {
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
    const result = await orgasmJudge(id)
    await handleOrgasmResults(id, ch, result)
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
  // 注释：4. 喜欢体位懒授予（erArk settle_favorite_sex_position 在公式内懒授予 → 引擎统一
  // 在此点：体位经验 ≥100 且无喜好天赋 → 授予 + 叙事，2026-08-08 grilling 决策）
  for (const id of inH) {
    const ch = entitySystem.get('character', id) as any
    if (ch) grantFavoritePositionIfDue(ch, modLoader.getMod())
  }
}

export function onEnable(ctx: PluginContext): void {
  registerNoSaveMode('h_scene')
  // 注释：天赋修正索引随插件启用重建（mod 切换/测试环境重载时避免脏缓存）
  clearTalentAdjustIndex()
  registerHPremises(premiseRegistry)
  registerTargetPremises(premiseRegistry)
  registerFallPremises(premiseRegistry)
  registerClothingPremises(premiseRegistry)
  registerBodyItemPremises(premiseRegistry)
  registerInstructPremises(premiseRegistry)

  // 注释：每次 H 行动后自动二段结算（对齐 erArk check_second_effect）
  // 流程：body_item_tick（道具 tick）→ orgasmJudge（高潮判定 + 射精欲积累）→ 玩家射精时调 eja_climax
  // 只注册一次（plugin-manager 的 loadPlugins 无幂等守卫，重复 onEnable 会双倍结算）
  if (!hCoreExecutionEndListener) {
    hCoreExecutionEndListener = true
    ctx.events.on('game:execution_end', handleExecutionEnd)
  }

  ctx.api.register('h-core', {
    evaluatePremises: (premises: string[], evalCtx: any) => premiseRegistry.evaluate(premises, evalCtx),
    startHScene, endHScene, getLevel, calcFavorability, calcTrust, calcJudge,
    getFavorabilityLevel, getTrustLevel,
    registerPremise: (id: string, handler: any) => premiseRegistry.register(id, handler),
    // 注释：通用状态结算（对外暴露——其他插件（如 h-hidden 隐奸/露出持续快感）经 API 调用，
    // 遵守"插件间禁止直接 import"铁律；参数同 settleOneState）
    // settleState(charId, state, baseValue, timeCost, opts?: {
    //   abilityLevel?, abilityKeyOverride?, isGroupSex?, continuous?, negate?, tenthsAdd?, extraAdjust?,
    //   externalAbilityLevel? })
    settleState: (
      charId: string, state: string, baseValue: number, timeCost: number,
      opts?: { abilityLevel?: number | null; abilityKeyOverride?: string | null; isGroupSex?: boolean; continuous?: number; negate?: boolean; tenthsAdd?: boolean; extraAdjust?: number; externalAbilityLevel?: number | null },
    ) => {
      const ch = entitySystem.get('character', charId) as any
      if (!ch) {
        // 注释：无效目标不静默（调用方 bug——如跨插件传错 id）
        errorReporter.report({
          source: 'h-core',
          severity: 'warning',
          message: `settleState：角色 '${charId}' 不存在，跳过结算`,
          suggestion: '检查调用方传入的 charId 是否正确（跨插件调用经 API 通道）',
        })
        return
      }
      const playerId = gameContext.getContext().player?.id ?? null
      settleOneState(
        { sourceId: playerId, settlement: undefined },
        ch, charId, state, baseValue, timeCost,
        opts?.abilityLevel ?? null,
        opts?.abilityKeyOverride ?? null,
        opts?.isGroupSex ?? false,
        opts?.continuous ?? getContinuousAdjust(),
        opts?.negate ?? false,
        opts?.tenthsAdd ?? true,
        opts?.extraAdjust ?? 0,
        opts?.externalAbilityLevel ?? null,
      )
    },
  })

  loadInstructions()
  // 注释：指令 condition/premises/调整表校验依赖全部插件的字段注册完毕，
  // 监听 plugin-manager 全部 onEnable 后的生命周期事件再校验（防重复注册）
  if (!hCorePluginsLoadedListener) {
    hCorePluginsLoadedListener = true
    eventBus.on('game:plugins_loaded', () => { validateInstructionData() })
  }
  // 注释：talk_count 时间衰减——每次玩家行动开始对当前选中目标衰减（erArk character_behavior.py:413，
  // change_character_talkcount_for_time 挂整个行动循环，不只聊天）
  // gameContext.selectedCharacterId 由 engine-ui-bridge 从 uiStore 同步（round-3 修复的同步链路）
  if (!hCoreTalkDecayListener) {
    hCoreTalkDecayListener = true
    ctx.events.on('game:execution_start', () => {
      const gc = gameContext.getContext()
      // 注释：时停解放标志重置（对齐 erArk handle_npc_ai_in_h.py:99——NPC 每次行动开始时
      // time_stop_release 置回 False）。2026-08-08 审查修复：原 releaseTimeStopOrgasm 置 true 后
      // 永不重置 → 时停解除后 H 内后续所有高潮全走解放路径（roll 压缩/超强，静默偏差）；
      // 重置在行动开始 → 时停解除指令（同一次行动）先执行 release 置 true，execution_end
      // 二段结算正常走解放；下一次行动重置回普通路径（对齐 erArk"一个行为周期"语义）
      for (const ch of entitySystem.getAll('character')) {
        const c = ch as any
        if (c.h_state?.is_h && c.h_state.time_stop_release) {
          c.h_state.time_stop_release = false
        }
      }
      const selected = gc.selectedCharacterId
      if (!selected) return
      const target = entitySystem.get('character', selected) as any
      if (!target) return
      // 注释：execution_start 时时间尚未推进 → now = 行动开始时刻（对齐 erArk behavior.start_time）
      decayTalkCount(target, { day: gc.time.day, hour: gc.time.hour })
    })
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
  // 注释：退出 H 前释放寸止累计（对齐 erArk release_orgasm_edge_now + H_END 调用，
  // orgasm_settle.py:333-355 + default.py:6819）——2026-08-08 修复：原直接清 h_state，
  // 寸止成功累计的绝顶被静默丢弃。释放落在退出重置（清 h_state/统计奖励）之前，
  // 单人退出（自己+目标）与群交退出全员都覆盖（遍历所有 is_h 角色）
  for (const ch of entitySystem.getAll('character')) {
    const c = ch as any
    if (!c.h_state?.is_h) continue
    const released = releaseOrgasmEdge(c.id)
    if (released.orgasms.length > 0) await handleOrgasmResults(c.id, c, released)
  }
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

// ════════════════════════════════════════
// 标准角色契约（spec §10.1）——最小必需集校验器
// 具体字段名在此插件层声明（core 的 character-contract 注册表是纯机制，不认属性名）
// 校验时机：mod-loader 加载角色后（applyAttributeDefaults 已执行 → 缺=定义被删/未定义）
// 缺失 → warning + 建议（不阻止加载）
// 导出供契约一致性测试（必需集 ⊆ attributes.toml 定义，防"校验器引用未定义属性"）
// ════════════════════════════════════════
// 异常级（§5.1）：缺失直接破坏核心玩法链路
export const CONTRACT_REQUIRED_BASE = ['体力', '气力', '体力上限', '气力上限', '好感度', '信赖度', '欲望值', '射精欲', '射精欲上限', '精液量', '精液量上限']
export const CONTRACT_REQUIRED_PARAMS = ['皮肤', '胸部', '阴蒂', '阴茎', '阴道', '后穴', '子宫', '口喉', '心理', '润滑', '习得', '恭顺', '好意', '欲情', '快乐', '先导', '屈服', '羞耻', '苦痛', '恐怖', '抑郁', '反感']
export const CONTRACT_REQUIRED_MARKS = ['快乐刻印', '屈服刻印', '苦痛刻印', '恐怖刻印', '反发刻印']
export const CONTRACT_REQUIRED_ABILITIES = ['技巧', '顺从', '亲密', '欲望', '露出', '施虐', '受虐']

function registerCharacterContractValidator(): void {
  const REQUIRED_BASE = CONTRACT_REQUIRED_BASE
  const REQUIRED_PARAMS = CONTRACT_REQUIRED_PARAMS
  const REQUIRED_MARKS = CONTRACT_REQUIRED_MARKS
  const REQUIRED_ABILITIES = CONTRACT_REQUIRED_ABILITIES

  // attributes.toml category → 实体命名空间（与 applyAttributeDefaults 一致）
  const nsOf = (def: { category?: string }): string => {
    if (!def?.category) return 'base'
    const nsMap: Record<string, string> = { parameter: 'params', mark: 'marks', ability: 'abilities' }
    return nsMap[def.category] ?? def.category
  }

  registerCharacterValidator({
    id: 'h-core',
    validate: (charId, char, mod) => {
      // 按 attributes.toml category 动态解析命名空间（好感度/信赖度 = social → entity.social，
      // 硬编码 base 会误报"缺必需"——2026-08-09 boot-smoke 抓到的真 bug）
      const check = (keys: string[], label: string): void => {
        for (const key of keys) {
          const def = mod.attributes?.[key]
          const ns = nsOf(def)
          const container = (char as any)?.[ns]
          if (!container || container[key] === undefined) {
            errorReporter.report({
              source: 'character-contract:h-core',
              severity: 'warning',
              file: `mods/${mod.id}/definitions/attributes.toml`,
              message: `角色 '${charId}' 缺${label}必需属性 '${key}'（契约 §5.1 异常级，期望命名空间 ${ns}）`,
              suggestion: def
                ? `attributes.toml 已定义 '${key}'（category=${def.category}，默认 ${JSON.stringify(def.default)}）——检查是否被 mod 覆盖删除了；加载时已按默认补齐`
                : `attributes.toml 未定义 '${key}'——契约要求该属性必须存在，请在 h-core 默认或 mod definitions/attributes.toml 中定义`,
            })
          }
        }
      }
      check(REQUIRED_BASE, 'base')
      check(REQUIRED_PARAMS, 'params')
      check(REQUIRED_MARKS, 'marks')
      check(REQUIRED_ABILITIES, 'abilities')
    },
  })
}
