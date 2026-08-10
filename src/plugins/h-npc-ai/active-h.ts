// 注释：逆推（NPC 主动 H）——复刻 erArk handle_npc_ai_in_h.py:390-553
//   evaluateBodyPartPrefs（390-458）：部位喜好加权随机（经验权重 1 + 性技能力权重 10，阴茎排除）
//   npcActiveH（460-553）：按部位过滤指令 → 前提过滤 → 均匀随机选一条 → 赋给玩家执行
//   tryPlActiveH：尝试掌握主动权（erArk 无数据记录，本引擎设计——复用实行判定）
//
// 执行模型（grill Q7 定案）：NPC 选指令后赋给玩家执行——行为方向不变（玩家→NPC），
// 发起者变 NPC。指令前提仍是玩家视角（逆推中 T_NPC_NOT_ACTIVE_H 前提因"目标=NPC 是
// active"而失败 → 普通指令自然隐藏，erArk 同款自洽）

import { commandRegistry, type CommandDef } from '../../core/command-registry'
import { commandExecutor } from '../../core/command-executor'
import { entitySystem } from '../../core/entity-system'
import { eventBus } from '../../core/event-bus'
import { gameContext } from '../../core/game-context'
import { apiSystem } from '../../core/api'
import { narrativeLog } from '../../core/narrative-log'
import { errorReporter } from '../../core/error-reporter'
import { premiseRegistry } from '../../core/premise-registry'
import { evaluateCondition } from '../../core/condition'
import { getNpcActiveH, setNpcActiveH, getPlayerId } from './state'
import { filterInstructions, partTagsOfPartId } from './filter'

// 注释：部位权重映射——经验权重 1 + 性技能力权重 10（erArk evaluate_npc_body_part_prefs）
// 性技能力映射为近似（erArk config_ability 表未随提取目录提供，见 复刻攻略/README）：
//   乳/胸 ← 胸技；阴蒂/尿道 ← 指技；阴道/子宫 ← 膣技；肛门 ← 肛技
// 部位经验（char.experience[0..7]，erArk 原 id）权重 1——精确
export const PART_TECHNIQUE: Record<number, string> = {
  0: '胸技', 1: '胸技', 2: '指技',
  4: '膣技', 5: '肛技', 6: '指技', 7: '膣技',
}

function weightedPick<T>(items: T[], weights: number[]): T | null {
  if (items.length === 0) return null
  if (items.length === 1) return items[0]
  let total = 0
  for (const w of weights) total += Math.max(0, w)
  if (total <= 0) {
    return items[Math.floor(Math.random() * items.length)]
  }
  let roll = Math.random() * total
  for (let i = 0; i < items.length; i++) {
    roll -= Math.max(0, weights[i])
    if (roll < 0) return items[i]
  }
  return items[items.length - 1]
}

// 注释：部位喜好加权随机（erArk :390-458）
// 部位 0-7（0=乳 1=胸 2=阴蒂 3=阴茎(强制排除) 4=阴道 5=肛门 6=尿道 7=子宫）
// 权重 = 1 + 部位经验 + 对应性技能力等级×10
export function evaluateBodyPartPrefs(charId: string): number {
  const char = entitySystem.get('character', charId) as any
  if (!char) return 0
  const partIds = [0, 1, 2, 4, 5, 6, 7]
  const weights: number[] = []
  for (const partId of partIds) {
    let w = 1
    const exp = char.experience?.[partId]
    if (typeof exp === 'number' && exp > 0) w += exp
    const tech = PART_TECHNIQUE[partId]
    const abl = tech ? char.abilities?.[tech] : null
    const lv = typeof abl?.level === 'number' ? abl.level : 0
    w += lv * 10
    weights.push(w)
  }
  const picked = weightedPick(partIds, weights)
  return picked ?? 0
}

// 注释：把指令赋给玩家执行（grill Q7 执行入口——直接走 core commandExecutor）
// 效果 target='selected' 解析到 NPC（resolveTarget 读 uiStore.selectedCharacterId）
// 嵌套执行防护：逆推常发生在玩家执行 keep_enjoy 的 effects 链中（EXECUTING），
// 内层 execute 的 finally 会把 executionState 重置为 IDLE——结束后恢复外层状态，
// 防止 UI 指令栏在外层效果链完成前短暂闪现（erArk 逆推在同一执行上下文内）
export async function executeInstructionForNpc(cmdId: string, targetId: string): Promise<boolean> {
  const cmd = commandRegistry.getById(cmdId)
  if (!cmd) return false
  const playerId = getPlayerId()
  if (!playerId) return false
  const prevExecState = gameContext.getExecutionState()
  const player = entitySystem.get('character', playerId) as any
  const ctx: any = {
    api: apiSystem,
    engine: {
      setExecutionState: (s: 'IDLE' | 'EXECUTING') => gameContext.setExecutionState(s),
      emit: (e: string, p: any) => eventBus.emit(e, p),
    },
    uiStore: { selectedCharacterId: targetId },
    gameStore: { player: player ?? { id: playerId } },
    sourceId: playerId,
    _targetIds: [targetId],
    evaluatePremises: (premises: string[]) =>
      premiseRegistry.evaluate(premises, { selectedCharacterId: targetId }, false),
    evaluateCondition: (expr: string) => {
      try {
        return evaluateCondition(expr, gameContext.getContext())
      } catch {
        return false
      }
    },
  }
  await commandExecutor.execute(cmdId, ctx)
  // 注释：恢复外层执行状态（command-executor finally 恒置 IDLE）
  gameContext.setExecutionState(prevExecState)
  return true
}

// 注释：逆推执行器（erArk npc_active_h）——NPC 选行为赋给玩家执行
// 返回 true = 已执行一条指令；false = 无可用指令（逆推状态保持，玩家可再选 keep_enjoy）
export async function npcActiveH(npcId: string): Promise<boolean> {
  const npc = entitySystem.get('character', npcId) as any
  if (!npc) return false
  // erArk :472-474——非逆推状态直接返回
  if (!getNpcActiveH(npc)) return false

  // 部位喜好加权随机（erArk :476-477）
  const partId = evaluateBodyPartPrefs(npcId)

  // 过滤链（erArk :479-537）：部位 tag → 非道具/药物/SM/非逆推 → 破处 → 前提
  const candidates = filterInstructions(partTagsOfPartId(partId), npcId)
  if (candidates.length === 0) {
    // 注释：erArk :539-541——无可选行为返回 0（无叙事，玩家面板仍只有逆推指令）
    return false
  }

  const cmd: CommandDef = candidates[Math.floor(Math.random() * candidates.length)]
  const done = await executeInstructionForNpc(cmd.id, npcId)
  // 注释：逆推经验（erArk settle_behavior.py:675-680 extra_exp_settle——每次行为结算）：
  // 逆推者（NPC）经验 36 逆推 +1；被逆推者（玩家）经验 37 被逆推 +1
  if (done) {
    const playerId = getPlayerId()
    if (playerId) {
      try {
        await apiSystem.call('effect-system', 'execute', [
          { type: 'h_experience', params: { expId: '36', value: 1 }, target: npcId },
          { type: 'h_experience', params: { expId: '37', value: 1 }, target: playerId },
        ], { sourceId: playerId, _targetIds: [npcId], _timeCost: 0 })
      } catch (err) {
        errorReporter.report({
          source: 'h-npc-ai',
          severity: 'warning',
          message: `逆推经验结算失败：${err instanceof Error ? err.message : String(err)}`,
          suggestion: '检查 h-core 是否已加载（h_experience 效果）',
        })
      }
    }
  }
  return done
}

// 注释：尝试掌握主动权（erArk try_pl_active_h，本引擎设计——erArk 数据完全无记录）
// 复用实行判定（calcJudge 经 h-core API——插件间禁止直接 import，铁律）
// 好感/信赖取被判定方（NPC）自己的值（对齐 h-core judge_check：char.base.好感度）
// judgeClass='掌握主动权'（S 类，2026-08-11 新增）：吃天赋个性修正（淫乱/性无知等），
// 但无 [judge.adjustments] 表——不套用"性交"的处女惩罚 -250（语义错位：处女逆推
// 反而不可夺回主导权）
// judgeBase 默认 150：心情修正愤怒保底 +20，base=100 恒成功（失败路径死代码）
// 成功 → 关闭 NPC 逆推 + 叙事；失败 → 继续逆推 + 纯叙事（无惩罚，grill Q8 定案）
export async function tryPlActiveH(npcId: string, judgeBase = 150): Promise<boolean> {
  const npc = entitySystem.get('character', npcId) as any
  if (!npc) return false
  const fav = npc?.base?.['好感度'] ?? 0
  const trust = npc?.base?.['信赖度'] ?? 0
  let result: { success: boolean; partial: boolean; retreated: boolean }
  try {
    result = await apiSystem.call('h-core', 'calcJudge', judgeBase, fav, trust, npcId, '掌握主动权')
  } catch {
    // 注释：h-core 未加载 → fail-closed（判定失败 = 夺不回），禁止静默通过
    result = { success: false, partial: false, retreated: true }
  }
  if (result.success) {
    setNpcActiveH(npc, false)
    narrativeLog.write('你夺回了主动权。', 'dialogue', 'h-npc-ai')
    eventBus.emit('character:changed', { id: npcId })
    return true
  }
  narrativeLog.write('你的尝试被对方轻易化解，主动权仍在对方手中。', 'dialogue', 'h-npc-ai')
  return false
}
