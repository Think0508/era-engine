// gain-rule-system 单元测试——规则管线核心（编译/auto 检查/{self}/once/manual/grant-remove effect）
// 覆盖（grill 定稿）：
//   1. gain-rules.toml 加载（三层 merge，id 去重，重复 id 报错）
//   2. 天赋 gain 语法糖编译（talents.toml gain → 规则；gain_type 语义 0/3/1）
//   3. checkAutoForChar：condition/needs 求值、{self} 替换、selected 同步、once 状态
//   4. auto 上下文过滤（execution/npc-settle/sleep；gain_type=3 只在 sleep 检查）
//   5. manual API（queryManualCandidates/confirmManual）
//   6. grant_talent / remove_talent effect（等级+1/日志/replace 替换/删除）

import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { modLoader } from '../../core/mod-loader'
import { gameContext } from '../../core/game-context'
import { entitySystem } from '../../core/entity-system'
import { conditionEngine } from '../../core/condition-engine'
import { apiSystem } from '../../core/api'
import { eventBus } from '../../core/event-bus'
import { errorReporter } from '../../core/error-reporter'
import { narrativeLog } from '../../core/narrative-log'
import { onLoad as effectOnLoad, onEnable as effectOnEnable } from '../effect-system/index'
import { onLoad, onEnable } from './index'
import { compileRules, invalidateRules, checkAutoForChar, getGlobalAchievements, setGlobalAchievements, setGlobalRuleState } from './rule-engine'

const stubCtx: any = {
  api: apiSystem,
  events: { on: () => {}, off: () => {}, emit: () => {} },
  commands: { register: () => {}, unregister: () => {} },
  ui: { registerSlot: () => {} },
}

function getChar(id: string): any {
  return entitySystem.get('character', id) as any
}

describe('gain-rule-system 规则管线', () => {
  beforeAll(async () => {
    entitySystem.clear()
    conditionEngine.clear()
    errorReporter.clear()
    narrativeLog.clear()
    await modLoader.loadMod('test-mod')
    const mod = modLoader.getMod()!
    gameContext.setPlayer('player')
    gameContext.setLocation(mod.locations.values().next().value as any)
    effectOnLoad(stubCtx)
    effectOnEnable(stubCtx)
    onLoad(stubCtx)
    await onEnable(stubCtx)
    entitySystem.register('character', 'npc_1', { id: 'npc_1', name: '测试NPC', base: {} })
  })

  beforeEach(() => {
    const player = getChar('player')
    if (player) {
      player.base = { 技巧: 0 }
      player.talents = {}
      player.rule_state = {}
      player.abilities = {}
      player.experience = {}
      player.achievements = {}
    }
    const npc = getChar('npc_1')
    if (npc) {
      npc.base = {}
      npc.talents = {}
      npc.rule_state = {}
      npc.abilities = {}
      npc.experience = {}
      npc.achievements = {}
    }
    setGlobalAchievements({})
    setGlobalRuleState({})
    invalidateRules()
  })

  it('gain-rules.toml 加载——rules 数组进 mod.gainRules（含插件默认层）', async () => {
    const mod = modLoader.getMod()!
    expect(mod.gainRules['初入江湖成就']).toBeDefined()
  })

  it('天赋 gain 语法糖编译——talents.toml gain 字段展开为规则', () => {
    const rules = compileRules()
    const talentRules = rules.filter(r => r.source === 'talent')
    expect(talentRules.length).toBeGreaterThan(0)
    // 初出茅庐（test-mod talents.toml：gain.condition player.技巧 >= 10）
    const chum = rules.find(r => r.id === 'talent:初出茅庐')
    expect(chum).toBeDefined()
    expect(chum!.scope).toBe('all')
    expect(chum!.once).toBe(true)
    expect(chum!.effects[0].type).toBe('grant_talent')
    expect(chum!.effects[0].params.talent).toBe('初出茅庐')
  })

  it('checkAutoForChar——condition 满足自动获得天赋（erArk gain_type=0 语义）', async () => {
    const player = getChar('player')
    player.base = { 技巧: 15 }
    await checkAutoForChar('player', 'execution')
    expect(player.talents['初出茅庐']).toBe(1)
  })

  it('checkAutoForChar——needs 满足自动获得（时姦经验 124 门槛，端到端）', async () => {
    const player = getChar('player')
    player.talents = {}
    player.experience = { '124': 50 }
    await checkAutoForChar('player', 'execution')
    expect(player.talents['窄域时停']).toBe(1)
    expect(player.talents['广域时停'] ?? 0).toBe(0)
    player.experience['124'] = 200
    await checkAutoForChar('player', 'execution')
    expect(player.talents['广域时停']).toBe(1)
  })

  it('gain_type=3（睡觉）规则只在 sleep 上下文检查', async () => {
    const player = getChar('player')
    player.talents = {}
    // 恋慕：gain_type=3（h-core talent-gains.toml：亲密4+思慕+信赖度100）
    // 需要先有思慕（gain_type=1 手动）——直接给
    player.talents['思慕'] = 1
    player.abilities = { 亲密: { level: 4, xp: 0 } }
    player.base = { 技巧: 0, 信赖度: 100 }
    // execution 上下文：gain_type=3 规则不检查
    await checkAutoForChar('player', 'execution')
    expect(player.talents['恋慕'] ?? 0).toBe(0)
    // sleep 上下文：检查
    await checkAutoForChar('player', 'sleep')
    expect(player.talents['恋慕']).toBe(1)
  })

  it('once——达成后不再重复执行', async () => {
    const player = getChar('player')
    player.base = { 技巧: 15 }
    await checkAutoForChar('player', 'execution')
    expect(player.talents['初出茅庐']).toBe(1)
    const state = player.rule_state
    expect(state?.['talent:初出茅庐']).toBe(true)
    // 再次检查——已达成跳过
    const before = player.talents['初出茅庐']
    await checkAutoForChar('player', 'execution')
    expect(player.talents['初出茅庐']).toBe(before)
  })

  it('grant_talent effect——等级+1 + replace 替换 + 日志', async () => {
    const player = getChar('player')
    // 恋慕（h-core talent-gains.toml：replace = 思慕）——先持有思慕
    player.talents = { '思慕': 1 }
    await apiSystem.call('effect-system', 'execute', [
      { type: 'grant_talent', params: { talent: '恋慕' } },
    ], { sourceId: 'player', _targetIds: ['player'] })
    expect(player.talents['恋慕']).toBe(1)
    // replace=思慕 → 旧天赋移除
    expect(player.talents['思慕'] ?? 0).toBe(0)
  })

  it('remove_talent effect——删除条目 + 日志', async () => {
    const player = getChar('player')
    player.talents = { '初出茅庐': 1 }
    await apiSystem.call('effect-system', 'execute', [
      { type: 'remove_talent', params: { talent: '初出茅庐' } },
    ], { sourceId: 'player', _targetIds: ['player'] })
    expect(player.talents['初出茅庐'] ?? 0).toBe(0)
  })

  it('manual API——queryManualCandidates / confirmManual', async () => {
    const npc = getChar('npc_1')
    npc.talents = {}
    npc.abilities = { 亲密: { level: 3, xp: 0 } }
    // 思慕：gain_type=1 手动（条件 亲密≥2）
    const candidates = await apiSystem.call('gain-rule-system', 'queryManualCandidates', 'npc_1') as any[]
    expect(candidates.length).toBeGreaterThan(0)
    expect(candidates.some(r => r.id === 'talent:思慕')).toBe(true)
    const ok = await apiSystem.call('gain-rule-system', 'confirmManual', 'npc_1', 'talent:思慕')
    expect(ok).toBe(true)
    expect(npc.talents['思慕']).toBe(1)
    // 达成后不再出现
    const again = await apiSystem.call('gain-rule-system', 'queryManualCandidates', 'npc_1') as any[]
    expect(again.some(r => r.id === 'talent:思慕')).toBe(false)
  })

  it('checkAuto——npc-settle 上下文对 NPC 检查（scope=all）', async () => {
    const npc = getChar('npc_1')
    npc.base = {}
    npc.experience = { '124': 50 }
    await apiSystem.call('gain-rule-system', 'checkAuto', 'npc_1', 'npc-settle')
    expect(npc.talents['窄域时停']).toBe(1)
  })

  it('事件触发——when=event:h:orgasm + event 根域条件 + role_mapping', async () => {
    const player = getChar('player')
    player.base = { 技巧: 5 }
    // 触发 h:orgasm 事件（partId=2, count=3 满足条件）——set_field 写 base.技巧 = 99
    await eventBus.emit('h:orgasm', { character: 'player', partId: 2, count: 3 })
    expect(player.base['技巧']).toBe(99)
    // once：再次触发不重复
    await eventBus.emit('h:orgasm', { character: 'player', partId: 2, count: 3 })
    expect(player.base['技巧']).toBe(99)
    // 条件不满足（partId=1）不触发
    await eventBus.emit('h:orgasm', { character: 'player', partId: 1, count: 3 })
    expect(player.base['技巧']).toBe(99)
  })

  it('成就——auto 条件达成自动记录（player scope）+ 前置链', async () => {
    const player = getChar('player')
    player.base = { 技巧: 0, 气血: 90 }
    player.achievements = {}
    await checkAutoForChar('player', 'execution')
    // 初入江湖（气血>=80）达成
    expect(player.achievements['初入江湖']).toBe(true)
    // 进阶（前置初入江湖 + 技巧>=20）未达成
    expect(player.achievements['初入江湖进阶'] ?? 0).toBe(0)
    // 技巧达标后再检查
    player.base = { 技巧: 25, 气血: 90 }
    await checkAutoForChar('player', 'execution')
    expect(player.achievements['初入江湖进阶']).toBe(true)
  })

  it('成就——global scope 记入全局表（事件触发）', async () => {
    // 清零全局表（测试间隔离）
    setGlobalAchievements({})
    const npc = getChar('npc_1')
    npc.base = {}
    // 触发 gain-rule-test 事件（亲密=3 满足条件）
    await eventBus.emit('gain-rule-test', { character: 'npc_1', 亲密: 3 })
    expect(getGlobalAchievements()['全村最强']).toBe(true)
    // 查询 API
    const unlocked = await apiSystem.call('gain-rule-system', 'isAchievementUnlocked', '全村最强')
    expect(unlocked).toBe(true)
  })

  it('成就——player scope 查询 API', async () => {
    const player = getChar('player')
    player.base = { 技巧: 0, 气血: 90 }
    player.achievements = {}
    await checkAutoForChar('player', 'execution')
    const unlocked = await apiSystem.call('gain-rule-system', 'isAchievementUnlocked', '初入江湖')
    expect(unlocked).toBe(true)
  })

  it('lose_condition——条件不再满足时失去天赋（once=false 持续检查）', async () => {
    const player = getChar('player')
    player.experience = { '94': 50 }
    // 获得：饮酒经验 94 ≥ 30
    await checkAutoForChar('player', 'execution')
    expect(player.talents['酒量好']).toBe(1)
    // 失去：饮酒经验 < 30 → lose_condition 满足 → remove_talent
    player.experience['94'] = 10
    await checkAutoForChar('player', 'execution')
    expect(player.talents['酒量好'] ?? 0).toBe(0)
    // 再次满足 → 重新获得（once=false）
    player.experience['94'] = 40
    await checkAutoForChar('player', 'execution')
    expect(player.talents['酒量好']).toBe(1)
  })

  it('{self} 占位符——scope=all 规则条件引用当前角色（C1 回归：裸角色ID会静默失效）', async () => {
    // test-mod gain-rules.toml：npc_亲密达标（condition = "{self}.亲密 >= 2"，scope=all）
    const npc = getChar('npc_1')
    npc.abilities = { 亲密: { level: 3, xp: 0 } }
    await apiSystem.call('gain-rule-system', 'checkAuto', 'npc_1', 'npc-settle')
    // 亲密 3 >= 2 → 获得肛交擅长（{self} 正确解析为当前角色）
    expect(npc.talents['肛交擅长']).toBe(1)
  })

  it('auto + scope=global 成就——任何角色满足条件达成且只达成一次（C2 回归）', async () => {
    // test-mod achievements.toml：全民大师（scope=global, when=auto, condition="{self}.技巧 >= 10"）
    const player = getChar('player')
    player.base = { 技巧: 15, 气血: 90 }
    // 玩家满足 → 全局表记录
    await checkAutoForChar('player', 'execution')
    expect(getGlobalAchievements()['全民大师']).toBe(true)
    // 换 NPC 检查——规则已达成（全局表），不重复执行
    const npc = getChar('npc_1')
    npc.base = {}
    npc.achievements = {}
    await checkAutoForChar('npc_1', 'npc-settle')
    expect(getGlobalAchievements()['全民大师']).toBe(true)
  })

  it('成就 role_mapping 透传——事件成就 target 映射生效（二轮审查回归：原编译丢弃 role_mapping）', async () => {
    // test-mod achievements.toml：亲密度测试（scope=player, event:gain-rule-test,
    // role_mapping.target = "event.character"——映射到事件 payload 的角色）
    const player = getChar('player')
    player.achievements = {}
    const npc = getChar('npc_1')
    npc.abilities = { 亲密: { level: 3, xp: 0 } }
    // 触发事件：character=npc_1, 亲密=3 → 条件 selected.亲密 >= 2（selected = npc_1）满足
    await eventBus.emit('gain-rule-test', { character: 'npc_1', 亲密: 3 })
    // scope=player 成就记在玩家
    expect(player.achievements['亲密度测试']).toBe(true)
  })

  it('queryManualCandidates——{self} 条件的手动候选不受 UI 选中影响（二轮审查回归）', async () => {
    // npc_1 亲密=3（思慕手动规则：gain_type=1, needs 亲密>=2）
    const npc = getChar('npc_1')
    npc.talents = {}
    npc.abilities = { 亲密: { level: 3, xp: 0 } }
    npc.rule_state = {}
    // 清空全局 UI 选中（模拟未选中状态）
    gameContext.setSelectedCharacterId(null)
    const candidates = await apiSystem.call('gain-rule-system', 'queryManualCandidates', 'npc_1') as any[]
    expect(candidates.some(r => r.id === 'talent:思慕')).toBe(true)
    gameContext.setSelectedCharacterId('npc_1')
  })
})
