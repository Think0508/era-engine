// 注释：关系称呼生成器（关系系统 v2，2026-08-10）——纯算法：端 + 性别 + 词表 → 名称
// 词表数据（RelationPairDef）来自插件默认层/mod 定义（relations.toml [pairs] 段），
// 本模块只做组合，不认知任何具体关系名（core 通用机制）。
//
// 两层名称（grill 定稿）：
//   panel   成对名（关系面板显示）——"父子/父女/母子/母女"（big 词 + small 词拼接）
//   address 单方称呼（口上 {relation_display}）——"父亲/儿子/母亲/女儿"
// 性别约定：角色 base.性别 1=男 2=女（erArk 惯例；0/其他 → 男兜底）

import type { RelationPairDef, RelationSide } from './mod-loader'

/** 按性别取词（1=男 2=女，其他 → 男兜底） */
export function genderWord(genderValue: number, male: string, female: string): string {
  return genderValue === 2 ? female : male
}

/**
 * 生成成对名（panel）——关系面板显示。
 * 端对型：big 词（按大端角色性别）+ small 词（按小端角色性别）拼接；
 * 对称型：pair.panel 固定字符串。
 */
export function resolveRelationPanel(
  pair: RelationPairDef,
  bigSmallGenders: { bigGender: number; smallGender: number } | null,
): string {
  if (typeof pair.panel === 'string') return pair.panel
  if (!pair.panel) return '关系'
  if (!bigSmallGenders) return '关系'
  const big = genderWord(bigSmallGenders.bigGender, pair.panel.big_male, pair.panel.big_female)
  const small = genderWord(bigSmallGenders.smallGender, pair.panel.small_male, pair.panel.small_female)
  return `${big}${small}`
}

/**
 * 生成单方称呼（address）——"A 是 B 的 xx" 的 xx。
 * 端对型：按 A 的端 + A 的性别（big 端 → 父/母，small 端 → 子/女）；
 * 对称型：按 A 自己的性别（丈夫/妻子）。
 */
export function resolveRelationAddress(
  pair: RelationPairDef,
  side: RelationSide | null, // null = 对称类型
  genderValue: number,
): string {
  if (pair.address) {
    if ('male' in pair.address && 'female' in pair.address) {
      // 对称词表 { male, female }
      return genderWord(genderValue, pair.address.male, pair.address.female)
    }
    // 端对词表 { big_male, big_female, small_male, small_female }
    if (side === 'big') return genderWord(genderValue, pair.address.big_male, pair.address.big_female)
    if (side === 'small') return genderWord(genderValue, pair.address.small_male, pair.address.small_female)
  }
  return '关系'
}
