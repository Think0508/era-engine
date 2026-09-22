# 运行时属性修正（带到期时刻）Implementation Plan · 计划三

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让"临时改属性"有数据驱动入口 —— 修正能挂上去、到点自己消失，**基础值永不被污染**；同时把状态层数（破绽/中毒）的"基础层数 + 层数修正 − 衰减"三层模型落地。

**Architecture:** core 的 `src/core/attribute-eval.ts` 增加**第四个来源**（运行时修正清单 `char.attr_mods`），与计划二的声明式三源共用同一份叠加代数与闸门；到点判定走注入的时钟，过期条目在读时跳过。状态系统把"剩余时长"改成"到期时刻"，并新增层数修正与衰减。战斗效果新增 `modify_attribute` 动作，在既有 `recalcStats` 全量重算里按签名增量同步。

**Tech Stack:** TypeScript、Vitest、`@iarna/toml`。

**设计依据:** `docs/superpowers/specs/2026-09-22-runtime-attribute-modifiers-design.md`（D1–D13）。上游：计划一（读取管线）、计划二（声明式来源，已合入 main）。

## Global Constraints

- **三层架构铁律**：core 不认任何**属性名**（气血/破绽那类是数据）。本计划新增的引擎契约是：`char.attr_mods`（运行时修正清单）的形状、`StatusEffectDef` 的新字段（`attribute_mods` / `stack_mods` / `stack_decay`）、`apply_status` 的 `stack`/`stack_add` 参数，以及战斗动作名 `modify_attribute`。
- **基础值神圣**（本设计第一验收点）：临时修正**永不写回基础值**。`applyAttrDelta` / `readRawAttr` / `bindingResolver.getRaw` 的基础值域契约不得回退。`status-effects."攻击增益"` 现在用 `on_apply_effects` 改 base，**必须迁移**掉（§2.1 的雷）。
- **叠加代数只有一份**：`((set ?? 值) + Σflat) × (1 + Σpercent)`；percent 相加后只乘一次；多个 `set` 取清单顺序最后一条。运行时来源与声明式来源共用计划二抽出的同一个累积闭包。
- **顶替语义（D5）**：同 (id, attr) 再次施加时，新强度 `<` 现有强度 → **什么都不发生（不降级、不刷新时长）**；`>=` → 顶上并重置为新的完整时长。强度由调用方作为 `strength` 参数显式给出，并**随条目持久化**（存档往返后比较仍成立）。
- **强度算式（统一，不得各写各的）**：`strength = set ?? flat ?? percent ?? 0`（破绽3 → 3；中毒 −20% → −0.2；加层类 → 累计值）。缺省（老档迁移条目无此字段）视为 `-Infinity`，任何新施加都能覆盖它。
- **到期存绝对时刻**（D3）：`now >= expiresAt` 即失效。**禁止**再用"每次 hour_changed 硬扣 60 分钟"。
- **时长单位 = 分钟**（D6）：`4320` = 3 天。现有 中毒360/醉意120/攻击增益180 的数值不动。
- **`per_level` 只允许用在被动技能/天赋**：状态定义与战斗效果写了 `per_level` → 加载期 error。
- **零回归**：分支前基线 **1704 passed / 5 skipped / 0 failed**。**不得修改任何原有测试用例来迁就实现**。
- 中文属性名/字段名属结构数据：测试中不得用 `obj['中文']` 下标取值（`npm run scan:attrs` 判违规）；字符串字面量实参安全。
- 每个任务结束都要提交（`git commit`；pwsh 下**用两个 `-m`**，不要跨行引号）。
- 分支前必查：`npm run test`（0 failed）｜`npm run typecheck`（exit 0）｜`npm run scan:attrs`（VIOLATION=0）｜`npm run validate`（4 passed）。

## File Structure

| 文件 | 职责 | 动作 |
|---|---|---|
| `src/core/attribute-eval.ts` | 运行时修正清单：类型、时钟注入、聚合、注册/移除/剪除、闸门与缓存接线 | Modify |
| `src/core/attribute-eval.test.ts` | 上述全部单元测试 | Modify |
| `src/core/mod-loader.ts` | 注入时钟（`nowMinutes`） | Modify |
| `src/core/mod-validate.ts` | 状态定义/战斗效果的属性修正与层数修正加载期校验 | Modify |
| `src/core/mod-types.ts` | `StatusEffectDef` 加三个可选字段 | Modify |
| `src/plugins/status-system/index.ts` | `expiresAt` 迁移、层数三层模型、`apply_status` 新参数、修正生灭 | Modify |
| `src/plugins/status-system/index.test.ts` | 状态侧全部测试 | Modify |
| `src/plugins/combat-base/index.ts` | `modify_attribute` 战斗动作 + `recalcStats` 增量同步 + 战斗结束清理 | Modify |
| `src/plugins/combat-base/effect-validate.ts`（或现有校验处） | 战斗效果 `modify_attribute` 的库条目校验 | Modify |
| `mods/test-mod/definitions/status-effects.toml` | 夹具：带属性修正的状态、带层数修正的状态、迁移 攻击增益 | Modify |
| `docs/attributes-system.md` | 作者侧契约（运行时来源、层数三层模型、`merge` 语义） | Modify |

---

### Task 1: core 运行时修正清单（类型 + 时钟 + 聚合 + 注册语义）

**Files:**
- Modify: `src/core/attribute-eval.ts`
- Test: `src/core/attribute-eval.test.ts`

**Interfaces:**
- Consumes（既有）：`AttributeMod`、`AttributeModSource`、`collectDeclarativeMods`、`applyMods` 内的共享累积闭包 `acc`、`stateOf`
- Produces:
  - `interface RuntimeAttrMod { id: string; attr: string; flat?: number; percent?: number; set?: number; expiresAt?: number; source?: string }`
  - `configureAttributeEval(cfg)` 新增可选字段 `nowMinutes?: () => number`
  - `readRuntimeMods(entity: any): RuntimeAttrMod[]`（读时现算 + 剪除过期条目写回实体，导出供测试与调试）
  - `registerRuntimeMod(entity: any, entry: RuntimeAttrMod, strength: number): boolean`（按 D5 施加；返回是否顶上）
  - `removeRuntimeMod(entity: any, id: string, attr?: string): number`
  - `removeRuntimeModsByPrefix(entity: any, prefix: string): number`
  - `__resetAttributeEval()` 一并重置时钟

- [ ] **Step 1: 写失败测试**

在 `src/core/attribute-eval.test.ts` 末尾追加（沿用该文件既有风格：本地 `DEFS`、`__resetAttributeEval()`、`errorReporter.clear()`）：

```ts
describe('attribute-eval：运行时修正（带到期时刻）', () => {
  let NOW = 1000
  const RUNTIME_DEFS = { definitions: { 力道: {} }, defs: {} as any }

  beforeEach(() => {
    __resetAttributeEval()
    errorReporter.clear()
    NOW = 1000
    configureAttributeEval({ ...RUNTIME_DEFS, nowMinutes: () => NOW })
  })

  const ent = (id: string) => ({ id })

  it('挂上的修正参与读取；到期后不再参与，且条目被剪除', () => {
    const c = ent('r1')
    registerRuntimeMod(c, { id: 'status:中毒', attr: '力道', flat: -20, expiresAt: 2000 }, -20)
    expect(readEffective(c, '力道', 100)).toBe(80)
    NOW = 2000                       // 到点（now >= expiresAt）
    expect(readEffective(c, '力道', 100)).toBe(100)
    expect((c as any).attr_mods).toHaveLength(0)   // 已被剪除
  })

  it('无 expiresAt = 不自动到期', () => {
    const c = ent('r2')
    registerRuntimeMod(c, { id: 'combat:e1', attr: '力道', flat: 5 }, 5)
    NOW = 999999
    expect(readEffective(c, '力道', 100)).toBe(105)
  })

  it('D5：强度 <= 现有 → 什么都不发生（不降级、不刷新时长）', () => {
    const c = ent('r3')
    registerRuntimeMod(c, { id: 'status:破绽', attr: '力道', set: 3, expiresAt: 2000 }, 3)
    NOW = 1500
    const applied = registerRuntimeMod(c, { id: 'status:破绽', attr: '力道', set: 2, expiresAt: 9999 }, 2)
    expect(applied).toBe(false)
    expect(readEffective(c, '力道', 100)).toBe(3)          // 还是 3
    expect((c as any).attr_mods[0].expiresAt).toBe(2000)   // 时长也没刷新
  })

  it('D5：强度 > 现有 → 顶上 + 时长重置为新的完整时长', () => {
    const c = ent('r4')
    registerRuntimeMod(c, { id: 'status:破绽', attr: '力道', set: 3, expiresAt: 2000 }, 3)
    NOW = 1500
    const applied = registerRuntimeMod(c, { id: 'status:破绽', attr: '力道', set: 5, expiresAt: 9999 }, 5)
    expect(applied).toBe(true)
    expect(readEffective(c, '力道', 100)).toBe(5)
    expect((c as any).attr_mods[0].expiresAt).toBe(9999)
  })

  it('强度相等也要顶上并刷新时长（D5 边界）', () => {
    const c = ent('r5')
    registerRuntimeMod(c, { id: 'status:中毒', attr: '力道', flat: -10, expiresAt: 2000 }, -10)
    expect(registerRuntimeMod(c, { id: 'status:中毒', attr: '力道', flat: -10, expiresAt: 3000 }, -10)).toBe(true)
    expect((c as any).attr_mods[0].expiresAt).toBe(3000)
  })

  it('强度随条目持久化：JSON 往返后仍能正确判定顶替', () => {
    const c = ent('r5b')
    registerRuntimeMod(c, { id: 'status:破绽', attr: '力道', set: 3, expiresAt: 2000 }, 3)
    const revived: any = JSON.parse(JSON.stringify(c))     // 模拟存档 → 读档
    expect(registerRuntimeMod(revived, { id: 'status:破绽', attr: '力道', set: 2, expiresAt: 9999 }, 2)).toBe(false)
    expect(readEffective(revived, '力道', 100)).toBe(3)
  })

  it('幂等：同 id 同属性不产生重复条目', () => {
    const c = ent('r6')
    registerRuntimeMod(c, { id: 'combat:e1', attr: '力道', flat: 1 }, 1)
    registerRuntimeMod(c, { id: 'combat:e1', attr: '力道', flat: 2 }, 2)
    registerRuntimeMod(c, { id: 'combat:e1', attr: '力道', flat: 3 }, 3)
    expect((c as any).attr_mods).toHaveLength(1)
    expect(readEffective(c, '力道', 100)).toBe(103)
  })

  it('与声明式来源共用一份代数（percent 相加只乘一次）', () => {
    __resetAttributeEval()
    NOW = 1000
    configureAttributeEval({
      definitions: { 力道: {} },
      defs: { items: { 护腕: { attribute_mods: [{ attr: '力道', flat: 5 }] } } },
      nowMinutes: () => NOW,
    })
    const c: any = { id: 'r7', equipment: { accessory: '护腕' } }
    registerRuntimeMod(c, { id: 'status:x', attr: '力道', percent: 0.2 }, 0.2)
    registerRuntimeMod(c, { id: 'status:y', attr: '力道', percent: 0.3 }, 0.3)
    // 声明式 flat 5 + 运行时两个 percent（0.2+0.3）→ (100+5) × 1.5
    expect(readEffective(c, '力道', 100)).toBe(157.5)
  })

  it('removeRuntimeMod / removeRuntimeModsByPrefix', () => {
    const c = ent('r8')
    registerRuntimeMod(c, { id: 'combat:a', attr: '力道', flat: 1 }, 1)
    registerRuntimeMod(c, { id: 'combat:b', attr: '力道', flat: 2 }, 2)
    registerRuntimeMod(c, { id: 'status:z', attr: '力道', flat: 3 }, 3)
    expect(removeRuntimeModsByPrefix(c, 'combat:')).toBe(2)
    expect(readEffective(c, '力道', 100)).toBe(103)
    expect(removeRuntimeMod(c, 'status:z')).toBe(1)
    expect(readEffective(c, '力道', 100)).toBe(100)
  })

  it('缺状态字段 / 非数组 attr_mods → 静默跳过，不崩', () => {
    expect(readEffective({ id: 'r9' }, '力道', 100)).toBe(100)
    expect(readEffective({ id: 'r10', attr_mods: 'nonsense' as any }, '力道', 100)).toBe(100)
  })

  it('无 nowMinutes 注入（单测直调）→ 视为不过期', () => {
    __resetAttributeEval()
    configureAttributeEval({ definitions: { 力道: {} }, defs: {} as any })
    const c = ent('r11')
    registerRuntimeMod(c, { id: 'x', attr: '力道', flat: 7, expiresAt: 1 }, 7)
    expect(readEffective(c, '力道', 100)).toBe(107)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/core/attribute-eval.test.ts`
Expected: FAIL —— `registerRuntimeMod is not a function`（导出尚不存在）

- [ ] **Step 3: 实现**

在 `src/core/attribute-eval.ts` 中：

1. 类型与状态（放在 `AttributeModSource` / `DeclarativeDefs` 旁边）：

```ts
/** 运行时修正（带到期时刻）——存实体 `char.attr_mods`，随存档往返（纯数据字段） */
export interface RuntimeAttrMod {
  /** 来源标识：状态用 `status:<状态ID>`，战斗用 `combat:<效果实例ID>` */
  id: string
  attr: string
  flat?: number
  percent?: number
  set?: number
  /** 绝对游戏分钟；缺省 = 不自动到期（由来源显式移除） */
  expiresAt?: number
  source?: string
  /** D5 比较用的强度，随条目持久化（存档往返后比较仍成立）。缺省 = -Infinity（老档条目，任何新施加都能覆盖） */
  strength?: number
}

const RUNTIME_FIELD = 'attr_mods'
let nowMinutes: (() => number) | null = null
```

2. `configureAttributeEval` 增加分支：`if (cfg.nowMinutes) nowMinutes = cfg.nowMinutes`；`__resetAttributeEval()` 中 `nowMinutes = null`。

3. 读时现算 + 剪除（**每次读取都重算：不缓存 → 到点立即失效，无需通知**）：

```ts
/** 读实体的运行时修正清单：跳过并剪除已过期条目。返回的条目保证在当前时刻有效 */
export function readRuntimeMods(entity: any): RuntimeAttrMod[] {
  if (!entity || typeof entity !== 'object') return []
  const list = (entity as any)[RUNTIME_FIELD]
  if (!Array.isArray(list) || list.length === 0) return []
  const now = nowMinutes ? nowMinutes() : null
  const live: RuntimeAttrMod[] = []
  let dropped = false
  for (const raw of list) {
    if (!raw || typeof raw !== 'object' || typeof raw.attr !== 'string' || raw.attr.length === 0) continue
    if (now !== null && typeof raw.expiresAt === 'number' && now >= raw.expiresAt) { dropped = true; continue }
    live.push(raw as RuntimeAttrMod)
  }
  // 只在真的剪掉了东西时才写回（避免每次读取都产生一次无意义的赋值）
  if (dropped) (entity as any)[RUNTIME_FIELD] = live
  return live
}
```

4. 施加语义（D5）：

```ts
/** 施加/刷新一条运行时修正。
 *  强度（strength）由调用方给出并随条目持久化：`<` 现有 → 不生效（不降级、不刷新时长）；
 *  `>=` 现有 → 顶上并重置为该条自己的 expiresAt。返回是否顶上。 */
export function registerRuntimeMod(entity: any, entry: RuntimeAttrMod, strength: number): boolean {
  if (!entity || typeof entity !== 'object') return false
  if (!entry || typeof entry.id !== 'string' || entry.id.length === 0) return false
  if (typeof entry.attr !== 'string' || entry.attr.length === 0) return false
  if (!Number.isFinite(strength)) return false
  if (!Array.isArray((entity as any)[RUNTIME_FIELD])) (entity as any)[RUNTIME_FIELD] = []
  const list = (entity as any)[RUNTIME_FIELD] as RuntimeAttrMod[]
  const next: RuntimeAttrMod = { ...entry, strength }
  const i = list.findIndex(m => m.id === entry.id && m.attr === entry.attr)
  if (i >= 0) {
    const prev = typeof list[i].strength === 'number' ? list[i].strength : Number.NEGATIVE_INFINITY
    if (!(strength >= prev)) return false
    list[i] = next
  } else {
    list.push(next)
  }
  notifyAttrWrite(entity)
  return true
}
```

> 强度**写在条目上**（不是 WeakMap）：它必须随存档往返，否则"存了破绽3、读档后又打来破绽2"会因丢失强度而错误顶替。

5. 移除：

```ts
export function removeRuntimeMod(entity: any, id: string, attr?: string): number {
  if (!entity || typeof entity !== 'object') return 0
  const list = (entity as any)[RUNTIME_FIELD]
  if (!Array.isArray(list)) return 0
  const before = list.length
  ;(entity as any)[RUNTIME_FIELD] = list.filter((m: any) => !(m.id === id && (attr === undefined || m.attr === attr)))
  const removed = before - (entity as any)[RUNTIME_FIELD].length
  if (removed > 0) notifyAttrWrite(entity)
  return removed
}

export function removeRuntimeModsByPrefix(entity: any, prefix: string): number {
  if (!entity || typeof entity !== 'object') return 0
  const list = (entity as any)[RUNTIME_FIELD]
  if (!Array.isArray(list)) return 0
  const before = list.length
  ;(entity as any)[RUNTIME_FIELD] = list.filter((m: any) => !(typeof m?.id === 'string' && m.id.startsWith(prefix)))
  const removed = before - (entity as any)[RUNTIME_FIELD].length
  if (removed > 0) notifyAttrWrite(entity)
  return removed
}
```

6. **闸门与叠加接线**（在计划二已有的 `decl` 之后；两者都并入同一份清单与同一个闭包）：

```ts
  const decl = collectDeclarativeMods(entity)
  const runtime = readRuntimeMods(entity)                  // 读时剪除过期条目
  const all: AttributeModSource[] = [...decl, ...runtime]  // 顺序：声明式在前，运行时在后（set 最后一条胜出）
  const hasDecl = all.some(m => m.attr === name)
  if (!hasCompute && !hasMods(entity, name) && !hasDecl) return raw
  // …（深度护栏、缓存策略照旧）
  const cacheable = all.length === 0
  // …applyMods(entity, name, v, all)
```

> ⚠️ **`cacheable` 判定必须包含运行时清单**：否则"挂修正时读过一次（进了缓存）→ 修正到期"会命中旧缓存返回陈旧值。与计划二同一处策略，不要只在 `decl` 上判。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/core/attribute-eval.test.ts`
Expected: PASS（原有用例 + 新增全绿）

- [ ] **Step 5: 零回归 + 类型检查**

Run: `npm run test`（须 0 failed）｜`npm run typecheck`（exit 0）｜`npm run scan:attrs`（VIOLATION=0）

- [ ] **Step 6: 提交**

```bash
git add src/core/attribute-eval.ts src/core/attribute-eval.test.ts
git commit -m "feat(core): 运行时属性修正清单（带到期时刻）+ D5 顶替语义" -m "与声明式三源共用同一份叠加代数与闸门；到期判定走注入时钟，过期条目读时剪除。强度比较由调用方显式给出（同强度也顶上并按新时长刷新）。cacheable 判定纳入运行时清单，避免到期后命中陈旧缓存。"
```

---

### Task 2: mod-loader 注入时钟 + 加载期校验 + 夹具

**Files:**
- Modify: `src/core/mod-loader.ts`、`src/core/mod-validate.ts`、`src/core/mod-types.ts`
- Test: `src/core/mod-loader.test.ts`
- 夹具：`mods/test-mod/definitions/status-effects.toml`

**Interfaces:**
- Consumes：Task 1 的 `RuntimeAttrMod`、`configureAttributeEval({ nowMinutes })`
- Produces：`StatusEffectDef` 新增可选字段 `attribute_mods?` / `stack_mods?` / `stack_decay?`；`validateAttributeMods` 覆盖状态定义；时钟注入生效

- [ ] **Step 1: 写失败测试**

在 `src/core/mod-loader.test.ts` 的相关 describe 内追加（沿用该文件 `new ModLoader()` + `loadMod('test-mod')` 惯例）：

```ts
it('时钟注入：真实 loadMod 后，带到期时刻的运行时修正按游戏时间生效/失效', async () => {
  const loader = new ModLoader()
  await loader.loadMod('test-mod')
  const p = entitySystem.get('character', 'player') as any
  expect(getEntityAttr(p, '修正测试值')).toBe(100)

  registerRuntimeMod(p, { id: 'status:测试', attr: '修正测试值', flat: 25, expiresAt: 1e15 }, 25)
  expect(getEntityAttr(p, '修正测试值')).toBe(125)

  registerRuntimeMod(p, { id: 'status:测试', attr: '修正测试值', flat: 25, expiresAt: 0 }, 25)
  // expiresAt = 0 → 立即过期；强度相等 → 顶上（换成已过期的那条）
  expect(getEntityAttr(p, '修正测试值')).toBe(100)
})
```

（顶部 import 补 `registerRuntimeMod`——`noUnusedLocals` 开着，只 import 真正用到的。）

校验用例（沿用本文件既有的 `parseModData` + 合成 TOML + `errorReporter` 惯例）：

```ts
it('状态定义的 attribute_mods/stack_mods 加载期校验：per_level 报错、未知状态报错', () => {
  errorReporter.clear()
  parseModData('test-mod', makeMap({
    '/mods/test-mod/definitions/status-effects.toml': [
      '[status-effects."坏状态"]',
      'name = "坏状态"',
      'description = "x"',
      'category = "debuff"',
      'duration = 60',
      'tick_interval = 0',
      'stackable = false',
      'max_stack = 1',
      'attribute_mods = [ { attr = "修正测试值", flat = 1, per_level = 2 } ]',
      'stack_mods = [ { status = "不存在的状态", value = -1 } ]',
    ].join('\n'),
  }))
  const errs = errorReporter.getErrors().filter(e => e.severity === 'error')
  expect(errs.some(e => e.message.includes('per_level'))).toBe(true)
  expect(errs.some(e => e.message.includes('不存在的状态'))).toBe(true)
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/core/mod-loader.test.ts`
Expected: FAIL —— `registerRuntimeMod is not a function` / 无 error 上报

- [ ] **Step 3: 实现**

1. `mod-types.ts` 的 `StatusEffectDef` 追加（**可选字段，不破坏现有数据**）：

```ts
  /** 生效期间对该角色属性的临时修正（属性有效值层运行时来源） */
  attribute_mods?: AttributeModSource[]
  /** 对其他状态层数的修正（如护体：破绽 −1） */
  stack_mods?: { status: string; value: number }[]
  /** 层数随时间衰减：每 every 分钟 −amount 层 */
  stack_decay?: { every: number; amount: number }
```

（`AttributeModSource` 从 `./attribute-eval` import type。）

2. `mod-loader.ts` 的 `configureAttributeEval(...)` 调用处补时钟：

```ts
    configureAttributeEval({
      definitions: mod.attributes as Record<string, { compute?: string }>,
      scriptResolver: (fileName: string) => scripts.get(fileName),
      defs: { items: mod.items, abilities: mod.abilities, talentDefs: mod.talentDefs },
      // 运行时修正的到期判定需要"当前游戏分钟"——core 不 import game-context，故在此注入
      nowMinutes: () => gameTimeToTotalMinutes(gameContext.getContext().time),
    })
```

（`gameContext` 该文件已 import；`gameTimeToTotalMinutes` 从 `./game-context` 补 import。）

3. `mod-validate.ts` 的 `validateAttributeMods` 追加状态定义扫描：对每个 `mod.statusEffects` 条目
   - `attribute_mods` 走既有的 `check(owner, list, { allowPerLevel: false })`（**状态无等级 → `per_level` error**，与装备同待遇）
   - `stack_mods`：必须是数组；每项 `status` 必须存在于 `mod.statusEffects`（否则 error，消息含该 id）；`value` 必须是非零整数
   - `stack_decay`：若存在，`every` 与 `amount` 必须是正有限数

- [ ] **Step 4: 夹具**

`mods/test-mod/definitions/status-effects.toml` 追加两个夹具（**新增，不改既有条目**；数值与 Task 3 的断言严格对应）：

```toml
# 属性有效值层 计划三夹具：状态生效期间对属性的临时修正（运行时来源）
[status-effects."修正测试状态"]
name = "修正测试状态"
description = "属性修正夹具（生效期间 修正测试值 +25；无 tick）"
category = "buff"
duration = 120
tick_interval = 0
stackable = false
max_stack = 1
attribute_mods = [ { attr = "修正测试值", flat = 25 } ]

# 层数修正夹具：给「修正测试层数」状态 −1 层（三层模型）
[status-effects."修正测试护体"]
name = "修正测试护体"
description = "层数修正夹具（对 修正测试层数 恒 −1）"
category = "buff"
duration = 120
tick_interval = 0
stackable = false
max_stack = 1
stack_mods = [ { status = "修正测试层数", value = -1 } ]

# 层数状态的载体：基础层数由 apply_status 的 stack/stack_add 决定
[status-effects."修正测试层数"]
name = "修正测试层数"
description = "层数夹具（基础层数由招式给定；每 60 分钟 −1 层）"
category = "debuff"
duration = 600
tick_interval = 0
stackable = false
max_stack = 10
stack_decay = { every = 60, amount = 1 }
```

- [ ] **Step 5: 运行确认通过 + 全量**

Run: `npx vitest run src/core/mod-loader.test.ts` → PASS
Run: `npm run test`（0 failed）｜`npm run validate`（4 passed）｜`npm run typecheck`（0）｜`npm run scan:attrs`（VIOLATION=0）

- [ ] **Step 6: 提交**

```bash
git add src/core/mod-loader.ts src/core/mod-validate.ts src/core/mod-types.ts src/core/mod-loader.test.ts mods/test-mod/definitions/status-effects.toml
git commit -m "feat(core): 注入游戏时钟 + 状态定义属性/层数修正的加载期校验" -m "StatusEffectDef 增 attribute_mods/stack_mods/stack_decay 三个可选字段；per_level 在状态定义上报错。夹具：修正测试状态（属性 +25）、修正测试护体（对 修正测试层数 恒 −1）、修正测试层数（每 60 分钟 −1 层）。"
```

---

### Task 3: status-system —— expiresAt 迁移 + 层数三层模型 + 修正生灭

**Files:**
- Modify: `src/plugins/status-system/index.ts`
- Test: `src/plugins/status-system/index.test.ts`
- 夹具：`mods/test-mod/definitions/status-effects.toml`（迁移 `攻击增益`）

**Interfaces:**
- Consumes：Task 1 的 `registerRuntimeMod` / `removeRuntimeMod` / `removeRuntimeModsByPrefix`；Task 2 的 `StatusEffectDef` 新字段
- Produces：`apply_status` 的 `params.stack`（打到 N）/ `params.stack_add`（加 N）；状态实例字段 `{ id, base_stack, expiresAt, stack_mods, last_decay_at, last_tick_game_time }`；`status.effectiveStack(charId, statusId)` API

- [ ] **Step 1: 写失败测试**

**本文件目前不存在，需新建** `src/plugins/status-system/index.test.ts`。照邻近插件测试（如
`src/plugins/h-hypnosis/index.test.ts`）的形状：import 本插件的 `onLoad` / `onEnable`，用 `gameContext.setTime(...)`
控制游戏时间（时间推进用**再次** `setTime`，不要真的跑 `advanceTime`），用 `entitySystem.register('character', ...)`
直接造受试实体。测试里**不要**用 `obj['中文']` 下标取值（`scan:attrs` 违规）；`getEntityAttr(c, '力道')` 这种字面量实参是安全的。

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { entitySystem } from '../../core/entity-system'
import { gameContext } from '../../core/game-context'
import { getEntityAttr, readRawAttr } from '../../core/entity-utils'
import { errorReporter } from '../../core/error-reporter'
import { parseModData } from '../../core/mod-parse'
import { onLoad, onEnable, applyStatus, removeStatus } from './index'

const rawTomlMap = import.meta.glob('/mods/test-mod/**/*.toml', { import: 'default', eager: true }) as Record<string, string>

/** 测试用：造一个玩家实体并装载 test-mod 数据 */
function setup(): any {
  errorReporter.clear()
  entitySystem.clear()
  const mod = parseModData('test-mod', rawTomlMap)
  // 按本文件所用插件上下文惯例注入 mod（参考 analyze: modLoader 单例在测试里的既有用法）
  entitySystem.register('character', 'player', JSON.parse(JSON.stringify(mod.entities.get('character')!.get('player'))))
  gameContext.setTime({ minute: 0, hour: 8, day: 1, month: 1, year: 1 })
  return entitySystem.get('character', 'player') as any
}

function entryOf(charId: string, statusId: string): any {
  return (entitySystem.get('character', charId) as any)?.status_effects?.find((s: any) => s.id === statusId)
}

beforeEach(() => { onLoad({} as any); onEnable({} as any) })
```

（`onLoad`/`onEnable` 的真实签名与 mod 注入方式以本文件为准——若 `applyStatus` 依赖 `modLoader.getMod()`，
按邻近测试里既有的 mod 装载方式处理，并在报告里写明你用的方式。）

```ts
it('属性修正不污染基础值：生效期间有效值变化，readRawAttr 不动，移除后回落', () => {
  const p = setup()
  const before = getEntityAttr(p, '修正测试值')
  const rawBefore = readRawAttr(p, '修正测试值')

  applyStatus('player', '修正测试状态')
  expect(getEntityAttr(p, '修正测试值')).toBe(before + 25)
  expect(readRawAttr(p, '修正测试值')).toBe(rawBefore)     // 基础值分毫不动（对照 spec §2.1 的雷）

  removeStatus('player', '修正测试状态')
  expect(getEntityAttr(p, '修正测试值')).toBe(before)
})

it('到期：按绝对时刻失效（时间跳跃也正确）', () => {
  const p = setup()
  applyStatus('player', '修正测试状态')                     // duration = 120
  expect(getEntityAttr(p, '修正测试值')).toBe(125)
  gameContext.setTime({ minute: 0, hour: 10, day: 1, month: 1, year: 1 })   // 推进 120 分钟
  expect(getEntityAttr(p, '修正测试值')).toBe(100)
})

it('层数三层模型：基础层数 + 层数修正（护体 −1），移除护体后基础层数不变', () => {
  const p = setup()
  applyStatus('player', '修正测试层数', { stack: 3 })
  expect(entryOf('player', '修正测试层数').base_stack).toBe(3)

  applyStatus('player', '修正测试护体')
  expect(effectiveStack('player', '修正测试层数')).toBe(2)   // 护体 −1

  removeStatus('player', '修正测试护体')
  expect(effectiveStack('player', '修正测试层数')).toBe(3)   // 基础层数分毫不动
})

it('D5：打到破绽2 打不动已有的 3 —— 层数与周期都不变', () => {
  const p = setup()
  applyStatus('player', '修正测试层数', { stack: 3 })
  const expiresBefore = entryOf('player', '修正测试层数').expiresAt
  gameContext.setTime({ minute: 0, hour: 9, day: 1, month: 1, year: 1 })   // 推进 60 分钟
  applyStatus('player', '修正测试层数', { stack: 2 })
  expect(entryOf('player', '修正测试层数').base_stack).toBe(3)
  expect(entryOf('player', '修正测试层数').expiresAt).toBe(expiresBefore)
})

it('加层：破绽1 + 破绽+3 = 4', () => {
  const p = setup()
  applyStatus('player', '修正测试层数', { stack: 1 })
  applyStatus('player', '修正测试层数', { stack_add: 3 })
  expect(effectiveStack('player', '修正测试层数')).toBe(4)
})

it('衰减：每 60 分钟 −1 层，到 0 结束', () => {
  const p = setup()                                          // 修正测试层数 duration=600, decay 60/1
  applyStatus('player', '修正测试层数', { stack: 2 })
  gameContext.setTime({ minute: 0, hour: 9, day: 1, month: 1, year: 1 })
  expect(effectiveStack('player', '修正测试层数')).toBe(1)
  gameContext.setTime({ minute: 0, hour: 10, day: 1, month: 1, year: 1 })
  expect(effectiveStack('player', '修正测试层数')).toBe(0)
})

it('【第一验收点】攻击增益：生效期间 attack 有效值 +10，基础值不动，到期后回落', () => {
  const p = setup()
  const rawBefore = readRawAttr(p, 'attack')                 // 绑定键，base 域
  const effBefore = getEntityAttr(p, 'attack')

  applyStatus('player', '攻击增益')                           // 迁移后 = attribute_mods [{ attr='attack', flat=10 }]
  expect(getEntityAttr(p, 'attack')).toBe(effBefore + 10)
  expect(readRawAttr(p, 'attack')).toBe(rawBefore)           // ← 对照 spec §2.1 的雷：基础值必须分毫不动

  gameContext.setTime({ minute: 0, hour: 12, day: 1, month: 1, year: 1 })   // 越过 180 分钟
  expect(getEntityAttr(p, 'attack')).toBe(effBefore)
  expect(readRawAttr(p, 'attack')).toBe(rawBefore)
})
```

（`effectiveStack` 从 `./index` import；`p` 变量未被读取时用 `void p` 占位或直接不赋值——`noUnusedLocals` 开着。）

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/plugins/status-system/index.test.ts`
Expected: FAIL —— `applyStatus` 不接受第三个参数 / `effectiveStack` 不存在

- [ ] **Step 3: 迁移数据模型**

状态实例改为：

```ts
{ id, base_stack, expiresAt, stack_mods: { from, value, expiresAt? }[], last_decay_at, last_tick_game_time }
```

- **`expiresAt = getCurrentGameMinutes() + def.duration`**（`duration === -1` → `expiresAt = undefined`，永久）
- **旧档就地迁移**：读到的条目若只有 `remaining_duration`，按 `expiresAt = now + remaining_duration` 换算一次并删除旧字段
  （`remaining_duration === -1` → 永久）
- 到期判定一律 `now >= expiresAt`；**删除"每小时硬扣 60 分钟"的写法**
- 时停守卫（`h-time-stop` 早退）原样保留

- [ ] **Step 4: 层数三层模型**

```ts
/** 有效层数 = 基础层数 + Σ层数修正（含来源过期判定），下限 0 */
export function effectiveStack(charId: string, statusId: string): number {
  const char = entitySystem.get('character', charId) as any
  const entry = char?.status_effects?.find((s: any) => s.id === statusId)
  if (!entry) return 0
  const now = getCurrentGameMinutes()
  let v = entry.base_stack ?? 0
  for (const m of entry.stack_mods ?? []) {
    if (typeof m.expiresAt === 'number' && now >= m.expiresAt) continue
    v += m.value
  }
  return Math.max(0, v)
}
```

- 施加时按定义把 `stack_mods` 写进**目标状态**（`from` = 来源状态 id；缺省跟随来源生灭 → `expiresAt` 取来源状态的到期时刻）
- **来源状态被移除/到期 → 撤销它给出的层数修正**（遍历所有状态，过滤掉 `from === 被移除的状态 id` 的条目）
- 衰减：`stack_decay = { every, amount }`，按 `last_decay_at + every <= now` 扣 `base_stack`，`base_stack` 到 0 → 状态结束

- [ ] **Step 5: `apply_status` 新参数 + 修正生灭 + 导出 `effectiveStack`**

```ts
effectTypeRegistry.register('apply_status', async (params: any, ctx: any) => {
  const targetIds = ctx._targetIds as string[]
  // 加载期校验之外再兜一层：两者同给无语义（一个"打到几"、一个"加几"）
  if (params.stack !== undefined && params.stack_add !== undefined) {
    errorReporter.report({ source: 'status-system', severity: 'warning',
      message: `apply_status 同时给了 stack 与 stack_add（状态 '${params.status}'）——已忽略 stack_add` })
  }
  const opts = { stack: params.stack, stack_add: params.stack_add !== undefined && params.stack === undefined ? params.stack_add : undefined }
  for (const id of targetIds) applyStatus(id, params.status, opts)
  return true
})
```

`applyStatus(charId, statusId, opts?)`：

- 不存在 → 新建（`base_stack` = `opts.stack ?? 1`；`opts.stack_add` → 当前 0 + N）
- 已存在：
  - `opts.stack`（打到 N）：`N <= 有效层数` → **直接 return（无操作，不刷新时长）**；`N > 有效层数` → `base_stack = N` + 重置 `expiresAt`（D5）
  - `opts.stack_add`（加 N）：`base_stack += N` + 重置 `expiresAt`（加法恒生效）
  - 无参数：沿用 `stackable`/`max_stack` 的既有语义（可叠则 +1 封顶；否则只刷新时长）
- **属性修正**：施加时 push `registerRuntimeMod(char, { id: `status:${statusId}`, attr, ...mod, expiresAt: 状态到期时刻 }, strength)`；
  `strength` = 该状态的**有效层数**（无层数概念时用 1），按 §Global Constraints 的算式；**不再调用 `on_apply_effects` 做属性加成**
- **移除/到期**：`removeRuntimeMod(char, `status:${statusId}`)` + 撤销该状态给出的层数修正 + 执行 `on_remove_effects`（仅非属性效果）
- **导出 `effectiveStack(charId, statusId): number`**（本文件 `export function`；Task 3 的测试直接 import 它，
  同时把它挂进既有 `ctx.api.register('status', { … })` 的 API 表，供条件/口上/其他插件使用）

- [ ] **Step 6: 迁移 `攻击增益` 夹具**

```toml
[status-effects."攻击增益"]
name = "攻击增益"
category = "buff"
duration = 180
tick_interval = 0
stackable = false
max_stack = 1
attribute_mods = [ { attr = "attack", flat = 10 } ]    # 生效期间 +10，到期自动消失
# on_apply_effects / on_remove_effects 全部删除（原先改 base = 永久污染）
```

- [ ] **Step 7: 运行确认通过 + 全量**

Run: `npx vitest run src/plugins/status-system/index.test.ts` → PASS
Run: `npm run test`（0 failed）｜`npm run validate`（4 passed）｜`npm run typecheck`（0）｜`npm run scan:attrs`（VIOLATION=0）

- [ ] **Step 8: 提交**

```bash
git add src/plugins/status-system/index.ts src/plugins/status-system/index.test.ts mods/test-mod/definitions/status-effects.toml
git commit -m "feat(status): 到期改存绝对时刻 + 层数三层模型 + 属性修正不再碰基础值" -m "攻击增益从 on_apply_effects 改 base 迁移为 attribute_mods（消灭临时 buff 沉淀成永久属性的雷）。新增强制层数修正（护体减破绽）与 stack_decay 衰减，apply_status 支持 stack/stack_add。"
```

---

### Task 4: combat-base —— `modify_attribute` 战斗动作

**Files:**
- Modify: `src/plugins/combat-base/index.ts`、`src/plugins/combat-base/effect-entry.ts`（校验处）
- Test: `src/plugins/combat-base/combat-base.test.ts`

**Interfaces:**
- Consumes：Task 1 的 `registerRuntimeMod` / `removeRuntimeModsByPrefix`
- Produces：战斗动作 `modify_attribute`（`action` + `attr` + `value = { flat?/percent?/set? }`）；战斗结束清 `combat:` 前缀修正

- [ ] **Step 1: 写失败测试**

在 `src/plugins/combat-base/combat-base.test.ts` 追加：

```ts
it('战斗效果 modify_attribute：属性随效果区变化，战斗结束回落且基础值未被污染', async () => {
  // 按本文件既有惯例起一场战斗（scene/combatants），拿到参战者实体
  const p = entitySystem.get('character', 'player') as any
  const before = readRawAttr(p, '修正测试值')
  await addEffect('player', { id: '测试减属性', action: 'modify_attribute', attr: '修正测试值', value: { flat: 20 }, duration: 'battle' })
  expect(getEntityAttr(p, '修正测试值')).toBe(before + 20)
  expect(readRawAttr(p, '修正测试值')).toBe(before)        // 基础值不动
  // 结束战斗
  await endBattleForTest()
  expect(getEntityAttr(p, '修正测试值')).toBe(before)
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/plugins/combat-base/combat-base.test.ts`
Expected: FAIL —— 效果未生效（得到裸值）

- [ ] **Step 3: 实现**

1. 注册战斗动作（放在 `modify_channel` 之后，同风格）：

```ts
  // modify_attribute：属性有效值层的临时修正（无 trigger = 常驻；有 trigger = 该相位临时叠加）
  // 与 modify_stat/modify_channel 不同：落点是**角色属性**，故由 recalcStats 的增量同步写入实体清单
  registerBattleAction('modify_attribute', (actCtx: any) => {
    // 常驻型全部由 syncAttributeMods 统一同步；trigger 型沿用 overlay 语义（本轮只做常驻）
  })
```

2. **增量同步**（在 `recalcStats` 末尾调用，`recalcStats` 已是"效果区一有变化就被调用"的唯一聚合点）：

```ts
/** 把本场 modify_attribute 效果同步进实体清单：签名未变则完全不动（不 bump 版本） */
function syncAttributeMods(c: Combatant): void {
  const entity = entitySystem.get('character', c.id) as any
  if (!entity) return
  const want = new Map<string, RuntimeAttrMod>()
  for (const inst of c.zone) {
    if (inst.trigger) continue
    if (inst.action !== 'modify_attribute' || !inst.attr) continue
    const v = effValue(inst)
    const id = `combat:${inst.id}`
    want.set(`${id}|${inst.attr}`, { id, attr: inst.attr, flat: v.flat, percent: v.percent, set: v.set, source: 'combat' })
  }
  const sig = [...want.keys()].sort().join(',') + '#' + [...want.values()].map(m => `${m.flat ?? ''},${m.percent ?? ''},${m.set ?? ''}`).join(';')
  if (c.__attrModSig === sig) return          // 签名未变 → 不写、不 bump
  c.__attrModSig = sig
  removeRuntimeModsByPrefix(entity, 'combat:')  // 先清本场旧条目（含已从效果区移除的）
  for (const m of want.values()) registerRuntimeMod(entity, m, strengthOf(m))
}
```

`strengthOf(m)` = 该条修正的"强度"（用于比较）：`set ?? flat ?? percent ?? 0`。

3. `recalcStats` 末尾加 `syncAttributeMods(c)`。

4. 战斗结束清场：在 `eventBus.emit('combat:end', …)`（`index.ts:2103`）之前，遍历 `scene.combatants` 对每个参战者实体 `removeRuntimeModsByPrefix(entity, 'combat:')`。

5. 库条目校验：`action = "modify_attribute"` 必须带 `attr` 且该属性已在 `mod.attributes` 定义（沿用该文件既有的效果校验位置与上报姿态）。

- [ ] **Step 4: 运行确认通过 + 全量**

Run: `npx vitest run src/plugins/combat-base/combat-base.test.ts` → PASS
Run: `npm run test`（0 failed）｜`npm run typecheck`（0）｜`npm run scan:attrs`（VIOLATION=0）

- [ ] **Step 5: 提交**

```bash
git add src/plugins/combat-base/index.ts src/plugins/combat-base/effect-entry.ts src/plugins/combat-base/combat-base.test.ts
git commit -m "feat(combat): modify_attribute 战斗动作（属性落点）+ 战斗结束清理" -m "复用 recalcStats 的全量重算做增量同步：签名未变则不写不 bump。战斗结束按 combat: 前缀整批清除，基础值全程不动。"
```

---

### Task 5: 作者侧文档

**Files:**
- Modify: `docs/attributes-system.md`

- [ ] **Step 1: 补章节**

在既有「计算属性（compute）与属性有效值」一节内补：

- **运行时来源（已接线）**：`char.attr_mods` 的形状与三条写法（定值/加法/倍率，**不换算**）、`expiresAt` 到期语义（绝对游戏分钟）、
  D5 顶替规则（弱的不降级、也不刷新时长；同强度顶上并按时长刷新）
- **状态效果的两种修正**：`attribute_mods`（生效期间改角色属性）与 `stack_mods`（改其他状态的层数）
- **层数三层模型**：有效层数 = 基础层数 + 层数修正 − 衰减；`apply_status` 的 `stack`（打到 N）/ `stack_add`（加 N）
- **`merge` 语义**：复用战斗效果既有的 `refresh` / `stack` / `strongest`
- **永久成长 vs 临时修正**（D1 的分界）：永久成长写基础值并在演出文本播报；临时修正走修正清单，到期自动消失
- **仍未接线**：内功装配 / 跨实体修正（甲的状态改乙的属性）

- [ ] **Step 2: 校验**

Run: `npm run check:catalog` → `✅ 校验通过`

- [ ] **Step 3: 提交**

```bash
git add docs/attributes-system.md
git commit -m "docs(attributes): 运行时修正 + 状态层数三层模型的作者侧契约"
```

---

## 验收清单（计划三整体）

- [ ] `npm run test` → **0 failed**（基线 1704 passed / 5 skipped，只增不减）
- [ ] `npm run typecheck` → exit 0 ｜ `npm run scan:attrs` → VIOLATION=0
- [ ] `npm run validate` → 4 passed ｜ `npm run check:catalog` → 校验通过
- [ ] 新增单测：到期（含时间跳跃）/ D5 顶替（含"弱的不刷新时长"边界）/ 幂等 / 与声明式同代数 / 剪除过期条目 / 无时钟注入的容错
- [ ] **第一验收点**：`攻击增益` 生效期间有效值 +10 而 `readRawAttr` 不动，到期后回落（消灭"临时 buff 沉淀成永久属性"）
- [ ] 层数三层：护体 −1 生效 → 移除护体后基础层数不变；衰减到 0 结束
- [ ] 集成：状态存档往返（剩余时长/基础层数/层数修正均正确恢复）
- [ ] 战斗：`modify_attribute` 生效 → 战斗结束回落，基础值全程不动

## 明确不在本计划内

- 内功装配（`equipped_mods`）—— 属秘籍/内功系统
- 跨实体修正（甲的状态改乙的属性）
- 条件手册标注受修正字段、UI 基础/有效值差异呈现（`120 (+15)`）
- 叠加层数封顶（YAGNI）
- 状态时长的结构化单位（`{ days = 3 }`）；保持分钟
