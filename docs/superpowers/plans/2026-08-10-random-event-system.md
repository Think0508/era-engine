# Random Event System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 复刻 erArk 行为期随机事件系统（行为挂钩 + 前提权重候选 + 加权随机 + 文本 + 效果 + 子事件选项 + 触发记录），core 通用机制 + 插件行为挂钩。

**Architecture:** core 提供纯通用机制（`core/random-event.ts`：事件注册/候选筛选/加权随机/触发记录/文本插值，事件按任意字符串挂载键分组，不认任何具体名词）；`plugins/random-event-system/` 提供行为挂钩（监听 `game:execution_end` 触发玩家事件、`npc:behavior_started` 触发 NPC 事件）、TOML 数据层、系统效果、选项条 UI 桥。玩家侧行为镜像 `current_behavior`（L3 字段，与 npc-ai 共享）由事件插件自己维护（写指令 id），core 零改动。

**Tech Stack:** TypeScript / Vitest / @iarna/toml / Pinia（仅 UI 同步）

## Global Constraints

- 三层铁律：`src/core/` 不得出现具体玩法名词；插件之间禁止直接 import（跨插件通信只走 `ctx.api.call()` 或事件总线）
- 属性名禁止硬编码：插件代码中禁止出现中文属性名字符串
- 错误铁律：所有错误走 `errorReporter.report({source, severity, file, message, suggestion})`，禁止 console.error
- 标识符英文/拼音，内容文本可用中文
- erArk 有意偏差（记录在案，不实现）：多层事件（CVP_A1_Son/Father 数据零使用）、效果 10008/10010/10011/10012（数据零使用）、DIY 指令（CHARA_DIY_INSTRUCT）、H 内 NPC AI
- 测试命令：`npm run typecheck && npm run test`

---

### Task 1: mod-loader 事件数据加载

**Files:**
- Modify: `src/core/mod-loader.ts`（类型区 + 加载段）
- Test: `src/core/mod-loader.test.ts`

**Interfaces:**
- Produces:
```typescript
export interface RandomEventDef {
  id: string                    // 事件唯一 id（英文 kebab）
  behavior: string              // 挂载键：玩家指令 id / NPC 行为块 id / move / wait
  type: number                  // 0|1 结算事件（合并语义）；2 = 静默事件
  adv?: string                  // 空=通用；非空=角色专属（角色 id）
  side?: 'self' | 'target' | 'any' | 'both'   // 分桶（erArk sys_1/sys_0/any/both）
  text?: string                 // "选项文本|正文"（父/子事件用分隔）
  premises?: string[]           // 前提 ID 列表（premiseRegistry 权重通道）
  condition?: string            // 现有条件表达式（布尔门）
  trigger_guard?: 'seen_once' | 'unseen_once' | 'seen_today' | 'unseen_today'
  option_son?: boolean          // 子事件标记（子前提 ⊇ 父前提）
  effects?: Effect[]
  comment?: string
}
// LoadedMod 新增：events: RandomEventDef[]，默认值对象加 events: []
```

- [ ] **Step 1: 写失败测试**（`src/core/mod-loader.test.ts` 末尾追加）
```typescript
describe('random event data loading', () => {
  it('loads events from definitions/events/*.toml accumulatively', async () => {
    const mod = await loadTestMod()   // 复用现有测试加载入口
    const moveEvents = (mod.events ?? []).filter(e => e.behavior === 'move')
    expect(moveEvents.length).toBeGreaterThan(0)
    expect(moveEvents[0].id).toBeTruthy()
    expect(typeof moveEvents[0].type).toBe('number')
    expect(Array.isArray(moveEvents[0].effects)).toBe(true)
  })
  it('reports error for event missing id', async () => {
    // 构造缺 id 事件文件 → errorReporter 收到 severity=error
  })
})
```

- [ ] **Step 2: 运行测试确认失败** — `npx vitest run src/core/mod-loader.test.ts` → FAIL（`mod.events` undefined）

- [ ] **Step 3: 实现**（`src/core/mod-loader.ts`）
1. 类型区（`AITargetDef` 附近）加 `RandomEventDef` 接口
2. `LoadedMod` 加 `events: RandomEventDef[]`；默认对象加 `events: []`
3. 在 `aiTargets` 加载段之后加（同作用域，参照 aiTargets 的循环模式）：
```typescript
const events: RandomEventDef[] = []
for (const path of Object.keys(rawTomlMap)) {
  const isEventsFile = path.endsWith('/events.toml') || path.includes('/events/')
  if (!isEventsFile || !path.endsWith('.toml')) continue
  const data = parseFile(path, rawTomlMap[path])
  const list = (data.events as RandomEventDef[]) ?? []
  for (const ev of list) {
    if (!ev?.id) { errorReporter.report({ source: 'mod-loader', severity: 'error', file: path, message: 'events 文件条目缺 id 字段，跳过' }); continue }
    if (!ev?.behavior) { errorReporter.report({ source: 'mod-loader', severity: 'error', file: path, message: `事件 '${ev.id}' 缺 behavior 字段，跳过` }); continue }
    if (events.some(existing => existing.id === ev.id)) {
      errorReporter.report({ source: 'mod-loader', severity: 'warning', file: path, message: `事件 id '${ev.id}' 重复，后者覆盖` })
      events.splice(events.findIndex(e => e.id === ev.id), 1)
    }
    events.push(ev)
  }
}
mod.events = events
```
注意：先确认 `rawTomlMap`/`parseFile` 在函数作用域内可用（aiTargets 加载段同作用域）。

- [ ] **Step 4: 运行测试确认通过** — `npx vitest run src/core/mod-loader.test.ts` → PASS

- [ ] **Step 5: Commit** — `git add src/core/mod-loader.ts src/core/mod-loader.test.ts && git commit -m "feat(core): load random event definitions from TOML"`

---

### Task 2: core 通用随机事件引擎

**Files:**
- Create: `src/core/random-event.ts`
- Test: `src/core/random-event.test.ts`

**Interfaces:**
- Consumes: `RandomEventDef`（Task 1）、`premiseRegistry.getWeightSum(premises, ctx, strict)`、`evaluateCondition(expr, ctx)`、`gameContext`、`entitySystem`、`weightedRandom(items: {item: T, weight: number}[]): T | null`（`src/utils/weighted-random.ts`）
- Produces:
```typescript
export interface EventTriggerContext {
  subjectId: string            // 触发者 id
  targetId: string | null      // interactant（交互对象）
  [key: string]: any
}
export class RandomEventEngine {
  registerAll(defs: RandomEventDef[]): void   // 幂等重建索引
  clear(): void
  pick(behaviorId: string, ctx: EventTriggerContext): RandomEventDef | null
  getSonCandidates(behaviorId: string, father: RandomEventDef, ctx: EventTriggerContext): RandomEventDef[]
  recordTriggered(eventId: string): void
  recordTodayTriggered(eventId: string): void
  isTriggered(eventId: string): boolean
  isTodayTriggered(eventId: string): boolean
  resetToday(): void
  serialize(): { all: string[]; today: string[] }
  restore(data: { all: string[]; today: string[] }): void
  getDef(eventId: string): RandomEventDef | undefined
}
export const randomEventEngine: RandomEventEngine
export function interpolateEventText(text: string, subjectId: string, targetId: string | null): string
```

**语义（erArk handle_event 复刻）**：
- 分桶：`adv` 空 → 任何人候选；`side='self'` → subjectId 匹配 adv；`side='target'` → targetId 匹配 adv；`side='any'` → subject 或 target 任一匹配；`side='both'` → 双方都匹配
- 权重：`premiseRegistry.getWeightSum(premises, ctx, false)`（ctx 注入 `selectedCharacterId: subjectId, sourceId: subjectId, targetCharacterId: targetId`）→ 0 淘汰；无 premises → 权重 1（getWeightSum 空集返回 1）
- `condition` 布尔门（ctx = `{...gameContext.getContext(), selectedCharacterId: subjectId, sourceId: subjectId}`）
- `trigger_guard` 检查记录集（seen_*=须在记录中，unseen_*=须不在）
- 加权随机选中（`weightedRandom`）
- `getSonCandidates`：同 behavior、`option_son===true`、其 premises 集合（lower）⊇ 父事件 premises 集合、condition 满足、adv/guard 通过

- [ ] **Step 1: 写失败测试** — `src/core/random-event.test.ts`，用例清单：
  - `pick` 无 adv 通用事件命中；adv+side=target 匹配 targetId 时候选；targetId 不匹配时不选（返回 null 或选中其他）
  - `trigger_guard='unseen_once'`：未记录时选中，`recordTriggered` 后不再选中
  - 前提返回 0 → 候选淘汰（注册 `HIGH_0: () => 0`，仅该事件时 pick 返回 null）
  - 未知 behavior → null
  - `getSonCandidates`：父前提 {P1} → 收集 {P1} 和 {P1,P2} 两个子事件（P2 前提返回权重 2 不影响收集，只影响父选择）；选项文本 = `text.split('|')[0]`
  - 记录 serialize/restore 往返；resetToday 只清 today
  - `interpolateEventText`：`{self.name}`/`{target.name}` 从 entitySystem 读（预置 'player'/'令狐冲' 实体）；未知占位符原样保留
  - beforeEach：`entitySystem` 预置角色实体、`premiseRegistry.clear()` + 注册测试前提、`randomEventEngine.clear()` + `registerAll(defs)`。entitySystem 的实际 API（set/get/clear）以 `entity-system.ts` 为准

- [ ] **Step 2: 运行测试确认失败** — `npx vitest run src/core/random-event.test.ts` → FAIL（模块不存在）

- [ ] **Step 3: 实现 `src/core/random-event.ts`** — 结构：
```typescript
import type { RandomEventDef } from './mod-loader'
import { premiseRegistry } from './premise-registry'
import { evaluateCondition } from './condition'
import { entitySystem } from './entity-system'
import { gameContext } from './game-context'
import { weightedRandom } from '../utils/weighted-random'

export interface EventTriggerContext { subjectId: string; targetId: string | null; [key: string]: any }

export class RandomEventEngine {
  private defs = new Map<string, RandomEventDef>()
  private byBehavior = new Map<string, RandomEventDef[]>()
  private all = new Set<string>()    // 全时触发记录
  private today = new Set<string>()  // 今日触发记录

  registerAll(defs) { this.defs = new Map(); this.byBehavior = new Map(); for (const d of defs) { this.defs.set(d.id, d); const l = this.byBehavior.get(d.behavior) ?? []; l.push(d); this.byBehavior.set(d.behavior, l) } }
  clear() { this.defs = new Map(); this.byBehavior = new Map(); this.all = new Set(); this.today = new Set() }
  getDef(id) { return this.defs.get(id) }
  pick(behaviorId, ctx) {
    const cands = this.collect(behaviorId, ctx, (d) => d.option_son !== true)
    if (!cands.length) return null
    return weightedRandom(cands.map(c => ({ item: c, weight: c.weight })))
  }
  getSonCandidates(behaviorId, father, ctx) {
    const fp = new Set((father.premises ?? []).map(p => p.toLowerCase()))
    return this.collect(behaviorId, ctx, (d) => {
      if (d.option_son !== true) return false
      const sp = new Set((d.premises ?? []).map(p => p.toLowerCase()))
      for (const p of fp) if (!sp.has(p)) return false
      return true
    }).map(c => c.event)
  }
  recordTriggered(id) { this.all.add(id) }
  recordTodayTriggered(id) { this.today.add(id) }
  isTriggered(id) { return this.all.has(id) }
  isTodayTriggered(id) { return this.today.has(id) }
  resetToday() { this.today.clear() }
  serialize() { return { all: [...this.all], today: [...this.today] } }
  restore(data) { this.all = new Set(data.all ?? []); this.today = new Set(data.today ?? []) }

  private collect(behaviorId, ctx, extra): { event: RandomEventDef; weight: number }[] {
    const list = this.byBehavior.get(behaviorId) ?? []
    const out = []
    for (const d of list) {
      if (!extra(d)) continue
      if (!this.matchAdv(d, ctx)) continue
      if (!this.matchGuard(d)) continue
      if (d.condition && !evaluateCondition(d.condition, this.condCtx(ctx))) continue
      const weight = premiseRegistry.getWeightSum(d.premises ?? [], this.premiseCtx(ctx), false)
      if (weight <= 0) continue
      out.push({ event: d, weight })
    }
    return out
  }
  private matchAdv(d, ctx) {
    if (!d.adv) return true
    const sm = ctx.subjectId === d.adv
    const tm = ctx.targetId != null && ctx.targetId === d.adv
    switch (d.side ?? 'any') {
      case 'self': return sm
      case 'target': return tm
      case 'both': return sm && tm
      case 'any': return sm || tm
    }
  }
  private matchGuard(d) {
    switch (d.trigger_guard) {
      case 'seen_once': return this.all.has(d.id)
      case 'unseen_once': return !this.all.has(d.id)
      case 'seen_today': return this.today.has(d.id)
      case 'unseen_today': return !this.today.has(d.id)
      default: return true
    }
  }
  private premiseCtx(ctx) { return { ...ctx, selectedCharacterId: ctx.subjectId, sourceId: ctx.subjectId, targetCharacterId: ctx.targetId } }
  private condCtx(ctx) { return { ...gameContext.getContext(), selectedCharacterId: ctx.subjectId, sourceId: ctx.subjectId } }
}

export const randomEventEngine = new RandomEventEngine()

// 通用插值：{self.X}/{target.X}/{player.X}/{location.X} 从实体读取；未知名占位符原样保留
export function interpolateEventText(text: string, subjectId: string, targetId: string | null): string {
  if (!text) return text
  const playerId = gameContext.getContext().player?.id ?? null
  const locId = gameContext.getContext().location?.id ?? null
  return text.replace(/\{(\w+)\.(\w+)\}/g, (match, obj, prop) => {
    let id: string | null = null
    if (obj === 'self') id = subjectId
    else if (obj === 'target') id = targetId
    else if (obj === 'player') id = playerId
    else if (obj === 'location') id = locId
    if (id == null) return match
    const entity = entitySystem.get('character', id) ?? entitySystem.get('location', id)
    if (!entity) return match
    const v = (entity as any)?.[prop]
    return v !== undefined ? String(v) : match
  })
}
```
注意：`entitySystem.get` 实际签名与 `gameContext.getContext()` 的 location 字段名以实际代码为准；`weightedRandom` 对空/全 0 权重的行为需确认（若抛错则在 pick 里前置判断）。

- [ ] **Step 4: 运行测试确认通过** — `npx vitest run src/core/random-event.test.ts` → PASS

- [ ] **Step 5: Commit** — `git add src/core/random-event.ts src/core/random-event.test.ts && git commit -m "feat(core): generic random event engine with weighted candidates and trigger records"`

---

### Task 3: save-system gameState provider 注册表

**Files:**
- Modify: `src/core/save-system.ts`
- Test: `src/core/save-system.test.ts`

**Interfaces:**
- Produces:
```typescript
export interface GameStateProvider {
  id: string
  serialize: () => Record<string, any>
  restore: (data: Record<string, any>) => void
}
export function registerGameStateProvider(provider: GameStateProvider): void
```

**语义**：通用机制——`saveGame` 时 `gameState[provider.id] = provider.serialize()`（保留现有 `completedScenes` 键）；`restoreFromSave` 时对每个注册 provider 调 `restore(data.gameState?.[provider.id])`（try/catch + errorReporter warning）。

- [ ] **Step 1: 写失败测试** — `src/core/save-system.test.ts` 追加：注册 `{id:'test-provider', serialize:()=>({value:42}), restore:(d)=>{calls.push('restored:'+d?.value)}}` → `saveGame('slot',{})` → `loadGame('slot')` → `data.gameState['test-provider']` 为 `{value:42}`；restore 被调（若 loadGame 不自动 restore 则手动调 restoreFromSave）
- [ ] **Step 2: 运行测试确认失败** — `npx vitest run src/core/save-system.test.ts` → FAIL
- [ ] **Step 3: 实现**：`save-system.ts` 加接口 + `Map` 注册表 + 两个函数；`saveGame` 的 gameState 构造处展开 providers（`Object.fromEntries(providers.map(p => [p.id, p.serialize()]))`）；`restoreFromSave` 的 completedScenes 恢复后追加 provider 恢复循环（try/catch + errorReporter）
- [ ] **Step 4: 运行测试确认通过** — PASS
- [ ] **Step 5: Commit** — `git commit -m "feat(core): gameState provider registry for save/restore extensions"`

---

### Task 4: random-event-system 插件骨架 + 触发挂钩

**Files:**
- Create: `src/plugins/random-event-system/plugin.toml`
- Create: `src/plugins/random-event-system/types.ts`
- Create: `src/plugins/random-event-system/index.ts`
- Create: `src/plugins/random-event-system/trigger.ts`（触发流程核心）
- Test: `src/plugins/random-event-system/random-event-system.test.ts`

**Interfaces:**
- Consumes: `randomEventEngine`/`interpolateEventText`（Task 2）、`registerGameStateProvider`（Task 3）、`modLoader.getMod().events`、`apiSystem`、`effectTypeRegistry`、`eventBus`、`entitySystem`、`narrativeLog`、`gameContext`
- Produces:
```typescript
// types.ts
export interface PendingOption {
  behaviorId: string
  subjectId: string
  targetId: string | null
  fatherId: string
  options: { eventId: string; text: string }[]
  playerEvent: boolean
}
// API namespace 'random-event'
//   triggerFor(subjectId, behaviorId, targetId): Promise<void>
//   chooseOption(index): Promise<boolean>
//   getPending(): PendingOption | null
//   clearPending(): void
// trigger.ts 导出：triggerEventFor / choosePendingOption / getPendingOption / clearPendingOptions
```

**plugin.toml**：
```toml
[meta]
id = "random-event-system"
name = "行为期随机事件系统"
version = "1.0.0"
description = "复刻 erArk event.py：行为挂钩 + 前提权重候选 + 加权随机 + 子事件选项 + 触发记录"

dependencies = [
  { plugin = "effect-system", version = ">=1.0.0" }
]

[condition_fields]
"player.current_behavior" = { type = "string", description = "玩家当前行为（指令 id / move / wait）" }

[[events.listen]]
name = "game:execution_end"
description = "玩家行为结算后触发玩家事件"

[[events.listen]]
name = "npc:behavior_started"
description = "NPC 新行为开始时触发 NPC 事件"

[[events.listen]]
name = "game:new_day"
description = "重置今日触发记录"
```

- [ ] **Step 1: 写失败测试** — `src/plugins/random-event-system/random-event-system.test.ts`（先读 `npc-ai-system.test.ts` 复用其 modLoader/entitySystem/eventBus 初始化模式；测试数据放 `mods/test-mod/definitions/events/`）。用例：
  1. emit `game:execution_end {commandId:'chat'}` → 玩家 `current_behavior==='chat'`，chat 行为事件文本进 narrativeLog
  2. emit `npc:behavior_started {character, behavior_id:'rest'}` → 同地点 NPC 触发文本事件；不同地点 NPC 不触发（narrativeLog 无该文本）
  3. 静默事件（text 空）不同地点 NPC 也触发（效果执行可测：modify_attribute 改属性）
  4. 玩家事件带 `open_son_options` 效果 → `getPending()` 非空 → `chooseOption(0)` → 子事件文本 + 效果执行
  5. 事件带 `record_event_today` 效果 + `trigger_guard='unseen_today'` → 第一次触发，第二次（同日）不触发
  6. 存档：`serialize()/restore()` 往返（直接调 engine 或走 provider）
- [ ] **Step 2: 运行测试确认失败** — `npx vitest run src/plugins/random-event-system/random-event-system.test.ts` → FAIL

- [ ] **Step 3: 实现 `index.ts`**（结构要点）：
  - `onLoad`: `registerSystemEffects()`（Task 5）+ `validateEventData()`（warning：挂载键未匹配已知指令 id ∪ aiBehaviors ∪ ['move','wait'] 时报告，`mod.instructions` 取 id、`mod.aiBehaviors` 取 keys）
  - `onEnable`:
    1. `randomEventEngine.registerAll(mod?.events ?? [])`
    2. 注册 API `'random-event'`（triggerFor/chooseOption/getPending/clearPending → 转发 trigger.ts）
    3. `game:execution_end` 监听：`clearPendingOptions()` → 玩家实体 `current_behavior = payload.commandId` → `triggerEventFor(playerId, commandId, selected)`（selected 从 `gameContext.getContext().selectedCharacterId` 读）
    4. `npc:behavior_started` 监听：interactant = 玩家且同地点时 targetId=playerId，否则 null → `triggerEventFor(charId, behavior_id, targetId)`
    5. `game:new_day` → `randomEventEngine.resetToday()`
    6. `registerGameStateProvider({id:'random-event', serialize, restore})`
  - `_resetForTest()` 导出：`clearPendingOptions()`

- [ ] **Step 4: 实现 `trigger.ts`**（流程核心）：
```typescript
let pending: PendingOption | null = null
export function getPendingOption(): PendingOption | null { return pending }
export function clearPendingOptions(): void { pending = null }

export async function triggerEventFor(subjectId: string, behaviorId: string, targetId: string | null): Promise<void> {
  const event = randomEventEngine.pick(behaviorId, { subjectId, targetId })
  if (!event) return
  await runEvent(event, subjectId, targetId, behaviorId)
}

async function runEvent(event, subjectId, targetId, behaviorId): Promise<void> {
  const playerId = modLoader.getMod()?.playerCharacter ?? null
  const isPlayer = subjectId === playerId
  // 地点门控：NPC 且文本非空且玩家不同地点 → 跳过（静默事件任意地点）
  if (!isPlayer && event.text && !samePlace(subjectId, playerId)) return
  // 文本输出：正文段 = 子事件或带 open_son_options 效果的父事件取 split('|')[1]，否则全文
  if (event.text) {
    const body = isFatherWithOptions(event) ? (event.text.split('|')[1] ?? event.text) : event.text
    const text = await interpolateText(body, subjectId, targetId)
    narrativeLog.write(text, 'event', 'random-event-system')
  }
  // 效果结算：effect-system execute，execCtx：{ sourceId: subjectId, targetIds: targetId?[targetId]:[], _eventId: event.id, selectedCharacterId: targetId ?? subjectId }
  //   效果按数组顺序执行；set_interactant 类效果改写后续效果的 targetIds（Task 5）
  // 记录：open_son_options 效果执行时挂起 pending（父事件 + getSonCandidates 结果 + 选项文本插值）
}
```
`samePlace(a, b)`：双方实体 `current_location` 相等（null 安全）。`interpolateText`：先 `apiSystem.call('talk-common', 'replace', text, targetId ?? subjectId, subjectId)`（try/catch 降级原样），再 `interpolateEventText`。`choosePendingOption(index)`：取 pending → 校验 index → 输出子事件正文（split('|')[1]）+ 效果结算（同 runEvent 的效果逻辑）→ pending=null；index 非法返回 false。子事件效果结算的 targetIds 与父事件一致。

- [ ] **Step 5: 运行测试确认通过** — `npx vitest run src/plugins/random-event-system/random-event-system.test.ts` → PASS（Task 5 效果未注册时先跳过含系统效果的用例，或临时用 mod 自带效果如 modify_attribute 写事件）
- [ ] **Step 6: Commit** — `git commit -m "feat(random-event-system): plugin skeleton with player/npc trigger hooks"`

---

### Task 5: 系统效果集

**Files:**
- Create: `src/plugins/random-event-system/system-effects.ts`
- Modify: `src/plugins/random-event-system/trigger.ts`（效果执行上下文支持交互目标改写）

**Interfaces:**
- Produces（effectTypeRegistry 注册，对应 erArk 系统效果）：
```typescript
// 'noop'                          —— erArk 9999（25 处）：无操作
// 'record_event'                  —— erArk 10008（数据零使用，机制保留）：记全时记录
// 'record_event_today'            —— erArk 10009（6 处）：记今日记录
// 'open_son_options'              —— erArk 10001（40 处）：挂起父事件子选项
// 'set_interactant'               —— erArk 10002/10005/10006/10007/10013 统一入口：
//                                    params.mode = 'player'|'self'|'masturbator'|'most_desire'|'player_target_to_me'
// 'interrupt_activity'            —— erArk 10000（8 处）：中断目标活动
```

**语义（复刻 erArk handle_comprehensive_value_effect 的目标改写 + settle_behavior 系统效果）**：
- `record_event`/`record_event_today`：读 `ctx._eventId`（runEvent 注入）→ `randomEventEngine.recordTriggered/recordTodayTriggered`；无 `_eventId` 时静默跳过
- `open_son_options`：从 `trigger.ts` 的 runEvent 流程调用（父事件上下文）——实现为 trigger.ts 内部函数而非独立效果（效果 handler 无父事件上下文）；效果存在时 runEvent 在文本输出后调 `pending = buildPending(event, subjectId, targetId, behaviorId)`，并 emit `random-event:options`（payload `{options, fatherId}`，供 bridge 同步 UI）；`buildPending` 用 `getSonCandidates` + 选项文本插值（split('|')[0]）；候选为空 → 不挂起
- `set_interactant`：效果执行时改写 `ctx._targetIds`（后续效果的目标解析）；实现：effect handler 返回特殊标记或在 runEvent 的效果循环中特判——**推荐**：runEvent 的效果循环里检查 `effect.type === 'set_interactant'`，按其 mode 计算新 targetId 并更新后续效果的 targetIds（不注册为独立 effect handler，避免顺序问题）。mode 语义：
  - `player`（10002）：targetId = playerId（NPC 事件把交互对象改为玩家）
  - `self`（10006）：targetId = subjectId
  - `player_target_to_me`（10005）：`gameContext.setSelectedCharacterId(subjectId)`（NPC 事件让玩家 UI 选中自己；bridge 已有 selectedCharacterId→uiStore 同步 watch）
  - `masturbator`（10007）：当前地点中第一个 `h_state?.is_h` 且无 `h_state.target_character_id` 的角色 id；无则不变
  - `most_desire`（10013）：当前地点中 `base.欲望值`（经 bindings 或 base 直接读）最高者；无则不变
- `interrupt_activity`：`apiSystem.call('npc-ai', 'setBehavior', targetId, 'wait')`（try/catch；无 wait 规格或调用失败 → warning + 跳过）。若测试环境无 npc-ai 插件，效果静默跳过（数据校验 warning 不阻止）

- [ ] **Step 1: 写失败测试** — 在 Task 4 的 `random-event-system.test.ts` 追加用例：`record_event_today` 效果写入后 `isTodayTriggered` 为 true；`set_interactant mode='player'` 后子事件效果作用于玩家（modify_attribute 改玩家属性）；`open_son_options` 挂起（Task 4 用例 4 已覆盖）；`interrupt_activity` 对 NPC 生效或降级跳过
- [ ] **Step 2: 运行测试确认失败** — FAIL（效果未注册）
- [ ] **Step 3: 实现 `system-effects.ts`**：`registerSystemEffects()` 注册 noop/record_event/record_event_today（open_son_options/set_interactant/interrupt_activity 走 trigger.ts 特判 + 一个内部效果占位避免加载 warning——`open_son_options` 注册为实际 handler 也可：handler 里调 `openSonOptionsFor(pendingCtx)` 若 trigger.ts 暴露挂起函数则直接调；**推荐**：注册 `open_son_options` 为真实 handler，内部从模块级 `currentEventContext`（trigger.ts 导出 setter）取上下文挂起）
- [ ] **Step 4: 运行测试确认通过** — PASS
- [ ] **Step 5: Commit** — `git commit -m "feat(random-event-system): system effects (record/options/interactant/interrupt)"`

---

### Task 6: 事件文本插值管线（已并入 Task 4 Step 4 的 interpolateText，本任务补 talk-common 降级测试）

**Files:**
- Test: 追加到 `random-event-system.test.ts`

- [ ] **Step 1: 写失败测试** — 事件文本含 `{Variable}`（talk-common 变量）与 `{self.name}`：talk-common 未启用（onEnable 未跑）→ `{Variable}` 原样保留、`{self.name}` 正常替换；talk-common 启用且有该变量数据 → 替换
- [ ] **Step 2: 实现/确认** — trigger.ts 的 `interpolateText` 已实现（Task 4）；补测试即可
- [ ] **Step 3: 运行测试确认通过** — PASS
- [ ] **Step 4: Commit** — `git commit -m "test(random-event-system): text interpolation with talk-common fallback"`

---

### Task 7: 选项条 UI

**Files:**
- Modify: `src/ui/stores/ui-store.ts`（eventOptions state）
- Modify: `src/ui/engine-ui-bridge.ts`（监听 random-event 事件 → 同步 store）
- Create: `src/ui/components/EventOptionBar.vue`
- Modify: `src/ui/layout/AppLayout.vue`（或 ExplorationLayout/ModernLayout——指令栏所在布局，挂载组件）

**Interfaces:**
```typescript
// ui-store 新增：
const eventOptions = ref<{ id: string; text: string }[] | null>(null)
function setEventOptions(opts: { id: string; text: string }[] | null)   // null = 清除
// engine-ui-bridge 新增监听：
//   'random-event:options' {options} → setEventOptions(options)
//   'random-event:options_clear' → setEventOptions(null)
//   'game:execution_start' → setEventOptions(null)（新行动开始作废挂起选项）
```

- [ ] **Step 1: 写失败测试** — `src/ui/stores/ui-store.test.ts` 追加 setEventOptions/clear 用例；bridge 测试（若有）补事件同步用例
- [ ] **Step 2: 运行测试确认失败** — FAIL（无此 state）
- [ ] **Step 3: 实现 ui-store + bridge** — 如上接口；bridge 的 execStartHandler 里加 `setEventOptions(null)`
- [ ] **Step 4: 实现 EventOptionBar.vue** — 渲染在指令栏上方：`v-if="uiStore.eventOptions"` 显示父文本提示 + 按钮列表；点击 → `apiSystem.call('random-event', 'chooseOption', index)` → `uiStore.setEventOptions(null)`。样式走 CSS 变量（--color-primary 等），不写死
- [ ] **Step 5: 挂载** — 在含 CommandBar 的布局组件中 `<EventOptionBar />` 置于 CommandBar 上方
- [ ] **Step 6: 运行测试确认通过** — `npx vitest run src/ui` → PASS；`npm run typecheck` 通过
- [ ] **Step 7: Commit** — `git commit -m "feat(ui): event option bar for random event son options"`

---

### Task 8: 默认数据 + 端到端集成测试

**Files:**
- Create: `src/plugins/random-event-system/data/default/events/move.toml`（插件默认层示例）
- Create: `mods/test-mod/definitions/events/chat.toml`、`move.toml`、`rest.toml`（测试数据）
- Modify: `src/plugins/random-event-system/random-event-system.test.ts`（端到端用例）

**数据格式（TOML 定稿，手册以此为准）**：
```toml
# mods/test-mod/definitions/events/move.toml
[[events]]
id = "move_see_swordsman"
behavior = "move"
type = 0
text = "{self.name}在赶路时遇到一位剑客。"
effects = [
  { type = "modify_attribute", params = { attr = "体力", value = -5, target = "self" } },
  { type = "narrative_output", params = { text = "剑客向你点头致意。" } }
]

[[events]]
id = "move_washroom_sound"
behavior = "move"
type = 0
text = "浴室传来声响，要进去看看吗？|你推开门，里面空无一人。"
premises = ["PLACE_0"]
effects = [{ type = "open_son_options", params = {} }]

[[events]]
id = "move_washroom_enter"
behavior = "move"
type = 0
text = "进去看看|你悄悄走了进去。"
option_son = true
premises = ["PLACE_0"]
effects = [{ type = "modify_attribute", params = { attr = "勇气", value = 1, target = "self" } }]

[[events]]
id = "move_washroom_leave"
behavior = "move"
type = 0
text = "转身离开|你离开了浴室。"
option_son = true
premises = ["PLACE_0"]
effects = [{ type = "noop", params = {} }]
```

- [ ] **Step 1: 写失败测试** — 端到端用例（复用 Task 4 setup）：完整插件加载 → 移动事件命中（Math.random mock 固定选中）→ 父事件文本 + 选项挂起 → chooseOption 选"转身离开"→ noop 效果；玩家属性被 modify_attribute 修改；`trigger_guard` 事件第二次不触发
- [ ] **Step 2: 运行测试确认失败** — FAIL（数据不存在）
- [ ] **Step 3: 创建数据文件** — 如上格式（test-mod 数据含 chat/move/rest 三类行为事件；默认层 move.toml 给 1-2 个通用示例）
- [ ] **Step 4: 实现插件默认层数据** — `src/plugins/random-event-system/data/default/events/move.toml`（会被 mod 数据覆盖/累积）
- [ ] **Step 5: 运行测试确认通过** — `npx vitest run src/plugins/random-event-system` → PASS
- [ ] **Step 6: 全量验证** — `npm run typecheck && npm run test` 全绿
- [ ] **Step 7: Commit** — `git commit -m "feat(random-event-system): default data and e2e tests"`

---

### Task 9: 文档

**Files:**
- Create: `docs/random-event-system.md`（使用手册——概念/数据格式/API/触发时机/与各系统交互/erArk 对照与偏差表）
- Create: `docs/adr/0008-random-event-system.md`（架构决策：core 机制 + 插件挂钩、统一行为 ID 挂载、interactant 上下文、非阻塞挂起选项、0/1 合并、地点门控、死代码偏差）
- Modify: `docs/master-todo.md`（登记系统状态；移除"行为期随机事件（event.py，独立大系统）"的后置项）
- Modify: `docs/plugin-author-guide.md`（API 速查表加 `random-event` namespace：triggerFor/chooseOption/getPending/clearPending + 系统效果表）
- Modify: `AGENTS.md`（如需——架构总纲的插件列表补 random-event-system；本计划 Global Constraints 已记录偏差）

- [ ] **Step 1: 写手册** — 覆盖：概念（事件挂行为、候选筛选管线、子事件选项、触发记录）、数据格式（TOML 字段表 + 示例）、触发时机（玩家 execution_end / NPC behavior_started + 地点门控）、前提与条件、系统效果表、API 表、与其他系统交互（npc-ai/dialogue/talk-common/effect-system/save-system/ui）、与 erArk 对照 + 有意偏差表
- [ ] **Step 2: 写 ADR** — 记录 Q1-Q16 grill 决策 + 偏差理由
- [ ] **Step 3: 更新 master-todo + plugin-author-guide** — 按铁律同步
- [ ] **Step 4: 全量验证** — `npm run typecheck && npm run test` 全绿；架构合规扫描（src/core 无玩法名词、插件间无直接 import——本插件仅 import core，无跨插件 import）
- [ ] **Step 5: Commit** — `git commit -m "docs(random-event-system): manual, ADR, master-todo, plugin-author-guide"`

---

## Self-Review

**Spec 覆盖**：行为挂钩 ✅（Task 4）｜候选筛选/加权随机 ✅（Task 2）｜文本插值 ✅（Task 4/6）｜效果结算 ✅（Task 4/5）｜子事件选项 ✅（Task 4/5/7）｜触发记录 ✅（Task 2/3/5）｜地点门控 ✅（Task 4）｜类型 0/1 合并 + type2 静默 ✅（Task 2 数据 + Task 4 门控）｜玩家行为镜像 ✅（Task 4）｜存档 ✅（Task 3）｜数据加载 ✅（Task 1）｜文档 ✅（Task 9）

**已知待执行者确认的接口点**：`entitySystem.get` 签名、`gameContext.getContext()` 的 player/location 字段名、`weightedRandom` 空列表行为、`effectTypeRegistry.register` 签名（参照 effect-system 的 onLoad 注册模式）、npc-ai 测试的 setup 模式。所有"注意"已随任务注明。

