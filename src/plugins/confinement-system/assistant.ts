// 注释：调教助手（阶段C）——confinement 侧判定/选行为（erArk confinement_and_training.py
// get_behavior_id_of_sex_assistant :405 + settle_behavior.py:71-84 触发）
// 职责切分（grill Q8 定案，与 erArk 一比一）：
//   confinement（本文件）：判定（设置12≠0 + 目标被监禁 + 监狱长在场非H中）→
//     选行为（同部位/异部位/指定列表，复用 part:* tag 词表）→ 监狱长 is_h=true +
//     h_state.sex_assist=true → 注册行为源
//   h-npc-ai：per-tick 识别 sex_assist → 向行为源取指令 → executeInstructionForNpc
//
// 设置12（assistant）：0关 / 1同部位（一起欺负玩家选的部位）/ 2异部位 / 3指定列表
// 设置13（target）：0仅囚犯 / 1全员（全员 = 任意 H 目标都触发助手）

import { entitySystem } from '../../core/entity-system'
import { eventBus } from '../../core/event-bus'
import { narrativeLog } from '../../core/narrative-log'
import { errorReporter } from '../../core/error-reporter'
import { apiSystem } from '../../core/api'
import { commandRegistry } from '../../core/command-registry'
import { conditionEngine } from '../../core/condition-engine'
import { gameContext } from '../../core/game-context'
import { getSettings, getWardenId } from './state'

// 注释：注册标记（onEnable 一次；HMR 幂等）
let sourceRegistered = false

// 注释：H 开始 → 助手判定（h:start 事件）
// erArk settle_behavior.py:71-84——玩家执行 H 行为结算时判定；本引擎在 h:start
// 一次判定（会话级），per-tick 行为由行为源持续供给
export async function onHStart(payload: any): Promise<void> {
  const s = getSettings()
  if (s.assistant <= 0) return
  const targetId = payload?.target as string | undefined
  if (!targetId) return
  // 设置13：0=仅囚犯（目标被监禁才触发）/ 1=全员
  const target = entitySystem.get('character', targetId) as any
  if (!target) return
  if (s.target === 0 && target.sp_flag?.imprisonment !== true) return
  // 监狱长存在 + 不在 H 中
  const wardenId = getWardenId()
  if (!wardenId || wardenId === targetId) return
  const warden = entitySystem.get('character', wardenId) as any
  if (!warden) return
  if (warden.h_state?.is_h) return
  // ⚠️ 修复（2026-08-14 审查）：监狱长必须与目标同地点才可当助手（erArk 语义——
  // 监狱长在关押区工作；千里之外拉进 H 是静默叙事错位）；离线/无意识监狱长跳过
  const wardenLoc = warden.current_location
  const targetLoc = target.current_location
  if (wardenLoc && targetLoc && wardenLoc !== targetLoc) {
    narrativeLog.write(`${warden.name ?? wardenId} 不在附近，无法作为调教助手。`, 'system', 'confinement-system')
    return
  }
  if (warden.sp_flag?.offline || (warden.sp_flag?.unconscious_h ?? 0) >= 1) return

  // 拉监狱长入 H（erArk :84——h_state.sex_assist = True；is_h 由本引擎 H 模型承担）
  // ⚠️ 2026-08-14 二次审查修复：h_state 必须完整（对齐 h-npc-ai setNpcActiveH 的完整结构
  // 写法）——原只写 {is_h, target_character_id, sex_assist}，h-core execution_end 的
  // orgasmJudge 遍历 is_h 角色读 orgasm_count[part] 会 undefined → 静默 NaN；且监狱长在
  // h:start 之后才 is_h，未走 enterHBlocksForAllInH，需手动补 h_wait 块（冻结日常 AI）
  warden.h_state = {
    target_character_id: payload?.ally ?? null,
    insert_position: -1,
    current_sex_position: -1,
    current_womb_sex_position: 0,
    orgasm_count: {},
    orgasm_level: {},
    orgasm_edge: 0,
    endure_not_shoot_count: 0,
    shoot_semen_amount: 0,
    just_shoot: 0,
    used_semen_energy_agent: false,
    thick_semen: false,
    bondage_type: 0,
    condom_count: [0, 0],
    sex_toy_level: 0,
    is_h: true,
    turn_count: 0,
    extra_orgasm_feel: {},
    extra_orgasm_count: 0,
    orgasm_edge_count: {},
    time_stop_orgasm_count: {},
    plural_orgasm_set: [],
    shoot_position_body: -1,
    pending_orgasm_feel: {},
    sex_assist: true,
  }
  try {
    await apiSystem.call('h-npc-ai', 'enterHBlock', wardenId)
  } catch { /* h-npc-ai 未加载 → 跳过（日常 AI 冻结缺失，可接受降级） */ }
  eventBus.emit('character:changed', { id: wardenId })
  narrativeLog.write(`${warden.name ?? wardenId} 作为调教助手加入了。`, 'system', 'confinement-system')
}

// 注释：H 结束 → 清理助手标记（h:end 事件——endHScene 已清 is_h，这里只清标记）
export function onHEnd(): void {
  // 注释：endHScene 清 h_state 时 sex_assist 一并消失；此处仅防御性清理
}

// 注释：行为源（h-npc-ai per-tick 消费）——选一条助手行为指令 id
// 返回 null = 无可用行为（监狱长只是陪着）
async function sexAssistBehaviorSource(wardenId: string): Promise<string | null> {
  const s = getSettings()
  const warden = entitySystem.get('character', wardenId) as any
  if (!warden?.h_state?.is_h) return null
  if (s.assistant <= 0) return null
  // 监狱长 6 异常（无意识）/被捆绑 → 不行动（erArk :410-412）
  if ((warden.sp_flag?.unconscious_h ?? 0) >= 1) return null

  const playerId = warden.h_state.target_character_id
  const player = playerId ? entitySystem.get('character', playerId) as any : null
  // 玩家当前行为部位（h_state.current_sex_position：-1未插/0V/1A/2U/3W/4M）
  const playerPart = player?.h_state?.current_sex_position ?? -1

  // 候选指令池：category=sex 的指令，排除控制/道具/药物/SM
  // ⚠️ 2026-08-14 三轮审查：候选需过前提+条件检查（与 h-npc-ai filter.ts passesPremises/
  // passesCondition 同语义）——原实现不过滤，选中前提不满足的指令后执行静默跳过（无效行为）
  const candidates: { id: string; part: string[] }[] = []
  for (const cmd of commandRegistry.getAll()) {
    if (cmd.source !== 'instructions') continue
    if (cmd.category !== 'sex' && cmd.category !== undefined) continue
    const sub = cmd.sub_category ?? ''
    if (sub === 'item' || sub === 'drug' || sub === 'sm') continue
    const tags = cmd.tags ?? []
    if (tags.includes('flag:control') || tags.includes('flag:no-active')) continue
    // 部位 tag（part:*）
    const parts = tags.filter(t => t.startsWith('part:')).map(t => t.slice(5))
    if (parts.length === 0) continue
    // 前提检查（target 注入监狱长——执行时 target=selected=监狱长）
    const ctx = { ...gameContext.getContext(), selectedCharacterId: wardenId }
    if (cmd.premises && cmd.premises.length > 0) {
      try {
        if (!conditionEngine.evaluatePremises(cmd.premises, ctx)) continue
      } catch { continue }
    }
    if (cmd.condition) {
      try {
        if (!conditionEngine.evaluate(cmd.condition, ctx)) continue
      } catch { continue }
    }
    candidates.push({ id: cmd.id, part: parts })
  }
  if (candidates.length === 0) return null

  // 设置12 模式：
  // 1 = 同部位（选与玩家当前部位一致的指令）
  // 2 = 异部位（选不同的）
  // 3 = 指定列表（assistant_list；空列表 = 随机全部）
  let pool = candidates
  if (s.assistant === 1 || s.assistant === 2) {
    const partKey = partKeyOfPosition(playerPart)
    const same = candidates.filter(c => partKey && c.part.includes(partKey))
    pool = s.assistant === 1 ? (same.length > 0 ? same : candidates) : (same.length > 0 ? candidates.filter(c => !c.part.includes(partKey!)) : candidates)
  } else if (s.assistant === 3 && s.assistant_list.length > 0) {
    const listed = candidates.filter(c => s.assistant_list.includes(c.id))
    pool = listed.length > 0 ? listed : candidates
  }
  // 禁止列表排除
  if (s.assistant_ban.length > 0) {
    const banned = new Set(s.assistant_ban)
    pool = pool.filter(c => !banned.has(c.id))
  }
  if (pool.length === 0) return null
  return pool[Math.floor(Math.random() * pool.length)].id
}

// 注释：H 部位（insert_position）→ part tag（erArk N/B/C/V/A/U/W 对应）
function partKeyOfPosition(position: number): string | null {
  switch (position) {
    case 0: return 'vagina'
    case 1: return 'anus'
    case 2: return 'urethra'
    case 3: return 'womb'
    case 4: return 'mouth'
    default: return null
  }
}

// 注释：注册助手（onEnable 调用——幂等）
export async function registerAssistant(): Promise<void> {
  if (sourceRegistered) return
  sourceRegistered = true
  try {
    await apiSystem.call('h-npc-ai', 'registerSexAssistSource', sexAssistBehaviorSource)
  } catch (err) {
    errorReporter.report({
      source: 'confinement-system',
      severity: 'warning',
      message: `注册调教助手行为源失败：${err instanceof Error ? err.message : String(err)}`,
      suggestion: '检查 h-npc-ai 是否已加载（registerSexAssistSource API）',
    })
  }
}

// 注释：重置注册标记（测试用）
export function resetAssistant(): void {
  sourceRegistered = false
}
