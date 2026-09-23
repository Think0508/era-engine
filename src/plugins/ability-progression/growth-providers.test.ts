// ability-progression：成长曲线与外部提供者（2026-09-23 秘籍-技能系统）
// 覆盖：geometric 曲线 / 到顶 xp 钳满值 / 外部层数上限（钳制但不回退）/ 外部经验曲线 /
//       recheck 补升 / 提供者抛错隔离 / 提供者返回 null = 不钳制（NPC 零影响的机制保证）

import { describe, it, expect, beforeEach } from 'vitest'
import { gainXp, recheck, registerLevelCapProvider, registerXpCurveProvider, __resetAbilityGrowthProviders } from './index'
import { DEFAULT_XP_RATIO } from '../../core/xp-curve'
import { entitySystem } from '../../core/entity-system'
import { modLoader, parseModData } from '../../core/mod-loader'
import { bindingResolver } from '../../core/binding-resolver'
import { gameContext } from '../../core/game-context'
import { errorReporter } from '../../core/error-reporter'

const rawTomlMap: Record<string, string> = {
  '/mods/curve-test/meta.toml': `
[meta]
id = "curve-test"
name = "curve-test"
version = "1.0.0"
player_character = "player_01"
`,
  '/mods/curve-test/definitions/abilities.toml': `
[abilities."九阴白骨爪"]
name = "九阴白骨爪"
type = "active"
max_level = 10
tags = ["combat_active"]
xp_curve = "geometric"
xp_per_level = { base = 200, ratio = 1.15 }

[abilities."华山剑法"]
name = "华山剑法"
type = "active"
max_level = 2
tags = ["combat_active"]
xp_curve = "linear"
xp_per_level = 100
`,
}

function loadTestMod(): void {
  const mod = parseModData('curve-test', rawTomlMap)
  ;(modLoader as any).loadedMod = mod
  bindingResolver.loadBindings(mod.bindings)
}

function player(): any {
  return entitySystem.get('character', 'player_01')
}

beforeEach(() => {
  __resetAbilityGrowthProviders()
  entitySystem.clear()
  errorReporter.clear()
  loadTestMod()
  entitySystem.register('character', 'player_01', {
    id: 'player_01', name: 'player_01', base: {}, params: {}, social: {}, experience: {}, talents: {},
    abilities: { 九阴白骨爪: { level: 0, xp: 0 }, 华山剑法: { level: 0, xp: 0 } },
  })
  gameContext.setPlayer('player_01')
})

describe('geometric 曲线', () => {
  it('第 n 级所需 = base × ratio^(n−1)（0 基调用点）', () => {
    gainXp('player_01', '九阴白骨爪', 200)              // 升到 1 级：200×1.15^0 = 200
    expect(player().abilities['九阴白骨爪']).toMatchObject({ level: 1, xp: 0 })
    gainXp('player_01', '九阴白骨爪', 230)              // 升到 2 级：200×1.15^1 = 230
    expect(player().abilities['九阴白骨爪']).toMatchObject({ level: 2, xp: 0 })
    // 第 3 级需 200×1.15² = 264.5 → 打 264 不够，再打 1 点才够
    gainXp('player_01', '九阴白骨爪', 264)
    expect(player().abilities['九阴白骨爪'].level).toBe(2)
    gainXp('player_01', '九阴白骨爪', 1)
    expect(player().abilities['九阴白骨爪']).toMatchObject({ level: 3, xp: 0.5 })  // 265 − 264.5
    expect(DEFAULT_XP_RATIO).toBeCloseTo(1.15, 10)
  })

  it('ratio 缺省 → 项目约定 1.15', () => {
    const mod = modLoader.getMod() as any
    mod.abilities['九阴白骨爪'].xp_per_level = { base: 100 }
    gainXp('player_01', '九阴白骨爪', 100)
    gainXp('player_01', '九阴白骨爪', 114)
    expect(player().abilities['九阴白骨爪'].level).toBe(1)   // 115 才够
    gainXp('player_01', '九阴白骨爪', 1)
    expect(player().abilities['九阴白骨爪'].level).toBe(2)
  })
})

describe('到顶后 xp 钳满值（不无界累加）', () => {
  it('def.max_level 到顶：xp 停在"下一级所需"，多余清零', () => {
    gainXp('player_01', '华山剑法', 150)                 // 1 级（花 100），余 50
    expect(player().abilities['华山剑法']).toMatchObject({ level: 1, xp: 50 })
    gainXp('player_01', '华山剑法', 1000)                // 升到 2 级（=max）后余 950 → 钳到 100
    expect(player().abilities['华山剑法']).toMatchObject({ level: 2, xp: 100 })
  })
})

describe('外部层数上限提供者（秘籍钳制）', () => {
  it('上限低于 def.max_level → 停在钳制层，xp 保持满值', () => {
    registerLevelCapProvider(() => 1)
    gainXp('player_01', '九阴白骨爪', 10000)
    // 到 1 级后不能再升 → xp 钳在"升 2 级所需" 200×1.15 = 230
    expect(player().abilities['九阴白骨爪']).toMatchObject({ level: 1, xp: 230 })
  })

  it('提供者返回 null（该角色对该秘籍无进度）→ 不钳制（NPC 直接授权技能零影响）', () => {
    registerLevelCapProvider(() => null)
    gainXp('player_01', '华山剑法', 10000)
    expect(player().abilities['华山剑法']).toMatchObject({ level: 2, xp: 100 })
  })

  it('多个提供者取最小上限', () => {
    registerLevelCapProvider(() => 5)
    registerLevelCapProvider(() => 2)
    gainXp('player_01', '九阴白骨爪', 10000)
    expect(player().abilities['九阴白骨爪'].level).toBe(2)
  })

  it('上限低于当前层 → 不回退已存层数（钳制只在增长时生效）', () => {
    gainXp('player_01', '九阴白骨爪', 999)  // 升到 4 级的累计需求 ≈ 998.675 → 给足（浮点余量）
    expect(player().abilities['九阴白骨爪'].level).toBe(4)
    registerLevelCapProvider(() => 1)
    gainXp('player_01', '九阴白骨爪', 0)                             // 任何后续写入都不降级
    expect(player().abilities['九阴白骨爪'].level).toBe(4)
  })

  it('提供者抛错 → 忽略该提供者 + 上报，不阻断升级', () => {
    registerLevelCapProvider(() => { throw new Error('boom') })
    gainXp('player_01', '华山剑法', 10000)
    expect(player().abilities['华山剑法'].level).toBe(2)
    expect(errorReporter.getErrors().some(e => e.message.includes('层数上限提供者抛错'))).toBe(true)
  })
})

describe('recheck 补升（秘籍升层后立即生效）', () => {
  it('上限放宽 → 满值的技能立刻补升（幂等）', () => {
    let cap = 1
    registerLevelCapProvider(() => cap)
    gainXp('player_01', '九阴白骨爪', 200 + 230)   // 只到 1 级，xp 钳在 230（第 2 级所需）
    expect(player().abilities['九阴白骨爪']).toMatchObject({ level: 1, xp: 230 })
    cap = 3
    recheck('player_01', '九阴白骨爪')
    expect(player().abilities['九阴白骨爪']).toMatchObject({ level: 2, xp: 0 })
    recheck('player_01', '九阴白骨爪')             // 幂等：xp 0 不再升
    expect(player().abilities['九阴白骨爪'].level).toBe(2)
  })

  it('未指定 abilityId → 遍历该角色全部 xp 技能', () => {
    let cap = 0
    registerLevelCapProvider(() => cap)
    gainXp('player_01', '华山剑法', 1000)
    // cap 0 → 一级都升不了，xp 钳在 100（"升 1 级所需"），多打的 900 被清零
    expect(player().abilities['华山剑法']).toMatchObject({ level: 0, xp: 100 })
    cap = 2
    recheck('player_01')
    // 补升一级（花 100），下一级还差 100 → 停在 1 级
    expect(player().abilities['华山剑法']).toMatchObject({ level: 1, xp: 0 })
  })
})

describe('外部经验曲线提供者（品级表驱动）', () => {
  it('提供者优先于 def 自带的曲线', () => {
    registerXpCurveProvider((_c, abilityId) => (abilityId === '华山剑法' ? 500 : null))
    gainXp('player_01', '华山剑法', 499)
    expect(player().abilities['华山剑法'].level).toBe(0)
    gainXp('player_01', '华山剑法', 1)
    expect(player().abilities['华山剑法'].level).toBe(1)
  })

  it('返回 null / 非正数 → 退回 def 曲线', () => {
    registerXpCurveProvider(() => null)
    registerXpCurveProvider(() => 0)
    gainXp('player_01', '华山剑法', 100)
    expect(player().abilities['华山剑法'].level).toBe(1)
  })

  it('提供者抛错 → 忽略 + 上报 + 回退 def 曲线', () => {
    registerXpCurveProvider(() => { throw new Error('boom') })
    gainXp('player_01', '华山剑法', 100)
    expect(player().abilities['华山剑法'].level).toBe(1)
    expect(errorReporter.getErrors().some(e => e.message.includes('经验曲线提供者抛错'))).toBe(true)
  })
})
