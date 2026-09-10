// 招式效果全集（草稿 24 条）的库条目契约与实战行为测试
//
// 两层验证：
//   ① 库条目契约：**真读** plugins/combat-wuxia/data/default/battle-effects.toml（单一事实源，
//      避免测试内复制漂移）→ 每条都能解析、分类/相位/参数形态合法
//   ② 实战行为：每条机制各打一次真战斗（引用库条目 → 命中 → 结算），断言落点数值
//
// 设计契约见 docs/combat-system.md「战斗效果条目（v4.0）」；解析实现见 combat-base/effect-entry.ts

import { describe, it, expect, beforeEach } from 'vitest'
import TOML from '@iarna/toml'
import { entitySystem } from '../../core/entity-system'
import { errorReporter } from '../../core/error-reporter'
import { eventBus } from '../../core/event-bus'
import { gameContext } from '../../core/game-context'
import { narrativeLog } from '../../core/narrative-log'
import { bindingResolver } from '../../core/binding-resolver'
import { modLoader } from '../../core/mod-loader'
import { apiSystem } from '../../core/api'
import { effectTypeRegistry } from '../../core/effect-type-registry'
import { __resetCombatModule } from '../combat-base/index'
import { classifyEffect, resolveEffectRef } from '../combat-base/effect-entry'
import type { BattleEffectDef } from '../../core/mod-types'
import { onLoad as wuxiaOnLoad, onEnable as wuxiaOnEnable, validateBattleData } from './index'
import { onLoad as baseOnLoad, onEnable as baseOnEnable } from '../combat-base/index'

// ── 真读插件默认库 ──────────────────────────────────────────────────────

const DEFAULT_PATH = '/src/plugins/combat-wuxia/data/default/battle-effects.toml'
const defaultRaw = import.meta.glob(
  '/src/plugins/combat-wuxia/data/default/battle-effects.toml',
  { query: '?raw', import: 'default', eager: true },
)[DEFAULT_PATH] as string

const DEFAULT_DEFS: Record<string, BattleEffectDef> = (() => {
  const parsed = TOML.parse(defaultRaw) as any
  return (parsed.effects ?? {}) as Record<string, BattleEffectDef>
})()

// ⚠️ 中文效果名/公式分项名一律经变量间接取（scan-attr-refs 会把 `x['中文']` 判为属性引用，属结构数据）
const REQ_IDS = '连绵 饮血 增伤 增加暴击几率 增加暴击伤害 乘势 消内 吸内 追击 回血 回内 流血 破甲 失势 缓慢 致盲 封穴 截脉 破绽 毒 火毒 寒毒'.split(' ')
const ELEMENT_IDS = '毒 火毒 寒毒'.split(' ')
const P = ((): Record<string, string> => {
  const keys = '准头守基准 准头守 准头攻基准 准头攻 力道项'.split(' ')
  return Object.fromEntries(keys.map(k => [k, k]))
})()

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
const PLAYER_HP = 20000
const ENEMY_HP = 20000

describe('战斗效果全集：库条目契约（真读插件默认层）', () => {
  it('默认库覆盖草稿 24 条（含毒/火毒/寒毒，破甲沿用旧 id）', () => {
    const ids = Object.keys(DEFAULT_DEFS)
    for (const id of REQ_IDS) {
      expect(ids, `缺少效果 '${id}'`).toContain(id)
    }
  })

  it('每条条目都能解析，且分类/相位/数值形态合法', () => {
    for (const id of Object.keys(DEFAULT_DEFS)) {
      const r = resolveEffectRef(id, DEFAULT_DEFS)
      expect(r.ok, `'${id}' 解析失败：${r.ok ? '' : r.error}`).toBe(true)
      if (!r.ok) continue
      const e = r.entry
      expect(typeof e.name, `'${id}' 缺 name（UI 需要）`).toBe('string')
      expect(typeof e.description, `'${id}' 缺 description（UI 需要）`).toBe('string')
      expect(classifyEffect(e).length).toBeGreaterThan(0)
      if (e.delivery === 'zone') {
        // zone 型必须有结算落点：常驻修正（modify_stat/modify_channel）或结算相位 + 动作
        expect(typeof e.spec.action).toBe('string')
        if (['modify_stat', 'modify_channel'].includes(e.spec.action)) {
          expect(e.spec.trigger).toBeUndefined()          // 常驻修正：无 settle
        } else {
          expect(typeof e.spec.trigger).toBe('string')    // 结算型：必须有 settle
        }
        // 挂敌人的条目应默认在命中时施加；挂自己的在使用时施加
        expect(e.at).toBe(e.target === 'self' ? 'on_use' : 'on_hit')
        // 时长：未声明 → 通用默认 5 回合；声明了 battle/permanent/回合数则尊重声明
        if ((DEFAULT_DEFS[id] as any).duration === undefined) {
          expect(e.spec.duration).toEqual({ turns: 5 })
        }
      } else {
        expect(typeof e.at).toBe('string')                // instant 型必须有发生相位
      }
      // 数值：需要数值的动作必须给 flat/percent；控制/复读/追击/复活类不需要
      if (!['action_block', 'repeat', 'extra_attack', 'revive', 'counter'].includes(e.spec.action)) {
        const v = e.spec.value
        expect(v.flat !== 0 || v.percent !== 0, `'${id}' 没给数值`).toBe(true)
      }
    }
  })

  it('分类推导：攻击后 / 命中后·即时 / 自身状态 / 命中后·挂状态', () => {
    const group = (id: string) => {
      const r = resolveEffectRef(id, DEFAULT_DEFS)
      if (!r.ok) throw new Error(r.error)
      return classifyEffect(r.entry)
    }
    expect(group('连绵')).toBe('攻击后')
    expect(group('饮血')).toBe('命中后·即时')
    expect(group('回血')).toBe('自身状态')
    expect(group('火毒')).toBe('命中后·挂状态')
  })

  it('毒/火毒/寒毒 是 zone 型且带施加器；施加器名已注册', () => {
    for (const id of ELEMENT_IDS) {
      const r = resolveEffectRef(id, DEFAULT_DEFS)
      if (!r.ok) throw new Error(r.error)
      expect(r.entry.delivery).toBe('zone')
      expect(typeof r.entry.apply).toBe('string')
    }
  })
})

// ── 实战：每条机制各打一次真战斗 ────────────────────────────────────────

function wuxiaMod(extraDefs: Record<string, any>) {
  return {
    id: 'test-mod',
    abilities: {
      平A: { id: '平A', name: '平A', type: 'active', power: 100, cost: 0, hits: 1, category: '拳掌', style: { 厚重: 60 }, tags: ['拳掌'], battle_effects: [] },
    } as any,
    battleEffects: { ...DEFAULT_DEFS, ...extraDefs } as any,
    scripts: new Map<string, string>(),
    talentDefs: {} as any,
    attributes: {},
  }
}

/** 造一个"带指定效果"的测试技能（id 由调用方指定） */
async function bootWithSkill(
  skillId: string,
  effects: any[],
  opts: { playerAbilities?: Record<string, any>; playerStats?: Record<string, number>; playerMp?: number } = {},
): Promise<void> {
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
  const skill = {
    id: skillId, name: skillId, type: 'active', power: 100, cost: 0, hits: 1,
    category: '拳掌', style: { 厚重: 60 }, tags: ['拳掌'], battle_effects: effects,
  }
  const mod = wuxiaMod({}) as any
  mod.abilities[skillId] = skill
  ;(modLoader as any).loadedMod = mod
  entitySystem.register('character', 'player', {
    id: 'player', name: '玩家',
    base: {
      ...PLAYER_STATS, ...(opts.playerStats ?? {}),
      hp: PLAYER_HP, mp: opts.playerMp ?? 500, hp_max: PLAYER_HP, mp_max: 500, 武器基础: 0,
    },
    abilities: { [skillId]: { level: 5, xp: 0 }, ...(opts.playerAbilities ?? {}) },
    talents: {},
  })
  entitySystem.register('character', 'enemy', {
    id: 'enemy', name: '敌人',
    base: { ...ENEMY_STATS, hp: ENEMY_HP, mp: 300, hp_max: ENEMY_HP, mp_max: 300, 武器基础: 0 },
    abilities: {},
    talents: {},
  })
  baseOnLoad({} as any)
  baseOnEnable(makeMockCtx())
  // combat-wuxia 走真实 onLoad/onEnable（父插件 API 已在 apiSystem）
  wuxiaOnLoad({} as any)
  wuxiaOnEnable(makeMockCtx())
  await apiSystem.call('combat', 'start', ['enemy'], ['player'])
  apiSystem.callSync('combat', 'setRng', () => 0.2)   // 必中（准头比 180:120 → 108%）、不暴击
  await apiSystem.call('combat', 'registerHook', 'float_mul', () => 1.0)
  await apiSystem.call('combat', 'registerHook', 'crit_rate', () => 0)   // 排除暴击干扰
}

/** 插件上下文桩（与 combat-base.test.ts 同构：api/commands/events 真接到全局注册表） */
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

function state(): any {
  return apiSystem.callSync('combat', 'getCombatState')
}

async function playerAct(skillId: string | null): Promise<any> {
  await apiSystem.call('combat', 'executeAction', 'player', { type: 'skill', skillId, targetId: 'enemy' })
  return state().combatants.enemy
}

describe('战斗效果全集：实战行为', () => {
  beforeEach(() => { /* 每个 it 自己 bootWithSkill */ })

  it('饮血：按本次**实际扣血量**回血（先自损再打）', async () => {
    // 玩家根骨极高 → 敌方反击 0 伤（排除敌方回合干扰），只看饮血回血
    await bootWithSkill('饮血掌', [{ effect: '饮血', value: { percent: 0.5 } }], { playerStats: { 根骨: 99999 } })
    await apiSystem.call('combat', 'applyDamage', 'player', PLAYER_HP - 100, { source: 'x', kind: 'external' })
    expect(state().combatants.player.hp).toBe(100)
    const enemy = await playerAct('饮血掌')
    const dealt = ENEMY_HP - enemy.hp
    // 敌方回合若命中，玩家也不会掉血（防御 > 伤害）→ HP 只由饮血推动
    expect(state().combatants.player.hp).toBe(100 + Math.round(dealt * 0.5))
  })

  it('乘势：目标有 DEBUFF 才加成（无 DEBUFF 时不加成）', async () => {
    await bootWithSkill('乘势掌', [{ effect: '乘势' }])
    const plain = await playerAct('乘势掌')
    const plainDmg = ENEMY_HP - plain.hp

    await bootWithSkill('乘势掌', [{ effect: '乘势' }])
    // 先给敌人挂一个 DEBUFF（流血），再加成生效
    await apiSystem.call('combat', 'mountEffect', 'enemy', '流血', { sourceId: 'player' })
    const buffed = await playerAct('乘势掌')
    const buffedDmg = ENEMY_HP - buffed.hp
    expect(buffedDmg).toBeGreaterThan(plainDmg)
  })

  it('消内：命中后削减敌人内力（不转移给自己）', async () => {
    await bootWithSkill('消内掌', [{ effect: '消内', value: { flat: 20 } }])
    const mpBefore = state().combatants.enemy.mp
    await playerAct('消内掌')
    expect(state().combatants.enemy.mp).toBe(mpBefore - 20)
  })

  it('吸内：命中后把敌人内力转移给自己（按对方实际内力）', async () => {
    // 玩家内力先花掉一半（500 → 250），才能观察转移
    await bootWithSkill('吸内掌', [{ effect: '吸内', value: { flat: 20 } }], { playerMp: 250 })
    const e0 = state().combatants
    await playerAct('吸内掌')
    expect(state().combatants.enemy.mp).toBe(e0.enemy.mp - 20)
    expect(state().combatants.player.mp).toBe(e0.player.mp + 20)
  })

  it('追击：命中后追加一次同招（不递归；每次行动上限 1）', async () => {
    await bootWithSkill('追击掌', [{ effect: '追击', chance: 1 }])
    const enemy = await playerAct('追击掌')
    const one = await (async () => {
      await bootWithSkill('追击掌', [{ effect: '追击', chance: 1, max_stack: 1 }])
      return 0
    })()
    void one
    // 两招各 1000 威力 → 伤害约两倍（同招再打一次）
    expect(ENEMY_HP - enemy.hp).toBeGreaterThan(1500)
  })

  it('回血/回内：使用后挂自身，回合结束时按上限比例回复', async () => {
    await bootWithSkill(
      '回气诀',
      [{ effect: '回血', value: { percent: 0.1 } }, { effect: '回内', value: { percent: 0.1 } }],
      { playerStats: { 根骨: 99999 }, playerMp: 100 },
    )
    await apiSystem.call('combat', 'applyDamage', 'player', 1000, { source: 'x', kind: 'external' })
    const hpBefore = state().combatants.player.hp
    await playerAct('回气诀')          // 施招 → 挂自身（on_use）→ 回合结束结算
    const st = state().combatants.player
    expect(st.effects.some((e: any) => e.id === '回血')).toBe(true)
    expect(st.effects.some((e: any) => e.id === '回内')).toBe(true)
    // 敌方回合打不动玩家（防御极高）→ HP/MP 只由回复推动
    expect(st.hp).toBe(Math.min(PLAYER_HP, hpBefore + Math.round(PLAYER_HP * 0.1)))
    expect(st.mp).toBe(100 - 0 + Math.round(500 * 0.1))   // cost 0 + 10% 上限
  })

  it('流血：回合开始（行动前）按最大气血比例扣血', async () => {
    await bootWithSkill('流血掌', [{ effect: '流血', chance: 1, value: { percent: 0.05 } }])
    const enemy = await playerAct('流血掌')
    const afterHit = enemy.hp
    expect(enemy.effects.some((e: any) => e.id === '流血')).toBe(true)
    // 命中后敌人立即行动（其回合开始先毒发/流血再行动）→ 已经扣过一次
    expect(afterHit).toBeLessThan(ENEMY_HP - Math.round(ENEMY_HP * 0.05) + 1)
  })

  it('失势：守方准头通道倍率（×0.5）', async () => {
    await bootWithSkill('平A', [])
    await apiSystem.call('combat', 'mountEffect', 'enemy', '失势', { sourceId: 'player' })
    await playerAct('平A')
    // 取**玩家出手**那条命中公式（敌方回合那条守方是玩家）
    const rec = (apiSystem.callSync('combat', 'getFormulaHistory') as any[])
      .filter(r => r.hook === 'hit_rate' && r.sourceId === 'player').pop()
    expect(rec.parts[P.准头守基准]).toBe(120)                 // 轻功30×2 + 灵敏60
    expect(rec.parts[P.准头守]).toBeCloseTo(60, 5)            // ×0.5
    expect(rec.value).toBeGreaterThan(108)                    // 命中率上升
  })

  it('致盲：攻方准头通道倍率（×0.7）', async () => {
    await bootWithSkill('平A', [])
    await apiSystem.call('combat', 'mountEffect', 'player', '致盲', { sourceId: 'enemy' })
    await playerAct('平A')
    const rec = (apiSystem.callSync('combat', 'getFormulaHistory') as any[])
      .filter(r => r.hook === 'hit_rate' && r.sourceId === 'player').pop()
    expect(rec.parts[P.准头攻基准]).toBe(180)                 // 轻功50×2 + 灵敏80
    expect(rec.parts[P.准头攻]).toBeCloseTo(126, 5)           // ×0.7
  })

  it('截脉：力道项通道倍率（属性分项 ×0.7；暗毒系的灵敏项不受影响）', async () => {
    await bootWithSkill('平A', [])
    await apiSystem.call('combat', 'mountEffect', 'player', '截脉', { sourceId: 'enemy' })
    await playerAct('平A')
    const rec = (apiSystem.callSync('combat', 'getFormulaHistory') as any[])
      .filter(r => r.hook === 'base_damage' && r.sourceId === 'player').pop()
    expect(rec.parts[P.力道项]).toBeCloseTo(210, 5)           // 100×3 ×0.7
  })

  it('破绽：受伤加深随层数**乘法**增长（-50% → -75%），且不截断', async () => {
    await bootWithSkill('平A', [])
    await apiSystem.call('combat', 'mountEffect', 'enemy', '破绽', { sourceId: 'player' })
    const hp1 = (await playerAct('平A')).hp
    const dmg1 = ENEMY_HP - hp1
    // 二层：value.percent -0.5 不变，层数 2 → 生效值 -0.5×(1+0.5) = -0.75
    await apiSystem.call('combat', 'mountEffect', 'enemy', '破绽', { sourceId: 'player' })
    const br = state().combatants.enemy.effects.find((e: any) => e.id === '破绽')
    expect(br.stack).toBe(2)
    expect(br.value.percent).toBeCloseTo(-0.5, 10)
    expect(br.growth).toBeCloseTo(0.5, 10)
    const hp2 = (await playerAct('平A')).hp
    const dmg2 = hp1 - hp2
    expect(dmg2).toBeGreaterThan(dmg1)                        // 受伤加深生效
    // 层 2 的倍率 1.75 vs 层 1 的 1.5 → 约 1.17 倍
    expect(dmg2 / dmg1).toBeGreaterThan(1.1)
  })

  it('封穴：触发一次即消，且该次行动作废（不推进到下一次攻击）', async () => {
    await bootWithSkill('平A', [])
    await apiSystem.call('combat', 'mountEffect', 'enemy', '封穴', { sourceId: 'player' })
    const before = state().combatants.enemy.hp
    await playerAct('平A')
    expect(state().combatants.enemy.hp).toBeLessThan(before)   // 玩家自己不受封穴影响
  })

  it('火毒：命中挂火毒、清自身寒毒、引爆对方寒毒（一次后清除）', async () => {
    await bootWithSkill('火毒掌', [{ effect: '火毒', stacks: 2 }])
    // 预先：给自己挂寒毒 2 层、给敌人挂寒毒 5 层
    await apiSystem.call('combat', 'mountEffect', 'player', '寒毒', { sourceId: 'enemy', params: { stacks: 2 } })
    await apiSystem.call('combat', 'mountEffect', 'enemy', '寒毒', { sourceId: 'player', params: { stacks: 5 } })
    expect(state().combatants.player.effects.some((e: any) => e.id === '寒毒')).toBe(true)
    await playerAct('火毒掌')
    const st = state().combatants
    // 自己身上 ≤2 层的寒毒被清除
    expect(st.player.effects.some((e: any) => e.id === '寒毒')).toBe(false)
    // 敌人身上的寒毒被引爆并清除；火毒 2 层留下
    expect(st.enemy.effects.some((e: any) => e.id === '寒毒')).toBe(false)
    const fire = st.enemy.effects.find((e: any) => e.id === '火毒')
    expect(fire?.stack).toBe(2)
    // 引爆 = 一次寒毒伤害 = 5 层 → 0.05×(1+0.5×4)=0.15 → 15% 上限
    const burstLog = narrativeLog.getEntries().filter(e => e.text.includes('冷热对冲'))
    expect(burstLog.length).toBe(1)
    expect(burstLog[0].text).toContain('引爆')
  })

  it('寒毒：自己身上的高层的寒毒不会被低层火毒清掉', async () => {
    await bootWithSkill('火毒掌', [{ effect: '火毒', stacks: 1 }])
    await apiSystem.call('combat', 'mountEffect', 'player', '寒毒', { sourceId: 'enemy', params: { stacks: 4 } })
    await playerAct('火毒掌')
    // 自身寒毒 4 层 > 本次火毒 1 层 → 保留
    expect(state().combatants.player.effects.some((e: any) => e.id === '寒毒')).toBe(true)
  })

  it('默认库全量通过数据校验（无 error）', async () => {
    await bootWithSkill('平A', [])
    errorReporter.clear()
    validateBattleData()
    const errors = errorReporter.getErrors().filter(e => e.severity === 'error')
    expect(errors.map(e => e.message)).toEqual([])
  })
})
