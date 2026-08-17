// 注释：原生通用口上测试（2026-08-17）——角色通用口上（characterDialogue）的插件默认层
// 语义：mod 未写某 scene 的角色通用口上时，dialogue-system 用 talk-common 默认词条
// （Layer 1，data/default/talk-common/behavior/daily/ 下）兜底；mod 写了 → mod 胜出。
// 覆盖：词条存在/子目录检索/触发兜底/前缀输出/mod 通用胜出/专属竞争/无意识淘汰

import { conditionEngine } from '../core/condition-engine'
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { modLoader } from '../core/mod-loader'
import { gameContext } from '../core/game-context'
import { entitySystem } from '../core/entity-system'
import { apiSystem } from '../core/api'
import { narrativeLog } from '../core/narrative-log'
import { eventBus } from '../core/event-bus'
import { commandRegistry } from '../core/command-registry'
import { errorReporter } from '../core/error-reporter'
import { onLoad as dialogueOnLoad, onEnable as dialogueOnEnable } from './dialogue-system/index'
import { onEnable as talkCommonOnEnable } from './talk-common-system/index'
import { registerFallPremises } from './h-core/premise/premise-fall'
import { registerHPremises } from './h-core/premise/premise-h'
import { registerTargetPremises } from './h-core/premise/premise-target'
import { registerClothingPremises } from './h-core/premise/premise-clothing'
import { registerBodyItemPremises } from './h-core/premise/premise-body-item'
import { registerInstructPremises } from './h-core/premise/premise-instruct'
import { registerSleepPremises } from './sleep-system/premise/sleep'

const stubCtx: any = {
  api: apiSystem,
  events: eventBus,
  commands: commandRegistry,
  ui: { registerSlot: () => {} },
}

describe('原生通用口上（characterDialogue 插件默认层兜底）', () => {
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
    // 注释：h-core 真实前提注册（talk-common 词条 premise(high_1) 依赖，premise-h.ts:139-141）
    registerHPremises(conditionEngine)
    registerTargetPremises(conditionEngine)
    registerFallPremises(conditionEngine)
    registerClothingPremises(conditionEngine)
    registerBodyItemPremises(conditionEngine)
    registerInstructPremises(conditionEngine)
    registerSleepPremises(conditionEngine)
    dialogueOnLoad(stubCtx)
    dialogueOnEnable(stubCtx)
    await talkCommonOnEnable(stubCtx)
  })

  beforeEach(() => {
    narrativeLog.clear()
    const mod = modLoader.getMod()!
    // 注释：清掉 test-mod 的 scene 轨 chat 行 + 本测试 push 的口上数据——
    // scene 轨与角色轨同池竞争会干扰默认口上兜底断言
    mod.sceneDialogue = mod.sceneDialogue.filter((l: any) => l.scene !== 'chat')
    mod.characterDialogue = mod.characterDialogue.filter((l: any) => l.scene !== 'chat')
    mod.characterSpecificDialogue.set('npc_1', (mod.characterSpecificDialogue.get('npc_1') ?? []).filter((l: any) => l.scene !== 'chat'))
    const npc1 = entitySystem.get('character', 'npc_1') as any
    npc1.sp_flag = { unconscious_h: 0 }
    delete npc1.character_text_version
  })

  it('词条存在且可检索（behavior/daily/ 子目录被 glob 加载）', async () => {
    const chat = await apiSystem.call('talk-common', 'getText', 'chat', 'npc_1', 'player')
    const chatFailed = await apiSystem.call('talk-common', 'getText', 'chat_failed', 'npc_1', 'player')
    // 词条池含不含"聊"字的条目（分享/表示关心）——只验证存在性+非空，不断言特征字
    expect(chat).toBeTruthy()
    expect(String(chat).length).toBeGreaterThan(3)
    expect(chatFailed).toBeTruthy()
    expect(String(chatFailed).length).toBeGreaterThan(3)
  })

  it('无 mod 角色通用口上 → 默认口上兜底（角色轨前缀输出）', async () => {
    await apiSystem.call('dialogue', 'triggerScene', 'chat', 'npc_1')
    const logs = narrativeLog.getEntries().map((e: any) => String(e.text))
    expect(logs.length).toBe(1)
    // 角色轨输出带"角色名："前缀（source='character' 既有行为）
    expect(logs[0].startsWith('测试NPC：')).toBe(true)
    // 命中默认词条池任意一句（占位句或通用句）
    expect(logs[0]).toMatch(/聊了一会儿天|聊天指令通用口上|分享|表示关心|冷笑话|天气|闲聊/)
    // 占位符必须被插值替换（{player.name}/{character.name}/{location.name} 不得原样残留——
    // 残留 = 插值链路静默失效）
    expect(logs[0]).not.toContain('{')
  })

  it('mod 写了角色通用口上 → mod 胜出（默认不参与）', async () => {
    const mod = modLoader.getMod()!
    mod.characterDialogue.push({ scene: 'chat', text: '通用测试台词-模组版' })
    await apiSystem.call('dialogue', 'triggerScene', 'chat', 'npc_1')
    const logs = narrativeLog.getEntries().map((e: any) => String(e.text))
    expect(logs[0]).toBe('测试NPC：通用测试台词-模组版')
  })

  it('角色专属口上存在 → 与默认口上同池竞争（输出二者之一）', async () => {
    const mod = modLoader.getMod()!
    mod.characterSpecificDialogue.set('npc_1', [{ scene: 'chat', text: '专属测试台词' }])
    await apiSystem.call('dialogue', 'triggerScene', 'chat', 'npc_1')
    const logs = narrativeLog.getEntries().map((e: any) => String(e.text))
    expect(logs.length).toBe(1)
    // 专属（×10 权重优先）或默认词条，二者必居其一
    expect(logs[0] === '测试NPC：专属测试台词' || /聊了一会儿天|聊天指令通用口上|分享|表示关心|冷笑话|天气|闲聊/.test(logs[0])).toBe(true)
  })

  it('无意识目标 → 默认口上淘汰（无 unconscious 前提，keepConscious 语义一致）', async () => {
    const npc1 = entitySystem.get('character', 'npc_1') as any
    npc1.sp_flag = { unconscious_h: 1 }
    await apiSystem.call('dialogue', 'triggerScene', 'chat', 'npc_1')
    expect(narrativeLog.getEntries().length).toBe(0)
  })

  it('character_text_version=0（不启用角色口上）→ 默认口上同步禁用', async () => {
    const npc1 = entitySystem.get('character', 'npc_1') as any
    npc1.character_text_version = 0
    await apiSystem.call('dialogue', 'triggerScene', 'chat', 'npc_1')
    expect(narrativeLog.getEntries().length).toBe(0)
  })

  it('chat_failed 场景可触发（失败链口上数据可用）', async () => {
    await apiSystem.call('dialogue', 'triggerScene', 'chat_failed', 'npc_1')
    const logs = narrativeLog.getEntries().map((e: any) => String(e.text))
    // 28 条失败词条文字各异（部分不含"尴尬/气氛"等特征词）——语义验证：
    // 失败口上被触发（角色轨前缀输出）且非成功口上
    expect(logs.length).toBe(1)
    expect(logs[0].startsWith('测试NPC：')).toBe(true)
    expect(logs[0]).not.toContain('聊了起来')
    expect(logs[0].length).toBeGreaterThan(5)
  })

  it('默认口上随机有效：30 次 getText 覆盖多条候选（防恒选第一条的静默回归）', async () => {
    const texts = new Set<string>()
    for (let i = 0; i < 30; i++) {
      const t = await apiSystem.call('talk-common', 'getText', 'chat', 'npc_1', 'player')
      texts.add(String(t))
    }
    // 18 条候选池，30 次抽样覆盖 ≥3 种的失败概率可忽略（约 1e-20）
    expect(texts.size).toBeGreaterThan(3)
  })

  it('favorability_ge_3 前提：NPC 对玩家好感等级 ≥3 通过，<3 淘汰（chat_failed 高好感词条门控）', () => {
    const npc1 = entitySystem.get('character', 'npc_1') as any
    const ctx = { ...gameContext.getContext(), sourceId: 'player', selectedCharacterId: 'npc_1' }
    // level 3 阈值 = 1000（getFavorabilityLevel 默认阈值表）
    npc1.base['好感度'] = 1000
    expect(conditionEngine.evaluate('premise(favorability_ge_3)', ctx)).toBe(true)
    npc1.base['好感度'] = 999
    expect(conditionEngine.evaluate('premise(favorability_ge_3)', ctx)).toBe(false)
  })
})