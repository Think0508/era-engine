# 条件引擎统一（Condition Engine Unification）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把双条件系统（字符串表达式引擎 `condition.ts` + 前提注册表 `premise-registry.ts`）合并为单一 `conditionEngine` 单例：前提 = 表达式的命名别名（`premise(X)` 函数调用 + `premises` 数组简写），一套语法/上下文/校验；校验升级为 error+注销；erArk 权重语义下沉消费方；存量 `premises:` 前缀数据全量迁移。

**Architecture:** 新 `src/core/condition-engine.ts` 单例承担三大职责：表达式 tokenize/parse（递归下降 → AST，Map 缓存）、命名前提注册表（代码/TOML 前提同表注册，循环引用检测）、求值（`evaluate`/`evaluatePremises`/`getPremiseValue`/`clear`）。handler 上下文统一为完整 GameContext（`sourceId` 加进类型）。`getWeight`（high_ 规则）下沉 talk-common-system，`getWeightSum` 下沉 npc-ai-system 与 core/random-event.ts。校验器 `conditionRegistry.validateExpression` 扩展 `premise(X)` 参数校验，instruction-loader 对未注册前提升 error+注销。存量 `premises:X&Y` 数据由一次性 Node 脚本迁移为 `premise(X) && premise(Y)`。

**Tech Stack:** TypeScript、Vitest、@iarna/toml、Vite `import.meta.glob`

## Global Constraints

- 严格三层：`src/core/` 不得出现具体玩法名词——新引擎代码中**禁止**出现 `high_`、`jj_`、`erArk` 等字符串常量（high_ 规则在 talk-common-system）
- 插件之间禁止直接 import：跨插件通信走 `ctx.api.call()` 或事件总线；core 模块之间可直接 import
- 行为兼容铁律：现有 `condition.test.ts` 全部语义（默认值/数组包含/裸路径/null 检查/单双引号/聚合/别名/B2 存在性）必须逐条通过，不允许"顺手改语义"
- 中文标识符路径合法（`player.气血`、`selected.talents.幼女`）
- 校验铁律：未知前提/未知字段 → 加载期 error + 注销该指令（禁止运行时静默放行）；禁止直接 `console.error`，走 `errorReporter`
- Windows 环境：数据迁移脚本用 Node `fs.readFileSync/writeFileSync` 显式 UTF-8 读写，禁止 PowerShell 重定向写中文文件
- 测试命令：`npm run test`、`npm run validate`（mod 数据校验）、`npm run typecheck`
- 每任务独立 commit，提交信息含 `feat/fix/refactor` 前缀（沿用仓库风格，中文描述）

---

## P1 引擎重写

### Task 1: condition-engine 骨架（tokenizer + parser + AST + 求值）

**Files:**
- Create: `src/core/condition-engine.ts`
- Create: `src/core/condition-engine.test.ts`（语义全集 = 现有 `condition.test.ts` 全部用例迁移 + 新增解析错误/缓存用例）
- Modify: `src/core/types.ts:76-89`（GameContext 加 `sourceId?: string | null`）

**Interfaces:**
- Produces: `conditionEngine.evaluate(expr: string, ctx: GameContext): boolean`、`conditionEngine.clear(): void`
- Consumes: `GameContext`（src/core/types.ts）、`getEntityAttr`（src/core/entity-utils.ts）

- [ ] **Step 1: 写失败测试**——`src/core/condition-engine.test.ts`：把 `src/core/condition.test.ts` 的全部 `it()` 用例迁移为 `conditionEngine.evaluate(...)` 调用（第 37-206 行原样搬，只改调用对象），并补充：
  - 解析错误用例：`conditionEngine.evaluate('player.hp + 10 > 50', ctx)` → toThrow（算术）；`'premises:high_1'` → toThrow（旧前缀语法已删除）；`'location.name == "酒馆(分店"'` → not.toThrow（字符串内括号合法）
  - 缓存/clear 用例：`conditionEngine.clear()` 后再求值仍正确（幂等）
- [ ] **Step 2: 运行确认失败**：`npx vitest run src/core/condition-engine.test.ts` → FAIL（`conditionEngine` 未定义）
- [ ] **Step 3: 实现 `src/core/condition-engine.ts`**（完整代码见下）
- [ ] **Step 4: 运行确认通过**：`npx vitest run src/core/condition-engine.test.ts` → 全 PASS
- [ ] **Step 5: GameContext 加字段**——`src/core/types.ts` 的 `GameContext` 接口加 `sourceId?: string | null`（注释：前提求值上下文——触发者/被判定者，调用方注入，gameContext.getContext() 不填）
- [ ] **Step 6: Commit**：`git add src/core/condition-engine.ts src/core/condition-engine.test.ts src/core/types.ts && git commit -m "feat(core): condition-engine 新解析器（tokenizer+AST+缓存，语义全集对齐）"`

**Step 3 完整实现**（`src/core/condition-engine.ts`）：

```typescript
import type { GameContext } from './types'
import { getEntityAttr } from './entity-utils'

// ============ Tokenizer ============

type Token =
  | { type: 'path'; value: string; pos: number }      // 路径/标识符 token（含还原后的聚合段）
  | { type: 'string'; value: string; pos: number }
  | { type: 'number'; value: number; pos: number }
  | { type: 'bool'; value: boolean; pos: number }
  | { type: 'op'; value: string; pos: number }        // && || == != >= <= > <
  | { type: 'not'; pos: number }                      // !
  | { type: 'lparen'; pos: number }
  | { type: 'rparen'; pos: number }
  | { type: 'premise'; id: string; pos: number }      // premise(X) 函数调用
  | { type: 'agg'; value: string; pos: number }       // any(...)/any_positive(...)/any_negative(...) 还原段

const MULTI_OPS = ['&&', '||', '==', '!=', '>=', '<=']
const SINGLE_OPS = ['>', '<']
const ARITH = new Set(['+', '-', '*', '/', '%'])

// 前置保护：premise(...)/any(...) 括号参数不被当作逻辑括号 tokenize
// 与旧实现的 \u0001 占位符同思路，但此处还原为专用 token 类型
function protectFunctions(src: string): { text: string; map: { name: string; args: string }[] } {
  const map: { name: string; args: string }[] = []
  const text = src.replace(/(premise|any|any_positive|any_negative)\(([^)]*)\)/g, (m, name: string, args: string) => {
    const idx = map.length
    map.push({ name, args })
    return `\u0001${idx}\u0001`
  })
  return { text, map }
}

function tokenize(src: string): Token[] {
  const { text, map } = protectFunctions(src)
  const tokens: Token[] = []
  let i = 0

  const throwAt = (msg: string, pos: number): never => {
    throw new Error(`Condition expression syntax error at position ${pos}: ${msg}`)
  }

  while (i < text.length) {
    const ch = text[i]

    // 占位符还原
    if (ch === '\u0001') {
      const end = text.indexOf('\u0001', i + 1)
      if (end === -1) throwAt('unterminated placeholder', i)
      const idx = Number(text.slice(i + 1, end))
      const entry = map[idx]
      if (!entry) throwAt('bad placeholder index', i)
      if (entry.name === 'premise') {
        tokens.push({ type: 'premise', id: entry.args.trim(), pos: i })
      } else {
        tokens.push({ type: 'agg', value: `${entry.name}(${entry.args})`, pos: i })
      }
      i = end + 1
      continue
    }

    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') { i++; continue }

    // 多字符运算符
    const multi = MULTI_OPS.find(op => text.startsWith(op, i))
    if (multi) { tokens.push({ type: 'op', value: multi, pos: i }); i += multi.length; continue }
    if (text.startsWith('&&', i) || text.startsWith('||', i)) { i += 2; continue }

    if (ch === '!') {
      if (text[i + 1] === '=') { tokens.push({ type: 'op', value: '!=', pos: i }); i += 2; continue }
      tokens.push({ type: 'not', pos: i }); i++; continue
    }
    if (SINGLE_OPS.includes(ch)) { tokens.push({ type: 'op', value: ch, pos: i }); i++; continue }
    if (ch === '(') { tokens.push({ type: 'lparen', pos: i }); i++; continue }
    if (ch === ')') { tokens.push({ type: 'rparen', pos: i }); i++; continue }

    if (ch === '"' || ch === "'") {
      const end = text.indexOf(ch, i + 1)
      if (end === -1) throwAt('unterminated string literal', i)
      tokens.push({ type: 'string', value: text.slice(i + 1, end), pos: i })
      i = end + 1
      continue
    }

    if (ch >= '0' && ch <= '9') {
      const m = text.slice(i).match(/^\d+(\.\d+)?/)
      tokens.push({ type: 'number', value: parseFloat(m![0]), pos: i })
      i += m![0].length
      continue
    }

    if (ARITH.has(ch)) {
      throwAt(`Arithmetic operators are not allowed in conditions; use condition_script for complex logic`, i)
    }
    if (ch === '&' || ch === '|') {
      throwAt(`'${ch}' is not allowed; old 'premises:' prefix syntax was removed — use premise(X)`, i)
    }
    if (ch === ',') { i++; continue } // 聚合参数内的逗号已被保护，此处仅防御性跳过

    // 路径 token：连续收集直到空白/运算符/括号/引号
    const start = i
    while (i < text.length && !/[ \t\n\r<>=!()"'&|+\-*\/%]/.test(text[i])) i++
    if (i === start) throwAt(`unexpected character '${ch}'`, i)
    tokens.push({ type: 'path', value: text.slice(start, i), pos: start })
  }
  return tokens
}

// ============ Parser（递归下降）============

interface PathNode {
  kind: 'path'
  segments: string[]
  isRoot: boolean   // 根形态（player/selected/target/location/game/inventory 开头）
}
interface AggNode { kind: 'agg'; raw: string }            // 聚合段（求值前拼回路径上下文）
interface LitNode { kind: 'lit'; value: any }
interface PremiseNode { kind: 'premise'; id: string }
interface CmpNode { kind: 'cmp'; left: OperandNode; op: string; right: OperandNode }
interface BoolNode { kind: 'bool'; op: '&&' | '||'; left: ExprNode; right: ExprNode }
interface NotNode { kind: 'not'; child: ExprNode }

type OperandNode = PathNode | AggNode | LitNode | PremiseNode
type ExprNode = OperandNode | CmpNode | BoolNode | NotNode

const ROOT_RE = /^(player|selected|target|character|location|game|inventory)(\.|$)/

class Parser {
  private tokens: Token[]
  private pos = 0

  constructor(tokens: Token[]) { this.tokens = tokens }

  parse(): ExprNode {
    const node = this.parseOr()
    if (this.pos < this.tokens.length) {
      throw new Error(`Condition expression is invalid: unexpected token '${this.peek().type === 'path' ? this.peek().value : this.peek().type}'`)
    }
    return node
  }

  private peek(): Token | undefined { return this.tokens[this.pos] }
  private next(): Token { return this.tokens[this.pos++] }

  private parseOr(): ExprNode {
    let left = this.parseAnd()
    while (this.peek()?.type === 'op' && (this.peek() as any).value === '||') {
      this.next()
      left = { kind: 'bool', op: '||', left, right: this.parseAnd() }
    }
    return left
  }

  private parseAnd(): ExprNode {
    let left = this.parseUnary()
    while (this.peek()?.type === 'op' && (this.peek() as any).value === '&&') {
      this.next()
      left = { kind: 'bool', op: '&&', left, right: this.parseUnary() }
    }
    return left
  }

  private parseUnary(): ExprNode {
    if (this.peek()?.type === 'not') {
      this.next()
      return { kind: 'not', child: this.parseUnary() }
    }
    return this.parsePrimary()
  }

  private parsePrimary(): ExprNode {
    const tok = this.peek()
    if (!tok) throw new Error('Condition expression is invalid: unexpected end of expression')

    if (tok.type === 'lparen') {
      this.next()
      const inner = this.parseOr()
      if (this.peek()?.type !== 'rparen') throw new Error('Condition expression is invalid: missing closing parenthesis')
      this.next()
      return inner
    }

    const operand = this.parseOperand()
    const opTok = this.peek()
    if (opTok?.type === 'op') {
      this.next()
      const right = this.parseOperand()
      return { kind: 'cmp', left: operand, op: opTok.value, right }
    }
    return operand
  }

  private parseOperand(): OperandNode {
    const tok = this.next()
    switch (tok.type) {
      case 'string': return { kind: 'lit', value: tok.value }
      case 'number': return { kind: 'lit', value: tok.value }
      case 'bool': return { kind: 'lit', value: tok.value }
      case 'premise': return { kind: 'premise', id: tok.id }
      case 'agg': return { kind: 'agg', raw: tok.value }
      case 'path': return { kind: 'path', segments: tok.value.split('.'), isRoot: ROOT_RE.test(tok.value) }
      default:
        throw new Error(`Condition expression is invalid: unexpected token '${(tok as any).value ?? tok.type}'`)
    }
  }
}

// ============ 值解析（resolveValue 语义移植，行为逐条对齐旧引擎）============

function getDefaultValue(): any { return 0 }

function resolvePath(node: PathNode, ctx: GameContext): any {
  const parts = node.segments
  let current: any = ctx

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (current === null || current === undefined) return getDefaultValue()

    if (i === 0) {
      if (part === 'player') { current = ctx.player; continue }
      if (part === 'location') { current = ctx.location; continue }
      if (part === 'game') { current = { time: ctx.time, mode: ctx.mode }; continue }
      if (part === 'inventory') { current = (ctx.player as any)?.inventory ?? []; continue }
      if (part === 'character') {
        const charId = parts[i + 1]
        current = ctx.getEntity('character', charId)
        i++
        continue
      }
      if (part === 'selected' || part === 'target') {
        if (!ctx.selectedCharacterId) return undefined
        current = ctx.getEntity('character', ctx.selectedCharacterId)
        if (!current) return undefined
        continue
      }
    }

    if (Array.isArray(current)) {
      const remaining = parts.slice(i)
      const idx = parseInt(remaining[0])
      const isNumIdx = !isNaN(idx) && String(idx) === remaining[0]
      if (isNumIdx) {
        if (remaining.length === 1) return current[idx] ?? getDefaultValue()
        current = current[idx]
        if (current === undefined) return getDefaultValue()
        continue
      }
      if (remaining.length === 1) {
        const first = current[0]
        if (first && typeof first === 'object') {
          return current.some((item: any) => item?.id === remaining[0] || item?.itemId === remaining[0])
        }
        return current.includes(remaining[0])
      }
      const found = current.find((item: any) =>
        typeof item === 'object' && item !== null && (item.id === remaining[0] || item.itemId === remaining[0])
      )
      if (found) { current = found; continue }
      return false
    }

    if (typeof current === 'object' && current !== null) {
      if (part in current) {
        current = current[part]
      } else {
        const agg = extractAggregatePart(part)
        if (agg) return evaluateRelationAggregate(agg.kind, current, agg.args, ctx)
        if (ctx.fieldAliases?.[part]) {
          if (ctx.fieldAliases[part] in current) {
            current = current[ctx.fieldAliases[part]]
          } else {
            return undefined
          }
        } else if ('base' in current && typeof current.base === 'object') {
          current = getEntityAttr(current, part)
        } else {
          return getDefaultValue()
        }
      }
    } else {
      return getDefaultValue()
    }
  }

  if (current === null || current === undefined) return undefined
  if (typeof current === 'object') {
    if (typeof (current as any).level === 'number' && 'xp' in current) return (current as any).level
    if ('remaining_duration' in current && 'stack' in current) return true
  }
  return current
}

function extractAggregatePart(part: string): { kind: 'any' | 'any_positive' | 'any_negative'; args: string[] } | null {
  const m = part.match(/^(any|any_positive|any_negative)(?:\(([^)]*)\))?$/)
  if (!m) return null
  const kind = m[1] as 'any' | 'any_positive' | 'any_negative'
  const raw = m[2] ?? ''
  const args = raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : []
  return { kind, args }
}

function evaluateRelationAggregate(
  kind: 'any' | 'any_positive' | 'any_negative',
  current: Record<string, any>,
  args: string[],
  ctx: GameContext,
): boolean {
  const typeNames: string[] = []
  for (const item of args) {
    if (item.startsWith('group:')) {
      const groupTypes = ctx.relationGroups?.[item.slice('group:'.length)] ?? []
      typeNames.push(...groupTypes)
    } else {
      typeNames.push(item)
    }
  }
  const values = (typeNames.length > 0 ? typeNames : Object.keys(current))
    .map(t => current[t])
    .filter(v => v !== undefined)
  if (kind === 'any') return values.length > 0
  if (kind === 'any_positive') return values.some(v => v === 1)
  return values.some(v => v === -1)
}

// 聚合段节点：把 raw 还原为路径段（由调用方拼回完整路径求值）
// 求值入口见 evaluateNode 的 agg 分支：把整个表达式路径的"当前对象"传进 evaluateRelationAggregate

// ============ 求值 ============

const OPS = ['>=', '<=', '!=', '==', '>', '<']

function compare(leftVal: any, op: string, right: LitNode | PathNode, rightRaw: string, ctx: GameContext): boolean {
  // right 求值：右值字面量优先（'true'/'false'/null/undefined/字符串/数字）
  if (right.kind === 'lit') {
    const rv = right.value
    if (typeof rv === 'string') {
      switch (op) {
        case '==': return leftVal === rv
        case '!=': return leftVal !== rv
        default: throw new Error(`Operator '${op}' cannot be applied to string comparison`)
      }
    }
    if (typeof rv === 'boolean') {
      if (rv === true) return op === '==' ? leftVal === true : (op === '!=' ? leftVal !== true : false)
      const isFalsey = leftVal === false || leftVal === undefined || leftVal === null
      return op === '==' ? isFalsey : (op === '!=' ? !isFalsey : false)
    }
    if (rv === null) {
      const isMissing = leftVal === null || leftVal === undefined
      switch (op) {
        case '==': return isMissing
        case '!=': return !isMissing
        default: throw new Error(`Operator '${op}' cannot be applied to null check`)
      }
    }
    // 数字
    const leftNum = typeof leftVal === 'number' ? leftVal : 0
    switch (op) {
      case '>': return leftNum > rv
      case '<': return leftNum < rv
      case '>=': return leftNum >= rv
      case '<=': return leftNum <= rv
      case '==': return leftNum === rv
      case '!=': return leftNum !== rv
    }
  }
  throw new Error(`Right-hand value cannot be compared in this position`)
}

function truthy(val: any): boolean { return !!val }

function evaluateNode(node: ExprNode, ctx: GameContext): any {
  switch (node.kind) {
    case 'bool': {
      const l = evaluateNode(node.left, ctx)
      if (node.op === '&&') return truthy(l) ? truthy(evaluateNode(node.right, ctx)) : false
      return truthy(l) ? true : truthy(evaluateNode(node.right, ctx))
    }
    case 'not': return !truthy(evaluateNode(node.child, ctx))
    case 'lit': return node.value
    case 'premise': return evaluatePremiseRaw(node.id, ctx)
    case 'path': {
      const val = resolvePath(node, ctx)
      if (!node.isRoot) {
        // 非根形态必须出现在比较中（parser 层面：单独出现的非根路径 → 抛错）
        throw new Error(`Condition expression '${node.segments.join('.')}' is invalid: no valid operator found`)
      }
      return val
    }
    case 'cmp': {
      const leftVal = evaluateOperand(node.left, ctx)
      const rightVal = evaluateOperand(node.right, ctx)
      // 右值特殊字面量（null/undefined/true/false/字符串）走 compare 的字面量分支
      return compare(leftVal, node.op, node.right, undefined as any, ctx)
    }
    case 'agg': throw new Error('agg node must be resolved within a path context')
  }
}
```

**说明（实现要点）：**
- 上方代码是架构骨架 + 语义核心；`evaluateOperand`（把 operand 节点求值为值，路径节点返回 resolvePath 结果、agg 段由调用路径上下文求值）与 `compare` 的右值分支需与旧 `evalSimple` 逐分支对齐（右值 `true`/`false`/`null`/`undefined`/字符串/数字各分支，左值字面量 `(true && true) == true` 场景：`left` 若是 bool 节点则先求值）
- `evaluatePremiseRaw` / `evaluatePremiseValue` / `evaluate` / `clear` / AST 缓存（`Map<string, ExprNode>`）在 Task 2 填充完整注册表后实现；本任务先让语义测试全绿（premise 用例在 Task 2 补）
- **agg 段求值**：`character.{A}.relations.{B}.any(group:血亲)` 的 token 流为 `path(character,A,relations,B)` + `agg(any(group:血亲))`，求值时把 agg 段拼入当前路径对象（实现：resolvePath 遇到后续 agg 段时在"当前对象是 relations[对方] 对象"处调用 evaluateRelationAggregate）；测试 `example-mod-integration.test.ts:127` 与 `condition-registry.test.ts` 的聚合用例是验收标准
- 裸路径求值（`!player.hp`、`player.不存在的属性`）与 `selected != null` 存在性语义依赖 resolvePath 的 `undefined` 返回，compare 的 null 分支处理

---

### Task 2: 前提注册表并入 + 命名引用求值

**Files:**
- Modify: `src/core/condition-engine.ts`（注册表、`evaluatePremiseRaw`、`getPremiseValue`、`evaluatePremises`、`clear`、AST 缓存、TOML 前提注册）
- Modify: `src/core/condition-engine.test.ts`（新增前提用例）

**Interfaces:**
- Produces:
  - `conditionEngine.registerPremise(id: string, handler: (ctx: GameContext) => boolean | number): void`（大小写不敏感、后注册覆盖、与旧 PremiseRegistry 语义一致）
  - `conditionEngine.registerPremiseFromExpression(id: string, expr: string): void`（TOML 前提：编译 AST 存为 handler 闭包）
  - `conditionEngine.getPremiseValue(id: string, ctx: GameContext): boolean | number`（权重场景取原始值；未知 → throw）
  - `conditionEngine.evaluatePremises(ids: string[], ctx: GameContext): boolean`（数组简写：全部 truthy；空数组 → true）
  - `conditionEngine.getRegisteredPremiseIds(): string[]`（校验用，替代旧 `getRegisteredIds`）
  - `conditionEngine.clear(): void`（清 AST 缓存 + 前提表 + 循环引用检测缓存）
  - `evaluate(expr: string, ctx: GameContext): boolean`——最终版：`premise(X)` 未知前提 → 抛错（严格），`X` 空 → 抛错
- Consumes: Task 1 的 tokenizer/parser

- [ ] **Step 1: 写失败测试**（追加到 `condition-engine.test.ts`）：
  - `conditionEngine.registerPremise('NOT_H', () => true)` → `evaluate('premise(NOT_H) && player.hp < 100', ctx)` === true；`registerPremise('not_h', () => false)` 覆盖后（大小写不敏感）→ false
  - `evaluate('premise(UNKNOWN) == true', ctx)` → toThrow
  - `evaluatePremises(['NOT_H', 'HAVE_TARGET'], ctx)` === 全部 handler 结果 &&；空数组 → true
  - `getPremiseValue('HIGH_5', ctx)` 返回 handler 原始返回值（`() => 5` → 5；`() => true` → true）
  - number 返回：`registerPremise('N', () => 2)` → `evaluate('premise(N) >= 1', ctx)` === true（>0 即 truthy 语义）
  - `registerPremiseFromExpression('CLOUD_SECT', 'location.id == "sect"')` → `evaluate('premise(CLOUD_SECT)', ctx)` === true
  - 循环引用：`registerPremiseFromExpression('A', 'premise(B)')` + `registerPremiseFromExpression('B', 'premise(A)')` → 注册时 toThrow 或求值时 toThrow（选求值时抛——运行时检测更简单：调用栈深度守卫，计划采用**注册时检测**：注册 A 时其表达式引用的前提若未注册 → warning 记录，求值时未知 → 抛错兜底）
- [ ] **Step 2: 运行确认失败**
- [ ] **Step 3: 实现**——注册表 `Map<string, PremiseHandler>`（`lower(id)` 为键）；`evaluatePremiseRaw(id, ctx)`：查表 → 未注册 throw `Premise 'X' is not registered` → 调用 handler(ctx)（try/catch 不吞——错误上抛给调用方去重上报逻辑）；`clear()` 清表+缓存；AST 缓存：`private cache = new Map<string, ExprNode>()`，`evaluate` 先查缓存再 parse；`evaluate` 最终返回 `truthy(evaluateNode(parsed, ctx))`（保持 boolean 返回契约）
- [ ] **Step 4: 运行确认通过**：`npx vitest run src/core/condition-engine.test.ts`
- [ ] **Step 5: 旧 condition.test.ts 退役**——删除 `src/core/condition.test.ts`（语义已全量迁移），`git rm`
- [ ] **Step 6: Commit**：`git add -A && git commit -m "feat(core): 前提注册表并入 condition-engine（premise(X) 命名引用/TOML 前提/严格求值）"`

---

### Task 3: 消费方迁移 evaluateCondition → conditionEngine.evaluate

**Files:**（全部 `import { evaluateCondition } from ...` → `import { conditionEngine } from ...`，调用改 `conditionEngine.evaluate(...)`；这些文件里同时删掉各自的 `premises:` 前缀兼容逻辑——Task 8 处理，本任务只换 evaluate 入口）
- Modify: `src/core/random-event.ts:11,114`
- Modify: `src/core/spawn-system.ts:7,39`
- Modify: `src/core/talent-utils.ts:4,63,115`
- Modify: `src/plugins/dialogue-system/index.ts:15,184,192,343`
- Modify: `src/plugins/effect-system/index.ts:14,265`
- Modify: `src/plugins/h-core/settle/judge.ts:18,72`
- Modify: `src/plugins/h-npc-ai/active-h.ts:19,92-94`
- Modify: `src/plugins/h-npc-ai/filter.ts:19,98`
- Modify: `src/plugins/map-system/index.ts:13,55,99`
- Modify: `src/plugins/npc-ai-system/target-search.ts:13,115`
- Modify: `src/plugins/quest-system/index.ts:15,329`
- Modify: `src/plugins/talk-common-system/engine.ts:2,136`
- Modify: `src/ui/utils/command-eval.ts:8,40`
- Modify: `src/core/command-executor.ts:61,106,110-115`（接口字段名 `evaluateCondition` 保留——注入语义不变，实现方换）
- Modify: `src/core/condition-registry.test.ts`、`src/core/character-contract.test.ts`、`src/plugins/*.test.ts` 中所有 `import { evaluateCondition }`（测试）
- Delete: `src/core/condition.ts`
- Delete: `src/core/premise-registry.ts`（Task 5 完成 getWeight/getWeightSum 下沉后再删——**本任务先保留**，避免中间态损坏 npc-ai/talk-common/random-event）

**Interfaces:**
- Consumes: Task 1/2 的 `conditionEngine.evaluate(expr, ctx)`（签名与旧 `evaluateCondition` 完全一致）

- [ ] **Step 1: 机械替换**：所有列出的 import/调用改为 `conditionEngine.evaluate`。用搜索确认零残留：`grep -rn "evaluateCondition" src --include="*.ts"` 只剩 `command-executor.ts` 的接口字段名（注入语义）与 `command-eval.ts` 的导出包装名（`evaluateCondition: evalCondition`——字段名可保留，实现换 conditionEngine）
- [ ] **Step 2: 跑全量测试**：`npm run test` → 全绿（premise-registry 相关测试仍在，Task 5 迁移）
- [ ] **Step 3: 删除 `src/core/condition.ts`**
- [ ] **Step 4: Commit**：`git add -A && git commit -m "refactor(core): 全消费方迁移到 conditionEngine.evaluate，删除旧 condition.ts"`

---

## P2 消费方迁移

### Task 4: talk-common 权重选择器重写（getWeight 下沉）

**Files:**
- Modify: `src/plugins/dialogue-system/index.ts:301-352`（`pickWeightedLine` 的 `premises:` 分支 + `getWeight` 调用）

**Interfaces:**
- Consumes: `conditionEngine.evaluatePremises(ids, ctx)`、`conditionEngine.evaluate(expr, ctx)`
- Produces: 本地函数 `weightAllToOne(premiseList: string[], ctx: GameContext): number`（erArk `weight_all_to_1` 语义）：空集 → 1；任一前提不满足 → 0；`high_N` → +N；其余满足 → +1（high_ 判断用 `lower.startsWith('high_')`）

- [ ] **Step 1: 写失败测试**——迁移 `src/plugins/dialogue-weight.test.ts` 的 getWeight 用例到新语义：`pickWeightedLine` 仍按 `high_5 + 满足前提数` 选权重（现有用例 54-115 行断言不变，只换实现）
- [ ] **Step 2: 实现**——`pickWeightedLine` 中：`premiseList` 分支改为 `conditionEngine.evaluatePremises(premiseList, premiseCtx)`（非严格参数删除——未知前提由加载期校验拦截）+ `weightAllToOne(premiseList, premiseCtx)`；纯表达式分支换 `conditionEngine.evaluate`（Task 3 已做）；`premises:` 前缀检测（330 行 `cond.startsWith('premises:')`）删除——**本分支整体删除**（数据迁移后无此格式；迁移在 Task 10 完成前，此处删除会先破坏存量数据——**顺序调整：Task 4 保留分支但内部改新引擎求值，Task 10 数据迁移完成后 Task 4b 删除分支**）
- [ ] **Step 2b: 说明**——计划执行顺序：本任务实现 `weightAllToOne` 并替换 `premiseRegistry.getWeight` 调用；`premises:` 分支删除推迟到 Task 10 之后（Task 10b）
- [ ] **Step 3: 跑测试**：`npx vitest run src/plugins/dialogue-weight.test.ts src/plugins/talk-common-behavior.test.ts src/plugins/talk-common-system/engine.test.ts`
- [ ] **Step 4: Commit**：`git commit -m "refactor(dialogue): getWeight 下沉为 weightAllToOne（high_N 规则移出 core）"`

---

### Task 5: npc-ai target-search 与 random-event 权重求和下沉（getWeightSum 删除）

**Files:**
- Modify: `src/plugins/npc-ai-system/target-search.ts:46-84`（`buildPremiseCtx`/`evalPremiseSum`）
- Modify: `src/core/random-event.ts:105-140,163`（`premiseCtx`/getWeightSum 调用）
- Modify: `src/plugins/npc-ai-system/premise/ai.ts:26-28`（`charOf(ctx) = ctx?.sourceId` → handler 上下文变为 GameContext，`charOf` 改为 `ctx.sourceId ?? ctx.selectedCharacterId`——sourceId 现在从构造的 ctx 注入）
- Delete: `src/core/premise-registry.ts`
- Modify: 所有 `import { premiseRegistry } from '../core/premise-registry'` 的测试（dialogue-weight.test.ts、follow-system.test.ts、talk-common-behavior.test.ts、talk-common-data.test.ts、target-search.test.ts、example-mod-integration.test.ts、chain-flow.test.ts、boot-smoke.test.ts、h-group-sex/index.test.ts、phase-h-integration.test.ts、random-event.test.ts、character-contract.test.ts）→ 换 `conditionEngine`

**Interfaces:**
- Consumes: `conditionEngine.getPremiseValue(id, ctx)`、`conditionEngine.getRegisteredPremiseIds()`、`conditionEngine.evaluatePremises`
- Produces: target-search 本地求和函数：`sumPremiseWeight(premises: string[], charId: string, cache: Map<string, number>): number`——对每个前提 `getPremiseValue`（unknown → 抛错由去重上报兜底；boolean → 1；number → 原值）；随机事件同款本地实现

- [ ] **Step 1: 重写 target-search**：`buildPremiseCtx(charId)` 改为 `{ ...gameContext.getContext(), sourceId: charId, selectedCharacterId: charId }`；`evalPremiseSum` 内 `premiseRegistry.getWeightSum([premise], ctx, true)` → `conditionEngine.getPremiseValue(premise, ctx)` 数值化（boolean→1）；未注册检测改用 `conditionEngine.getRegisteredPremiseIds()`；round 内缓存保留（`premiseCache`）
- [ ] **Step 2: 重写 random-event**：`premiseRegistry.getWeightSum(d.premises ?? [], this.premiseCtx(ctx), true)` → 本地求和（同上模式）
- [ ] **Step 3: 删 `src/core/premise-registry.ts`**，全部测试迁移到 `conditionEngine`（register→registerPremise、evaluate→evaluatePremises、getRegisteredIds→getRegisteredPremiseIds、getWeightSum 用例→断言 `getPremiseValue` 数值化）
- [ ] **Step 4: 跑全量测试**：`npm run test` 全绿
- [ ] **Step 5: Commit**：`git commit -m "refactor(core): 删除 premise-registry，权重求和下沉 target-search/random-event（erArk 语义移出 core）"`

---

### Task 6: 注册点迁移（registerPremise → conditionEngine + engine API）

**Files:**
- Modify: `src/core/api.ts`（`registerEngineAPI` 增加 `premises.register`/`premises.evaluate`/`premises.getRegisteredIds`——实现转调 conditionEngine）
- Modify: `src/plugins/h-core/index.ts:1022-1025`（`registerPremise`/`evaluatePremises` API 改为转调 engine 命名空间或直接 conditionEngine）
- Modify: `src/plugins/h-core/premise/*.ts` 6 个文件（`registerXxxPremises(registry: any)` 签名参数保持，调用处传 `conditionEngine`——**签名保留 `registry: any` 参数**，调用方 h-core onEnable 传 conditionEngine，测试文件同步改传参）
- Modify: `src/plugins/follow-system/premise/follow.ts:20`（`ctx.sourceId ?? gameContext.getContext().player?.id` → handler 上下文已含 sourceId，直接 `ctx.sourceId ?? ctx.player?.id`）
- Modify: `src/plugins/h-ejaculation/index.ts:294-316`（`pl_penis_*` 闭包读全局 → 改吃 ctx；`jj_${size}` 的 `ctx?.actorId ?? '0'` 裂缝 → `ctx.sourceId`）
- Modify: `src/plugins/h-time-stop/index.ts:35-36`
- Modify: `src/plugins/npc-ai-system/premise/ai.ts:31-104`（全部 handler 收 GameContext：`AI_NIGHT`/`AI_DAY`/`AI_ENTERTAINMENT_TIME` 的 `gameContext.getContext().time.hour` → `ctx.time.hour`；`charOf` 改 `ctx.sourceId ?? ctx.selectedCharacterId`）
- Modify: `src/plugins/h-group-sex/index.ts:277-424`（前提注册 helper 改 conditionEngine）
- Modify: `src/plugins/h-hidden/index.ts`、`src/plugins/h-bondage/index.ts`（如有 registerPremise 调用，grep 确认）
- Modify: 各测试文件的 premise 注册（register → conditionEngine.registerPremise）

**Interfaces:**
- Consumes: Task 2 的 `conditionEngine.registerPremise(id, handler: (ctx: GameContext) => boolean | number)`
- Produces: `ctx.api.call('engine', 'premises.register', id, handler)` 对外可用（mod 插件注册前提不再依赖 h-core）

- [ ] **Step 1: 全局 grep**：`premiseRegistry.register` / `registerPremise` 全部调用点清单（预计 ~15 文件），逐文件迁移
- [ ] **Step 2: h-core premise 6 文件**：`registerXxxPremises(registry: any)` 内部调用改 `registry.register(...)` → 保持签名，h-core index.ts 调用处传 `conditionEngine`（测试文件 `talk-common-data.test.ts` 的 `registerHPremises(premiseRegistry)` 改 `registerHPremises(conditionEngine)`）
- [ ] **Step 3: 其余注册点**：逐个迁移 handler 上下文（`(ctx: any)` → 使用 GameContext 字段），删除闭包 import 的 gameContext 全局读取
- [ ] **Step 4: engine API 注册**：api.ts `registerEngineAPI` 加 `premises: { register, evaluate, getRegisteredIds }`
- [ ] **Step 5: 全量测试**：`npm run test` 全绿；`npm run typecheck` 通过
- [ ] **Step 6: Commit**：`git commit -m "refactor(plugins): 前提注册迁移到 conditionEngine + engine API（mod 插件不再依赖 h-core）"`

---

### Task 7: 校验升级（未注册前提 error + 注销；premise(X) 参数校验）

**Files:**
- Modify: `src/plugins/instruction-loader.ts:85-136`（validateInstructionData：premises 未注册 warning → **error + 注销指令**；`raw.condition` 的 validateExpression 已覆盖 `premise(X)`——补参数校验）
- Modify: `src/core/condition-registry.ts`（`validateExpression` 支持 `premise(X)` 参数校验：提取 premise 引用 → 与 conditionEngine.getRegisteredPremiseIds 比对；`validatePremise(id): boolean` 新方法；`extractFieldPaths` 对 `premise(...)` 段跳过路径提取）
- Modify: `src/plugins/h-npc-ai/filter.ts:87-102`（passesPremises 的 `premiseRegistry.evaluate(..., false)` → `conditionEngine.evaluatePremises(ids, gc)`——非严格参数消失）
- Modify: `src/ui/utils/command-eval.ts:27-44`（evalPremises 换 conditionEngine；`premises:` 前缀分支保留到 Task 10b 后删）
- Modify: `src/plugins/dialogue-system/index.ts`（Task 4b 一并处理）

**Interfaces:**
- Consumes: `conditionEngine.getRegisteredPremiseIds()`
- Produces: `conditionRegistry.validatePremise(id: string): boolean`、`conditionRegistry.validateExpression` 的返回值不变 `{ok, unknown}`（unknown 含未注册前提名）

- [ ] **Step 1: condition-registry 扩展**——`validateExpression` 提取 `premise(X)` 引用（新正则 `/(?:^|[^a-z])premise\(([^)]*)\)/gi` 或复用保护函数）→ 每个 X 与 `conditionEngine.getRegisteredPremiseIds()` 比对 → 未注册加入 unknown
- [ ] **Step 2: instruction-loader 升级**——`premises` 数组：未注册 → `severity: 'error'` + 注销指令（同 condition 分支逻辑，`commandRegistry.getById(raw.id)?.source === 'instructions'` 时 unregister）；条件校验错误消息措辞区分"未注册前提"与"未注册字段"
- [ ] **Step 3: 运行时严格化**——filter.ts/command-eval.ts/dialogue-system 的非严格调用全部去除 strict 参数
- [ ] **Step 4: 测试**——新增：未注册前提指令 → errorReporter error + 指令被注销；`validateExpression('premise(UNKNOWN) == true')` → `ok: false`；注册后 → `ok: true`。跑 `npm run test`
- [ ] **Step 5: Commit**：`git commit -m "feat(validation): 未注册前提升 error+注销，premise(X) 参数校验，运行时统一严格"`

---

### Task 8: `premises:` 前缀兼容代码删除（数据迁移后执行——本任务为删除点登记）

**Files:**
- Modify: `src/ui/utils/command-eval.ts:34-38`（`expr.startsWith('premises:')` 分支删除）
- Modify: `src/plugins/dialogue-system/index.ts:330-341`（premiseList 分支整体删除——Talk-common 数据迁移后此分支不再可达）
- Modify: `src/plugins/talk-common-system/engine.ts`（如含前缀处理，grep 确认）

**依赖**：Task 10（数据迁移）完成之后执行。执行验证：`grep -rn "premises:" src mods --include="*.ts" --include="*.toml"` 零残留（除文档）。

---

## P3 数据迁移

### Task 9: `premises:` 前缀批量迁移脚本（169,031 处）

**Files:**
- Create: `scripts/migrate-premises-prefix.cjs`
- Modify: `src/plugins/talk-common-system/data/default/talk-common/**/*.toml`（165 文件，由脚本改写）
- Modify: `mods/*/definitions/**/*.toml`（如有存量，脚本覆盖全仓库 TOML 扫描）
- Test: `src/plugins/talk-common-data.test.ts`（迁移后全量校验仍绿）

**转换规则**（`conditions = "..."` 字符串内容）：
1. 保护 `&&`（占位符替换）——单 `&` 切分时不被误切
2. 按单 `&` 切分段
3. 每段：`premises:X` 前缀 → `premise(X)`；否则为表达式片段 → 原样保留
4. 用 `&&` 重组
5. 前提 ID 含 `|`（如 `CVP_A2_T|102_E_1`）原样保留（`premise(CVP_A2_T|102_E_1)`）
6. 未带 `premises:` 前缀的段保持原样（已是纯表达式）

**脚本完整实现**：

```javascript
// scripts/migrate-premises-prefix.cjs
// 一次性迁移：conditions = "premises:A&B&expr..." → conditions = "premise(A) && premise(B) && (expr...)"
// 用法：node scripts/migrate-premises-prefix.cjs [--write]
const fs = require('fs')
const path = require('path')

const TARGET_DIRS = [
  'src/plugins/talk-common-system/data/default',
  'mods',
]

function convertCondition(cond) {
  if (!cond.includes('premises:')) return cond
  // 1. 保护 &&
  const andPlaceholders = []
  const protectedStr = cond.replace(/&&/g, () => {
    const idx = andPlaceholders.length
    andPlaceholders.push('&&')
    return `\u0001A${idx}\u0001`
  })
  // 2. 按单 & 切分（保护后剩下的 & 都是单字符分隔）
  const parts = protectedStr.split('&').map(s => s.trim()).filter(Boolean)
  const converted = parts.map(part => {
    if (part.startsWith('premises:')) {
      return `premise(${part.slice('premises:'.length).trim()})`
    }
    return part
  })
  // 3. 还原 && 并重组
  const joined = converted.join(' && ')
  return joined.replace(/\u0001A(\d+)\u0001/g, (_m, i) => andPlaceholders[Number(i)])
}

function processFile(file) {
  const raw = fs.readFileSync(file, 'utf8')
  let changed = 0
  const lines = raw.split('\n')
  const out = lines.map(line => {
    const m = line.match(/^(\s*conditions\s*=\s*")(.*)("\s*)$/)
    if (!m) return line
    // 处理转义引号（TOML 字符串内 \\" 场景极少，出现则跳过该行保守处理）
    if (m[2].includes('\\"')) return line
    const converted = convertCondition(m[2])
    if (converted === m[2]) return line
    changed++
    return `${m[1]}${converted}${m[3]}`
  })
  if (changed > 0) {
    fs.writeFileSync(file, out.join('\n'), 'utf8')
  }
  return changed
}

function scan(dir, acc) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) scan(full, acc)
    else if (entry.name.endsWith('.toml')) acc.push(full)
  }
  return acc
}

const write = process.argv.includes('--write')
let total = 0
for (const dir of TARGET_DIRS) {
  if (!fs.existsSync(dir)) continue
  for (const file of scan(dir, [])) {
    if (!write) {
      const raw = fs.readFileSync(file, 'utf8')
      const hits = (raw.match(/premises:/g) || []).length
      if (hits > 0) { total += hits; console.log(`${hits}\t${file}`) }
    } else {
      total += processFile(file)
    }
  }
}
console.log(`total: ${total}${write ? ' (written)' : ' (dry run — rerun with --write)'}`)
```

- [ ] **Step 1: 写脚本**（上方代码）
- [ ] **Step 2: 干跑**：`node scripts/migrate-premises-prefix.cjs` → 确认 total ≈ 169,031，检查输出文件清单无异常（先读几个文件人工核对转换正确性：纯前提、混合式、含 `|` 前提 ID、含 `&&` 的表达式段）
- [ ] **Step 3: 写回**：`node scripts/migrate-premises-prefix.cjs --write`
- [ ] **Step 4: 抽样验证**：git diff 抽查 5 个文件（混合式必须转换正确：`selected.abilities.舌技.level > 3&premises:target_is_player_daughter` → `selected.abilities.舌技.level > 3 && premise(target_is_player_daughter)`）
- [ ] **Step 5: 全量校验**：`npm run validate` + `npx vitest run src/plugins/talk-common-data.test.ts src/plugins/talk-common-behavior.test.ts`——talk-common-data.test 的 collectConditions 需同步更新（其 `conditions` 提取逻辑不变，但校验调用改 `conditionEngine`）
- [ ] **Step 6: Commit**：`git add -A && git commit -m "feat(data): 迁移 169K 处 premises: 前缀为 premise() 语法"`

---

### Task 10: 数据迁移收尾（premises: 分支删除 + 文档层 grep 清零）

**Files:**
- Modify: `src/ui/utils/command-eval.ts`、`src/plugins/dialogue-system/index.ts`、`src/plugins/talk-common-system/engine.ts`（Task 8 登记的删除点）
- Modify: `docs/talk-common-system.md:74-133`、`docs/dialogue-format.md`、`docs/talent-system.md:119`（旧语法示例改为 `premise()`）

- [ ] **Step 1: 删除前缀兼容分支**（Task 8 的代码删除点）
- [ ] **Step 2: grep 清零**：`grep -rn "premises:" src mods --include="*.ts" --include="*.toml"` → 仅剩脚本文件（`scripts/migrate-premises-prefix.cjs` 内字符串是转换规则本体，允许保留并注释"一次性脚本"）与文档
- [ ] **Step 3: 文档示例同步**（talk-common-system.md 等改 `premises:high_1&sys_0` → `premise(high_1) && premise(sys_0)`，数组写法 `premises = [...]` 不变）
- [ ] **Step 4: 全量测试**：`npm run test` 全绿
- [ ] **Step 5: Commit**：`git commit -m "feat(data): 删除 premises: 前缀兼容代码与文档示例，语法唯一化"`

---

### Task 11: jj_ 数据审计与阴茎大小写入方（jj_0 1418 条修复——不简化）

**背景事实**（src/plugins/h-ejaculation/index.ts:303-316 注释）：`jj_0~3` 前提查角色阴茎大小属性，但全库无写入方（attributes.toml default=1）→ 恒 1 档 → jj_0 地文（约 1418 条）不可达、jj_1 错误常显。用户定案：**修，不准简化**（不允许改前提为恒 true/删除数据）。

**Files:**
- Modify: `src/plugins/h-ejaculation/index.ts:303-316`（jj_ 前提 handler 上下文修复，Task 6 已改 sourceId）
- Modify: `src/plugins/character-system`（角色创建/模板实例化时初始化阴茎大小——按 erArk 分布）
- Modify: `src/plugins/h-ejaculation/index.ts`（如 erArk 有阴茎大小成长逻辑，评估实现；无则只做初始化）
- Test: 新增 `src/plugins/h-ejaculation/jj-premise.test.ts`——随机初始化 1000 次，`jj_0`/`jj_1`/`jj_2`/`jj_3` 各档均出现；jj_0 前提在 0 档角色上通过

- [ ] **Step 1: 查 erArk 分布来源**：`复刻攻略-猥亵-H系统专用/` 与 `docs/instruction-replication/erark-attr-ledger.md` 中阴茎大小（jj_）的初始分布/成长规则（erArk 源代码 `handle_premise_other.py:1912-1966` 关联逻辑、角色出生属性表）
- [ ] **Step 2: 实现初始化**：角色创建/模板实例化管线中，阴茎大小按 erArk 分布随机初始化（找不到权威分布时采用保守分布：0 档小概率、1 档主流、2/3 档小概率，并在文档记录假设）
- [ ] **Step 3: 可达性测试**：jj-premise.test.ts 断言各档可达
- [ ] **Step 4: 审计数据**：`grep -c "jj_0" src/plugins/talk-common-system/data/default -r`（迁移后）确认 jj_0 引用数（≈1418），数据本身无需改写（前提语义修复后自然可达）
- [ ] **Step 5: 全量测试** + Commit：`git commit -m "feat(h-ejaculation): 阴茎大小初始化写入方（jj_0~3 前提各档可达）"`

---

## P4 文档

### Task 12: 文档全量同步

**Files:**
- Modify: `AGENTS.md`（§8 条件系统：新增"命名前提"小节——`premise(X)` 语法、`premises` 数组简写、TOML 前提定义、校验规则；§21 条件字典：premise 引用计入校验；§30 对话格式：condition 示例同步；§34 效果系统：无变化）
- Modify: `docs/premises.md`（改写为"前提 = 命名表达式"章节：注册/覆盖/TOML 定义/已注册清单保持；语法章节更新；删除 getWeight/getWeightSum 描述——改为"权重是消费方策略"）
- Modify: `docs/plugin-author-guide.md`（API 速查表：`engine.premises.register/evaluate/getRegisteredIds`；删除 h-core `registerPremise`；`evaluatePremises` 签名变化）
- Modify: `docs/talk-common-system.md`、`docs/dialogue-format.md`、`docs/talent-system.md`、`docs/character-schema.md`（前提相关行）、`docs/h-core.md`、`docs/random-event-system.md`、`docs/adr/0008-random-event-system.md`（D5 前提双通道描述更新）
- Modify: `docs/master-todo.md` 顶部参考索引（如需）

- [ ] **Step 1: AGENTS.md §8** 重写条件系统小节（含命名前提）
- [ ] **Step 2: premises.md** 改写
- [ ] **Step 3: plugin-author-guide.md** API 表对齐（铁律：与实际 `ctx.api.register()` 一致）
- [ ] **Step 4: 其余手册** 同步（grep `premises:` / `getWeight` / `premiseRegistry` 逐个清理）
- [ ] **Step 5: 验证**：`grep -rn "premises:" docs AGENTS.md --include="*.md"` 仅剩"旧语法（已移除）"说明性文字；`grep -rn "premiseRegistry\|getWeightSum" docs AGENTS.md --include="*.md"` 零残留
- [ ] **Step 6: Commit**：`git commit -m "docs: 条件引擎统一文档全量同步（AGENTS §8/premises/API 表/各手册）"`

---

## 最终验收

- [ ] `npm run test` 全绿（无 skipped 无修改语义的测试豁免）
- [ ] `npm run validate` 全绿（mod 数据校验）
- [ ] `npm run typecheck` 通过
- [ ] `grep -rn "premises:" src --include="*.ts"` 零残留（脚本文件除外）
- [ ] `grep -rn "premiseRegistry\|getWeight\|getWeightSum" src --include="*.ts"` 零残留
- [ ] `grep -rn "evaluateCondition" src --include="*.ts"` 仅剩 command-executor 接口字段名与 command-eval 导出包装名
- [ ] `src/core/` 下无 erArk 专属字符串（`high_`、`jj_`、`CVP`）
- [ ] 架构合规检查：`src/core/` 无具体玩法引用；插件间无直接 import
