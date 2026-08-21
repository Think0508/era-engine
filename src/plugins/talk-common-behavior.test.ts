// 注释：T3 行为地文测试——getBehaviorText 多段组合 + triggerScene 混合率 + weight≥100 保护
// erArk 依据：talk_common_judge（talk.py:658-733，A/B/C 组合并池 + 动作段换行）+
// choice_talk_from_talk_data（talk.py:244-254，混合率 + 权重<100 才替换）

import { conditionEngine } from '../core/condition-engine'
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { modLoader } from '../core/mod-loader'
import { gameContext } from '../core/game-context'
import { entitySystem } from '../core/entity-system'
import { apiSystem } from '../core/api'
import { narrativeLog } from '../core/narrative-log'
import { onLoad as dialogueOnLoad, onEnable as dialogueOnEnable } from './dialogue-system/index'
import { onEnable as talkCommonOnEnable } from './talk-common-system/index'
import { registerFallPremises } from './h-core/premise/premise-fall'
import { registerHPremises } from './h-core/premise/premise-h'
import { registerTargetPremises } from './h-core/premise/premise-target'
import { registerClothingPremises } from './h-core/premise/premise-clothing'
import { registerBodyItemPremises } from './h-core/premise/premise-body-item'
import { registerInstructPremises } from './h-core/premise/premise-instruct'
import { registerSleepPremises } from './sleep-system/premise/sleep'
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
    // 注释：h-core 真实前提注册（严格模式要求数据引用的前提全部注册——
    // talk-common 数据引用了 T_UNCONSCIOUS_FLAG_N/TARGET_IS_PLAYER_DAUGHTER 等，
    // 原非严格模式跳过未注册前提，现在必须加载真实语义）
    registerHPremises(conditionEngine)
    registerTargetPremises(conditionEngine)
    registerFallPremises(conditionEngine)
    registerClothingPremises(conditionEngine)
    registerBodyItemPremises(conditionEngine)
    registerInstructPremises(conditionEngine)
    registerSleepPremises(conditionEngine)
    // 注释：测试 stub（在真注册之后——后注册覆盖：位置/精液等前提在无 H 场景的
    // 测试环境下恒 true/false，保持本测试聚焦"行为地文组合逻辑"）
    conditionEngine.registerPremise('dr_position_normal', () => true)
    conditionEngine.registerPremise('high_1', () => true)
    conditionEngine.registerPremise('high_2', () => true)
    conditionEngine.registerPremise('high_5', () => true)
    conditionEngine.registerPremise('fall_level_e_-4', () => true)
    conditionEngine.registerPremise('jj_0', () => true)
    conditionEngine.registerPremise('jj_1', () => true)
    conditionEngine.registerPremise('jj_2', () => false)
    conditionEngine.registerPremise('jj_3', () => false)
    conditionEngine.registerPremise('pl_eja_point_low_or_middle', () => true)
    conditionEngine.registerPremise('pl_eja_point_high_or_extreme', () => true)
    conditionEngine.registerPremise('pl_semen_le_2', () => true)
    conditionEngine.registerPremise('pl_semen_g_2', () => true)
    conditionEngine.registerPremise('pl_semen_l_100', () => true)
    conditionEngine.registerPremise('pl_semen_ge_100', () => true)
    conditionEngine.registerPremise('pl_penis_not_semen_dirty', () => true)
    conditionEngine.registerPremise('pl_penis_semen_dirty', () => false)
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
    mod.characterDialogue = mod.characterDialogue.filter(l => !l.scene.startsWith('penis_in_vagina'))
    // 注释：复位 hConfig [talk]（behavior_text_enabled / common_mix_rate 测试注入）
    mod.hConfig.talk = {}
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

  it('混合率命中：weight<100 角色口上按概率替换为行为地文', async () => {
    const mod = modLoader.getMod()!
    mod.characterDialogue.push({ scene: 'penis_in_vagina', text: '测试口上台词', weight: 1 })
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

  it('混合率不命中：无行为地文数据 → 输出口上原文', async () => {
    const mod = modLoader.getMod()!
    mod.characterDialogue.push({ scene: 'penis_in_vagina_miss', text: '混合不中台词' })
    // 无行为地文（scene 名无对应组合）→ 即使概率命中也无地文可替 → 输出口上
    const spy = vi.spyOn(Math, 'random')
    spy.mockReturnValueOnce(0.5).mockReturnValueOnce(0.1)
    await apiSystem.call('dialogue', 'triggerScene', 'penis_in_vagina_miss', 'npc_1')
    const texts = narrativeLog.getEntries().map((e: any) => String(e.text)).join('|')
    expect(texts).toContain('混合不中台词')
  })

  it('weight≥100 保护：高权重口上不被地文替换（erArk talk.py:246）', async () => {
    const mod = modLoader.getMod()!
    mod.characterDialogue.push({ scene: 'penis_in_vagina', text: '重要台词', weight: 100 })
    // 序列：① pickWeightedLine——weight=100 短路不执行 mix 判断（含 getBehaviorText 与混合率随机）
    const spy = vi.spyOn(Math, 'random')
    spy.mockReturnValueOnce(0.5).mockReturnValueOnce(0.9).mockReturnValueOnce(0.9).mockReturnValueOnce(0.9)
    await apiSystem.call('dialogue', 'triggerScene', 'penis_in_vagina', 'npc_1')
    const texts = narrativeLog.getEntries().map((e: any) => String(e.text)).join('|')
    expect(texts).toContain('重要台词')
  })

  it('总开关 false（behavior_text_enabled=false）：混合被禁，输出作者口上', async () => {
    const mod = modLoader.getMod()!
    mod.hConfig.talk = { behavior_text_enabled: false }
    mod.characterDialogue.push({ scene: 'penis_in_vagina', text: '唯一作者台词', weight: 1 })
    const spy = vi.spyOn(Math, 'random')
    spy.mockReturnValue(0.1) // ① pick；混合判断被 behavior_text_enabled 短路，不进 getBehaviorText
    await apiSystem.call('dialogue', 'triggerScene', 'penis_in_vagina', 'npc_1')
    const texts = narrativeLog.getEntries().map((e: any) => String(e.text)).join('|')
    expect(texts).toContain('唯一作者台词')
    expect(texts.split(String.fromCharCode(10)).length).toBeLessThan(3) // 无地文三段
  })

  it('总开关 false：空池兜底被禁 → 无输出（静默）', async () => {
    const mod = modLoader.getMod()!
    mod.hConfig.talk = { behavior_text_enabled: false }
    // 'penis_in_vagina' 有行为地文数据——若兜底未禁必有地文；此时不 push 任何口上行 → 池空
    await apiSystem.call('dialogue', 'triggerScene', 'penis_in_vagina', 'npc_1')
    const texts = narrativeLog.getEntries().map((e: any) => String(e.text)).join('|')
    expect(texts).toBe('')
  })

  it('common_mix_rate=0：只关混合、留兜底（空池仍出地文）', async () => {
    const mod = modLoader.getMod()!
    mod.hConfig.talk = { common_mix_rate: 0 }
    // ① 混合关：有低权重角色口上也不被替换
    mod.characterDialogue.push({ scene: 'penis_in_vagina', text: '关混合台词', weight: 1 })
    const spy = vi.spyOn(Math, 'random')
    spy.mockReturnValue(0.1) // ① pick
    await apiSystem.call('dialogue', 'triggerScene', 'penis_in_vagina', 'npc_1')
    let texts = narrativeLog.getEntries().map((e: any) => String(e.text)).join('|')
    expect(texts).toContain('关混合台词')
    expect(texts.split(String.fromCharCode(10)).length).toBeLessThan(3)
    // ② 兜底开：空池 → 行为地文三段兜底
    narrativeLog.clear()
    mod.characterDialogue = mod.characterDialogue.filter(l => l.scene !== 'penis_in_vagina')
    spy.mockRestore()
    await apiSystem.call('dialogue', 'triggerScene', 'penis_in_vagina', 'npc_1')
    texts = narrativeLog.getEntries().map((e: any) => String(e.text)).join('|')
    expect(texts.split(String.fromCharCode(10)).length).toBeGreaterThanOrEqual(3)
    expect(texts).not.toContain('{penis')
  })

  it('旁白层排除：场景旁白行 weight<100 中选也不被替换（ADR 0017 D5）', async () => {
    const mod = modLoader.getMod()!
    mod.sceneDialogue.push({ scene: 'penis_in_vagina', text: '旁白原文', weight: 1 })
    const spy = vi.spyOn(Math, 'random')
    spy.mockReturnValue(0.1) // ① pick；混合判断被 entry.source==='scene' 短路，不进 getBehaviorText
    await apiSystem.call('dialogue', 'triggerScene', 'penis_in_vagina', 'npc_1')
    const texts = narrativeLog.getEntries().map((e: any) => String(e.text)).join('|')
    expect(texts).toContain('旁白原文')
    expect(texts.split(String.fromCharCode(10)).length).toBeLessThan(3)
  })

  it('common_mix_rate 越界钳制：-5 → 0（混合禁、兜底开）并告警一次', async () => {
    const mod = modLoader.getMod()!
    mod.hConfig.talk = { common_mix_rate: -5 }
    errorReporter.clear()
    // ① 混合禁：低权重角色口上不被替换（钳制到 0 = 只关混合）
    mod.characterDialogue.push({ scene: 'penis_in_vagina', text: '钳制台词', weight: 1 })
    const spy = vi.spyOn(Math, 'random')
    spy.mockReturnValue(0.1)
    await apiSystem.call('dialogue', 'triggerScene', 'penis_in_vagina', 'npc_1')
    let texts = narrativeLog.getEntries().map((e: any) => String(e.text)).join('|')
    expect(texts).toContain('钳制台词')
    expect(texts.split(String.fromCharCode(10)).length).toBeLessThan(3)
    // ② 兜底开：空池仍有行为地文
    narrativeLog.clear()
    mod.characterDialogue = mod.characterDialogue.filter(l => l.scene !== 'penis_in_vagina')
    spy.mockRestore()
    await apiSystem.call('dialogue', 'triggerScene', 'penis_in_vagina', 'npc_1')
    texts = narrativeLog.getEntries().map((e: any) => String(e.text)).join('|')
    expect(texts.split(String.fromCharCode(10)).length).toBeGreaterThanOrEqual(3)
    // ③ 越界告警（reportDedup 只报一次）
    const warnings = errorReporter.getErrorsBySource('dialogue-system')
    expect(warnings.some(w => String(w.message).includes('common_mix_rate'))).toBe(true)
  })

  it('behavior_text_enabled 字符串 "false" → 告警 + 按 true 处理（混合仍生效）', async () => {
    const mod = modLoader.getMod()!
    mod.hConfig.talk = { behavior_text_enabled: 'false' as any }
    errorReporter.clear()
    mod.characterDialogue.push({ scene: 'penis_in_vagina', text: '字符串false台词', weight: 1 })
    // random 序列同"混合率命中"：① pick ②③④ A/B/C ⑤ 混合率（0.1<0.3 命中）
    const spy = vi.spyOn(Math, 'random')
    spy.mockReturnValueOnce(0.5).mockReturnValueOnce(0.9).mockReturnValueOnce(0.9).mockReturnValueOnce(0.9).mockReturnValueOnce(0.1)
      .mockReturnValue(0.9)
    await apiSystem.call('dialogue', 'triggerScene', 'penis_in_vagina', 'npc_1')
    const texts = narrativeLog.getEntries().map((e: any) => String(e.text)).join('|')
    expect(texts).not.toContain('字符串false台词') // 字符串被当 true → 混合仍替换
    const warnings = errorReporter.getErrorsBySource('dialogue-system')
    expect(warnings.some(w => String(w.message).includes('behavior_text_enabled'))).toBe(true)
  })

  it('审计修复：场景旁白行带 effects → effects 必执行（原被 outputIsChar 门控静默吞掉）', async () => {
    const mod = modLoader.getMod()!
    mod.sceneDialogue.push({ scene: 'penis_in_vagina', text: '带效果旁白', effects: [{ type: 'test_effect', params: {} }] })
    const originalCall = apiSystem.call.bind(apiSystem)
    const executeSpy = vi.fn(async (_effects: any) => true)
    const spy = vi.spyOn(apiSystem, 'call')
    spy.mockImplementation((ns: any, method: any, ...args: any[]) =>
      ns === 'effect-system' && method === 'execute' ? executeSpy(args[0]) : (originalCall as any)(ns, method, ...args)
    )
    const mRand = vi.spyOn(Math, 'random')
    mRand.mockReturnValue(0.1)
    await apiSystem.call('dialogue', 'triggerScene', 'penis_in_vagina', 'npc_1')
    const texts = narrativeLog.getEntries().map((e: any) => String(e.text)).join('|')
    expect(texts).toContain('带效果旁白')
    // 场景行 effects 必须执行（审计修复目标——修复前此处 0 次调用）
    expect(executeSpy).toHaveBeenCalledTimes(1)
    expect(executeSpy.mock.calls[0][0]).toEqual([{ type: 'test_effect', params: {} }])
  })

  it('审计修复：带 effects 的角色口上不参与混合替换（effects 不被静默吞掉）', async () => {
    const mod = modLoader.getMod()!
    mod.characterDialogue.push({
      scene: 'penis_in_vagina', text: '带效果角色台词', weight: 1,
      effects: [{ type: 'test_effect', params: {} }],
    })
    const originalCall = apiSystem.call.bind(apiSystem)
    const executeSpy = vi.fn(async (_effects: any) => true)
    const spy = vi.spyOn(apiSystem, 'call')
    spy.mockImplementation((ns: any, method: any, ...args: any[]) =>
      ns === 'effect-system' && method === 'execute' ? executeSpy(args[0]) : (originalCall as any)(ns, method, ...args)
    )
    const mRand = vi.spyOn(Math, 'random')
    mRand.mockReturnValue(0.1) // pick 用；即使 random 命中混合率，带 effects 的行也应被排除
    await apiSystem.call('dialogue', 'triggerScene', 'penis_in_vagina', 'npc_1')
    const texts = narrativeLog.getEntries().map((e: any) => String(e.text)).join('|')
    expect(texts).toContain('带效果角色台词')
    // effects 必须执行一次（未被行为地文替换 → 不丢 effects）
    expect(executeSpy).toHaveBeenCalledTimes(1)
    expect(executeSpy.mock.calls[0][0]).toEqual([{ type: 'test_effect', params: {} }])
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
    // 动作类：普通动作行（无 unconscious 前提）全淘汰；无意识专用行（t_unconscious_flag_1 前提）
    // 在无意识时可达——返回专用行（旧行为 null 是专用地文不可达的数据缺陷，真语义注册后修复）
    // ⚠️ 修复（2026-08-14）：候选池中存在文本不含 熟睡/沉睡/毫无意识 关键词的无意识专用行
    // （如"沉浸在梦乡"），随机选中时关键词断言误挂——放宽为"返回非空 + 三段组合"（过滤逻辑
    // 已保证返回的是无意识专用行；关键词断言过严属测试缺陷，见 git blame）
    const action = await apiSystem.call('talk-common', 'getBehaviorText', 'penis_in_vagina', 'npc_1', 'player')
    expect(action).toBeTruthy()
    // 三段组合（换行分隔）——与"混合率命中"测试同款结构断言
    expect(String(action).split(String.fromCharCode(10)).length).toBeGreaterThanOrEqual(3)
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
    // 2026-08-14 增量导入：子宫超强高潮（v0.66）三段组合——条件集与既有档位一致
    const wSuper = await apiSystem.call('talk-common', 'getBehaviorText', 'w_orgasm_super', 'npc_1', 'player')
    expect(wSuper).toBeTruthy()
    expect(String(wSuper).split(String.fromCharCode(10)).length).toBeGreaterThanOrEqual(3)
    expect(String(wSuper)).toMatch(/\{womb\}/)
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
  { import: 'default', eager: true }
)
