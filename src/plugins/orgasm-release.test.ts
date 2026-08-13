// 注释：orgasm 释放与 roll_count 压缩测试（2026-08-08 对齐 erArk orgasm_settle.py 更新）
// 覆盖：
//   1. 解放状态 roll_count 压缩（climax>=3 → 0 次普通 roll + 1 次超强；1-2 → 1 次；非解放 → 全部）
//   2. releaseOrgasmEdge（退出 H 释放寸止累计——原静默丢弃）+ 集成 end_h 路径
//   3. releaseTimeStopOrgasm（时停解除释放时停累计）
//   4. judgeOrgasmEdgeSuccess 多部位幂修正（0.15 失败率 + ^max(1,k/2)）
//   5. handleOrgasmResults 日志按部位聚合（口上只显示最高程度，h:orgasm 事件逐条保留）
//   6. 绝顶附加状态（erArk 二段行为效果：润滑/体力/气力/欲情/快乐/苦痛反感减）

import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { modLoader } from '../core/mod-loader'
import { gameContext } from '../core/game-context'
import { entitySystem } from '../core/entity-system'
import { apiSystem } from '../core/api'
import { narrativeLog } from '../core/narrative-log'
import { eventBus } from '../core/event-bus'
import { commandRegistry } from '../core/command-registry'
import { errorReporter } from '../core/error-reporter'
import { settleOrgasm, releaseOrgasmEdge, releaseTimeStopOrgasm, judgeOrgasmEdgeSuccess } from './h-core/settle/orgasm'
import { onLoad as effectOnLoad, onEnable as effectOnEnable } from './effect-system/index'
import { onLoad as hCoreOnLoad, onEnable as hCoreOnEnable } from './h-core/index'
import { makeTestExecCtx, resetCharacterEntity, DEFAULT_NPC_BASE, DEFAULT_PLAYER_BASE } from '../utils/test-helpers'

const stubCtx: any = {
  api: apiSystem,
  events: eventBus,
  commands: commandRegistry,
  ui: { registerSlot: () => {} },
}

function registerOrgasmChar(id: string, hState: any, params: Record<string, number>, abilities: any = {}): any {
  entitySystem.register('character', id, { id, name: `角色${id}`, h_state: hState, params, abilities, base: {} })
  return entitySystem.get('character', id) as any
}

function npc(): any {
  return entitySystem.get('character', 'npc_1') as any
}

describe('orgasm 释放与 roll_count 压缩（erArk orgasm_settle.py 对齐）', () => {
  beforeAll(async () => {
    entitySystem.clear()
    errorReporter.clear()
    await modLoader.loadMod('test-mod')
    const mod = modLoader.getMod()!
    gameContext.setPlayer('player')
    gameContext.setLocation(mod.locations.values().next().value as any)
    effectOnLoad(stubCtx)
    effectOnEnable(stubCtx)
    hCoreOnLoad(stubCtx)
    hCoreOnEnable(stubCtx)
    const p = entitySystem.get('character', 'player') as any
    resetCharacterEntity(p, DEFAULT_PLAYER_BASE)
    p.current_location = 'town_square'
    entitySystem.register('character', 'npc_1', { id: 'npc_1', name: '测试NPC', base: {}, current_location: 'town_square' })
    resetCharacterEntity(npc(), DEFAULT_NPC_BASE)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    narrativeLog.clear()
  })

  describe('roll_count 压缩（解放状态只显示最高程度）', () => {
    function baseHState(overrides: any = {}): any {
      return {
        is_h: true,
        orgasm_level: { 4: 0 },
        orgasm_edge: 0,
        orgasm_edge_count: {},
        time_stop_orgasm_count: {},
        extra_orgasm_feel: {},
        extra_orgasm_count: 0,
        plural_orgasm_set: [],
        ...overrides,
      }
    }

    it('非解放状态：climax 3 → 3 条事件（每次高潮一条，程度按概率）', () => {
      const ch = registerOrgasmChar('rc_1', baseHState(), {})
      const spy = vi.spyOn(Math, 'random')
      spy.mockReturnValue(0.5) // < 0.98 → 小绝顶
      const result = settleOrgasm('rc_1', { 4: 3 }, {}, {})
      expect(result.orgasms).toHaveLength(3)
      expect(result.orgasms.every(e => e.degree === 0)).toBe(true)
      expect(ch.h_state.orgasm_level[4]).toBe(3)
    })

    it('解放状态（orgasm_edge=2）climax 3 → 仅 1 条超强（感度<6 降为强）', () => {
      const ch = registerOrgasmChar('rc_2', baseHState({ orgasm_edge: 2 }), {}, { 阴道感度: { level: 3 } })
      const result = settleOrgasm('rc_2', { 4: 3 }, {}, {})
      // roll_count=0 + 超强分支 1 条；感度 3 < 6 → degree 2
      expect(result.orgasms).toHaveLength(1)
      expect(result.orgasms[0].degree).toBe(2)
      expect(ch.h_state.orgasm_level[4]).toBe(3)
    })

    it('解放状态 climax 3 + 感度 6 → 超强绝顶（degree 3）', () => {
      registerOrgasmChar('rc_3', baseHState({ orgasm_edge: 2 }), {}, { 阴道感度: { level: 6 } })
      const result = settleOrgasm('rc_3', { 4: 3 }, {}, {})
      expect(result.orgasms).toHaveLength(1)
      expect(result.orgasms[0].degree).toBe(3)
    })

    it('解放状态 climax 2 → 仅 1 条普通程度（roll 1 次，无超强分支）', () => {
      registerOrgasmChar('rc_4', baseHState({ orgasm_edge: 2 }), {}, { 阴道感度: { level: 3 } })
      const spy = vi.spyOn(Math, 'random')
      spy.mockReturnValue(0.5)
      const result = settleOrgasm('rc_4', { 4: 2 }, {}, {})
      expect(result.orgasms).toHaveLength(1)
      expect(result.orgasms[0].degree).toBe(0)
    })

    it('时停解放（time_stop_release=true）climax 3 → 1 条超强', () => {
      registerOrgasmChar('rc_5', baseHState({ time_stop_release: true }), {}, { 阴道感度: { level: 6 } })
      const result = settleOrgasm('rc_5', { 4: 3 }, {}, {})
      expect(result.orgasms).toHaveLength(1)
      expect(result.orgasms[0].degree).toBe(3)
    })
  })

  describe('releaseOrgasmEdge（退出 H 释放寸止累计）', () => {
    it('寸止状态 + 累计 3 → 1 条超强（感度<6 → 强）、计数清空、orgasm_level 不更新', () => {
      const ch = registerOrgasmChar('re_1', {
        is_h: true,
        orgasm_level: { 4: 5 },
        orgasm_edge: 1,
        orgasm_edge_count: { 4: 3 },
        time_stop_orgasm_count: {},
        extra_orgasm_feel: {},
        extra_orgasm_count: 0,
        plural_orgasm_set: [],
      }, {}, { 阴道感度: { level: 3 } })
      const result = releaseOrgasmEdge('re_1')
      expect(result.orgasms).toHaveLength(1)
      expect(result.orgasms[0].degree).toBe(2)
      // un_count（不计数高潮）不计入 orgasm_level 记录（erArk：now_data = pre + normal，un_count 除外）
      expect(ch.h_state.orgasm_level[4]).toBe(5)
      // 计数清空（置 0 保留键）、状态置解放
      expect(ch.h_state.orgasm_edge).toBe(2)
      expect(ch.h_state.orgasm_edge_count[4]).toBe(0)
    })

    it('未在寸止状态（orgasm_edge=0）→ 空结果，无副作用', () => {
      const ch = registerOrgasmChar('re_2', {
        is_h: true, orgasm_level: { 4: 0 }, orgasm_edge: 0,
        orgasm_edge_count: { 4: 3 }, time_stop_orgasm_count: {},
      }, {})
      const result = releaseOrgasmEdge('re_2')
      expect(result.orgasms).toHaveLength(0)
      expect(ch.h_state.orgasm_level[4]).toBe(0)
      expect(ch.h_state.orgasm_edge_count[4]).toBe(3) // 未清空
    })

    it('集成：end_h 退出 H → 寸止累计被释放（日志输出绝顶 + h_state 清理）', async () => {
      // 开始 H
      await apiSystem.call('effect-system', 'execute', [
        { type: 'h_start_h', params: { targetId: 'npc_1' }, target: 'self' },
      ], makeTestExecCtx())
      const n = npc()
      // 目标处于寸止状态 + 累计 3 次寸止
      n.h_state.orgasm_edge = 1
      n.h_state.orgasm_edge_count = { 4: 3 }
      n.h_state.orgasm_level = { 4: 5 }
      n.abilities = { 阴道感度: { level: 3 } }
      narrativeLog.clear()
      // 结束 H（endHScene 清 h_state 前释放寸止累计）
      await apiSystem.call('effect-system', 'execute', [
        { type: 'h_end_h', target: 'self' },
      ], makeTestExecCtx())
      const logs = narrativeLog.getEntries().map((e: any) => String(e.text)).join('|')
      expect(logs).toContain('绝顶')
      expect(n.h_state).toBeUndefined()
    })
  })

  describe('releaseTimeStopOrgasm（时停解除释放）', () => {
    it('时停累计 3 → 1 条超强、计数清空、time_stop_release 置位', () => {
      const ch = registerOrgasmChar('rt_1', {
        is_h: true,
        orgasm_level: { 4: 0 },
        orgasm_edge: 0,
        orgasm_edge_count: {},
        time_stop_orgasm_count: { 4: 3 },
        time_stop_release: false,
        extra_orgasm_feel: {},
        extra_orgasm_count: 0,
        plural_orgasm_set: [],
      }, {}, { 阴道感度: { level: 6 } })
      const result = releaseTimeStopOrgasm('rt_1')
      expect(result.orgasms).toHaveLength(1)
      expect(result.orgasms[0].degree).toBe(3)
      expect(ch.h_state.time_stop_release).toBe(true)
      expect(ch.h_state.time_stop_orgasm_count[4]).toBe(0)
    })

    it('无时停累计 → 空结果', () => {
      registerOrgasmChar('rt_2', {
        is_h: true, orgasm_level: {}, orgasm_edge: 0,
        orgasm_edge_count: {}, time_stop_orgasm_count: {},
      }, {})
      const result = releaseTimeStopOrgasm('rt_2')
      expect(result.orgasms).toHaveLength(0)
    })
  })

  describe('judgeOrgasmEdgeSuccess 多部位幂修正（erArk orgasm_settle.py:423-426）', () => {
    it('超限 5：单部位失败率 0.75，四部位失败率 0.9375（success^2 稀释）', () => {
      // 计数 {4:2, 5:2} 平方和 8，技巧 1 → 超限 3-8 = -5 → failRate 0.75
      // crossed=1 → success = 0.25^1；crossed=4 → 0.25^2 = 0.0625
      const spy = vi.spyOn(Math, 'random')
      spy.mockReturnValue(0.8)
      // crossed=1：0.8 >= 1-0.25=0.75 → 成功
      expect(judgeOrgasmEdgeSuccess({ 4: 2, 5: 2 }, 1, 1)).toBe(true)
      // crossed=4：0.8 < 1-0.0625=0.9375 → 失败
      expect(judgeOrgasmEdgeSuccess({ 4: 2, 5: 2 }, 1, 4)).toBe(false)
      // 边界：crossed=1 时 random 0.74 → 失败
      spy.mockReturnValue(0.74)
      expect(judgeOrgasmEdgeSuccess({ 4: 2, 5: 2 }, 1, 1)).toBe(false)
    })
  })

  describe('寸止成功路径 + orgasm_count 记录（审查补充）', () => {
    function edgeHState(overrides: any = {}): any {
      return {
        is_h: true,
        orgasm_level: { 4: 0 },
        orgasm_edge: 1,
        orgasm_edge_count: {},
        time_stop_orgasm_count: {},
        extra_orgasm_feel: {},
        extra_orgasm_count: 0,
        plural_orgasm_set: [],
        ...overrides,
      }
    }

    it('寸止成功：判定一次（快照语义）→ 计数累计到被结算角色自己', () => {
      // 玩家技巧 5（5×3=15 远超阈值）→ 寸止成功，计数累计到被结算角色自己而非清零
      // 玩家 id='0'（erArk 默认）——gameContext 玩家需指向它（2026-08-13 审计：
      // 玩家判定统一走 gameContext，测试环境双玩家（beforeAll 'player' + 用例 '0'）需显式对齐）
      entitySystem.register('character', '0', {
        id: '0', name: '玩家', base: {}, abilities: { 技巧: { level: 5 } },
      })
      gameContext.setPlayer('0')
      const ch = registerOrgasmChar('es_1', edgeHState(), {})
      const spy = vi.spyOn(Math, 'random')
      spy.mockReturnValue(0.5)
      const result = settleOrgasm('es_1', { 4: 2, 5: 1 }, {}, {})
      console.log('[dbg-orgasm]', JSON.stringify({ edge: ch.h_state.orgasm_edge, count: ch.h_state.orgasm_edge_count, result: result?.orgasms }))
      // 寸止成功 → 无高潮事件（continue），计数累计
      expect(result.orgasms).toHaveLength(0)
      expect(ch.h_state.orgasm_edge_count[4]).toBe(2)
      expect(ch.h_state.orgasm_edge_count[5]).toBe(1)
      expect(ch.h_state.orgasm_edge).toBe(1) // 仍寸止中
    })

    it('orgasm_count 记录：3 次高潮 → [0]/[1] 各 +3（h-mark/h-group-sex 消费方）', () => {
      const ch = registerOrgasmChar('es_2', { ...edgeHState(), orgasm_edge: 0 }, {})
      const spy = vi.spyOn(Math, 'random')
      spy.mockReturnValue(0.5)
      const result = settleOrgasm('es_2', { 4: 3 }, {}, {})
      expect(result.orgasms).toHaveLength(3)
      expect(ch.h_state.orgasm_count[4][0]).toBe(3)
      expect(ch.h_state.orgasm_count[4][1]).toBe(3)
    })

    it('orgasm_count 记录：B绝顶喷乳不计入（erArk：独立行为 b_orgasm_to_milk）', () => {
      const ch = registerOrgasmChar('es_3', { ...edgeHState(), orgasm_edge: 0 }, {})
      ch.pregnancy = { milk: 100, milk_max: 100 } // ratio 1.0 > 0.8 → 喷乳
      const spy = vi.spyOn(Math, 'random')
      spy.mockReturnValue(0.5)
      const result = settleOrgasm('es_3', { 1: 1 }, {}, {})
      // 胸部绝顶 1 条 + 喷乳 1 条（extra=false 的独立事件）
      expect(result.orgasms).toHaveLength(2)
      expect(ch.h_state.orgasm_count[1][0]).toBe(1) // 仅绝顶 1 次，喷乳不 +1
    })

    it('extra 分支：preData>=10 且 extraAdd=0 → 无高潮（不回落等级差）', () => {
      // 已 10 级 + 无 pending 快感 → extraAdd 0 → erArk normal = 0（等 extra 累积）
      const ch = registerOrgasmChar('es_4', { ...edgeHState(), orgasm_edge: 0, orgasm_level: { 4: 10 } }, {})
      const result = settleOrgasm('es_4', { 4: 0 }, {}, {})
      // normal 0 + extra 0 → 无高潮；orgasm_level 不更新
      expect(result.orgasms).toHaveLength(0)
      expect(ch.h_state.orgasm_level[4]).toBe(10)
    })

    it('extra 分支：pending 20000 达阈值 → extraAdd 1 → 1 条 extra 高潮', async () => {
      const ch = registerOrgasmChar('es_5', { ...edgeHState(), orgasm_edge: 0, orgasm_level: { 4: 10 } }, {})
      const spy = vi.spyOn(Math, 'random')
      spy.mockReturnValue(0.5)
      // 直接调 orgasmJudge 路径：pending_orgasm_feel 驱动
      const { orgasmJudge } = await import('./h-core/settle/orgasm')
      ch.h_state.pending_orgasm_feel = { 4: 20000 }
      const result = await orgasmJudge('es_5')
      expect(result.orgasms).toHaveLength(1)
      expect(result.orgasms[0].extra).toBe(true)
      expect(ch.h_state.orgasm_level[4]).toBe(11)
    })

    it('时停释放标志：下一次行动开始重置（对齐 erArk handle_npc_ai_in_h.py:99）', async () => {
      const n = npc()
      n.h_state = { is_h: true, time_stop_release: true }
      // 注释：重置由 h-core execution_start 监听器执行（对 H 中带标志角色循环重置）；
      // 直接 emit 事件（指令路径的前提互斥——目标在 H 时玩家指令不可用，2026-08-13 审计）
      await eventBus.emit('game:execution_start', { commandId: 'test' })
      expect(n.h_state.time_stop_release).toBe(false)
    })
  })

  describe('handleOrgasmResults 日志聚合（h:orgasm 事件逐条保留）', () => {
    it('同部位 3 次小绝顶 → 日志仅 1 条；事件 3 条', async () => {
      const n = npc()
      n.h_state = { is_h: true }
      n.h_state.orgasm_level = { 4: 0 }
      // 注意：getEntityAttr 按 SEARCH_ORDER 先查 base——DEFAULT_NPC_BASE 含 '阴道'，写 base
      n.base['阴道'] = 1000 // 等级 3 → normal 3 次高潮
      const events: any[] = []
      const handler = (p: any) => { events.push(p) }
      eventBus.on('h:orgasm', handler)
      const spy = vi.spyOn(Math, 'random')
      spy.mockReturnValue(0.5) // 小绝顶 ×3
      // 走真实执行路径：h_orgasm_check → orgasmJudge → handleOrgasmResults（聚合）
      await apiSystem.call('effect-system', 'execute', [
        { type: 'h_orgasm_check', target: 'selected' },
      ], makeTestExecCtx())
      const logs = narrativeLog.getEntries().map((e: any) => String(e.text)).join('|')
      // 3 条小绝顶 → 聚合为 1 条（同部位最高程度）
      expect(logs.match(/小绝顶/g)?.length ?? 0).toBe(1)
      // h:orgasm 事件逐条保留（数值消费方依赖每条）
      expect(events.length).toBe(3)
      eventBus.off('h:orgasm', handler)
      n.h_state = undefined
      n.base['阴道'] = 0
    })
  })

  describe('绝顶附加状态（erArk 二段行为效果：润滑/体力/气力/欲情/快乐/苦痛反感减）', () => {
    function sideHState(overrides: any = {}): any {
      return {
        is_h: true,
        orgasm_level: { 4: 0 },
        orgasm_edge: 0,
        orgasm_edge_count: {},
        time_stop_orgasm_count: {},
        extra_orgasm_feel: {},
        extra_orgasm_count: 0,
        plural_orgasm_set: [],
        ...overrides,
      }
    }

    it('small 档：润滑+300、气力-60、欲情+20、快乐+20（无体力/苦痛减）', () => {
      const ch = registerOrgasmChar('se_1', sideHState(), {})
      ch.base = { ...DEFAULT_NPC_BASE, 润滑: 0, 欲情: 0, 快乐: 0 }
      const spy = vi.spyOn(Math, 'random')
      spy.mockReturnValue(0.5) // degree 0
      settleOrgasm('se_1', { 4: 1 }, {}, {}, { continuous: 1, isGroupSex: false })
      expect(ch.base['润滑']).toBe(300)
      expect(ch.base['气力']).toBe(0) // 50-60 clamp 0（calcHpMpChange MP 下限 0）
      expect(ch.base['欲情']).toBe(20)
      expect(ch.base['快乐']).toBe(20)
      expect(ch.base['体力']).toBe(80) // small 无体力扣
      expect(ch.base['苦痛']).toBe(0)
    })

    it('normal 档：润滑+300、体力-10、气力-60、欲情+100、快乐+100、苦痛/反感减', () => {
      const ch = registerOrgasmChar('se_2', sideHState(), {})
      ch.base = { ...DEFAULT_NPC_BASE, 润滑: 0, 欲情: 0, 快乐: 0, 苦痛: 100, 反感: 0 }
      const spy = vi.spyOn(Math, 'random')
      spy.mockReturnValue(0.99) // degree 1（≥0.98 → normal）
      settleOrgasm('se_2', { 4: 1 }, {}, {}, { continuous: 1, isGroupSex: false })
      expect(ch.base['润滑']).toBe(300)
      expect(ch.base['体力']).toBe(80 - 10) // 10分×1
      expect(ch.base['气力']).toBe(0) // 50-60 clamp 0（calcHpMpChange MP 下限 0）
      expect(ch.base['欲情']).toBe(100)
      expect(ch.base['快乐']).toBe(100)
      // 苦痛 100 → -(50 + 100/10) = -60 → 40（系数：苦痛刻印 0 → 1.0）
      expect(ch.base['苦痛']).toBe(40)
      // 反感 0 → -(50 + 0) = -50 → clamp 0
      expect(ch.base['反感']).toBe(0)
    })

    it('middle 档 tenths=True：欲情当前 100 → +100 基础 + min(300, 10) tenths = +110', () => {
      const ch = registerOrgasmChar('se_3', sideHState(), {})
      ch.base = { ...DEFAULT_NPC_BASE, 润滑: 0, 欲情: 100, 快乐: 0 }
      const spy = vi.spyOn(Math, 'random')
      spy.mockReturnValue(0.99) // degree 1（normal 档欲情 middle tenths=True）
      settleOrgasm('se_3', { 4: 1 }, {}, {}, { continuous: 1, isGroupSex: false })
      expect(ch.base['欲情']).toBe(100 + 100 + 10)
    })

    it('super 档（解放≥3 + 感度6）：润滑+3000、体力-60、气力-300、欲情/快乐+1000', () => {
      const ch = registerOrgasmChar('se_4', sideHState({ orgasm_edge: 2 }), {}, { 阴道感度: { level: 6 } })
      ch.base = { ...DEFAULT_NPC_BASE, 润滑: 0, 欲情: 0, 快乐: 0 }
      settleOrgasm('se_4', { 4: 3 }, {}, {}, { continuous: 1, isGroupSex: false })
      // 解放 climax 3 → 超强分支 degree 3 → super 档
      expect(ch.base['润滑']).toBe(3000)
      expect(ch.base['体力']).toBe(80 - 60) // 20分×3
      expect(ch.base['气力']).toBe(0) // 50-300 clamp 0
      expect(ch.base['欲情']).toBe(1000)
      expect(ch.base['快乐']).toBe(1000)
    })

    it('润滑无能力系数（欲望等级不影响润滑）+ 欲情吃欲望等级', () => {
      const ch = registerOrgasmChar('se_5', sideHState(), {}, { 欲望: { level: 5 } })
      ch.base = { ...DEFAULT_NPC_BASE, 润滑: 0, 欲情: 0 }
      const spy = vi.spyOn(Math, 'random')
      spy.mockReturnValue(0.5) // degree 0（small：欲情 +20，能力=欲望）
      settleOrgasm('se_5', { 4: 1 }, {}, {}, { continuous: 1, isGroupSex: false })
      // 润滑系数 1.0（erArk 无 ability_level）→ 300；欲情 20×ability_lv_adjust[5]=1.8 → 36
      expect(ch.base['润滑']).toBe(300)
      expect(ch.base['欲情']).toBe(Math.floor(20 * 1.8))
    })
  })
})
