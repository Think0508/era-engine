// 注释：gain-rule-system 规则引擎——「满足条件后获得xx」统一管线
// 2026-08-16 建（grill 定稿）：
//   - 数据：mod.gainRules（gain-rules.toml）+ mod.talentDefs 的 gain 语法糖（编译为规则）
//   - 触发时机：auto（execution 玩家指令后 / npc-settle NPC 行为结算 / sleep 睡觉全量）+
//               manual（UI 候选，API 查询/确认）+ event（步骤4）
//   - 检查模型：增量——只有发生行为的角色才检查（erArk character_behavior gain_talent type=0）
//   - once：达成状态存 char.rule_state（L3 引擎独占字段，存档持久）
//   - {self}：scope=all 逐角色代入时文本替换为角色 ID（求值前替换 + selected 同步）
// 天赋 gain 迁移：talents.toml 内嵌 gain 保留为语法糖，编译为规则（effects=[grant_talent]）；
// 现有 gain_type 语义：0 随时（execution/npc-settle）/ 3 睡觉（sleep）/ 1 手动（manual）

import { modLoader } from '../../core/mod-loader'
import { entitySystem } from '../../core/entity-system'
import { gameContext } from '../../core/game-context'
import { conditionEngine } from '../../core/condition-engine'
import { conditionRegistry } from '../../core/condition-registry'
import { evaluateUpgradeNeeds } from '../../core/upgrade-needs'
import { narrativeLog } from '../../core/narrative-log'
import { errorReporter } from '../../core/error-reporter'
import { apiSystem } from '../../core/api'
import type { GainRuleDef, TalentGain } from '../../core/mod-types'

// 内部编译规则：天赋 gain 语法糖展开后的统一形态
export interface CompiledRule {
  id: string
  source: 'talent' | 'rule' | 'achievement'
  scope: string               // player | all | manual | 固定角色 ID
  when: string                // auto | event:xxx | manual
  gainType?: number           // 天赋规则保留（0 随时 / 3 睡觉 / 1 手动）
  condition?: string
  needs?: TalentGain['needs']
  lose_condition?: string
  lose_effects?: any[]
  once: boolean
  effects: any[]
  role_mapping?: Record<string, string>
}

export type AutoContext = 'execution' | 'npc-settle' | 'sleep'

const reportedRuleErrors = new Set<string>()

// 注释：求值错误去重上报（防刷屏；错误隔离不阻断其他规则）
function reportRuleError(ruleId: string, msg: string): void {
  const key = `${ruleId}:${msg}`
  if (reportedRuleErrors.has(key)) return
  reportedRuleErrors.add(key)
  errorReporter.report({
    source: 'gain-rule-system',
    severity: 'warning',
    message: `规则 '${ruleId}' 求值失败：${msg}`,
    suggestion: '检查规则 condition/needs 表达式（字段路径/前提拼写）',
  })
}

// 注释：{self} 占位符替换——scope=all 逐角色代入时，条件里的 {self} 替换为 selected 根
// （selected 已在求值前同步为该角色 ID；条件引擎不认知 {self}，直接替换为 selected 后
//  走 selected.xxx → character.{id}.xxx 解析链。⚠️ 不能替换为裸角色 ID：'npc_1.亲密'
//  不是条件引擎合法根路径，会静默解析为 0 导致规则永不触发（2026-08-16 审查修复））
function replaceSelf(expr: string, _charId: string): string {
  if (!expr.includes('{self}')) return expr
  return expr.replace(/\{self\}/g, 'selected')
}

// 注释：角色达成状态（once 规则）——char.rule_state（L3 字段，存档持久）
function ruleStateOf(char: any): Record<string, boolean> {
  if (!char.rule_state) char.rule_state = {}
  return char.rule_state
}

// 注释：全局规则状态（scope=global 的规则）——存档级全局（gameStateProviders 持久化）。
// ⚠️ 2026-08-16 审查修复（C2）：此前 scope=global 规则把 once 状态写在每角色 rule_state，
// 每个角色各触发一次 → 带奖励的 global 成就重复发放。现统一存全局表。
let globalRuleState: Record<string, boolean> = {}

export function getGlobalRuleState(): Record<string, boolean> {
  return globalRuleState
}
export function setGlobalRuleState(data: Record<string, boolean>): void {
  globalRuleState = data ?? {}
}

/** 规则 once 状态容器——scope=global → 全局表；否则 → 角色 rule_state */
function ruleStateContainer(
  rule: CompiledRule,
  char: any,
  playerId: string | undefined,
): Record<string, boolean> | null {
  if (rule.scope === 'global') return globalRuleState
  if (rule.scope === 'player') return char?.id === playerId ? ruleStateOf(char) : null
  // all / manual / 固定角色 ID——作用于当前检查角色
  return ruleStateOf(char)
}

/** 规则是否作用于该角色（scope 判定） */
function appliesToChar(rule: CompiledRule, charId: string, playerId: string | undefined): boolean {
  if (rule.scope === 'player') return charId === playerId
  if (rule.scope === 'all' || rule.scope === 'global') return true  // global：任何角色检查（状态存全局表）
  return rule.scope === charId   // 固定角色 ID
}

/** 规则在该检查上下文中是否应该检查（gain_type 语义保留） */
function contextMatches(rule: CompiledRule, ctx: AutoContext): boolean {
  if (rule.source === 'talent' && rule.gainType !== undefined) {
    // erArk gain_type：0 随时（execution + npc-settle 行为结算查）/ 3 睡觉（仅 sleep 查）/
    // 1 手动（不走 auto）。⚠️ gain_type=0 不得在 sleep 上下文检查（2026-08-16 二轮审查：
    // 原实现 sleep 也查 0——迁移前 checkTalentGain(c.id, 3) 只查 gain_type=3，语义回归）
    if (rule.gainType === 3) return ctx === 'sleep'
    if (rule.gainType === 1) return false
    if (rule.gainType === 0) return ctx !== 'sleep'
    return false
  }
  // 通用规则（when=auto）：所有 auto 上下文都检查
  return true
}

/** 条件满足判定（condition 表达式 + needs 语义化需求；两者任一满足即过，与天赋 gain 一致）
 *  selectedOverride：scope=all 逐角色检查时同步 selected（条件里 selected.xxx 引用该角色）
 *  ⚠️ sourceId 注入：premise(X) handler 按 AGENTS §8 读 ctx.sourceId（触发者/被判定者）——
 *  规则检查场景被判定者 = 当前检查角色（2026-08-16 三轮审查：原缺失 → 前提 handler 静默拿 undefined）
 */
function ruleSatisfied(rule: CompiledRule, char: any, charId: string, selectedOverride?: string): boolean {
  const base = gameContext.getContext()
  const gc = selectedOverride ? { ...base, selectedCharacterId: selectedOverride } : base
  gc.sourceId = charId
  let satisfied = false
  if (rule.condition) {
    try {
      const expr = replaceSelf(rule.condition, charId)
      satisfied = conditionEngine.evaluate(expr, gc)
    } catch (err) {
      reportRuleError(rule.id, err instanceof Error ? err.message : String(err))
    }
  }
  if (!satisfied && rule.needs) {
    satisfied = evaluateUpgradeNeeds(char, rule.needs).satisfied
  }
  return satisfied
}

/** 执行规则 effects（复用 effect-system；sourceId=触发角色，selected 同步角色）
 *  返回是否成功（effect-system execute 抛错 → false；无效果 → true）——
 *  once 状态在成功后标记（I1 修复：效果失败不得永久跳过规则，可重试）
 */
async function executeRuleEffects(rule: CompiledRule, charId: string, extra?: any): Promise<boolean> {
  if (!rule.effects || rule.effects.length === 0) return true
  try {
    await apiSystem.call('effect-system', 'execute', rule.effects, {
      sourceId: charId,
      _targetIds: [charId],
      selectedCharacterId: charId,
      ...extra,
    })
    return true
  } catch (err) {
    errorReporter.report({
      source: 'gain-rule-system',
      severity: 'warning',
      message: `规则 '${rule.id}' 效果执行失败：${err instanceof Error ? err.message : String(err)}`,
    })
    return false
  }
}

/** 单个角色 auto 检查（增量模型核心）——检查该角色的全部适用 auto 规则 */
export async function checkAutoForChar(charId: string, ctx: AutoContext): Promise<void> {
  const char = entitySystem.get('character', charId) as any
  if (!char) return
  const rules = getCompiledRules()
  const playerId = gameContext.getContext().player?.id
  for (const rule of rules) {
    if (rule.when !== 'auto') continue
    if (!contextMatches(rule, ctx)) continue
    if (!appliesToChar(rule, charId, playerId)) continue

    // scope=all/global 逐角色检查：条件里 selected.xxx 引用当前角色（{self} 替换为 selected 后同理）
    const selectedOverride = (rule.scope === 'all' || rule.scope === 'global') ? charId : undefined

    // once 状态容器（global → 全局表；其他 → 角色 rule_state）
    const state = ruleStateContainer(rule, char, playerId)
    if (rule.once && state && state[rule.id]) continue

    const satisfied = ruleSatisfied(rule, char, charId, selectedOverride)

    if (satisfied) {
      // I1 修复：效果执行成功后才标记 once（失败可重试，不静默丢弃）
      const ok = await executeRuleEffects(rule, charId)
      if (ok && rule.once && state) state[rule.id] = true
    } else if (rule.lose_condition) {
      // 失去条件（lose_condition，erArk 可失去素质语义：精液膨腹<6000 失去等）——
      // 获得条件不满足但失去条件满足 → 执行 lose_effects（作者写 remove_talent 即失去）
      const loseSatisfied = ruleSatisfiedLose(rule, charId, selectedOverride)
      if (loseSatisfied && rule.lose_effects && rule.lose_effects.length > 0) {
        await executeRuleEffects({ ...rule, effects: rule.lose_effects }, charId)
      }
    }
  }
}

/** lose_condition 求值（表达式；needs 不参与失去判定） */
function ruleSatisfiedLose(rule: CompiledRule, charId: string, selectedOverride?: string): boolean {
  if (!rule.lose_condition) return false
  const base = gameContext.getContext()
  const gc = selectedOverride ? { ...base, selectedCharacterId: selectedOverride } : base
  gc.sourceId = charId
  try {
    const expr = replaceSelf(rule.lose_condition, charId)
    return conditionEngine.evaluate(expr, gc)
  } catch (err) {
    reportRuleError(rule.id, err instanceof Error ? err.message : String(err))
    return false
  }
}

// 注释：全量检查（睡觉时）——遍历所有角色
export async function checkAutoAll(ctx: AutoContext): Promise<void> {
  const playerId = gameContext.getContext().player?.id
  const chars = entitySystem.getAll('character')
  for (const char of chars as any[]) {
    if (!char?.id) continue
    if (char.id === playerId && ctx === 'npc-settle') continue
    await checkAutoForChar(char.id, ctx)
  }
}

// ============ 事件触发（when=event:xxx）============

// 注释：事件触发规则检查——payload 注入 event 根域 + role_mapping 映射执行目标
// （grill 定稿：条件用 event 根域直接引用 payload；效果目标经 role_mapping 显式声明）
export async function checkEventRule(rule: CompiledRule, payload: any): Promise<void> {
  if (!rule.condition) return
  const gc = gameContext.getContext()
  const eventCtx = { ...gc, eventPayload: payload }

  // selected 同步（scope=player 且条件引用 selected——事件规则默认对玩家判定）
  const playerId = gameContext.getContext().player?.id

  // role_mapping：payload 字段 → selected/self 等执行上下文角色
  // 例如 { source = "event.character", target = "event.target" }
  const mapped = { ...rule.role_mapping }
  let selectedOverride: string | undefined
  let sourceOverride: string | undefined
  if (mapped.source) {
    sourceOverride = String(mapped.source).startsWith('event.')
      ? resolveEventPath(payload, String(mapped.source).slice('event.'.length))
      : String(mapped.source)
  }
  if (mapped.target) {
    selectedOverride = String(mapped.target).startsWith('event.')
      ? resolveEventPath(payload, String(mapped.target).slice('event.'.length))
      : String(mapped.target)
  }
  // 条件里 selected.xxx 指向事件目标（role_mapping.target 映射的角色）——与执行目标一致
  if (selectedOverride) {
    eventCtx.selectedCharacterId = selectedOverride
  }
  // 前提 handler 上下文：sourceId = 触发者（sourceOverride 映射或玩家）
  eventCtx.sourceId = sourceOverride ?? playerId ?? null

  try {
    const satisfied = conditionEngine.evaluate(rule.condition, eventCtx)
    if (!satisfied) return

    // once 状态：按 scope 记入对应容器——global → 全局表；player → 玩家；
    // 固定角色 → 该角色；role_mapping.target 显式指定时用映射角色（C3 修复：
    // 原实现 scope=固定角色且无 target 映射时状态不记录 → 事件规则重复执行）
    const stateCharId = selectedOverride
      ?? (rule.scope === 'player' || rule.scope === 'all' ? playerId : rule.scope)
    const stateChar = stateCharId && stateCharId !== 'global'
      ? entitySystem.get('character', stateCharId) as any
      : null
    const state = rule.scope === 'global' ? globalRuleState
      : (stateChar ? ruleStateOf(stateChar) : null)
    if (rule.once && state && state[rule.id]) return

    // 执行效果：target 解析用 selected（role_mapping 映射后），sourceId = sourceOverride 或玩家
    const targetId = selectedOverride ?? playerId ?? ''
    if (!targetId) {
      // ⚠️ 2026-08-16 二轮审查：无玩家且无 target 映射 → 静默空目标（effect 对 '' 找不到角色跳过）
      reportRuleError(rule.id, '事件规则无执行目标（playerId 为空且 role_mapping 未映射出 target）')
      return
    }
    // M1 修复：selectedCharacterId 不得用 undefined 覆盖（原实现 role_mapping 缺 target 时
    // 传 undefined 覆盖 base 值 → effect target='selected' 解析失效）
    const ok = await executeRuleEffects(rule, targetId, {
      sourceId: sourceOverride ?? playerId,
      selectedCharacterId: selectedOverride ?? targetId,
    })
    if (ok && rule.once && state) state[rule.id] = true
  } catch (err) {
    reportRuleError(rule.id, err instanceof Error ? err.message : String(err))
  }
}

// 注释：payload 路径取值（event.character → payload.character；深层 event.a.b → payload.a.b）
function resolveEventPath(payload: any, path: string): any {
  let cur = payload
  for (const seg of path.split('.')) {
    if (cur === null || cur === undefined) return undefined
    cur = cur[seg]
  }
  return cur
}

// ============ 编译 ============

let compiledCache: CompiledRule[] | null = null

/** 编译全部规则：mod.gainRules + talentDefs 的 gain 语法糖（+ 成就） */
export function compileRules(): CompiledRule[] {
  const mod = modLoader.getMod()
  if (!mod) return []
  const rules: CompiledRule[] = []

  // 1. gain-rules.toml 规则
  for (const [id, def] of Object.entries(mod.gainRules ?? {})) {
    const rule = compileRuleDef(id, def)
    validateRuleCondition(rule)
    rules.push(rule)
  }

  // 2. 天赋 gain 语法糖（talents.toml gain 字段 → 规则）
  for (const [talentId, def] of Object.entries(mod.talentDefs ?? {})) {
    if (!def.gain) continue
    const g = def.gain
    const gainType = g.gain_type ?? 0
    const effects = [
      { type: 'grant_talent', params: { talent: talentId } },
    ]
    rules.push({
      id: `talent:${talentId}`,
      source: 'talent',
      scope: 'all',          // erArk 天赋获得对全员（NPC 也可获得思慕等）
      when: gainType === 1 ? 'manual' : 'auto',
      gainType,
      condition: g.condition,
      needs: g.needs,
      once: true,
      effects,
    })
  }

  // 3. 成就（achievements.toml → 规则 + record_achievement 效果）
  for (const [achId, def] of Object.entries(mod.achievements ?? {})) {
    // 效果：记录成就 + 可选附带奖励
    const effects: any[] = [
      { type: 'record_achievement', params: { id: achId } },
      ...(def.effects ?? []),
    ]
    // 前置成就条件（pre_id 是显示元数据；条件里可用 player.achievements.{pre} 表达）
    rules.push({
      id: `achievement:${achId}`,
      source: 'achievement',
      scope: def.scope ?? 'player',
      when: def.when ?? 'auto',
      condition: def.condition,
      needs: def.needs,
      once: true,
      effects,
      role_mapping: def.role_mapping,
    })
  }

  compiledCache = rules
  return rules
}

/** 规则条件校验（加载期）——condition/lose_condition 表达式字段路径合法性；
 *  {self} 占位符归一化为 selected（与运行时替换一致——走 selected → character.{id} 校验链）；
 *  未知字段 → warning（不阻止加载——运行时求值有容错 + 去重上报兜底）
 */
function validateRuleCondition(rule: CompiledRule): void {
  // scope=固定角色 ID 校验——指向不存在的角色 → 规则/成就永不触发（静默失效）
  if (rule.scope !== 'player' && rule.scope !== 'all' && rule.scope !== 'global') {
    const mod = modLoader.getMod()
    const exists = mod?.entities.get('character')?.has(rule.scope)
    if (!exists) {
      errorReporter.report({
        source: 'gain-rule-system',
        severity: 'warning',
        message: `规则 '${rule.id}' 的 scope='${rule.scope}' 不是合法值（player/all/global/已定义角色ID），该规则永不触发`,
        suggestion: '检查 scope 拼写（player | all | global | 角色 ID）；角色 ID 需在 characters/ 中定义',
      })
    }
  }
  // once=true + lose_condition 组合矛盾（达成后规则跳过 → lose 永不执行；静默失效）
  if (rule.once && rule.lose_condition) {
    errorReporter.report({
      source: 'gain-rule-system',
      severity: 'warning',
      message: `规则 '${rule.id}' 同时声明 once=true 和 lose_condition（once 达成后规则被跳过，失去条件永不检查）`,
      suggestion: '可失去的规则必须 once=false（持续检查得失，如精液膨腹 <6000 失去）',
    })
  }
  // I3 修复：事件规则必须有 condition（checkEventRule 对无 condition 直接 return——
  // 无条件事件规则静默失效；加载期 warning 提示）
  if (rule.when.startsWith('event:')) {
    if (!rule.condition) {
      errorReporter.report({
        source: 'gain-rule-system',
        severity: 'warning',
        message: `事件规则 '${rule.id}' 缺少 condition（事件触发规则必须声明条件，否则永不执行）`,
        suggestion: '在规则中写 condition（可用 event 根域引用事件 payload，如 event.character == "player"）',
      })
    }
    // 事件规则禁用 {self}（checkEventRule 不做 {self} 替换，写了静默失效）
    if (rule.condition?.includes('{self}') || rule.lose_condition?.includes('{self}')) {
      errorReporter.report({
        source: 'gain-rule-system',
        severity: 'warning',
        message: `事件规则 '${rule.id}' 的条件里使用了 {self}（事件规则不支持——用 event 根域引用 payload，如 event.character）`,
        suggestion: '把 {self}.xxx 改为 event.xxx 或 role_mapping 映射的角色路径',
      })
    }
  } else {
    // 非事件规则禁用 event 根域（auto/manual 检查无 payload，event.xxx 恒 false 静默失效）
    if (rule.condition?.includes('event.') || rule.lose_condition?.includes('event.')) {
      errorReporter.report({
        source: 'gain-rule-system',
        severity: 'warning',
        message: `规则 '${rule.id}'（when=${rule.when}）的条件里使用了 event.xxx（只有事件规则能引用事件 payload，此处恒 false）`,
        suggestion: '改为普通条件路径（player./selected./character.{id}. 等）',
      })
    }
  }
  const check = (expr: string | undefined, label: string): void => {
    if (!expr) return
    // 注释：{self} 替换为 selected（与 replaceSelf 运行时语义一致；裸角色 ID 不是合法根路径）
    const normalized = expr.replace(/\{self\}/g, 'selected')
    try {
      const r = conditionRegistry.validateExpression(normalized)
      if (!r.ok) {
        errorReporter.report({
          source: 'gain-rule-system',
          severity: 'warning',
          message: `规则 '${rule.id}' 的 ${label} 引用未知字段：${r.unknown.join(', ')}`,
          suggestion: '检查条件字段路径（可用条件手册：npm run validate 或启动时生成的 可用条件属性手册.md）',
        })
      }
    } catch {
      // 表达式语法错误——运行时求值会报（校验只做字段检查）
    }
  }
  check(rule.condition, 'condition')
  check(rule.lose_condition, 'lose_condition')
}

function compileRuleDef(id: string, def: GainRuleDef): CompiledRule {
  return {
    id,
    source: 'rule',
    scope: def.scope ?? 'player',
    when: def.when ?? 'auto',
    condition: def.condition,
    needs: def.needs,
    lose_condition: def.lose_condition,
    lose_effects: def.lose_effects,
    once: def.once !== false,
    effects: def.effects ?? [],
    role_mapping: def.role_mapping,
  }
}

/** 获取编译规则（惰性编译——onEnable 后 cache 生效） */
export function getCompiledRules(): CompiledRule[] {
  if (!compiledCache) return compileRules()
  return compiledCache
}

/** 重载（mod 切换/热更新时） */
export function invalidateRules(): void {
  compiledCache = null
}

// ============ 手动 API（步骤5 骨架）============

/** 手动候选查询：选中角色的 when=manual 且未达成规则（UI 调用；UI 待用户设计） */
export function queryManualCandidates(charId: string): CompiledRule[] {
  const char = entitySystem.get('character', charId) as any
  if (!char) return []
  const rules = getCompiledRules()
  const playerId = gameContext.getContext().player?.id
  return rules.filter(r => {
    if (r.when !== 'manual') return false
    if (!appliesToChar(r, charId, playerId)) return false
    const state = ruleStateContainer(r, char, playerId)
    if (r.once && state && state[r.id]) return false
    // ⚠️ 2026-08-16 二轮审查：手动候选的条件里的 {self}/selected 必须指向被查询角色——
    // 否则 UI 未选中该角色时 selected=undefined → 条件恒 false → 候选永不出现（静默失效）
    return ruleSatisfied(r, char, charId, charId)
  })
}

/** 手动确认获得（跳过条件直接执行——面板已把关） */
export async function confirmManual(charId: string, ruleId: string): Promise<boolean> {
  const char = entitySystem.get('character', charId) as any
  if (!char) return false
  const rule = getCompiledRules().find(r => r.id === ruleId && r.when === 'manual')
  if (!rule) return false
  const playerId = gameContext.getContext().player?.id
  const ok = await executeRuleEffects(rule, charId)
  if (ok && rule.once) {
    const state = ruleStateContainer(rule, char, playerId)
    if (state) state[rule.id] = true
  }
  return ok
}

// ============ 天赋授予 effect 逻辑（core talent-utils grantTalent 迁移）============

/** 授予天赋（grant_talent effect handler）——赋予 + 日志 + 替换 */
export function grantTalentToChar(char: any, talentId: string): boolean {
  if (char.talents?.[talentId]) return false
  if (!char.talents) char.talents = {}
  const def = modLoader.getMod()?.talentDefs?.[talentId]
  const newLevel = (char.talents[talentId] ?? 0) + 1
  char.talents[talentId] = newLevel
  narrativeLog.write(`习得天赋：${def?.name ?? talentId}（Lv.${newLevel}）`, 'system', 'gain-rule-system')

  const replace = def?.gain?.replace
  if (replace) {
    delete char.talents[replace]
    const oldDef = modLoader.getMod()?.talentDefs?.[replace]
    narrativeLog.write(`天赋 ${oldDef?.name ?? replace} 已被替换`, 'system', 'gain-rule-system')
  }
  return true
}

/** 移除天赋（remove_talent effect handler）——删除条目 + 日志 */
export function removeTalentFromChar(char: any, talentId: string): boolean {
  if (!char.talents?.[talentId]) return false
  delete char.talents[talentId]
  const def = modLoader.getMod()?.talentDefs?.[talentId]
  narrativeLog.write(`失去天赋：${def?.name ?? talentId}`, 'system', 'gain-rule-system')
  return true
}

// ============ 成就（record_achievement + 三态 scope）============

// 注释：全局成就表（global scope）——存档级全局状态（gameStateProviders 持久化）
// { achId: true }——达成一次永久达成（erArk cache.achievement.achievement_dict 同义）
let globalAchievements: Record<string, boolean> = {}

/** 全局成就表存取（gameStateProviders serialize/restore 用） */
export function getGlobalAchievements(): Record<string, boolean> {
  return globalAchievements
}
export function setGlobalAchievements(data: Record<string, boolean>): void {
  globalAchievements = data ?? {}
}

/** 记录成就（record_achievement effect handler）——按 scope 记入对应容器 */
export function recordAchievement(achId: string): boolean {
  const mod = modLoader.getMod()
  const def = mod?.achievements?.[achId]
  const scope = def?.scope ?? 'player'
  const narrativeName = def?.name ?? achId

  if (scope === 'global') {
    if (globalAchievements[achId]) return false
    globalAchievements[achId] = true
    narrativeLog.write(`获得成就：${narrativeName}`, 'system', 'gain-rule-system')
    return true
  }

  // player / character（固定角色ID）——记在角色 achievements 字段
  const targetId = scope === 'player'
    ? gameContext.getContext().player?.id
    : scope // 固定角色 ID
  if (!targetId) return false
  const char = entitySystem.get('character', targetId) as any
  if (!char) return false
  if (!char.achievements) char.achievements = {}
  if (char.achievements[achId]) return false
  char.achievements[achId] = true
  narrativeLog.write(`获得成就：${narrativeName}`, 'system', 'gain-rule-system')
  return true
}

/** 查询成就达成状态（条件路径/UI/校验用） */
export function isAchievementUnlocked(achId: string, targetId?: string): boolean {
  const mod = modLoader.getMod()
  const def = mod?.achievements?.[achId]
  const scope = def?.scope ?? 'player'
  if (scope === 'global') return !!globalAchievements[achId]
  const id = targetId ?? (scope === 'player'
    ? gameContext.getContext().player?.id
    : scope)
  if (!id) return false
  const char = entitySystem.get('character', id) as any
  return !!char?.achievements?.[achId]
}
