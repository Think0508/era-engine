// 注释：combat-wuxia 插件——武侠回合制战斗（合同 v1.0 实现 / 2026-09-11 公式修订 v1.1）
// extends combat-base：覆盖公式钩子（initiative/hit_rate/base_damage/crit_rate/crit_mul/float_mul/defense_value）
// + combatant_init 编译钩子（被动技能/战斗天赋 → 效果区）+ 动态技能指令 + 数据校验 + 测试指令
//
// 公式（合同 v1.1 冻结；实现见 ./formula.ts）：
//   标准系（拳掌/指腿/刀剑/奇兵）：
//     base = (力道×3 + 武功威力(L) + 武器基础) × (1 + 武功系数/1000) × 风格系数 × 精通系数
//            + 当前内力/25 + 其他加成
//   暗毒系：同式以 灵敏×3 代 力道×3
//   气功/异术：per-skill 沙箱脚本（scripts/damage_<skillId>.js，只替换"基础伤害数字"）
//   风格系数 = (轻²+厚²+巧²)/(轻+厚+巧)；得分 = (1+技能值/1000)×(1+人物值/50)；技能缺省 0 → 得分 1×(1+人物/50)
//   精通系数 = 1 + (人物轻灵+人物厚重+人物巧技)/250（单次乘法）
//   先攻 = 轻功系数
//   命中率 = 90 + (准头比率−0.5)×180 + 攻方命中 − 守方闪避 + 通道（不截断：>100 必中 / <0 必 Miss）
//           准头 = 轻功系数×2 + 灵敏；准头比率 = 攻方准头/(攻方准头+守方准头)
//   暴击 = 福缘/5 + 修正（%点）；倍率 1.5 + 修正；浮动 ±10%
//   防御 = 根骨×0.8 + 定力×0.5（再 ×(1+defense_mult) 并套「防御」通道；最终伤害扣减；伤害<防御=0）
//   多段：武功威力(总)/N 每段，每段完整管线（力道/武器/内力项按段全量重复），每段加当前内力/25
//   中间量通道（可被效果/天赋加值，见 ./formula.ts 的 CH）：
//     先攻 / 命中率 / 闪避率 / 浮动系数 / 防御 / 武功威力 / 风格系数 / 其他加成

import type { PluginContext } from '../../core/types'
import { entitySystem } from '../../core/entity-system'
import { modLoader } from '../../core/mod-loader'
import { narrativeLog } from '../../core/narrative-log'
import { errorReporter } from '../../core/error-reporter'
import { apiSystem } from '../../core/api'
import { eventBus } from '../../core/event-bus'
import { bindingResolver } from '../../core/binding-resolver'
import { gameContext } from '../../core/game-context'
import { getEntityAttr } from '../../core/entity-utils'
import type { CommandDef } from '../../core/command-registry'
import {
  CH, WUXIA_CHANNEL_DEFS, applyChannel, channelOf, computeHitRate, computeStandardDamage,
  computeDefaultAttack, defenseBase, powerCurve, computePoisonBase,
  applyPoisonMitigation, POISON_M_RATE,
  SKILL_STYLE_KEYS,
} from './formula'
import type { ChannelBag, CharStyleValues } from './formula'
import { displayNameOf, resolveEffectRef, scaleValue, valueAmount, POINT_STATS, STAT_KEYS } from '../combat-base/effect-entry'
import type { ResolvedEffect } from '../combat-base/effect-entry'

// ── 常量与面板 ──────────────────────────────────────────────────────────

// 编译钩子入参（结构对齐 combat-base 的 Combatant/CombatScene，不跨层 import）
interface CompileCombatant {
  entityId: string
  hp: number
  maxHp: number
  mp: number
  maxMp: number
  dead: boolean
  stats: any
  zone: any[]
  talentDamageMods: any[]
  talentChannelMods: any[]
  consumedEffects: string[]
}
interface CompileScene {
  combatants: Map<string, CompileCombatant>
  enemies: string[]
  allies: string[]
  rng: () => number
}

const WUXIA_CATEGORIES = ['拳掌', '指腿', '刀剑', '奇兵', '暗毒', '气功', '异术'] as const
export type WuxiaCategory = (typeof WUXIA_CATEGORIES)[number]

// 系别 → 系别系数属性名（伤害公式 (1+系数/1000)）
const CATEGORY_COEFF_ATTR: Record<string, string> = {
  拳掌: '拳掌系数',
  指腿: '指腿系数',
  刀剑: '刀剑系数',
  奇兵: '奇兵系数',
  暗毒: '暗毒系数',
}

const STYLE_KEYS = ['轻灵', '厚重', '巧技'] as const

// 六维/风格/系数读取（wuxia 专属属性名——公式走代码钩子，合同确认）
function readNum(entityId: string, attr: string): number {
  const char = entitySystem.get('character', entityId) as any
  if (!char) return 0
  const v = getEntityAttr(char, attr)
  return typeof v === 'number' ? v : 0
}

export interface WuxiaSnapshot {
  str: number
  con: number
  agi: number
  fort: number
  will: number
  int: number
  coefficients: Record<string, number>
  style: Record<string, number>
  mp: number
  mpMax: number
  weaponBase: number
  defense: number
}

function getSnapshot(charId: string): WuxiaSnapshot {
  const mp = bindingResolver.get(charId, 'mp')
  const mpMax = bindingResolver.get(charId, 'mp_max')
  const coeff: Record<string, number> = {}
  for (const k of ['拳掌系数', '指腿系数', '刀剑系数', '奇兵系数', '暗毒系数', '轻功系数']) {
    coeff[k] = readNum(charId, k)
  }
  const style: Record<string, number> = {}
  for (const k of STYLE_KEYS) style[k] = readNum(charId, k)
  return {
    str: readNum(charId, '力道'),
    con: readNum(charId, '根骨'),
    agi: readNum(charId, '灵敏'),
    fort: readNum(charId, '福缘'),
    will: readNum(charId, '定力'),
    int: readNum(charId, '悟性'),
    coefficients: coeff,
    style,
    mp: typeof mp === 'number' ? mp : 0,
    mpMax: typeof mpMax === 'number' && mpMax > 0 ? mpMax : (typeof mp === 'number' ? mp : 0),
    weaponBase: bindingResolver.get(charId, 'weapon_base') ?? 0,
    defense: defenseBase(readNum(charId, '根骨'), readNum(charId, '定力')),
  }
}

// 威力曲线/风格系数/精通系数/命中与伤害公式一律走 ./formula.ts 纯函数（本文件只做取值与接线）

// ── onLoad ──────────────────────────────────────────────────────────────

export function onLoad(_ctx: PluginContext): void {
  // 无提前注册
}

// ── onEnable ────────────────────────────────────────────────────────────

let pluginCtx: PluginContext | null = null
const registeredSkillCmdIds = new Set<string>()
// 测试指令注入的临时数据（战斗结束清理）
const tempSkills: string[] = []

export function onEnable(ctx: PluginContext): void {
  pluginCtx = ctx
  // 父插件 combat API：优先 ctx.parent（extends 镜像），**逐方法**回退 apiSystem 命名空间
  // （plugin-manager 的 parent.api 是父插件最近一次 register 的裸方法对象，未必含全部 combat 方法）
  const parentCombat = ctx.parent?.api?.combat as Record<string, any> | undefined
  const combatMethod = (name: string): Function => {
    const fromParent = parentCombat?.[name]
    if (typeof fromParent === 'function') return fromParent.bind(parentCombat)
    return (...args: any[]) => apiSystem.callSync('combat', name, ...args)
  }
  if (!apiSystem.has('combat', 'registerHook') && typeof parentCombat?.registerHook !== 'function') {
    errorReporter.report({
      source: 'combat-wuxia', severity: 'error',
      message: 'combat-base 未注册 combat API（extends 链断裂），combat-wuxia 公式未接线',
    })
    return
  }
  const registerHook = combatMethod('registerHook') as (name: string, handler: any) => void
  const combatApi = {
    registerAction: combatMethod('registerAction'),
    registerApply: combatMethod('registerApply'),
  }

  // ── 公式通道注册（中间量；mod 数据按名引用，combat-base 只存不解释）──
  for (const def of WUXIA_CHANNEL_DEFS) {
    try {
      apiSystem.callSync('combat', 'registerChannel', { ...def, source: 'combat-wuxia' })
    } catch (err) {
      errorReporter.report({
        source: 'combat-wuxia', severity: 'warning',
        message: `公式通道 '${def.id}' 注册失败：${err instanceof Error ? err.message : String(err)}`,
      })
    }
  }

  // ── 公式钩子覆盖（override 型，子插件独占）──
  // 先攻 = 轻功系数（通道「先攻」可加成）
  registerHook('initiative', (hctx: any) => {
    const base = readNum(hctx.sourceId, '轻功系数')
    const bag: ChannelBag | undefined = hctx.channels?.source
    const value = applyChannel(base, channelOf(bag, CH.INIT))
    return { value, parts: { 轻功系数: base, 先攻: value } }
  })
  // 命中率 = 90 + (准头比率−0.5)×180 + 攻方命中 − 守方闪避 + 通道（不截断）
  registerHook('hit_rate', (hctx: any) => {
    const channels = hctx.channels ?? { source: {}, target: {} }
    const result = computeHitRate({
      attacker: {
        qinggong: readNum(hctx.source.entityId, '轻功系数'),
        agi: readNum(hctx.source.entityId, '灵敏'),
        hitBonus: hctx.source.stats?.hit_bonus ?? 0,
      },
      defender: {
        qinggong: readNum(hctx.target.entityId, '轻功系数'),
        agi: readNum(hctx.target.entityId, '灵敏'),
        dodgeBonus: hctx.target.stats?.dodge_bonus ?? 0,
      },
      channels,
    })
    return result
  })
  registerHook('base_damage', wuxiaBaseDamage)
  registerHook('crit_rate', (hctx: any) => {
    return readNum(hctx.source.entityId, '福缘') / 5 + (hctx.source.stats?.crit_rate ?? 0)
  })
  registerHook('crit_mul', (hctx: any) => 1.5 + (hctx.source.stats?.crit_mul ?? 0))
  // 浮动：0.9–1.1 随机；通道「浮动系数」可 set 1.0（稳定）/ percent 放大
  registerHook('float_mul', (hctx: any) => {
    const base = 0.9 + (hctx.combat?.rng ?? Math.random)() * 0.2
    const bag: ChannelBag | undefined = hctx.channels?.source
    const value = applyChannel(base, channelOf(bag, CH.FLOAT))
    return value
  })
  // 攻击技判定：显式 attack=false（增益/架势技）｜有 power（标准系）｜
  // 气功/异术且存在伤害脚本（脚本即伤害来源，无 power 字段）
  registerHook('is_attack_skill', (hctx: any) => {
    const d = hctx.skill
    if (!d) return false
    if (typeof d.attack === 'boolean') return d.attack
    if (typeof d.power === 'number') return true
    if (d.category === '气功' || d.category === '异术') {
      return modLoader.getMod()?.scripts?.has(`damage_${d.id}.js`) ?? false
    }
    return false
  })
  // 防御值 = (根骨×0.8 + 定力×0.5) × (1 + defense_mult) → 通道「防御」(set 0 = 无视防御)
  registerHook('defense_value', (hctx: any) => {
    const base = defenseBase(readNum(hctx.target.entityId, '根骨'), readNum(hctx.target.entityId, '定力'))
    const mult = (hctx.target.stats?.defense_mult ?? 0)
    const bag: ChannelBag | undefined = hctx.channels?.target
    const withMult = base * (1 + mult)
    const value = applyChannel(withMult, channelOf(bag, CH.DEFENSE))
    return {
      value: Math.max(0, Math.round(value)),
      parts: { 根骨定力基准: base, 防御加成: mult, 防御: Math.max(0, Math.round(value)) },
    }
  })

  // ── 编译钩子（链式）：被动技能 + 战斗天赋 → 效果区 ──
  registerHook('combatant_init', compileCombatant)
  // ── 动态技能指令（玩家/队友回合挂载，回合结束/战斗结束卸载）──
  registerHook('turn_start', syncSkillCommands)
  registerHook('turn_end', clearSkillCommands)
  ctx.events.on('combat:end', () => clearSkillCommands())

  // ── 毒 / 冰火：施加器（zone 型条目的 apply 字段引用它们）─────────────────
  // apply_poison ：命中后算 M（施加时快照）再挂毒状态（层数由词条 stacks 决定）
  // poison_dot   ：毒状态的结算动作（该角色行动前发作）
  // apply_element：火毒/寒毒——挂本元素 + 清自己对立毒（层数 ≤ 本次）+ 引爆对方对立毒
  combatApi.registerApply('apply_poison', applyPoisonApply)
  combatApi.registerApply('apply_element', applyElementApply)
  combatApi.registerAction('poison_dot', poisonDotAction)

  // ── API ──
  ctx.api.register('combat-wuxia', {
    getSnapshot: (charId: string): WuxiaSnapshot => getSnapshot(charId),
    // 可用主动技能（wuxia 七系过滤 + 内力过滤，供战斗 UI/指令用）
    getUsableSkills: (charId: string): { id: string; name: string; level: number; cost: number; category: string }[] => {
      const mod = modLoader.getMod()
      if (!mod) return []
      const char = entitySystem.get('character', charId) as any
      if (!char?.abilities) return []
      const combatState = apiSystem.callSync('combat', 'getCombatState')
      const mp = combatState?.combatants?.[charId]?.mp ?? bindingResolver.get(charId, 'mp') ?? 0
      const result: { id: string; name: string; level: number; cost: number; category: string }[] = []
      for (const [abilityId, entry] of Object.entries(char.abilities)) {
        const def = mod.abilities?.[abilityId]
        if (!def || def.type !== 'active') continue
        if (!WUXIA_CATEGORIES.includes((def as any).category)) continue
        const cost = typeof (def as any).cost === 'number' ? (def as any).cost : 0
        if (cost > mp) continue
        result.push({
          id: abilityId,
          name: def.name ?? abilityId,
          level: typeof (entry as any)?.level === 'number' ? (entry as any).level : 0,
          cost,
          category: (def as any).category ?? '',
        })
      }
      return result
    },
    getAbilitiesByTag: (charId: string, tag: string): any[] => {
      const char = entitySystem.get('character', charId) as any
      if (!char?.abilities) return []
      const mod = modLoader.getMod()
      if (!mod) return []
      return Object.entries(char.abilities)
        .filter(([id]) => mod.abilities[id]?.tags?.includes(tag))
        .map(([id, data]) => ({ id, ...(data as any) }))
    },
    // 公式中间量通道清单（文档/UI/校验用；权威实现在 combat-base 注册表）
    getChannels: (): any[] => apiSystem.callSync('combat', 'getChannels') ?? [],
    // 数值预览：不进入战斗也能算命中/伤害的中间量（调参/UI/测试复用同一纯函数）
    previewDamage: (sourceId: string, skillId?: string | null, level?: number, targetId?: string): any => {
      const mod = modLoader.getMod()
      const skillDef = skillId ? mod?.abilities?.[skillId] : null
      const lv = typeof level === 'number' ? level : (() => {
        const ch = entitySystem.get('character', sourceId) as any
        const l = ch?.abilities?.[skillId ?? '']?.level
        return typeof l === 'number' ? l : 1
      })()
      const channels = previewChannelBag(sourceId, targetId)
      const charStyle = readCharStyle(sourceId)
      const mp = bindingResolver.get(sourceId, 'mp') ?? 0
      const weaponBase = bindingResolver.get(sourceId, 'weapon_base') ?? 0
      const category = (skillDef as any)?.category as WuxiaCategory | undefined
      const coeffAttr = category ? CATEGORY_COEFF_ATTR[category] : undefined
      const coeff = coeffAttr ? readNum(sourceId, coeffAttr) : 0
      const hits = typeof (skillDef as any)?.hits === 'number' && (skillDef as any).hits >= 1 ? (skillDef as any).hits : 1
      const power = (typeof (skillDef as any)?.power === 'number' ? (skillDef as any).power : 0)
        * powerCurve(skillDef, lv) / hits
      const dark = category === '暗毒'
      const damage = computeStandardDamage({
        stat: readNum(sourceId, dark ? '灵敏' : '力道'),
        dark,
        power,
        weaponBase,
        categoryCoeff: coeff,
        skillStyle: (skillDef as any)?.style,
        charStyle,
        mp: typeof mp === 'number' ? mp : 0,
        channels: channels.source,
      })
      // 毒预览：即时毒伤并入（M′ 过受方通道）
      const poison = poisonImmediate(
        { entityId: sourceId } as any, skillDef, power, channels.target,
      )
      const hit = targetId ? computeHitRate({
        attacker: {
          qinggong: readNum(sourceId, '轻功系数'), agi: readNum(sourceId, '灵敏'),
          hitBonus: 0,
        },
        defender: {
          qinggong: readNum(targetId, '轻功系数'), agi: readNum(targetId, '灵敏'),
          dodgeBonus: 0,
        },
        channels,
      }) : null
      return {
        skillId: skillId ?? null, level: lv, hits, category: category ?? null,
        parts: poison ? { ...damage.parts, [poison.partKey]: poison.M应用 } : damage.parts,
        value: damage.value + (poison?.M应用 ?? 0),
        // 毒预览：M 原值（写进 DEBUFF 的快照）与本次并入的 M′
        poisonM: poison?.M ?? null,
        poisonM应用: poison?.M应用 ?? null,
        hitRate: hit?.value ?? null, hitParts: hit?.parts ?? null,
      }
    },
    setFormulaDetail: (on: boolean): void => {
      apiSystem.callSync('combat', 'setFormulaDetail', on)
    },
    getFormulaDetail: (): boolean => apiSystem.callSync('combat', 'getFormulaDetail') ?? false,
  })

  // ── 战斗数据校验（加载期/热重载后）──
  validateBattleData()
  ctx.events.on('game:mod_loaded', () => validateBattleData())

  // ── 测试指令：@battle_test（临时注入测试敌人与演示技能，战斗结束全部清理）──
  const testCmd: CommandDef = {
    id: 'battle_test',
    label: '战斗测试（临时）',
    group: 'main_menu',
    modes: ['exploration'],
    priority: 1000,
    source: 'plugin:combat-wuxia',
    handler: async () => {
      await runBattleTest()
    },
  }
  ctx.commands.register(testCmd)

  // ── 调试指令：@公式明细（开关公式中间量明细输出，可在战斗外查看最近一次）──
  const formulaCmd: CommandDef = {
    id: '@combat_formula',
    label: '@公式明细',
    group: 'main_menu',
    modes: ['exploration', 'daily_menu', 'combat'],
    priority: 1001,
    source: 'plugin:combat-wuxia',
    handler: async () => {
      const on = !(apiSystem.callSync('combat', 'getFormulaDetail') ?? false)
      apiSystem.callSync('combat', 'setFormulaDetail', on)
      const last = apiSystem.callSync('combat', 'getLastFormula')
      const head = `公式明细已${on ? '开启' : '关闭'}（战斗日志将逐条输出中间量）`
      if (!last) {
        narrativeLog.write(`${head}；暂无公式记录`, 'combat', 'combat-wuxia')
        return
      }
      const parts = Object.keys(last.parts ?? {}).map(k => `${k}=${Math.round(last.parts[k] * 100) / 100}`).join('  ')
      narrativeLog.write(`${head}\n最近一次：${last.hook} = ${Math.round(last.value * 100) / 100}${parts ? `\n　${parts}` : ''}`, 'combat', 'combat-wuxia')
    },
  }
  ctx.commands.register(formulaCmd)
}

// ── 编译：被动技能/战斗天赋 → 效果区 ────────────────────────────────────

const TALENT_FORMULA_STATS: Record<string, { stat: string; mode: 'percent' | 'flat' }> = {
  combat_hit: { stat: 'hit_bonus', mode: 'flat' },
  combat_dodge: { stat: 'dodge_bonus', mode: 'flat' },
  combat_crit: { stat: 'crit_rate', mode: 'flat' },
  combat_crit_mul: { stat: 'crit_mul', mode: 'percent' },
  combat_damage: { stat: 'damage_out', mode: 'percent' },
  combat_defense: { stat: 'defense_mult', mode: 'percent' },
  combat_in: { stat: 'damage_in', mode: 'percent' },
}

// 天赋/被动效果条目 key（一次性效果的消耗追踪：复活后重建跳过已消耗项）
function effectKey(kind: 'passive' | 'talent', id: string): string {
  return `${kind}:${id}`
}

interface CompileCtx { combat: CompileScene; combatant: CompileCombatant }

async function compileCombatant(hctx: CompileCtx): Promise<void> {
  const item: CompileCtx = hctx
  const { combatant } = item
  const char = entitySystem.get('character', combatant.entityId) as any
  const mod = modLoader.getMod()
  if (!char || !mod) return
  const consumed = combatant.consumedEffects ?? []
  const combat = item.combat

  // ── 被动技能 ──
  if (char.abilities) {
    for (const [abilityId, entry] of Object.entries(char.abilities)) {
      const def = mod.abilities?.[abilityId]
      if (!def || def.type !== 'passive') continue
      const level = typeof (entry as any)?.level === 'number' ? (entry as any).level : 0
      const effects = def.battle_effects as any[] | undefined
      if (!Array.isArray(effects)) continue
      const key = effectKey('passive', abilityId)
      // 一次性效果已消耗（inst id = key#effectId）：skill 级与 inst 级都要命中
      const consumedMatch = consumed.some(c => c === key || c.startsWith(`${key}#`))
      if (consumedMatch) continue
      for (const raw of effects) {
        if (!raw) continue
        const r = resolveEffectRef(raw, mod.battleEffects)
        if (!r.ok) {
          reportEffectRefError(`被动技 '${abilityId}'`, r.error)
          continue
        }
        if (typeof r.entry.spec.minLevel === 'number' && level < r.entry.spec.minLevel) continue
        apiSystem.callSync('combat', 'addResolvedEffect', combatant.entityId, r.entry, {
          id: `${key}#${r.entry.id}`,
          origin: 'passive',
          originId: abilityId,
        })
      }
    }
  }

  // ── 战斗天赋 ──
  if (char.talents) {
    for (const [talentId, lvl] of Object.entries(char.talents)) {
      const def = mod.talentDefs?.[talentId]
      if (!def) continue
      const level = typeof lvl === 'number' ? lvl : 0
      // 机制类：talent.battle_effects 直接进效果区（常驻，与被动技同容器）
      const battleEffects = (def as any).battle_effects as any[] | undefined
      if (Array.isArray(battleEffects)) {
        const key = effectKey('talent', talentId)
        const consumedMatch = consumed.some(c => c === key || c.startsWith(`${key}#`))
        if (!consumedMatch) {
          for (const raw of battleEffects) {
            if (!raw) continue
            const r = resolveEffectRef(raw, mod.battleEffects)
            if (!r.ok) {
              reportEffectRefError(`天赋 '${talentId}'`, r.error)
              continue
            }
            apiSystem.callSync('combat', 'addResolvedEffect', combatant.entityId, r.entry, {
              id: `${key}#${r.entry.id}`,
              origin: 'talent',
              originId: talentId,
            })
          }
        }
      }
      // 数值类：modifier formula=combat_* → 修正型效果（combat_channel → 公式中间量通道）
      const modifiers = def.modifiers
      if (Array.isArray(modifiers)) {
        for (const m of modifiers) {
          if (!m || typeof m.formula !== 'string' || !m.formula.startsWith('combat')) continue
          const plusVal = (m.plus ?? 0) * level
          const multVal = (m.multiply ?? 0) * level
          // 中间量通道类（combat_channel）：当次攻击按技能过滤求值（when_* 与 combat_damage 同语义）
          if (m.formula === 'combat_channel') {
            if (!m.channel) continue
            if (plusVal === 0 && multVal === 0) continue
            combatant.talentChannelMods.push({
              channel: m.channel,
              flat: plusVal,
              percent: multVal,
              when_tag: m.when_tag, when_type: m.when_type, when_ability: m.when_ability,
            })
            continue
          }
          const map = TALENT_FORMULA_STATS[m.formula]
          if (!map) continue
          // 伤害类天赋（combat_damage）：只走 talentDamageMods（当次攻击按技能过滤求值），
          // 不建常驻统计条目（否则与 damage_out 双重计费）
          if (m.formula === 'combat_damage') {
            combatant.talentDamageMods.push({
              when_tag: m.when_tag, when_type: m.when_type, when_ability: m.when_ability,
              value: multVal + plusVal / 100,
            })
            continue
          }
          if (map.mode === 'percent') {
            const value = Math.abs(plusVal) > 0 ? plusVal : multVal
            if (value === 0) continue
            apiSystem.callSync('combat', 'addZoneEffect', combatant.entityId, {
              id: effectKey('talent', talentId) + `#${m.formula}`, action: 'modify_stat',
              stat: map.stat, value: { percent: value }, duration: 'battle',
              category: 'neutral', origin: 'talent', originId: talentId, sourceId: combatant.entityId,
            })
          } else {
            const value = plusVal + multVal * 100
            if (value === 0) continue
            apiSystem.callSync('combat', 'addZoneEffect', combatant.entityId, {
              id: effectKey('talent', talentId) + `#${m.formula}`, action: 'modify_stat',
              stat: map.stat, value: { flat: value }, duration: 'battle',
              category: 'neutral', origin: 'talent', originId: talentId, sourceId: combatant.entityId,
            })
          }
        }
      }
    }
  }
  // 注意：talentDamageMods / talentChannelMods 在复活重建时应保留——重建只清 zone，
  // 不重置它们（compileCombatant 重复调用会重复 push → 防抖：重建前 base 不清，此处去重）
  const seen = new Set<string>()
  combatant.talentDamageMods = combatant.talentDamageMods.filter((m: any) => {
    const k = `${m.when_tag}|${m.when_type}|${m.when_ability}|${m.value}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  const seenCh = new Set<string>()
  combatant.talentChannelMods = (combatant.talentChannelMods ?? []).filter((m: any) => {
    const k = `${m.channel}|${m.flat}|${m.percent}|${m.when_tag}|${m.when_type}|${m.when_ability}`
    if (seenCh.has(k)) return false
    seenCh.add(k)
    return true
  })
  void combat
}

// ── 公式实现 ─────────────────────────────────────────────────────────────

// 特殊系伤害脚本（气功/异术）：scripts/damage_<skillId>.js，返回基础伤害数字
// ⚠️ 脚本内直接引用作用域名（与 quest 脚本同约）：source（攻击方快照）/ target / skill / combat / rand
const SPECIAL_SCRIPT_TIMEOUT_MS = 3000

async function runDamageScript(code: string, ctx: any): Promise<number | null> {
  const proxy = new Proxy(ctx, {
    get(target, key) {
      if (key in target) return (target as any)[key as string]
      return undefined
    },
    has: () => true,
    set: () => false,
  })
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`伤害脚本执行超时（>${SPECIAL_SCRIPT_TIMEOUT_MS}ms）`)), SPECIAL_SCRIPT_TIMEOUT_MS)
  })
  try {
    const fn = new Function('ctx', `with (ctx) { return (async function() { "use strict"; ${code} })() }`)
    const val = await Promise.race([fn(proxy), timeout])
    return typeof val === 'number' && Number.isFinite(val) ? Math.max(0, val) : null
  } catch (err) {
    errorReporter.reportDedup(`combat-script:${ctx.skill?.id}`, {
      source: 'combat-wuxia', severity: 'error',
      message: `特殊系伤害脚本 '${ctx.skill?.id}' 执行失败：${err instanceof Error ? err.message : String(err)}（该次伤害按 0 处理）`,
    })
    return null
  } finally {
    if (timer) clearTimeout(timer)
  }
}

// 默认攻击（空手平A）：同一标准公式，武功威力 = 0、武功系数 = 0（按力道轴）
function defaultAttackBase(source: CompileCombatant, weaponBase: number, channels: ChannelBag | undefined): { value: number; parts: Record<string, number> } {
  const result = computeDefaultAttack({
    stat: readNum(source.entityId, '力道'),
    weaponBase,
    categoryCoeff: 0,
    charStyle: readCharStyle(source.entityId),
    mp: source.mp,
    channels,
  })
  return result
}

function readCharStyle(entityId: string): CharStyleValues {
  const style: CharStyleValues = {}
  // 人物四维（轻/厚/巧 + 毒功）；风格系数与精通系数只取前三维，毒功只走毒线
  for (const k of STYLE_KEYS) style[k] = readNum(entityId, k)
  style.毒功 = readNum(entityId, '毒功')
  return style
}

// 通道包（数值预览用）：战斗内取实时聚合通道，战斗外为空
function previewChannelBag(sourceId: string, targetId?: string): { source: ChannelBag; target: ChannelBag } {
  let state: any = null
  try { state = apiSystem.callSync('combat', 'getCombatState') } catch { state = null }
  const bag = (id?: string): ChannelBag => {
    const ch = id ? state?.combatants?.[id]?.channels : null
    return ch ? { ...ch } : {}
  }
  return { source: bag(sourceId), target: bag(targetId) }
}

// 天赋通道修正（combat_channel 类，当次攻击按技能 tag/id 过滤）
function talentChannelBag(source: CompileCombatant, skill: any): ChannelBag {
  const bag: ChannelBag = {}
  const mods = source.talentChannelMods
  if (!Array.isArray(mods)) return bag
  const tags = skill?.tags as string[] | undefined
  for (const m of mods) {
    if (!m?.channel) continue
    if (m.when_ability && m.when_ability !== skill?.id) continue
    if (m.when_tag && !tags?.includes(m.when_tag)) continue
    const cur = bag[m.channel] ?? (bag[m.channel] = { flat: 0, percent: 0 })
    cur.flat += m.flat ?? 0
    cur.percent += m.percent ?? 0
  }
  return bag
}

function mergeBagsLocal(a: ChannelBag, b: ChannelBag): ChannelBag {
  const out: ChannelBag = {}
  for (const bag of [a, b]) {
    for (const k of Object.keys(bag)) {
      const m = bag[k]
      const cur = out[k] ?? (out[k] = { flat: 0, percent: 0 })
      cur.flat += m.flat ?? 0
      cur.percent += m.percent ?? 0
      if (m.set !== undefined) cur.set = m.set
    }
  }
  return out
}

async function wuxiaBaseDamage(hctx: any): Promise<{ value: number; parts: Record<string, number> }> {
  const { source, target, skill, hits, combat } = hctx
  const srcSnapshot = getSnapshot(source.entityId)
  const weaponBase = srcSnapshot.weaponBase
  const mp = source.mp // 战斗内实时内力（扣消耗后）
  // 战斗内注入的通道包（combat-base）+ 天赋通道（本插件按技能过滤）
  const hookChannels: ChannelBag | undefined = hctx.channels?.source
  const channels = mergeBagsLocal(hookChannels ?? {}, talentChannelBag(source, skill))

  // 默认攻击（无技能）
  if (!skill) {
    return defaultAttackBase(source, weaponBase, channels)
  }

  const category = (skill as any).category as WuxiaCategory
  const level = typeof hctx.skillLevel === 'number' ? hctx.skillLevel : 1
  const hitsCount = Math.max(1, hits ?? 1)
  const powerTotal = (typeof skill.power === 'number' ? skill.power : 0) * powerCurve(skill, level)
  const perHitPower = powerTotal / hitsCount

  // 气功/异术：per-skill 沙箱脚本（只替换基础伤害数字，其余管线照走）
  if (category === '气功' || category === '异术') {
    const mod = modLoader.getMod()
    const code = mod?.scripts?.get(`damage_${(skill as any).id}.js`)
    if (!code) {
      errorReporter.reportDedup(`combat-script-missing:${(skill as any).id}`, {
        source: 'combat-wuxia', severity: 'error',
        message: `特殊系技能 '${skill.name ?? skill.id}' 缺少伤害脚本 scripts/damage_${(skill as any).id}.js（该次伤害按 0 处理）`,
      })
      return { value: 0, parts: {} }
    }
    const scriptCtx = {
      skill: { id: (skill as any).id, name: skill.name, level, power: skill.power, category },
      source: {
        entityId: source.entityId,
        mp, mpMax: source.maxMp,
        str: srcSnapshot.str, con: srcSnapshot.con, agi: srcSnapshot.agi,
        fort: srcSnapshot.fort, will: srcSnapshot.will, int: srcSnapshot.int,
        coefficients: { ...srcSnapshot.coefficients }, style: { ...srcSnapshot.style },
        stats: { ...source.stats },
      },
      target: {
        entityId: target.entityId,
        hp: target.hp, mp: target.mp,
        stats: { ...target.stats },
      },
      channels,
      combat,
      rand: (min: number, max: number) => Math.floor(combat.rng() * (max - min + 1)) + min,
    }
    const val = await runDamageScript(code, scriptCtx)
    if (val === null) return { value: 0, parts: { 特殊系脚本: 0 } }
    // 脚本值 + 通道「其他加成」（脚本只替换基础伤害数字，通用加成仍生效）
    const extraMod = channelOf(channels, CH.EXTRA)
    const extra = extraMod?.set !== undefined ? extraMod.set : (extraMod?.flat ?? 0)
    const scriptBase = Math.max(0, val + extra)
    // 毒：脚本系（气功/异术）同样支持毒词条——即时毒伤并入脚本算出的基础伤害
    const scriptPoison = poisonImmediate(source, skill, perHitPower, hctx.channels?.target)
    if (!scriptPoison) {
      return { value: scriptBase, parts: { 特殊系脚本: val, 其他加成: extra, 基础伤害: scriptBase } }
    }
    return {
      value: scriptBase + scriptPoison.M应用,
      parts: {
        特殊系脚本: val, 其他加成: extra, 普通伤害: scriptBase,
        [scriptPoison.partKey]: scriptPoison.M应用, 基础伤害: scriptBase + scriptPoison.M应用,
      },
    }
  }

  // 标准系 + 暗毒系：统一公式（力道×3 / 灵敏×3）
  const dark = category === '暗毒'
  const coeffAttr = CATEGORY_COEFF_ATTR[category]
  const coeff = coeffAttr ? readNum(source.entityId, coeffAttr) : 0
  const result = computeStandardDamage({
    stat: readNum(source.entityId, dark ? '灵敏' : '力道'),
    dark,
    power: perHitPower,
    weaponBase,
    categoryCoeff: coeff,
    skillStyle: (skill as any).style,
    charStyle: readCharStyle(source.entityId),
    mp,
    channels,
  })

  // 天赋伤害修正（combat_damage 类，当次攻击按技能过滤）
  let talentPct = 0
  const talentMods = hctx.talentMods as any[] | undefined
  if (Array.isArray(talentMods)) {
    for (const m of talentMods) {
      if (m.when_ability && m.when_ability !== (skill as any).id) continue
      const tags = skill.tags as string[] | undefined
      if (m.when_tag && !(tags?.includes(m.when_tag))) continue
      talentPct += m.value
    }
  }
  const finalValue = Math.max(0, result.value * (1 + talentPct))
  // 毒：技能带 apply_poison 词条 → 即时毒伤并入本次命中的基础伤害（同一次判定；M′ 先过受方的「毒伤害」通道）
  const poisonParts = poisonImmediate(source, skill, perHitPower, hctx.channels?.target)
  if (!poisonParts) {
    return {
      value: finalValue,
      parts: { ...result.parts, 天赋伤害加成: talentPct, 基础伤害: finalValue },
    }
  }
  const withPoison = finalValue + poisonParts.M应用
  return {
    value: withPoison,
    parts: {
      ...result.parts,
      天赋伤害加成: talentPct,
      普通伤害: finalValue,
      [poisonParts.partKey]: poisonParts.M应用,
      基础伤害: withPoison,
    },
  }
}

// ── 毒 / 火毒 / 寒毒：即时毒伤 + 施加器 + 持续结算 ────────────────────────

/** 技能上的毒词条：解析后 apply = 'apply_poison' 的那一条 */
function poisonEntryOf(skill: any): { entry: ResolvedEffect } | null {
  const list = Array.isArray(skill?.battle_effects) ? skill.battle_effects : []
  const defs = modLoader.getMod()?.battleEffects
  for (const raw of list) {
    if (!raw) continue
    const r = resolveEffectRef(raw, defs)
    if (r.ok && r.entry.apply === 'apply_poison') return { entry: r.entry }
  }
  return null
}

/** 毒面板读数：技能毒性（技能侧）/ 人物毒功（人物侧）/ 人物暗毒系数 */
function poisonPanel(attackerId: string, skill: any): { 技能毒性: number; 人物毒功: number; 人物暗毒系数: number } {
  const style = (skill as any)?.style as Record<string, number> | undefined
  return {
    技能毒性: typeof style?.毒性 === 'number' ? style.毒性 : 0,
    人物毒功: readNum(attackerId, '毒功'),
    人物暗毒系数: readNum(attackerId, '暗毒系数'),
  }
}

/** 该段武功威力（power × 威力曲线 / 段数） */
function perHitPowerOf(skill: any, level: number): number {
  const hits = typeof skill?.hits === 'number' && skill.hits >= 1 ? skill.hits : 1
  return ((typeof skill?.power === 'number' ? skill.power : 0) * powerCurve(skill, level)) / hits
}

/** 即时毒伤：返回 M（原值，供 DEBUFF 快照）与 M′（并入本次伤害）
 *  减免以**受方**的通道包为准（「毒伤害」是受害一方的减免：抗毒/医疗等） */
function poisonImmediate(
  source: CompileCombatant, skill: any, perHitPower: number, targetChannels: ChannelBag | undefined,
): { M: number; M应用: number; partKey: string } | null {
  const found = poisonEntryOf(skill)
  if (!found) return null
  const panel = poisonPanel(source.entityId, skill)
  const r = computePoisonBase({ 技能威力: perHitPower, ...panel, channels: targetChannels })
  const 等级名 = displayNameOf(found.entry.name ?? found.entry.id, found.entry.spec.levelNames, found.entry.spec.stacks)
  return { M: r.M, M应用: r.M应用, partKey: `即时毒伤（${等级名}）` }
}

/**
 * 施加器 apply_poison：先算毒功面板的 M 快照，再以 M 作为实例数值挂到目标身上。
 * 实例数值 = { percent: 1%气血上限, flat: 0.1×M }，层数倍率由条目的 growth 负责。
 */
async function applyPoisonApply(a: any): Promise<void> {
  const attacker = a.caster as CompileCombatant
  const target = a.target as CompileCombatant
  if (!attacker || !target || target.dead) return
  const skillId = a.job?.skillId ?? null
  const skill = skillId ? modLoader.getMod()?.abilities?.[skillId] : null
  if (!skill) return
  const level = typeof a.skillLevel === 'number' ? a.skillLevel : 1
  const panel = poisonPanel(attacker.entityId, skill)
  const r = computePoisonBase({ 技能威力: perHitPowerOf(skill, level), ...panel, channels: undefined })
  const entry = a.entry as ResolvedEffect
  // 实例数值：percent = 气血上限比例（条目声明，默认 1%），flat = 0.1×M（毒功面板快照）
  const value = {
    percent: entry.spec.value.percent,
    flat: r.M * POISON_M_RATE,
  }
  await apiSystem.call('combat', 'mountResolved', target.entityId, entry, {
    sourceId: attacker.entityId,
    value,
    origin: a.origin,
    originId: a.originId,
  })
  narrativeLog.write(
    `${getCharName(attacker.entityId)} 使 ${getCharName(target.entityId)} 中了【${displayNameOf(entry.name ?? entry.id, entry.spec.levelNames, entry.spec.stacks)}】`,
    'combat', 'combat-wuxia',
  )
}

/** 持续毒伤：状态挂在谁身上，就在结算相位发作（简化流程：只过「毒伤害」通道） */
async function poisonDotAction(actCtx: any): Promise<void> {
  const inst = actCtx.effect
  const target = actCtx.self as CompileCombatant
  if (!target || target.dead) return
  const channels = actCtx.channels?.self as ChannelBag | undefined
  // 实例数值 = { percent: 1%×气血上限, flat: 0.1×M }，层数倍率由 growth 承担
  const scaled = scaleValue(inst.value, inst.growth, inst.stack)
  const raw = valueAmount(scaled, target.maxHp)
  const value = applyPoisonMitigation(raw, channels)
  apiSystem.callSync('combat', 'recordFormula', {
    hook: 'poison_dot',
    sourceId: inst.sourceId,
    targetId: target.entityId,
    parts: {
      毒等级: inst.stack,
      层数倍率: 1 + inst.growth * Math.max(0, inst.stack - 1),
      M快照: inst.value.flat / POISON_M_RATE,
      上限项: inst.value.percent * target.maxHp,
      基准毒伤: raw,
      减免后: value,
    },
    channels: { source: {}, target: channels ?? {} },
    value,
  })
  narrativeLog.write(`【${inst.displayName ?? inst.name ?? inst.id}】发作：${getCharName(target.entityId)} 受到 ${value} 点毒伤`, 'combat', 'combat-wuxia')
  // 简化流程：不走命中/暴击/浮动/防御/减伤；扣血后触发"受伤害后"相位（受伤害类天赋/效果照常生效）
  await apiSystem.call('combat', 'applyDamage', target.entityId, value, {
    source: inst.sourceId, kind: 'periodic', triggerTakenPhase: true,
  })
}

// ── 冰火相消（施加器 apply_element）──────────────────────────────────────
// 规则（2026-09 定稿）：
//   1) 对方得到本次层数的本元素毒（火毒 x / 寒毒 x）
//   2) 自己身上**层数 ≤ 本次层数**的对立毒被清除（低于我们用的级别就不冷了/不热了）
//   3) 对方身上若有对立毒 → 冷热对冲：按其层数立刻结算一次伤害，随即清除（天生不共存）

function zoneEffectsOf(combatant: CompileCombatant): any[] {
  return Array.isArray(combatant?.zone) ? combatant.zone : []
}

function findZoneEffect(combatant: CompileCombatant, id: string): any | null {
  return zoneEffectsOf(combatant).find((z: any) => z && z.id === id) ?? null
}

async function applyElementApply(a: any): Promise<void> {
  const caster = a.caster as CompileCombatant
  const target = a.target as CompileCombatant
  const entry = a.entry as ResolvedEffect
  if (!caster || !target || target.dead) return
  const element = String(a.entry?.applyArgs?.element ?? entry.id)
  const opposite = String(a.entry?.applyArgs?.opposite ?? '')
  const stacks = Math.max(1, entry.spec.stacks)

  // 1) 先把本元素毒挂上去（合并策略由库条目决定：strongest = 取高层数）
  await apiSystem.call('combat', 'mountResolved', target.entityId, entry, {
    sourceId: caster.entityId,
    origin: a.origin,
    originId: a.originId,
  })
  if (!opposite) return

  // 2) 清自己身上"层数 ≤ 本次层数"的对立毒
  const own = findZoneEffect(caster, opposite)
  if (own && own.stack <= stacks) {
    caster.zone.splice(caster.zone.indexOf(own), 1)
    apiSystem.callSync('combat', 'recalcStats', caster.entityId)
    narrativeLog.write(`${getCharName(caster.entityId)} 以${element}之力化解了自身的【${own.displayName ?? own.id}】`, 'combat', 'combat-wuxia')
  }

  // 3) 引爆对方身上的对立毒（按层数结算一次），随即清除
  const foe = findZoneEffect(target, opposite)
  if (!foe) return
  const scaled = scaleValue(foe.value, foe.growth, foe.stack)
  const channels = combatChannelBagOf(target.entityId)
  const burst = applyPoisonMitigation(valueAmount(scaled, target.maxHp), channels)
  target.zone.splice(target.zone.indexOf(foe), 1)
  apiSystem.callSync('combat', 'recalcStats', target.entityId)
  narrativeLog.write(
    `冷热对冲！${getCharName(target.entityId)} 的【${foe.displayName ?? foe.id}】被引爆（${burst} 点伤害）`,
    'combat', 'combat-wuxia',
  )
  if (burst > 0) {
    await apiSystem.call('combat', 'applyDamage', target.entityId, burst, {
      source: caster.entityId, kind: 'periodic', triggerTakenPhase: true,
    })
  }
}

/** 取战斗单位的通道包（引爆伤害过「毒伤害」减免用） */
function combatChannelBagOf(entityId: string): ChannelBag | undefined {
  try {
    const st = apiSystem.callSync('combat', 'getCombatState')
    return st?.combatants?.[entityId]?.channels as ChannelBag | undefined
  } catch { return undefined }
}

function getCharName(charId: string): string {
  const char = entitySystem.get('character', charId) as any
  return char?.name ?? charId
}

/** 效果引用解析失败的统一上报（技能/被动/天赋三处共用） */
function reportEffectRefError(owner: string, error: string): void {
  errorReporter.reportDedup(`battle-ref:${owner}:${error}`, {
    source: 'combat-wuxia', severity: 'error',
    message: `${owner} 的战斗效果引用无效：${error}`,
    suggestion: '检查 definitions/battle-effects.toml 的 [effects] 表（技能只写 { effect = "名", 参数… }）',
  })
}

// ── 动态技能指令 ─────────────────────────────────────────────────────────

function syncSkillCommands(hctx: { actorId: string; combat: CompileScene }): void {
  if (!pluginCtx) return
  const { actorId } = hctx
  if (!hctx.combat.allies.includes(actorId)) return
  clearSkillCommands()
  const skills = apiSystem.callSync('combat-wuxia', 'getUsableSkills', actorId)
  const targetFallback = hctx.combat.enemies[0] ?? null
  for (const skill of skills) {
    const cmd: CommandDef = {
      id: `combat_skill_${actorId}_${skill.id}`,
      label: `${skill.name}${skill.cost > 0 ? `（内力${skill.cost}）` : ''}`,
      group: 'character_commands',
      modes: ['combat'],
      priority: 10,
      source: 'plugin:combat-wuxia',
      handler: async (execCtx: any) => {
        const targetId = execCtx?.uiStore?.selectedCharacterId ?? targetFallback
        if (!targetId) return
        await apiSystem.call('combat', 'executeAction', actorId, { type: 'skill', skillId: skill.id, targetId })
      },
    }
    try {
      pluginCtx.commands.register(cmd)
      registeredSkillCmdIds.add(cmd.id)
    } catch (err) {
      errorReporter.report({
        source: 'combat-wuxia', severity: 'warning',
        message: `注册技能指令 '${cmd.id}' 失败：${err instanceof Error ? err.message : String(err)}`,
      })
    }
  }
}

function clearSkillCommands(): void {
  if (!pluginCtx) return
  for (const id of registeredSkillCmdIds) {
    pluginCtx.commands.unregister(id)
  }
  registeredSkillCmdIds.clear()
}

// ── 战斗数据校验（合同字段级）───────────────────────────────────────────

export function validateBattleData(): void {
  const mod = modLoader.getMod()
  if (!mod) return
  let actionNames = new Set<string>()
  try {
    actionNames = new Set(apiSystem.callSync('combat', 'getBattleActionNames') as string[])
  } catch { /* combat 未启用：无动作表可校验 */ }
  let channelIds = new Set<string>()
  try {
    channelIds = new Set((apiSystem.callSync('combat', 'getChannels') as any[]).map(c => c.id))
  } catch { /* combat 未启用：无通道表可校验 */ }
  let applyNames = new Set<string>()
  try {
    applyNames = new Set(apiSystem.callSync('combat', 'getApplyNames') as string[])
  } catch { /* combat 未启用：无施加器表可校验 */ }
  const defs = mod.battleEffects ?? {}

  /** 库条目（battle-effects.toml）契约校验 */
  const validateDef = (id: string, def: any): void => {
    const owner = `战斗效果 '${id}'`
    if (!def || typeof def !== 'object') return
    if (typeof def.action !== 'string' || def.action.length === 0) {
      errorReporter.report({ source: 'combat-wuxia', severity: 'error', message: `${owner} 缺少 action` })
      return
    }
    if (!actionNames.has(def.action)) {
      errorReporter.report({ source: 'combat-wuxia', severity: 'error', message: `${owner} 的 action '${def.action}' 未注册`, suggestion: `已注册动作：${[...actionNames].join('、')}` })
    }
    const delivery = def.delivery === 'zone' ? 'zone' : 'instant'
    // 相位合法性
    const phase = delivery === 'zone' ? (def.settle ?? def.trigger) : def.trigger
    if (phase && !BATTLE_TRIGGER_NAMES.includes(phase)) {
      errorReporter.report({ source: 'combat-wuxia', severity: 'error', message: `${owner} 的${delivery === 'zone' ? ' settle' : ' trigger'} '${phase}' 非法`, suggestion: `可用相位：${BATTLE_TRIGGER_NAMES.join('/')}` })
    }
    if (def.apply_at !== undefined && !BATTLE_TRIGGER_NAMES.includes(def.apply_at)) {
      errorReporter.report({ source: 'combat-wuxia', severity: 'error', message: `${owner} 的 apply_at '${def.apply_at}' 非法` })
    }
    // 施加器
    const applier = def.apply ?? 'mount'
    if (!applyNames.has(applier)) {
      errorReporter.report({ source: 'combat-wuxia', severity: 'error', message: `${owner} 的 apply '${applier}' 未注册`, suggestion: `已注册施加器：${[...applyNames].join('、')}` })
    }
    // 合并策略
    if (def.merge !== undefined && !['refresh', 'stack', 'strongest'].includes(def.merge)) {
      errorReporter.report({ source: 'combat-wuxia', severity: 'error', message: `${owner} 的 merge '${def.merge}' 非法`, suggestion: '允许：refresh / stack / strongest' })
    }
    // 数值形态
    const value = def.value
    if (value !== undefined && typeof value !== 'number' && (typeof value !== 'object' || value === null)) {
      errorReporter.report({ source: 'combat-wuxia', severity: 'error', message: `${owner} 的 value 必须是数字或 { flat, percent, set } 对象` })
    }
    if (value && typeof value === 'object' && value.set !== undefined && def.action !== 'modify_channel') {
      errorReporter.report({ source: 'combat-wuxia', severity: 'error', message: `${owner} 的 value.set 只允许用于 modify_channel（统计键无覆盖语义）` })
    }
    // 统计键 / 通道落点
    if (def.action === 'modify_stat') {
      if (!STAT_KEYS.has(def.stat)) {
        errorReporter.report({ source: 'combat-wuxia', severity: 'error', message: `${owner} 的 stat '${def.stat}' 不是合法统计键`, suggestion: `可用：${[...STAT_KEYS].join('、')}` })
      } else if (value && typeof value === 'object') {
        const point = POINT_STATS.has(def.stat)
        if (point && value.percent) {
          errorReporter.report({ source: 'combat-wuxia', severity: 'error', message: `${owner} 的 stat '${def.stat}' 是点数制，请用 value = { flat = N }` })
        }
        if (!point && value.flat) {
          errorReporter.report({ source: 'combat-wuxia', severity: 'error', message: `${owner} 的 stat '${def.stat}' 是倍率制，请用 value = { percent = N }` })
        }
      }
      // 破绽类：易伤无上限，但极端值给提示
      const pct = typeof value === 'number' ? 0 : (value?.percent ?? 0)
      const growth = typeof def.growth === 'number' ? def.growth : 0
      if (def.stat === 'damage_in' && (Math.abs(pct) > 3 || Math.abs(growth) > 1)) {
        errorReporter.report({ source: 'combat-wuxia', severity: 'warning', message: `${owner} 的 damage_in 数值极端（percent=${pct}, growth=${growth}）——易伤不截断，请注意平衡` })
      }
    }
    if (def.action === 'modify_channel') {
      if (typeof def.channel !== 'string' || def.channel.length === 0) {
        errorReporter.report({ source: 'combat-wuxia', severity: 'error', message: `${owner} 的 modify_channel 缺少 channel 字段`, suggestion: `可用通道：${[...channelIds].join('、')}` })
      } else if (!channelIds.has(def.channel)) {
        errorReporter.report({ source: 'combat-wuxia', severity: 'error', message: `${owner} 引用了未注册的公式通道 '${def.channel}'`, suggestion: `可用通道：${[...channelIds].join('、')}` })
      }
    }
    if (def.when_skill !== undefined && !mod.abilities?.[def.when_skill]) {
      errorReporter.report({ source: 'combat-wuxia', severity: 'error', message: `${owner} 的 when_skill '${def.when_skill}' 不是已定义的技能` })
    }
    // repeat 递归校验（连绵）
    if (def.action === 'repeat' && (typeof def.chance !== 'number' || def.chance >= 1)) {
      errorReporter.report({ source: 'combat-wuxia', severity: 'error', message: `${owner}（repeat）必须给出 chance < 1，否则会无限复读` })
    }
    // 毒：结算动作与施加器必须成对
    if (applier === 'apply_poison' && def.action !== 'poison_dot') {
      errorReporter.report({ source: 'combat-wuxia', severity: 'error', message: `${owner} 用 apply_poison 施加，结算动作应为 poison_dot（当前 '${def.action}'）` })
    }
  }

  /** 技能/被动/天赋里的引用契约校验 */
  const validateRefList = (owner: string, list: any[] | undefined): void => {
    if (!Array.isArray(list)) return
    for (const raw of list) {
      if (!raw) continue
      const r = resolveEffectRef(raw, defs)
      if (!r.ok) {
        errorReporter.report({ source: 'combat-wuxia', severity: 'error', message: `${owner} 的战斗效果引用无效：${r.error}`, suggestion: `可用效果：${Object.keys(defs).join('、')}` })
        continue
      }
      const e = r.entry
      if (e.delivery === 'zone' && typeof e.spec.duration === 'object' && e.spec.duration.turns === undefined) {
        errorReporter.report({ source: 'combat-wuxia', severity: 'error', message: `${owner} 引用的 '${e.id}' 回合数非法` })
      }
      // 递归类：技能侧覆盖的 chance 也必须 < 1（否则无限复读）
      if (e.spec.action === 'repeat' && e.chance >= 1) {
        errorReporter.report({ source: 'combat-wuxia', severity: 'error', message: `${owner} 引用的 '${e.id}'（repeat）chance 必须 < 1`, suggestion: '写 chance = 0.3 之类的概率，或把 effect 的默认 chance 改成 < 1' })
      }
      if (e.spec.uses !== undefined && (!Number.isInteger(e.spec.uses) || e.spec.uses < 1)) {
        errorReporter.report({ source: 'combat-wuxia', severity: 'error', message: `${owner} 引用的 '${e.id}' 的 uses 必须是正整数` })
      }
      if (raw && typeof raw === 'object' && raw.effect === undefined) {
        errorReporter.report({ source: 'combat-wuxia', severity: 'error', message: `${owner} 的效果条目缺少 effect 字段（应写 { effect = "名", 参数… }）` })
      }
    }
  }

  // battle-effects.toml 条目
  for (const [id, def] of Object.entries(defs)) {
    validateDef(id, def as any)
  }

  // 天赋 modifier 公式点契约（combat_channel 必填 channel + 通道须已注册）
  for (const [talentId, def] of Object.entries(mod.talentDefs ?? {})) {
    const modifiers = (def as any)?.modifiers
    if (Array.isArray(modifiers)) {
      for (const m of modifiers) {
        if (!m || m.formula !== 'combat_channel') continue
        if (typeof m.channel !== 'string' || m.channel.length === 0) {
          errorReporter.report({ source: 'combat-wuxia', severity: 'error', message: `天赋 '${talentId}' 的 combat_channel modifier 缺少 channel`, suggestion: `可用通道：${[...channelIds].join('、')}` })
        } else if (!channelIds.has(m.channel)) {
          errorReporter.report({ source: 'combat-wuxia', severity: 'error', message: `天赋 '${talentId}' 引用了未注册的公式通道 '${m.channel}'`, suggestion: `可用通道：${[...channelIds].join('、')}` })
        }
        if ((m.plus ?? 0) === 0 && (m.multiply ?? 0) === 0) {
          errorReporter.report({ source: 'combat-wuxia', severity: 'warning', message: `天赋 '${talentId}' 的 combat_channel modifier 未给出 plus/multiply（无效果）` })
        }
      }
    }
    validateRefList(`天赋 '${talentId}'`, (def as any)?.battle_effects)
  }

  // 技能契约
  for (const [id, def] of Object.entries(mod.abilities ?? {})) {
    if (!def) continue
    const w = def as any
    const isWuxia = w.category !== undefined || typeof w.power === 'number' || Array.isArray(w.battle_effects)
    if (!isWuxia) continue
    if (Array.isArray(w.effects)) {
      errorReporter.report({
        source: 'combat-wuxia', severity: 'error',
        message: `技能 '${id}' 用 effects 声明战斗效果——该字段已改名为 battle_effects`,
        suggestion: '改写 battle_effects = [{ effect = "效果名", 参数… }]（通用 {type, params} 效果留给 effect-system）',
      })
    }
    if (w.category !== undefined && !WUXIA_CATEGORIES.includes(w.category)) {
      errorReporter.report({ source: 'combat-wuxia', severity: 'error', message: `技能 '${id}' 的 category '${w.category}' 非法`, suggestion: `可用系别：${WUXIA_CATEGORIES.join('、')}` })
    }
    if (w.category === '气功' || w.category === '异术') {
      if (!mod.scripts.has(`damage_${id}.js`)) {
        errorReporter.report({ source: 'combat-wuxia', severity: 'error', message: `特殊系技能 '${id}' 缺少伤害脚本 scripts/damage_${id}.js`, suggestion: '气功/异术无统一公式，必须提供 per-skill 脚本（返回基础伤害数字）' })
      }
    }
    if (w.power_curve !== undefined) {
      if (!Array.isArray(w.power_curve) || w.power_curve.length === 0 || !w.power_curve.every((p: any) => Array.isArray(p) && p.length === 2 && typeof p[0] === 'number' && typeof p[1] === 'number')) {
        errorReporter.report({ source: 'combat-wuxia', severity: 'error', message: `技能 '${id}' 的 power_curve 格式非法`, suggestion: '格式：[[等级, 威力系数], ...]' })
      }
    }
    if (w.style !== undefined) {
      for (const k of Object.keys(w.style)) {
        // 技能风格四维（含毒性）；毒性走独立毒线，不进风格系数/精通系数
        if (!SKILL_STYLE_KEYS.includes(k as any)) {
          errorReporter.report({ source: 'combat-wuxia', severity: 'error', message: `技能 '${id}' 的 style 包含非法维度 '${k}'`, suggestion: `允许：${SKILL_STYLE_KEYS.join('、')}` })
        }
      }
    }
    validateRefList(`技能 '${id}'`, w.battle_effects)
    // 毒词条但技能无「毒性」→ 毒伤仅由人物毒功与暗毒系数驱动（提示，不是错误）
    const hasPoison = Array.isArray(w.battle_effects) && w.battle_effects.some((raw: any) => {
      const r = resolveEffectRef(raw, defs)
      return r.ok && r.entry.apply === 'apply_poison'
    })
    if (hasPoison && !(typeof w.style?.毒性 === 'number' && w.style.毒性 > 0)) {
      errorReporter.report({
        source: 'combat-wuxia', severity: 'warning',
        message: `技能 '${id}' 带毒词条但 style.毒性 缺省/为 0——毒功系数将只吃人物毒功（(1+0/1000)×(1+毒功/50)）`,
        suggestion: '若该武功确有毒性强度，在 style 里补 毒性 = N',
      })
    }
  }

  // 被动技能（type=passive）的 battle_effects 同样参与校验
  for (const [id, def] of Object.entries(mod.abilities ?? {})) {
    const w = def as any
    if (!w || w.type !== 'passive') continue
    validateRefList(`被动技 '${id}'`, w.battle_effects)
  }
}

// 合法相位名（combat-base 的 BattleTrigger；此处复制以避免跨插件 import）
const BATTLE_TRIGGER_NAMES: string[] = [
  'on_use', 'turn_start', 'action_pre', 'attack_pre', 'attack_launch', 'hit_roll',
  'attack_miss', 'on_hit', 'damage_base', 'damage_crit', 'damage_output',
  'damage_on_target', 'damage_mitigate', 'damage_taken', 'attack_end',
  'action_end', 'turn_end', 'death',
]

// ── 测试指令实现（临时敌人 + 演示技能，战斗结束清理）─────────────────────

const TEST_PLAYER_STATS: Record<string, number> = {
  力道: 100, 根骨: 60, 定力: 40, 灵敏: 80, 福缘: 50, 悟性: 30,
  拳掌系数: 50, 刀剑系数: 30, 轻功系数: 40,
  轻灵: 40, 厚重: 40, 巧技: 30, 毒功: 40,
}
const TEST_ENEMY_STATS: Record<string, number> = {
  力道: 90, 根骨: 50, 定力: 30, 灵敏: 60, 福缘: 30, 悟性: 20,
  拳掌系数: 40, 轻功系数: 30,
  轻灵: 30, 厚重: 45, 巧技: 20, 毒功: 0,
}
const tempEffectIds: string[] = []

async function runBattleTest(): Promise<void> {
  const combatState = apiSystem.callSync('combat', 'getCombatState')
  if (combatState) {
    narrativeLog.write('战斗正在进行中，无法开始测试战斗', 'combat', 'combat-wuxia')
    return
  }
  const player = gameContext.getContext().player
  if (!player) {
    narrativeLog.write('没有玩家角色，无法测试', 'combat', 'combat-wuxia')
    return
  }
  const mod = modLoader.getMod()
  if (!mod) return

  // 注入演示技能（战斗测试用，战斗结束后清理）
  const skills: Record<string, any> = {
    测试_铁砂掌: {
      id: '测试_铁砂掌', name: '铁砂掌（测试）', type: 'active',
      power: 100, cost: 20, hits: 1, category: '拳掌', style: { 厚重: 60 },
      tags: ['拳掌'],
      battle_effects: [],
    },
    测试_蛤蟆功: {
      id: '测试_蛤蟆功', name: '蛤蟆功（测试）', type: 'active',
      cost: 15, category: '气功',
      tags: ['气功'],
      battle_effects: [
        { effect: '蛤蟆功蓄势' },
      ],
    },
    测试_寒冰掌: {
      id: '测试_寒冰掌', name: '寒冰掌（测试）', type: 'active',
      power: 120, cost: 25, hits: 1, category: '拳掌', style: { 轻灵: 50, 毒性: 40 },
      tags: ['拳掌'],
      // 毒走 zone 型引用：命中后挂「毒」3 层（＝剧毒），回合开始结算
      battle_effects: [
        { effect: '毒', stacks: 3 },
      ],
    },
  }
  for (const [id, def] of Object.entries(skills)) {
    if ((mod.abilities as any)[id]) {
      errorReporter.report({ source: 'combat-wuxia', severity: 'warning', message: `测试技能 '${id}' 与 mod 数据冲突，本次测试跳过该技能` })
      continue
    }
    ;(mod.abilities as any)[id] = def
    tempSkills.push(id)
    // 气功脚本
    if (id === '测试_蛤蟆功') {
      mod.scripts.set('damage_测试_蛤蟆功.js', 'return ctx.source.mp / 5')
    }
  }
  tempEffectIds.length = 0

  // 设置面板（记录旧值，战斗结束恢复）
  const saved: Record<string, number | undefined> = {}
  const playerBase = player.base ?? (player.base = {})
  for (const [k, v] of Object.entries(TEST_PLAYER_STATS)) {
    saved[k] = playerBase[k]
    playerBase[k] = v
  }
  saved['hp'] = playerBase['hp']
  saved['mp'] = playerBase['mp']
  saved['hp_max'] = playerBase['hp_max']
  saved['mp_max'] = playerBase['mp_max']
  playerBase['hp'] = 1000
  playerBase['mp'] = 500
  playerBase['hp_max'] = 1000
  playerBase['mp_max'] = 500

  // 演示技能给玩家（中文 id 用变量赋值——scan-attr-refs 属性契约）
  if (!player.abilities) player.abilities = {}
  const savedAbilities = JSON.parse(JSON.stringify(player.abilities))
  const tielTag = '测试_铁砂掌'
  const hamagongTag = '测试_蛤蟆功'
  const hanbingTag = '测试_寒冰掌'
  player.abilities[tielTag] = { level: 5, xp: 0 }
  player.abilities[hamagongTag] = { level: 3, xp: 0 }
  player.abilities[hanbingTag] = { level: 2, xp: 0 }

  // 临时敌人
  const enemy = {
    id: 'test_enemy', name: '测试敌人',
    base: { ...TEST_ENEMY_STATS, hp: 800, mp: 300, hp_max: 800, mp_max: 300 },
    abilities: { '测试_铁砂掌': { level: 3, xp: 0 } },
  }
  entitySystem.register('character', 'test_enemy', enemy)

  narrativeLog.write('【战斗测试】开始：玩家 vs 测试敌人（演示：铁砂掌/蛤蟆功/寒冰掌）', 'combat', 'combat-wuxia')

  // 战斗结束 → 清理
  eventBus.once('combat:end', (payload: any) => {
    if (!payload?.participants?.includes('test_enemy')) return
    try {
      const p = entitySystem.get('character', player.id) as any
      if (p) {
        for (const k of Object.keys(TEST_PLAYER_STATS)) {
          if (saved[k] === undefined) delete p.base[k]
          else p.base[k] = saved[k]
        }
        for (const k of ['hp', 'mp', 'hp_max', 'mp_max']) {
          if (saved[k] === undefined) delete p.base[k]
          else p.base[k] = saved[k]
        }
        p.abilities = savedAbilities
        eventBus.emit('character:changed', { id: player.id })
      }
      entitySystem.unregister('character', 'test_enemy')
      for (const id of tempSkills) {
        delete (mod.abilities as any)[id]
      }
      tempSkills.length = 0
      mod.scripts.delete('damage_测试_蛤蟆功.js')
      narrativeLog.write('【战斗测试】临时数据已清理', 'combat', 'combat-wuxia')
    } catch (err) {
      errorReporter.report({ source: 'combat-wuxia', severity: 'warning', message: `战斗测试清理失败：${err instanceof Error ? err.message : String(err)}` })
    }
  })

  await apiSystem.call('combat', 'start', ['test_enemy'], [player.id])
}
