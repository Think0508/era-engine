// 注释：人设三属性——声明即注册管线测试（2026-08-25，docs/persona-attributes.md）
// 覆盖：声明进 mod.attributes（条件路径即注册）/ 默认 50 中性落位 / 角色卡 base 写值
// 条件可引用（正/负值两侧翻转）——纯管线验证，防"属性路径静默失效"类回归，不含数值设计判断。
// 背景：取代 2026-08-21 五度方案（degree-effects.test.ts 删除，通道机制撤销）。

import { describe, it, expect, beforeAll } from 'vitest'
import { modLoader } from '../../core/mod-loader'
import { gameContext } from '../../core/game-context'
import { entitySystem } from '../../core/entity-system'
import { commandRegistry } from '../../core/command-registry'
import { narrativeLog } from '../../core/narrative-log'
import { errorReporter } from '../../core/error-reporter'
import { conditionEngine } from '../../core/condition-engine'
import { conditionRegistry } from '../../core/condition-registry'
import { apiSystem } from '../../core/api'
import { eventBus } from '../../core/event-bus'
import { onLoad as effectOnLoad, onEnable as effectOnEnable } from '../effect-system/index'
import { onLoad as hCoreOnLoad, onEnable as hCoreOnEnable } from './index'

const stubCtx: any = {
  api: apiSystem,
  events: eventBus,
  commands: commandRegistry,
  ui: { registerSlot: () => {} },
}

const PERSONA = ['坚强度', '道德感', '贞操观']

function npc(id = 'npc_1'): any {
  return entitySystem.get('character', id) as any
}

describe('人设三属性·声明即注册', () => {
  beforeAll(async () => {
    entitySystem.clear()
    commandRegistry.clear()
    errorReporter.clear()
    conditionEngine.clear()
    narrativeLog.clear()
    apiSystem.clear()
    eventBus.clear()
    await modLoader.loadMod('test-mod')
    const mod = modLoader.getMod()!
    gameContext.setPlayer('player')
    gameContext.setLocation(mod.locations.values().next().value as any)

    effectOnLoad(stubCtx)
    effectOnEnable(stubCtx)
    hCoreOnLoad(stubCtx)
    hCoreOnEnable(stubCtx)

    entitySystem.register('character', 'npc_1', { id: 'npc_1', name: '测试NPC', base: {} })
    entitySystem.register('character', 'npc_2', { id: 'npc_2', name: '测试NPC2', base: {} })
  })

  it('P1：三属性已进 mod.attributes（category=social, default=50），条件路径可校验可求值', () => {
    const attrs = (modLoader.getMod() as any)?.attributes
    for (const name of PERSONA) {
      expect(attrs?.[name]).toBeTruthy()
      expect(attrs?.[name]?.category).toBe('social')
      expect(attrs?.[name]?.default).toBe(50)
    }
    // 条件字典：character.{id}.{属性} 路径已注册（validateField/validateExpression 通过）
    expect(conditionRegistry.validateField('character.npc_1.坚强度')).toBe(true)
    expect(conditionRegistry.validateField('character.npc_1.道德感')).toBe(true)
    expect(conditionRegistry.validateField('character.npc_1.贞操观')).toBe(true)
    const v = conditionRegistry.validateExpression('character.npc_1.坚强度 >= 50')
    expect(v.ok).toBe(true)
  })

  it('P2：不写字段的角色 → 默认 50（中性），无字段可为条件所用', () => {
    // player 经 applyAttributeDefaults 自动落 default
    const player = entitySystem.get('character', 'player') as any
    for (const name of PERSONA) {
      expect(player.social?.[name]).toBe(50)
    }
    const ctx: any = { ...gameContext.getContext(), selectedCharacterId: 'player' }
    // 默认 50 → 中性判定：">= 50" 为真、"< 50" 为假
    expect(conditionEngine.evaluate('character.player.坚强度 >= 50', ctx)).toBe(true)
    expect(conditionEngine.evaluate('character.player.坚强度 < 50', ctx)).toBe(false)
  })

  it('P3：角色卡 base 写值（正值）→ 条件阈值两侧翻转', () => {
    npc('npc_1').base['坚强度'] = 80
    const ctx: any = { ...gameContext.getContext(), selectedCharacterId: 'npc_1' }
    expect(conditionEngine.evaluate('character.npc_1.坚强度 >= 50', ctx)).toBe(true)
    expect(conditionEngine.evaluate('character.npc_1.坚强度 >= 90', ctx)).toBe(false)
  })

  it('P4：角色卡 base 写值（负值——夸张反向人设）→ 负数字面量可直接比较（2026-08-25 起支持）', () => {
    npc('npc_2').base['道德感'] = -60
    const ctx: any = { ...gameContext.getContext(), selectedCharacterId: 'npc_2' }
    // 条件引擎现支持负数字面量（'-' 后紧跟数字）；二元算术仍禁
    expect(conditionEngine.evaluate('character.npc_2.道德感 == -60', ctx)).toBe(true)
    expect(conditionEngine.evaluate('character.npc_2.道德感 >= -50', ctx)).toBe(false)
    expect(conditionEngine.evaluate('character.npc_2.道德感 < 0', ctx)).toBe(true)
    expect(conditionEngine.evaluate('character.npc_2.道德感 >= 0', ctx)).toBe(false)
  })
})