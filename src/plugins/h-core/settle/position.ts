// 注释：喜欢体位（favorite sex position）——erArk handle_talent.py:336-368 settle_favorite_sex_position
// 语义：角色最喜欢某个性交体位 → 该体位的快感系数 +0.5（chara_feel_state_adjust:319-322）
//
// 判定顺序（与 erArk 一致）：
//   1. 已有体位喜好天赋（talents.toml 带 favorite_position 字段，1-12）→ 直接返回该体位
//   2. 否则看体位经验（experience 141-152，分别对应体位 1-12）：
//      存在 ≥100 的经验 → 取最高者（erArk 遍历取 max），并把该体位设为喜好（授予天赋）
//
// 架构决策（2026-08-08 grilling 确认）：
//   - 公式计算（getFavoritePosition）保持只读纯函数——不藏副作用
//   - 天赋授予（grantFavoritePositionIfDue）放在 h_scene 的 execution_end 统一做（G2 决策：
//     erArk 在公式内懒授予，引擎移到清晰回调点；行为可观测一致——经验达标后下一次 H 指令授予）

import { narrativeLog } from '../../../core/narrative-log'

// 体位经验 ID 段：141-152 → 体位 1-12（erArk settle_favorite_sex_position:352-357）
const POSITION_EXP_START = 141
const POSITION_EXP_COUNT = 12

/**
 * 只读：角色当前喜欢体位（-1 = 无）
 * 天赋命中优先；否则按体位经验（≥100 取最高）推导，不写天赋
 */
export function getFavoritePosition(ch: any, mod: any): number {
  if (!ch) return -1
  // 1. 天赋命中（talents.toml 定义带 favorite_position 字段）
  const defs = (mod?.talentDefs as Record<string, any> | undefined) ?? {}
  for (const [talentId, def] of Object.entries(defs) as [string, any][]) {
    const fp = def?.favorite_position as number | undefined
    if (typeof fp === 'number' && fp >= 1 && fp <= 12 && ch.talents?.[talentId]) {
      return fp
    }
  }
  // 2. 体位经验推导（最高 ≥100 者）
  const exp = ch.experience ?? {}
  let best = -1
  let bestExp = 0
  for (let i = 0; i < POSITION_EXP_COUNT; i++) {
    const v = exp[String(POSITION_EXP_START + i)] ?? 0
    if (v > bestExp && v >= 100) {
      bestExp = v
      best = i + 1
    }
  }
  return best
}

/**
 * 懒授予：无体位喜好天赋且体位经验 ≥100 时，授予最高经验对应的喜好天赋
 * （erArk settle_favorite_sex_position:358-367 的授予逻辑；调用点 = h_scene execution_end）
 * 注：只检查"天赋是否已存在"——经验推导的喜欢体位（getFavoritePosition 分支 2）不视为已授予，
 * 否则经验达标后天赋永不落账（2026-08-08 审查修复）
 * @returns 授予的体位 ID（未授予 = null）
 */
export function grantFavoritePositionIfDue(ch: any, mod: any): number | null {
  if (!ch) return null
  const defs = (mod?.talentDefs as Record<string, any> | undefined) ?? {}
  // 已有任意体位喜好天赋 → 不授予（防重复）
  for (const [talentId, def] of Object.entries(defs) as [string, any][]) {
    const fp = def?.favorite_position as number | undefined
    if (typeof fp === 'number' && fp >= 1 && fp <= 12 && ch.talents?.[talentId]) return null
  }
  // 无 ≥100 经验 → 不授予
  const exp = ch.experience ?? {}
  let best = -1
  let bestExp = 0
  for (let i = 0; i < POSITION_EXP_COUNT; i++) {
    const v = exp[String(POSITION_EXP_START + i)] ?? 0
    if (v > bestExp && v >= 100) {
      bestExp = v
      best = i + 1
    }
  }
  if (best === -1) return null
  // 找到对应的喜好天赋定义（favorite_position === best）
  const talentId = Object.entries(defs).find(([, def]) => (def as any)?.favorite_position === best)?.[0]
  if (!talentId) return null
  if (!ch.talents) ch.talents = {}
  ch.talents[talentId] = 1
  const talentName = defs[talentId]?.name ?? talentId
  const posName = (mod?.hConfig as any)?.sex_positions?.[best]?.name ?? String(best)
  narrativeLog.write(`○${ch.name ?? ''}因为经常使用${posName}，获得了【${talentName}】`, 'dialogue', 'h-core')
  return best
}
