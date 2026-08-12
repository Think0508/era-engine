// 注释：T1 权重系统测试——weightAllToOne（口上权重，erArk weight_all_to_1 语义）+ 口上同池权重竞争（pickWeightedLine）
// erArk 依据：get_weight_from_premise_dict（handle_premise/__init__.py:246-300）+
// choice_talk_from_talk_data（talk.py:225-260，权重区间随机 + 角色专属×draw_setting[14]）

import { conditionEngine, weightAllToOne } from '../core/condition-engine'
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { modLoader } from '../core/mod-loader'
import { gameContext } from '../core/game-context'
import { entitySystem } from '../core/entity-system'
import { apiSystem } from '../core/api'
import { narrativeLog } from '../core/narrative-log'
import { onLoad as dialogueOnLoad, onEnable as dialogueOnEnable } from './dialogue-system/index'
import { onEnable as talkCommonOnEnable } from './talk-common-system/index'
import { eventBus } from '../core/event-bus'
import { commandRegistry } from '../core/command-registry'
import { errorReporter } from '../core/error-reporter'

const stubCtx: any = {
  api: apiSystem,
  events: eventBus,
  commands: commandRegistry,
  ui: { registerSlot: () => {} },
}

describe('T1 口上权重系统', () => {
  beforeAll(async () => {
    entitySystem.clear()
    errorReporter.clear()
    await modLoader.loadMod('test-mod')
    const mod = modLoader.getMod()!
    gameContext.setPlayer('player')
    gameContext.setLocation(mod.locations.values().next().value as any)
    const p = entitySystem.get('character', 'player') as any
    p.base = { 体力: 50, 体力上限: 100, 气力: 30, 气力上限: 100, 疲劳度: 0 }
    p.current_location = 'town_square'
    entitySystem.register('character', 'npc_1', { id: 'npc_1', name: '测试NPC', base: { 体力: 80, 疲劳度: 0 }, current_location: 'town_square' })
    // 注释：high_N 权重前提（h-core 注册；本测试不加载 h-core，手动注册等价实现）
    for (const n of [1, 2, 5, 10, 999]) conditionEngine.registerPremise(`high_${n}`, () => true)
    conditionEngine.registerPremise('HAVE_TARGET', () => true)
    conditionEngine.registerPremise('t_unconscious_flag_3', (ctx: any) => {
      const ch = ctx.selectedCharacterId ? entitySystem.get('character', ctx.selectedCharacterId) as any : null
      return ch?.sp_flag?.unconscious_h === 3
    })
    dialogueOnLoad(stubCtx)
    dialogueOnEnable(stubCtx)
    await talkCommonOnEnable(stubCtx)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    narrativeLog.clear()
  })

  describe('weightAllToOne（erArk weight_all_to_1 语义）', () => {
    const ctx = { ...gameContext.getContext(), selectedCharacterId: 'npc_1', sourceId: 'player' }

    it('high_N → 权重 N', () => {
      expect(weightAllToOne(['high_1'], ctx)).toBe(1)
      expect(weightAllToOne(['high_5'], ctx)).toBe(5)
      expect(weightAllToOne(['high_999'], ctx)).toBe(999)
    })

    it('high_N + 满足前提 → N + 前提数（weight_all_to_1：非 high 前提只加 1）', () => {
      // HAVE_TARGET 满足（selected 存在）→ 5 + 1
      expect(weightAllToOne(['high_5', 'HAVE_TARGET'], ctx)).toBe(6)
    })

    it('任一前提不满足 → 0（整句淘汰）', () => {
      conditionEngine.registerPremise('TEST_FALSE', () => false)
      expect(weightAllToOne(['high_5', 'TEST_FALSE'], ctx)).toBe(0)
    })

    it('空前提集 → 1（无条件口上默认权重）', () => {
      expect(weightAllToOne([], ctx)).toBe(1)
    })
  })

  describe('口上同池权重竞争（pickWeightedLine）', () => {
    async function trigger(scene: string): Promise<void> {
      await apiSystem.call('dialogue', 'triggerScene', scene, 'npc_1')
    }

    function pushSceneLines(scene: string, lines: any[]): void {
      const mod = modLoader.getMod()!
      for (const l of lines) mod.sceneDialogue.push({ scene, ...l })
    }

    function lastTextContaining(keyword: string): string {
      const entries = narrativeLog.getEntries()
      for (let i = entries.length - 1; i >= 0; i--) {
        const t = String(entries[i].text)
        if (t.includes(keyword)) return t
      }
      return ''
    }

    it('静态 weight：1:3 → 边界处切换（total=4，random<0.25 选 A）', async () => {
      pushSceneLines('w_static', [
        { text: '权重A', weight: 1 },
        { text: '权重B', weight: 3 },
      ])
      const spy = vi.spyOn(Math, 'random')
      spy.mockReturnValue(0.24)
      await trigger('w_static')
      expect(lastTextContaining('权重A')).toContain('权重A')
      spy.mockReturnValue(0.25)
      await trigger('w_static')
      expect(lastTextContaining('权重B')).toContain('权重B')
    })

    it('前提权重：high_1 vs high_5 → total=6，random<1/6 选 A', async () => {
      pushSceneLines('w_premise', [
        { text: '前提A', condition: 'premises:high_1' },
        { text: '前提B', condition: 'premises:high_5' },
      ])
      const spy = vi.spyOn(Math, 'random')
      spy.mockReturnValue(0.16)  // < 1/6
      await trigger('w_premise')
      expect(lastTextContaining('前提A')).toContain('前提A')
      spy.mockReturnValue(0.17)  // ≥ 1/6
      await trigger('w_premise')
      expect(lastTextContaining('前提B')).toContain('前提B')
    })

    it('同池竞争：场景通用(1) vs 角色专属(×10) → total=11，random<1/11 选通用', async () => {
      const mod = modLoader.getMod()!
      mod.sceneDialogue.push({ scene: 'w_comp', text: '通用行' })
      mod.characterSpecificDialogue.set('npc_1', [{ scene: 'w_comp', text: '专属行' }])
      const spy = vi.spyOn(Math, 'random')
      spy.mockReturnValue(0.09)  // < 1/11 → 通用
      await apiSystem.call('dialogue', 'triggerScene', 'w_comp', 'npc_1')
      expect(lastTextContaining('通用行')).toContain('通用行')
      spy.mockReturnValue(0.1)   // ≥ 1/11 → 专属
      await apiSystem.call('dialogue', 'triggerScene', 'w_comp', 'npc_1')
      expect(lastTextContaining('专属行')).toContain('专属行')
    })

    it('无条件口上权重默认 1（erArk 空前提集语义的等价）', async () => {
      pushSceneLines('w_none', [
        { text: '无条A' },
        { text: '无条B' },
      ])
      const spy = vi.spyOn(Math, 'random')
      spy.mockReturnValue(0.0)
      await trigger('w_none')
      expect(lastTextContaining('无条A')).toContain('无条A')
      spy.mockReturnValue(0.999)
      await trigger('w_none')
      expect(lastTextContaining('无条B')).toContain('无条B')
    })
  })

  describe('T4 版本化 + T5 无意识屏蔽', () => {
    async function trigger(scene: string): Promise<void> {
      await apiSystem.call('dialogue', 'triggerScene', scene, 'npc_1')
    }

    function lastTextContaining(keyword: string): string {
      const entries = narrativeLog.getEntries()
      for (let i = entries.length - 1; i >= 0; i--) {
        const t = String(entries[i].text)
        if (t.includes(keyword)) return t
      }
      return ''
    }

    it('版本过滤：character_text_version 选对应版本的角色口上；=0 不显示角色口上', async () => {
      const mod = modLoader.getMod()!
      const npc = entitySystem.get('character', 'npc_1') as any
      mod.characterSpecificDialogue.set('npc_1', [
        { scene: 'v_test', text: '版本1台词', version: 1 },
        { scene: 'v_test', text: '版本2台词', version: 2 },
      ])
      npc.character_text_version = 1
      narrativeLog.clear()
      await trigger('v_test')
      expect(lastTextContaining('版本1台词')).toContain('版本1台词')
      npc.character_text_version = 2
      narrativeLog.clear()
      await trigger('v_test')
      expect(lastTextContaining('版本2台词')).toContain('版本2台词')
      npc.character_text_version = 0
      narrativeLog.clear()
      await trigger('v_test')
      expect(lastTextContaining('版本1台词')).toBe('')
      expect(lastTextContaining('版本2台词')).toBe('')
      npc.character_text_version = undefined
    })

    it('无意识屏蔽：时停目标只出带 unconscious 前提的口上（场景通用无条件也淘汰）', async () => {
      const mod = modLoader.getMod()!
      const npc = entitySystem.get('character', 'npc_1') as any
      mod.sceneDialogue.push({ scene: 'u_test', text: '通用台词' })
      mod.characterSpecificDialogue.set('npc_1', [
        { scene: 'u_test', text: '普通台词' },
        { scene: 'u_test', text: '无意识台词', condition: 'premises:t_unconscious_flag_3' },
      ])
      npc.sp_flag = { unconscious_h: 3 }
      await trigger('u_test')
      // 普通台词与通用台词（无条件）被淘汰；无意识台词保留（前提满足时停=3）
      expect(lastTextContaining('无意识台词')).toContain('无意识台词')
      expect(lastTextContaining('普通台词')).toBe('')
      expect(lastTextContaining('通用台词')).toBe('')
      npc.sp_flag = {}
    })
  })

  describe('T6 特殊情境加权（hConfig talk.situations，erArk ×5）', () => {
    async function trigger(scene: string): Promise<void> {
      await apiSystem.call('dialogue', 'triggerScene', scene, 'npc_1')
    }

    function lastTextContaining(keyword: string): string {
      const entries = narrativeLog.getEntries()
      for (let i = entries.length - 1; i >= 0; i--) {
        const t = String(entries[i].text)
        if (t.includes(keyword)) return t
      }
      return ''
    }

    it('浴室情境：h_in_bathroom 前提 ×5 → 浴室行权重 10/普通 1，total=11', async () => {
      const mod = modLoader.getMod()!
      mod.sceneDialogue.push({ scene: 's_test', text: '普通台词', condition: 'premises:high_1' })
      mod.sceneDialogue.push({ scene: 's_test', text: '浴室台词', condition: 'premises:high_1&h_in_bathroom' })
      // 前提注册（h-in-bathroom 情境前提）
      conditionEngine.registerPremise('h_in_bathroom', () => true)
      // 权重：普通 = max(1, high_1=1)×1 = 1；浴室 = max(1, high_1+h_in_bathroom=2)×1×5 = 10 → total 11
      const spy = vi.spyOn(Math, 'random')
      spy.mockReturnValue(0.05)  // < 1/11 → 普通行
      await trigger('s_test')
      expect(lastTextContaining('普通台词')).toContain('普通台词')
      spy.mockReturnValue(0.1)   // ≥ 1/11 → 浴室行
      await trigger('s_test')
      expect(lastTextContaining('浴室台词')).toContain('浴室台词')
      // 清理测试行
      mod.sceneDialogue = mod.sceneDialogue.filter(l => l.scene !== 's_test')
    })
  })
})
