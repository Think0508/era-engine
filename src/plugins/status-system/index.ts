// 注释：status-system 插件——状态效果（中毒/醉意/buff等）
// 战斗内外都用——独立于 combat-base
//
// 计划三（2026-09-22）三项改造（设计见 docs/superpowers/specs/2026-09-22-runtime-attribute-modifiers-design.md）：
//   ① **到期存绝对时刻**（D3）：状态实例用 `expiresAt`（游戏分钟），判定一律 `now >= expiresAt`；
//      删除"每次 hour_changed 硬扣 60 分钟"（睡觉跨天/时间跳跃/非整点行动必然算错）。旧档
//      条目首触时就地换算（`remaining_duration → expiresAt`），幂等、不丢条目。
//   ② **层数三层模型**（D11/D12）：有效层数 = 基础层数 `base_stack` + Σ层数修正 `stack_mods` − 时间衰减
//      （下限 0）。「打到 N 层」/「+N 层」是两种运算（D5 ①/§5.1）。层数修正挂在**目标状态**上，
//      `from` = 来源状态 id；来源移除/到期 → 撤销它给出的修正，**基础层数分毫不动**。
//   ③ **属性修正走运行时清单**（D2/D7）：生效期间 push `char.attr_mods`（id = `status:<状态ID>`，
//      到期时刻 = 状态到期时刻），**基础值永不被污染**——这正是本设计的第一验收点。
//
// ⚠️ `on_apply_effects` / `on_remove_effects` 的定位（spec §7.1）：**仅用于"一次性、非属性/非层数"
//    的效果**。**禁止用它们做属性加成**——它们走 effect-system 的 `modify_attribute` 写的是**基础值**
//    （`readRawAttr` 不会回退），临时 buff 会永久沉淀成角色属性（本计划开篇 §2.1 的雷：迁移前的
//    「攻击增益」就是这么写的）。属性临时加成一律写 `attribute_mods`，永久成长由发起方直接写基础值。

import type { PluginContext } from '../../core/types'
import type { LoadedMod, StatusEffectDef } from '../../core/mod-types'
import { effectTypeRegistry } from '../../core/effect-type-registry'
import { entitySystem } from '../../core/entity-system'
import { modLoader } from '../../core/mod-loader'
import { apiSystem } from '../../core/api'
import { errorReporter } from '../../core/error-reporter'
import { gameContext, gameTimeToTotalMinutes } from '../../core/game-context'
import { registerRuntimeMod, removeRuntimeMod } from '../../core/attribute-eval'

/** 层数修正条目（挂在**目标状态**实例上；`from` = 来源状态 id，用于撤销与排查） */
export interface StatusStackMod {
  from: string
  value: number
  /** 绝对游戏分钟；缺省 = 跟随来源状态生灭（来源到期时也会被撤销） */
  expiresAt?: number
}

/** 状态实例（`char.status_effects[]` 的元素）——纯数据字段，随存档整对象往返 */
export interface StatusEntry {
  id: string
  /** 基础层数（招式给定：「打到 N」/「+N」；随状态实例存亡） */
  base_stack: number
  /** 绝对游戏分钟；undefined = 永久（def.duration === -1） */
  expiresAt?: number
  /** 其他状态给出的层数修正 */
  stack_mods: StatusStackMod[]
  /** 上次衰减落账时刻（绝对游戏分钟） */
  last_decay_at: number
  /** 上次 tick 时刻（绝对游戏分钟） */
  last_tick_game_time: number
}

export interface ApplyStatusOpts {
  /** 「打到 N 层」：`N <= 有效层数` → 无操作（不降级、**不刷新时长**）；`N >` → 顶上 + 重置时长 */
  stack?: number
  /** 「+N 层」：加法恒生效 + 重置时长（不受 D5 顶替判定约束） */
  stack_add?: number
}

/** 属性修正的来源 id 前缀（`status:<状态ID>`；移除/到期按前缀整批撤销） */
const STATUS_MOD_PREFIX = 'status:'
/** 兼容视图已装配标记（Symbol 不入 JSON → 存档往返后自动重新装配） */
const VIEW_MARK = Symbol('statusEntryViews')

// 注释：onLoad——注册 apply_status/remove_status effect type
export function onLoad(_ctx: PluginContext): void {
  // 注释：apply_status——施加状态效果（params.stack = 打到 N / params.stack_add = 加 N）
  effectTypeRegistry.register('apply_status', async (params: any, ctx: any) => {
    const targetIds = ctx._targetIds as string[]
    // 注释：加载期校验（mod-validate）之外再兜一层——两者同给无语义（一个"打到几"、一个"加几"）
    if (params.stack !== undefined && params.stack_add !== undefined) {
      errorReporter.report({
        source: 'status-system',
        severity: 'warning',
        message: `apply_status 同时给了 stack 与 stack_add（状态 '${params.status}'）——已忽略 stack_add`,
        suggestion: '「打到几」与「加几」是两种运算，只写一个',
      })
    }
    const opts: ApplyStatusOpts = {
      stack: params.stack,
      stack_add: params.stack !== undefined ? undefined : params.stack_add,
    }
    for (const id of targetIds) applyStatus(id, params.status, opts)
    return true
  })

  // 注释：remove_status——移除状态效果（全层移除，触发 on_remove_effects）
  effectTypeRegistry.register('remove_status', async (params: any, ctx: any) => {
    const targetIds = ctx._targetIds as string[]
    for (const id of targetIds) removeStatus(id, params.status)
    return true
  })
}

// 注释：onEnable——注册 status API + 监听 hour_changed/game:load + condition 字段
export function onEnable(ctx: PluginContext): void {
  // 注释：注册条件路径字段别名（文档路径 status./remaining → 运行时字段名）
  // core 条件引擎保持通用，别名知识由本插件持有（AGENTS §32 条件集成）
  // `remaining` 指向条目上的派生视图（非枚举访问器）——真值在 expiresAt，永久状态返回 -1
  gameContext.setFieldAliases({
    status: 'status_effects',
    remaining: 'remaining_duration',
  })

  ctx.api.register('status', {
    hasStatus: (charId: string, statusId: string): boolean => {
      const entry = findEntry(charOf(charId), statusId)
      return !!entry && !isExpired(entry, getCurrentGameMinutes())
    },
    // 注释：有效层数（含层数修正与待衰减）——spec §9「层数条件看有效层数」的读取入口
    getStack: (charId: string, statusId: string): number => effectiveStack(charId, statusId),
    getRemaining: (charId: string, statusId: string): number => {
      const entry = findEntry(charOf(charId), statusId)
      if (!entry) return 0
      return typeof entry.expiresAt === 'number' ? Math.max(0, entry.expiresAt - getCurrentGameMinutes()) : -1
    },
    apply: (charId: string, statusId: string, opts?: ApplyStatusOpts): void => applyStatus(charId, statusId, opts),
    remove: (charId: string, statusId: string): void => removeStatus(charId, statusId),
    effectiveStack,
  })

  // 注释：监听 game:hour_changed → 结算（到期副作用 + 衰减落账 + tick）
  // 2026-08-15 复查 I-3：时停守卫——时停中行动仍会真实推进到跨小时（回拨只发生在
  // execution_end），若在此 tick：冻结 NPC 的中毒等 tick_effects 照跑（扣血）、
  // 照减（时停中到期消失）——时钟回拨后副作用保留（世界被永久篡改）；且 last_tick_game_time
  // 超前会致跨小时行动重复 tick。时停中时间冻结 → 状态不结算（对齐 h-core settle_hp_mp
  // 的 isTimeStop 早退模式）。
  ctx.events.on('game:hour_changed', () => {
    let tsActive = false
    try { tsActive = !!apiSystem.callSync('h-time-stop', 'isActive') } catch { /* 插件缺失 */ }
    if (tsActive) return
    settleAll(true)
  })

  // 注释：监听 game:load（读档广播）——条目归一化：旧档 remaining_duration 就地换算成 expiresAt，
  // 兼容视图重新装配（JSON 往返会丢掉非枚举访问器；不重装 → 条件路径 status.X.stack/remaining 读不到）
  ctx.events.on('game:load', () => settleAll(false))
}

// ═══════════════════════════════════════════════════════════════════════
// 施加 / 移除
// ═══════════════════════════════════════════════════════════════════════

/** 施加状态（opts.stack = 打到 N；opts.stack_add = 加 N；都不给 = 沿用既有 stackable/max_stack 语义） */
export function applyStatus(charId: string, statusId: string, opts: ApplyStatusOpts = {}): void {
  const mod = modLoader.getMod()
  const def = mod?.statusEffects[statusId]
  if (!def) {
    errorReporter.report({
      source: 'status-system',
      severity: 'warning',
      message: `状态效果 '${statusId}' 不存在`,
      suggestion: '状态效果需先在 definitions/status-effects.toml 定义',
    })
    return
  }

  const char = entitySystem.get('character', charId) as any
  if (!char) return
  if (!Array.isArray(char.status_effects)) char.status_effects = []

  const now = getCurrentGameMinutes()
  const existing = findEntry(char, statusId)

  if (!existing) {
    // 注释：新施加——基础层数由招式给定（缺省 1 层），到期 = 现在 + 完整时长
    const entry: StatusEntry = {
      id: statusId,
      base_stack: initialStack(opts),
      expiresAt: def.duration === -1 ? undefined : now + def.duration,
      stack_mods: [],
      last_decay_at: now,
      // 注释：新施加的状态**下次结算就 tick 一次**（既有语义：原实现把 last_tick_game_time
      // 初始化成 0，等价于"立刻到期"）。迁移来的老条目相反——从 now 起算，见 normalizeEntry。
      last_tick_game_time: now - tickIntervalOf(def),
    }
    char.status_effects.push(entry)
    installViews(entry)
    // 注释：本状态声明的层数修正落到目标状态实例上（目标尚未出现 → 目标出现时由 retrofit 补）
    applyStackModsFromSource(char, statusId)
    retrofitStackMods(char, statusId)
    pushAttributeMods(char, entry, def, now)
    // 注释：on_apply_effects 仅限非属性效果（见文件头注释）
    if (def.on_apply_effects?.length) runEffects(charId, def.on_apply_effects)
    return
  }

  // 注释：已存在——「打到几」/「加几」/既有叠加语义（三选一）
  if (opts.stack !== undefined) {
    // D5 ①「打到几」：比较基准是**有效层数**（基础 + 层数修正）；打不动 → 直接返回，
    // 连时长都不刷新（这是用户明确要的语义）
    if (!(opts.stack > stackValueOf(existing, now))) return
    existing.base_stack = opts.stack
  } else if (opts.stack_add !== undefined) {
    // 注释：加法类恒生效（不受顶替判定约束）
    existing.base_stack += opts.stack_add
  } else if (def.stackable && existing.base_stack < def.max_stack) {
    // 注释：既有语义——可叠则 +1 封顶；否则只刷新时长
    existing.base_stack += 1
  }

  // 注释：顶上/刷新 → 重置为**新的完整时长**，并让属性修正的到期时刻跟上（同强度 D5 顶替）
  if (def.duration !== -1) existing.expiresAt = now + def.duration
  pushAttributeMods(char, existing, def, now)
  // 注释：层数修正的到期时刻跟随来源（刷新来源 = 刷新修正寿命）
  applyStackModsFromSource(char, statusId)
}

/** 移除状态（全层移除）：撤销属性修正 + 撤销它给出的层数修正 + on_remove_effects（非属性） */
export function removeStatus(charId: string, statusId: string): void {
  const char = entitySystem.get('character', charId) as any
  if (!Array.isArray(char?.status_effects)) return
  const idx = char.status_effects.findIndex((s: any) => s?.id === statusId)
  if (idx === -1) return // 注释：没有该状态，静默跳过
  normalizeEntry(char.status_effects[idx])
  removeEntryAt(char, idx, modLoader.getMod()?.statusEffects[statusId])
}

// ═══════════════════════════════════════════════════════════════════════
// 层数三层模型
// ═══════════════════════════════════════════════════════════════════════

/** 有效层数 = max(0, 基础层数 − 待衰减 + Σ存活层数修正)。
 *  **衰减在读时投影**（`last_decay_at` 到 now 之间该扣几层现算），落账（改 base_stack、0 层结束）
 *  在 `game:hour_changed` 的结算里做——这样"读"永远不依赖"上次结算发生在何时"，
 *  也被 D5「打到 N」的比较基准复用（打不动的判定不受结算时机影响）。 */
export function effectiveStack(charId: string, statusId: string): number {
  const entry = findEntry(charOf(charId), statusId)
  if (!entry) return 0
  return stackValueOf(entry, getCurrentGameMinutes())
}

/** 有效层数（内部版：条目已在手，省一次查找） */
function stackValueOf(entry: StatusEntry, now: number): number {
  const def = modLoader.getMod()?.statusEffects[entry.id]
  let v = entry.base_stack - pendingDecay(entry, def, now)
  for (const m of entry.stack_mods ?? []) {
    if (!m || typeof m.value !== 'number') continue
    if (typeof m.expiresAt === 'number' && now >= m.expiresAt) continue
    v += m.value
  }
  return Math.max(0, v)
}

/** 待衰减层数（`stack_decay = { every, amount }`；读时投影，不写状态） */
function pendingDecay(entry: StatusEntry, def: StatusEffectDef | undefined, now: number): number {
  const decay = def?.stack_decay
  if (!decay || !(decay.every > 0) || !(decay.amount > 0)) return 0
  const due = Math.floor((now - entry.last_decay_at) / decay.every)
  return due > 0 ? due * decay.amount : 0
}

/** 衰减落账：扣 base_stack 并推进 last_decay_at；返回落账后的基础层数（<= 0 → 状态结束） */
function materializeDecay(entry: StatusEntry, def: StatusEffectDef, now: number): number {
  const decay = def.stack_decay!
  while (entry.base_stack > 0 && entry.last_decay_at + decay.every <= now) {
    entry.base_stack -= decay.amount
    entry.last_decay_at += decay.every
  }
  return entry.base_stack
}

/** 把来源状态声明（def.stack_mods）的层数修正落到目标状态实例上 */
function applyStackModsFromSource(char: any, sourceId: string): void {
  const def = modLoader.getMod()?.statusEffects[sourceId]
  if (!def?.stack_mods?.length) return
  const source = findEntry(char, sourceId)
  if (!source) return
  for (const m of def.stack_mods) {
    const target = findEntry(char, m.status)
    if (!target) continue // 注释：目标状态不在身上 → 无处可挂（目标出现时由 retrofit 补上）
    upsertStackMod(target, { from: sourceId, value: m.value, expiresAt: source.expiresAt })
  }
}

/** 目标状态新出现时补挂身上已有来源状态声明的层数修正（"恒 −1"与施加顺序无关） */
function retrofitStackMods(char: any, targetId: string): void {
  const mod = modLoader.getMod()
  if (!mod) return
  const target = findEntry(char, targetId)
  if (!target) return
  for (const raw of char.status_effects as any[]) {
    if (!raw || raw.id === targetId) continue
    const otherDef = mod.statusEffects[raw.id]
    if (!otherDef?.stack_mods?.length) continue
    const source = normalizeEntry(raw)
    if (!source) continue
    for (const m of otherDef.stack_mods) {
      if (m.status !== targetId) continue
      upsertStackMod(target, { from: source.id, value: m.value, expiresAt: source.expiresAt })
    }
  }
}

/** 同来源只留一条（重复施加 = 覆盖，不叠加） */
function upsertStackMod(target: StatusEntry, entry: StatusStackMod): void {
  if (!Array.isArray(target.stack_mods)) target.stack_mods = []
  const i = target.stack_mods.findIndex(m => m?.from === entry.from)
  if (i >= 0) target.stack_mods[i] = entry
  else target.stack_mods.push(entry)
}

/** 撤销某来源给出的全部层数修正（来源移除/到期）——**基础层数分毫不动** */
function revokeStackMods(char: any, sourceId: string): void {
  for (const e of (char?.status_effects ?? []) as StatusEntry[]) {
    if (!Array.isArray(e?.stack_mods) || e.stack_mods.length === 0) continue
    e.stack_mods = e.stack_mods.filter(m => m?.from !== sourceId)
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 属性修正（运行时清单）生灭
// ═══════════════════════════════════════════════════════════════════════

/** 施加/刷新该状态声明的属性修正（`char.attr_mods`）——**永不写基础值** */
function pushAttributeMods(char: any, entry: StatusEntry, def: StatusEffectDef, now: number): void {
  if (!def.attribute_mods?.length) return
  const id = `${STATUS_MOD_PREFIX}${entry.id}`
  for (const m of def.attribute_mods) {
    registerRuntimeMod(char, {
      id,
      attr: m.attr,
      flat: m.flat,
      percent: m.percent,
      set: m.set,
      // 注释：到期时刻 = 状态到期时刻（永久状态 → undefined = 由移除显式撤销）
      expiresAt: entry.expiresAt,
      source: id,
    }, runtimeStrength(def, entry, m, now))
  }
}

/** 运行时条目的强度（D5 顶替比较基准，随条目持久化）：
 *  有层数概念的状态 → **有效层数**（层数就是"这条状态多强"）；
 *  无层数概念 → 条目自身强度（沿用统一算式 `set ?? flat ?? percent`，全缺省 = 1）。 */
function runtimeStrength(def: StatusEffectDef, entry: StatusEntry, mod: any, now: number): number {
  if (hasStackConcept(def)) return stackValueOf(entry, now)
  const v = mod?.set ?? mod?.flat ?? mod?.percent
  return typeof v === 'number' && Number.isFinite(v) ? v : 1
}

/** 该状态是否有"层数"概念（可叠 / 多层上限 / 会衰减）——决定强度取有效层数还是条目自身值 */
function hasStackConcept(def: StatusEffectDef): boolean {
  return def.stackable === true || (typeof def.max_stack === 'number' && def.max_stack > 1) || def.stack_decay !== undefined
}

// ═══════════════════════════════════════════════════════════════════════
// 结算（game:hour_changed / game:load）
// ═══════════════════════════════════════════════════════════════════════

/** 全体角色结算（tick = 是否执行 tick_effects：读档只归一化/清理，不补 tick） */
function settleAll(tick: boolean): void {
  const mod = modLoader.getMod()
  if (!mod) return
  const now = getCurrentGameMinutes()
  for (const char of entitySystem.getAll('character')) settleChar(char as any, mod, now, tick)
}

function settleChar(char: any, mod: LoadedMod, now: number, tick: boolean): void {
  const list = char?.status_effects
  if (!Array.isArray(list)) return
  for (let i = list.length - 1; i >= 0; i--) {
    const entry = normalizeEntry(list[i])
    if (!entry) { list.splice(i, 1); continue } // 注释：畸形条目（无 id）剪除
    // 注释：到期——绝对时刻判定（now >= expiresAt 即失效）
    if (isExpired(entry, now)) { removeEntryAt(char, i, mod.statusEffects[entry.id]); continue }
    const def = mod.statusEffects[entry.id]
    if (!def) continue
    // 注释：衰减落账——到 0 层状态结束
    if (def.stack_decay && materializeDecay(entry, def, now) <= 0) { removeEntryAt(char, i, def); continue }
    // 注释：tick——tick_interval 检查；tick_effects 按**有效层数**缩放
    if (tick && def.tick_interval > 0 && entry.last_tick_game_time + def.tick_interval <= now) {
      entry.last_tick_game_time = now
      const stack = stackValueOf(entry, now)
      if (def.tick_effects?.length && stack > 0) runEffects(char.id, scaleEffectsByStack(def.tick_effects, stack))
    }
  }
}

/** 移除第 idx 条状态：撤销属性修正 + 撤销它给出的层数修正 + on_remove_effects（非属性） + 摘除 */
function removeEntryAt(char: any, idx: number, def: StatusEffectDef | undefined): void {
  const entry = char.status_effects[idx] as StatusEntry | undefined
  if (!entry) return
  // 注释：① 属性修正撤销（改的是运行时清单，基础值分毫不动）
  removeRuntimeMod(char, `${STATUS_MOD_PREFIX}${entry.id}`)
  // 注释：② 层数修正撤销（基础层数分毫不动）
  revokeStackMods(char, entry.id)
  // 注释：③ on_remove_effects 仅限非属性效果（见文件头注释）
  if (def?.on_remove_effects?.length) runEffects(char.id, def.on_remove_effects)
  char.status_effects.splice(idx, 1)
}

// ═══════════════════════════════════════════════════════════════════════
// 条目归一化（旧档就地迁移 + 兼容视图装配）
// ═══════════════════════════════════════════════════════════════════════

/** 取条目并按需归一化（首触迁移）；无该状态返回 null */
function findEntry(char: any, statusId: string): StatusEntry | null {
  if (!Array.isArray(char?.status_effects)) return null
  const raw = char.status_effects.find((s: any) => s?.id === statusId)
  if (!raw) return null
  return normalizeEntry(raw)
}

/** 归一化（**幂等**；就地改条目，不换对象 → 不丢条目）：
 *  ① 旧档就地迁移：`remaining_duration → expiresAt`（-1 = 永久），`stack → base_stack`，
 *     `last_tick_game_time`/`last_decay_at` 从"现在"起算（迁移不触发立即 tick / 衰减爆发）；
 *  ② 字段兜底：任何来源（旧档/手改/TOML 初始数据）都保证管线拿得到数字；
 *  ③ 装配兼容视图访问器（`stack` / `remaining_duration`：真值在 base_stack/expiresAt）。 */
function normalizeEntry(raw: any): StatusEntry | null {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || raw.id.length === 0) return null
  const entry = raw as StatusEntry
  if (!(VIEW_MARK in entry)) {
    // 注释：迁移只做一次（视图装配标记随对象；JSON 往返后标记丢失 → 重新走一遍，但那时
    // expiresAt/base_stack 已是数字、旧字段已不存在 → 二次换算无从发生 = 幂等）
    const legacy = typeof (entry as any).remaining_duration === 'number' ? (entry as any).remaining_duration : undefined
    const isLegacy = legacy !== undefined && typeof entry.expiresAt !== 'number'
    if (isLegacy) entry.expiresAt = legacy === -1 ? undefined : getCurrentGameMinutes() + legacy
    if (typeof entry.base_stack !== 'number') {
      entry.base_stack = typeof (entry as any).stack === 'number' ? (entry as any).stack : 1
    }
    if (!Array.isArray(entry.stack_mods)) entry.stack_mods = []
    // 注释：老条目（旧代码把 last_tick_game_time 初始化成 0）迁移时两个时钟都从"现在"起算
    // ——否则迁完当帧就 tick 一次 / 衰减爆发；缺字段的新条目同样从"现在"起算
    if (isLegacy || typeof entry.last_tick_game_time !== 'number') entry.last_tick_game_time = getCurrentGameMinutes()
    if (isLegacy || typeof entry.last_decay_at !== 'number') entry.last_decay_at = getCurrentGameMinutes()
    delete (entry as any).remaining_duration // 注释：旧字段退场（同名读取交给访问器）
    delete (entry as any).stack
    installViews(entry)
  }
  if (typeof entry.base_stack !== 'number' || !Number.isFinite(entry.base_stack)) entry.base_stack = 1
  if (!Array.isArray(entry.stack_mods)) entry.stack_mods = []
  if (typeof entry.last_tick_game_time !== 'number') entry.last_tick_game_time = getCurrentGameMinutes()
  if (typeof entry.last_decay_at !== 'number') entry.last_decay_at = getCurrentGameMinutes()
  return entry
}

/** 装配兼容视图（**非枚举访问器** → 不入 JSON/存档，真值唯一）：
 *  - `stack` = 有效层数（含层数修正与待衰减）——AGENTS §8 的 `character.{id}.status.{id}.stack`
 *    条件路径与 spec §9「层数条件看有效层数」靠它对齐；
 *  - `remaining_duration` = 剩余分钟数（永久 = -1）——`remaining` 条件别名、example-mod 等
 *    既有读取方靠它继续工作；旧代码"逐次扣减"的写法已删除，这里是**推导值**。 */
function installViews(entry: StatusEntry): void {
  Object.defineProperty(entry, VIEW_MARK, { value: true, enumerable: false, configurable: true })
  Object.defineProperty(entry, 'stack', {
    enumerable: false,
    configurable: true,
    get: () => stackValueOf(entry, getCurrentGameMinutes()),
    set: (v: number) => { entry.base_stack = v },
  })
  Object.defineProperty(entry, 'remaining_duration', {
    enumerable: false,
    configurable: true,
    get: () => (typeof entry.expiresAt === 'number' ? Math.max(0, entry.expiresAt - getCurrentGameMinutes()) : -1),
    set: (v: number) => {
      entry.expiresAt = (v === -1 || v === undefined) ? undefined : getCurrentGameMinutes() + v
    },
  })
}

function isExpired(entry: StatusEntry, now: number): boolean {
  return typeof entry.expiresAt === 'number' && now >= entry.expiresAt
}

/** 新施加的基础层数：打到 N / 加 N（0 层 + N）/ 缺省 1 层（既有语义） */
function initialStack(opts: ApplyStatusOpts): number {
  if (opts.stack !== undefined) return opts.stack
  if (opts.stack_add !== undefined) return opts.stack_add
  return 1
}

/** tick 间隔（非正数/缺省 = 不 tick） */
function tickIntervalOf(def: StatusEffectDef): number {
  return typeof def.tick_interval === 'number' && def.tick_interval > 0 ? def.tick_interval : 0
}

function charOf(charId: string): any {
  return entitySystem.get('character', charId) as any
}

/** 执行非属性效果（fire-and-forget；失败上报而非静默吞掉） */
function runEffects(charId: string, effects: any[]): void {
  if (!effects?.length) return
  void apiSystem.call('effect-system', 'execute', effects, { sourceId: charId, _targetIds: [charId] })
    .catch((e: unknown) => {
      errorReporter.report({
        source: 'status-system',
        severity: 'warning',
        message: `状态效果执行失败：${e instanceof Error ? e.message : String(e)}`,
      })
    })
}

// 注释：stack 缩放——数值类(value 为 number)×stack，非数值类重复 stack 次
function scaleEffectsByStack(effects: any[], stack: number): any[] {
  const result: any[] = []
  for (const effect of effects) {
    if (effect.params && typeof effect.params.value === 'number') {
      // 注释：数值类——深拷贝 + value × stack
      const scaled = JSON.parse(JSON.stringify(effect))
      scaled.params.value = effect.params.value * stack
      result.push(scaled)
    } else {
      // 注释：非数值类——重复 stack 次
      for (let i = 0; i < stack; i++) {
        result.push(JSON.parse(JSON.stringify(effect)))
      }
    }
  }
  return result
}

// 注释：获取当前游戏时间（分钟）——2026-08-09 example-mod 验证修复：原实现恒返回 0
// （TODO 未接 gameContext）→ tick_interval 检查 `last_tick + interval <= 0` 永假 →
// 所有 tick_effects 静默死代码。改为真实游戏时间（gameTimeToTotalMinutes 跨年月日累计）。
function getCurrentGameMinutes(): number {
  return gameTimeToTotalMinutes(gameContext.getContext().time)
}
