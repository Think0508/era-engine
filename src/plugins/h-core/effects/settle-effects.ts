// 注释：h-core 效果域模块——结算类效果（E2 拆分，2026-08-15）
// 自 index.ts 原样迁出：judge_check / settle_favorability / settle_trust / settle_state /
// settle_hp_mp / tech_adjust / pain 系列（pain_by_lubrication / pain_by_part / feel_by_sex /
// pain_to_h）/ pl_p_adjust / h_experience / chat_settle / talk_add_adjust + 私有 helper canApply。
// 纯重构：handler 逻辑零改动，仅注册位置迁移（onLoad 中 registerSettleEffects() 调用点
// 位于原 judge_check 首次注册处，保持注册顺序不变）。

import { effectTypeRegistry, type Effect } from '../../../core/effect-type-registry'
import { entitySystem } from '../../../core/entity-system'
import { eventBus } from '../../../core/event-bus'
import { gameContext, isPlayerChar } from '../../../core/game-context'
import { narrativeLog } from '../../../core/narrative-log'
import { errorReporter } from '../../../core/error-reporter'
import { modLoader } from '../../../core/mod-loader'
import { apiSystem } from '../../../core/api'
import { getContinuousAdjust } from '../../../core/command-executor'
import { ATTR, getEntityAttr } from '../../../core/entity-utils'
import { isSettleGated } from '../../../utils/settle-gate'
import { calcFavorability } from '../settle/favorability'
import { calcTrust } from '../settle/trust'
import { calcJudge, mergeJudgeResult, type JudgeResult } from '../settle/judge'
import { calcHpMpChange, type HpMpInput } from '../settle/hp-mp'
import { settleOneState, PART_ABILITY, getFeelExtraAdjust, getFallLevel } from '../settle/state-settle'
import { getTalentStateAdjust } from '../settle/talent-adjust'
import { runPainByLubrication, runPainByPart, runFeelBySex, runPainToH, getGroupSexActive } from '../settle/pain-adjust'
import { addEja } from '../settle/eja'
import { accumulateOrgasmFeel, ORGASM_ATTR_TO_PART } from '../settle/orgasm'
import { resolvePartKey, recordPartUseAndScore } from '../settle/favorite'

export function registerSettleEffects(): void {
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
    // 注释：监禁修正 +9999（erArk instuct_judege.py:278——被监禁角色无法拒绝任何指令；
    // confinement-system 插件在 onLoad 注册 premises 前本插件需容错——读 sp_flag 直查）
    for (const id of targetIds) {
      const ch = entitySystem.get('character', id) as any
      if (ch?.sp_flag?.imprisonment) {
        bonus += 9999
        break
      }
    }
    for (const id of targetIds) {
      const char = entitySystem.get('character', id) as any
      // 注释：audit-b I1——好感/信赖 canonical 在 social 命名空间，直读 base 恒丢修正。
      // 经 getEntityAttr 跨命名空间读取（ATTR 常量引用，禁止硬编码字符串）
      const f = getEntityAttr(char, ATTR.FAVORABILITY) ?? 0
      const t = getEntityAttr(char, ATTR.TRUST) ?? 0
      const r = calcJudge(judgeBase + bonus, f, t, id, judgeClass, _p.part)
      // 判定链输出（2026-08-25）：每次判定都显示，成功也显示
      if (r.reasonText) {
        narrativeLog.write(`【${char?.name ?? id} 实行判定】${r.reasonText}`, 'system', 'h-core')
      }
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
        hpMax: ch.base[ATTR.HP_MAX] ?? 99999,
        mpMax: ch.base[ATTR.MP_MAX] ?? 99999,
        currentHp: ch.base[ATTR.HP] ?? 0,
        currentMp: ch.base[ATTR.MP] ?? 0,
        isGroupSex, isPlayer: isPlayerChar(id),
        isDead: ch.dead ?? false, isTimeStop,
      }
      const result = calcHpMpChange(input)
      if (!result.self) continue
      if (result.self.hp !== 0) execCtx.settlement.applyChange(id, ATTR.HP, result.self.hp)
      if (result.self.mp !== 0) execCtx.settlement.applyChange(id, ATTR.MP, result.self.mp)
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
        if (_p.part === ATTR.MIND && target?.sp_flag?.unconscious_h === 3) continue
        // 注释：发起者的技巧 ability[30]
        const techLv = initiator?.abilities?.[ATTR.TECHNIQUE]?.level ?? 0
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
      // 喜欢的部位学习：显式 part（如摸胸/摸阴蒂）→ 双方分数 +1 + h:part_use（mental 只计分数）
      if (_p.part && execCtx.sourceId) {
        const partKey = resolvePartKey(_p.part)
        if (partKey) {
          const partNum = /^\d+$/.test(partKey) ? Number(partKey) : null
          await recordPartUseAndScore(execCtx.sourceId, id, partKey, partNum)
        }
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
    const techAdj = getAdj(partner?.abilities?.[ATTR.TECHNIQUE]?.level ?? 0)
    const adjust = _p.skill
      ? techAdj / 2 + getAdj(partner?.abilities?.[_p.skill]?.level ?? 0)
      : techAdj
    // 自己当前 P 快感（erArk status_data[3]）
    const ownPFeel = getEntityAttr(src, ATTR.PENIS)
    const delta = Math.floor((tc + 50) * adjust + ownPFeel / 8)
    // 注释：跨插件写射精欲走 h-ejaculation API（唯一通信路径铁律；h-ejaculation 未启用 → 静默降级）
    await addEja(srcId, delta)
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
  // 口上场景（2026-08-17）：success_scene/fail_scene 可选参数——对应 erArk CHAT/CHAT_FAILED
  // 双 behavior 各自的口上文件；fail_scene 缺省 = 无（失败不触发失败口上场景，大多数指令默认成功）；
  // 二者均缺省 = 不触发（向后兼容外部 trigger_dialogue 用法）
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

    // 3. 成败口上场景（可选；成功 → success_scene，失败 → fail_scene）
    const scene = failed ? _p.fail_scene : _p.success_scene
    if (scene) {
      try {
        await apiSystem.call('dialogue', 'triggerScene', scene, targetId)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (!msg.includes('dialogue') && !msg.includes('未注册')) {
          errorReporter.report({
            source: 'h-core',
            severity: 'warning',
            message: `chat_settle 触发口上场景 '${scene}' 失败：${msg}`,
            suggestion: '检查 dialogue-system 插件是否启用、scene 数据是否存在',
          })
        }
      }
    }
    return true
  })
// 注释：listen_complaint_settle——听牢骚专用结算（= erArk handle_listen_complaint，
  // handle_instruct.py:977-989）。在通用效果链前先按话术技能减少目标愤怒：
  //   adjust = ability_lv_adjust[发起者.话术技能.level]（Ability_Lv_Adjust.csv，同 chat/talk_add_adjust）
  //   value = int(10 + adjust * 10)（Python int → JS Math.floor）
  //   目标 angry_point -= value（经 settlement clamp 下限 0）
  // 剩余通用链（21/1511/1512/53/CVE）由 TOML effects 顺序执行。
  effectTypeRegistry.register('listen_complaint_settle', async (_p: any, execCtx: any) => {
    const targetIds = execCtx._targetIds as string[]
    const targetId = targetIds[0]
    const target = targetId ? entitySystem.get('character', targetId) as any : null
    if (!target) return true
    const srcId = execCtx.sourceId
    const src = srcId ? entitySystem.get('character', srcId) as any : null
    const hc = (modLoader.getMod()?.hConfig as any) ?? {}
    const tbl = hc.ability_lv_adjust ?? [1.0, 1.1, 1.25, 1.4, 1.6, 1.8, 2.1, 2.4, 2.8, 3.2, 4.0]
    const talkLv = src?.abilities?.['话术技能']?.level ?? 0
    const adjust = tbl[Math.min(Math.max(0, talkLv), 10)] ?? 4.0
    const value = Math.floor(10 + adjust * 10)
    if (execCtx.settlement) {
      execCtx.settlement.applyChange(targetId, ATTR.ANGER, -value)
    } else {
      const current = Number(getEntityAttr(target, ATTR.ANGER) ?? 0)
      if (!target.base) target.base = {}
      target.base[ATTR.ANGER] = Math.max(0, current - value)
    }
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

  // cancel_penis_in_face_or_mouth——取消阴茎蹭脸/口交中（erArk 840）
  effectTypeRegistry.register('cancel_penis_in_face_or_mouth', (_p: any, execCtx: any) => {
    for (const id of execCtx._targetIds as string[]) {
      const ch = entitySystem.get('character', id) as any
      if (!ch?.h_state) continue
      if (ch.h_state.insert_position === 1 || ch.h_state.insert_position === 2) {
        ch.h_state.insert_position = -1
      }
      if (ch.h_state.insertion === 'mouth' || ch.h_state.insertion === 'face') {
        ch.h_state.insertion = undefined
      }
    }
    return true
  })
}
