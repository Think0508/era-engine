// 注释：chat（1004）复刻测试——B1 试点最小化验证
// 覆盖：成功链（21/12/CVE_A2/CVE_A1/53/55/501 全 ID 数值）/ 失败链（talk_count 超限）/ 时间衰减 / 话术等级门槛 / 口上触发
// 数值依据：batch-01-daily.md §1（erArk Behavior_Effect.csv:14-15 + default.py 行号）

import { conditionEngine } from '../core/condition-engine'
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { modLoader } from '../core/mod-loader'
import { gameContext } from '../core/game-context'
import { entitySystem } from '../core/entity-system'
import { apiSystem } from '../core/api'
import { commandRegistry } from '../core/command-registry'
import { commandExecutor } from '../core/command-executor'
import { narrativeLog } from '../core/narrative-log'
import { errorReporter } from '../core/error-reporter'
import { onLoad as effectOnLoad, onEnable as effectOnEnable } from './effect-system/index'
import { onLoad as hCoreOnLoad, onEnable as hCoreOnEnable } from './h-core/index'
import { onLoad as dialogueOnLoad, onEnable as dialogueOnEnable } from './dialogue-system/index'
import { onEnable as talkCommonOnEnable } from './talk-common-system/index'
import { validateInstructionData } from './instruction-loader'
import { eventBus } from '../core/event-bus'
import { clearBehaviorHistory } from '../core/command-executor'
import { makeTestExecCtx, resetCharacterEntity, DEFAULT_NPC_BASE, DEFAULT_PLAYER_BASE } from '../utils/test-helpers'

const stubCtx: any = {
  api: apiSystem,
  events: eventBus,
  commands: commandRegistry,
  ui: { registerSlot: () => {} },
}

const execCtx = makeTestExecCtx

function npc(): any {
  return entitySystem.get('character', 'npc_1') as any
}

function player(): any {
  return entitySystem.get('character', 'player') as any
}

/** 重置玩家/NPC 数值，保证断言独立（镜像 applyAttributeDefaults 的完整 base 初始化） */
function resetChars(talkLv = 0): void {
  const p = player()
  resetCharacterEntity(p, DEFAULT_PLAYER_BASE)
  p.abilities = { 话术技能: { level: talkLv, xp: 0 } }
  const n = npc()
  resetCharacterEntity(n, DEFAULT_NPC_BASE)
}

describe('chat（1004）复刻', () => {
  beforeAll(async () => {
    entitySystem.clear()
    commandRegistry.clear()
    errorReporter.clear()
    conditionEngine.clear()
    narrativeLog.clear()
    await modLoader.loadMod('test-mod')
    const mod = modLoader.getMod()!
    gameContext.setPlayer('player')
    gameContext.setLocation(mod.locations.values().next().value as any)

    effectOnLoad(stubCtx)
    effectOnEnable(stubCtx)
    hCoreOnLoad(stubCtx)
    hCoreOnEnable(stubCtx)
    dialogueOnLoad(stubCtx)
    dialogueOnEnable(stubCtx)
    await talkCommonOnEnable(stubCtx)

    const p = entitySystem.get('character', 'player') as any
    p.current_location = 'town_square'
    entitySystem.register('character', 'npc_1', {
      id: 'npc_1', name: '测试NPC',
      base: {},
      current_location: 'town_square',
    })
    // 注释：模拟 engine-ui-bridge 的选中同步（execution_start 衰减监听依赖 gameContext.selectedCharacterId）
    gameContext.setSelectedCharacterId('npc_1')
    resetChars()
  })

  // 注释：command-executor 会记录执行历史（连续重复减值用）——每个用例隔离，避免跨用例衰减污染断言
  beforeEach(() => {
    clearBehaviorHistory()
  })

  it('成功链：全 7 ID 数值精确（话术0/亲密0/快乐刻印0）', async () => {
    resetChars()
    const before = gameContext.getContext().time
    const n = npc()
    n.base['好意'] = 0
    n.base['快乐'] = 0

    await commandExecutor.execute('chat', execCtx())

    const after = gameContext.getContext().time
    // time_cost = 5（Behavior_Data.csv:101）
    expect(after.hour * 60 + after.minute).toBe(before.hour * 60 + before.minute + 5)
    // 12 DOWN_BOTH_SMALL_MANA_POINT：双方 气力 -5×3（default.py:222 + common_default.py degree0 mp=3/分）
    expect(player().base['气力']).toBe(30 - 15)
    expect(n.base['气力']).toBe(50 - 15)
    // 21 好感度 + calcFavorability(5)=5；501 好感度 + floor(5×adjust1.0)=5 → 共 +10
    expect(n.base['好感度']).toBe(10)
    // 53 好意 + floor(35×adj(亲密0)=1.0)=35；501 好意 = 35×1.0 + tenths min(3×35, 35/10)=3.5 → 38 → 73
    // （501 走完整 base_chara_state_common_settle 管线：tenths_add/素质/攻略/连续减值，default.py:5907）
    expect(n.base['好意']).toBe(73)
    // 55 快乐 +35；501 快乐（刻印状态 → mark_debuff_adjust(话术0)=1.0）→ 73
    expect(n.base['快乐']).toBe(73)
    // CVE_A2_E|80_G_1 / CVE_A1_E|80_G_1：双方 对话经验(80) +1（Experience.csv:82）
    expect(n.experience['80']).toBe(1)
    expect(player().experience['80']).toBe(1)
    // handle_chat：talk_count +1（handle_instruct.py:464）
    expect(n.action_info.talk_count).toBe(1)
    // 501 记录谈话时间
    expect(n.action_info.talk_time?.day).toBe(after.day)
    // 口上触发（scene-dialogue.toml chat 行）
    expect(narrativeLog.getEntries().some((e: any) => String(e.text).includes('聊了起来'))).toBe(true)
  })

  it('失败链：talk_count > 话术技能+1 → 仅 12 气力扣减，其余不结算', async () => {
    resetChars(0)
    const n = npc()
    const now = gameContext.getContext().time
    // 话术0 → 门槛 1；talk_count=2 > 1 → CHAT_FAILED（102 链仅 [12]）
    n.action_info = { talk_count: 2, talk_time: { day: now.day, hour: now.hour } }

    await commandExecutor.execute('chat', execCtx())

    // 12 仍结算（失败链唯一效果）
    expect(n.base['气力']).toBe(50 - 15)
    expect(player().base['气力']).toBe(30 - 15)
    // 成功链效果全部不结算
    expect(n.base['好感度'] ?? 0).toBe(0)
    expect(n.base['好意'] ?? 0).toBe(0)
    expect(n.base['快乐'] ?? 0).toBe(0)
    expect(n.experience['80'] ?? 0).toBe(0)
    // talk_count 仍 +1（成败都加）
    expect(n.action_info.talk_count).toBe(3)
  })

  it('时间衰减：同日小时前进 → talk_count 减小时差', async () => {
    resetChars(0)
    const n = npc()
    const now = gameContext.getContext().time
    // 2 小时前（同日）：decay 3-2=1 → 1 > 1 不成立 → 成功链
    const talkTime = { day: now.day, hour: now.hour - 2 }
    n.action_info = { talk_count: 3, talk_time: talkTime }

    await commandExecutor.execute('chat', execCtx())

    expect(n.action_info.talk_count).toBe(2)
    expect(n.base['好感度'] ?? 0).toBe(10) // 成功链结算
  })

  it('时间衰减：跨天 → talk_count 归零', async () => {
    resetChars(0)
    const n = npc()
    const now = gameContext.getContext().time
    n.action_info = { talk_count: 5, talk_time: { day: now.day - 1, hour: now.hour } }

    await commandExecutor.execute('chat', execCtx())

    expect(n.action_info.talk_count).toBe(1) // 归零后 +1
    expect(n.base['好感度'] ?? 0).toBe(10)
  })

  it('话术技能门槛：话术5 → 门槛6 → talk_count=6 仍成功链', async () => {
    resetChars(5)
    const n = npc()
    const now = gameContext.getContext().time
    n.action_info = { talk_count: 6, talk_time: { day: now.day, hour: now.hour } }

    await commandExecutor.execute('chat', execCtx())

    expect(n.action_info.talk_count).toBe(7)
    // 好感度 = 5（21, calcFavorability=5）+ floor(5×1.8)=9（501, adjust=ability_lv_adjust[5]）= 14
    expect(n.base['好感度'] ?? 0).toBe(14)
    // 501 话术5 → adjust = ability_lv_adjust[5] = 1.8（Ability_Lv_Adjust.csv）
    // 好意 = 35×1.0（53, 亲密0）+ 501（35×1.8=63 + tenths 35/10=3.5 → 66）= 101
    expect(n.base['好意']).toBe(101)
  })

  it('衰减挂整个行动循环：非聊天行动（rest）也衰减 talk_count（erArk character_behavior.py:413）', async () => {
    resetChars(0)
    const n = npc()
    const now = gameContext.getContext().time
    // 2 小时前的谈话 → 执行 rest（非聊天）→ execution_start 衰减 3-2=1
    n.action_info = { talk_count: 3, talk_time: { day: now.day, hour: now.hour - 2 } }

    await commandExecutor.execute('rest', execCtx())

    expect(n.action_info.talk_count).toBe(1)
    expect(n.action_info.talk_time.hour).toBe(now.hour) // talk_time 同步
  })

  it('时停中 chat：好感/好意/快乐整体冻结，仅对话经验与 talk_count 生效', async () => {
    resetChars(0)
    const n = npc()
    n.sp_flag = { unconscious_h: 3 }

    await commandExecutor.execute('chat', execCtx())

    // 21 与 501（talk_add_adjust 门控）都不结算
    expect(n.base['好感度'] ?? 0).toBe(0)
    expect(n.base['好意'] ?? 0).toBe(0)
    expect(n.base['快乐'] ?? 0).toBe(0)
    // 12 气力也被时停门控（settle_hp_mp）
    expect(n.base['气力']).toBe(50)
    // CVE 经验照常（erArk 时停不拦经验）
    expect(n.experience['80']).toBe(1)
    expect(n.action_info.talk_count).toBe(1)
  })

  it('失败链后 talk_time 不更新（501 只在成功链，erArk 同）', async () => {
    resetChars(0)
    const n = npc()
    const now = gameContext.getContext().time
    // 同日同时（不触发衰减）→ 5 > 0+1 失败链
    const oldTalkTime = { day: now.day, hour: now.hour }
    n.action_info = { talk_count: 5, talk_time: oldTalkTime }

    await commandExecutor.execute('chat', execCtx())

    // 失败链：好感不结算；501 不跑 → talk_time 保持原引用（衰减未动、501 未写）
    expect(n.base['好感度'] ?? 0).toBe(0)
    expect(n.action_info.talk_time).toBe(oldTalkTime)
  })

  it('话术 1 门槛边界：count=2 成功（2 ≤ 2）、count=3 失败（3 > 2）', async () => {
    resetChars(1)
    const n = npc()
    const now = gameContext.getContext().time
    n.action_info = { talk_count: 2, talk_time: { day: now.day, hour: now.hour } }
    await commandExecutor.execute('chat', execCtx())
    expect(n.base['好感度'] ?? 0).toBe(10) // 成功链
    expect(n.action_info.talk_count).toBe(3)

    n.base['好感度'] = 0
    n.action_info.talk_count = 3
    await commandExecutor.execute('chat', execCtx())
    expect(n.base['好感度'] ?? 0).toBe(0) // 失败链
    expect(n.action_info.talk_count).toBe(4)
  })

  it('连续 chat 联动：talk_time 更新后同小时再次 chat 不衰减', async () => {
    resetChars(0)
    const n = npc()
    const before = gameContext.getContext().time

    await commandExecutor.execute('chat', execCtx())
    expect(n.action_info.talk_count).toBe(1)
    // 501 写入 talk_time = 推进后时间
    const after = gameContext.getContext().time
    expect(n.action_info.talk_time.day).toBe(after.day)
    expect(n.action_info.talk_time.hour).toBe(after.hour)
    expect(before.hour * 60 + before.minute + 5).toBe(after.hour * 60 + after.minute)

    // 同小时再 chat：衰减不触发（talk_time == now）→ count 2 仍成功
    await commandExecutor.execute('chat', execCtx())
    expect(n.action_info.talk_count).toBe(2)
    expect(n.base['好感度'] ?? 0).toBe(20) // 两次成功链
  })

  it('衰减日回退安全：talk_time.day 异常大于当前 → 归零（存档异常恢复）', async () => {
    resetChars(0)
    const n = npc()
    const now = gameContext.getContext().time
    n.action_info = { talk_count: 5, talk_time: { day: now.day + 3, hour: 10 } }

    await commandExecutor.execute('chat', execCtx())

    // 跨天分支 → 归零 → 成功链
    expect(n.action_info.talk_count).toBe(1)
    expect(n.base['好感度'] ?? 0).toBe(10)
  })

  it('前提 NO_TARGET_OR_TARGET_CAN_COOPERATE_OR_IMPRISONMENT_1 行为矩阵', async () => {
    const evalPrem = (overrides: any): boolean => {
      const n = npc()
      Object.assign(n, overrides)
      return conditionEngine.evaluatePremises(['NO_TARGET_OR_TARGET_CAN_COOPERATE_OR_IMPRISONMENT_1'], { ...gameContext.getContext(),
        selectedCharacterId: 'npc_1', // ctx
      })
    }
    // 正常目标 → 可协同
    expect(evalPrem({ base: { ...npc().base, 体力: 80, 疲劳度: 0 } })).toBe(true)
    // 无目标 → true（erArk 无交互对象分支）
    expect(conditionEngine.evaluatePremises(['NO_TARGET_OR_TARGET_CAN_COOPERATE_OR_IMPRISONMENT_1'], { ...gameContext.getContext(), selectedCharacterId: undefined })).toBe(true)
    // 体力 1 → false
    expect(evalPrem({ base: { ...npc().base, 体力: 1 } })).toBe(false)
    // 疲劳 200（>134）→ false
    expect(evalPrem({ base: { ...npc().base, 疲劳度: 200 } })).toBe(false)
    // 时停（unconscious_h=3）→ false
    expect(evalPrem({ sp_flag: { unconscious_h: 3 } })).toBe(false)
  })

  it('前提查"自己"维度：NOT_H/TIRED_LE_84/HP_G_1 看玩家而非目标（erArk 无 T_ 前缀=自己）', async () => {    const evalPrem = (premises: string[]): boolean => conditionEngine.evaluatePremises(premises, { ...gameContext.getContext(), selectedCharacterId: 'npc_1' })
    // NOT_H：玩家在 H → false（即使目标不在 H）
    const p = player()
    p.h_state = { is_h: true }
    expect(evalPrem(['NOT_H'])).toBe(false)
    p.h_state = undefined
    // NOT_H：目标在 H → false
    npc().h_state = { is_h: true }
    expect(evalPrem(['NOT_H'])).toBe(false)
    npc().h_state = undefined
    expect(evalPrem(['NOT_H'])).toBe(true)
    // TIRED_LE_84：看玩家疲劳（目标疲劳高不影响）
    npc().base['疲劳度'] = 200
    expect(evalPrem(['TIRED_LE_84'])).toBe(true) // 玩家疲劳 0
    p.base['疲劳度'] = 200
    expect(evalPrem(['TIRED_LE_84'])).toBe(false)
    p.base['疲劳度'] = 0
    // HP_G_1：看玩家体力（目标体力 1 不影响）
    npc().base['体力'] = 1
    expect(evalPrem(['HP_G_1'])).toBe(true) // 玩家体力 50
    p.base['体力'] = 1
    expect(evalPrem(['HP_G_1'])).toBe(false)
  })

  it('自动注入前提（2026-08-08 erArk 更新）：TIRED_LE_74 边界 + NOT_SHOW/DRUNK 恒 true', () => {
    const evalPrem = (premises: string[]): boolean => conditionEngine.evaluatePremises(premises, { ...gameContext.getContext(), selectedCharacterId: 'npc_1' })
    const p = player()
    // TIRED_LE_74：疲劳 ≤ 118（tired_type=2 注入，erArk handle_premise_base_value.py:405）
    p.base['疲劳度'] = 118
    expect(evalPrem(['TIRED_LE_74'])).toBe(true)
    p.base['疲劳度'] = 119
    expect(evalPrem(['TIRED_LE_74'])).toBe(false)
    p.base['疲劳度'] = 134
    expect(evalPrem(['TIRED_LE_84'])).toBe(true) // 84% 阈值独立
    p.base['疲劳度'] = 0
    // NOT_SHOW_NON_H_IN_HIDDEN_SEX / DRUNK_LEVEL_NOT_3：未实装系统降级 = erArk 默认值
    expect(evalPrem(['NOT_SHOW_NON_H_IN_HIDDEN_SEX'])).toBe(true)
    expect(evalPrem(['DRUNK_LEVEL_NOT_3'])).toBe(true)
  })

  it('自动注入前提完整性校验：缺展开前提 → warning（SOP §4.1）', () => {
    const mod = modLoader.getMod() as any
    const before = errorReporter.getErrors().length
    // 构造带迁移字段但缺展开前提的指令（h_mode:1 + tired:1 应含 5 个注入前提）
    mod.instructions.push({
      id: 'auto_prem_check', label: '测试',
      erark_id: '9999', erark_h_mode_show_type: 1, erark_tired_type: 1,
      premises: ['HAVE_TARGET'],
      effects: [],
    })
    validateInstructionData()
    const warnings = errorReporter.getErrors().slice(before)
    expect(warnings.some(e => e.severity === 'warning' && e.message.includes('auto_prem_check')
      && e.message.includes('NOT_SHOW_NON_H_IN_HIDDEN_SEX'))).toBe(true)
    expect(warnings.some(e => e.message.includes('DRUNK_LEVEL_NOT_3'))).toBe(true)
    expect(warnings.some(e => e.message.includes('TIRED_LE_84'))).toBe(true)
    // chat 自身带齐全部注入前提 → 无对应 warning
    expect(warnings.some(e => e.message.includes("'chat'") && e.message.includes('自动注入前提'))).toBe(false)
    // 恢复
    mod.instructions = mod.instructions.filter((i: any) => i.id !== 'auto_prem_check')
  })

  it('整批执行后无 error 级错误', () => {
    const errors = errorReporter.getErrors()
    expect(errors.some(e => e.severity === 'error')).toBe(false)
  })
})
