// 注释：h-mark 插件——刻印系统，完全对齐 erArk second_behavior.mark_effect
// 7 种刻印（ability 13-19）：快乐/屈服/苦痛/时姦/恐怖/反发/无觉
// 刻印影响实行判定、好感结算、状态变化
// 升级：快乐/无觉用 OR 逻辑（单次 OR 累计），其余用累计值
// 副作用：刻印升级同时提升对应能力的最低值

import type { PluginContext } from '../../core/types'
import { entitySystem } from '../../core/entity-system'
import { narrativeLog } from '../../core/narrative-log'
import { getEntityAttr } from '../../core/entity-utils'

// 注释：刻印 ID 映射
const MARKS: Record<string, number> = {
  '快乐': 13, '屈服': 14, '苦痛': 15, '时姦': 16, '恐怖': 17, '反发': 18, '无觉': 19,
}

// 注释：刻印 ID → 能力名（2026-08-08 审查修复：原存 mark_{id} 数字键，
// 与 abilities.toml 按名存储（'快乐刻印' 等）双轨分裂——settle_state/calcJudge/h-bondage/
// h-hypnosis 读按名键恒 0，刻印升级对判定/状态系数静默失效；统一按名键为唯一存储）
const MARK_ABILITY: Record<number, string> = {
  13: '快乐刻印', 14: '屈服刻印', 15: '苦痛刻印', 16: '时姦刻印', 17: '恐怖刻印', 18: '反发刻印', 19: '无觉刻印',
}

// 注释：刻印升级条件
// 快乐/无觉：单次 OR 累计 → [单次LV1, 累计LV1, 单次LV2, 累计LV2, ...]
// 其余：累计值 → [LV1, LV2, LV3]
const MARK_UP_CONDITIONS: Record<string, (number | number[])[]> = {
  '快乐': [[2, 5], [8, 20], [16, 50]],      // [单次绝顶, 累计绝顶]
  '屈服': [30000, 50000, 100000],            // (屈服+恭顺+羞耻/5) 累计
  '苦痛': [20000, 40000, 80000],             // 苦痛×5
  '恐怖': [20000, 40000, 80000],             // 恐怖×5+苦痛
  '反发': [10000, 30000, 80000],             // 反感×5+抑郁+恐怖+苦痛
  '无觉': [[2, 5], [8, 20], [16, 50], [100], [200], [500]],  // 无意识绝顶 6 级
  '时姦': [],  // 无自动升级，由其他系统设定
}

// 注释：刻印副作用——升级后设定对应能力的最低值
const MARK_SIDE_EFFECTS: Record<number, ([string, number] | [])[]> = {
  13: [['欲情', 1], ['欲情', 3], ['欲情', 5]],     // 快乐→欲望最低
  14: [['顺从', 1], ['顺从', 3], ['顺从', 5]],     // 屈服→顺从最低
  15: [['受虐', 1], ['受虐', 3], ['受虐', 5]],     // 苦痛→受虐最低
  19: [[], [], [], ['欲情', 6], ['欲情', 7], ['欲情', 8]],  // 无觉→欲望最低
}

export function onLoad(_ctx: PluginContext): void {}

export function onEnable(ctx: PluginContext): void {
  ctx.api.register('h-mark', {
    getLevel: (charId: string, markId: number): number => {
      const char = entitySystem.get('character', charId) as any
      if (!char?.abilities) return 0
      const ab = char.abilities[MARK_ABILITY[markId]]
      return ab?.level ?? 0
    },

    // 注释：检查并尝试升级指定刻印
    checkOne: (charId: string, markId: number): void => {
      const char = entitySystem.get('character', charId) as any
      if (!char) return
      const name = Object.entries(MARKS).find(([, id]) => id === markId)?.[0]
      if (!name) return
      const key = MARK_ABILITY[markId]
      const currentLevel = char.abilities?.[key]?.level ?? 0
      const conditions = MARK_UP_CONDITIONS[name]
      if (!conditions || conditions.length === 0) return

      // 注释：检测是否可以升到下一级
      let nextLevel = currentLevel + 1
      // 注释：无觉刻印升级需目标无意识（erArk mark_effect 整个无觉块被
      // handle_unconscious_flag_ge_1 包裹，second_behavior.py:507）
      if (markId === 19 && (char.sp_flag?.unconscious_h ?? 0) < 1) return
      while (nextLevel <= conditions.length) {
        const cond = conditions[nextLevel - 1]
        const checkValue = getCheckValue(char, markId)
        let met = false
        if (Array.isArray(cond)) {
          // 注释：OR 逻辑 —— 单次 OR 累计满足其一即可
          const [single, cumulative] = cond
          met = (checkValue >= (single ?? Infinity)) || (getCumulativeValue(char, markId) >= (cumulative ?? Infinity))
        } else {
          met = checkValue >= (cond as number)
        }
        if (!met) break
        // 注释：执行升级
        if (!char.abilities) char.abilities = {}
        if (!char.abilities[key]) char.abilities[key] = { level: 0, xp: 0 }
        char.abilities[key].level = nextLevel
        narrativeLog.write(`${char.name} 获得 ${name}刻印 LV${nextLevel}`, 'system', 'h-mark')
        // 注释：副作用——设定对应能力最低值
        applySideEffect(char, markId, nextLevel)
        nextLevel++
      }
    },

    checkAll: (charId: string): void => {
      for (const id of Object.values(MARKS)) {
        ctx.api.call('h-mark', 'checkOne', charId, id)
      }
    },

    getMarkAdjust: (charId: string, markId: number): number => {
      const char = entitySystem.get('character', charId) as any
      const level = char?.abilities?.[MARK_ABILITY[markId]]?.level ?? 0
      const adjustMap: Record<number, Record<number, number>> = {
        13: { 0: 0, 1: 50, 2: 100, 3: 150 },
        14: { 0: 0, 1: 50, 2: 100, 3: 150 },
        15: { 0: 0, 1: 10, 2: 20, 3: 30 },
        16: { 0: 0, 1: 0, 2: 0, 3: 0 },
        17: { 0: 0, 1: -50, 2: -100, 3: -150 },
        18: { 0: 0, 1: -100, 2: -200, 3: -300 },
        19: { 0: 0, 1: 25, 2: 50, 3: 100 },
      }
      return adjustMap[markId]?.[level] ?? 0
    },
  })

  // 注释：每次 H 行动后实时检测所有刻印（对齐 erArk second_behavior.mark_effect）
  ctx.events.on('game:execution_end', () => {
    // 注释：只检查 H 模式中的角色
    for (const ch of entitySystem.getAll('character')) {
      const c = ch as any
      if (!c.h_state?.is_h) continue
      for (const id of Object.values(MARKS)) {
        ctx.api.call('h-mark', 'checkOne', c.id, id)
      }
    }
  })

  // 注释：每日睡眠结算也检查（非 H 下累积值推进）
  ctx.events.on('game:new_day', (payload: any) => {
    if (payload?.reason === 'forced') return
    for (const char of entitySystem.getAll('character')) {
      const c = char as any
      if (c.h_state?.is_h) continue  // 已在 execution_end 中检查过
      for (const id of Object.values(MARKS)) {
        ctx.api.call('h-mark', 'checkOne', c.id, id)
      }
    }
  })
}

// 注释：获取单次 H 检测值（快乐/无觉用绝顶次数）
// 2026-08-12（audit-b C1）：屈服/苦痛/恐怖/反发直读 base 命名空间——但这些状态
// category=parameter → canonical 在 entity.params → 刻印永不升级。改经 getEntityAttr
// 跨命名空间读取（base/params 均可，params 优先于 base 的既有落位规则不变——SEARCH_ORDER base 在前）
function getCheckValue(char: any, markId: number): number {
  const h = char.h_state
  switch (markId) {
    case 13: // 快乐——本次 H 绝顶次数
      return countOrgasmThisSession(h)
    case 19: // 无觉——本次 H 无意识绝顶次数
      return countUnconsciousOrgasmThisSession(h)
    case 14: // 屈服
      return (getEntityAttr(char, '屈服') ?? 0) + (getEntityAttr(char, '恭顺') ?? 0) + (getEntityAttr(char, '羞耻') ?? 0) / 5
    case 15: // 苦痛
      return (getEntityAttr(char, '苦痛') ?? 0) * 5
    case 16: // 时姦——无自动升级
      return 0
    case 17: // 恐怖
      return (getEntityAttr(char, '恐怖') ?? 0) * 5 + (getEntityAttr(char, '苦痛') ?? 0)
    case 18: // 反发
      return (getEntityAttr(char, '反感') ?? 0) * 5 + (getEntityAttr(char, '抑郁') ?? 0) + (getEntityAttr(char, '恐怖') ?? 0) + (getEntityAttr(char, '苦痛') ?? 0)
    default:
      return 0
  }
}

// 注释：获取累计值（快乐/无觉用累计绝顶，其余同 getCheckValue）
function getCumulativeValue(char: any, markId: number): number {
  const h = char.h_state ?? {}
  switch (markId) {
    case 13: // 快乐——累计绝顶（erArk all_happy_count = sum orgasm_count[state][1]）
      return sumOrgasmCount(h, 1)
    case 19: // 无觉——累计无意识绝顶（erArk all = experience[78]）
      return getUnconsciousOrgasmTotal(char)
    default:
      return getCheckValue(char, markId)
  }
}

// 注释：计算单次 H 绝顶次数（orgasm_count[state][0] 合计——erArk mark_effect single_*_count）
function countOrgasmThisSession(h: any): number {
  return sumOrgasmCount(h, 0)
}

// 注释：计算累计绝顶次数（orgasm_count[state][1] 合计——erArk mark_effect all_happy_count）
// 2026-08-08 修复：原读 experience['orgasm_total']（无人写入 → 恒 0，快乐刻印累计分支静默失效）
function sumOrgasmCount(h: any, idx: number): number {
  if (!h?.orgasm_count) return 0
  let total = 0
  for (const [, counts] of Object.entries(h.orgasm_count) as [string, number[]][]) {
    total += counts[idx] ?? 0
  }
  return total
}

// 注释：计算本次 H 无意识绝顶次数（erArk 无觉刻印 single 同用 orgasm_count[state][0]，
// 无意识绝顶在时停解放时也会写入 orgasm_count——原实现恒 0 TODO 已删除）
function countUnconsciousOrgasmThisSession(h: any): number {
  return sumOrgasmCount(h, 0)
}

// 注释：计算累计无意识绝顶（erArk mark_effect 无觉 all = experience[78]，
// 无意识绝顶经验由 orgasm 结算写入——2026-08-08 修复：原读 experience['unconscious_orgasm']
// 无人写入 → 恒 0，无觉刻印完全无法升级）
function getUnconsciousOrgasmTotal(char: any): number {
  return char?.experience?.['78'] ?? 0
}

// 注释：刻印副作用——设定能力最低值
function applySideEffect(char: any, markId: number, level: number): void {
  const effects = MARK_SIDE_EFFECTS[markId]
  if (!effects) return
  const idx = level - 1
  if (idx < 0 || idx >= effects.length) return
  const effect = effects[idx]
  if (!effect || effect.length < 1) return
  const [abilityName, minLevel] = effect as [string, number]
  if (!char.abilities) char.abilities = {}
  const key = abilityName
  const current = char.abilities[key]?.level ?? 0
  if (current < minLevel) {
    if (!char.abilities[key]) char.abilities[key] = { level: 0, xp: 0 }
    char.abilities[key].level = minLevel
    narrativeLog.write(`${char.name} ${abilityName} 提升至 Lv${minLevel}（${Object.entries(MARKS).find(([, id]) => id === markId)?.[0]}刻印效果）`, 'system', 'h-mark')
  }
}
