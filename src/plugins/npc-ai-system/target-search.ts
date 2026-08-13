// 注释：目标搜索——前提权重 + 优先级分层（erArk find_character_target/search_target 对应物）
// 语义对齐：
//   - 按 layer 升序逐层搜索，首个有候选的层胜出（erArk config_target_type_index 分层顺序）
//   - 层内：前提权重求和（conditionEngine.getPremiseValue + premiseWeight——前提返回值即权重，erArk `now_weight += premise_judge`）
//     + 目标 condition（现有条件引擎，布尔门，不参与权重）
//   - 加权随机选目标（get_first_only 层取第一个通过的——erArk get_first_only=True 语义）
//   - 全层无候选 → null（调用方延后重试——erArk start_time += 1 分钟）
//   - 前提结果轮内缓存（erArk search_target 共享 premise_data dict——同轮同前提只求值一次）
//   - 数据错误显式暴露（2026-08-10 排查补缺）：未知前提 / 条件字段拼写错误 / 条件表达式
//     抛错——原本会被 strict/默认值**静默淘汰**（目标永不触发且无痕迹），现去重上报一次

import { conditionEngine, premiseWeight } from '../../core/condition-engine'
import { conditionRegistry } from '../../core/condition-registry'
import { gameContext } from '../../core/game-context'
import { errorReporter } from '../../core/error-reporter'
import type { GameContext } from '../../core/types'
import type { AITargetDef } from './types'

export interface SearchResult {
  target: AITargetDef
  weight: number
}

// 注释：去重上报（数据错误只报一次/会话，防 500 NPC × 每 pass 刷屏）
const REPORT_LIMIT = 200
const reportedUnknownPremises = new Set<string>()
const reportedThrowingPremises = new Set<string>()
const reportedInvalidConditions = new Set<string>()
const reportedThrowingConditions = new Set<string>()

function reportOnce(set: Set<string>, key: string, message: string, suggestion: string): void {
  if (set.has(key)) return
  if (set.size >= REPORT_LIMIT) return
  set.add(key)
  errorReporter.report({ source: 'npc-ai-system', severity: 'warning', message, suggestion })
}

// 注释：重置去重上报集合（测试隔离用；生产按会话去重，不重置）
export function resetSearchReports(): void {
  reportedUnknownPremises.clear()
  reportedThrowingPremises.clear()
  reportedInvalidConditions.clear()
  reportedThrowingConditions.clear()
}

// 注释：前提求值上下文——AI 前提 handler 的 ctx 约定：sourceId = 被决策的 NPC
// （erArk handle_premise(premise, character_id) 同义——前提查"自己"）；
// 展开完整 GameContext（handler 可读 time/location/player）
function buildPremiseCtx(charId: string): GameContext {
  return { ...gameContext.getContext(), sourceId: charId, selectedCharacterId: charId }
}

// 注释：单前提求值（erArk search_target 语义：任一前提 <= 0 淘汰，求和即权重；
// 未知前提 → 0（淘汰）——AI 目标前提缺失是数据错误，显式暴露而非静默放行。
// handler 抛错 → 0（淘汰）+ 上报——前提异常不允许拖垮整轮搜索（错误隔离））
function evalPremiseSum(premise: string, charId: string, premiseCache: Map<string, number>): number {
  const key = premise.toLowerCase()
  if (premiseCache.has(key)) return premiseCache.get(key)!
  // 注释：未知前提 → 0 + 去重上报（2026-08-10 补缺：此前 strict 静默淘汰，
  // mod 拼错前提 ID 的目标永不触发且无任何痕迹）
  if (!conditionEngine.getRegisteredPremiseIds().includes(key)) {
    reportOnce(
      reportedUnknownPremises, key,
      `AI 目标引用了未注册的前提 '${premise}'`,
      '检查 ai-targets.toml 的前提拼写；插件前提需在插件 onLoad 注册（内置：AI_TIRED_LEVEL_1/2/3、AI_TIRED、AI_NIGHT、AI_DAY、AI_WORK_TIME、AI_ENTERTAINMENT_TIME、AI_HOME、AI_NOT_AT_HOME、AI_IMPRISONED）',
    )
    premiseCache.set(key, 0)
    return 0
  }
  let weight: number
  try {
    weight = premiseWeight(conditionEngine.getPremiseValue(premise, buildPremiseCtx(charId)))
  } catch (e) {
    // 注释：handler 抛错 → 0（淘汰）+ 去重上报（2026-08-10 排查：此前每次求值都报，
    // 一个坏前提 × 500 NPC × 每 pass = 刷屏）
    reportOnce(
      reportedThrowingPremises, key,
      `AI 前提 '${premise}' 求值抛错：${e instanceof Error ? e.message : String(e)}`,
      '前提 handler 异常 = 数据/插件错误；该目标本轮被淘汰',
    )
    weight = 0
  }
  premiseCache.set(key, weight)
  return weight
}

// 注释：层内候选构建（前提结果缓存）
function collectCandidates(
  charId: string,
  layerTargets: AITargetDef[],
  premiseCache: Map<string, number>,
): SearchResult[] {
  const results: SearchResult[] = []
  // 注释：AI 条件求值上下文——selectedCharacterId 注入被决策的 NPC（self 引用语义：
  // 目标 condition 写 `selected.xxx` 即"本 NPC 的 xxx"；此前用全局上下文会导致
  // selected 解析到 UI 选中角色或 undefined，目标静默淘汰——2026-08-10 排查修复）
  const gc = { ...gameContext.getContext(), selectedCharacterId: charId }
  for (const target of layerTargets) {
    // 注释：condition 布尔门（mod 作者通道）——不满足淘汰
    if (target.condition) {
      // 注释：字段路径校验（去重上报）——条件里拼错的字段路径会被条件引擎按默认值
      // 静默解析（数值 0 / 布尔 false）→ 目标永不触发且无痕迹（2026-08-10 补缺）
      if (!reportedInvalidConditions.has(target.id)) {
        const v = conditionRegistry.validateExpression(target.condition)
        if (!v.ok) {
          reportOnce(
            reportedInvalidConditions, target.id,
            `AI 目标 '${target.id}' 的条件引用了未注册字段：${v.unknown.join(', ')}`,
            '检查 ai-targets.toml 条件拼写；可用字段见 可用条件属性手册.md（selected.* = 本 NPC）',
          )
        } else {
          reportedInvalidConditions.add(target.id)
        }
      }
      try {
        if (!conditionEngine.evaluate(target.condition, gc)) continue
      } catch (e) {
        // 注释：表达式语法错误 → 去重上报（此前每次求值都报，500 NPC 刷屏）
        reportOnce(
          reportedThrowingConditions, target.id,
          `AI 目标 '${target.id}' 条件求值失败：${e instanceof Error ? e.message : String(e)}`,
          `检查 ai-targets.toml 中目标 '${target.id}' 的 condition 表达式`,
        )
        continue
      }
    }
    // 注释：前提权重求和（缓存）
    let weight = 0
    let passed = true
    const premises = target.premises ?? []
    if (premises.length === 0) {
      weight = 1 // 无条件目标默认权重（erArk：无前提 target 权重 1）
    } else {
      for (const premise of premises) {
        const value = evalPremiseSum(premise, charId, premiseCache)
        if (value <= 0) {
          passed = false
          break
        }
        weight += value
      }
    }
    if (!passed) continue
    results.push({ target, weight })
  }
  return results
}

// 注释：加权随机选择（权重 0/负值防御：全 0 → 第一个）
function weightedPick(results: SearchResult[]): SearchResult {
  let total = 0
  for (const r of results) total += Math.max(r.weight, 0)
  if (total <= 0) return results[0]
  let roll = Math.random() * total
  for (const r of results) {
    roll -= Math.max(r.weight, 0)
    if (roll <= 0) return r
  }
  return results[results.length - 1]
}

// 注释：主搜索——按层升序；首个有候选的层胜出；层内 get_first_only 取第一个，
// 否则加权随机；全层无候选 → null（延后重试）
export function searchTarget(
  charId: string,
  targets: AITargetDef[],
): AITargetDef | null {
  const premiseCache = new Map<string, number>()
  // 注释：层分组（保持定义顺序）
  const layers = new Map<number, AITargetDef[]>()
  for (const t of targets) {
    const layer = t.layer ?? 100
    if (!layers.has(layer)) layers.set(layer, [])
    layers.get(layer)!.push(t)
  }
  const sortedLayers = [...layers.keys()].sort((a, b) => a - b)
  for (const layer of sortedLayers) {
    const layerTargets = layers.get(layer)!
    const candidates = collectCandidates(charId, layerTargets, premiseCache)
    if (candidates.length === 0) continue
    // 注释：get_first_only 层——取第一个通过（定义顺序）
    if (layerTargets.some(t => t.get_first_only)) {
      return candidates[0].target
    }
    return weightedPick(candidates).target
  }
  return null
}
