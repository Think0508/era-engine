// 注释：combat-base 管线测试——回合循环/命中/暴击/浮动/效果区/反击一层/递归上限/复活/回写/隔离
// 默认钩子（无 wuxia 公式）下验证通用战斗机制层
import { describe, it, expect, beforeEach } from 'vitest'
import { onLoad, onEnable, __resetCombatModule } from './index'
import { entitySystem } from '../../core/entity-system'
import { bindingResolver } from '../../core/binding-resolver'
import { gameContext } from '../../core/game-context'
import { apiSystem } from '../../core/api'
import { eventBus } from '../../core/event-bus'
import { narrativeLog } from '../../core/narrative-log'
import { errorReporter } from '../../core/error-reporter'
import { modLoader } from '../../core/mod-loader'
import { effectTypeRegistry } from '../../core/effect-type-registry'
import { commandRegistry } from '../../core/command-registry'
import { getEntityAttr, readRawAttr, setEntityAttr } from '../../core/entity-utils'
import { configureAttributeEval } from '../../core/attribute-eval'
import { validateBattleEffectDefs } from './effect-validate'

// ── 测试环境 ────────────────────────────────────────────────────────────

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

// 假 mod（能力/战斗效果定义库；modLoader.loadedMod 注入）
function baseMod() {
  return {
    id: 'test-mod',
    abilities: {
      三连击: { id: '三连击', name: '三连击', type: 'active', power: 30, cost: 10, hits: 3 },
      消耗技: { id: '消耗技', name: '消耗技', type: 'active', power: 50, cost: 100 },
      连击连连: {
        id: '连击连连', name: '连击连连', type: 'active', power: 20, cost: 5, hits: 1,
        battle_effects: [{ effect: '复读（测试）', chance: 0.9 }],
      },
      复读零耗: {
        id: '复读零耗', name: '复读零耗', type: 'active', power: 10, cost: 0, hits: 1,
        battle_effects: [{ effect: '复读（测试）', chance: 1 }],
      },
    } as any,
    battleEffects: {
      '复读（测试）': {
        name: '复读', delivery: 'instant', trigger: 'action_end',
        action: 'repeat', target: 'self', category: 'neutral',
      },
    },
    scripts: new Map<string, string>(),
    talentDefs: {},
  }
}

function registerChars(): void {
  entitySystem.register('character', 'player', {
    id: 'player', name: '玩家',
    base: { hp: 100, mp: 50, attack: 20, defense: 0, speed: 10, hp_max: 100, mp_max: 50 },
  })
  entitySystem.register('character', 'enemy', {
    id: 'enemy', name: '敌人',
    // speed 6（不是 5）：10/6 = 1.67 < 2 → 不触发先攻碾压连动，本文件其余用例保持
    // 「一次 playerAct = 走完一轮」的节奏；连动专项见 describe「先攻碾压连动」
    base: { hp: 60, mp: 30, attack: 10, defense: 0, speed: 6, hp_max: 60, mp_max: 30 },
    abilities: { '三连击': { level: 1, xp: 0 } },
  })
}

async function boot(): Promise<void> {
  __resetCombatModule()
  effectTypeRegistry.clear()
  entitySystem.clear()
  bindingResolver.loadBindings({
    'combat-base': { hp: 'hp', mp: 'mp', attack: 'attack', defense: 'defense', speed: 'speed', hp_max: 'hp_max', mp_max: 'mp_max' },
  })
  narrativeLog.clear()
  errorReporter.clear()
  gameContext.reset()
  apiSystem.clear()
  eventBus.clear()
  commandRegistry.clear()
  ;(modLoader as any).loadedMod = baseMod()
  registerChars()
  gameContext.setPlayer('player')
  const ctx = makeMockCtx()
  onLoad(ctx)
  onEnable(ctx)
}

// 启动战斗：player speed 高先手；rng 固定 0.4（命中判定一致、平速判先）
async function startBattle(rng: () => number = () => 0.4): Promise<void> {
  await apiSystem.call('combat', 'start', ['enemy'], ['player'])
  await apiSystem.call('combat', 'setRng', rng)
}

// 玩家出一招（回合制：每次行动后轮到玩家时返回；取玩家自己的 combat:turn 结果）
async function playerAct(skillId: string | null = null, targetId = 'enemy'): Promise<any> {
  const turnEvents: any[] = []
  const h = (p: any) => { turnEvents.push(p) }
  eventBus.on('combat:turn', h)
  await apiSystem.call('combat', 'executeAction', 'player', { type: 'skill', skillId, targetId })
  eventBus.off('combat:turn', h)
  const mine = turnEvents.find(e => e.actor === 'player')
  return mine?.result ?? null
}

function getBase(entityId: string): any {
  return (entitySystem.get('character', entityId) as any).base
}

// ⚠️ 通道名/中间量名属"结构数据"，不是 attributes.toml 属性——中文 key 必须经变量/helper 间接取
// （scan-attr-refs 契约：`obj['中文']` 会被判为属性引用）
const chan = (bag: any, key: string): any => bag?.[key]
const part = (parts: any, key: string): any => parts?.[key]

// ── 回合与管线 ───────────────────────────────────────────────────────────

describe('combat-base 回合循环', () => {
  beforeEach(async () => { await boot() })

  it('先攻：速度快者先动；默认攻击扣血 + 战斗回写', async () => {
    await startBattle()
    // player 先手（speed 10 > 5）
    const state = apiSystem.callSync('combat', 'getCombatState')
    expect(state.order[0]).toBe('player')
    // 玩家默认攻击：attack 20 - defense 0×2 = 20
    const result = await playerAct(null)
    expect(result.damage).toBe(20)
    expect(result.hits).toBe(1)
    // enemy 回合自动行动（三连击 → 30-0=30×3？默认钩子 hits 3 → 每段 30-0=30 → 90）
    const enState = apiSystem.callSync('combat', 'getCombatState')
    expect(enState.combatants.player.hp).toBeGreaterThanOrEqual(0)
    // 敌人三连击可能秒杀玩家 → 战斗可能已结束；这里宽松断言玩家 hp 减少
    const alive = enState.combatants.player.hp
    expect(alive).toBeLessThan(100)
  })

  it('战斗内 hp 隔离：战斗中实体 hp 不变，结束回写', async () => {
    await startBattle(() => 0.9) // 命中率：rng*100=90 < 100 命中
    expect(getBase('player').hp).toBe(100)
    // 玩家打敌人（默认攻击 20 伤）——敌人回合自动反击玩家（10 伤），战斗内隔离
    await playerAct(null)
    // 实体仍未变（战斗隔离：hp 只存在 combatant 上）
    expect(getBase('enemy').hp).toBe(60)
    expect(getBase('player').hp).toBe(100)
    // 结束战斗（逃跑）
    await apiSystem.call('combat', 'end', '', 'fled')
    // 回写：敌人 60-22（玩家一击，浮动 1.08）= 38，玩家 100-33（敌方三连击 3×11）= 67
    expect(getBase('enemy').hp).toBe(38)
    expect(getBase('player').hp).toBe(67)
  })

  it('flee 结束战斗，outcome=fled', async () => {
    await startBattle()
    let ended: any = null
    eventBus.once('combat:end', (p: any) => { ended = p })
    await apiSystem.call('combat', 'executeAction', 'player', { type: 'flee' })
    expect(ended?.outcome).toBe('fled')
  })
})

describe('combat-base 命中/暴击/浮动', () => {
  beforeEach(async () => { await boot() })

  it('miss：hit_rate 钩子为 0 → 无伤害 + 日志闪避', async () => {
    await startBattle()
    await apiSystem.call('combat', 'registerHook', 'hit_rate', () => 0)
    const result = await playerAct(null)
    expect(result.damage).toBe(0)
    expect(narrativeLog.getEntries().some(e => e.text.includes('闪避'))).toBe(true)
  })

  it('暴击：crit_rate=100 → crits=1 且伤害 × 1.5', async () => {
    await startBattle(() => 0.9)
    await apiSystem.call('combat', 'registerHook', 'crit_rate', () => 100)
    await apiSystem.call('combat', 'registerHook', 'float_mul', () => 1.0)
    const result = await playerAct(null)
    expect(result.crits).toBe(1)
    expect(result.damage).toBe(Math.round(20 * 1.5))
  })

  it('浮动：float_mul 注入 0.9/1.1 上下界', async () => {
    await startBattle(() => 0.9)
    await apiSystem.call('combat', 'registerHook', 'float_mul', () => 0.9)
    const r1 = await playerAct(null)
    expect(r1.damage).toBe(18)
    await apiSystem.call('combat', 'registerHook', 'float_mul', () => 1.1)
    const r2 = await playerAct(null)
    expect(r2.damage).toBe(22)
  })

  it('多段：hits=3 每段独立结算，合计入 result', async () => {
    await startBattle(() => 0.9)
    await apiSystem.call('combat', 'registerHook', 'float_mul', () => 1.0)
    const result = await playerAct('三连击')
    expect(result.hits).toBe(3)
    expect(result.damage).toBe(60) // 20×3，每段独立管线
  })

  it('多段中途目标倒下：第三段前战斗结束，剩余段落空', async () => {
    await startBattle(() => 0.9)
    await apiSystem.call('combat', 'registerHook', 'float_mul', () => 1.0)
    // 敌人 60 血；三连击每段 20 → 第 3 段打空（0 血即无结算资格）
    const result = await playerAct('三连击')
    expect(result.hits).toBe(3)
    expect(result.damage).toBe(60)
    // 敌人死亡检查点在每段后 → 战斗已结束
    const state = apiSystem.callSync('combat', 'getCombatState')
    expect(state).toBeNull()
  })
})

// ── 先攻碾压连动（先攻 ≥ 对方最快者 2 倍 → 连续行动）────────────────────

describe('combat-base 先攻碾压连动', () => {
  beforeEach(async () => { await boot() })

  // 直接注入先攻值（绕过速度属性，精确控制比值）
  async function setInitiative(map: Record<string, number>): Promise<void> {
    await apiSystem.call('combat', 'registerHook', 'initiative', (hctx: any) => map[hctx.sourceId] ?? 0)
  }
  const combatState = () => apiSystem.callSync('combat', 'getCombatState')

  it('档位：比值 1.99/2/3.99/4/8/16 → 额外 0/1/1/2/3/3（封顶 3）', async () => {
    const cases: [number, number, number][] = [
      [199, 100, 0], [200, 100, 1], [399, 100, 1], [400, 100, 2], [800, 100, 3], [1600, 100, 3],
    ]
    for (const [p, e, extra] of cases) {
      await boot()
      await setInitiative({ player: p, enemy: e })
      await startBattle()
      const st = combatState()
      expect({ p, e, extra: st.combatants.player.extraTurns }).toEqual({ p, e, extra })
      // 连动 = 行动序里连续出现（快方动完才轮到对方）
      expect(st.order).toEqual([...Array(extra + 1).fill('player'), 'enemy'])
      expect(st.combatants.enemy.extraTurns).toBe(0)
      // 轮初连动日志（extra = 0 时不写）
      expect(narrativeLog.getEntries().some(e => e.text.includes('轻功碾压'))).toBe(extra > 0)
    }
  })

  it('除零：对方先攻 0 → 满档 +3；双方全 0 → 双双不连动', async () => {
    await setInitiative({ player: 50, enemy: 0 })
    await startBattle()
    let st = combatState()
    expect(st.combatants.player.extraTurns).toBe(3)
    expect(st.combatants.enemy.extraTurns).toBe(0) // 自己 0 先攻谈不上碾压
    expect(st.order).toEqual(['player', 'player', 'player', 'player', 'enemy'])

    await boot()
    await setInitiative({ player: 0, enemy: 0 })
    await startBattle()
    st = combatState()
    expect(st.combatants.player.extraTurns).toBe(0)
    expect(st.combatants.enemy.extraTurns).toBe(0)
    expect(st.order.length).toBe(2)
  })

  it('群战口径：必须碾过对方最快者才连动（不是碾过任意弱者）', async () => {
    const addEnemy2 = () => entitySystem.register('character', 'enemy2', {
      id: 'enemy2', name: '敌二',
      base: { hp: 60, mp: 30, attack: 10, defense: 0, speed: 6, hp_max: 60, mp_max: 30 },
    })
    addEnemy2()
    await setInitiative({ player: 40, enemy: 100, enemy2: 15 })
    await apiSystem.call('combat', 'start', ['enemy', 'enemy2'], ['player'])
    expect(combatState().combatants.player.extraTurns).toBe(0) // 对方最快 100 → 40/100 < 2

    await boot()
    addEnemy2()
    await setInitiative({ player: 40, enemy: 15, enemy2: 15 })
    await apiSystem.call('combat', 'start', ['enemy', 'enemy2'], ['player'])
    expect(combatState().combatants.player.extraTurns).toBe(1) // 40/15 ≈ 2.67 → +1
  })

  it('连动 = 完整回合：回合初相位/时长递减按自己的行动次数结算', async () => {
    await setInitiative({ player: 20, enemy: 10 }) // 2 倍 → 玩家 +1
    await apiSystem.call('combat', 'registerHook', 'float_mul', () => 1.0)
    // 战斗开始即挂毒（生产路径 combatant_init）：毒在自己的每个回合初结算一次
    await apiSystem.call('combat', 'registerHook', 'combatant_init', (hctx: any) => {
      if (hctx.combatant.entityId === 'player') {
        apiSystem.callSync('combat', 'addZoneEffect', 'player', {
          id: '连动毒', trigger: 'turn_start', action: 'periodic_damage',
          value: 5, duration: { turns: 2 }, category: 'debuff',
        })
      }
    })
    let playerTurns = 0
    await apiSystem.call('combat', 'registerHook', 'turn_start', (hctx: any) => {
      if (hctx.actorId === 'player') playerTurns++
    })
    await startBattle(() => 0.9)
    const st = combatState()
    expect(st.order).toEqual(['player', 'player', 'enemy'])
    expect(playerTurns).toBe(1)
    expect(st.combatants.player.hp).toBe(95) // 首个回合初：毒 5

    await playerAct(null)
    const st2 = combatState()
    expect(playerTurns).toBe(2)               // 连动走的是完整回合（回合初链钩子再次触发）
    expect(st2.combatants.player.hp).toBe(90) // 第二次回合初：毒再结算 5

    await playerAct(null) // 玩家第 2 动（连动）→ 之后敌人行动 → 下一轮重排
    const st3 = combatState()
    // 毒 turns = 2 被自己的 2 次行动走完 → 到期（若是「赠一次攻击」的伪回合则不会走完）
    expect(st3.combatants.player.effects.find((e: any) => e.id === '连动毒')).toBeUndefined()
    expect(st3.round).toBe(2)
  })

  it('采样时机：轮中先攻下降不改变本轮已排定的连动，下一轮才降档', async () => {
    // 先攻 = 基准 + 「先攻」通道（通道是活态：recalcStats 即时重算），但连动档位轮初冻结
    await apiSystem.call('combat', 'registerHook', 'initiative', (hctx: any) => {
      const base = hctx.sourceId === 'player' ? 40 : 20
      return base + (chan(hctx.channels?.source, '先攻')?.flat ?? 0)
    })
    await startBattle(() => 0.9)
    expect(combatState().order).toEqual(['player', 'player', 'enemy'])

    // 轮中给玩家挂先攻 -25（无 trigger = 常驻通道）
    apiSystem.callSync('combat', 'addZoneEffect', 'player', {
      id: '轮中缓慢', action: 'modify_channel', channel: '先攻', value: { flat: -25 }, duration: { turns: 5 },
    })
    const st = combatState()
    expect(chan(st.combatants.player.channels, '先攻').flat).toBe(-25) // 通道即时生效
    expect(st.order).toEqual(['player', 'player', 'enemy'])            // 本轮已排定的连动不受影响
    expect(st.combatants.player.extraTurns).toBe(1)

    await playerAct(null) // 玩家第 1 动
    await playerAct(null) // 玩家连动（第 2 动）→ 敌人行动 → 下一轮重排
    const st2 = combatState()
    expect(st2.round).toBe(2)
    expect(st2.order).toEqual(['enemy', 'player']) // 玩家 15 < 敌人 20 → 先攻反转，双双不连动
    expect(st2.combatants.player.extraTurns).toBe(0)
  })
})

// ── 效果区/反击/递归/复活/回写 ───────────────────────────────────────────

describe('combat-base 效果区与防护', () => {
  beforeEach(async () => { await boot() })

  async function addEffect(entityId: string, partial: any): Promise<void> {
    apiSystem.callSync('combat', 'addZoneEffect', entityId, { ...partial, duration: partial.duration ?? 'battle' })
  }

  it('护体（damage_in 减伤）：敌方三连击 3 段各减半', async () => {
    await startBattle(() => 0.9)
    await apiSystem.call('combat', 'registerHook', 'float_mul', () => 1.0)
    await addEffect('player', { id: '护体', action: 'modify_stat', stat: 'damage_in', value: { percent: 0.5  }})
    await playerAct(null) // 玩家攻击后敌人回合：三连击 3×10×(1-0.5)=15
    const st = apiSystem.callSync('combat', 'getCombatState')
    expect(st.combatants.player.hp).toBe(85)
  })

  it('毒（periodic_damage）：敌人回合初扣血；2 回合后到期移除', async () => {
    getBase('enemy').hp = 200 // 战斗开始前改（隔离快照）
    getBase('enemy').hp_max = 200
    await startBattle(() => 0.9)
    await apiSystem.call('combat', 'registerHook', 'float_mul', () => 1.0)
    await addEffect('enemy', {
      id: '战中毒', trigger: 'turn_start', action: 'periodic_damage',
      value: 10, duration: { turns: 2 }, category: 'debuff',
    })
    // 2 轮：玩家 20×2、毒 10×2 → 200-60=140
    await playerAct(null)
    await playerAct(null)
    expect(apiSystem.callSync('combat', 'getCombatState').combatants.enemy.hp).toBe(140)
    // 第 3 轮：毒已到期，只剩玩家 20 → 120
    await playerAct(null)
    const st = apiSystem.callSync('combat', 'getCombatState')
    expect(st.combatants.enemy.hp).toBe(120)
    expect(st.combatants.enemy.effects.find((e: any) => e.id === '战中毒')).toBeUndefined()
  })

  it('反击链一层：反击不会触发对方的反震/反击', async () => {
    await startBattle(() => 0.9)
    await apiSystem.call('combat', 'registerHook', 'float_mul', () => 1.0)
    // 敌方：受击反击（三连击）；玩家：受击反震——敌对玩家的反击/反震在反击链中不触发
    await addEffect('enemy', { id: '反打', trigger: 'damage_mitigate', action: 'counter', skill: '三连击' })
    await addEffect('player', { id: '反震', trigger: 'damage_mitigate', action: 'reflect', value: { percent: 1.0 } })
    await playerAct(null)
    // 玩家：100 - 30（敌方反打反击 3×10） - 30（敌方自己回合三连击 3×10）= 40
    // —— 反击链中玩家的反震未触发（否则反击伤害会再次被反震掉）
    const st = apiSystem.callSync('combat', 'getCombatState')
    expect(st.combatants.player.hp).toBe(40)
    // 敌方：60 - 20（玩家主击） - 30（敌人回合 3 段被反震 1.0）= 10
    expect(st.combatants.enemy.hp).toBe(10)
    // 反震在玩家被反击时（反击链）被抑制 → 不是 4 次
    const reflectLogs = narrativeLog.getEntries().filter(e => e.text.includes('反震出'))
    expect(reflectLogs.length).toBe(3) // 只有敌人自己回合的 3 段
  })

  it('以柔克刚（cancel+反击）：伤害取消且反击', async () => {
    await startBattle(() => 0.9)
    await apiSystem.call('combat', 'registerHook', 'float_mul', () => 1.0)
    await addEffect('enemy', {
      id: '以柔克刚', trigger: 'damage_on_target', action: 'cancel',
      skill: '三连击', priority: 10,
    })
    const result = await playerAct(null)
    expect(result.damage).toBe(0) // 伤害被取消
    // 玩家：100 - 30（以柔克刚反击 3×10） - 30（敌人自己回合三连击）= 40
    const st = apiSystem.callSync('combat', 'getCombatState')
    expect(st.combatants.player.hp).toBe(40)
  })

  it('repeat 递归：深度上限 64 强制断链 + 上报', async () => {
    // 敌人血量必须在战斗开始前改（战斗内 hp 隔离快照）
    getBase('enemy').hp = 5000
    getBase('enemy').hp_max = 5000
    await startBattle(() => 0.4) // rng<1 恒真 → chance=1 的复读无限触发
    await apiSystem.call('combat', 'registerHook', 'float_mul', () => 1.0)
    await playerAct('复读零耗')
    expect(errorReporter.getErrors().some(e => e.message.includes('递归深度上限'))).toBe(true)
    // 断链后战斗仍可正常进行
    const st = apiSystem.callSync('combat', 'getCombatState')
    expect(st).not.toBeNull()
  })

  it('复活：神照经一次满状态复活；再死则战斗结束判败', async () => {
    // 注意：敌人回合在 start 内同步执行（npcAutoAction）——公式钩子与效果注入都必须在 start 之前
    // 被动类效果走生产路径：combatant_init 钩子（战斗开始时注入效果区）
    await apiSystem.call('combat', 'registerHook', 'combatant_init', (hctx: any) => {
      // 一次性被动（神照经）：已消耗则重建时跳过（生产 compile 的 consumedEffects 语义）
      if (hctx.combatant.entityId === 'player' && !hctx.combatant.consumedEffects.includes('神照经')) {
        apiSystem.callSync('combat', 'addZoneEffect', 'player', {
          id: '神照经', trigger: 'death', action: 'revive', uses: 1, duration: 'battle',
        })
      }
    })
    await apiSystem.call('combat', 'registerHook', 'initiative', (hctx: any) => hctx.sourceId === 'enemy' ? 100 : 0)
    await apiSystem.call('combat', 'registerHook', 'base_damage', () => 1000)
    await apiSystem.call('combat', 'registerHook', 'float_mul', () => 1.0)
    // 战斗结束事件可能在 start 内触发（敌人首回合即分胜负）——监听器须先注册
    let outcome: string | null = null
    eventBus.once('combat:end', (p: any) => { outcome = p.outcome })
    await startBattle(() => 0.9)
    // 敌人（三连击 3×1000）行动：第一段致死 → 复活（满状态）→ 第二段再致死 → 判败
    const result = await playerAct(null)
    expect(result).toBeNull() // 玩家没有回合（start 内已被打死+战败）
    expect(outcome).toBe('lose')
    const reviveLogs = narrativeLog.getEntries().filter(e => e.text.includes('满状态复活'))
    expect(reviveLogs.length).toBe(1)
  })

  it('同归于尽：双方同时死亡判玩家败', async () => {
    await startBattle(() => 0.9)
    await apiSystem.call('combat', 'registerHook', 'base_damage', () => 1000)
    await apiSystem.call('combat', 'registerHook', 'float_mul', () => 1.0)
    // 敌人反震 100%：玩家 1000 伤同时被反震 1000 → 同归
    await addEffect('enemy', { id: '反震', trigger: 'damage_mitigate', action: 'reflect', value: { percent: 1.0 } })
    let outcome: string | null = null
    eventBus.once('combat:end', (p: any) => { outcome = p.outcome })
    await playerAct(null)
    expect(outcome).toBe('lose')
  })

  it('吸上限（permanent）：结束回写实体 mp_max（玩家 +、敌方 −）', async () => {
    // 敌人当前内力须低于上限（吸收上限的钳制：上限不能低于当前值）——须在战斗开始前改
    getBase('enemy').mp = 10
    await startBattle(() => 0.9)
    await apiSystem.call('combat', 'registerHook', 'float_mul', () => 1.0)
    await addEffect('player', { id: '北冥', trigger: 'on_hit', action: 'leech_mp_max', value: 20 })
    await playerAct(null)
    await apiSystem.call('combat', 'end', 'allies', 'win')
    expect(getBase('player').mp_max).toBe(50 + 20)
    expect(getBase('enemy').mp_max).toBe(30 - 20)
  })
})

// ── 合同 v1.1：action_pre / 相位叠加修复 / 命中不截断 / 通道 / 公式明细 ────

describe('combat-base 行动前相位与禁技', () => {
  beforeEach(async () => { await boot() })

  it('action_pre：用技能前执行；action_block 禁止行动（内力不扣、该次行动作废轮到下一位）', async () => {
    await startBattle(() => 0.9)
    await apiSystem.call('combat', 'registerHook', 'float_mul', () => 1.0)
    apiSystem.callSync('combat', 'addZoneEffect', 'player', {
      id: '封穴', trigger: 'action_pre', action: 'action_block', value: { flat: 0 }, duration: 'battle',
    })
    apiSystem.callSync('combat', 'addZoneEffect', 'player', {
      id: '记录', trigger: 'action_pre', action: 'modify_stat', stat: 'damage_out', value: { flat: 0 },
      duration: 'battle',
    })
    const result = await playerAct('三连击')
    expect(result).toBeNull() // 行动被拒（未发出 combat:turn）
    const st = apiSystem.callSync('combat', 'getCombatState')
    expect(st.combatants.player.mp).toBe(50) // 内力未扣
    expect(st.combatants.enemy.hp).toBe(60) // 未造成伤害
    expect(narrativeLog.getEntries().some(e => e.text.includes('无法行动'))).toBe(true)
    // 封穴 = 该次行动作废、轮到下一位（玩家与 NPC 一致）：本回合已被消耗 → 已进入新一轮
    expect(st.round).toBeGreaterThan(1)
  })

  it('action_pre 的技能加成：对本次行动生效（相位 overlay 不再被丢弃）', async () => {
    await startBattle(() => 0.9)
    await apiSystem.call('combat', 'registerHook', 'float_mul', () => 1.0)
    apiSystem.callSync('combat', 'addZoneEffect', 'player', {
      id: '聚气', trigger: 'action_pre', action: 'modify_stat', stat: 'damage_out', value: { percent: 1.0 },
      duration: 'battle', uses: 1,
    })
    const result = await playerAct(null)
    // 默认公式 20 点；damage_out +100% → 20×2 = 40（敌方 0 防）
    expect(result.damage).toBe(40)
  })

  it('NPC 被禁技：本回合不出手但仍推进回合', async () => {
    await startBattle(() => 0.9)
    await apiSystem.call('combat', 'registerHook', 'float_mul', () => 1.0)
    apiSystem.callSync('combat', 'addZoneEffect', 'enemy', {
      id: '封穴', trigger: 'action_pre', action: 'action_block', duration: 'battle',
    })
    await playerAct(null) // 玩家一击后，敌人回合被禁 → 玩家血量不减
    const st = apiSystem.callSync('combat', 'getCombatState')
    expect(st.combatants.player.hp).toBe(100)
  })
})

describe('combat-base 相位叠加与命中', () => {
  beforeEach(async () => { await boot() })

  it('damage_output 相位的统计修正作用于最终伤害（原先被静默丢弃）', async () => {
    await startBattle(() => 0.9)
    await apiSystem.call('combat', 'registerHook', 'float_mul', () => 1.0)
    apiSystem.callSync('combat', 'addZoneEffect', 'player', {
      id: '精准', trigger: 'damage_output', action: 'modify_stat', stat: 'damage_out', value: { percent: 0.5 },
      duration: 'battle',
    })
    const result = await playerAct(null)
    expect(result.damage).toBe(30) // 20 × 1.5
  })

  it('attack_pre 相位的命中修正作用于本次命中判定', async () => {
    await startBattle(() => 0.5)
    await apiSystem.call('combat', 'registerHook', 'float_mul', () => 1.0)
    await apiSystem.call('combat', 'registerHook', 'hit_rate', () => 40)
    // 40% 命中 → rng 0.5×100=50 ≥ 40 本应 Miss；attack_pre 加 20 点 → 60 → 命中
    apiSystem.callSync('combat', 'addZoneEffect', 'player', {
      id: '凝神', trigger: 'attack_pre', action: 'modify_stat', stat: 'hit_bonus', value: { flat: 20 },
      duration: 'battle',
    })
    const result = await playerAct(null)
    expect(result.damage).toBe(20)
  })

  it('命中不截断：>100 必中（rng 0.99）、<0 必 Miss（rng 0）', async () => {
    await startBattle(() => 0.99)
    await apiSystem.call('combat', 'registerHook', 'float_mul', () => 1.0)
    await apiSystem.call('combat', 'registerHook', 'hit_rate', () => 130)
    const hit = await playerAct(null)
    expect(hit.damage).toBe(20)
    await apiSystem.call('combat', 'registerHook', 'hit_rate', () => -30)
    const miss = await playerAct(null)
    expect(miss.damage).toBe(0)
  })
})

describe('combat-base 公式中间量通道（通用机制）', () => {
  beforeEach(async () => { await boot() })

  it('常驻通道聚合进 combatant.channels 并注入钩子 ctx', async () => {
    await startBattle(() => 0.9)
    apiSystem.callSync('combat', 'addZoneEffect', 'player', {
      id: '飘逸', action: 'modify_channel', channel: '风格系数', value: { percent: 0.1 }, duration: 'battle',
    })
    apiSystem.callSync('combat', 'addZoneEffect', 'player', {
      id: '破防', action: 'modify_channel', channel: '防御', value: { set: 0 }, duration: 'battle',
    })
    const st = apiSystem.callSync('combat', 'getCombatState')
    expect(chan(st.combatants.player.channels, '风格系数').percent).toBeCloseTo(0.1, 10)
    expect(chan(st.combatants.player.channels, '防御').set).toBe(0)

    let seen: any = null
    await apiSystem.call('combat', 'registerHook', 'base_damage', (hctx: any) => {
      if (hctx.source.entityId === 'player') seen = hctx.channels
      return 10
    })
    await playerAct(null)
    expect(chan(seen.source, '风格系数').percent).toBeCloseTo(0.1, 10)
    expect(chan(seen.source, '防御').set).toBe(0)
    expect(seen.target).toEqual({})
  })

  it('未注册通道也能存（base 不认识通道名，语义由上层解释）', async () => {
    await startBattle(() => 0.9)
    apiSystem.callSync('combat', 'addZoneEffect', 'player', {
      id: '自定义', action: 'modify_channel', channel: '自定义通道', value: { flat: 7 }, duration: 'battle',
    })
    const st = apiSystem.callSync('combat', 'getCombatState')
    expect(chan(st.combatants.player.channels, '自定义通道').flat).toBe(7)
  })

  it('注册表 API：registerChannel/getChannels 幂等；清单可用于数据校验', async () => {
    apiSystem.callSync('combat', 'registerChannel', { id: '测试通道', label: '测试', source: 'test' })
    apiSystem.callSync('combat', 'registerChannel', { id: '测试通道', label: '测试（改）', source: 'test' })
    const list = apiSystem.callSync('combat', 'getChannels') as any[]
    expect(list.filter(c => c.id === '测试通道')).toHaveLength(1)
    expect(list.find(c => c.id === '测试通道').label).toBe('测试（改）')
  })
})

describe('combat-base zone 型挂载（mount_effect / 库条目 + 技能引用）', () => {
  beforeEach(async () => { await boot() })

  async function addDef(id: string, def: any): Promise<void> {
    const mod = modLoader.getMod() as any
    mod.battleEffects[id] = def
  }

  it('zone 型缺省生命周期 5 回合；重复挂按 refresh 重设为本次层数并重置时长', async () => {
    await addDef('灼烧', {
      name: '灼烧', delivery: 'zone', target: 'enemy',
      action: 'periodic_damage', settle: 'turn_start', value: 5, category: 'debuff',
    })
    await startBattle(() => 0.9)
    await apiSystem.call('combat', 'mountEffect', 'enemy', '灼烧', { sourceId: 'player' })
    const inst = (apiSystem.callSync('combat', 'getCombatState').combatants.enemy.effects as any[]).find(e => e.id === '灼烧')
    expect(inst).toBeDefined()
    expect(inst.remainingTurns).toBe(5)          // zone 默认 5 回合
    // 重复挂 → refresh：仍是一条、时长重置
    await apiSystem.call('combat', 'mountEffect', 'enemy', '灼烧', { sourceId: 'player' })
    const list = (apiSystem.callSync('combat', 'getCombatState').combatants.enemy.effects as any[]).filter(e => e.id === '灼烧')
    expect(list.length).toBe(1)
    expect(list[0].remainingTurns).toBe(5)
  })

  it('库条目 duration 优先于 zone 默认（8 回合）', async () => {
    await addDef('长毒', {
      name: '长毒', delivery: 'zone', target: 'enemy',
      action: 'periodic_damage', settle: 'turn_start', value: 5, duration: { turns: 8 }, category: 'debuff',
    })
    await startBattle(() => 0.9)
    await apiSystem.call('combat', 'mountEffect', 'enemy', '长毒', { sourceId: 'player' })
    const inst = (apiSystem.callSync('combat', 'getCombatState').combatants.enemy.effects as any[]).find(e => e.id === '长毒')
    expect(inst.remainingTurns).toBe(8)
  })

  it('merge=stack：层数累加（受 max_stack 限），数值不变（层数由 growth 放大）', async () => {
    await addDef('叠毒', {
      name: '叠毒', delivery: 'zone', target: 'enemy',
      action: 'periodic_damage', settle: 'turn_start',
      value: { flat: 15 }, growth: 1, duration: { turns: 8 }, merge: 'stack', max_stack: 3, category: 'debuff',
    })
    await startBattle(() => 0.9)
    await apiSystem.call('combat', 'mountEffect', 'enemy', '叠毒', { sourceId: 'player', params: { stacks: 1 } })
    await apiSystem.call('combat', 'mountEffect', 'enemy', '叠毒', { sourceId: 'player', params: { stacks: 1 } })
    let inst = (apiSystem.callSync('combat', 'getCombatState').combatants.enemy.effects as any[]).find(e => e.id === '叠毒')
    expect(inst.stack).toBe(2)
    expect(inst.value.flat).toBe(15)             // 基础数值不变
    await apiSystem.call('combat', 'mountEffect', 'enemy', '叠毒', { sourceId: 'player', params: { stacks: 5 } })
    inst = (apiSystem.callSync('combat', 'getCombatState').combatants.enemy.effects as any[]).find(e => e.id === '叠毒')
    expect(inst.stack).toBe(3)                   // max_stack 封顶
  })

  it('merge=strongest：层数取高、数值取大、时长重置；弱的一击不降级', async () => {
    await addDef('毒X', {
      name: '毒X', delivery: 'zone', target: 'enemy',
      action: 'periodic_damage', settle: 'turn_start',
      value: { flat: 1, percent: 0.01 }, growth: 0.25, duration: { turns: 8 },
      merge: 'strongest', category: 'debuff', level_names: ['毒X', '猛毒X', '剧毒X'],
    })
    await startBattle(() => 0.9)
    await apiSystem.call('combat', 'mountEffect', 'enemy', '毒X', { sourceId: 'player', params: { stacks: 1 } })
    await apiSystem.call('combat', 'mountEffect', 'enemy', '毒X', { sourceId: 'player', params: { stacks: 3 }, value: { flat: 30, percent: 0.01 } })
    let list = (apiSystem.callSync('combat', 'getCombatState').combatants.enemy.effects as any[]).filter(e => e.id === '毒X')
    expect(list.length).toBe(1)                  // 一份实例
    expect(list[0].stack).toBe(3)                // 层数取高
    expect(list[0].value.flat).toBe(30)          // M 取大
    // 再中弱的：保持层数与数值，不降级
    await apiSystem.call('combat', 'mountEffect', 'enemy', '毒X', { sourceId: 'player', params: { stacks: 2 }, value: { flat: 5, percent: 0.01 } })
    list = (apiSystem.callSync('combat', 'getCombatState').combatants.enemy.effects as any[]).filter(e => e.id === '毒X')
    expect(list.length).toBe(1)
    expect(list[0].stack).toBe(3)
    expect(list[0].value.flat).toBe(30)
  })

  it('挂载不存在的库条目 → warning 并跳过（不抛错）', async () => {
    await startBattle(() => 0.9)
    await apiSystem.call('combat', 'mountEffect', 'enemy', '不存在的状态', { sourceId: 'player' })
    expect(errorReporter.getErrors().some(e => e.message.includes('不存在的战斗效果'))).toBe(true)
    expect((apiSystem.callSync('combat', 'getCombatState').combatants.enemy.effects as any[]).length).toBe(0)
  })

  it('相位动作 ctx 带通道包（插件自定义动作可读减免）', async () => {
    await startBattle(() => 0.9)
    apiSystem.callSync('combat', 'addZoneEffect', 'player', {
      id: '毒抗', action: 'modify_channel', channel: '毒伤害', value: { percent: -0.5 }, duration: 'battle',
    })
    let seen: any = null
    apiSystem.callSync('combat', 'registerAction', 'probe_action', (actCtx: any) => { seen = actCtx.channels })
    apiSystem.callSync('combat', 'addZoneEffect', 'player', {
      id: '探针', trigger: 'attack_pre', action: 'probe_action', duration: 'battle',
    })
    await playerAct(null)
    expect(chan(seen?.self, '毒伤害').percent).toBeCloseTo(-0.5, 10)
  })
})

describe('combat-base 公式明细', () => {
  beforeEach(async () => { await boot() })

  it('钩子返回 {value, parts} → 明细记录 + combat:turn payload 携带 formulas', async () => {
    await startBattle(() => 0.9)
    await apiSystem.call('combat', 'registerHook', 'float_mul', () => 1.0)
    await apiSystem.call('combat', 'registerHook', 'base_damage', () => ({ value: 33, parts: { 力道项: 300 } }))
    const result = await playerAct(null)
    expect(result.damage).toBe(33)
    expect(Array.isArray(result.formulas)).toBe(true)
    const rec = result.formulas.find((r: any) => r.hook === 'base_damage')
    expect(part(rec.parts, '力道项')).toBe(300)
    expect(apiSystem.callSync('combat', 'getLastFormula')).toBeTruthy()
    expect((apiSystem.callSync('combat', 'getFormulaHistory') as any[]).length).toBeGreaterThan(0)
    expect((apiSystem.callSync('combat', 'getFormulaHistory', 1) as any[]).length).toBe(1)
    apiSystem.callSync('combat', 'clearFormulaHistory')
    expect((apiSystem.callSync('combat', 'getFormulaHistory') as any[]).length).toBe(0)
  })

  it('钩子返回 number 仍兼容（向后兼容）', async () => {
    await startBattle(() => 0.9)
    await apiSystem.call('combat', 'registerHook', 'float_mul', () => 1.0)
    await apiSystem.call('combat', 'registerHook', 'base_damage', () => 25)
    const result = await playerAct(null)
    expect(result.damage).toBe(25)
  })

  it('setFormulaDetail 开关（明细写入叙事日志）', async () => {
    await startBattle(() => 0.9)
    await apiSystem.call('combat', 'registerHook', 'float_mul', () => 1.0)
    expect(apiSystem.callSync('combat', 'getFormulaDetail')).toBe(false)
    apiSystem.callSync('combat', 'setFormulaDetail', true)
    await playerAct(null)
    expect(apiSystem.callSync('combat', 'getFormulaDetail')).toBe(true)
    expect(narrativeLog.getEntries().some(e => e.text.includes('【公式·base_damage】'))).toBe(true)
  })
})

// ── 计划三 Task 4：modify_attribute（落点 = 属性有效值层运行时清单）─────────
// 与 modify_stat/modify_channel 不同：那两者的落点是**战斗本地**（combatant.stats/channels），
// 本动作的落点是**角色实体**——经 recalcStats 的签名增量同步写进实体字段 attr_mods
// （纯数据字段 → 随存档往返），战斗结束按 combat: 前缀整批清除。
//
// 生产接线：mod-loader 在 loadMod 里 configureAttributeEval({ definitions: mod.attributes })。
// 本文件不跑 loadMod（用假 mod），故在此显式注入夹具属性定义——否则有效值管线的闸门不认该属性，
// 修正条目会被静默忽略（读到的恒是裸值），测试会以"实现没生效"的假象红。
const PROBE_ATTR = '修正测试值'

describe('combat-base 属性修正（modify_attribute）', () => {
  beforeEach(async () => {
    await boot()
    configureAttributeEval({ definitions: { [PROBE_ATTR]: {} } })
    setEntityAttr(entitySystem.get('character', 'player'), PROBE_ATTR, 100)
  })

  const probe = (): any => entitySystem.get('character', 'player') as any
  /** 有效值（裸值 → 派生 → 声明式 + 运行时修正） */
  const eff = (): number => getEntityAttr(probe(), PROBE_ATTR)
  /** 裸值（基础值域——本任务第一验收点：全程分毫不动） */
  const raw = (): number => readRawAttr(probe(), PROBE_ATTR)
  /** 实体上的运行时修正清单 */
  const mods = (): any[] => probe().attr_mods ?? []
  const addEffect = (entityId: string, partial: any): void => {
    apiSystem.callSync('combat', 'addZoneEffect', entityId, { ...partial, duration: partial.duration ?? 'battle' })
  }
  const addDef = (id: string, def: any): void => { (modLoader.getMod() as any).battleEffects[id] = def }

  it('常驻修正进有效值层（基础值不动）；战斗结束按 combat: 前缀整批清除', async () => {
    await startBattle(() => 0.9)
    addEffect('player', { id: '测试增益', action: 'modify_attribute', attr: PROBE_ATTR, value: { flat: 20 } })
    expect(eff()).toBe(120)                       // 100 + 20
    expect(raw()).toBe(100)                       // 基础值域全程不动（spec §2.1 的雷）
    expect(mods().length).toBe(1)
    expect(mods()[0].id).toBe('combat:测试增益')   // 命名空间前缀 = 清理与顶替的作用域
    expect(mods()[0].attr).toBe(PROBE_ATTR)

    await apiSystem.call('combat', 'end', '', 'fled')
    expect(eff()).toBe(100)                       // 回落
    expect(raw()).toBe(100)
    expect(mods()).toEqual([])                    // 不留残骸（否则随存档往返变永久增益）
  })

  it('效果中途到期 → 修正随之撤销（不必等到战斗结束）', async () => {
    await startBattle(() => 0.9)
    await apiSystem.call('combat', 'registerHook', 'float_mul', () => 1.0)
    addEffect('player', { id: '短效增益', action: 'modify_attribute', attr: PROBE_ATTR, value: { flat: 20 }, duration: { turns: 1 } })
    expect(eff()).toBe(120)

    await playerAct(null)                         // 走完本轮 → 下一轮 turn_start 到期（tickDurations → recalcStats）
    expect(eff()).toBe(100)
    expect(raw()).toBe(100)
    expect(mods()).toEqual([])
  })

  it('库条目 attr 贯通：resolveEffectRef → makeInst → 清单（漏拷 def.attr 即红）', async () => {
    addDef('测试属性增益', {
      name: '测试属性增益', delivery: 'zone', target: 'self',
      action: 'modify_attribute', attr: PROBE_ATTR, value: { flat: 20 },
      duration: 'battle', category: 'buff',
    })
    // ① 解析层：spec 是显式逐字段构造的，attr 必须被显式拷过去（漏了 = 库条目写法静默失效）
    const resolved = apiSystem.callSync('combat', 'resolveEffect', { effect: '测试属性增益' }) as any
    expect(resolved.ok).toBe(true)
    expect(resolved.entry.spec.attr).toBe(PROBE_ATTR)

    // ② 实例层 + 同步层：库条目 → makeInst → 实体清单 → 有效值
    await startBattle(() => 0.9)
    await apiSystem.call('combat', 'mountEffect', 'player', '测试属性增益', { sourceId: 'player' })
    const inst = (apiSystem.callSync('combat', 'getCombatState').combatants.player.effects as any[])
      .find(e => e.id === '测试属性增益')
    expect(inst).toBeDefined()
    expect(eff()).toBe(120)
    expect(raw()).toBe(100)

    await apiSystem.call('combat', 'end', '', 'fled')
    expect(eff()).toBe(100)
    expect(mods()).toEqual([])
  })

  it('签名守卫：无关键条目不重写清单（同对象），数值真变才重写', async () => {
    addDef('测试属性增益', {
      name: '测试属性增益', delivery: 'zone', target: 'self',
      action: 'modify_attribute', attr: PROBE_ATTR, value: { flat: 20 }, duration: 'battle',
    })
    await startBattle(() => 0.9)
    await apiSystem.call('combat', 'mountEffect', 'player', '测试属性增益', { sourceId: 'player' })
    expect(eff()).toBe(120)
    const first = mods()[0]

    // 无关的常驻统计条目 → recalcStats 重算，但本场属性修正签名未变 → 不写不 bump（同一对象）
    addEffect('player', { id: '无关统计', action: 'modify_stat', stat: 'damage_out', value: { percent: 0.1 } })
    expect(mods().length).toBe(1)
    expect(mods()[0]).toBe(first)

    // 数值真变（refresh 覆盖）→ 签名变 → 先清本场旧条目再按新值登记
    await apiSystem.call('combat', 'mountEffect', 'player', '测试属性增益', { sourceId: 'player', value: { flat: 35, percent: 0 } })
    expect(eff()).toBe(135)
    expect(mods().length).toBe(1)
    expect(mods()[0]).not.toBe(first)
    expect(raw()).toBe(100)
  })

  it('库条目校验：modify_attribute 缺 attr / attr 未定义 → 加载期 error（合法条目零误报）', () => {
    ;(modLoader.getMod() as any).attributes = { [PROBE_ATTR]: { type: 'number' } }
    addDef('合法增益', {
      name: '合法增益', delivery: 'zone', target: 'self',
      action: 'modify_attribute', attr: PROBE_ATTR, value: { flat: 20 }, duration: 'battle',
    })
    expect(validateBattleEffectDefs()).toBe(0)

    addDef('缺字段', {
      name: '缺字段', delivery: 'zone', target: 'self',
      action: 'modify_attribute', value: { flat: 20 }, duration: 'battle',
    })
    addDef('错属性', {
      name: '错属性', delivery: 'zone', target: 'self',
      action: 'modify_attribute', attr: '不存在的属性', value: { flat: 20 }, duration: 'battle',
    })
    expect(validateBattleEffectDefs()).toBe(2)
    const errs = errorReporter.getErrors()
    expect(errs.some(e => e.message.includes("'缺字段'") && e.message.includes('attr'))).toBe(true)
    expect(errs.some(e => e.message.includes("'错属性'") && e.message.includes('不存在的属性'))).toBe(true)
  })
})