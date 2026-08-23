// 注释：链路冒烟测试——真实指令执行全链路（effect-system + h-core + dialogue-system + executor）
// 与 boot-smoke 的区别：这里真正"点指令"，验证时间推进/效果/口上/H生命周期/对话
// 注意：effectTypeRegistry 重复注册会抛错，onLoad 只能执行一次 → 全部放 beforeAll

import { conditionEngine } from '../core/condition-engine'
import { describe, it, expect, beforeAll } from 'vitest'
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
import { eventBus } from '../core/event-bus'
import { makeTestExecCtx } from '../utils/test-helpers'

// 注释：events 用真实 eventBus——h-core 的 execution_end 二段结算监听器必须真实注册才能测到
const stubCtx: any = {
  api: apiSystem,
  events: eventBus,
  commands: commandRegistry,
  ui: { registerSlot: () => {} },
}

const execCtx = makeTestExecCtx

describe('指令执行链路冒烟', () => {
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

    // 注释：注册效果/指令/前提（每个插件 onLoad/onEnable 一次）
    effectOnLoad(stubCtx)
    effectOnEnable(stubCtx)
    hCoreOnLoad(stubCtx)
    hCoreOnEnable(stubCtx)
    dialogueOnLoad(stubCtx)
    dialogueOnEnable(stubCtx)
    // 注释：talk-common 提供口上插值（trigger_dialogue/interpolateLine 依赖，真实 boot 必载）
    // API 注册在 onEnable（async）——必须 await，否则注册未完成
    await talkCommonOnEnable(stubCtx)

    // 玩家（test-mod roster 已注册）——重置数值便于断言；NPC 手动注册
    const player = entitySystem.get('character', 'player') as any
    player.base = { 体力: 50, 体力上限: 100, 气力: 30, 气力上限: 100 }
    player.current_location = 'town_square'
    entitySystem.register('character', 'npc_1', {
      id: 'npc_1', name: '测试NPC',
      base: { 体力: 80, 体力上限: 100, 气力: 50, 气力上限: 100 },
      current_location: 'town_square',
    })
  })

  it('rest 链路：时间推进 +60 分钟 + 恢复效果 + 场景口上输出', async () => {
    const before = gameContext.getContext().time
    const beforeHp = (entitySystem.get('character', 'player') as any).base['体力']

    await commandExecutor.execute('rest', execCtx())

    const after = gameContext.getContext().time
    // 时间推进 60 分钟
    expect(after.hour * 60 + after.minute).toBe(before.hour * 60 + before.minute + 60)
    // 恢复效果：体力 +10%（rate 100 → 1000 分之 100）
    const player = entitySystem.get('character', 'player') as any
    expect(player.base['体力']).toBe(beforeHp + 10)
    // 场景口上（scene-dialogue.toml 的 rest 行）输出到叙事日志
    expect(narrativeLog.getEntries().some((e: any) => {
      const t = String(e.text)
      return t.includes('调息') || t.startsWith('测试NPC：')
    })).toBe(true)
  })

  it('do_h → H 开始 → end_h 结束链路', async () => {
    await commandExecutor.execute('do_h', execCtx())
    const npc = entitySystem.get('character', 'npc_1') as any
    expect(npc.h_state?.is_h).toBe(true)
    expect(npc.h_state?.target_character_id).toBe('player')
    expect(gameContext.getCurrentMode()).toBe('h_scene')

    await commandExecutor.execute('end_h', execCtx({ uiStore: { selectedCharacterId: 'npc_1' } }))
    expect(entitySystem.get('character', 'npc_1')!.h_state).toBeUndefined()
    expect(gameContext.getCurrentMode()).toBe('exploration')
  })

  it('H 中执行指令 → execution_end 二段结算监听器运行（body_item_tick + orgasmJudge 不崩）', async () => {
    // 注释：进入 H 后执行任意指令——execution_end 监听器（h-core onEnable 注册，真实 eventBus）
    // 会跑 body_item_tick + orgasmJudge；无快感数据的 h_state 不应绝顶、不应抛错
    await commandExecutor.execute('do_h', execCtx())
    expect(gameContext.getCurrentMode()).toBe('h_scene')

    errorReporter.clear()
    await commandExecutor.execute('rest', execCtx())
    // 注释：rest 的执行本身会推进时间；二段结算监听器不崩、无 error
    expect(errorReporter.getErrors().some(e => e.severity === 'error')).toBe(false)
    // H 状态未被监听器破坏
    expect((entitySystem.get('character', 'npc_1') as any).h_state?.is_h).toBe(true)

    await commandExecutor.execute('end_h', execCtx({ uiStore: { selectedCharacterId: 'npc_1' } }))
  })

  it('talk 链路：选中角色 → 无对话时输出占位（不崩）', async () => {
    await commandExecutor.execute('talk', execCtx())
    expect(narrativeLog.getEntries().some((e: any) => String(e.text).includes('无话可说'))).toBe(true)
  })

  it('逆推嵌套执行不发 execution 事件（audit-g 修复：嵌套=外层执行一部分，二段结算由外层统一触发）', async () => {
    // 注释：模拟 h-npc-ai 逆推——嵌套 commandExecutor.execute 不传 engine 时
    // 不得发出 execution_start/end（否则每回合双发 → 无守卫二段结算监听器双倍结算）
    const { executeInstructionForNpc } = await import('./h-npc-ai/active-h')
    const events: string[] = []
    const h1 = () => { events.push('start') }
    const h2 = () => { events.push('end') }
    eventBus.on('game:execution_start', h1)
    eventBus.on('game:execution_end', h2)

    // 进入 H（嵌套执行需要 H 上下文——用 keep_enjoy 类指令；rest 在 H 外也可执行，
    // 这里直接验证机制：嵌套执行任何指令都不发事件）
    const ok = await executeInstructionForNpc('rest', 'npc_1')

    eventBus.off('game:execution_start', h1)
    eventBus.off('game:execution_end', h2)

    expect(ok).toBe(true)
    expect(events).toEqual([]) // 嵌套执行零事件
  })

  it('角色口上分支：{id} 占位替换后条件生效（好感度 50 → 不走"你是何人"）', async () => {
    // 注释：character-dialogue.toml 的 greet 条件 character.{id}.好感度 < 30
    // 修复前 {id} 不替换 → 条件恒 true → 与无条件行随机竞争（静默失效）
    const npc = entitySystem.get('character', 'npc_1') as any
    npc.base['好感度'] = 50
    narrativeLog.clear()
    errorReporter.clear()
    await apiSystem.call('dialogue', 'triggerScene', 'greet', 'npc_1')
    const texts = narrativeLog.getEntries().map((e: any) => String(e.text))
    // 好感度 50 → "你是何人" 条件为 false → 只有无条件行 "哦，是你啊"
    expect(texts.some(t => t.includes('哦，是你啊'))).toBe(true)
    expect(texts.some(t => t.includes('你是何人'))).toBe(false)
    // 低好感度 → 条件行命中
    npc.base['好感度'] = 10
    narrativeLog.clear()
    await apiSystem.call('dialogue', 'triggerScene', 'greet', 'npc_1')
    const texts2 = narrativeLog.getEntries().map((e: any) => String(e.text))
    expect(texts2.some(t => t.includes('你是何人'))).toBe(true)
  })

  it('端到端——场景旁白带 narrative_output effects 真实执行（审计修复：原被 outputIsChar 门控吞掉）', async () => {
    // 注释：走真实 effect-system 链路（非 mock）——场景行带真实效果类型 narrative_output
    //（写入叙事日志）。修复前 executeLineEffects 被 outputIsChar 门控，场景旁白行 effects 从不执行；
    // 修复后任何来源命中行未被行为地文替换且带 effects 都执行（ADR-0017 D8）。
    const mod = modLoader.getMod()!
    mod.sceneDialogue.push({
      scene: 'audit_scene_effects',
      text: '审计-旁白原文',
      effects: [{ type: 'narrative_output', params: { text: '审计-旁白副效果' } }],
    })
    narrativeLog.clear()
    await apiSystem.call('dialogue', 'triggerScene', 'audit_scene_effects', 'npc_1')
    const texts = narrativeLog.getEntries().map((e: any) => String(e.text))
    // 场景旁白行本身输出
    expect(texts.some(t => t.includes('审计-旁白原文'))).toBe(true)
    // 其 effects 经真实 effect-system 执行（修复前此处恒 false）
    expect(texts.some(t => t.includes('审计-旁白副效果'))).toBe(true)
  })

  it('整批执行后 errorReporter 无 error 级错误', () => {
    const errors = errorReporter.getErrors()
    expect(errors.some(e => e.severity === 'error')).toBe(false)
  })
})
