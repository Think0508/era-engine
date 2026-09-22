# 属性修正来源 · 计划二（声明式来源）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 mod 数据里写的属性修正真正生效 —— 装备/服装、被动技能、天赋三类**声明式来源**按"当前状态现推导"的方式参与属性有效值计算。

**Architecture:** core 的 `src/core/attribute-eval.ts` 增加**声明式来源聚合**：每次属性进管线时，从实体当前状态（`char.equipment` / `char.abilities` / `char.talents`）现算修正，**不缓存聚合结果、不需要任何变更通知**（推导式，不依赖调用方自觉）。同时暴露 `registerDeclarativeSource()` 供插件追加/覆盖来源（计划三的运行时来源走另一条 push 路径，二者共用同一份叠加代数）。

**Tech Stack:** TypeScript、Vitest、`@iarna/toml`。设计依据：`docs/superpowers/specs/2026-09-22-attribute-effective-value-design.md`（§5 两类来源、§6 作者侧数据形态、D4 内联、D2 五类来源）。

## Global Constraints

- **三层架构铁律**：core 不认任何**属性名**（气血/力道那类是数据）。本计划**新增**的引擎契约是三个来源约定本身：`char.equipment`（`{槽位: 物品ID}`，`equipment_off` **不算穿着**）、`char.abilities[id].level`（`{level, xp}`）、`char.talents[id]`（数字等级），以及 `attribute_mods = [{ attr, flat?, percent?, set?, per_level? }]` 的形状。用户已确认这三者应成为所有 mod 都必须兼容的引擎契约（`abilities`/`talents` 本就是 core 概念：`entity-utils.ts` 的 `SEARCH_ORDER` 与 `mod-types.ts` 的 `mod.abilities`/`mod.talentDefs`）。
- **推导式，不登记**：声明式来源**不得**用"穿戴时 registerModifier、脱下时 removeModifier"实现。注销路径已知有：H 中自动脱衣（`equipment_off`）、监狱没收（`confinement-system/prisoner.ts:143-155`）、`cloth_remove`/`cloth_remove_all` 效果、读档重建。漏一条就永久漂移。
- **叠加代数复用既有语义**：`((set ?? 值) + Σflat) × (1 + Σpercent)`；`percent` 相加后只乘一次；多个 `set` 取**清单顺序最后一条**。声明式来源参与同一份聚合，不新造第二套数学。
- **读-改-写规则照旧**：本计划只影响**读**；`applyAttrDelta` / `readRawAttr` / `bindingResolver.getRaw` 的基础值域契约不变，不得回退。
- **零回归**：原有测试必须全部仍通过、零失败（当前基线 **1685 passed / 5 skipped**）。**不得修改任何原有测试用例来迁就实现**。
- **`per_level` 只允许用在有等级的来源**（被动技能、天赋）；装备写 `per_level` → 加载期 **error**（不静默当 1 级）。
- 中文属性名/字段名属结构数据：测试中不得用 `obj['中文']` 下标取值（`npm run scan:attrs` 会判违规）；字符串字面量实参是安全的。
- 每个任务结束都要提交（`git commit`，pwsh 下用两个 `-m`，不要跨行引号）。

## File Structure

| 文件 | 职责 | 动作 |
|---|---|---|
| `src/core/attribute-eval.ts` | 新增：`AttributeModSource` 类型、`registerDeclarativeSource`、内置三源聚合 `collectDeclarativeMods`，并在 `readEffective` 内与 push 栈合并 | Modify |
| `src/core/attribute-eval.test.ts` | 三源聚合 + 幂等/顺序 + 与 push 栈合并的单元测试 | Modify |
| `src/core/mod-loader.ts` | 加载后注入 `char` 状态读不进来的东西：无（来源读的是实体状态与 `mod` 定义，聚合函数需要 `mod` 定义 → 由 core 通过注入的定义快照读取） | Modify |
| `src/plugins/attribute-mod-validate` | 不建新插件（用户选 D） | — |
| `docs/attributes-system.md` | 补 `attribute_mods` 作者侧契约与三源语义 | Modify |

> **依赖注记**：聚合需要 mod 定义（`items`/`abilities`/`talentDefs`）。core 不能 import `mod-loader`（成环），故由 `mod-loader` 在已有的 `configureAttributeEval({ definitions, scriptResolver })` 调用处**追加注入定义快照**（`defs: { items, abilities, talentDefs }`）。

---

### Task 1: core 声明式来源聚合（三源 + 注册点）

**Files:**
- Modify: `src/core/attribute-eval.ts`
- Test: `src/core/attribute-eval.test.ts`

**Interfaces:**
- Consumes（既有）：`AttributeMod`、`applyMods` 的叠加代数、`stateOf`、`configureAttributeEval`
- Produces:
  - `interface AttributeModSource { attr: string; flat?: number; percent?: number; set?: number; per_level?: number }`
  - `interface DeclarativeDefs { items?: Record<string, any>; abilities?: Record<string, any>; talentDefs?: Record<string, any> }`
  - `configureAttributeEval(cfg)` 新增可选字段 `defs?: DeclarativeDefs`
  - `registerDeclarativeSource(fn: (entity: any, defs: DeclarativeDefs) => AttributeMod[]): void`（追加来源；内置三源最先，注册的按注册顺序在其后 —— 顺序只影响 `set` 的"最后一条胜出"）
  - `collectDeclarativeMods(entity: any): AttributeMod[]`（导出供测试与调试）

- [ ] **Step 1: 写失败测试**

在 `src/core/attribute-eval.test.ts` 末尾追加：

```ts
describe('attribute-eval：声明式来源（装备/被动技能/天赋）', () => {
  const DEFS = {
    items: { 玄铁护腕: { attribute_mods: [{ attr: '力道', flat: 5 }] } },
    abilities: {
      龟息功: { attribute_mods: [{ attr: '力道', flat: 10, per_level: 2 }] },
      无等级被动: { attribute_mods: [{ attr: '根骨', flat: 3 }] },
    },
    talentDefs: { 神目: { attribute_mods: [{ attr: '根骨', flat: 1, per_level: 1 }] } },
  }

  beforeEach(() => {
    __resetAttributeEval()
    configureAttributeEval({ definitions: { 力道: {}, 根骨: {} }, defs: DEFS })
  })

  it('装备：按 char.equipment 现算；equipment_off 里的不算穿着', () => {
    const c = { id: 'e1', equipment: { wrist: '玄铁护腕' }, equipment_off: { wrist: '玄铁护腕' } }
    expect(readEffective(c, '力道', 100)).toBe(105)
    // 只放 equipment_off（H 中自动脱下）→ 不加修正
    const off = { id: 'e2', equipment: {}, equipment_off: { wrist: '玄铁护腕' } }
    expect(readEffective(off, '力道', 100)).toBe(100)
  })

  it('被动技能：1 级给 flat，每多 1 级再给 per_level（线性追加）', () => {
    const c = { id: 'a1', abilities: { 龟息功: { level: 3, xp: 0 } } }
    // 龟息功：flat=10, per_level=2 → 3 级 = 10 + 2×(3−1) = 14
    expect(readEffective(c, '力道', 100)).toBe(114)
    const zero = { id: 'a2', abilities: { 龟息功: { level: 0, xp: 0 } } }
    expect(readEffective(zero, '力道', 100)).toBe(100)
  })

  it('天赋：char.talents[id] 是等级（数字）', () => {
    const c = { id: 't1', talents: { 神目: 2 } }
    // 神目：flat=1, per_level=1 → 2 级 = 1 + 1×(2−1) = 2
    expect(readEffective(c, '根骨', 100)).toBe(102)
  })

  it('多源叠加：percent 相加后只乘一次（与 push 栈同一份代数）', () => {
    const c = {
      id: 'm1',
      equipment: { wrist: '玄铁护腕' },
      abilities: { 龟息功: { level: 0, xp: 0 } },
      talents: {},
    }
    // 声明式 flat 5 + push 栈 percent +50% → (100 + 5) × 1.5
    registerModifier(c, 'buff', '力道', { percent: 0.5 })
    expect(readEffective(c, '力道', 100)).toBe(157.5)
  })

  it('【无漂移】脱下装备后立即不再加（无需任何通知）', () => {
    const c: any = { id: 'd1', equipment: { wrist: '玄铁护腕' } }
    expect(readEffective(c, '力道', 100)).toBe(105)
    delete c.equipment.wrist          // 直改状态，不调用任何 API
    expect(readEffective(c, '力道', 100)).toBe(100)
  })

  it('registerDeclarativeSource 追加来源；顺序决定 set 的最后一条', () => {
    const c = { id: 'x1' }
    registerDeclarativeSource(() => [{ attr: '力道', set: 50 }])
    registerDeclarativeSource(() => [{ attr: '力道', set: 70 }])
    expect(readEffective(c, '力道', 100)).toBe(70)   // 后注册者胜
  })

  it('未知装备 ID / 未声明 attribute_mods 的定义 / 缺状态字段 → 静默跳过，不崩', () => {
    expect(readEffective({ id: 'n1', equipment: { wrist: '不存在' } }, '力道', 100)).toBe(100)
    expect(readEffective({ id: 'n2' }, '力道', 100)).toBe(100)   // 无 equipment/abilities/talents
    configureAttributeEval({ defs: { items: { 无mods: {} } } })
    expect(readEffective({ id: 'n3', equipment: { wrist: '无mods' } }, '力道', 100)).toBe(100)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/core/attribute-eval.test.ts`
Expected: FAIL —— 装备/技能/天赋用例 expected 105 received 100

- [ ] **Step 3: 实现三源聚合**

在 `src/core/attribute-eval.ts` 中：

1. 类型与状态：

```ts
export interface AttributeModSource {
  attr: string
  flat?: number
  percent?: number
  set?: number
  per_level?: number
}

export interface DeclarativeDefs {
  items?: Record<string, any>
  abilities?: Record<string, any>
  talentDefs?: Record<string, any>
}

let defs: DeclarativeDefs = {}
const extraSources: ((entity: any, defs: DeclarativeDefs) => AttributeModSource[])[] = []

/** 追加声明式来源（内置三源最先，注册的按注册顺序在其后；顺序只影响 set 的「最后一条胜出」） */
export function registerDeclarativeSource(fn: (entity: any, defs: DeclarativeDefs) => AttributeModSource[]): void {
  extraSources.push(fn)
}
```

2. `configureAttributeEval` 增加 `defs` 分支（与既有字段同风格）：`if (cfg.defs) defs = cfg.defs`；`__resetAttributeEval()` 中 `defs = {}` 且 `extraSources.length = 0`。

3. 聚合实现（**每次现算，不缓存**）：

```ts
/** 等级缩放（**线性追加**，与战斗效果的乘性 growth 刻意不同）：
 *  `flat(级 n) = flat + per_level×(n−1)`（1 级 = flat 本身）；percent 同理；
 *  `set` **不随等级缩放**（它是"覆盖基准"，缩放无意义）。只缩放**显式给过的**字段——
 *  没给 percent 就不要因为 per_level 而凭空产生 percent。 */
function scaleByLevel(m: AttributeModSource, level: number): AttributeModSource {
  const n = Math.max(1, Math.floor(level))
  if (!m.per_level || n <= 1) return m
  const step = m.per_level * (n - 1)
  const out: AttributeModSource = { attr: m.attr }
  if (typeof m.flat === 'number') out.flat = m.flat + step
  if (typeof m.percent === 'number') out.percent = m.percent + step
  if (typeof m.set === 'number') out.set = m.set
  return out
}

function pushMods(out: AttributeModSource[], list: any, level: number): void {
  if (!Array.isArray(list)) return
  for (const raw of list) {
    if (!raw || typeof raw.attr !== 'string' || raw.attr.length === 0) continue
    out.push(scaleByLevel(raw as AttributeModSource, level))
  }
}

/** 从实体**当前状态**现算声明式修正（每次调用都重算：不缓存 → 脱下/升级/失去天赋立即生效，无需通知） */
export function collectDeclarativeMods(entity: any): AttributeModSource[] {
  const out: AttributeModSource[] = []
  if (!entity || typeof entity !== 'object') return out
  // ① 装备（equipment_off 里的不算穿着——H 中自动脱下的部位不提供修正）
  const worn = entity.equipment
  if (worn && typeof worn === 'object') {
    for (const itemId of Object.values(worn)) {
      const def = typeof itemId === 'string' ? defs.items?.[itemId] : undefined
      pushMods(out, def?.attribute_mods, 1)
    }
  }
  // ② 被动技能（等级 = abilities[id].level；{level, xp} 契约）
  const abil = entity.abilities
  if (abil && typeof abil === 'object') {
    for (const [id, entry] of Object.entries(abil)) {
      const def = defs.abilities?.[id]
      const level = typeof (entry as any)?.level === 'number' ? (entry as any).level : 0
      if (level <= 0) continue
      pushMods(out, def?.attribute_mods, level)
    }
  }
  // ③ 天赋（等级 = talents[id] 数字）
  const tal = entity.talents
  if (tal && typeof tal === 'object') {
    for (const [id, lv] of Object.entries(tal)) {
      const def = defs.talentDefs?.[id]
      const level = typeof lv === 'number' ? lv : 0
      if (level <= 0) continue
      pushMods(out, def?.attribute_mods, level)
    }
  }
  // ④ 插件追加来源
  for (const fn of extraSources) {
    try {
      const list = fn(entity, defs)
      if (Array.isArray(list)) for (const m of list) if (m && typeof m.attr === 'string') out.push(m)
    } catch (err) {
      errorReporter.reportDedup('attr-decl-source', {
        source: 'attribute-eval', severity: 'error',
        message: `声明式来源函数抛错：${err instanceof Error ? err.message : String(err)}——已跳过该来源`,
      })
    }
  }
  return out
}
```

> ⚠️ **`per_level` 的语义必须与本计划 Step 1 的断言一致**（`flat=10, per_level=2, level=3` → `10 + 2×3 = 16`）。实现前先确认你选的语义是「线性追加」而不是「乘性放大」（计划一的 `growth` 是乘性，**这里刻意不同**：声明式成长按「每级加固定量」写更自然）。若你认为应改成乘性，**先停下来问 controller**，不要自行改断言。

4. `applyMods` 改为接收已算好的声明式清单（**一次读取只聚合一次**——闸门与叠加共用同一份，不要在两处各调一次 `collectDeclarativeMods`）：

```ts
function applyMods(entity: object, name: string, v: number, decl: AttributeModSource[]): number {
  let set: number | undefined
  let flat = 0
  let percent = 0
  let hit = false
  // ① 声明式来源（由 readEffective 现算后传入；顺序：装备→技能→天赋→插件追加）
  for (const m of decl) {
    if (m.attr !== name) continue
    hit = true
    if (typeof m.set === 'number' && Number.isFinite(m.set)) set = m.set
    if (typeof m.flat === 'number' && Number.isFinite(m.flat)) flat += m.flat
    if (typeof m.percent === 'number' && Number.isFinite(m.percent)) percent += m.percent
  }
  // ② push 栈（既有逻辑，原样保留）
  const st = states.get(entity)
  if (st) {
    for (const m of st.mods) {
      if (m.attr !== name) continue
      hit = true
      if (typeof m.mod.set === 'number' && Number.isFinite(m.mod.set)) set = m.mod.set
      if (typeof m.mod.flat === 'number' && Number.isFinite(m.mod.flat)) flat += m.mod.flat
      if (typeof m.mod.percent === 'number' && Number.isFinite(m.mod.percent)) percent += m.mod.percent
    }
  }
  if (!hit) return v
  const base = set !== undefined ? set : v
  return (base + flat) * (1 + percent)
}
```

5. **闸门**必须把声明式来源算进去。`readEffective` 里现在的早退是
`if (!hasCompute && !hasMods(entity, name)) return raw`。改为（**在 `!def` / 非有限数的早退之后**才算聚合，避免为无关属性白跑循环）：

```ts
  const hasCompute = typeof def.compute === 'string' && def.compute.length > 0
  const decl = collectDeclarativeMods(entity)          // 每次进管线现算一次（有界：装备≤槽位数 + 能力/天赋项数）
  const hasDecl = decl.some(m => m.attr === name)
  if (!hasCompute && !hasMods(entity, name) && !hasDecl) return raw
  // …后续 applyCompute / applyMods(entity, name, v, decl)
```
（注意：这会让"声明过且有声明式修正"的属性进管线；声明过但无任何修正的属性仍原样返回裸值。）

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/core/attribute-eval.test.ts`
Expected: PASS（全部用例绿）

- [ ] **Step 5: 零回归 + 类型检查**

Run: `npm run test`（须 0 failed，总数因新增用例增长）与 `npm run typecheck`（exit 0）
Run: `npm run scan:attrs`（`VIOLATION=0`）

- [ ] **Step 6: 提交**

```bash
git add src/core/attribute-eval.ts src/core/attribute-eval.test.ts
git commit -m "feat(core): 声明式属性修正来源（装备/被动技能/天赋）+ 注册点" -m "每次进管线时从实体当前状态现算，不缓存、不需要变更通知——脱下/升级/失去天赋立即生效，天然无漂移（不依赖调用方记得注销）。equipment_off 不算穿着。叠加代数与 push 栈共用一份（percent 相加只乘一次）。"
```

---

### Task 2: mod-loader 注入定义 + 加载期校验

**Files:**
- Modify: `src/core/mod-loader.ts`
- Test: `src/core/mod-loader.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `DeclarativeDefs`
- Produces: `configureAttributeEval({ definitions, scriptResolver, defs })` 的 `defs` 实参；`attribute_mods` 加载期校验错误

- [ ] **Step 1: 写失败测试**

在 `src/core/mod-loader.test.ts` 的 `mod-loader integration` describe 内追加（沿用该文件的 `new ModLoader()` + `loadMod('test-mod')` 惯例）：

```ts
it('属性修正声明：装备/被动技能/天赋的 attribute_mods 经真实 loadMod 生效', async () => {
  const loader = new ModLoader()
  await loader.loadMod('test-mod')
  const p = entitySystem.get('character', 'player') as any
  // 夹具（Step 3 加进 test-mod）：属性「修正测试值」default=100；
  //   物品「测试护腕」attribute_mods = [{ attr = "修正测试值", flat = 5 }]
  //   能力「混元功」(passive) attribute_mods = [{ attr = "修正测试值", flat = 10, per_level = 2 }]
  const base = readRawAttr(p, '修正测试值')
  expect(base).toBe(100)                                  // 属性默认值
  expect(getEntityAttr(p, '修正测试值')).toBe(100)         // 未穿戴/未学 → 裸值

  p.equipment = { wrist: '测试护腕' }
  expect(getEntityAttr(p, '修正测试值')).toBe(105)         // 100 + 5

  p.abilities = { ...(p.abilities ?? {}), 混元功: { level: 2, xp: 0 } }
  expect(getEntityAttr(p, '修正测试值')).toBe(117)         // 100 + 5 + (10 + 2×(2−1))

  // 脱下 + 掉级 → 立即不再生效（无通知、无注销逻辑）
  delete p.equipment.wrist
  p.abilities.混元功.level = 0
  expect(getEntityAttr(p, '修正测试值')).toBe(100)
})
```

> 若 `wrist` 不是 test-mod 的有效槽位 ID，改用 `equipment.toml` 里真实存在的槽位（如 `upper`）——**槽位是否合法不影响本用例**（聚合只按 `char.equipment` 的值查物品定义），但用真实槽位更贴近实际。
>
> 该测试文件若尚未 import `getEntityAttr` / `readRawAttr`，在文件顶部从 `./entity-utils` 补上（`noUnusedLocals` 开着：只 import 真正用到的）。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/core/mod-loader.test.ts`
Expected: FAIL —— 修正未生效（得到裸值）

- [ ] **Step 3: 注入 + 校验 + 夹具**

1. `mod-loader.ts` 的注入点（`configureAttributeEval` 那次调用）追加 `defs`：

```ts
    configureAttributeEval({
      definitions: mod.attributes as Record<string, { compute?: string }>,
      scriptResolver: (fileName: string) => scripts.get(fileName),
      // 声明式来源需要定义快照（core 不能 import mod-loader，故在此注入）
      defs: { items: mod.items, abilities: mod.abilities, talentDefs: mod.talentDefs },
    })
```

2. 同一处加**加载期校验**（`modName`/`scripts` 均为该函数局部量；`errorReporter` 已在该文件 import）：

```ts
    // 属性修正声明校验（attribute_mods）
    const checkMods = (owner: string, list: any, opts: { allowPerLevel: boolean }) => {
      if (list === undefined) return
      if (!Array.isArray(list)) {
        errorReporter.report({ source: 'mod-loader', severity: 'error',
          message: `${owner} 的 attribute_mods 必须是数组` })
        return
      }
      for (const m of list) {
        const attr = m?.attr
        if (typeof attr !== 'string' || !mod.attributes?.[attr]) {
          errorReporter.report({ source: 'mod-loader', severity: 'error',
            message: `${owner} 的 attribute_mods 引用了未定义属性 '${String(attr)}'`,
            suggestion: '该属性需先在 attributes.toml 定义（属性有效值层的闸门以定义为前提）' })
          continue
        }
        const hasNum = ['flat', 'percent', 'set'].some(k => typeof m[k] === 'number')
        if (!hasNum) {
          errorReporter.report({ source: 'mod-loader', severity: 'error',
            message: `${owner} 的 attribute_mods['${attr}'] 至少要给 flat/percent/set 之一` })
        }
        if (m.per_level !== undefined && !opts.allowPerLevel) {
          errorReporter.report({ source: 'mod-loader', severity: 'error',
            message: `${owner} 的 attribute_mods['${attr}'] 用了 per_level，但该来源没有等级概念`,
            suggestion: 'per_level 只能用在被动技能/天赋这类有等级的定义上' })
        }
      }
    }
    for (const [id, def] of Object.entries((mod.items ?? {}) as Record<string, any>)) {
      checkMods(`物品 '${id}'`, def?.attribute_mods, { allowPerLevel: false })
    }
    for (const [id, def] of Object.entries((mod.abilities ?? {}) as Record<string, any>)) {
      checkMods(`能力 '${id}'`, def?.attribute_mods, { allowPerLevel: true })
    }
    for (const [id, def] of Object.entries((mod.talentDefs ?? {}) as Record<string, any>)) {
      checkMods(`天赋 '${id}'`, def?.attribute_mods, { allowPerLevel: true })
    }
```

3. 夹具（三处，数值与本任务 Step 1 的断言严格对应）：

```toml
# mods/test-mod/definitions/attributes.toml（追加）
# 属性有效值层 计划二夹具：装备/技能/天赋的 attribute_mods 端到端验证用（无生产消费方）
"修正测试值" = { type = "number", default = 100, category = "base", display = false }

# mods/test-mod/definitions/items.toml（追加）
# 属性修正夹具：装备 +5（无 per_level —— 装备无等级概念，写了会被加载期校验拦下）
[items."测试护腕"]
name = "测试护腕"
attribute_mods = [ { attr = "修正测试值", flat = 5 } ]

# mods/test-mod/definitions/abilities.toml —— 给已有的 passive「混元功」加一行
attribute_mods = [ { attr = "修正测试值", flat = 10, per_level = 2 } ]   # 1 级 +10，每多 1 级再 +2
```

> 追加前先看这三个文件的实际结构（`items.toml` 可能是 `[items.xxx]` 表或 `[[items]]` 数组；`混元功` 已存在于 `abilities.toml`）——**按文件既有风格追加，不要改动既有条目**。若物品段是数组形式，用同风格加一条。<br>
> 夹具若与某个既有测试的断言冲突（例如有测试断言 test-mod 的属性条数或物品条数），**优先改成本用例自建实体**（`entitySystem.register` 一个临时角色 + 只加物品定义），并在报告里说明。全量测试是仲裁者。

- [ ] **Step 4: 运行测试确认通过 + 全量**

Run: `npx vitest run src/core/mod-loader.test.ts` → PASS
Run: `npm run test`（0 failed）｜`npm run validate`（4 passed）｜`npm run typecheck`（0）

- [ ] **Step 5: 提交**

```bash
git add src/core/mod-loader.ts src/core/mod-loader.test.ts mods/test-mod/definitions/
git commit -m "feat(core): 注入声明式来源定义快照 + attribute_mods 加载期校验" -m "校验：属性必须已定义、flat/percent/set 至少一项、per_level 只允许用在有等级的来源（装备写则 error）。夹具进 test-mod 并加真实 loadMod 端到端用例。"
```

---

### Task 3: 文档与作者侧契约

**Files:**
- Modify: `docs/attributes-system.md`

- [ ] **Step 1: 补作者侧章节**

在 `docs/attributes-system.md` 既有「计算属性（compute）与属性有效值」一节内，把「属性修正」那条从"尚未接线"改写为**已接线**，并附三源表：

````markdown
**已接线的声明式来源**（2026-09-22 计划二）：读属性时按角色**当前状态**现算，不缓存、无需通知——
脱下装备 / 技能掉级 / 失去天赋**立即**不再生效。

| 来源 | 读哪里 | 等级缩放 |
|---|---|---|
| 装备/服装 | `char.equipment[槽位]` → `items.toml` 的该物品定义 | 无（有等级语义的装备不支持 `per_level`，写了报错） |
| 被动技能 | `char.abilities[技能ID].level` → `abilities.toml` | `per_level × (等级−1)` 追加到 `flat`/`percent` |
| 天赋 | `char.talents[天赋ID]`（数字等级） → `talents.toml` | 同上 |

写法（内联在各来源自己的定义里）：

```toml
# items.toml
[items."玄铁护腕"]
attribute_mods = [ { attr = "根骨", flat = 5 } ]

# abilities.toml（被动）
[abilities."龟息功"]
attribute_mods = [ { attr = "力道", flat = 10, per_level = 2 } ]   # 1 级 +10，每多 1 级再 +2

# talents.toml
[talents."神目"]
attribute_mods = [ { attr = "福缘", flat = 1, per_level = 1 } ]
```

- `char.equipment_off`（H 中自动脱下的部位）**不算穿着** → 不提供修正；H 结束穿回后自动恢复
- 属性必须先在 `attributes.toml` 定义（闸门以定义为前提），否则加载期报错
- 仍未接线：战斗效果/跨天限时状态（计划三）——今天写这类字段不会有任何效果
````

- [ ] **Step 2: 校验文档无误**

Run: `npm run check:catalog` → `✅ 校验通过`

- [ ] **Step 3: 提交**

```bash
git add docs/attributes-system.md
git commit -m "docs(attributes): 声明式修正来源（装备/被动技能/天赋）作者侧契约"
```

---

## 验收清单（计划二整体）

- [ ] `npm run test` → **0 failed**，原有用例全部仍通过（基线 1685 passed / 5 skipped）
- [ ] `npm run typecheck` → exit 0
- [ ] `npm run scan:attrs` → `VIOLATION=0`
- [ ] `npm run validate` → 4 passed ｜ `npm run check:catalog` → 校验通过
- [ ] 新增单测：三源聚合 + 幂等/顺序 + 与 push 栈合并 + **无漂移**（脱下即失效）
- [ ] 端到端：test-mod 真实 `loadMod` 后，装备/技能/天赋的 `attribute_mods` 生效

## 明确不在本计划内（后续计划）

- **计划三**：运行时来源（战斗效果 `modify_attribute`、脚本/API 直挂、带跨天时长的临时状态 + 存档序列化到期）
- **内功装配**（`equippable` / `equipped_mods`）：属于秘籍/内功系统的玩法机制（装配槽、装配指令、排他规则、UI），届时只是"多一个来源"
- 条件手册中标注哪些字段会受修正影响；UI 的基础值/有效值差异呈现（`120 (+15)`）
