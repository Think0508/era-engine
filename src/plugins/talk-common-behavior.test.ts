// 注释：T3 行为地文测试——getBehaviorText 多段组合 + triggerScene 混合率 + weight≥100 保护
// erArk 依据：talk_common_judge（talk.py:658-733，A/B/C 组合并池 + 动作段换行）+
// choice_talk_from_talk_data（talk.py:244-254，混合率 + 权重<100 才替换）

import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { modLoader } from '../core/mod-loader'
import { gameContext } from '../core/game-context'
import { entitySystem } from '../core/entity-system'
import { apiSystem } from '../core/api'
import { premiseRegistry } from '../core/premise-registry'
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

describe('T3 行为地文（talk_common 组合 + 混合率）', () => {
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
    // 注释：penis_in_vagina 地文的前提（h-core 注册；本测试不加载 h-core，手动注册等价）
    premiseRegistry.register('dr_position_normal', () => true)
    premiseRegistry.register('high_1', () => true)
    premiseRegistry.register('high_2', () => true)
    premiseRegistry.register('high_5', () => true)
    premiseRegistry.register('fall_level_e_-4', () => true)
    // 注释：阴茎短词池（penis）前提（h-core premise-instruct 已注册真实语义；此处手动等价）
    premiseRegistry.register('jj_0', () => true)
    premiseRegistry.register('jj_1', () => true)
    premiseRegistry.register('jj_2', () => false)
    premiseRegistry.register('jj_3', () => false)
    premiseRegistry.register('pl_eja_point_low_or_middle', () => true)
    premiseRegistry.register('pl_eja_point_high_or_extreme', () => true)
    premiseRegistry.register('pl_semen_le_2', () => true)
    premiseRegistry.register('pl_semen_g_2', () => true)
    premiseRegistry.register('pl_semen_l_100', () => true)
    premiseRegistry.register('pl_semen_ge_100', () => true)
    premiseRegistry.register('pl_penis_not_semen_dirty', () => true)
    premiseRegistry.register('pl_penis_semen_dirty', () => false)
    dialogueOnLoad(stubCtx)
    dialogueOnEnable(stubCtx)
    await talkCommonOnEnable(stubCtx)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    narrativeLog.clear()
    // 注释：清理测试 push 的口上行（防跨测试累积污染选择池）
    const mod = modLoader.getMod()!
    mod.sceneDialogue = mod.sceneDialogue.filter(l => !l.scene.startsWith('penis_in_vagina'))
  })

  it('getBehaviorText：A+B+C 三段组合（动作段间换行）', async () => {
    const text = await apiSystem.call('talk-common', 'getBehaviorText', 'penis_in_vagina', 'npc_1', 'player')
    expect(text).toBeTruthy()
    const t = String(text)
    // 三段拼接 → 至少 2 个换行分隔
    expect(t.split('\n').length).toBeGreaterThanOrEqual(3)
    // 含部位占位符（插值层会替换）
    expect(t).toMatch(/\{penis\}|\{penis_s\}/)
  })

  it('混合率命中：weight<100 口上按概率替换为行为地文', async () => {
    const mod = modLoader.getMod()!
    mod.sceneDialogue.push({ scene: 'penis_in_vagina', text: '测试口上台词', weight: 1 })
    // random 序列：① pickWeightedLine ②③④ getBehaviorText A/B/C 组内 ⑤ 混合率判断（0.1 < 0.3 → 命中）
    // ⑥+ 插值层（interpolateLine → talk-common replaceAll 变量替换，各变量池随机）
    const spy = vi.spyOn(Math, 'random')
    spy.mockReturnValueOnce(0.5).mockReturnValueOnce(0.9).mockReturnValueOnce(0.9).mockReturnValueOnce(0.9).mockReturnValueOnce(0.1)
      .mockReturnValue(0.9)
    await apiSystem.call('dialogue', 'triggerScene', 'penis_in_vagina', 'npc_1')
    const texts = narrativeLog.getEntries().map((e: any) => String(e.text)).join('|')
    expect(texts).not.toContain('测试口上台词')
    expect(texts.split(String.fromCharCode(10)).length).toBeGreaterThanOrEqual(3) // 地文三段
    // 审查修复：行为地文必须插值——{penis}/{target.name} 等占位符不得原样输出
    expect(texts).not.toContain('{penis')
    expect(texts).not.toContain('{target.')
    expect(texts).not.toContain('{player.')
  })

  it('混合率不命中：输出口上原文', async () => {
    const mod = modLoader.getMod()!
    mod.sceneDialogue.push({ scene: 'penis_in_vagina_miss', text: '混合不中台词' })
    // 无行为地文（scene 名无对应组合）→ 即使概率命中也无地文可替 → 输出口上
    const spy = vi.spyOn(Math, 'random')
    spy.mockReturnValueOnce(0.5).mockReturnValueOnce(0.1)
    await apiSystem.call('dialogue', 'triggerScene', 'penis_in_vagina_miss', 'npc_1')
    const texts = narrativeLog.getEntries().map((e: any) => String(e.text)).join('|')
    expect(texts).toContain('混合不中台词')
  })

  it('weight≥100 保护：高权重口上不被地文替换（erArk talk.py:246）', async () => {
    const mod = modLoader.getMod()!
    mod.sceneDialogue.push({ scene: 'penis_in_vagina', text: '重要台词', weight: 100 })
    // 序列：① pickWeightedLine ②③④ A/B/C 组内——weight=100 短路不执行 mix 判断
    const spy = vi.spyOn(Math, 'random')
    spy.mockReturnValueOnce(0.5).mockReturnValueOnce(0.9).mockReturnValueOnce(0.9).mockReturnValueOnce(0.9)
    await apiSystem.call('dialogue', 'triggerScene', 'penis_in_vagina', 'npc_1')
    const texts = narrativeLog.getEntries().map((e: any) => String(e.text)).join('|')
    expect(texts).toContain('重要台词')
  })

  it('common_s 短词池合并：vagina_s 的 A 段候选并入 common_s（erArk talk.py:662-665）', async () => {
    // 合并后 A 段候选 = vagina_s A 段 + common_s A 段（137 条）；
    // mock random 0.9999 → 选中合并池最后一条 = common_s 最后一条
    const spy = vi.spyOn(Math, 'random')
    spy.mockReturnValue(0.9999)
    const text = await apiSystem.call('talk-common', 'getText', 'vagina_s', 'npc_1', 'player')
    expect(text).toBeTruthy()
    // 从 common_s.toml 读全部 A 段词（数据文件读取验证合并来源）
    const raw = Object.values(commonSRaw)[0] as string
    const words = [...raw.matchAll(/context = "([^"]+)"/g)].map(m => m[1])
    const t = String(text)
    const aPart = t.split('').length > 0 ? t : ''
    expect(words.some(w => aPart.startsWith(w))).toBe(true)
  })

  it('无意识过滤：动作类地文被过滤、部位类地文保留（erArk :683-687）', async () => {
    const npc = entitySystem.get('character', 'npc_1') as any
    npc.sp_flag = { unconscious_h: 1 } // 睡眠（非时停，仍触发 unconscious>=1 检查）
    // 动作类（无 unconscious 前提条目）→ 全部过滤 → null
    const action = await apiSystem.call('talk-common', 'getBehaviorText', 'penis_in_vagina', 'npc_1', 'player')
    expect(action).toBeNull()
    // 部位类（body 整条，条件 high_1）→ 跳过无意识检查 → 仍返回
    const body = await apiSystem.call('talk-common', 'getText', 'vagina', 'npc_1', 'player')
    expect(body).toBeTruthy()
    npc.sp_flag = {}
  })

  it('新模块验证（2026-08-08 导入）：w_orgasm 组合 + clitoris 部位/短词', async () => {
    const spy = vi.spyOn(Math, 'random')
    spy.mockReturnValue(0.9)
    // 子宫绝顶三段组合（A + B1∪B2 + C1∪C2）
    const w = await apiSystem.call('talk-common', 'getBehaviorText', 'w_orgasm_normal', 'npc_1', 'player')
    expect(w).toBeTruthy()
    expect(String(w).split(String.fromCharCode(10)).length).toBeGreaterThanOrEqual(3)
    // 阴蒂部位整条 + 短词（body/body_part 新增）
    const clit = await apiSystem.call('talk-common', 'getText', 'clitoris', 'npc_1', 'player')
    expect(clit).toBeTruthy()
    const clitS = await apiSystem.call('talk-common', 'getText', 'clitoris_s', 'npc_1', 'player')
    expect(clitS).toBeTruthy()
  })
})

// 注释：common_s 数据（测试用——验证合并来源）
const commonSRaw = import.meta.glob<string>(
  '/src/plugins/talk-common-system/data/default/talk-common/body_part/common_s.toml',
  { query: '?raw', import: 'default', eager: true }
)
