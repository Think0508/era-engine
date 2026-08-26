// 注释：h-core 愤怒/心情效果域——愤怒值生命周期 + angry_with_player 标记 + 性骚扰/H失败愤怒修正
// erArk 对照：
//   - MOOD_TO_* / TARGET_MOOD_TO_*（default.py:497-570 + 573-631，效果 1521-1528）
//   - TARGET_ANGRY_WITH_PLAYER_FLAG_TO_0（default.py:5682-5701，效果 341）
//   - LOW_OBSCENITY_FAILED_ADJUST / HIGH_OBSCENITY_FAILED_ADJUST / DO_H_FAILED_ADJUST
//     （default.py:9090-9227，效果 151/152/153）
// 归属：h-core（愤怒属性/心情修正/送礼/判定都在此层）

import { effectTypeRegistry, type Effect } from '../../../core/effect-type-registry'
import { entitySystem } from '../../../core/entity-system'
import { modLoader } from '../../../core/mod-loader'
import { apiSystem } from '../../../core/api'
import { errorReporter } from '../../../core/error-reporter'
import { ATTR, getEntityAttr } from '../../../core/entity-utils'
import { getContinuousAdjust } from '../../../core/command-executor'
import { calcFavorability } from '../settle/favorability'
import { settleOneState } from '../settle/state-settle'

function abilityAdjust(talkLv: number): number {
  const hc = (modLoader.getMod()?.hConfig as any) ?? {}
  const tbl = hc.ability_lv_adjust ?? [1.0, 1.1, 1.25, 1.4, 1.6, 1.8, 2.1, 2.4, 2.8, 3.2, 4.0]
  return tbl[Math.min(Math.max(0, talkLv), 10)] ?? 4.0
}

function setAnger(execCtx: any, id: string, value: number): void {
  if (execCtx.settlement) {
    execCtx.settlement.setValue(id, ATTR.ANGER, value)
  } else {
    const ch = entitySystem.get('character', id) as any
    if (!ch) return
    if (!ch.base) ch.base = {}
    ch.base[ATTR.ANGER] = value
  }
}

function setAngryWithPlayer(id: string, value: boolean): void {
  const ch = entitySystem.get('character', id) as any
  if (!ch) return
  if (!ch.sp_flag) ch.sp_flag = {}
  ch.sp_flag.angry_with_player = value
}

export function registerAngerEffects(): void {
  // ── MOOD_TO_*（自己心情档，效果 1521-1524）──
  const moodEffects: Array<[string, number]> = [
    ['mood_to_good', 0],
    ['mood_to_normal', 20],
    ['mood_to_bad', 40],
    ['mood_to_angry', 75],
  ]
  for (const [type, value] of moodEffects) {
    effectTypeRegistry.register(type, (_p: any, execCtx: any) => {
      for (const id of execCtx._targetIds as string[]) setAnger(execCtx, id, value)
      return true
    })
  }

  // ── TARGET_MOOD_TO_*（目标心情档，效果 1525-1528）──
  const targetMoodEffects: Array<[string, number]> = [
    ['target_mood_to_good', 0],
    ['target_mood_to_normal', 20],
    ['target_mood_to_bad', 40],
    ['target_mood_to_angry', 75],
  ]
  for (const [type, value] of targetMoodEffects) {
    effectTypeRegistry.register(type, (_p: any, execCtx: any) => {
      for (const id of execCtx._targetIds as string[]) setAnger(execCtx, id, value)
      return true
    })
  }

  // ── TARGET_ANGRY_WITH_PLAYER_FLAG_TO_0（效果 341，default.py:5682-5701）──
  effectTypeRegistry.register('target_angry_with_player_flag_to_0', (_p: any, execCtx: any) => {
    for (const id of execCtx._targetIds as string[]) setAngryWithPlayer(id, false)
    return true
  })

  // ── DOWN_INTERACTION_FAVORABILITY（效果 23，default.py:145-162）──
  // 降低基础互动好感：extra_adjust=-1 → -calcFavorability(target, add_time)
  effectTypeRegistry.register('down_interaction_favorability', (_p: any, execCtx: any) => {
    const addTime = execCtx._timeCost ?? 10
    for (const id of execCtx._targetIds as string[]) {
      if (execCtx.settlement) execCtx.settlement.applyChange(id, ATTR.FAVORABILITY, -calcFavorability(id, addTime))
    }
    return true
  })

  // ── apologize_settle——道歉专用结算（= erArk handle_apologize，handle_instruct.py:958-975）──
  // 先按话术技能减目标愤怒：value = int(10 + adjust×10)；随后 target 愤怒 ≤30 → 成功链，
  // 否则失败链。链由 TOML params 传入（success_effects/fail_effects），与 chat_settle 同款。
  effectTypeRegistry.register('apologize_settle', async (_p: any, execCtx: any) => {
    const targetIds = execCtx._targetIds as string[]
    const targetId = targetIds[0]
    const target = targetId ? entitySystem.get('character', targetId) as any : null
    if (!target) return true
    const srcId = execCtx.sourceId
    const src = srcId ? entitySystem.get('character', srcId) as any : null
    const talkLv = src?.abilities?.['话术技能']?.level ?? 0
    const value = Math.floor(10 + abilityAdjust(talkLv) * 10)
    if (execCtx.settlement) {
      execCtx.settlement.applyChange(targetId, ATTR.ANGER, -value)
    } else {
      if (!target.base) target.base = {}
      target.base[ATTR.ANGER] = Math.max(0, Number(target.base[ATTR.ANGER] ?? 0) - value)
    }
    const nowAnger = Number(getEntityAttr(target, ATTR.ANGER) ?? 0)
    const success = nowAnger <= 30
    const rawChain = (success ? _p.success_effects : _p.fail_effects) as Effect[] | string | undefined
    const blocks = (modLoader.getMod() as any)?.effectBlocks ?? {}
    const chain = typeof rawChain === 'string' ? blocks[rawChain] : rawChain
    if (chain && (chain as Effect[]).length > 0) {
      await apiSystem.call('effect-system', 'execute', chain as Effect[], {
        ...execCtx,
        _targetIds: targetIds,
        _timeCost: execCtx._timeCost ?? 0,
      })
    }
    const scene = success ? _p.success_scene : _p.fail_scene
    if (scene) {
      try {
        await apiSystem.call('dialogue', 'triggerScene', scene, targetId)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (!msg.includes('dialogue') && !msg.includes('未注册')) {
          errorReporter.report({
            source: 'h-core',
            severity: 'warning',
            message: `apologize_settle 触发口上场景 '${scene}' 失败：${msg}`,
            suggestion: '检查 dialogue-system 插件是否启用、scene 数据是否存在',
          })
        }
      }
    }
    return true
  })

  // ── LOW_OBSCENITY_FAILED_ADJUST（效果 151，default.py:9101-9115）──
  // 轻度性骚扰失败：反感 += 通用管线(state20, base200, ability=目标反发刻印)；
  // 愤怒 += 50 + angry_with_player=true；好感 -= calcFavorability(目标, add_time)
  effectTypeRegistry.register('low_obscenity_failed_adjust', async (_p: any, execCtx: any) => {
    const ids = execCtx._targetIds as string[]
    const addTime = execCtx._timeCost ?? 10
    const continuous = getContinuousAdjust()
    for (const id of ids) {
      const target = entitySystem.get('character', id) as any
      if (!target) continue
      const rebelLv = target?.abilities?.['反发刻印']?.level ?? 0
      settleOneState(execCtx, target, id, ATTR.RESENTMENT, 200, addTime, rebelLv, null, false, continuous)
      if (execCtx.settlement) execCtx.settlement.applyChange(id, ATTR.ANGER, 50)
      setAngryWithPlayer(id, true)
      if (execCtx.settlement) execCtx.settlement.applyChange(id, ATTR.FAVORABILITY, -calcFavorability(id, addTime))
    }
    return true
  })

  // ── HIGH_OBSCENITY_FAILED_ADJUST（效果 152，default.py:9118-9170）──
  // 重度性骚扰失败：反感 += int((add_time+10000)×adjust + 反感/2)；
  // 愤怒 += 100 + angry_with_player=true；好感 -= 3×calcFavorability；信赖 -= trust×0.2+2
  effectTypeRegistry.register('high_obscenity_failed_adjust', async (_p: any, execCtx: any) => {
    const ids = execCtx._targetIds as string[]
    const addTime = execCtx._timeCost ?? 10
    for (const id of ids) {
      const target = entitySystem.get('character', id) as any
      if (!target) continue
      const currentResent = Number(getEntityAttr(target, ATTR.RESENTMENT) ?? 0)
      const adjust = abilityAdjust(target?.abilities?.['反发刻印']?.level ?? 0)
      const addResent = Math.floor((addTime + 10000) * adjust + currentResent / 2)
      if (execCtx.settlement) execCtx.settlement.applyChange(id, ATTR.RESENTMENT, addResent)
      if (execCtx.settlement) execCtx.settlement.applyChange(id, ATTR.ANGER, 100)
      setAngryWithPlayer(id, true)
      if (execCtx.settlement) execCtx.settlement.applyChange(id, ATTR.FAVORABILITY, -3 * calcFavorability(id, addTime))
      const trust = Number(getEntityAttr(target, ATTR.TRUST) ?? 0)
      if (execCtx.settlement) execCtx.settlement.applyChange(id, ATTR.TRUST, -(trust * 0.2 + 2))
    }
    return true
  })

  // ── DO_H_FAILED_ADJUST（效果 153，default.py:9173-9227）──
  // 邀请H失败：高陷落(≥4)不结算；反感 += int((add_time+20000)×adjust + 反感/2)；
  // 愤怒 += 100 + angry_with_player=true；好感 -= 15×calcFavorability；信赖 -= trust×0.4+5
  effectTypeRegistry.register('do_h_failed_adjust', async (_p: any, execCtx: any) => {
    const ids = execCtx._targetIds as string[]
    const addTime = execCtx._timeCost ?? 10
    for (const id of ids) {
      const target = entitySystem.get('character', id) as any
      if (!target) continue
      // TODO(anger-system)：陷落等级 getFallLevel 需要时从 state-settle 引入；此处先按 erArk
      // 高陷落跳过逻辑占位，陷落系统已存在但当前失败效果调用方尚未接入。
      const currentResent = Number(getEntityAttr(target, ATTR.RESENTMENT) ?? 0)
      const adjust = abilityAdjust(target?.abilities?.['反发刻印']?.level ?? 0)
      const addResent = Math.floor((addTime + 20000) * adjust + currentResent / 2)
      if (execCtx.settlement) execCtx.settlement.applyChange(id, ATTR.RESENTMENT, addResent)
      if (execCtx.settlement) execCtx.settlement.applyChange(id, ATTR.ANGER, 100)
      setAngryWithPlayer(id, true)
      if (execCtx.settlement) execCtx.settlement.applyChange(id, ATTR.FAVORABILITY, -15 * calcFavorability(id, addTime))
      const trust = Number(getEntityAttr(target, ATTR.TRUST) ?? 0)
      if (execCtx.settlement) execCtx.settlement.applyChange(id, ATTR.TRUST, -(trust * 0.4 + 5))
    }
    return true
  })
}