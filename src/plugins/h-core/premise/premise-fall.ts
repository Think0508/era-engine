// 注释：陷落前提——查角色爱情系/隶属系天赋等级（FALL_LEVEL_*）
// erArk 依据：attr_calculation.py:891-921 get_character_fall_level
//   （爱情系 201-204 → 1-4；隶属系 211-214 → minus_flag 负数 -1~-4）
// 修复记录（2026-08-08）：原实现用数字键 char.talents[201] 查按名存储的 talents
//   （思慕→爱侣/屈从→奴隶）→ 恒 0 → FALL_LEVEL_* 全部静默失效（死键）

import { entitySystem } from '../../../core/entity-system'

const LOVE_TALENTS = ['思慕', '恋慕', '恋人', '爱侣']
const SUB_TALENTS = ['屈从', '驯服', '宠物', '奴隶']

export function registerFallPremises(registry: any): void {
  // 注释：FALL_LEVEL_{cmp}_{val} 全组合注册（T2）——cmp ∈ G/L/E/GE/LE，val ∈ -4..4
  // 覆盖 talk-common 迁移数据的全部变体（GE_-1/L_-1/E_3 等）；通用解析保证任意值可用
  for (const cmp of ['G', 'L', 'E', 'GE', 'LE']) {
    for (let val = -4; val <= 4; val++) {
      registerFallLevelVariant(registry, `FALL_LEVEL_${cmp}_${val}`)
    }
  }
}

// 注释：通用 FALL_LEVEL_{cmp}_{val} 解析与注册（T2）
// 变体来自 CVP G 类型的静态转换（convertCVPPremise 输出 FALL_LEVEL_GE_-1 等任意比较/负值），
// 数据里出现哪些变体由 talk-common 加载后扫描并调用 registerFallLevelVariant 动态注册
export function parseFallLevelPremise(id: string): { cmp: string; val: number } | null {
  const m = id.match(/^FALL_LEVEL_(G|L|E|GE|LE)_(-?\d+)$/)
  if (!m) return null
  return { cmp: m[1], val: parseInt(m[2], 10) }
}

const CMP_FN: Record<string, (a: number, b: number) => boolean> = {
  G: (a, b) => a > b,
  L: (a, b) => a < b,
  E: (a, b) => a === b,
  GE: (a, b) => a >= b,
  LE: (a, b) => a <= b,
}

/** 注册一个 FALL_LEVEL 变体（talk-common 数据扫描时调用；重复注册覆盖为同语义） */
export function registerFallLevelVariant(registry: any, id: string): void {
  const parsed = parseFallLevelPremise(id)
  if (!parsed) return
  const fn = CMP_FN[parsed.cmp]
  if (!fn) return
  registry.register(id, (ctx: any) => {
    const charId = ctx.selectedCharacterId ?? ctx.uiStore?.selectedCharacterId
    if (!charId) return false
    return fn(getFallLevel(charId), parsed.val)
  })
}

// 注释：获取陷落等级（0=未陷落；爱情系 1-4；隶属系 -1~-4，erArk minus_flag 语义）
export function getFallLevel(charId: string): number {
  const char = entitySystem.get('character', charId) as any
  if (!char?.talents) return 0

  for (let i = 0; i < LOVE_TALENTS.length; i++) {
    if (char.talents[LOVE_TALENTS[i]]) return i + 1
  }
  for (let i = 0; i < SUB_TALENTS.length; i++) {
    if (char.talents[SUB_TALENTS[i]]) return -(i + 1)
  }
  return 0
}
