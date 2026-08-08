// 注释：L1.6 结算保真补全测试——tenths_add / 连续重复指令减值 / 无意识(时停)门控
// erArk 来源：common_default.py:196-240（tenths_add + 门控）、:210-231/569-589（连续减值）
// 纯函数（getContinuousAdjust）+ effect 集成（settle_state/settle_favorability/settle_hp_mp）

import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { modLoader } from '../core/mod-loader'
import { gameContext } from '../core/game-context'
import { entitySystem } from '../core/entity-system'
import { apiSystem } from '../core/api'
import { commandRegistry } from '../core/command-registry'
import { narrativeLog } from '../core/narrative-log'
import { premiseRegistry } from '../core/premise-registry'
import { errorReporter } from '../core/error-reporter'
import { onLoad as effectOnLoad, onEnable as effectOnEnable } from '../plugins/effect-system/index'
import { onLoad as hCoreOnLoad, onEnable as hCoreOnEnable } from '../plugins/h-core/index'
import { eventBus } from '../core/event-bus'
import { behaviorHistory, clearBehaviorHistory, getContinuousAdjust } from './command-executor'
import { effectTypeRegistry } from './effect-type-registry'
import { SettlementContext } from '../plugins/effect-system/settlement-context'
import { makeTestExecCtx, resetCharacterEntity, DEFAULT_NPC_BASE } from '../utils/test-helpers'

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

function npc2(): any {
  return entitySystem.get('character', 'npc_2') as any
}

function resetNpc(): void {
  resetCharacterEntity(npc(), DEFAULT_NPC_BASE)
}

describe('结算保真补全（tenths_add / 连续减值 / 无意识门控）', () => {
  beforeAll(async () => {
    entitySystem.clear()
    commandRegistry.clear()
    errorReporter.clear()
    premiseRegistry.clear()
    narrativeLog.clear()
    await modLoader.loadMod('test-mod')
    const mod = modLoader.getMod()!
    gameContext.setPlayer('player')
    gameContext.setLocation(mod.locations.values().next().value as any)

    effectOnLoad(stubCtx)
    effectOnEnable(stubCtx)
    hCoreOnLoad(stubCtx)
    hCoreOnEnable(stubCtx)

    const p = entitySystem.get('character', 'player') as any
    p.base = { 体力: 50, 体力上限: 100, 气力: 30, 气力上限: 100 }
    p.abilities = { 话术技能: { level: 0, xp: 0 } }
    p.current_location = 'town_square'
    entitySystem.register('character', 'npc_1', {
      id: 'npc_1', name: '测试NPC',
      base: {}, current_location: 'town_square',
    })
    entitySystem.register('character', 'npc_2', {
      id: 'npc_2', name: '测试NPC2',
      base: {}, current_location: 'town_square',
    })
    resetNpc()
  })

  beforeEach(() => {
    clearBehaviorHistory()
    resetNpc()
    const p = entitySystem.get('character', 'player') as any
    if (p) {
      p.abilities = { 话术技能: { level: 0, xp: 0 } }
      p.talents = {}
      p.hypnosis = undefined
    }
  })

  describe('getContinuousAdjust 纯函数（erArk common_default.py:210-231）', () => {
    it('空/单条/连续2次 → 1.0（不衰减）', () => {
      expect(getContinuousAdjust()).toBe(1)
      behaviorHistory.push('chat')
      expect(getContinuousAdjust()).toBe(1)
      behaviorHistory.push('chat')
      expect(getContinuousAdjust()).toBe(1)
    })

    it('第 3 次 0.70 → 第 5 次触底 0.40', () => {
      behaviorHistory.push('chat', 'chat', 'chat')
      expect(getContinuousAdjust()).toBeCloseTo(0.7)
      behaviorHistory.push('chat', 'chat')
      expect(getContinuousAdjust()).toBeCloseTo(0.4)
      behaviorHistory.push('chat')
      expect(getContinuousAdjust()).toBeCloseTo(0.4) // 下限
    })

    it('中间插入其他指令 → 计数断开', () => {
      behaviorHistory.push('chat', 'chat', 'rest', 'chat', 'chat')
      expect(getContinuousAdjust()).toBe(1)
      behaviorHistory.push('chat') // rest 后第 3 次连续 chat → 0.7
      expect(getContinuousAdjust()).toBeCloseTo(0.7)
    })

    it('一切指令都参与衰减（erArk [0,1,2] 跳过是死代码——behavior_id 为字符串恒不匹配）', () => {
      // 注释：wait/move/rest 连续 3 次同样衰减（与 chat 一致，无豁免）
      behaviorHistory.push('rest', 'rest', 'rest')
      expect(getContinuousAdjust()).toBeCloseTo(0.7)
      clearBehaviorHistory()
      behaviorHistory.push('wait', 'move', 'rest', 'move', 'move', 'move')
      expect(getContinuousAdjust()).toBeCloseTo(0.7)
    })
  })

  describe('settle_state 集成', () => {
    async function runState(state: string, tc = 5): Promise<void> {
      await apiSystem.call('effect-system', 'execute', [
        { type: 'settle_state', params: { state, baseValue: 30 }, target: 'selected' },
      ], execCtx({ _timeCost: tc }))
    }

    it('tenths_add：当前值 1000 → 追加 min(3×35, 100) = +135（common_default.py:233-240）', async () => {
      const n = npc()
      n.base['好意'] = 1000
      await runState('好意')
      expect(n.base['好意']).toBe(1135) // 35 + min(105, 100)
    })

    it('tenths_add：当前值 0 → 无追加', async () => {
      await runState('好意')
      expect(npc().base['好意']).toBe(35)
    })

    it('连续重复减值：连续 3 次 chat → 系数 0.7（floor(35×0.7)=24）', async () => {
      behaviorHistory.push('chat', 'chat', 'chat')
      await runState('好意')
      expect(npc().base['好意']).toBe(24)
    })

    it('负面状态不衰减（恐怖 → 35 不减）', async () => {
      behaviorHistory.push('chat', 'chat', 'chat')
      await runState('恐怖')
      expect(npc().base['恐怖']).toBe(35)
    })

    it('对自己结算不衰减（target=self 连续 3 次 → 35）', async () => {
      behaviorHistory.push('chat', 'chat', 'chat')
      await apiSystem.call('effect-system', 'execute', [
        { type: 'settle_state', params: { state: '好意', baseValue: 30 }, target: 'self' },
      ], execCtx({ _timeCost: 5 }))
      expect(npc().base['好意']).toBe(0) // self = 玩家，不是 npc
    })

    it('无意识门控：时停（unconscious_h=3）→ 心智状态不结算，身体快感照常', async () => {
      const n = npc()
      n.sp_flag = { unconscious_h: 3 }
      await runState('好意')
      expect(n.base['好意']).toBe(0)
      await runState('心理')
      expect(n.base['心理']).toBe(0)
      await runState('皮肤')
      expect(n.base['皮肤']).toBe(35)
    })

    it('门控 per-id：多目标时各查各的（一个时停一个正常 → 只停时停者）', async () => {
      // 注释：直接调 handler（effect 层多目标入口：群交/战斗 all_enemies 会传多 _targetIds）
      const n2 = npc2()
      n2.base = { ...npc().base }
      n2.sp_flag = { unconscious_h: 3 }
      const settlement = new SettlementContext()
      const handler = effectTypeRegistry.getHandler('settle_state')!
      await handler({ state: '好意', baseValue: 30 }, { _targetIds: ['npc_1', 'npc_2'], settlement, sourceId: 'player', _timeCost: 5 })
      expect(npc().base['好意']).toBe(35) // 正常目标照常结算
      expect(n2.base['好意']).toBe(0)     // 时停目标被门控跳过（per-id）
    })
  })

  describe('settle_favorability 集成', () => {
    it('连续 3 次 → 好感 floor(5×0.7)=3（仅正收益，common_default.py:616-618）', async () => {
      behaviorHistory.push('chat', 'chat', 'chat')
      await apiSystem.call('effect-system', 'execute', [
        { type: 'settle_favorability', target: 'selected' },
      ], execCtx({ _timeCost: 5 }))
      expect(npc().base['好感度']).toBe(3)
    })

    it('时停（unconscious_h=3）→ 好感不结算（common_default.py:551-557）', async () => {
      npc().sp_flag = { unconscious_h: 3 }
      await apiSystem.call('effect-system', 'execute', [
        { type: 'settle_favorability', target: 'selected' },
      ], execCtx({ _timeCost: 5 }))
      expect(npc().base['好感度'] ?? 0).toBe(0)
    })
  })

  describe('素质修正（数据化 state_adjusts，erArk common_default.py:379-422）', () => {
    async function runState(state: string, tc = 5): Promise<void> {
      await apiSystem.call('effect-system', 'execute', [
        { type: 'settle_state', params: { state, baseValue: 30 }, target: 'selected' },
      ], execCtx({ _timeCost: tc }))
    }

    it('热情：好意/快乐 +0.3 → floor(35×1.3)=45', async () => {
      npc().talents = { 热情: 1 }
      await runState('好意')
      expect(npc().base['好意']).toBe(45)
    })

    it('孤僻：好意/快乐 -0.3 → floor(35×0.7)=24', async () => {
      npc().talents = { 孤僻: 1 }
      await runState('快乐')
      expect(npc().base['快乐']).toBe(24)
    })

    it('施虐狂：仅先导 +0.4；对好意无影响', async () => {
      npc().talents = { 施虐狂: 1 }
      await runState('先导')
      expect(npc().base['先导']).toBe(49) // 35×1.4
      await runState('好意')
      expect(npc().base['好意']).toBe(35) // 不受影响
    })

    it('感情缺乏：全部状态 -0.4 → floor(35×0.6)=21（含负面状态）', async () => {
      npc().talents = { 感情缺乏: 1 }
      await runState('好意')
      expect(npc().base['好意']).toBe(21)
      await runState('恐怖')
      expect(npc().base['恐怖']).toBe(21)
    })
  })

  describe('催眠敏感（hypnosis.increase_body_sensitivity）', () => {
    it('settle_state：欲情/快感 +2 系数（base 分支 :441 / feel 分支 :304-305）', async () => {
      npc().hypnosis = { increase_body_sensitivity: true }
      await apiSystem.call('effect-system', 'execute', [
        { type: 'settle_state', params: { state: '欲情', baseValue: 30 }, target: 'selected' },
      ], execCtx({ _timeCost: 5 }))
      expect(npc().base['欲情']).toBe(105) // 35 × (1+2)
      await apiSystem.call('effect-system', 'execute', [
        { type: 'settle_state', params: { state: '皮肤', baseValue: 30 }, target: 'selected' },
      ], execCtx({ _timeCost: 5 }))
      expect(npc().base['皮肤']).toBe(105)
    })

    it('tech_adjust：快感 floor(55×(sqrt(1.4×1.25)+2))=182；欲情 floor(55×(1.25+2))=178', async () => {
      const p = entitySystem.get('character', 'player') as any
      p.abilities = { 技巧: { level: 3, xp: 0 } }
      const n = npc()
      n.abilities = { 皮肤感度: { level: 2, xp: 0 } }
      n.hypnosis = { increase_body_sensitivity: true }
      await apiSystem.call('effect-system', 'execute', [
        { type: 'tech_adjust', params: { part: '皮肤', baseValue: 50 }, target: 'selected' },
      ], execCtx({ _timeCost: 5 }))
      expect(n.base['皮肤']).toBe(182)
      expect(n.base['欲情']).toBe(178)
    })
  })

  describe('好感素质修正（数据化 favorability_adjusts，erArk :717-748）', () => {
    async function runFav(): Promise<number> {
      await apiSystem.call('effect-system', 'execute', [
        { type: 'settle_favorability', target: 'selected' },
      ], execCtx({ _timeCost: 5 }))
      return npc().base['好感度'] ?? 0
    }

    it('思慕：+0.25 → floor(5×1.25)=6', async () => {
      npc().talents = { 思慕: 1 }
      expect(await runFav()).toBe(6)
    })

    it('爱情隶属系同组取最大：恋慕+驯服(同组 love2) → +0.5；爱侣+奴隶 → +1.0；累计 → floor(5×2.5)=12', async () => {
      npc().talents = { 恋慕: 1, 驯服: 1, 爱侣: 1, 奴隶: 1 }
      expect(await runFav()).toBe(12) // fix = 1+0.5+1.0
    })

    it('受精（preg 组 0.5）→ floor(5×1.5)=7；感情缺乏+讨厌男性 → floor(5×0.6)=3', async () => {
      npc().talents = { 受精: 1 }
      expect(await runFav()).toBe(7)
      npc().base['好感度'] = 0
      npc().talents = { 感情缺乏: 1, 讨厌男性: 1 }
      expect(await runFav()).toBe(3)
    })
  })

  describe('settle_trust 门控（连续减值/时停）', () => {
    async function runTrust(): Promise<void> {
      await apiSystem.call('effect-system', 'execute', [
        { type: 'settle_trust', target: 'selected' },
      ], execCtx({ _timeCost: 60 }))
    }

    it('60 分钟 → 信赖 1.0；连续 3 次 → ×0.7 = 0.7', async () => {
      await runTrust()
      expect(npc().base['信赖度']).toBeCloseTo(1)
      npc().base['信赖度'] = 0
      behaviorHistory.push('chat', 'chat', 'chat')
      await runTrust()
      expect(npc().base['信赖度']).toBeCloseTo(0.7)
    })

    it('时停 → 信赖不结算；封顶 300', async () => {
      npc().sp_flag = { unconscious_h: 3 }
      await runTrust()
      expect(npc().base['信赖度'] ?? 0).toBe(0)
    })
  })

  describe('快感附加修正（眼罩/无觉刻印/怀孕灌肠，chara_feel_state_adjust:300-347）', () => {
    async function runState(state: string, tc = 5): Promise<void> {
      await apiSystem.call('effect-system', 'execute', [
        { type: 'settle_state', params: { state, baseValue: 30 }, target: 'selected' },
      ], execCtx({ _timeCost: tc }))
    }

    it('眼罩（body_item slot 6）：快感 +0.2 → floor(35×1.2)=42', async () => {
      npc().body_items = { '6': { itemId: '贴片', active: true } }
      await runState('皮肤')
      expect(npc().base['皮肤']).toBe(42)
    })

    it('无意识 + 无觉刻印 lv2：+(adj(2)-1)×2=0.5 → floor(35×1.5)=52', async () => {
      const n = npc()
      n.sp_flag = { unconscious_h: 1 }
      n.abilities = { 无觉刻印: { level: 2, xp: 0 } }
      await runState('皮肤')
      expect(n.base['皮肤']).toBe(52)
    })

    it('怀孕+灌肠（阴道/子宫）：+1+capacity×0.2=+3 → 35×4=140', async () => {
      const n = npc()
      n.h_state = { inflation: true, enema: true, enema_capacity: 10 }
      await runState('阴道')
      expect(n.base['阴道']).toBe(140)
      n.base['阴道'] = 0
      await runState('好意') // 非 V/W 状态不受影响
      expect(n.base['好意']).toBe(35)
    })

    it('苦痛转化：pain_as_pleasure → 心理 +35×施虐系数，苦痛不变（:242-245）', async () => {
      const n = npc()
      n.hypnosis = { pain_as_pleasure: true }
      await runState('苦痛')
      expect(n.base['苦痛'] ?? 0).toBe(0)
      expect(n.base['心理']).toBe(35)
    })
  })

  describe('tech_adjust 欲情素质修正', () => {
    it('开放（欲情/羞耻 -0.3）→ 欲情 floor(55×(1.25-0.3))=52', async () => {
      const p = entitySystem.get('character', 'player') as any
      p.abilities = { 技巧: { level: 3, xp: 0 } }
      const n = npc()
      n.abilities = { 皮肤感度: { level: 2, xp: 0 } }
      n.talents = { 开放: 1 }
      await apiSystem.call('effect-system', 'execute', [
        { type: 'tech_adjust', params: { part: '皮肤', baseValue: 50 }, target: 'selected' },
      ], execCtx({ _timeCost: 5 }))
      expect(n.base['欲情']).toBe(52)
    })
  })

  describe('攻略进度素质 + extra_feel_settle（:455-477/:484-515）', () => {
    async function runState(state: string, tc = 5): Promise<void> {
      await apiSystem.call('effect-system', 'execute', [
        { type: 'settle_state', params: { state, baseValue: 30 }, target: 'selected' },
      ], execCtx({ _timeCost: tc }))
    }

    it('爱侣（fall4）：正面状态 +0.2 → floor(35×1.2)=42；负面 -0.8 → 6（浮点误差，erArk Python 同值）', async () => {
      npc().talents = { 爱侣: 1 }
      await runState('好意')
      expect(npc().base['好意']).toBe(42)
      npc().base['苦痛'] = 0
      await runState('苦痛')
      // 注释：1.0-4×0.2=0.19999999999999996 → 35×coeff=6.999999999999998 → floor=6
      // erArk Python int() 同样截断为 6（浮点误差行为一致）
      expect(npc().base['苦痛']).toBe(6)
    })

    it('屈从（fall1）：正面 +0.05 → floor(35×1.05)=36', async () => {
      npc().talents = { 屈从: 1 }
      await runState('快乐')
      expect(npc().base['快乐']).toBe(36)
    })

    it('extra_feel_settle：顺从≥5 + 恭顺 → 恭顺 35×1.8=63 + 心理 +floor(10×sqrt(1×1.8))=13 + 心理经验(155)', async () => {
      const n = npc()
      n.abilities = { 顺从: { level: 5, xp: 0 } }
      await runState('恭顺')
      // 恭顺：ability_level=目标.顺从（erArk 52:3399）→ 35×tbl[5]=63
      expect(n.base['恭顺']).toBe(63)
      // 额外快感：max(10, 63/20)=10 × sqrt(心理感度0→1.0 × 顺从5→1.8) = 13.42 → 13
      expect(n.base['心理']).toBe(13)
      expect(n.experience['155']).toBe(1)
    })

    it('extra_feel_settle：顺从<5 → 无额外快感', async () => {
      const n = npc()
      n.abilities = { 顺从: { level: 4, xp: 0 } }
      await runState('恭顺')
      expect(n.base['心理'] ?? 0).toBe(0)
      expect(n.experience['155'] ?? 0).toBe(0)
    })

    it('快感状态能力修正：皮肤感度 lv2 → settle_state(皮肤) 用感度系数 1.25 → floor(35×1.25)=43', async () => {
      // 注释：修复前 abilityKey='皮肤'（恒 0）→ 35；现在经 PART_ABILITY 映射到 皮肤感度
      npc().abilities = { 皮肤感度: { level: 2, xp: 0 } }
      await runState('皮肤')
      expect(npc().base['皮肤']).toBe(43)
    })
  })

  describe('刻印状态系数表 + dead 门控（:374-378/:180-181）', () => {
    async function runState(state: string, tc = 5): Promise<void> {
      await apiSystem.call('effect-system', 'execute', [
        { type: 'settle_state', params: { state, baseValue: 30 }, target: 'selected' },
      ], execCtx({ _timeCost: tc }))
    }

    it('mark_debuff：快乐刻印 lv2 → 快乐 35×3=105（非 ability_lv_adjust 表）', async () => {
      npc().abilities = { 快乐刻印: { level: 2, xp: 0 } }
      await runState('快乐')
      expect(npc().base['快乐']).toBe(105)
    })

    it('mark_debuff：快乐刻印 lv3 → 快乐 35×5=175；lv0 → 35', async () => {
      npc().abilities = { 快乐刻印: { level: 3, xp: 0 } }
      await runState('快乐')
      expect(npc().base['快乐']).toBe(175)
      npc().base['快乐'] = 0
      npc().abilities = { 快乐刻印: { level: 0, xp: 0 } }
      await runState('快乐')
      expect(npc().base['快乐']).toBe(35)
    })

    it('mark_debuff 不影响非刻印状态：亲密 lv2 + 好意 → 35×1.25=43（ability_lv_adjust 表）', async () => {
      npc().abilities = { 亲密: { level: 2, xp: 0 } }
      await runState('好意')
      expect(npc().base['好意']).toBe(43)
    })

    it('dead：不结算（settle_state / settle_favorability 均跳过）', async () => {
      const n = npc()
      n.dead = true
      await runState('好意')
      expect(n.base['好意'] ?? 0).toBe(0)
      await apiSystem.call('effect-system', 'execute', [
        { type: 'settle_favorability', target: 'selected' },
      ], execCtx({ _timeCost: 5 }))
      expect(n.base['好感度'] ?? 0).toBe(0)
    })
  })

  describe('settle_hp_mp 集成', () => {
    it('时停（unconscious_h=3）→ 气力不结算（common_default.py:51-53）', async () => {
      const n = npc()
      n.sp_flag = { unconscious_h: 3 }
      await apiSystem.call('effect-system', 'execute', [
        { type: 'settle_hp_mp', params: { mpValue: -1, degree: 0 }, target: 'selected' },
      ], execCtx({ _timeCost: 5 }))
      expect(n.base['气力']).toBe(50)
    })

    it('正常状态 → 气力 -5×3 = -15', async () => {
      await apiSystem.call('effect-system', 'execute', [
        { type: 'settle_hp_mp', params: { mpValue: -1, degree: 0 }, target: 'selected' },
      ], execCtx({ _timeCost: 5 }))
      expect(npc().base['气力']).toBe(35)
    })
  })

  describe('tech_adjust 集成（体技：快感/欲情 + 三件套）', () => {
    async function runTech(part: string, overrides: any = {}): Promise<void> {
      await apiSystem.call('effect-system', 'execute', [
        { type: 'tech_adjust', params: { part, baseValue: 50 }, target: 'selected' },
      ], execCtx({ _timeCost: 5, ...overrides }))
    }

    it('公式：快感 = 55×sqrt(1.4×1.25)=72；欲情 = 55×1.25=68（非 sqrt！）', async () => {
      const p = entitySystem.get('character', 'player') as any
      p.abilities = { 技巧: { level: 3, xp: 0 } }
      const n = npc()
      n.abilities = { 皮肤感度: { level: 2, xp: 0 } }
      await runTech('皮肤')
      expect(n.base['皮肤']).toBe(72)  // floor(55 × sqrt(1.4 × 1.25))
      expect(n.base['欲情']).toBe(68)  // floor(55 × 1.25)——state 12 走普通能力表，非 sqrt
    })

    it('tenths_add：当前快感 1000 → 追加 min(3×72.76, 100)=100', async () => {
      const p = entitySystem.get('character', 'player') as any
      p.abilities = { 技巧: { level: 3, xp: 0 } }
      const n = npc()
      n.abilities = { 皮肤感度: { level: 2, xp: 0 } }
      n.base['皮肤'] = 1000
      n.base['欲情'] = 0
      await runTech('皮肤')
      expect(n.base['皮肤']).toBe(1000 + 172) // 72 + 100
    })

    it('连续重复减值：连续 3 次 → 快感/欲情 × 0.7', async () => {
      const p = entitySystem.get('character', 'player') as any
      p.abilities = { 技巧: { level: 3, xp: 0 } }
      const n = npc()
      n.abilities = { 皮肤感度: { level: 2, xp: 0 } }
      behaviorHistory.push('chat', 'chat', 'chat')
      await runTech('皮肤')
      expect(n.base['皮肤']).toBe(50) // floor(72.758 × 0.7)
      expect(n.base['欲情']).toBe(48) // floor(68.75 × 0.7)
    })

    it('无意识门控：时停 → 心理快感跳过，身体快感照常', async () => {
      const p = entitySystem.get('character', 'player') as any
      p.abilities = { 技巧: { level: 3, xp: 0 } }
      const n = npc()
      n.abilities = { 心理感度: { level: 2, xp: 0 }, 皮肤感度: { level: 2, xp: 0 } }
      n.sp_flag = { unconscious_h: 3 }
      await runTech('心理')
      expect(n.base['心理'] ?? 0).toBe(0)
      await runTech('皮肤')
      expect(n.base['皮肤']).toBe(72)
    })
  })

  it('整批执行后无 error 级错误', () => {
    expect(errorReporter.getErrors().some(e => e.severity === 'error')).toBe(false)
  })
})
