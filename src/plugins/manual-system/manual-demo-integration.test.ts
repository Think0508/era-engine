// manual-system × test-mod 演示数据 集成测试（2026-09-23）
// 目的：钉死"仓库里带着的那份演示数据真的能跑"——test-mod definitions 的
// manuals.toml / manual-tiers.toml / items.toml（初级拳法秘籍）/ abilities.toml（基础掌法）
// 一旦被改动破坏（引用改名、品级缺项、cap 越界…），这里直接红。
// 走**真实 loadMod**（含插件默认层合并），与玩家实际启动路径一致。

import { describe, it, expect, beforeAll } from 'vitest'
import { modLoader } from '../../core/mod-loader'
import { entitySystem } from '../../core/entity-system'
import { gameContext } from '../../core/game-context'
import { apiSystem } from '../../core/api'
import { effectTypeRegistry } from '../../core/effect-type-registry'
import { eventBus } from '../../core/event-bus'
import { errorReporter } from '../../core/error-reporter'
import { getEntityAttr } from '../../core/entity-utils'
import { onLoad, onEnable } from './index'
import { listManuals, manualState, practice } from './manual'
import { onEnable as abilitiesOnEnable, __resetAbilityGrowthProviders } from '../ability-progression/index'

const PLAYER = 'player'

function makeMockCtx(): any {
  return {
    api: {
      register: (ns: string, methods: Record<string, Function>) => apiSystem.register(ns, methods as any),
      call: (ns: string, method: string, ...args: any[]) => apiSystem.call(ns, method, ...args),
    },
    commands: { register: () => {}, unregister: () => {} },
    ui: { registerSlot: () => {} },
    parent: null,
    events: {
      on: (e: string, h: Function) => eventBus.on(e, h as any),
      off: (e: string, h: Function) => eventBus.off(e, h as any),
      emit: (e: string, p: any) => eventBus.emit(e, p),
    },
    gameState: { currentLocation: null, player: null, time: { minute: 0, hour: 8, day: 1, month: 1, year: 1 } },
  }
}

beforeAll(async () => {
  entitySystem.clear()
  apiSystem.clear()
  eventBus.clear()
  errorReporter.clear()
  __resetAbilityGrowthProviders()
  // 用共享单例（许多模块通过 modLoader.getMod() 取定义；new ModLoader() 只写实例状态）
  await modLoader.loadMod('test-mod')
  gameContext.setPlayer(PLAYER)
  entitiesEnsureRuntimeState()
  const ctx = makeMockCtx()
  abilitiesOnEnable(ctx)
  onLoad(ctx)
  onEnable(ctx)
})

/** loadMod 注册的实体是静态数据副本；补上演示所需的运行时字段形态 */
function entitiesEnsureRuntimeState(): void {
  const player = entitySystem.get('character', PLAYER) as any
  if (!player) throw new Error('test-mod 的玩家实体 player 不存在')
  if (!Array.isArray(player.inventory)) player.inventory = []
  if (!player.abilities || typeof player.abilities !== 'object') player.abilities = {}
  if (!player.manuals) player.manuals = {}
  if (!player.talents) player.talents = {}
}

describe('test-mod 演示数据（秘籍面板开箱可玩）', () => {
  it('演示属性到位：起手「经验」5000、品级表三流已定义', () => {
    const player = entitySystem.get('character', PLAYER) as any
    expect(getEntityAttr(player, '经验')).toBe(5000)
    const mod = modLoader.getMod() as any
    expect(mod.manualTiers.tiers['三流'].xp_base).toBe(250)
    expect(Object.keys(mod.manuals)).toEqual(expect.arrayContaining(['初级拳法', '龟息功']))
  })

  it('拿秘籍 → 面板可见可练 → 练一层发系数成长与「基础掌法」', () => {
    const player = entitySystem.get('character', PLAYER) as any
    player.inventory.push({ itemId: '初级拳法秘籍', count: 1 })

    const st = manualState(PLAYER, '初级拳法')!
    expect(st).toMatchObject({ level: 0, cap: 10, maxLayer: 10, nextCost: 250, canPractice: true })
    // 没拿那本 → 不在面板列表里；直接查状态仍给"cap 0 = 练不了"（UI 用它显示原因）
    expect(listManuals(PLAYER).map(m => m.manual)).not.toContain('龟息功')
    expect(manualState(PLAYER, '龟息功')).toMatchObject({ cap: 0, canPractice: false })

    const r = practice(PLAYER, '初级拳法', 1)
    expect(r).toMatchObject({ ok: true, gained: 1 })
    expect(player.manuals['初级拳法'].level).toBe(1)
    expect(player.abilities['基础掌法']).toMatchObject({ level: 1, xp: 0 })
    expect(getEntityAttr(player, '拳掌系数')).toBeGreaterThan(0)   // 品级表 coeff_bands 自动成长
  })

  it('内功演示：第 1 层给可装配的「龟息功」，装配后属性变化、卸下回落', async () => {
    const player = entitySystem.get('character', PLAYER) as any
    player.inventory.push({ itemId: '龟息功秘籍', count: 1 })
    practice(PLAYER, '龟息功', 2)
    expect(player.abilities['龟息功'].level).toBe(2)           // 分层被动技能随秘籍层数

    const before = getEntityAttr(player, '力道') as number
    const equipFx = effectTypeRegistry.getHandler('equip_internal')!
    await equipFx({ ability: '龟息功' }, { _targetIds: [PLAYER] })
    // 力道 flat 20 + per_level 10×(2−1) = 30
    expect(getEntityAttr(player, '力道')).toBe(before + 30)

    const unequipFx = effectTypeRegistry.getHandler('unequip_internal')!
    await unequipFx({ ability: '龟息功' }, { _targetIds: [PLAYER] })
    expect(getEntityAttr(player, '力道')).toBe(before)
  })
})
