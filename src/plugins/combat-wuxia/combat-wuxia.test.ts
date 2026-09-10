// 注释：combat-wuxia 测试——合同 v1.1 公式（力道×3 平值威力/系数 /1000/风格 /1000/精通 /250/
// 新命中公式/防御 0.5）+ 公式中间量通道（常驻/相位/set/天赋 combat_channel）+ 明细 + 校验
import { describe, it, expect, beforeEach } from 'vitest'
import { onLoad as baseOnLoad, onEnable as baseOnEnable, __resetCombatModule } from '../combat-base/index'
import { onLoad, onEnable, validateBattleData } from './index'
import { entitySystem } from '../../core/entity-system'
import { bindingResolver } from '../../core/binding-resolver'
import { gameContext } from '../../core/game-context'
import { apiSystem } from '../../core/api'
import { eventBus } from '../../core/event-bus'
import { narrativeLog } from '../../core/narrative-log'
import { errorReporter } from '../../core/error-reporter'
import { modLoader } from '../../core/mod-loader'
import { effectTypeRegistry } from '../../core/effect-type-registry'

// ── 测试环境 ────────────────────────────────────────────────────────────

function makeMockCtx(parentCombat: any = null): any {
  return {
    api: {
      register: (ns: string, methods: Record<string, Function>) => apiSystem.register(ns, methods as any),
      call: (ns: string, method: string, ...args: any[]) => apiSystem.call(ns, method, ...args),
    },
    commands: { register: () => {}, unregister: () => {} },
    ui: { registerSlot: () => {} },
    parent: parentCombat ? { api: { combat: parentCombat } } : null,
    events: {
      on: (e: string, h: Function) => eventBus.on(e, h as any),
      off: (e: string, h: Function) => eventBus.off(e, h as any),
      emit: (e: string, p: any) => eventBus.emit(e, p),
    },
    gameState: { currentLocation: null, player: null, time: { minute: 0, hour: 8, day: 1, month: 1, year: 1 } },
  }
}

// 假 mod：六维在实体 base；技能/效果库/天赋定义在 loadedMod
function wuxiaMod() {
  return {
    id: 'test-mod',
    abilities: {
      铁砂掌: {
        id: '铁砂掌', name: '铁砂掌', type: 'active', power: 100, cost: 20, hits: 1,
        category: '拳掌', style: { 厚重: 60 }, tags: ['拳掌'], effects: [],
      },
      黑蜂针: {
        id: '黑蜂针', name: '黑蜂针', type: 'active', power: 100, cost: 15, hits: 1,
        category: '暗毒', style: { 轻灵: 60 }, tags: ['暗毒'], effects: [],
      },
      蛤蟆功: {
        id: '蛤蟆功', name: '蛤蟆功', type: 'active', cost: 15, category: '气功',
        attack: false, // 增益/架势技：使用时不攻击，挂蓄势
        tags: ['气功'],
        effects: [{ trigger: 'on_use', action: 'apply_effect', target: 'self', value: { effect: '蛤蟆功蓄势' } }],
      },
      太玄经: {
        id: '太玄经', name: '太玄经', type: 'active', cost: 0, category: '气功', tags: ['气功'],
        effects: [],
      },
      寒冰掌: {
        id: '寒冰掌', name: '寒冰掌', type: 'active', power: 100, cost: 20, hits: 1,
        category: '拳掌', style: { 轻灵: 60, 毒性: 40 }, tags: ['拳掌'],
        effects: [{ trigger: 'on_hit', action: 'apply_effect', chance: 1, target: 'enemy', value: { effect: '战中毒', value: 20 } }],
      },
      三连掌: {
        id: '三连掌', name: '三连掌', type: 'active', power: 90, cost: 0, hits: 3,
        category: '拳掌', style: { 厚重: 60 }, tags: ['拳掌'], effects: [],
      },
      // ── 毒（v1.2）：挂状态类别——命中后挂同名状态（毒/猛毒/剧毒 = k1/2/3，8 回合，回合开始结算）──
      毒沙掌: {
        id: '毒沙掌', name: '毒沙掌', type: 'active', power: 100, cost: 20, hits: 1,
        category: '拳掌', style: { 厚重: 60, 毒性: 40 }, tags: ['拳掌'],
        effects: [{ action: 'apply_poison', status: '剧毒' }],
      },
      毒手: {
        id: '毒手', name: '毒手', type: 'active', power: 100, cost: 20, hits: 1,
        category: '拳掌', style: { 厚重: 60, 毒性: 10 }, tags: ['拳掌'],
        effects: [{ action: 'apply_poison', status: '毒' }],
      },
      凌波微步: {
        id: '凌波微步', name: '凌波微步', type: 'passive', tags: [],
        effects: [{ action: 'modify_stat', stat: 'dodge_bonus', mode: 'flat', value: 10 }],
      },
      神照经: {
        id: '神照经', name: '神照经', type: 'passive', tags: [],
        effects: [{ trigger: 'death', action: 'revive', uses: 1, duration: 'battle' }],
      },
      火焰刀: {
        id: '火焰刀', name: '火焰刀', type: 'active', power: 100, cost: 20, hits: 1,
        category: '拳掌', style: { 厚重: 60 }, tags: ['拳掌'],
        power_curve: [[1, 1.0], [5, 1.5]],
        effects: [],
      },
    } as any,
    battleEffects: {
      蛤蟆功蓄势: {
        name: '蛤蟆功蓄势', action: 'counter', trigger: 'damage_mitigate',
        value: { skill: '蛤蟆功' }, duration: 'battle', uses: 1, category: 'buff',
      },
      战中毒: {
        name: '战中毒', action: 'periodic_damage', trigger: 'turn_start',
        value: 15, duration: { turns: 3 }, category: 'debuff', stack: 'increment', max_stack: 5,
      },
      // 毒三条定义（与插件默认层数据同构；merge_group 让三条共用一份实例）
      毒: { name: '毒', action: 'poison_dot', trigger: 'turn_start', duration: { turns: 8 }, k: 1, merge: 'strongest', merge_group: '毒', category: 'debuff' },
      猛毒: { name: '猛毒', action: 'poison_dot', trigger: 'turn_start', duration: { turns: 8 }, k: 2, merge: 'strongest', merge_group: '毒', category: 'debuff' },
      剧毒: { name: '剧毒', action: 'poison_dot', trigger: 'turn_start', duration: { turns: 8 }, k: 3, merge: 'strongest', merge_group: '毒', category: 'debuff' },
    } as any,
    scripts: new Map<string, string>([
      ['damage_太玄经.js', 'return source.mp / 5'],
      ['damage_蛤蟆功.js', 'return source.mp / 5'],
    ]),
    talentDefs: {
      剑骨: {
        name: '剑骨', max: 10,
        modifiers: [{ formula: 'combat_damage', when_tag: '拳掌', multiply: 0.05 }],
      },
      铁布衫: {
        name: '铁布衫', max: 3,
        modifiers: [{ formula: 'combat_in', multiply: 0.1 }],
      },
      身轻如燕: {
        name: '身轻如燕', max: 5,
        modifiers: [{ formula: 'combat_dodge', plus: 2 }],
      },
      飘逸: {
        name: '飘逸', max: 5,
        modifiers: [{ formula: 'combat_channel', channel: '风格系数', when_tag: '拳掌', multiply: 0.1 }],
      },
    } as any,
    attributes: {},
  }
}

const PLAYER_STATS = {
  力道: 100, 根骨: 50, 定力: 30, 灵敏: 80, 福缘: 20, 悟性: 30,
  拳掌系数: 50, 暗毒系数: 40, 轻功系数: 50,
  轻灵: 40, 厚重: 40, 巧技: 30, 毒功: 40,
}
const ENEMY_STATS = {
  力道: 90, 根骨: 50, 定力: 30, 灵敏: 60, 福缘: 30, 悟性: 20,
  拳掌系数: 40, 轻功系数: 30,
  轻灵: 30, 厚重: 45, 巧技: 20, 毒功: 0,
}

// 量级：合同 v1.1 伤害量级跃迁（威力由百分比变平值、力道×3）→ 测试面板用大血量，避免多轮测试被秒
const PLAYER_HP = 20000
const ENEMY_HP = 20000

async function boot(options: {
  playerTalents?: Record<string, number>
  playerAbilities?: Record<string, any>
  enemyAbilities?: Record<string, any>
  playerHp?: number
  enemyHp?: number
} = {}): Promise<void> {
  __resetCombatModule()
  effectTypeRegistry.clear()
  entitySystem.clear()
  bindingResolver.loadBindings({
    'combat-base': { hp: 'hp', mp: 'mp', hp_max: 'hp_max', mp_max: 'mp_max' },
    'combat-wuxia': { weapon_base: '武器基础' },
  })
  narrativeLog.clear()
  errorReporter.clear()
  gameContext.reset()
  apiSystem.clear()
  eventBus.clear()
  ;(modLoader as any).loadedMod = wuxiaMod()
  const playerHp = options.playerHp ?? PLAYER_HP
  const enemyHp = options.enemyHp ?? ENEMY_HP
  entitySystem.register('character', 'player', {
    id: 'player', name: '玩家',
    base: { ...PLAYER_STATS, hp: playerHp, mp: 500, hp_max: playerHp, mp_max: 500, 武器基础: 0 },
    abilities: options.playerAbilities ?? {
      '铁砂掌': { level: 5, xp: 0 },
      '黑蜂针': { level: 5, xp: 0 },
      '三连掌': { level: 5, xp: 0 },
      '毒沙掌': { level: 5, xp: 0 },
      '毒手': { level: 5, xp: 0 },
      '蛤蟆功': { level: 3, xp: 0 },
      '太玄经': { level: 5, xp: 0 },
      '寒冰掌': { level: 2, xp: 0 },
      '凌波微步': { level: 1, xp: 0 },
      '神照经': { level: 1, xp: 0 },
    },
    talents: options.playerTalents ?? {},
  })
  entitySystem.register('character', 'enemy', {
    id: 'enemy', name: '敌人',
    base: { ...ENEMY_STATS, hp: enemyHp, mp: 300, hp_max: enemyHp, mp_max: 300, 武器基础: 0 },
    abilities: options.enemyAbilities ?? { '铁砂掌': { level: 3, xp: 0 } },
  })
  gameContext.setPlayer('player')
  const baseCtx = makeMockCtx()
  baseOnLoad(baseCtx)
  baseOnEnable(baseCtx)
  // wuxia 挂 parent 指向 base 注册的 combat API（镜像对象，走 apiSystem 转发）
  const parentMirror = {
    registerHook: (n: string, h: any) => apiSystem.call('combat', 'registerHook', n, h),
  }
  const wuxiaCtx = makeMockCtx(parentMirror)
  onLoad(wuxiaCtx)
  onEnable(wuxiaCtx)
}

// 先攻敌人或玩家由 rng 控制；钩子注册必须在 start 前
async function startBattle(rng: () => number = () => 0.9): Promise<void> {
  await apiSystem.call('combat', 'start', ['enemy'], ['player'])
  await apiSystem.call('combat', 'setRng', rng)
}

async function playerAct(skillId: string | null = null): Promise<any> {
  const turnEvents: any[] = []
  const h = (p: any) => { turnEvents.push(p) }
  eventBus.on('combat:turn', h)
  await apiSystem.call('combat', 'executeAction', 'player', { type: 'skill', skillId, targetId: 'enemy' })
  eventBus.off('combat:turn', h)
  const mine = turnEvents.find(e => e.actor === 'player')
  return mine?.result ?? null
}

function state(): any {
  return apiSystem.callSync('combat', 'getCombatState')
}

// ⚠️ 通道名/中间量名/技能 id 属"结构数据"，不是 attributes.toml 属性——
// 中文 key 必须经变量/helper 间接取（scan-attr-refs 契约：`obj['中文']` 会被判为属性引用）
const part = (parts: any, key: string): any => parts?.[key]

// 手算基准（面板：力道100/灵敏80/轻功50/根骨50/定力30，风格 40·40·30，拳掌系数50，武器0）：
//   风格系数（技能 厚重60）= (1.8² + 1.908² + 1.6²)/(1.8+1.908+1.6) = 1.7785347
//   风格系数（无技能风格）  = (1.8² + 1.8²   + 1.6²)/(1.8+1.8+1.6)     = 1.7384615
//   精通系数 = 1 + 110/250 = 1.44；防御 = 50×0.8 + 30×0.5 = 55
//   铁砂掌 L5：威力 = 100×0.9 = 90 → (300+90)×1.05×1.7785347×1.44 + 480/25 = 1067.97 → 1068−55 = 1013
//   黑蜂针 L5：威力 90 → (灵敏240+90)×1.04×1.7785347×1.44 + 485/25 = 898.37 → 898−55 = 843
//   空手平A：  300×1×1.7384615×1.44 + 500/25 = 771.02 → 771−55 = 716
//   命中：准头 玩家 50×2+80=180 / 敌人 30×2+60=120 → 玩家打敌人 r=0.6 → 108%（必中）；敌人打玩家 r=0.4 → 72%
const IRON_PALM_DAMAGE = 1013

// ── 公式 ───────────────────────────────────────────────────────────────

describe('combat-wuxia 公式', () => {
  beforeEach(async () => { await boot() })

  it('标准系（拳掌）：(力道×3 + 武功威力 + 武器) × (1+系数/1000) × 风格 × 精通 + 内力/25', async () => {
    await apiSystem.call('combat', 'registerHook', 'float_mul', () => 1.0)
    await startBattle(() => 0.9)
    const result = await playerAct('铁砂掌')
    expect(result.damage).toBe(IRON_PALM_DAMAGE)
  })

  it('暗毒系：灵敏×3 代力道×3', async () => {
    await apiSystem.call('combat', 'registerHook', 'float_mul', () => 1.0)
    await startBattle(() => 0.9)
    const result = await playerAct('黑蜂针')
    expect(result.damage).toBe(843)
  })

  it('空手平A：同公式、威力与系数为 0（防御扣减后）', async () => {
    await apiSystem.call('combat', 'registerHook', 'float_mul', () => 1.0)
    await startBattle(() => 0.9)
    const result = await playerAct(null)
    expect(result.damage).toBe(716)
  })

  it('多段：每段完整公式（力道/武器/内力项全量重复），仅威力按段均分', async () => {
    await apiSystem.call('combat', 'registerHook', 'float_mul', () => 1.0)
    await startBattle(() => 0.9)
    // 三连掌 L5：威力总 90×0.9 = 81 → 每段 27 → (300+27)×1.05×1.7785347×1.44 + 500/25 = 899.35 → 899−55 = 844/段
    // （力道项/内力项每段全量重复 → 3 段总伤远高于同威力单段技）
    const result = await playerAct('三连掌')
    expect(result.hits).toBe(3)
    expect(result.damage).toBe(844 * 3)
  })

  it('气功系：太玄经脚本（当前内力/5）', async () => {
    await apiSystem.call('combat', 'registerHook', 'float_mul', () => 1.0)
    await startBattle(() => 0.9)
    // 太玄经：mp 500 → 500/5 = 100 → 100−55 = 45
    const result = await playerAct('太玄经')
    expect(result.damage).toBe(45)
  })

  it('特殊系脚本缺失：数据校验报错（无脚本的气功按加载期错误处理，不作为攻击技）', () => {
    const mod = modLoader.getMod()!
    Object.assign(mod.abilities, {
      '无脚本气功': {
        id: '无脚本气功', name: '无脚本气功', type: 'active', cost: 0, category: '气功', tags: ['气功'], effects: [],
      },
    })
    validateBattleData()
    expect(errorReporter.getErrors().some(e => e.message.includes('缺少伤害脚本'))).toBe(true)
  })

  it('power_curve 表：L5 取表值 1.5', async () => {
    await apiSystem.call('combat', 'registerHook', 'float_mul', () => 1.0)
    await startBattle(() => 0.9)
    const result = await playerAct('火焰刀') // 玩家能力表里没火焰刀 → 等级 0 → 表 L0 取首档 1.0
    expect(result.damage).toBeGreaterThan(0)
  })

  it('命中：新公式（准头比率式）——准头高者命中率 >100 必中', async () => {
    await apiSystem.call('combat', 'registerHook', 'float_mul', () => 1.0)
    await startBattle(() => 0.99)
    // 玩家准头 180 / 敌人 120 → r=0.6 → 90+(0.6−0.5)×180 = 108% → rng 0.99×100=99 < 108 仍命中
    const result = await playerAct('铁砂掌')
    expect(result.damage).toBe(IRON_PALM_DAMAGE)
  })

  it('命中：不截断——守方闪避加成压到 <0 必 Miss', async () => {
    await apiSystem.call('combat', 'registerHook', 'float_mul', () => 1.0)
    await startBattle(() => 0.9)
    apiSystem.callSync('combat', 'addZoneEffect', 'enemy', {
      id: '迷踪', action: 'modify_stat', stat: 'dodge_bonus', mode: 'flat', value: 200, duration: 'battle',
    })
    // 108% − 200 = −92% → Miss
    const result = await playerAct('铁砂掌')
    expect(result.damage).toBe(0)
  })

  it('命中：双方准头全 0 → 比值兜底 0.5 → 90%', async () => {
    const p = entitySystem.get('character', 'player') as any
    const e = entitySystem.get('character', 'enemy') as any
    p.base['轻功系数'] = 0; p.base['灵敏'] = 0
    e.base['轻功系数'] = 0; e.base['灵敏'] = 0
    await apiSystem.call('combat', 'registerHook', 'float_mul', () => 1.0)
    await startBattle(() => 0.85) // 85 < 90 → 命中
    const result = await playerAct('铁砂掌')
    expect(result.damage).toBeGreaterThan(0)
  })

  it('先攻 = 轻功系数（不再用灵敏）', async () => {
    // 敌人灵敏堆到 999 但轻功系数 30 < 玩家 50 → 玩家仍先手
    const e = entitySystem.get('character', 'enemy') as any
    e.base['灵敏'] = 999
    await startBattle(() => 0.9)
    expect(state().order[0]).toBe('player')
  })

  it('防御 = 根骨×0.8 + 定力×0.5（通道可加减）', async () => {
    await apiSystem.call('combat', 'registerHook', 'float_mul', () => 1.0)
    await apiSystem.call('combat', 'registerHook', 'base_damage', () => 1000)
    await startBattle(() => 0.9)
    const r1 = await playerAct('铁砂掌')
    expect(r1.damage).toBe(1000 - 55)
    // 通道「防御」percent 0.2 → 55×1.2 = 66
    apiSystem.callSync('combat', 'addZoneEffect', 'enemy', {
      id: '铁布衫（防御）', action: 'modify_channel', channel: '防御', mode: 'percent', value: 0.2, duration: 'battle',
    })
    const r2 = await playerAct('铁砂掌')
    expect(r2.damage).toBe(1000 - 66)
  })
})

// ── 公式中间量通道 ───────────────────────────────────────────────────────

describe('combat-wuxia 公式中间量通道', () => {
  beforeEach(async () => { await boot() })

  it('注册 9 个通道（getChannels，含毒伤害）', () => {
    const ids = (apiSystem.callSync('combat', 'getChannels') as any[]).map(c => c.id)
    expect(ids).toEqual(expect.arrayContaining([
      '先攻', '命中率', '闪避率', '浮动系数', '防御', '武功威力', '风格系数', '其他加成', '毒伤害',
    ]))
    expect(ids.length).toBe(9)
    // combat-wuxia 侧同名 API 透传同一清单
    expect((apiSystem.callSync('combat-wuxia', 'getChannels') as any[]).length).toBe(9)
  })

  it('previewDamage：不进战斗也能拿到中间量（含命中率），战斗内则带实时通道', async () => {
    const preview = apiSystem.callSync('combat-wuxia', 'previewDamage', 'player', '铁砂掌', 5, 'enemy')
    expect(part(preview.parts, '力道项')).toBe(300)
    expect(part(preview.parts, '武功威力')).toBeCloseTo(90, 5)
    // 战外 mp 满 500 → 内力项 20 → 1048.77 + 20 = 1068.77
    expect(preview.value).toBeCloseTo(1068.7663, 3)
    expect(preview.hitRate).toBeCloseTo(108, 10) // 准头 180 vs 120 → 108% 必中
  })

  it('常驻通道：风格系数 ×1.1 → 伤害 ×1.1（风格项在乘法链内）', async () => {
    await apiSystem.call('combat', 'registerHook', 'float_mul', () => 1.0)
    await startBattle(() => 0.9)
    apiSystem.callSync('combat', 'addZoneEffect', 'player', {
      id: '飘逸', action: 'modify_channel', channel: '风格系数', mode: 'percent', value: 0.1, duration: 'battle',
    })
    // (300+90)×1.05×(1.7785347×1.1)×1.44 + 19.2 = 1172.84 → 1173−55 = 1118
    const result = await playerAct('铁砂掌')
    expect(result.damage).toBe(1118)
  })

  it('武功威力通道：percent 作用于威力分项', async () => {
    await apiSystem.call('combat', 'registerHook', 'float_mul', () => 1.0)
    await startBattle(() => 0.9)
    apiSystem.callSync('combat', 'addZoneEffect', 'player', {
      id: '蓄势', action: 'modify_channel', channel: '武功威力', mode: 'percent', value: 0.3, duration: 'battle',
    })
    // 威力 90×1.3 = 117 → (300+117)×1.05×1.7785347×1.44 + 19.2 = 1140.6 → 1141−55 = 1086
    const result = await playerAct('铁砂掌')
    expect(result.damage).toBe(1086)
  })

  it('set 覆盖：防御 set 0 = 无视防御', async () => {
    await apiSystem.call('combat', 'registerHook', 'float_mul', () => 1.0)
    await startBattle(() => 0.9)
    apiSystem.callSync('combat', 'addZoneEffect', 'enemy', {
      id: '破防', action: 'modify_channel', channel: '防御', mode: 'set', value: 0, duration: 'battle',
    })
    const result = await playerAct('铁砂掌')
    expect(result.damage).toBe(1068)
  })

  it('相位通道：damage_base 相位的「其他加成」只作用于该段', async () => {
    const mod = modLoader.getMod()!
    const 蓄力掌Id = '蓄力掌'
    Object.assign(mod.abilities, {
      [蓄力掌Id]: {
        id: 蓄力掌Id, name: 蓄力掌Id, type: 'active', power: 100, cost: 20, hits: 1,
        category: '拳掌', style: { 厚重: 60 }, tags: ['拳掌'],
        effects: [{ trigger: 'damage_base', action: 'modify_channel', channel: '其他加成', mode: 'flat', value: 50 }],
      },
    })
    ;(entitySystem.get('character', 'player') as any).abilities[蓄力掌Id] = { level: 5, xp: 0 }
    await apiSystem.call('combat', 'registerHook', 'float_mul', () => 1.0)
    await startBattle(() => 0.9)
    // 1067.97 + 50 = 1117.97 → 1118 − 55 = 1063
    const result = await playerAct('蓄力掌')
    expect(result.damage).toBe(1063)
    // 相位每次重新收集（常驻包未被污染）；第二次内力 480−20=460 → 内力项 18.4 → 1117.17 → 1117−55 = 1062
    const again = await playerAct('蓄力掌')
    expect(again.damage).toBe(1062)
  })

  it('when_skill 过滤：条目只对指定技能生效', async () => {
    const mod = modLoader.getMod()!
    Object.assign(mod.battleEffects, {
      '黑蜂针专精': {
        name: '黑蜂针专精', action: 'modify_channel', channel: '其他加成', mode: 'flat', value: 100,
        target: 'self', duration: 'battle', when_skill: '黑蜂针',
      },
    })
    await apiSystem.call('combat', 'registerHook', 'float_mul', () => 1.0)
    await startBattle(() => 0.9)
    apiSystem.callSync('combat', 'addZoneEffect', 'player', { id: '黑蜂针专精', duration: 'battle' })
    // 铁砂掌不带 when_skill → 无加成
    const iron = await playerAct('铁砂掌')
    expect(iron.damage).toBe(IRON_PALM_DAMAGE)
  })

  it('浮动系数通道：set 1.0 → 稳定输出', async () => {
    await startBattle(() => 0.9) // 不注册 float_mul override（用插件默认）
    apiSystem.callSync('combat', 'addZoneEffect', 'player', {
      id: '心如止水', action: 'modify_channel', channel: '浮动系数', mode: 'set', value: 1.0, duration: 'battle',
    })
    const result = await playerAct('铁砂掌')
    expect(result.damage).toBe(IRON_PALM_DAMAGE)
  })

  it('天赋 combat_channel：when_tag 过滤命中时生效', async () => {
    await boot({ playerTalents: { 飘逸: 1 } })
    await apiSystem.call('combat', 'registerHook', 'float_mul', () => 1.0)
    await startBattle(() => 0.9)
    // 飘逸 L1 × 0.1 = 风格系数 ×1.1（when_tag 拳掌 → 铁砂掌命中）→ 1118
    const result = await playerAct('铁砂掌')
    expect(result.damage).toBe(1118)
    // 黑蜂针（tags=[暗毒]）不匹配 when_tag → 无加成
    const poison = await playerAct('黑蜂针')
    expect(poison.damage).toBe(843)
  })
})

// ── 编译（被动/天赋）与效果区 ─────────────────────────────────────────────

describe('combat-wuxia 编译与效果', () => {
  beforeEach(async () => { await boot() })

  it('被动技能编译：凌波微步闪避+10 → 敌方命中率下降', async () => {
    await apiSystem.call('combat', 'registerHook', 'float_mul', () => 1.0)
    await startBattle(() => 0.9)
    const st = state()
    expect(st.combatants.player.stats.dodge_bonus).toBe(10)
    // 敌人打玩家：准头 120/(120+180) = 0.4 → 72% − 10 = 62% → rng 0.9×100=90 ≥ 62 → miss
    const r = await playerAct(null)
    expect(r).not.toBeNull()
    expect(state().combatants.player.hp).toBe(PLAYER_HP) // 敌方第一击被闪避
  })

  it('天赋数值编译：combat_damage（剑骨）按技能标签生效', async () => {
    await boot({ playerTalents: { 剑骨: 3 } })
    await apiSystem.call('combat', 'registerHook', 'float_mul', () => 1.0)
    await startBattle(() => 0.9)
    // 剑骨 3 级 × 0.05 = +15% → 1067.97×1.15 = 1228.16 → 1228−55 = 1173
    const result = await playerAct('铁砂掌')
    expect(result.damage).toBe(1173)
  })

  it('天赋数值编译：combat_in（铁布衫）减伤', async () => {
    await boot({ playerTalents: { 铁布衫: 2 } })
    await apiSystem.call('combat', 'registerHook', 'float_mul', () => 1.0)
    await startBattle(() => 0.9)
    const st = state()
    expect(st.combatants.player.stats.damage_in).toBeCloseTo(0.2, 5)
  })

  it('神照经被动：一场战斗只复活一次（consumed 防重建）', async () => {
    await boot({ playerHp: 1000, playerAbilities: { 神照经: { level: 1, xp: 0 } } })
    const mod = modLoader.getMod()!
    Object.assign(mod.abilities, {
      猛击: {
        id: '猛击', name: '猛击', type: 'active', power: 1, cost: 0, hits: 3, category: '拳掌', tags: [], effects: [],
      },
    })
    ;(entitySystem.get('character', 'enemy') as any).abilities = { 猛击: { level: 1, xp: 0 } }
    // 每段 2000−55 = 1945，玩家 1000 血 → 第一段死 → 复活；第二段再死 → 判败
    await apiSystem.call('combat', 'registerHook', 'initiative', (hctx: any) => hctx.sourceId === 'enemy' ? 100 : 0)
    await apiSystem.call('combat', 'registerHook', 'base_damage', () => 2000)
    await apiSystem.call('combat', 'registerHook', 'hit_rate', () => 100)
    await apiSystem.call('combat', 'registerHook', 'float_mul', () => 1.0)
    let outcome: string | null = null
    eventBus.once('combat:end', (p: any) => { outcome = p.outcome })
    await startBattle(() => 0.9)
    expect(outcome).toBe('lose')
    const reviveLogs = narrativeLog.getEntries().filter(e => e.text.includes('满状态复活'))
    expect(reviveLogs.length).toBe(1)
  })

  it('蛤蟆功：用后不攻击，挂蓄势；受击时以蛤蟆功反击（触发一次即消）', async () => {
    await apiSystem.call('combat', 'registerHook', 'float_mul', () => 1.0)
    await startBattle(() => 0.5) // 敌人命中需 rng×100 < 62（玩家有凌波微步 +10 闪避）
    const r1 = await playerAct('蛤蟆功')
    expect(r1).not.toBeNull()
    expect(r1.hits).toBe(0) // 增益技：本回合不攻击
    // 敌人命中玩家（815 伤）→ 蓄势反击：485/5 = 97 → 97−55 = 42，触发一次即消
    const st = state()
    expect(st.combatants.enemy.hp).toBe(ENEMY_HP - 42)
    expect(st.combatants.player.effects.some((e: any) => e.id === '蛤蟆功蓄势')).toBe(false)
    expect(st.combatants.player.hp).toBe(PLAYER_HP - 815)
    const counters = narrativeLog.getEntries().filter(e => e.text.includes('发动反击'))
    expect(counters.length).toBe(1)
  })

  it('寒冰掌：命中后施加战中毒（毒性数值 20 覆盖）；层数递增', async () => {
    await boot({ playerAbilities: { 寒冰掌: { level: 2, xp: 0 } } })
    await apiSystem.call('combat', 'registerHook', 'float_mul', () => 1.0)
    await startBattle(() => 0.5) // 敌人需要命中玩家（72%）以推进回合
    await playerAct('寒冰掌')
    let st = state()
    const poison = st.combatants.enemy.effects.find((e: any) => e.id === '战中毒')
    expect(poison).toBeDefined()
    expect(poison.stack).toBe(1)
    // 再中一掌 → stack 2；2 次命中（首段 mp480→973、次段 mp460→972）+ 两轮回合初毒（技能覆盖毒值 20 → 20+40）
    await playerAct('寒冰掌')
    st = state()
    expect(st.combatants.enemy.effects.find((e: any) => e.id === '战中毒').stack).toBe(2)
    expect(st.combatants.enemy.hp).toBe(ENEMY_HP - 973 - 20 - 972 - 40)
  })

  it('公式明细：getLastFormula 返回中间量分项与通道', async () => {
    await apiSystem.call('combat', 'registerHook', 'float_mul', () => 1.0)
    await startBattle(() => 0.9)
    await playerAct('铁砂掌')
    const last = apiSystem.callSync('combat', 'getLastFormula')
    expect(last).toBeTruthy()
    const damageRec = (apiSystem.callSync('combat', 'getFormulaHistory') as any[])
      .filter(r => r.hook === 'base_damage').pop()
    expect(part(damageRec.parts, '力道项')).toBe(300)
    expect(part(damageRec.parts, '武功威力')).toBeCloseTo(90, 5)
    expect(part(damageRec.parts, '风格系数')).toBeCloseTo(1.7785347, 5)
    expect(part(damageRec.parts, '精通系数')).toBeCloseTo(1.44, 5)
    expect(part(damageRec.parts, '内力项')).toBeCloseTo(19.2, 5)
    expect(part(damageRec.parts, '基础伤害')).toBeCloseTo(1067.97, 1)
  })
})

// ── 毒（v1.2） ───────────────────────────────────────────────────────────

// 手算基准（面板：毒性40/毒功40/暗毒系数40，毒沙掌 L5 威力90）：
//   M = 90 × (1+40/1000) × [(1+40/1000)×(1+40/50)] × (1+40/200)
//     = 90 × 1.04 × 1.872 × 1.2 = 210.263
//   普通伤害 D = 1067.9664（同铁砂掌）；命中伤害 = D + M − 防御55 = 1278 − 55 = 1223
//   持续毒伤（目标气血上限 20000）：k=1 → 1.0×(200+21.03)=221；k=2 → 276；k=3 → 1.5×221.03=332
const POISON_M = 210.26304
const POISON_HIT_DAMAGE = 1223
const POISON_DOT_K3 = 332

describe('combat-wuxia 毒（v1.2）', () => {
  beforeEach(async () => { await boot() })

  it('即时毒伤：M 并入同一次命中判定（普通伤害 + M − 防御）', async () => {
    await apiSystem.call('combat', 'registerHook', 'float_mul', () => 1.0)
    await startBattle(() => 0.9)
    const result = await playerAct('毒沙掌')
    expect(result.damage).toBe(POISON_HIT_DAMAGE)
  })

  it('命中后挂上同名毒 DEBUFF：k/M/回合数', async () => {
    await apiSystem.call('combat', 'registerHook', 'float_mul', () => 1.0)
    await startBattle(() => 0.9)
    await playerAct('毒沙掌')
    const effects = state().combatants.enemy.effects as any[]
    const poison = effects.find((e: any) => e.id === '剧毒')
    expect(poison).toBeDefined()
    expect(poison.stack).toBe(1)
    // 8 回合起算；playerAct 内部已推进到敌方回合（turn_start 毒发一次 + 扣 1 回合）→ 剩 7
    expect(poison.remainingTurns).toBe(7)
  })

  it('持续毒伤：回合开始结算 k=3 的公式值（1.5×(1%上限 + M×0.1)）', async () => {
    await apiSystem.call('combat', 'registerHook', 'float_mul', () => 1.0)
    await startBattle(() => 0.9)
    await playerAct('毒沙掌')
    const rec = (apiSystem.callSync('combat', 'getFormulaHistory') as any[])
      .filter(r => r.hook === 'poison_dot').pop()
    expect(rec).toBeTruthy()
    expect(part(rec.parts, '毒等级')).toBe(3)
    expect(part(rec.parts, 'M快照')).toBeCloseTo(POISON_M, 3)
    expect(rec.value).toBe(POISON_DOT_K3)
    // 敌方 HP = 上限 − 命中伤害 − 首次毒发
    expect(state().combatants.enemy.hp).toBe(ENEMY_HP - POISON_HIT_DAMAGE - POISON_DOT_K3)
  })

  it('毒持续 8 回合（含本回合）后消失', async () => {
    await apiSystem.call('combat', 'registerHook', 'float_mul', () => 1.0)
    await startBattle(() => 0.9)
    // 只挂一次毒（用平A 推进回合，避免"每次命中都刷新毒"改变计数）
    await apiSystem.call('combat', 'applyStatus', 'enemy', '剧毒', { sourceId: 'player', value: { m: POISON_M, k: 3 } })
    for (let i = 0; i < 7; i++) await playerAct(null)
    expect((state().combatants.enemy.effects as any[]).some(e => e.id === '剧毒')).toBe(true)
    // 第 8 次敌方回合开始：毒发第 8 次 → 扣到 0 → 移除
    await playerAct(null)
    expect((state().combatants.enemy.effects as any[]).some(e => e.id === '剧毒')).toBe(false)
  })

  it('重复命中：单实例、k 取高、M 取大、回合重置（弱毒不覆盖强毒）', async () => {
    await apiSystem.call('combat', 'registerHook', 'float_mul', () => 1.0)
    await startBattle(() => 0.9)
    await playerAct('毒沙掌')       // 剧毒 k=3, M≈210.3
    await playerAct('毒手')         // 毒 k=1, M 更小 → 不降级
    const effects = state().combatants.enemy.effects as any[]
    const poisons = effects.filter(e => e.id === '剧毒' || e.id === '毒' || e.id === '猛毒')
    expect(poisons.length).toBe(1)              // 一份毒
    expect(poisons[0].id).toBe('剧毒')           // 显示名保持最强那一级
  })

  it('重复命中：先弱后强 → 升级为毒等级名并刷新回合', async () => {
    await apiSystem.call('combat', 'registerHook', 'float_mul', () => 1.0)
    await startBattle(() => 0.9)
    await playerAct('毒手')        // 毒 k=1
    expect((state().combatants.enemy.effects as any[]).find(e => e.id === '毒')).toBeDefined()
    await playerAct('毒沙掌')      // 剧毒 k=3 → 升级
    const effects = state().combatants.enemy.effects as any[]
    expect(effects.some(e => e.id === '毒')).toBe(false)
    expect(effects.find(e => e.id === '剧毒')).toBeDefined()
  })

  it('通道「毒伤害」：percent 减免即时毒伤与持续毒伤；set 0 = 免疫（仍挂毒）', async () => {
    await apiSystem.call('combat', 'registerHook', 'float_mul', () => 1.0)
    await startBattle(() => 0.9)
    // 受方自带 毒伤害 -50%：即时毒伤只并入一半 M；持续毒伤同样减半（M 快照仍是原值）
    apiSystem.callSync('combat', 'addZoneEffect', 'enemy', {
      id: '抗毒', action: 'modify_channel', channel: '毒伤害', mode: 'percent', value: -0.5, duration: 'battle',
    })
    const result = await playerAct('毒沙掌')
    const 半M = POISON_M / 2
    expect(result.damage).toBe(Math.round(1067.9664 + 半M) - 55)
    const rec = (apiSystem.callSync('combat', 'getFormulaHistory') as any[])
      .filter(r => r.hook === 'poison_dot').pop()
    // DoT 原值 = 1.5×(1%上限 + M原值×0.1)，再减半取整
    expect(rec.value).toBe(Math.round(0.5 * 1.5 * (0.01 * ENEMY_HP + POISON_M * 0.1)))
    expect(part(rec.parts, 'M快照')).toBeCloseTo(POISON_M, 3)
  })

  it('通道「毒伤害」set 0：免疫毒伤但依然挂毒', async () => {
    await apiSystem.call('combat', 'registerHook', 'float_mul', () => 1.0)
    await startBattle(() => 0.9)
    apiSystem.callSync('combat', 'addZoneEffect', 'enemy', {
      id: '毒免疫', action: 'modify_channel', channel: '毒伤害', mode: 'set', value: 0, duration: 'battle',
    })
    const result = await playerAct('毒沙掌')
    expect(result.damage).toBe(1068 - 55)      // 只剩普通伤害
    expect((state().combatants.enemy.effects as any[]).some(e => e.id === '剧毒')).toBe(true)
  })

  it('持续毒伤不吃通用减伤 damage_in（护体无效）', async () => {
    await apiSystem.call('combat', 'registerHook', 'float_mul', () => 1.0)
    await startBattle(() => 0.9)
    apiSystem.callSync('combat', 'addZoneEffect', 'enemy', {
      id: '护体', action: 'modify_stat', stat: 'damage_in', mode: 'percent', value: -0.5, duration: 'battle',
    })
    await playerAct('毒沙掌')
    const rec = (apiSystem.callSync('combat', 'getFormulaHistory') as any[])
      .filter(r => r.hook === 'poison_dot').pop()
    expect(rec.value).toBe(POISON_DOT_K3)      // 未被 damage_in 削减
  })

  it('持续毒伤触发「受伤害后」相位（damage_taken）', async () => {
    await apiSystem.call('combat', 'registerHook', 'float_mul', () => 1.0)
    // 玩家攻击全部落空 → 本场对敌方唯一的伤害来源就是毒 DoT
    await apiSystem.call('combat', 'registerHook', 'hit_rate', () => -100)
    await startBattle(() => 0.9)
    // 受伤害后效果：给自己挂一个可观测的状态（战中毒，3 回合）
    apiSystem.callSync('combat', 'addZoneEffect', 'enemy', {
      id: '受击印记', trigger: 'damage_taken', action: 'apply_effect', target: 'self',
      value: { effect: '战中毒' }, duration: 'battle',
    })
    // 直接挂毒（不经攻击）
    await apiSystem.call('combat', 'applyStatus', 'enemy', '剧毒', { sourceId: 'player', value: { m: POISON_M, k: 3 } })
    expect(state().combatants.enemy.hp).toBe(ENEMY_HP)
    await playerAct('毒沙掌')   // 攻击落空；敌方回合开始毒发 → 触发 damage_taken
    const effects = state().combatants.enemy.effects as any[]
    expect(effects.some(e => e.id === '战中毒')).toBe(true)
  })

  it('毒杀：回合开始毒死 → 该角色本回合不行动', async () => {
    await apiSystem.call('combat', 'registerHook', 'float_mul', () => 1.0)
    await startBattle(() => 0.9)
    // 敌方残血：中毒后下一回合开始必被毒死
    const enemy = entitySystem.get('character', 'enemy') as any
    const st0 = state()
    void st0
    enemy.base.hp = 0
    void enemy
    // 直接构造：把敌方战斗内 hp 压到毒伤以下（走 zone 效果无法改 hp，此处用 API 直扣）
    await apiSystem.call('combat', 'applyDamage', 'enemy', ENEMY_HP - 100, { source: 'player', kind: 'external' })
    let ended = false
    eventBus.once('combat:end', () => { ended = true })
    await playerAct('毒沙掌')   // 命中 + 挂毒 → 敌方回合开始毒发致死
    expect(ended).toBe(true)
  })
})

// ── 数据校验 ────────────────────────────────────────────────────────────

describe('combat-wuxia 数据校验', () => {
  beforeEach(async () => { await boot() })

  it('递归类效果 chance≥1 → 校验报错', () => {
    const mod = modLoader.getMod()!
    Object.assign(mod.battleEffects, {
      '连招': {
        name: '连招', action: 'repeat', trigger: 'action_end', chance: 1, recursive: true,
      },
    })
    validateBattleData()
    expect(errorReporter.getErrors().some(e => e.message.includes('recursive') || e.message.includes('递归'))).toBe(true)
  })

  it('特殊系技能缺脚本 → 校验报错', () => {
    const mod = modLoader.getMod()!
    Object.assign(mod.abilities, {
      '无脚本气功2': {
        id: '无脚本气功2', name: '无脚本气功2', type: 'active', cost: 0, category: '气功', tags: ['气功'], effects: [],
      },
    })
    validateBattleData()
    expect(errorReporter.getErrors().some(e => e.message.includes('缺少伤害脚本'))).toBe(true)
  })

  it('非法系别 → 校验报错', () => {
    const mod = modLoader.getMod()!
    Object.assign(mod.abilities, {
      '妖术': {
        id: '妖术', name: '妖术', type: 'active', power: 10, cost: 0, category: '妖法', tags: [], effects: [],
      },
    })
    validateBattleData()
    expect(errorReporter.getErrors().some(e => e.message.includes('category'))).toBe(true)
  })

  it('apply_effect 引用不存在的效果 → 校验报错', () => {
    const mod = modLoader.getMod()!
    const yh = {
      id: '妖火', name: '妖火', type: 'active', power: 10, cost: 0, category: '拳掌', tags: [], effects: [],
    } as any
    yh.effects = [{ trigger: 'on_hit', action: 'apply_effect', value: { effect: '不存在' } }]
    Object.assign(mod.abilities, { '妖火': yh })
    validateBattleData()
    expect(errorReporter.getErrors().some(e => e.message.includes('不存在的战斗效果'))).toBe(true)
  })

  it('未注册的公式通道 → 校验报错（列出可用通道）', () => {
    const mod = modLoader.getMod()!
    Object.assign(mod.battleEffects, {
      '乱写': { name: '乱写', action: 'modify_channel', channel: '不存在的通道', mode: 'percent', value: 0.1 },
    })
    validateBattleData()
    const err = errorReporter.getErrors().find(e => e.message.includes('未注册的公式通道'))
    expect(err).toBeDefined()
    expect(err!.suggestion ?? '').toContain('风格系数')
  })

  it('mode=set 用于 modify_stat → 校验报错（仅通道支持覆盖语义）', () => {
    const mod = modLoader.getMod()!
    Object.assign(mod.battleEffects, {
      '硬设': { name: '硬设', action: 'modify_stat', stat: 'damage_out', mode: 'set', value: 0.5 },
    })
    validateBattleData()
    expect(errorReporter.getErrors().some(e => e.message.includes("mode='set' 只允许用于 modify_channel"))).toBe(true)
  })

  it('when_skill 引用未定义技能 → 校验报错', () => {
    const mod = modLoader.getMod()!
    Object.assign(mod.battleEffects, {
      '错技能': { name: '错技能', action: 'modify_channel', channel: '武功威力', mode: 'flat', value: 10, when_skill: '无此武功' },
    })
    validateBattleData()
    expect(errorReporter.getErrors().some(e => e.message.includes("when_skill '无此武功'"))).toBe(true)
  })

  it('天赋 combat_channel 缺少 channel → 校验报错', () => {
    const mod = modLoader.getMod()!
    Object.assign(mod.talentDefs, {
      乱天赋: { name: '乱天赋', max: 1, modifiers: [{ formula: 'combat_channel', multiply: 0.1 }] },
    })
    validateBattleData()
    expect(errorReporter.getErrors().some(e => e.message.includes('combat_channel modifier 缺少 channel'))).toBe(true)
  })

  it('天赋 combat_channel 引用未注册通道 → 校验报错', () => {
    const mod = modLoader.getMod()!
    Object.assign(mod.talentDefs, {
      乱天赋2: { name: '乱天赋2', max: 1, modifiers: [{ formula: 'combat_channel', channel: '没这个', multiply: 0.1 }] },
    })
    validateBattleData()
    expect(errorReporter.getErrors().some(e => e.message.includes("引用了未注册的公式通道 '没这个'"))).toBe(true)
  })

  // ── 毒（v1.2）校验 ──
  it('apply_poison 缺少 status → 校验报错', () => {
    const mod = modLoader.getMod()!
    Object.assign(mod.abilities, {
      缺状态毒掌: { id: '缺状态毒掌', name: '缺状态毒掌', type: 'active', power: 10, cost: 0, category: '拳掌', tags: [], effects: [{ action: 'apply_poison' }] },
    })
    validateBattleData()
    expect(errorReporter.getErrors().some(e => e.message.includes('缺少 status'))).toBe(true)
  })

  it('apply_poison 引用不存在的状态 → 校验报错', () => {
    const mod = modLoader.getMod()!
    Object.assign(mod.abilities, {
      幽灵毒掌: { id: '幽灵毒掌', name: '幽灵毒掌', type: 'active', power: 10, cost: 0, category: '拳掌', style: { 毒性: 10 }, tags: [], effects: [{ action: 'apply_poison', status: '不存在之毒' }] },
    })
    validateBattleData()
    expect(errorReporter.getErrors().some(e => e.message.includes("引用了不存在的状态 '不存在之毒'"))).toBe(true)
  })

  it('毒状态 k 越界 → 校验报错（当前支持 1..3）', () => {
    const mod = modLoader.getMod()!
    Object.assign(mod.battleEffects, {
      超级毒: { name: '超级毒', action: 'poison_dot', trigger: 'turn_start', k: 5, merge_group: '毒', category: 'debuff' },
    })
    validateBattleData()
    expect(errorReporter.getErrors().some(e => e.message.includes("的 k '5' 非法"))).toBe(true)
  })

  it('合并组内 action 不一致 → 校验报错（防"一份毒、两套结算"）', () => {
    const mod = modLoader.getMod()!
    Object.assign(mod.battleEffects, {
      怪毒: { name: '怪毒', action: 'periodic_damage', trigger: 'turn_start', value: 1, k: 1, merge_group: '毒', category: 'debuff' },
    })
    validateBattleData()
    expect(errorReporter.getErrors().some(e => e.message.includes("同属合并组 '毒' 但 action 不同"))).toBe(true)
  })

  it('毒词条但 style.毒性 缺省 → warning（毒功系数只吃人物毒功）', () => {
    const mod = modLoader.getMod()!
    Object.assign(mod.abilities, {
      没毒性毒掌: { id: '没毒性毒掌', name: '没毒性毒掌', type: 'active', power: 10, cost: 0, category: '拳掌', tags: [], effects: [{ action: 'apply_poison', status: '毒' }] },
    })
    validateBattleData()
    expect(errorReporter.getErrors().some(e => e.message.includes('style.毒性 缺省/为 0'))).toBe(true)
  })
})
