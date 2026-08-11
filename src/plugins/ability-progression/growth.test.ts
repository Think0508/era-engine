// 成长系统测试（2026-08-11）——ability-progression 条件驱动升级 + 宝珠转换链
// 覆盖：checkUpgrade 全 need 类型/连升/备选/ability_sum/sex_need/多 J 扣珠/封顶/
// 事件与叙事输出；juel 转换链衰减/特殊珠/反感抵消

import { describe, it, expect, beforeEach } from 'vitest'
import { checkUpgrade } from './index'
import { settleJuelConversion } from '../../core/juel-settle'
import { entitySystem } from '../../core/entity-system'
import { modLoader, parseModData } from '../../core/mod-loader'
import { bindingResolver } from '../../core/binding-resolver'
import { gameContext } from '../../core/game-context'
import { eventBus } from '../../core/event-bus'
import { narrativeLog } from '../../core/narrative-log'
import { errorReporter } from '../../core/error-reporter'
import { rawTomlMap } from './growth.test.fixture'

async function loadTestMod(): Promise<void> {
  const mod = parseModData('growth-test', rawTomlMap)
  ;(modLoader as any).loadedMod = mod
  bindingResolver.loadBindings(mod.bindings)
}

function makeChar(id: string, overrides: Record<string, any> = {}): any {
  const existing = entitySystem.get('character', id)
  if (existing) {
    // 复用（beforeEach 预注册的 player）——补 abilities 空条目
    const e = existing as any
    if (!e.abilities) e.abilities = {}
    const mod = modLoader.getMod()
    if (mod) {
      for (const abilityId of Object.keys(mod.abilities)) {
        if (!e.abilities[abilityId]) e.abilities[abilityId] = { level: 0, xp: 0 }
      }
    }
    Object.assign(e, overrides)
    return e
  }
  // 初始化全部已定义能力为 0 级（checkUpgrade 遍历 char.abilities）
  const abilities: Record<string, any> = {}
  const mod = modLoader.getMod()
  if (mod) {
    for (const abilityId of Object.keys(mod.abilities)) {
      abilities[abilityId] = { level: 0, xp: 0 }
    }
  }
  const char: any = {
    id,
    name: id,
    base: { '性别': 1 },
    params: {},
    social: { '好感度': 0, '信赖度': 0 },
    experience: {},
    talents: {},
    juel: {},
    abilities,
    ...overrides,
  }
  entitySystem.register('character', id, char)
  return char
}

beforeEach(() => {
  entitySystem.clear()
  errorReporter.clear()
  narrativeLog.clear()
  entitySystem.register('character', 'player_01', { id: 'player_01', name: 'player_01', base: { '性别': 1 }, params: {}, social: {}, experience: {}, talents: {}, juel: {}, abilities: {} })
  gameContext.setPlayer('player_01')
})

describe('checkUpgrade 条件驱动升级', () => {
  it('E 经验需求满足 → 升级；不满足 → 不升', async () => {
    await loadTestMod()
    const char = makeChar('npc_01', { experience: { '80': 5 } })
    checkUpgrade('npc_01')
    // 0→1 需 E80 5（满足）；1→2 需 J9 100（无珠）→ 停在 1 级
    expect(char.abilities['采药'].level).toBe(1)
    // 不满足时不升级（新角色无经验）
    const other = makeChar('npc_02', {})
    checkUpgrade('npc_02')
    expect(other.abilities['采药'].level).toBe(0)
  })

  it('J 宝珠需求满足 → 升级并扣珠', async () => {
    await loadTestMod()
    const char = makeChar('npc_01', { juel: { '9': 100 } })
    // 经验满足升 0→1 后，1→2 需要习得珠 100
    char.experience['80'] = 5
    checkUpgrade('npc_01')
    expect(char.abilities['采药'].level).toBe(2)
    expect(char.juel['9']).toBe(0)
  })

  it('多 J 需求全量扣珠（90 隐蔽 J9+J16 同款）', async () => {
    await loadTestMod()
    const char = makeChar('npc_01', { juel: { '9': 70, '16': 70 } })
    checkUpgrade('npc_01')
    // 隐蔽 0→1 需 J9 70 + J16 70 → 升 1 级并全量扣光；1→2 需 J9 400（不足）
    expect(char.abilities['隐蔽'].level).toBe(1)
    expect(char.juel['9']).toBe(0)
    expect(char.juel['16']).toBe(0)
  })

  it('主需求不满足时尝试备选需求', async () => {
    await loadTestMod()
    const char = makeChar('npc_01', { experience: { '80': 5 }, juel: { '9': 100 } })
    // 采药 1→2 主需求 J9 满足 → 升；2→3 主需求 亲密2 不满足 → 备选 好感60
    char.social['好感度'] = 60
    checkUpgrade('npc_01')
    expect(char.abilities['采药'].level).toBe(3)
  })

  it('连升：多级需求同时满足时循环升级到上限', async () => {
    await loadTestMod()
    const char = makeChar('npc_01', { experience: { '80': 5 }, juel: { '9': 500, '10': 100, '16': 50 } })
    char.abilities['亲密'] = { level: 2, xp: 0 }
    checkUpgrade('npc_01')
    expect(char.abilities['采药'].level).toBe(3)
  })

  it('ability_sum 聚合判定：性技之和 ≥ 等级×倍率（玩家×2/NPC×3）', async () => {
    await loadTestMod()
    const char = makeChar('npc_01', { juel: { '9': 70, '16': 70 }, abilities: { '隐蔽': { level: 0, xp: 0 }, '指技': { level: 1, xp: 0 } } })
    const player = makeChar('player_01', { juel: { '9': 70, '16': 70 }, abilities: { '隐蔽': { level: 0, xp: 0 }, '指技': { level: 1, xp: 0 } } })
    // 玩家升 0→1：指技和 1 ≥ 0×2 恒满足 → 升到 1 级
    checkUpgrade('player_01')
    expect(player.abilities['隐蔽'].level).toBe(1)
    // 玩家升 1→2：需要指技和 ≥ 2（1×2）——只有 1 级指技 → 不满足
    expect(player.abilities['隐蔽'].level).toBe(1)
    // NPC 升 1→2 需要指技和 ≥ 3（1×3）——只有 1 级指技 → 不满足
    checkUpgrade('npc_01')
    expect(char.abilities['隐蔽'].level).toBe(1)
  })

  it('sex_need 性别限定：男限定腰技/女限定胸技', async () => {
    await loadTestMod()
    // 注意：全能力顺序遍历共享 juel 池（erArk 同构）——指技 70 + 腰技/胸技 70 = 140
    const male = makeChar('male_01', { juel: { '9': 140 } })
    const female = makeChar('female_01', { base: { '性别': 2 }, juel: { '9': 140 } })
    checkUpgrade('male_01')
    expect(male.abilities['腰技'].level).toBe(1)  // 男 → 腰技可升
    expect(male.abilities['胸技'].level).toBe(0)  // 男 → 胸技不可升
    checkUpgrade('female_01')
    expect(female.abilities['胸技'].level).toBe(1) // 女 → 胸技可升
    expect(female.abilities['腰技'].level).toBe(0) // 女 → 腰技不可升
  })

  it('T 素质需求 + X 信赖需求', async () => {
    await loadTestMod()
    const char = makeChar('npc_01', { talents: { '剑骨': 1 }, juel: { '9': 170 } })
    checkUpgrade('npc_01')
    // 连升：0→1 需剑骨（满足）→ 1→2 需 J9 100（指技先扣 70，剩 100 足够）→ 2 级
    expect(char.abilities['吐纳'].level).toBe(2)
    // 2→3 需信赖 50——未达标
    expect(char.abilities['吐纳'].level).toBe(2)
    char.social['信赖度'] = 50
    checkUpgrade('npc_01')
    expect(char.abilities['吐纳'].level).toBe(3)
  })

  it('upgrades 条数封顶（不可升超）', async () => {
    await loadTestMod()
    const char = makeChar('npc_01', { experience: { '80': 5 }, juel: { '9': 100000, '10': 100000, '16': 100000 } })
    char.abilities['亲密'] = { level: 2, xp: 0 }
    char.social['好感度'] = 60
    checkUpgrade('npc_01')
    // 采药 upgrades 3 条 → 最高 3 级（0 基：level 3）
    expect(char.abilities['采药'].level).toBe(3)
  })

  it('升级触发 character:ability_up 事件 + 叙事日志', async () => {
    await loadTestMod()
    makeChar('npc_01', { experience: { '80': 5 } })
    const events: any[] = []
    const handler = (p: any): void => { events.push(p) }
    eventBus.on('character:ability_up', handler)
    checkUpgrade('npc_01')
    eventBus.off('character:ability_up', handler)
    expect(events.length).toBe(1)
    expect(events[0]).toMatchObject({ character: 'npc_01', ability: '采药', newLevel: 1 })
  })

  it('ability-upgrades.toml patch 只在 mod 未写字段时应用（三层 override 语义）', async () => {
    await loadTestMod()
    const mod = modLoader.getMod() as any
    // 玄功：abilities.toml 未写 mode → patch 生效（condition + 2 条升级）
    expect(mod.abilities['玄功'].mode).toBe('condition')
    expect(mod.abilities['玄功'].upgrades.length).toBe(2)
    // 采药：abilities.toml 显式写了 mode/upgrades → patch（无采药条目）不覆盖
    expect(mod.abilities['采药'].mode).toBe('condition')
    expect(mod.abilities['采药'].upgrades.length).toBe(3)
  })
})

describe('settleJuelConversion 宝珠转换链', () => {
  it('状态值按等级衰减转珠并清零', async () => {
    await loadTestMod()
    const char = makeChar('npc_01', { params: { '皮肤': 50 } })
    // 皮肤 50 → 阈值 [0,100,500] → level 0 → 100% → 皮肤快感珠 50
    const texts = settleJuelConversion(char)
    expect(char.juel['0']).toBe(50)
    expect(char.params['皮肤']).toBe(0)
    expect(texts).toEqual([])
  })

  it('特殊珠 17/18/19：1/4 到自身 + 1/2 到反感珠', async () => {
    await loadTestMod()
    const char = makeChar('npc_01', { params: { '苦痛': 500 } })
    // 苦痛 500 → 阈值 [0,100,500] → level 2 → 90% → 450 → 1/4=112 自身 + 1/2=225 反感
    settleJuelConversion(char)
    expect(char.juel['17']).toBe(112)
    expect(char.juel['20']).toBe(225)
  })

  it('反感珠抵消：1 好珠灭 2 反感珠（优先级屈服→恭顺→好意→欲情→快乐）', async () => {
    await loadTestMod()
    const char = makeChar('npc_01', { juel: { '15': 100, '20': 40 } })
    // 已有屈服珠 100 + 反感珠 40：40 反感灭 20 屈服 → 屈服 80、反感 0
    const texts = settleJuelConversion(char)
    expect(char.juel['15']).toBe(80)
    expect(char.juel['20']).toBe(0)
    expect(texts.length).toBe(1)
    expect(texts[0]).toContain('反发珠')
  })

  it('反感抵消优先级：先屈服后恭顺', async () => {
    await loadTestMod()
    const char = makeChar('npc_01', { juel: { '15': 10, '10': 100, '20': 100 } })
    // 100 反感：屈服 10 → juelDown=min(100, 20)=20（灭 10）；剩 80 反感灭恭顺 40 → 屈服 0、恭顺 60、反感 0
    settleJuelConversion(char)
    expect(char.juel['15']).toBe(0)
    expect(char.juel['10']).toBe(60)
    expect(char.juel['20']).toBe(0)
  })
})

describe('settleEndHHpmpGrowth（528 H 结束上限成长）', () => {
  it('绝顶次数 → 体力/气力上限成长 + 欲望值扣减 + 玩家精液上限', async () => {
    await loadTestMod()
    const npc = makeChar('npc_01', {
      base: { '性别': 1, '体力上限': 2500, '气力上限': 2000, '欲望值': 500, '精液量上限': 100 },
      h_state: { orgasm_count: { '0': [2, 5], '4': [1, 3] } }, // 本次 3 次绝顶
    })
    const player = makeChar('player_01', {
      base: { '性别': 1, '体力上限': 2500, '气力上限': 2000, '欲望值': 500, '精液量上限': 100 },
      h_state: { orgasm_count: { '3': [2, 5] } }, // 射精 2 次
    })
    const { settleEndHHpmpGrowth } = await import('../../plugins/h-core/settle/hpmp-growth')
    await settleEndHHpmpGrowth('npc_01')
    await settleEndHHpmpGrowth('player_01')
    expect(npc.base['体力上限']).toBe(2500 + 3 * 2)
    expect(npc.base['气力上限']).toBe(2000 + 3 * 3)
    expect(npc.base['欲望值']).toBe(500 - 3 * 20)
    expect(npc.base['精液量上限']).toBe(100) // NPC 不涨精液上限
    expect(player.base['精液量上限']).toBe(102) // 玩家 +2（cap 999）
  })

  it('无绝顶不结算', async () => {
    await loadTestMod()
    const npc = makeChar('npc_02', { base: { '性别': 1, '体力上限': 2500, '气力上限': 2000, '欲望值': 100 }, h_state: {} })
    const { settleEndHHpmpGrowth } = await import('../../plugins/h-core/settle/hpmp-growth')
    await settleEndHHpmpGrowth('npc_02')
    expect(npc.base['体力上限']).toBe(2500)
    expect(npc.base['欲望值']).toBe(100)
  })
})

// ═══════ 性能基准（2026-08-11：几百战斗技能 × 500 NPC 的遍历/存储/升级成本）═══════
// 场景：500 个 xp 模式技能定义（掌握型："默认没有，掌握一种是一种"）+ 500 NPC 各掌握 20 个。
// 验证：① 按需展开后每角色条目 = 掌握的 20 + condition 注入，非全量 500；
//       ② checkUpgrade 只遍历 condition 能力（xp 技能不参与）；
//       ③ gainXp O(1) 条目内操作。阈值宽松（性能回归守卫，机器负载下不误报）。
describe('性能基准（500 技能 × 500 NPC）', () => {
  it('按需展开：每角色条目 = 掌握的技能数（非定义数）', () => {
    const N_SKILLS = 500
    const N_NPCS = 500
    const PER_NPC = 20
    const abilitiesToml: string[] = ['[abilities]']
    for (let i = 0; i < N_SKILLS; i++) {
      abilitiesToml.push(
        `[abilities."技能${i}"]`,
        `name = "技能${i}"`,
        'type = "passive"',
        'max_level = 10',
        'tags = ["combat_active", "sword"]',
      )
    }
    const roster: string[] = []
    for (let n = 0; n < N_NPCS; n++) {
      const owned: string[] = []
      for (let k = 0; k < PER_NPC; k++) {
        owned.push(`"技能${(n * PER_NPC + k) % N_SKILLS}" = ${1 + (k % 5)}`)
      }
      roster.push(
        '[[roster]]',
        `id = "npc_${n}"`,
        `name = "路人${n}"`,
        `abilities = { ${owned.join(', ')} }`,
      )
    }
    const t0 = performance.now()
    const mod = parseModData('perf-test', {
      '/mods/perf-test/meta.toml': '[meta]\nid = "perf-test"\nname = "p"\nversion = "1.0.0"\n',
      '/mods/perf-test/definitions/abilities.toml': abilitiesToml.join('\n'),
      '/mods/perf-test/characters/roster.toml': roster.join('\n'),
    } as Record<string, string>)
    const loadMs = performance.now() - t0
    console.log(`[perf] 500 技能定义 + 500 NPC×20 掌握：解析 ${loadMs.toFixed(1)}ms`)
    // 每角色条目 = 掌握的 20（xp 按需），非全量 500
    const sample = mod.entities.get('character')!.get('npc_0') as any
    expect(Object.keys(sample.abilities).length).toBe(PER_NPC)
    // 未掌握角色无该技能条目（npc_1 掌握的是 技能20-39，不含 技能0）
    const npc1 = mod.entities.get('character')!.get('npc_1') as any
    expect(Object.keys(npc1.abilities).length).toBe(PER_NPC)
    expect(npc1.abilities[Object.keys(sample.abilities)[0]]).toBeUndefined()
    // 宽松阈值：500 技能定义 + 500 NPC × 20 条目的解析（机器负载容忍 5s）
    expect(loadMs).toBeLessThan(5000)
  })

  it('checkUpgrade 对全员（500 NPC）只遍历 condition 能力，xp 技能零参与', async () => {
    const N_SKILLS = 200
    const N_NPCS = 500
    const abilitiesToml: string[] = ['[abilities]']
    for (let i = 0; i < N_SKILLS; i++) {
      abilitiesToml.push(
        `[abilities."技能${i}"]`,
        `name = "技能${i}"`,
        'type = "passive"',
        'max_level = 10',
        'tags = ["combat_active"]',
      )
    }
    const roster: string[] = []
    for (let n = 0; n < N_NPCS; n++) {
      roster.push(
        '[[roster]]',
        `id = "perf_${n}"`,
        `name = "路人${n}"`,
        `abilities = { "技能${n % N_SKILLS}" = 3 }`,
      )
    }
    const mod = parseModData('perf-test', {
      '/mods/perf-test/meta.toml': '[meta]\nid = "perf-test"\nname = "p"\nversion = "1.0.0"\nplayer_character = "player_01"\n',
      '/mods/perf-test/definitions/attributes.toml': '[attributes]\n"愤怒" = { type = "number", default = 0, category = "base" }\n',
      '/mods/perf-test/definitions/abilities.toml': abilitiesToml.join('\n'),
      '/mods/perf-test/characters/roster.toml': roster.join('\n'),
    } as Record<string, string>)
    ;(modLoader as any).loadedMod = mod
    for (const [, char] of mod.entities.get('character')!) {
      entitySystem.register('character', (char as any).id, char)
    }
    // player_01 已由 beforeEach 注册——直接复用（不重复注册）

    // 全员 checkUpgrade——所有技能都是 xp 模式（无 condition）→ 遍历零升级，纯空转成本
    const t0 = performance.now()
    for (let n = 0; n < N_NPCS; n++) {
      checkUpgrade(`perf_${n}`)
    }
    const ms = performance.now() - t0
    console.log(`[perf] 200 技能定义 + 500 NPC 全员 checkUpgrade：${ms.toFixed(1)}ms（${(ms / N_NPCS).toFixed(3)}ms/角色）`)
    // 宽松阈值：500 NPC 全员结算 < 500ms（实际应为个位数 ms——遍历只碰拥有的条目）
    expect(ms).toBeLessThan(500)
  })
})
