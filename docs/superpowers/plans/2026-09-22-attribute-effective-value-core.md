# 属性有效值层（core 层）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给属性读取引入「有效值」语义 —— `读 = 派生(base) ⊕ 修正栈`，写入语义完全不变；本计划只做 core 层（T1 读取管线 + T2 `compute` 派生），不含任何修正来源接入。

**Architecture:** 新增叶子模块 `src/core/attribute-eval.ts`（只依赖 `error-reporter`，不 import 任何 core 模块，避免 `mod-loader → mod-parse → entity-utils` 链路成环）。`entity-utils.ts` 的 `getEntityAttr` 变「先算裸值 → 交给求值管线」，`setEntityAttr` 写后 bump 版本号。属性定义与脚本解析器由 `mod-loader` 注入。缓存与修正栈用 `WeakMap` 按实体对象索引。**闸门**保证零回归：只有「属性定义存在 + 裸值是数字 + 有 compute 或有修正」才走管线，其余原样返回。

**Tech Stack:** TypeScript、Vitest、`@iarna/toml`（本计划不涉及 TOML 解析改动）。设计依据：`docs/superpowers/specs/2026-09-22-attribute-effective-value-design.md`。

## Global Constraints

- **三层架构铁律**：core 层不认识任何具体属性名 —— 属性名是数据，派生公式是 mod 提供的脚本。
- **写入语义不变**：不改动任何现有写入路径（`hpmp-growth`、吸内削上限、`settlement.applyChange` 全部照旧）。
- **零回归**：**原有 1642 passed / 5 skipped 必须全部仍通过、零失败**。注意新增测试文件会使总数增加（计划一结束时约 1659+），所以判据是「**原有用例无一转红**」，而不是总数不变。**不得修改任何原有测试用例来迁就实现** —— 若某个原有用例失败，那是实现有错。
- **管线同步**：不得引入 `async`/Promise（140+ 处调用点是同步的）。派生脚本返回非 `number` 一律按失败处理。
- **无超时保护**：同步管线无法超时（见 spec §4.3）。以「深度护栏 + 加载期校验 + 运行期回退上报」替代。
- **叠加代数复用公式通道语义**：`base′ = set ?? v` → `value = (base′ + Σflat) × (1 + Σpercent)`。`percent` 相加后只乘一次。
- **不建库**：修正数值内联在来源定义里（本计划不涉及来源）。
- **中文属性名/中间值名属「结构数据」**：测试与代码中取中文 key **必须经 helper 间接取**（如 `const attr = (o: any, k: string) => o[k]`），直接写 `obj['中文']` 会被 `npm run scan:attrs` 判为属性引用违规。
- **注释风格**：中文注释，必要时标注来源与日期，与既有 core 文件一致。
- 每个任务结束都要提交（`git commit`）。

## File Structure

| 文件 | 职责 | 动作 |
|---|---|---|
| `src/core/attribute-eval.ts` | 叶子模块：闸门、修正栈、叠加代数、缓存与版本失效、compute 执行、注入接口 | Create |
| `src/core/attribute-eval.test.ts` | 上述模块的单元测试 | Create |
| `src/core/entity-utils.ts` | 抽出 `readRawAttr`；`getEntityAttr` 接管线；`setEntityAttr` 写后 bump；注入 `rawReader` | Modify |
| `src/core/mod-loader.ts` | 加载后注入属性定义与脚本解析器；校验 `compute` 脚本存在 | Modify |
| `src/core/entity-utils.test.ts` | 接入后的集成测试（零回归 + 闸门） | Create（既有测试不动） |
| `docs/attributes-system.md` | 补「有效值 vs 基础值」「compute 契约」「条件可见性」 | Modify（Task 5） |

---

### Task 1: attribute-eval 叶子模块 —— 闸门、缓存与版本失效

**Files:**
- Create: `src/core/attribute-eval.ts`
- Test: `src/core/attribute-eval.test.ts`

**Interfaces:**
- Consumes: 无（叶子模块）
- Produces:
  - `interface AttributeDefLike { compute?: string }`
  - `interface AttributeMod { flat?: number; percent?: number; set?: number }`
  - `configureAttributeEval(cfg: { definitions?: Record<string, AttributeDefLike>; scriptResolver?: (name: string) => string | undefined; rawReader?: (entity: any, name: string) => any }): void`
  - `readEffective(entity: any, name: string, raw: any): any`
  - `notifyAttrWrite(entity: any): void`
  - `bumpDataVersion(): void`
  - `__resetAttributeEval(): void`

- [ ] **Step 1: 写失败测试（闸门 + 缓存失效）**

创建 `src/core/attribute-eval.test.ts`：

```ts
// 注释：属性有效值求值单元测试（2026-09-22，docs/superpowers/specs/2026-09-22-attribute-effective-value-design.md）
// ⚠️ 中文属性名属「结构数据」，必须经 helper 间接取（scan-attr-refs 契约：`obj['中文']` 会被判为属性引用）
import { describe, it, expect, beforeEach } from 'vitest'
import {
  configureAttributeEval, readEffective, notifyAttrWrite, bumpDataVersion, __resetAttributeEval,
} from './attribute-eval'

describe('attribute-eval：闸门（零回归保证）', () => {
  beforeEach(() => { __resetAttributeEval() })

  it('未配置任何定义时，一律原样返回裸值（含非数字）', () => {
    const e = { id: 'c1', base: { 力道: 10 } }
    expect(readEffective(e, '力道', 10)).toBe(10)
    expect(readEffective(e, '不存在', 0)).toBe(0)
    expect(readEffective(e, '性别', '女')).toBe('女')
  })

  it('定义了属性但既无 compute 也无修正 → 仍原样返回（恒等）', () => {
    configureAttributeEval({ definitions: { 力道: {} } })
    const e = { id: 'c1', base: { 力道: 10 } }
    expect(readEffective(e, '力道', 10)).toBe(10)
  })

  it('裸值不是数字 → 即使定义了 compute 也原样返回（保护对象型属性）', () => {
    configureAttributeEval({ definitions: { 快乐刻印: { compute: 'x.js' } }, scriptResolver: () => 'return 999' })
    const e = { id: 'c1', abilities: {} }
    const raw = { level: 3, xp: 0 }
    expect(readEffective(e, '快乐刻印', raw)).toBe(raw)
  })

  it('null / 非对象实体不崩，原样返回', () => {
    expect(readEffective(null, '力道', 5)).toBe(5)
    expect(readEffective(undefined, '力道', 5)).toBe(5)
  })
})

describe('attribute-eval：缓存与版本失效', () => {
  beforeEach(() => { __resetAttributeEval() })

  it('配置了 compute 的属性：桩阶段仍返回裸值（Task 4 换成派生值）', () => {
    configureAttributeEval({
      definitions: { 力道: { compute: 'p.js' } },
      scriptResolver: () => 'return base + 1',
      rawReader: () => 0,
    })
    const e = { id: 'c1' }
    expect(readEffective(e, '力道', 10)).toBe(10)
  })

  it('bumpDataVersion 后缓存失效（不影响返回值正确性）', () => {
    configureAttributeEval({ definitions: { 力道: {} } })
    const e = { id: 'c1' }
    expect(readEffective(e, '力道', 10)).toBe(10)
    bumpDataVersion()
    expect(readEffective(e, '力道', 10)).toBe(10)
  })

  it('不同实体互不干扰', () => {
    configureAttributeEval({ definitions: { 力道: {} } })
    const a = { id: 'a' }
    const b = { id: 'b' }
    expect(readEffective(a, '力道', 10)).toBe(10)
    notifyAttrWrite(a)
    expect(readEffective(b, '力道', 20)).toBe(20)
  })
})
```

> 说明：`calls` 那段是本任务里的**占位断言**（此时 compute 还是桩）。Task 4 会把它替换成「compute 真的被重算/命中缓存」的强断言 —— 保留它是为了让本步骤先跑通红绿循环。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/core/attribute-eval.test.ts`
Expected: FAIL —— `Failed to resolve import "./attribute-eval"`

- [ ] **Step 3: 写最小实现**

创建 `src/core/attribute-eval.ts`：

```ts
// 注释：属性有效值求值（2026-09-22）
// 设计：docs/superpowers/specs/2026-09-22-attribute-effective-value-design.md
//
// 分层：本文件是**叶子模块** —— 不 import 任何 core 模块。
//   原因：mod-loader → mod-parse → entity-utils 已构成链路，本模块要被 entity-utils import，
//   若反向 import entity-utils/mod-loader 即成环。属性定义与脚本解析器由 mod-loader 注入；
//   裸值由 entity-utils 传入；跨属性读取用注入的 rawReader（命名空间查找仍单一来源在 entity-utils）。
//
// 语义（唯一权威定义）：
//   raw = 裸值（entity-utils 的命名空间查找结果）
//   v   = compute ? 脚本(raw, attrs) : raw        ← 先派生
//   v   = (set ?? v + Σflat) × (1 + Σpercent)     ← 后叠修正（复用公式通道代数）
//
// 闸门（零回归保证）：只有【属性定义存在】+【裸值是数字】+【有 compute 或有修正条目】才走管线，
//   其余一律原样返回。因此未接入任何来源时，本管线是恒等变换。

import { errorReporter } from './error-reporter'

export interface AttributeDefLike {
  compute?: string
}

export interface AttributeMod {
  flat?: number
  percent?: number
  set?: number
}

export interface ModifierEntry {
  /** 来源 id：同 (id, attr) 重复注册按覆盖处理（幂等） */
  id: string
  attr: string
  mod: AttributeMod
  source?: string
}

interface EntityState {
  /** 任何裸值写入 / 修正变更 → bump */
  version: number
  cachedAtVersion: number
  cachedAtGlobal: number
  cache: Map<string, any>
  mods: ModifierEntry[]
}

/** 递归深度上限（对齐战斗管线的 64 断链惯例） */
const MAX_DEPTH = 64

let states = new WeakMap<object, EntityState>()
let globalVersion = 1
let definitions: Record<string, AttributeDefLike> = {}
let scriptResolver: ((name: string) => string | undefined) | null = null
let rawReader: ((entity: any, name: string) => any) | null = null
let depth = 0

export function configureAttributeEval(cfg: {
  definitions?: Record<string, AttributeDefLike>
  scriptResolver?: (name: string) => string | undefined
  rawReader?: (entity: any, name: string) => any
}): void {
  if (cfg.definitions) definitions = cfg.definitions
  if (cfg.scriptResolver) scriptResolver = cfg.scriptResolver
  if (cfg.rawReader) rawReader = cfg.rawReader
}

/** mod 数据定义变更（热重载/读档重建）→ 所有实体缓存失效 */
export function bumpDataVersion(): void {
  globalVersion++
}

/** 裸值写入后调用：让该实体的缓存失效。未走过管线的实体零成本（无 state 即返回） */
export function notifyAttrWrite(entity: any): void {
  if (entity === null || typeof entity !== 'object') return
  const st = states.get(entity)
  if (st) st.version++
}

export function __resetAttributeEval(): void {
  states = new WeakMap()
  globalVersion++
  definitions = {}
  scriptResolver = null
  // ⚠️ 刻意**不重置** rawReader：它由 entity-utils 在模块加载时注入，属结构性接线而非测试态。
  //    若在此清掉，测试里 reset 之后 compute 的跨属性读取会静默失效（attr.get 恒 0）。
  depth = 0
}

function stateOf(entity: object): EntityState {
  let st = states.get(entity)
  if (!st) {
    st = { version: 1, cachedAtVersion: -1, cachedAtGlobal: -1, cache: new Map(), mods: [] }
    states.set(entity, st)
  }
  return st
}

function hasMods(entity: object, name: string): boolean {
  const st = states.get(entity)
  if (!st) return false
  for (const m of st.mods) {
    if (m.attr === name) return true
  }
  return false
}

/** 闸门 + 管线入口。raw 由 entity-utils 的命名空间查找算出 */
export function readEffective(entity: any, name: string, raw: any): any {
  if (entity === null || entity === undefined || typeof entity !== 'object') return raw
  // 非数字属性（string/boolean/对象型如 abilities 条目）不参与派生与修正
  if (typeof raw !== 'number') return raw
  const def = definitions[name]
  if (!def) return raw
  const hasCompute = typeof def.compute === 'string' && def.compute.length > 0
  if (!hasCompute && !hasMods(entity, name)) return raw
  if (depth >= MAX_DEPTH) {
    errorReporter.reportDedup('attr-eval-depth', {
      source: 'attribute-eval', severity: 'error',
      message: `属性求值递归超过深度上限（${MAX_DEPTH}）——已断链并返回裸值`,
      suggestion: '检查属性之间的 compute 依赖是否构成循环（如 A 派生依赖 A）',
    })
    return raw
  }

  const st = stateOf(entity)
  if (st.cachedAtVersion !== st.version || st.cachedAtGlobal !== globalVersion) {
    st.cache.clear()
    st.cachedAtVersion = st.version
    st.cachedAtGlobal = globalVersion
  }
  if (st.cache.has(name)) return st.cache.get(name)

  depth++
  let v: number = raw
  try {
    v = applyCompute(entity, name, v)
    v = applyMods(entity, name, v)
  } finally {
    depth--
  }
  st.cache.set(name, v)
  return v
}

/** T1 阶段为桩（原样返回）；Task 4 实装 */
function applyCompute(_entity: any, _name: string, raw: number): number {
  return raw
}

/** T1 阶段修正栈恒为空；Task 2 实装叠加代数 */
function applyMods(_entity: any, _name: string, v: number): number {
  return v
}

/** 供 compute 脚本读取其他属性的有效值（递归走同一管线）——Task 4 使用 */
export function readAttrForCompute(entity: any, name: string): any {
  if (!rawReader) return 0
  const raw = rawReader(entity, name)
  return readEffective(entity, name, raw)
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/core/attribute-eval.test.ts`
Expected: PASS（7 个用例全绿：闸门 4 + 缓存与版本 3）

- [ ] **Step 5: 确认没有破坏属性引用扫描**

Run: `npm run scan:attrs`
Expected: `VIOLATION=0 ATTR_EXPANSION_VIOLATION=0`（若出现违规，检查测试里是否直接写了 `obj['中文']`）

- [ ] **Step 6: 提交**

```bash
git add src/core/attribute-eval.ts src/core/attribute-eval.test.ts
git commit -m "feat(core): 属性有效值求值模块骨架——闸门/缓存/版本失效

叶子模块（不 import 任何 core 模块，避免 mod-loader→mod-parse→entity-utils 成环）。
闸门保证零回归：仅【定义存在 + 裸值是数字 + 有 compute 或有修正】才走管线。
compute 与修正栈在本任务为桩，分别由 T2/T1-Task2 实装。"
```

---

### Task 2: 修正栈与叠加代数

**Files:**
- Modify: `src/core/attribute-eval.ts`（替换 `applyMods` 桩；新增 4 个导出）
- Test: `src/core/attribute-eval.test.ts`（追加 describe）

**Interfaces:**
- Consumes: Task 1 的 `AttributeMod`、`ModifierEntry`、`stateOf`、`readEffective`
- Produces:
  - `registerModifier(entity: any, id: string, attr: string, mod: AttributeMod, opts?: { source?: string }): void`
  - `removeModifier(entity: any, id: string, attr?: string): number`（返回移除条数）
  - `clearModifiers(entity: any): void`
  - `listModifiers(entity: any): ModifierEntry[]`

- [ ] **Step 1: 写失败测试（叠加代数 + 幂等注册）**

在 `src/core/attribute-eval.test.ts` 末尾追加：

```ts
describe('attribute-eval：修正栈与叠加代数', () => {
  beforeEach(() => {
    __resetAttributeEval()
    configureAttributeEval({ definitions: { 力道: {}, 根骨: {} } })
  })
  const e = () => ({ id: 'e1' })

  it('单条 flat / 单条 percent', () => {
    const c = e()
    registerModifier(c, 'm1', '力道', { flat: 5 })
    expect(readEffective(c, '力道', 100)).toBe(105)
    const c2 = e()
    registerModifier(c2, 'm1', '力道', { percent: 0.5 })
    expect(readEffective(c2, '力道', 100)).toBe(150)
  })

  it('flat 在 percent 之前（会被 percent 放大）', () => {
    const c = e()
    registerModifier(c, 'm1', '力道', { flat: 20, percent: 0.5 })
    expect(readEffective(c, '力道', 100)).toBe(180)   // (100+20)×1.5，不是 100×1.5+20
  })

  it('多条 percent **相加后只乘一次**（+10% 与 +20% → ×1.30）', () => {
    const c = e()
    registerModifier(c, 'm1', '力道', { percent: 0.1 })
    registerModifier(c, 'm2', '力道', { percent: 0.2 })
    expect(readEffective(c, '力道', 100)).toBeCloseTo(130, 10)
  })

  it('set 替换基准，flat/percent 仍作用其上；set 0 归零', () => {
    const c = e()
    registerModifier(c, 'm1', '力道', { set: 10, flat: 20, percent: 0.5 })
    expect(readEffective(c, '力道', 100)).toBe(45)    // (10+20)×1.5
    const c2 = e()
    registerModifier(c2, 'm1', '力道', { set: 0 })
    expect(readEffective(c2, '力道', 100)).toBe(0)
  })

  it('多个 set：后者覆盖', () => {
    const c = e()
    registerModifier(c, 'm1', '力道', { set: 10 })
    registerModifier(c, 'm2', '力道', { set: 30 })
    expect(readEffective(c, '力道', 100)).toBe(30)
  })

  it('同 (id, attr) 重复注册 = 覆盖（幂等，不累加）', () => {
    const c = e()
    registerModifier(c, 'm1', '力道', { flat: 5 })
    registerModifier(c, 'm1', '力道', { flat: 7 })
    expect(listModifiers(c).length).toBe(1)
    expect(readEffective(c, '力道', 100)).toBe(107)
  })

  it('removeModifier 按 id（可限定 attr）移除；clearModifiers 清空', () => {
    const c = e()
    registerModifier(c, 'm1', '力道', { flat: 5 })
    registerModifier(c, 'm2', '根骨', { flat: 3 })
    expect(removeModifier(c, 'm1')).toBe(1)
    expect(readEffective(c, '力道', 100)).toBe(100)
    expect(readEffective(c, '根骨', 100)).toBe(103)
    clearModifiers(c)
    expect(listModifiers(c).length).toBe(0)
    expect(readEffective(c, '根骨', 100)).toBe(100)
  })

  it('修正栈变更使缓存失效（改完立刻生效，不需要额外 bump）', () => {
    const c = e()
    registerModifier(c, 'm1', '力道', { flat: 5 })
    expect(readEffective(c, '力道', 100)).toBe(105)
    registerModifier(c, 'm1', '力道', { flat: 50 })
    expect(readEffective(c, '力道', 100)).toBe(150)
    removeModifier(c, 'm1')
    expect(readEffective(c, '力道', 100)).toBe(100)
  })

  it('修正只影响被挂的属性；同一实体其他属性不受影响', () => {
    const c = e()
    registerModifier(c, 'm1', '力道', { percent: 1 })
    expect(readEffective(c, '力道', 100)).toBe(200)
    expect(readEffective(c, '根骨', 100)).toBe(100)
  })

  it('只有修正、没有属性定义时闸门仍拦截（定义是前提）', () => {
    const c = e()
    registerModifier(c, 'm1', '未定义属性', { flat: 99 })
    expect(readEffective(c, '未定义属性', 1)).toBe(1)
  })
})
```

同时把该测试文件顶部的 import 补上新增的四个函数（Task 4 还会再动一次）：

```ts
import {
  configureAttributeEval, readEffective, notifyAttrWrite, bumpDataVersion, __resetAttributeEval,
  registerModifier, removeModifier, clearModifiers, listModifiers,
} from './attribute-eval'
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/core/attribute-eval.test.ts`
Expected: FAIL —— `registerModifier is not a function`（或 `does not provide an export named`）

- [ ] **Step 3: 实装修正栈**

在 `src/core/attribute-eval.ts` 中，把 `applyMods` 桩替换为：

```ts
/** 叠加代数：base′ = set ?? v → value = (base′ + Σflat) × (1 + Σpercent)
 *  与 plugins/combat-base/formula-channels.ts 的通道语义一致（percent 相加后只乘一次） */
function applyMods(entity: object, name: string, v: number): number {
  const st = states.get(entity)
  if (!st || st.mods.length === 0) return v
  let set: number | undefined
  let flat = 0
  let percent = 0
  let hit = false
  for (const m of st.mods) {
    if (m.attr !== name) continue
    hit = true
    if (typeof m.mod.set === 'number' && Number.isFinite(m.mod.set)) set = m.mod.set
    if (typeof m.mod.flat === 'number' && Number.isFinite(m.mod.flat)) flat += m.mod.flat
    if (typeof m.mod.percent === 'number' && Number.isFinite(m.mod.percent)) percent += m.mod.percent
  }
  if (!hit) return v
  const base = set !== undefined ? set : v
  return (base + flat) * (1 + percent)
}

/** 注册一条属性修正。同 (id, attr) 重复注册 = 覆盖（幂等：热重载/重复挂载安全） */
export function registerModifier(
  entity: any, id: string, attr: string, mod: AttributeMod, opts?: { source?: string },
): void {
  if (entity === null || typeof entity !== 'object') return
  if (typeof id !== 'string' || id.length === 0) return
  if (typeof attr !== 'string' || attr.length === 0) return
  const st = stateOf(entity)
  const entry: ModifierEntry = { id, attr, mod: { ...mod }, source: opts?.source }
  const i = st.mods.findIndex(m => m.id === id && m.attr === attr)
  if (i >= 0) st.mods[i] = entry
  else st.mods.push(entry)
  st.version++
}

/** 移除修正：给 attr 则只移除该属性的那条，否则移除该 id 的全部。返回移除条数 */
export function removeModifier(entity: any, id: string, attr?: string): number {
  if (entity === null || typeof entity !== 'object') return 0
  const st = states.get(entity)
  if (!st) return 0
  const before = st.mods.length
  st.mods = st.mods.filter(m => !(m.id === id && (attr === undefined || m.attr === attr)))
  const removed = before - st.mods.length
  if (removed > 0) st.version++
  return removed
}

export function clearModifiers(entity: any): void {
  if (entity === null || typeof entity !== 'object') return
  const st = states.get(entity)
  if (!st || st.mods.length === 0) return
  st.mods = []
  st.version++
}

/** 调试/测试用：当前挂在该实体上的修正清单（副本） */
export function listModifiers(entity: any): ModifierEntry[] {
  if (entity === null || typeof entity !== 'object') return []
  const st = states.get(entity)
  if (!st) return []
  return st.mods.map(m => ({ ...m, mod: { ...m.mod } }))
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/core/attribute-eval.test.ts`
Expected: PASS（17 个用例全绿：Task 1 的 7 + 本任务新增 10）

- [ ] **Step 5: 提交**

```bash
git add src/core/attribute-eval.ts src/core/attribute-eval.test.ts
git commit -m "feat(core): 属性修正栈与叠加代数

base′ = set ?? v → value = (base′ + Σflat) × (1 + Σpercent)，与公式通道语义一致
（percent 相加后只乘一次；flat 在 percent 之前）。register/remove/clear/list +
同 (id, attr) 幂等覆盖 + 变更即失效缓存。"
```

---

### Task 3: 接入 entity-utils 与 mod-loader（零回归验收点）

**Files:**
- Modify: `src/core/entity-utils.ts`（抽出 `readRawAttr`；`getEntityAttr` 接管线；`setEntityAttr` 写后 bump；注入 `rawReader`）
- Modify: `src/core/mod-loader.ts:113` 附近（注入属性定义与脚本解析器）
- Test: `src/core/entity-utils.test.ts`（Create）

**Interfaces:**
- Consumes: `readEffective`、`notifyAttrWrite`、`configureAttributeEval`（Task 1/2）
- Produces: `getEntityAttr` 语义升级（读有效值）；`setEntityAttr` 行为不变但会 bump 版本

- [ ] **Step 1: 写失败测试（接入后的闸门与写后失效）**

创建 `src/core/entity-utils.test.ts`：

```ts
// 注释：属性读取接入有效值管线后的集成测试（2026-09-22）
// 覆盖：① 未配置定义时行为不变（零回归）② 定义 + 修正 → 读出有效值
//       ③ setEntityAttr 写后缓存失效 ④ 非数字属性不受影响 ⑤ 下游消费方（clampAttrValue）
//       自动看到有效值（条件引擎/bindings 同走 getEntityAttr，属同一传递性质）
import { describe, it, expect, beforeEach } from 'vitest'
import { getEntityAttr, setEntityAttr, clampAttrValue, ATTR } from './entity-utils'
import { configureAttributeEval, registerModifier, __resetAttributeEval } from './attribute-eval'

function mkChar(): any {
  return { id: 'c1', name: '测试', base: { 力道: 100, 体力: 9999, 体力上限: 500 }, abilities: {} }
}

describe('entity-utils × 有效值管线', () => {
  beforeEach(() => { __resetAttributeEval() })

  it('未配置属性定义 → 读出裸值（零回归）', () => {
    const c = mkChar()
    expect(getEntityAttr(c, '力道')).toBe(100)
  })

  it('属性定义 + 修正 → 读出有效值', () => {
    const c = mkChar()
    configureAttributeEval({ definitions: { 力道: {} } })
    registerModifier(c, 'buff', '力道', { percent: 0.5 })
    expect(getEntityAttr(c, '力道')).toBe(150)
  })

  it('setEntityAttr 写入后缓存失效（读到新值 + 修正）', () => {
    const c = mkChar()
    configureAttributeEval({ definitions: { 力道: {} } })
    registerModifier(c, 'buff', '力道', { flat: 10 })
    expect(getEntityAttr(c, '力道')).toBe(110)
    setEntityAttr(c, '力道', 200)
    expect(getEntityAttr(c, '力道')).toBe(210)
  })

  it('非数字属性（对象型能力条目）不受管线影响', () => {
    const c = mkChar()
    c.abilities['快乐刻印'] = { level: 3, xp: 0 }
    configureAttributeEval({ definitions: { 快乐刻印: {} } })
    expect(getEntityAttr(c, '快乐刻印')).toEqual({ level: 3, xp: 0 })
  })

  it('缺失属性仍返回 0（既有语义）', () => {
    const c = mkChar()
    expect(getEntityAttr(c, '不存在属性')).toBe(0)
  })

  it('下游消费方自动看到有效值：clampAttrValue 按**修正后**的上限钳制', () => {
    const c = mkChar()
    configureAttributeEval({ definitions: { [ATTR.HP_MAX]: {} } })
    // 体力上限 500 → 修正 +500 → 有效上限 1000；所以 9999 应被钳到 1000 而不是 500
    registerModifier(c, 'eq', ATTR.HP_MAX, { flat: 500 })
    expect(getEntityAttr(c, ATTR.HP_MAX)).toBe(1000)
    expect(clampAttrValue(c, ATTR.HP, 9999)).toBe(1000)
  })
})
```

> 说明：属性名作为**字符串字面量实参**（`getEntityAttr(c, '力道')`）不触发 `scan-attr-refs` ——
> 只有 `obj['中文']` 这种下标取值才会被判定为属性引用。`ATTR.*` 常量优先使用。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/core/entity-utils.test.ts`
Expected: FAIL —— 第二条用例 expected 150 received 100

- [ ] **Step 3: 改造 entity-utils**

在 `src/core/entity-utils.ts` 顶部加 import：

```ts
import { configureAttributeEval, readEffective, notifyAttrWrite } from './attribute-eval'
```

把现有 `getEntityAttr` 的函数体抽成 `readRawAttr`，并让 `getEntityAttr` 变成管线的入口：

```ts
/** 跨命名空间读取**裸值**（不含派生与修正）——有效值管线的输入 */
export function readRawAttr(entity: any, name: string): any {
  if (entity === null || entity === undefined) return 0

  // 直接属性（如 entity.name, entity.abilities）
  if (Object.prototype.hasOwnProperty.call(entity, name)) {
    const val = entity[name]
    if (val !== undefined) return val
  }

  // 搜索命名空间
  for (const ns of SEARCH_ORDER) {
    const container = entity[ns]
    if (container && typeof container === 'object') {
      const val = container[name]
      if (val !== undefined) return val
    }
  }

  return 0
}

/** 跨命名空间读取属性值（**有效值**：裸值 → 派生 → 修正栈；未命中闸门时等于裸值）
 *  2026-09-22：接入 src/core/attribute-eval.ts（设计见 docs/superpowers/specs/
 *  2026-09-22-attribute-effective-value-design.md） */
export function getEntityAttr(entity: any, name: string): any {
  return readEffective(entity, name, readRawAttr(entity, name))
}

// 注入裸值读取器：compute 脚本跨属性读取时递归走同一管线（命名空间查找单一来源保留在本文件）
configureAttributeEval({ rawReader: readRawAttr })
```

`setEntityAttr` 在三处写成功分支后都要 bump。最小改法是在函数末尾统一处理 —— 把现有实现改成内部函数 + 包装：

```ts
/** 跨命名空间写入属性值（写的是**裸值**；写后让该实体的有效值缓存失效） */
export function setEntityAttr(entity: any, name: string, value: any): boolean {
  const ok = writeRawAttr(entity, name, value)
  if (ok) notifyAttrWrite(entity)
  return ok
}

function writeRawAttr(entity: any, name: string, value: any): boolean {
  if (!entity) return false

  // 直接属性
  if (Object.prototype.hasOwnProperty.call(entity, name)) {
    entity[name] = value
    return true
  }

  // 搜索命名空间写入
  for (const ns of SEARCH_ORDER) {
    const container = entity[ns]
    if (container && typeof container === 'object') {
      if (Object.prototype.hasOwnProperty.call(container, name)) {
        container[name] = value
        return true
      }
    }
  }

  // 注释：未找到键 → 落 base（2026-08-13 审计——原返回 false 且多数调用方不检查，
  // 属性键缺失（如未跑 applyAttributeDefaults 的角色）时写入静默丢失；
  // 统一落 base（与 binding-resolver 语义一致），保证数据不丢、落位一致）
  if (!entity.base || typeof entity.base !== 'object') entity.base = {}
  entity.base[name] = value
  return true
}
```

- [ ] **Step 4: mod-loader 注入属性定义与脚本解析器**

在 `src/core/mod-loader.ts` 的 import 段加：

```ts
import { configureAttributeEval } from './attribute-eval'
```

在 `conditionRegistry.registerFromAttributes(mod.attributes)`（第 113 行）**之后**加：

```ts
    // 属性有效值层：注入属性定义（哪些属性允许 compute/修正）与脚本解析器（compute 脚本按文件名取）
    configureAttributeEval({
      definitions: mod.attributes as Record<string, { compute?: string }>,
      scriptResolver: (fileName: string) => scripts.get(fileName),
    })
```

> 作用域已核对：`scripts`（第 102 行）与 `modName`（第 86 行）都是本函数（`loadMod`）内的局部量，
> 第 113 行的 `conditionRegistry.registerFromAttributes` 同处一个作用域，因此上面的代码可直接使用二者。

- [ ] **Step 5: 运行新测试确认通过**

Run: `npx vitest run src/core/entity-utils.test.ts`
Expected: PASS（6 个用例全绿）

- [ ] **Step 6: 零回归验收（本任务的关键门槛）**

Run: `npm run test`
Expected: **0 failed**，且原有 1642 例全部仍通过（此时因 Task 1/2 新增测试，总数应约为 1659 = 1642 + 17）。
若有任何**原有**用例转红，**不要继续**：说明有属性的裸值不再原样透出（先查闸门是否误放行，或 `readEffective` 是否对非数字/未定义属性做了多余变换）。

- [ ] **Step 7: 类型检查**

Run: `npm run typecheck`
Expected: exit 0

- [ ] **Step 8: 提交**

```bash
git add src/core/entity-utils.ts src/core/entity-utils.test.ts src/core/mod-loader.ts
git commit -m "feat(core): 属性读取接入有效值管线（零回归）

getEntityAttr = readEffective(entity, name, readRawAttr(entity, name))；
setEntityAttr 写后 notifyAttrWrite 让缓存失效；命名空间查找单一来源仍在 entity-utils。
mod-loader 在 registerFromAttributes 之后注入属性定义与 compute 脚本解析器。
验收：全量 1642 passed / 5 skipped 逐位不变（闸门保证未接入来源时管线恒等）。"
```

---

### Task 4: compute 派生（脚本执行 + 护栏 + 加载期校验）

**Files:**
- Modify: `src/core/attribute-eval.ts`（把 `applyCompute` 桩换成实装）
- Modify: `src/core/mod-loader.ts`（加载期校验 `compute` 脚本存在）
- Test: `src/core/attribute-eval.test.ts`（追加 describe；并把 Task 1 的占位缓存断言替换为强断言）

**Interfaces:**
- Consumes: Task 1 的 `readAttrForCompute`、`scriptResolver`、`MAX_DEPTH`、`depth`
- Produces: compute 生效；失败姿态 = 回退裸值 + 去重上报

- [ ] **Step 1: 写失败测试（compute 生效 + 四种失败姿态 + 深度护栏）**

在 `src/core/attribute-eval.test.ts` 末尾追加：

```ts
describe('attribute-eval：compute 派生', () => {
  beforeEach(() => { __resetAttributeEval() })
  const e = () => ({ id: 'c1', base: { 根骨: 50, 最大气血: 300 } })

  const withScripts = (scripts: Record<string, string>, defs?: Record<string, any>) => {
    configureAttributeEval({
      definitions: defs ?? { 最大气血: { compute: 'calc.js' } },
      scriptResolver: (n: string) => scripts[n],
      rawReader: (ent: any, n: string) => ent.base?.[n] ?? 0,
    })
  }

  it('compute 生效：脚本把 base 当成长项参与（成长不被吞）', () => {
    withScripts({ 'calc.js': 'return base + attrs.get("根骨") * 10' })
    expect(readEffective(e(), '最大气血', 300)).toBe(800)   // 300 + 50×10
  })

  it('其他属性带修正时，compute 读到的是有效值', () => {
    withScripts({ 'calc.js': 'return base + attrs.get("根骨") * 10' })
    const c = e()
    registerModifier(c, 'buff', '根骨', { flat: 10 })      // 根骨 50 → 60
    expect(readEffective(c, '最大气血', 300)).toBe(900)     // 300 + 60×10
  })

  it('修正叠在 compute 产物之上（spec D6：先派生后叠修正）', () => {
    withScripts({ 'calc.js': 'return base + attrs.get("根骨") * 10' })
    const c = e()
    registerModifier(c, 'm', '最大气血', { percent: -0.5 })
    expect(readEffective(c, '最大气血', 300)).toBe(400)     // 800 ×0.5
  })

  it('脚本文件缺失 → 回退裸值 + 上报一次', () => {
    withScripts({})
    expect(readEffective(e(), '最大气血', 300)).toBe(300)
    expect(errorReporter.getErrors().some(x => x.message.includes('calc.js'))).toBe(true)
  })

  it('脚本抛错 → 回退裸值 + 上报', () => {
    withScripts({ 'calc.js': 'throw "boom"' })
    expect(readEffective(e(), '最大气血', 300)).toBe(300)
    expect(errorReporter.getErrors().some(x => x.message.includes('calc.js'))).toBe(true)
  })

  it('返回非有限数 → 回退裸值 + 上报', () => {
    withScripts({ 'calc.js': 'return NaN' })
    expect(readEffective(e(), '最大气血', 300)).toBe(300)
    withScripts({ 'calc.js': 'return "不是数字"' })
    expect(readEffective(e(), '最大气血', 300)).toBe(300)
  })

  it('自引用 → 深度护栏断链 + 上报（不栈溢出）', () => {
    withScripts({ 'calc.js': 'return attrs.get("最大气血") + 1' })
    const v = readEffective(e(), '最大气血', 300)
    expect(typeof v).toBe('number')
    expect(errorReporter.getErrors().some(x => x.message.includes('深度上限'))).toBe(true)
  })

  it('缓存：同版本重复读只执行一次脚本；写入后重算', () => {
    let probes = 0
    configureAttributeEval({
      definitions: { 最大气血: { compute: 'calc.js' }, 根骨: {} },
      scriptResolver: () => 'return base + attrs.get("根骨")',
      rawReader: () => { probes++; return 0 },     // 脚本每执行一次就探一次底
    })
    const c = { id: 'c2' }
    expect(readEffective(c, '最大气血', 300)).toBe(300)
    expect(readEffective(c, '最大气血', 300)).toBe(300)
    expect(probes).toBe(1)                          // 第二次命中缓存，脚本没再跑
    notifyAttrWrite(c)
    readEffective(c, '最大气血', 300)
    expect(probes).toBe(2)                          // 写后缓存失效 → 重算
  })
})
```

同时**替换 Task 1 里那个桩断言用例**为强断言：

```ts
  it('compute 生效后：桩断言转为派生值（原 Task 1 用例的升级版）', () => {
    configureAttributeEval({
      definitions: { 力道: { compute: 'p.js' } },
      scriptResolver: () => 'return base + 1',
      rawReader: () => 0,
    })
    const e = { id: 'c1' }
    expect(readEffective(e, '力道', 10)).toBe(11)
  })
```

并把 import 补齐（`errorReporter`）：

```ts
import { errorReporter } from './error-reporter'
import {
  configureAttributeEval, readEffective, notifyAttrWrite, bumpDataVersion, __resetAttributeEval,
  registerModifier, removeModifier, clearModifiers, listModifiers,
} from './attribute-eval'
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/core/attribute-eval.test.ts`
Expected: FAIL —— compute 用例 expected 800 received 300（桩未执行脚本）

- [ ] **Step 3: 实装 compute**

在 `src/core/attribute-eval.ts` 中，把 `applyCompute` 桩替换为：

> ⚠️ **同时删除** Task 1 为通过 `noUnusedLocals` 而加的占位行 `void scriptResolver`（及其上方 3 行说明注释）
> —— 本任务实装后 `scriptResolver` 在 `applyCompute` 里被真正读取，占位行会变成死代码。
> 该占位行由 Task 1 的修复提交 `fdd6d483` 引入，其提交信息也已注明「Task 4 实装后删除」。

```ts
/** 编译缓存：同一段脚本文本只编译一次（mod 热重载换文本即重新编译） */
const compiled = new Map<string, Function>()

function compileScript(code: string): Function {
  let fn = compiled.get(code)
  if (!fn) {
    // 严格模式 + 显式两个入参（不用 with/Proxy：契约比 src/utils/sandbox.ts 更窄）
    fn = new Function('base', 'attrs', `"use strict";\n${code}`)
    compiled.set(code, fn)
  }
  return fn
}

/** 派生：v = 脚本(raw, attrs)。失败姿态一律「回退裸值 + 去重上报」，不阻断调用方。
 *  ⚠️ 同步执行、**无超时保护**（同步管线里做不到，见 spec §4.3）——脚本必须纯同步且快速 */
function applyCompute(entity: object, name: string, raw: number): number {
  const def = definitions[name]
  const file = def?.compute
  if (typeof file !== 'string' || file.length === 0) return raw
  if (!scriptResolver) return raw
  const code = scriptResolver(file)
  if (typeof code !== 'string' || code.trim().length === 0) {
    errorReporter.reportDedup(`attr-compute-missing:${file}`, {
      source: 'attribute-eval', severity: 'error',
      message: `属性 '${name}' 的 compute 脚本 '${file}' 不存在或为空——已回退裸值`,
      suggestion: `检查 mods/<mod>/scripts/${file} 是否存在`,
    })
    return raw
  }
  try {
    const out = compileScript(code)(raw, { get: (n: string) => readAttrForCompute(entity, n) })
    if (typeof out !== 'number' || !Number.isFinite(out)) {
      errorReporter.reportDedup(`attr-compute-bad:${name}`, {
        source: 'attribute-eval', severity: 'error',
        message: `属性 '${name}' 的 compute 脚本 '${file}' 返回非有限数字（收到 ${typeof out}）——已回退裸值`,
        suggestion: 'compute 脚本必须 return 一个有限 number，且不得是 async',
      })
      return raw
    }
    return out
  } catch (err) {
    errorReporter.reportDedup(`attr-compute-throw:${name}`, {
      source: 'attribute-eval', severity: 'error',
      message: `属性 '${name}' 的 compute 脚本 '${file}' 执行抛错：${err instanceof Error ? err.message : String(err)}——已回退裸值`,
    })
    return raw
  }
}
```

- [ ] **Step 4: 加载期校验 compute 脚本存在**

在 `src/core/mod-loader.ts` 注入属性定义的同一处，**注入前**加校验（放在解析出 `mod.attributes` 之后、`configureAttributeEval` 之前）：

```ts
    // 属性有效值层加载期校验：声明的 compute 脚本必须真实存在
    for (const [attrName, def] of Object.entries((mod.attributes ?? {}) as Record<string, any>)) {
      const f = def?.compute
      if (typeof f !== 'string' || f.length === 0) continue
      if (!scripts.has(f)) {
        errorReporter.report({
          source: 'mod-loader', severity: 'error',
          message: `属性 '${attrName}' 的 compute 脚本 '${f}' 不存在`,
          suggestion: `在 mods/${modName}/scripts/ 下创建 ${f}（签名：(base, attrs) => number，必须同步）`,
        })
      }
    }
```

> `modName` 与 `scripts` 均为该函数内的既有局部量（已核对）。**`errorReporter` 目前未在 `mod-loader.ts` import，
> 需在文件顶部补**：`import { errorReporter } from './error-reporter'`。`modLoader` 的 import 段现有：
> `parseModData / bindingResolver / conditionRegistry / entitySystem / gameContext / resetPendingSpawns /
> eventBus / SELF_LOADED_DATA_DIRS / types`（无 errorReporter）。

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run src/core/attribute-eval.test.ts`
Expected: PASS（25 个用例全绿：前两任务的 17 + 本任务 compute 8；含被升级的 1 例）

- [ ] **Step 6: 端到端验证（真实 mod 数据加载路径）**

Run: `npm run test` 与 `npm run validate`
Expected: **0 failed**，原有 1642 例全部仍通过（本任务未接任何来源，不应改变既有行为；总数约 1659+）；`validate` 4 passed。
另外跑一次 `npm run check:catalog`，Expected: `✅ 校验通过`。

- [ ] **Step 7: 类型检查**

Run: `npm run typecheck`
Expected: exit 0

- [ ] **Step 8: 提交**

```bash
git add src/core/attribute-eval.ts src/core/attribute-eval.test.ts src/core/mod-loader.ts
git commit -m "feat(core): compute 派生属性（同步脚本 + 回退上报 + 深度护栏 + 加载期校验）

签名 (base, attrs) => number：attrs.get 返回其他属性的有效值（递归走同一管线），
所以派生公式能把 base 当成长项、并读取带修正的实时属性值。
失败姿态一律回退裸值 + 去重上报（脚本缺失/抛错/非有限数/深度超限）。
⚠️ 同步执行、无超时保护（同步管线做不到）——以文档与加载期校验约束脚本必须纯同步快速。"
```

---

### Task 5: 文档同步

**Files:**
- Modify: `docs/attributes-system.md`

**Interfaces:**
- Consumes: Task 1-4 的最终行为
- Produces: 作者可见的契约说明

- [ ] **Step 1: 在 `docs/attributes-system.md` 补三个小节**

在「一、属性定义」的 `compute` 字段说明处（`compute = "script.js",  # 可选：计算属性脚本` 那一行）替换为带指针的说明，并在该章末尾追加：

````markdown
### 计算属性（compute）与属性有效值

**读取语义**（2026-09-22 起）：`getEntityAttr` 返回的是**有效值**，不是裸存储值。

```
有效值 = ( 派生公式(裸值) 或 裸值 )  然后叠加属性修正
```

- **裸值**：`entity.base.*` 等命名空间里的实际存储值（存档真相）。`setEntityAttr` 写的永远是裸值。
- **派生公式**：属性定义里写 `compute = "某某.js"`，脚本签名 `(base, attrs) => number`。
  - `base` = 该属性的裸值（把它当**成长项**参与，如 `最大气血 = base + 根骨×10`，不要写纯 `根骨×10`，否则成长会被吞）
  - `attrs.get("根骨")` = 其他属性的**有效值**（带修正，递归求值）
  - **必须同步**：不得 `async`、不得返回 Promise；返回非有限数按失败处理
  - **无超时保护**：同步管线无法超时，脚本必须又快又纯（失败一律回退裸值并上报）
- **属性修正**：由效果/装配/装备/状态挂上来的临时或条件性增减（`flat` / `percent` / `set`）。
  叠加规则与战斗公式通道完全一致：`(set ?? 值 + Σflat) × (1 + Σpercent)`。
  **多个 percent 相加后只乘一次** —— 两个 `+10%` 是 `+20%`，不是复利。

**闸门**：只有「在 `attributes.toml` 定义过 + 裸值是数字 + 声明了 `compute` 或有修正」的属性才走这套管线；
其余属性（含对象型如能力条目、字符串如性别）原样返回裸值。

**⚠️ 条件表达式的可见性**：`condition` 走同一个读取入口，因此条件判断看到的是**有效值** ——
临时修正会计入判断。写"挂上减属性的效果后触发的条件"时必须意识到这一点。
````

- [ ] **Step 2: 校验文档没有破坏结构**

Run: `npm run check:catalog`
Expected: `✅ 校验通过：解析 380 个 TOML，词条 455`

- [ ] **Step 3: 提交**

```bash
git add docs/attributes-system.md
git commit -m "docs(attributes): 补有效值读取语义、compute 契约与条件可见性

明确：读=有效值 / 写=裸值；compute 签名 (base, attrs) 且必须同步；
叠加代数与公式通道一致（percent 相加不相乘）；条件表达式会自动看到有效值。"
```

---

## 验收清单（计划一整体）

- [ ] `npm run test` → **0 failed**，原有 1642 例全部仍通过（新增测试使总数增加属预期）
- [ ] `npm run typecheck` → exit 0
- [ ] `npm run scan:attrs` → `VIOLATION=0`
- [ ] `npm run validate` → 4 passed
- [ ] `npm run check:catalog` → 校验通过
- [ ] 新增单测：`src/core/attribute-eval.test.ts` 全绿、`src/core/entity-utils.test.ts` 全绿
- [ ] 手工验证一次 compute 端到端：在 test-mod 的 `attributes.toml` 加一个 `compute` 属性 + `scripts/*.js`，读一次确认派生生效（验证后**撤销**该临时数据，不留在仓库里）

## 明确不在本计划内（后续计划）

- **计划二（T3+T4）**：声明式来源（装备/被动天赋/内功装配）与运行时来源（脚本 API、跨天时长状态 + 存档）接入
- **计划三（T5+T6）**：战斗效果 `modify_attribute` 落点、条件手册与更多文档
- 技能威力公式（属技能 schema）、秘籍系统（发放时机与去重）
