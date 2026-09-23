// manual-system 单元测试（2026-09-23 秘籍-技能系统）
// 覆盖：cap 解析（含残本链与永久解锁）/ 修炼（门槛·经验·上限三条受阻）/ 发放与授予规则 /
//       分层技能同步 / 层奖励 / 内功装配与槽位 / 击败经验与首杀 / 技能经验闸门 / 补升 /
//       条件路径 / effect 与 API 注册

import { describe, it, expect, beforeEach } from 'vitest'
import { onLoad, onEnable } from './index'
import { manualState, practice, grantLayers, unlockCap, listManuals, grantAbility, syncManualGrants } from './manual'
import { equip, unequip, slots, listEquipped } from './internal'
import { settleKillExp, killLedgerKey } from './economy'
import { onSkillUsed, levelCapProvider, skillCostProvider } from './skills'
import { __resetManualContext } from './context'
import { entitySystem } from '../../core/entity-system'
import { modLoader, parseModData } from '../../core/mod-loader'
import { bindingResolver } from '../../core/binding-resolver'
import { gameContext } from '../../core/game-context'
import { apiSystem } from '../../core/api'
import { effectTypeRegistry } from '../../core/effect-type-registry'
import { eventBus } from '../../core/event-bus'
import { narrativeLog } from '../../core/narrative-log'
import { errorReporter } from '../../core/error-reporter'
import { configureAttributeEval, __resetAttributeEval } from '../../core/attribute-eval'
import { getEntityAttr, readRawAttr, applyAttrDelta } from '../../core/entity-utils'
import { conditionRegistry } from '../../core/condition-registry'
import { onEnable as abilitiesOnEnable, __resetAbilityGrowthProviders } from '../ability-progression/index'
import { rawTomlMap } from './manual.test.fixture'

function loadTestMod(): ReturnType<typeof parseModData> {
  const mod = parseModData('manual-test', rawTomlMap)
  ;(modLoader as any).loadedMod = mod
  bindingResolver.loadBindings(mod.bindings)
  conditionRegistry.clear()
  conditionRegistry.registerFromAttributes(mod.attributes)
  configureAttributeEval({
    definitions: mod.attributes as any,
    defs: { items: mod.items, abilities: mod.abilities, talentDefs: mod.talentDefs },
  })
  return mod
}

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

function player(): any {
  return entitySystem.get('character', 'player_01')
}

beforeEach(() => {
  __resetAttributeEval()
  __resetManualContext()
  __resetAbilityGrowthProviders()
  entitySystem.clear()
  errorReporter.clear()
  narrativeLog.clear()
  apiSystem.clear()
  eventBus.clear()
  effectTypeRegistry.clear()
  const mod = loadTestMod()
  entitySystem.register('character', 'player_01', {
    id: 'player_01',
    name: '主角',
    template: 'hero',
    base: { 经验: 0, 内功位: 1, 悟性: 10, 拳掌系数: 0, 武学常识: 0, 气血上限: 100, 轻灵: 0, hp: 100, hp_max: 100, mp: 50, mp_max: 50 },
    talents: {},
    abilities: {},
    inventory: [],
  })
  gameContext.setPlayer('player_01')
  // ability-progression 先 onEnable（与生产启动顺序一致：abilities:ready 是 manual-system 的依赖）
  abilitiesOnEnable(makeMockCtx())
  const ctx = makeMockCtx()
  onLoad(ctx)
  onEnable(ctx)
  void mod
})

function give(itemId: string): void {
  player().inventory.push({ itemId, count: 1 })
}

function setExp(n: number): void {
  applyAttrDelta(player(), '经验', n - readRawAttr(player(), '经验'))
}

describe('cap 解析（残本链与永久解锁）', () => {
  it('持人皮 → cap 5；加上卷 → 7；完整本 → max_layer 11', () => {
    give('九阴人皮')
    expect(manualState('player_01', '九阴真经')!.cap).toBe(5)
    give('九阴真经上卷')
    expect(manualState('player_01', '九阴真经')!.cap).toBe(7)   // 取持有者的最大值
    give('九阴真经·完整')
    expect(manualState('player_01', '九阴真经')!.cap).toBe(11)
  })

  it('全部载体丢掉 → cap 归零；已练层数与已得收益分毫不动', () => {
    give('九阴人皮')
    setExp(1000)
    practice('player_01', '九阴真经', 2)
    expect(player().manuals['九阴真经'].level).toBe(2)
    expect(player().abilities['九阴真经心法'].level).toBe(2)
    player().inventory = []
    expect(manualState('player_01', '九阴真经')!.cap).toBe(0)
    const r = practice('player_01', '九阴真经', 1)
    expect(r.ok).toBe(false)
    expect(r.reasons[0]).toContain('未持有')
    expect(player().manuals['九阴真经'].level).toBe(2)          // 不回退
    expect(player().abilities['九阴真经心法'].level).toBe(2)
  })

  it('unlockCap：剧情物品消耗掉也能继续练（总纲特例）；只增不减', () => {
    give('九阴人皮')
    unlockCap('player_01', '九阴真经', 11)
    expect(manualState('player_01', '九阴真经')!.cap).toBe(11)
    expect(unlockCap('player_01', '九阴真经', 3)).toBe(false)   // 降不下来
    expect(manualState('player_01', '九阴真经')!.cap).toBe(11)
  })
})

describe('修炼：三条受阻路径都不扣经验、不发收益', () => {
  it('门槛不满足（requires）', () => {
    give('九阴人皮')
    setExp(1000)
    player().base['悟性'] = 0
    const r = practice('player_01', '九阴真经', 1)
    expect(r.ok).toBe(false)
    expect(r.reasons.join()).toContain('不满足修炼要求')
    expect(readRawAttr(player(), '经验')).toBe(1000)
    expect(player().manuals['九阴真经']?.level ?? 0).toBe(0)
  })

  it('经验不足', () => {
    give('初级拳法秘籍')
    setExp(100)
    const r = practice('player_01', '初级拳法', 1)              // 三流第 1 层需 250
    expect(r.ok).toBe(false)
    expect(r.reasons.join()).toContain('经验不足')
    expect(readRawAttr(player(), '经验')).toBe(100)
  })

  it('超过 cap（残本只能练到 5 层）', () => {
    give('九阴人皮')
    applyAttrDelta(player(), '悟性', 5)                          // 满足 requires
    setExp(1000000)
    practice('player_01', '九阴真经', 0)                         // 连修到不能修
    expect(player().manuals['九阴真经'].level).toBe(5)
    const st = manualState('player_01', '九阴真经')!
    expect(st.canPractice).toBe(false)
    expect(st.reasons.join()).toContain('只能练到第 5 层')
  })
})

describe('修炼：成本、成长与日志', () => {
  it('第 1 层：扣经验 + 系数成长 + 武常 + 授予技能', () => {
    give('初级拳法秘籍')
    setExp(1000)
    const r = practice('player_01', '初级拳法', 1)
    expect(r).toMatchObject({ ok: true, gained: 1 })
    expect(readRawAttr(player(), '经验')).toBe(750)              // 250
    expect(readRawAttr(player(), '拳掌系数')).toBe(1)             // 品级表 coeff_bands（1-3 层 min=max=1）
    expect(readRawAttr(player(), '武学常识')).toBe(1)             // 品级表 auto_growth
    expect(player().abilities['基础掌法']).toMatchObject({ level: 1, xp: 0 })
    expect(narrativeLog.getEntries().some(e => e.text.includes('初级拳法练至第 1 层'))).toBe(true)
  })

  it('每层各发一次（不重复发放）：第 2 层再涨一次系数与武常', () => {
    give('初级拳法秘籍')
    setExp(1000)
    practice('player_01', '初级拳法', 2)
    expect(readRawAttr(player(), '拳掌系数')).toBe(2)
    expect(readRawAttr(player(), '武学常识')).toBe(2)
    // 三流：第 1 层 250，第 2 层 250×1.15 = 287.5
    expect(readRawAttr(player(), '经验')).toBe(1000 - 250 - 287.5)
  })

  it('连修（layers=0）到不能修为止，并返回受阻原因', () => {
    give('初级拳法秘籍')
    setExp(250 + 288)
    const r = practice('player_01', '初级拳法', 0)
    expect(r.gained).toBe(2)
    expect(r.reasons.join()).toContain('经验不足')
    expect(player().manuals['初级拳法'].level).toBe(2)
  })

  it('每层成长可写 range（随机区间）——同层每次 roll 一次', () => {
    // 九阴真经 layer_growth = 轻灵 +1（固定）→ 练 3 层 = +3
    give('九阴人皮')
    applyAttrDelta(player(), '悟性', 5)
    setExp(100000)
    practice('player_01', '九阴真经', 3)
    expect(readRawAttr(player(), '轻灵')).toBe(3)
  })
})

describe('层奖励与授予规则', () => {
  it('分层被动技能（内功）层数 = 秘籍进度（同步写）', () => {
    give('九阴人皮')
    applyAttrDelta(player(), '悟性', 5)
    setExp(100000)
    practice('player_01', '九阴真经', 3)
    expect(player().abilities['九阴真经心法'].level).toBe(3)
  })

  it('不分层被动技能（max_level=0）获得即 1 级完全体', () => {
    give('九阴人皮')
    applyAttrDelta(player(), '悟性', 5)
    setExp(100000)
    practice('player_01', '九阴真经', 4)
    expect(player().abilities['凌波微步']).toMatchObject({ level: 1, xp: 0 })
    // 属性修正按拥有即生效（轻灵 +5）
    expect(getEntityAttr(player(), '轻灵')).toBe(4 + 5)
  })

  it('已拥有同一技能 → 跳过（视为该奖励不存在）；分层技能取更高层', () => {
    player().abilities['九阴真经心法'] = { level: 2, xp: 0 }
    grantAbility(player(), '九阴真经心法', 1)                     // 目标 1 ≤ 现有 2 → 不动
    expect(player().abilities['九阴真经心法'].level).toBe(2)

    player().abilities['摧坚神爪'] = { level: 1, xp: 0 }
    grantAbility(player(), '摧坚神爪', 4)
    expect(player().abilities['摧坚神爪'].level).toBe(4)          // 更高层 → 提升
  })

  it('第 10 层：天赋 + 属性奖励（永久写基础值）', () => {
    give('九阴真经·完整')
    applyAttrDelta(player(), '悟性', 5)
    setExp(100000000)
    practice('player_01', '九阴真经', 0)
    expect(player().manuals['九阴真经'].level).toBe(11)           // 完整本 → 可练到 max_layer
    expect(player().talents['九阴天赋']).toBe(1)
    // 每层成长 轻灵 +1 ×11 层 + 第 10 层的属性奖励 +12 = 23
    expect(readRawAttr(player(), '轻灵')).toBe(11 + 12)
    // 主动技能**不同步层数**（靠用技能涨经验）：第 8 层授予即 1 级
    expect(player().abilities['摧坚神爪'].level).toBe(1)
    // 分层被动技能（内功）同步到秘籍进度
    expect(player().abilities['九阴真经心法'].level).toBe(11)
  })

  it('层门槛（layer_requires 引用同步后的内功层数）：第 5 层可过、第 6 层被卡到心法跟上', () => {
    give('九阴真经·完整')
    applyAttrDelta(player(), '悟性', 5)
    setExp(100000000)
    const r = practice('player_01', '九阴真经', 0)
    // 心法与秘籍同步 → 第 6 层门槛（心法 ≥5）在练到第 5 层时即满足，故可一路练下去
    expect(r.reasons).not.toContain('不满足第 6 层门槛')
    expect(player().manuals['九阴真经'].level).toBe(11)
  })

  it('事件直给的分层被动技能：先停 1 级，秘籍练上来后同步提升', () => {
    player().abilities['九阴真经心法'] = { level: 1, xp: 0 }
    expect(player().abilities['九阴真经心法'].level).toBe(1)
    give('九阴人皮')
    applyAttrDelta(player(), '悟性', 5)
    setExp(100000)
    practice('player_01', '九阴真经', 3)
    expect(player().abilities['九阴真经心法'].level).toBe(3)
    syncManualGrants(player())
    expect(player().abilities['九阴真经心法'].level).toBe(3)      // 幂等
  })
})

describe('grantsLayers（剧情直给层数）', () => {
  it('不走经验与门槛，仍走发放管线（成长/技能照发），受 max_layer 限制', () => {
    const r = grantLayers('player_01', '九阴真经', 3)
    expect(r).toMatchObject({ ok: true, gained: 3 })
    expect(readRawAttr(player(), '经验')).toBe(0)                // 不花经验
    expect(player().abilities['九阴真经心法'].level).toBe(3)
    expect(player().abilities['九阴白骨爪'].level).toBe(1)
    expect(readRawAttr(player(), '轻灵')).toBe(3)
    expect(grantLayers('player_01', '九阴真经', 99).gained).toBe(8)  // 11 - 3
    expect(player().manuals['九阴真经'].level).toBe(11)
  })
})

describe('内功装配（槽位 = 属性有效值）', () => {
  beforeEach(() => {
    applyAttrDelta(player(), '悟性', 5)
    give('九阴人皮')
    setExp(100000)
    practice('player_01', '九阴真经', 2)                         // 心法 2 级
  })

  it('装配 → 属性/上限按层数生效；卸下 → 完全回落', () => {
    expect(getEntityAttr(player(), '气血上限')).toBe(100)
    expect(equip('player_01', '九阴真经心法')).toMatchObject({ ok: true })
    // flat 200 + per_level 50×(2−1) = 250
    expect(getEntityAttr(player(), '气血上限')).toBe(350)
    expect(getEntityAttr(player(), '轻灵')).toBe(2 + 3)           // 每层 +1 + 装配 flat 3
    expect(unequip('player_01', '九阴真经心法')).toMatchObject({ ok: true })
    expect(getEntityAttr(player(), '气血上限')).toBe(100)
  })

  it('槽位满 → 拒绝第二本；内功位 = -1 → 无限', () => {
    const mod = modLoader.getMod() as any
    // 造第二本可装配内功
    mod.abilities['龟息功'].max_level = 10
    player().abilities['龟息功'] = { level: 1, xp: 0 }

    expect(equip('player_01', '九阴真经心法').ok).toBe(true)
    const full = equip('player_01', '龟息功')
    expect(full.ok).toBe(false)
    expect(full.reason).toContain('内功位已满')

    applyAttrDelta(player(), '内功位', 1)                         // 加一个内功位（走属性层）
    expect(equip('player_01', '龟息功').ok).toBe(true)
    expect(slots('player_01')).toMatchObject({ used: 2, total: 2 })

    player().base['内功位'] = -1                                 // 无限
    expect(slots('player_01')).toMatchObject({ unlimited: true, total: -1 })
    mod.abilities['第三内功'] = { name: '第三内功', type: 'passive', max_level: 10, equipped_mods: [{ attr: '轻灵', flat: 1 }] }
    player().abilities['第三内功'] = { level: 1, xp: 0 }
    expect(equip('player_01', '第三内功').ok).toBe(true)
  })

  it('不可装配 / 未学会 / 重复装配 → 拒绝并给原因', () => {
    expect(equip('player_01', '九阴白骨爪').reason).toContain('不可装配')
    expect(equip('player_01', '龟息功').reason).toContain('尚未学会')
    expect(equip('player_01', '九阴真经心法').ok).toBe(true)
    expect(equip('player_01', '九阴真经心法').reason).toContain('已经装配')
    expect(listEquipped('player_01')).toEqual(['九阴真经心法'])
  })
})

describe('击败经验与首杀账本', () => {
  beforeEach(() => {
    entitySystem.register('character', 'goblin_1', { id: 'goblin_1', template: 'goblin', base: { hp_max: 500 } })
    entitySystem.register('character', 'goblin_2', { id: 'goblin_2', template: 'goblin', base: { hp_max: 500 } })
  })

  it('首杀 ×3，第二次同种敌人只给基础经验', () => {
    expect(settleKillExp({ outcome: 'win', participants: ['player_01'], enemies: ['goblin_1'] })).toBe(150)
    expect(readRawAttr(player(), '经验')).toBe(150)
    expect(settleKillExp({ outcome: 'win', participants: ['player_01'], enemies: ['goblin_2'] })).toBe(50)
    expect(readRawAttr(player(), '经验')).toBe(200)
    expect(player().kill_ledger).toMatchObject({ goblin: 2 })
  })

  it('玩家不在参与者 / 未获胜 → 不结算', () => {
    expect(settleKillExp({ outcome: 'win', participants: ['npc_01'], enemies: ['goblin_1'] })).toBe(0)
    expect(settleKillExp({ outcome: 'lose', participants: ['player_01'], enemies: ['goblin_1'] })).toBe(0)
    expect(readRawAttr(player(), '经验')).toBe(0)
  })

  it('血量上限非正数（数据畸形）→ warning + 跳过该敌人，不阻断；未绑定 hp_max 的 mod → 静默跳过', () => {
    entitySystem.register('character', 'ghost', { id: 'ghost', base: { hp_max: 0 } })
    expect(settleKillExp({ outcome: 'win', participants: ['player_01'], enemies: ['ghost', 'goblin_1'] })).toBe(150)
    expect(errorReporter.getErrors().some(e => e.message.includes('跳过敌人'))).toBe(true)
  })

  it('账本键：优先 template（"这类敌人"），无 template 退回实体 id', () => {
    expect(killLedgerKey({ id: 'a', template: 'goblin' })).toBe('goblin')
    expect(killLedgerKey({ id: 'boss_x' })).toBe('boss_x')
  })
})

describe('技能经验（用技能涨经验）与补升', () => {
  beforeEach(() => {
    applyAttrDelta(player(), '悟性', 5)
    give('九阴人皮')
    setExp(100000)
    practice('player_01', '九阴真经', 3)                         // 得九阴白骨爪（1 级，上限 3）
  })

  it('玩家用技能 → 加 悟性×10 经验（可能直接升级）；NPC 用技能 → 不计', async () => {
    entitySystem.register('character', 'npc_01', {
      id: 'npc_01', name: '路人', base: { 悟性: 99 }, abilities: { 九阴白骨爪: { level: 1, xp: 0 } }, inventory: [],
    })
    // 九阴白骨爪已 1 级，升 2 级需 100×1.15 = 115；一次使用给 悟性 15×10 = 150 → 升到 2 级，余 35
    await onSkillUsed({ actor: 'player_01', skillId: '九阴白骨爪' })
    expect(player().abilities['九阴白骨爪']).toMatchObject({ level: 2, xp: 35 })

    await onSkillUsed({ actor: 'npc_01', skillId: '九阴白骨爪' })
    expect((entitySystem.get('character', 'npc_01') as any).abilities['九阴白骨爪'].xp).toBe(0)
  })

  it('在队/跟随者计入（follow API 谓词）', async () => {
    apiSystem.register('follow', { isFollowing: ((id: string) => id === 'ally_01') as any })
    entitySystem.register('character', 'ally_01', {
      id: 'ally_01', name: '队友', base: { 悟性: 10 }, abilities: { 九阴白骨爪: { level: 1, xp: 0 } }, inventory: [],
    })
    await onSkillUsed({ actor: 'ally_01', skillId: '九阴白骨爪' })
    expect((entitySystem.get('character', 'ally_01') as any).abilities['九阴白骨爪'].xp).toBe(100)
  })

  it('未拥有该技能 → 不计（获得后才开始积累）', async () => {
    await onSkillUsed({ actor: 'player_01', skillId: '基础掌法' })
    expect(player().abilities['基础掌法']).toBeUndefined()
  })

  it('层数上限被秘籍钳制；秘籍升层后补升立刻生效', async () => {
    // 九阴白骨爪 上限 = 九阴真经进度 = 3；技能经验曲线 = 品级 xp_base_skill（绝世 100）
    for (let i = 0; i < 10; i++) await onSkillUsed({ actor: 'player_01', skillId: '九阴白骨爪' })
    expect(player().abilities['九阴白骨爪'].level).toBe(3)        // 到钳制层即止
    // 满值（不无界累加）：钳在"升 4 级所需" = 100×1.15³ = 152.0875
    expect(player().abilities['九阴白骨爪'].xp).toBeCloseTo(152.0875, 6)

    // 换成完整本 → 可继续练 → practice 会触发 recheck（补升）
    player().inventory = []
    give('九阴真经·完整')
    practice('player_01', '九阴真经', 1)
    expect(player().manuals['九阴真经'].level).toBe(4)
    expect(player().abilities['九阴白骨爪'].level).toBe(4)        // 补升
  })

  it('无依赖秘籍的技能不受钳制（提供者返回 null）', () => {
    const mod = modLoader.getMod() as any
    mod.abilities['野球拳'] = { name: '野球拳', type: 'active', max_level: 5 }
    expect(levelCapProvider('player_01', '野球拳', mod.abilities['野球拳'])).toBeNull()
  })

  it('技能蓝耗提供者：技能没写 cost → 按秘籍品级表给（三流 170）', () => {
    // 「基础掌法」由三流的「初级拳法」授予 → 品级表 cost = 170
    expect(skillCostProvider('player_01', '基础掌法', {} as any)).toBe(170)
    expect(skillCostProvider('player_01', '九阴白骨爪', {} as any)).toBeNull()   // 绝世品级没写 cost
    expect(skillCostProvider('player_01', '不存在的技能', {} as any)).toBeNull()
  })
})

describe('集成：残本链全流程（人皮 → 上卷 → 合成完整 → 总纲）', () => {
  it('换载体只提升可练上限：进度、成长、技能全程不动，零继承代码', () => {
    applyAttrDelta(player(), '悟性', 5)
    setExp(100000000)

    // ① 只有人皮（cap 5）：练到顶就停
    give('九阴人皮')
    practice('player_01', '九阴真经', 0)
    expect(player().manuals['九阴真经'].level).toBe(5)
    const coefAt5 = readRawAttr(player(), '轻灵')
    expect(player().abilities['九阴真经心法'].level).toBe(5)
    expect(player().abilities['九阴白骨爪'].level).toBe(1)     // 第 3 层授予
    expect(manualState('player_01', '九阴真经')!.reasons.join()).toContain('只能练到第 5 层')

    // ② 得上卷（cap 7）：同一份进度，直接可继续练（没有"继承层数"这一步）
    give('九阴真经上卷')
    expect(player().manuals['九阴真经'].level).toBe(5)          // 进度没动
    practice('player_01', '九阴真经', 0)
    expect(player().manuals['九阴真经'].level).toBe(7)
    expect(readRawAttr(player(), '轻灵')).toBeGreaterThan(coefAt5)

    // ③ 合成：消耗两本残本、给完整本（任务侧就是物品增删）——进度/技能全程不动
    player().inventory = player().inventory.filter((i: any) => i.itemId !== '九阴人皮' && i.itemId !== '九阴真经上卷')
    give('九阴真经·完整')
    expect(player().manuals['九阴真经'].level).toBe(7)
    expect(player().abilities['九阴真经心法'].level).toBe(7)
    practice('player_01', '九阴真经', 0)
    expect(player().manuals['九阴真经'].level).toBe(11)         // 完整本 → max_layer
    expect(player().talents['九阴天赋']).toBe(1)                // 第 10 层奖励

    // ④ 最坏情况：完整本也卖了 → 不能再练，但一切已得的都不回退
    player().inventory = []
    expect(manualState('player_01', '九阴真经')!.cap).toBe(0)
    expect(practice('player_01', '九阴真经', 1).ok).toBe(false)
    expect(player().manuals['九阴真经'].level).toBe(11)
    expect(player().abilities['九阴真经心法'].level).toBe(11)

    // ⑤ 总纲（剧情物品，被任务消耗掉）→ 永久解锁：用 effect 记录，不靠持有
    const capFx = effectTypeRegistry.getHandler('unlock_manual_cap')!
    void capFx({ manual: '九阴真经', cap: 11 }, { _targetIds: ['player_01'] })
    expect(manualState('player_01', '九阴真经')!.cap).toBe(11)
  })
})

describe('API / effect / 条件路径', () => {
  it('manual 与 internal API 可用', () => {
    give('初级拳法秘籍')
    setExp(1000)
    const mod = manualState('player_01', '初级拳法')
    expect(mod).toMatchObject({ level: 0, cap: 10, nextCost: 250, canPractice: true })
    expect(apiSystem.callSync('manual', 'listManuals', 'player_01').length).toBe(1)
    expect(apiSystem.callSync('manual', 'practice', 'player_01', '初级拳法', 1)).toMatchObject({ ok: true, gained: 1 })
    expect(apiSystem.callSync('manual', 'getState', 'player_01', '初级拳法').level).toBe(1)
  })

  it('effect：practice_manual / learn_manual_layer / unlock_manual_cap / equip_internal', async () => {
    give('九阴人皮')
    applyAttrDelta(player(), '悟性', 5)
    setExp(100000)
    const practiceFx = effectTypeRegistry.getHandler('practice_manual')!
    await practiceFx({ manual: '九阴真经', layers: 2 }, { _targetIds: ['player_01'] })
    expect(player().manuals['九阴真经'].level).toBe(2)

    const learnFx = effectTypeRegistry.getHandler('learn_manual_layer')!
    await learnFx({ manual: '九阴真经', layer: 4 }, { _targetIds: ['player_01'] })
    expect(player().manuals['九阴真经'].level).toBe(4)

    const capFx = effectTypeRegistry.getHandler('unlock_manual_cap')!
    await capFx({ manual: '九阴真经', cap: 9 }, { _targetIds: ['player_01'] })
    expect(manualState('player_01', '九阴真经')!.cap).toBe(9)

    const equipFx = effectTypeRegistry.getHandler('equip_internal')!
    await equipFx({ ability: '九阴真经心法' }, { _targetIds: ['player_01'] })
    expect(listEquipped('player_01')).toEqual(['九阴真经心法'])
    const unequipFx = effectTypeRegistry.getHandler('unequip_internal')!
    await unequipFx({ ability: '九阴真经心法' }, { _targetIds: ['player_01'] })
    expect(listEquipped('player_01')).toEqual([])
  })

  it('条件路径可校验：manuals.{id}.level / equipped.{能力}', () => {
    expect(conditionRegistry.validateExpression('character.player_01.manuals.九阴真经.level >= 3').ok).toBe(true)
    expect(conditionRegistry.validateExpression('player.manuals.九阴真经.level >= 3').ok).toBe(true)
    expect(conditionRegistry.validateExpression('character.player_01.equipped.九阴真经心法 == true').ok).toBe(true)
    expect(conditionRegistry.validateField('character.x.manuals.不存在.level')).toBe(true)  // 结构路径，不校验 ID 存在性
  })

  it('修炼层数变化后发 manual:layer_gained 事件', () => {
    give('初级拳法秘籍')
    setExp(1000)
    const seen: any[] = []
    eventBus.on('manual:layer_gained', (p: any) => { seen.push(p) })
    practice('player_01', '初级拳法', 1)
    expect(seen).toEqual([{ character: 'player_01', manual: '初级拳法', layer: 1 }])
  })

  it('listManuals 合并"持有载体"与"已修炼"两类', () => {
    give('初级拳法秘籍')
    setExp(1000)
    practice('player_01', '初级拳法', 1)
    player().inventory = []                                      // 卖掉载体
    const list = listManuals('player_01')
    expect(list.map(m => m.manual)).toEqual(['初级拳法'])         // 已修炼的仍显示
    expect(list[0].cap).toBe(0)
  })
})
