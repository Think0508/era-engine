// 注释：h-mark 插件——刻印系统
// 7种刻印(ability 13-19): 快乐/屈服/苦痛/时姦/恐怖/反发/无觉
// 刻印为 ability（等级 0-3），影响实行判定、好感结算、状态变化
// 升级条件检测在睡眠结算时触发

import type { PluginContext } from '../../core/types'
import { entitySystem } from '../../core/entity-system'
import { narrativeLog } from '../../core/narrative-log'

// 注释：刻印 ID 映射
const MARKS: Record<string, number> = {
  '快乐': 13, '屈服': 14, '苦痛': 15, '时姦': 16, '恐怖': 17, '反发': 18, '无觉': 19,
}

// 注释：刻印升级条件 [LV1, LV2, LV3]
// 各刻印的检测值来源不同
const MARK_UP_CONDITIONS: Record<string, number[]> = {
  '快乐': [5, 20, 50],      // 累计绝顶次数
  '屈服': [30000, 50000, 100000],  // 屈服值
  '苦痛': [20000, 40000, 80000],   // 苦痛值×5
  '恐怖': [20000, 40000, 80000],   // 恐怖值×5+苦痛
  '反发': [10000, 30000, 80000],   // 反感值×5+抑郁+恐怖+苦痛
}

export function onLoad(_ctx: PluginContext): void {
  // 注释：刻印不需要 effect type，检测在睡眠时触发
}

export function onEnable(ctx: PluginContext): void {
  ctx.api.register('h-mark', {
    // 注释：获取刻印等级（0=无, 1-3）
    getLevel: (charId: string, markId: number): number => {
      const char = entitySystem.get('character', charId) as any
      // 注释：刻印存为 ability
      if (!char?.abilities) return 0
      const ab = char.abilities[`mark_${markId}`]
      return ab?.level ?? 0
    },
    // 注释：检查并尝试升级所有刻印
    checkAll: (charId: string): void => {
      const char = entitySystem.get('character', charId) as any
      if (!char) return
      for (const [name, id] of Object.entries(MARKS)) {
        const key = `mark_${id}`
        const currentLevel = char.abilities?.[key]?.level ?? 0
        if (currentLevel >= 3) continue // 注释：已满级
        const conditions = MARK_UP_CONDITIONS[name]
        if (!conditions) continue
        // 注释：获取检测值
        const checkValue = getCheckValue(char, id)
        const targetLevel = currentLevel + 1
        if (checkValue >= (conditions[targetLevel - 1] ?? Infinity)) {
          // 注释：升级
          if (!char.abilities) char.abilities = {}
          if (!char.abilities[key]) char.abilities[key] = { level: 0, xp: 0 }
          char.abilities[key].level++
          narrativeLog.write(`${char.name} 获得 ${name}刻印 LV${char.abilities[key].level}`, 'system', 'h-mark')
        }
      }
    },
    // 注释：刻印修正值（供 h-core 公式调用）
    getMarkAdjust: (charId: string, markId: number): number => {
      const char = entitySystem.get('character', charId) as any
      const level = char?.abilities?.[`mark_${markId}`]?.level ?? 0
      // 注释：刻印修正表（正负值）
      const adjustMap: Record<number, Record<number, number>> = {
        13: { 0: 0, 1: 50, 2: 100, 3: 150 },   // 快乐刻印 +实行判定
        14: { 0: 0, 1: 50, 2: 100, 3: 150 },   // 屈服刻印
        15: { 0: 0, 1: 10, 2: 20, 3: 30 },     // 苦痛刻印
        16: { 0: 0, 1: 0, 2: 0, 3: 0 },        // 时姦刻印
        17: { 0: 0, 1: -50, 2: -100, 3: -150 }, // 恐怖刻印
        18: { 0: 0, 1: -100, 2: -200, 3: -300 }, // 反发刻印
        19: { 0: 0, 1: 25, 2: 50, 3: 100 },    // 无觉刻印
      }
      return adjustMap[markId]?.[level] ?? 0
    },
  })

  // 注释：监听 game:new_day → 睡眠结算时检测刻印升级
  ctx.events.on('game:new_day', (payload: any) => {
    // 注释：非 forced 才检测（正常睡眠）
    if (payload?.reason === 'forced') return
    for (const char of entitySystem.getAll('character')) {
      const c = char as any
      if (c.id === 'player') continue // TODO: 玩家不在睡眠结算中检测
      ctx.api.call('h-mark', 'checkAll', c.id)
    }
  })
}

// 注释：获取刻印检测值
function getCheckValue(char: any, markId: number): number {
  const base = char.base ?? {}
  const experience = char.experience ?? {}
  switch (markId) {
    case 13: // 快乐——累计绝顶次数
      return experience['orgasm_total'] ?? 0
    case 14: // 屈服=(屈服+恭顺+羞耻/5)
      return (base['屈服'] ?? 0) + (base['恭顺'] ?? 0) + (base['羞耻'] ?? 0) / 5
    case 15: // 苦痛=苦痛×5
      return (base['苦痛'] ?? 0) * 5
    case 17: // 恐怖=恐怖×5+苦痛
      return (base['恐怖'] ?? 0) * 5 + (base['苦痛'] ?? 0)
    case 18: // 反发=反感×5+抑郁+恐怖+苦痛
      return (base['反感'] ?? 0) * 5 + (base['抑郁'] ?? 0) + (base['恐怖'] ?? 0) + (base['苦痛'] ?? 0)
    default:
      return 0
  }
}
