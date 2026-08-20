// 条件引擎（condition-engine）——统一条件系统
// 职责：表达式 tokenize/parse（递归下降 → AST，Map 缓存）+ 命名前提注册表（premise(X) 命名引用）
// 语义来源：原 src/core/condition.ts（resolveValue 默认值/数组包含/别名/聚合/终端解包逐条对齐）
//   + src/core/premise-registry.ts（注册表，handler 返回 boolean|number）
// 铁律：core 不认知任何具体前提名/权重规则（high_ 等是消费方策略）；未知前提求值时抛错（校验层拦截）

import type { GameContext } from './types'
import { getEntityAttr } from './entity-utils'
import { apiSystem } from './api'

// ============ Tokenizer ============

type Token =
  | { type: 'path'; value: string; pos: number }
  | { type: 'string'; value: string; pos: number }
  | { type: 'number'; value: number; pos: number }
  | { type: 'bool'; value: boolean; pos: number }
  | { type: 'lit'; value: null | undefined; pos: number }
  | { type: 'op'; value: string; pos: number }
  | { type: 'not'; pos: number }
  | { type: 'lparen'; pos: number }
  | { type: 'rparen'; pos: number }
  | { type: 'premise'; id: string; pos: number }
  | { type: 'count'; path: string; pos: number }
  | { type: 'agg'; value: string; pos: number }

const MULTI_OPS = ['&&', '||', '==', '!=', '>=', '<=']
const SINGLE_OPS = ['>', '<']
const COMPARE_OPS = ['==', '!=', '>=', '<=', '>', '<']
const ARITH = new Set(['+', '-', '*', '/', '%'])

// 前置保护：premise(...)/count(...)/any(...) 括号参数不被当作逻辑括号 tokenize
function protectFunctions(src: string): { text: string; map: { name: string; args: string }[] } {
  const map: { name: string; args: string }[] = []
  const text = src.replace(/(premise|count|any|any_positive|any_negative)\(([^)]*)\)/g, (_m, name: string, args: string) => {
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

    if (ch === '\u0001') {
      const end = text.indexOf('\u0001', i + 1)
      if (end === -1) throwAt('unterminated placeholder', i)
      const entry = map[Number(text.slice(i + 1, end))]
      if (!entry) throwAt('bad placeholder index', i)
      if (entry.name === 'premise') {
        tokens.push({ type: 'premise', id: entry.args.trim(), pos: i })
      } else if (entry.name === 'count') {
        tokens.push({ type: 'count', path: entry.args.trim(), pos: i })
      } else {
        tokens.push({ type: 'agg', value: `${entry.name}(${entry.args})`, pos: i })
      }
      i = end + 1
      continue
    }

    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') { i++; continue }

    const multi = MULTI_OPS.find(op => text.startsWith(op, i))
    if (multi) { tokens.push({ type: 'op', value: multi, pos: i }); i += multi.length; continue }

    if (ch === '!') {
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
      throwAt('Arithmetic operators are not allowed in conditions; use condition_script for complex logic', i)
    }
    if (ch === '&' || ch === '|') {
      throwAt(`'${ch}' is not allowed; old 'premises:' prefix syntax was removed — use premise(X)`, i)
    }
    if (ch === ',') { i++; continue }

    // 路径 token：连续收集直到空白/运算符/括号/引号；聚合段边界（'.' + 占位符）——吃掉尾点后停止
    const start = i
    while (i < text.length) {
      const c = text[i]
      if (c === '.' && text[i + 1] === '\u0001') { i++; break }
      if (/[ \t\n\r<>=!()"'&|+\-*\/%,]/.test(c)) break
      i++
    }
    if (i === start) throwAt(`unexpected character '${ch}'`, i)
    // 聚合段边界处 i 已越过尾点：value 含尾点时去除（'.' 是段分隔符不是 token 内容）
    let value = text.slice(start, i)
    if (value.endsWith('.')) value = value.slice(0, -1)
    // 布尔/null 字面量识别（'true'/'false'/'null'/'undefined' 是保留字，不作路径解析）
    if (value === 'true' || value === 'false') {
      tokens.push({ type: 'bool', value: value === 'true', pos: start })
    } else if (value === 'null' || value === 'undefined') {
      tokens.push({ type: 'lit', value: null, pos: start })
    } else {
      if (value.includes(':')) {
        throwAt(`'${value}' contains ':' — old 'premises:' prefix syntax was removed; use premise(X)`, start)
      }
      tokens.push({ type: 'path', value, pos: start })
    }
  }
  return tokens
}

// ============ Parser（递归下降）============

interface PathNode { kind: 'path'; segments: string[]; isRoot: boolean }
interface LitNode { kind: 'lit'; value: any }
interface PremiseNode { kind: 'premise'; id: string }
interface CountNode { kind: 'count'; path: PathNode }
interface CmpNode { kind: 'cmp'; left: ExprNode; right: OperandNode; op: string }
interface BoolNode { kind: 'bool'; op: '&&' | '||'; left: ExprNode; right: ExprNode }
interface NotNode { kind: 'not'; child: ExprNode }

type OperandNode = PathNode | LitNode | PremiseNode | CountNode
type ExprNode = OperandNode | CmpNode | BoolNode | NotNode

const ROOT_RE = /^(player|selected|target|character|location|game|inventory|quest|event)(\.|$)/

class Parser {
  private tokens: Token[]
  private pos = 0

  constructor(tokens: Token[]) { this.tokens = tokens }

  parse(): ExprNode {
    const node = this.parseOr()
    if (this.pos < this.tokens.length) {
      const tok = this.peek()!
      throw new Error(
        `Condition expression is invalid: unexpected token '${tok.type === 'path' ? tok.value : tok.type}'`
      )
    }
    return node
  }

  private peek(): Token | undefined { return this.tokens[this.pos] }
  private next(): Token { return this.tokens[this.pos++] }

  private parseOr(): ExprNode {
    let left = this.parseAnd()
    while (true) {
      const t = this.peek()
      if (t?.type !== 'op' || t.value !== '||') break
      this.next()
      left = { kind: 'bool', op: '||', left, right: this.parseAnd() }
    }
    return left
  }

  private parseAnd(): ExprNode {
    let left = this.parseUnary()
    while (true) {
      const t = this.peek()
      if (t?.type !== 'op' || t.value !== '&&') break
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
    const prim = this.parsePrimary()
    // 比较运算可应用于分组/前提/字面量（如 (A && B) == true、premise(X) == 1）；
    // && / || 由 parseAnd/parseOr 消费，不在此处
    const opTok = this.peek()
    if (opTok?.type === 'op' && COMPARE_OPS.includes(opTok.value)) {
      this.next()
      const right = this.parseOperand()
      return { kind: 'cmp', left: prim, right, op: opTok.value }
    }
    return prim
  }

  private parsePrimary(): ExprNode {
    const tok = this.peek()
    if (!tok) throw new Error('Condition expression is invalid: unexpected end of expression')

    if (tok.type === 'lparen') {
      this.next()
      const inner = this.parseOr()
      if (this.peek()?.type !== 'rparen') {
        throw new Error('Condition expression is invalid: missing closing parenthesis')
      }
      this.next()
      return inner
    }

    const operand = this.parseOperand()
    // 无比较运算符的裸路径：仅根形态合法（与旧 evalSimple 裸路径分支一致）
    if (operand.kind === 'path' && !operand.isRoot && this.peek()?.type !== 'op') {
      throw new Error(`Condition expression '${operand.segments.join('.')}' is invalid: no valid operator found`)
    }
    return operand
  }

  private parseOperand(): OperandNode {
    // 注释：M-1——残缺表达式（"a =="）在比较右值处 token 耗尽 → next() 返回 undefined，
    // 原 switch (tok.type) 抛裸 TypeError；改为友好错误
    const tok = this.next()
    if (!tok) {
      throw new Error('Condition expression is invalid: unexpected end of expression (missing right-hand value)')
    }
    switch (tok.type) {
      case 'string': return { kind: 'lit', value: tok.value }
      case 'number': return { kind: 'lit', value: tok.value }
      case 'bool': return { kind: 'lit', value: tok.value }
      case 'lit': return { kind: 'lit', value: tok.value }
      case 'premise': return { kind: 'premise', id: tok.id }
      case 'count': {
        // count(path)：聚合计数 operand——参数必须是完整根路径（player/character.{id} 等），
        // 求值返回集合长度（数组 length / 对象键数；缺失 → 0）
        const node: CountNode = { kind: 'count', path: { kind: 'path', segments: tok.path.split('.'), isRoot: ROOT_RE.test(tok.path) } }
        const next = this.peek()
        if (next?.type === 'agg') {
          throw new Error('Condition expression is invalid: count() cannot be followed by an aggregate segment')
        }
        return node
      }
      case 'path': {
        const node: PathNode = { kind: 'path', segments: tok.value.split('.'), isRoot: ROOT_RE.test(tok.value) }
        // 聚合段合并：紧随 agg token（如 relations.y 后跟 any(group:血亲)）
        const next = this.peek()
        if (next?.type === 'agg') {
          this.next()
          node.segments.push(next.value)
        }
        return node
      }
      default:
        throw new Error(`Condition expression is invalid: unexpected token '${(tok as any).value ?? tok.type}'`)
    }
  }
}

// ============ AST 子表达式重排（2026-08-15 性能优化）============
// 原理：布尔交换律——&& / || 操作数交换不改变结果。求值时左操作数先行短路，
// 把"不含路径的子表达式"（premise/字面量，便宜）换到"含路径子表达式"（贵）之前，
// 前提失败即短路跳过路径求值（talk-common 数据常见 `path == X && premise(Y)` 形态）。
// 前提 handler 是纯函数（AGENTS 定义契约），重排不影响语义；`premise(X) == N` 比较结构不拆。
// ⚠️ 约束：handler 必须"只读 ctx + 不抛错"——若某前提未注册（抛错）或依赖求值次数/
// 顺序，重排会改变报告时机/调用次数（talk-common 消费方 catch 后结果等价，见等价性测试）。
// 全局受益：所有条件消费方（talk-common / npc-ai / random-event / quest / 指令）。

function containsPath(node: ExprNode): boolean {
  switch (node.kind) {
    case 'path':
    case 'count': return true
    case 'lit':
    case 'premise': return false
    case 'not': return containsPath(node.child)
    case 'cmp': return containsPath(node.left) || containsPath(node.right)
    case 'bool': return containsPath(node.left) || containsPath(node.right)
  }
}
function reorderBoolOperands(node: ExprNode): ExprNode {
  switch (node.kind) {
    case 'not':
      node.child = reorderBoolOperands(node.child)
      return node
    case 'cmp':
      node.left = reorderBoolOperands(node.left)
      node.right = reorderBoolOperands(node.right) as OperandNode
      return node
    case 'bool': {
      node.left = reorderBoolOperands(node.left)
      node.right = reorderBoolOperands(node.right)
      // 左含路径且右不含 → 交换（便宜在前，短路优先命中）
      if (containsPath(node.left) && !containsPath(node.right)) {
        const tmp = node.left
        node.left = node.right
        node.right = tmp
      }
      return node
    }
    default:
      return node
  }
}

// ============ 值解析（resolveValue 语义移植，行为逐条对齐旧引擎）============

// 注释：代理域注册表（2026-08-17 counter-system）——插件注册的条件根域：解析时整段转发
// 给插件 API（quest 域"core 特判 + apiSystem 转发"先例的通用化）。core 不认知域内具体
// 内容，只做路由；转发失败/未注册 → undefined（走默认值机制，不阻断求值）。
// 注册方：counter-system onEnable → registerProxyDomain('counters', 'counter-system', 'resolvePath')
const proxyDomains = new Map<string, { namespace: string; method: string }>()

export function registerProxyDomain(domain: string, namespace: string, method: string): void {
  proxyDomains.set(domain, { namespace, method })
}

function resolvePath(node: PathNode, ctx: GameContext): any {
  const parts = node.segments
  let current: any = ctx

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (current === null || current === undefined) return 0

    if (i === 0) {
      // 注释：代理域转发（counter-system 的 counters 根域等）——整段剩余路径交给插件求值
      const proxy = proxyDomains.get(part)
      if (proxy) {
        try {
          return apiSystem.callSync(proxy.namespace, proxy.method, parts.slice(i + 1), ctx)
        } catch {
          return undefined
        }
      }
      if (part === 'player') { current = ctx.player; continue }
      if (part === 'location') { current = ctx.location; continue }
      if (part === 'game') { current = { time: ctx.time, mode: ctx.mode }; continue }
      if (part === 'inventory') { current = (ctx.player as any)?.inventory ?? []; continue }
      // 注释：event 根域（gain-rule-system 事件触发规则用）——事件 payload 快照，
      // 条件可直接引用 event.character/event.partId 等；无 payload 时缺失返回默认值
      if (part === 'event') {
        current = (ctx as any).eventPayload
        if (current === null || current === undefined) return undefined
        continue
      }
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
      // 注释：C2——quest 域（任务状态/场景变量）——quest-system 未启用或场景不存在时
      // callSync 抛错 → 容错返回 undefined（走默认值机制，不阻断求值）
      if (part === 'quest') {
        // 注释：B-M-3（audit-b M-3）——段数/字段守卫——裸根（quest == 'active'）与
        // 未知字段段（quest.xxx.zzz）不再被当作 status 解析（原越界读取产生恒假
        // 字符串/undefined 的怪异语义；保持与加载期校验行为一致，返回 undefined）
        const sceneId = parts[i + 1]
        const field = parts[i + 2]
        if (field === 'status') {
          i += 2
          try {
            return apiSystem.callSync('quest', 'getSceneStatus', sceneId)
          } catch {
            return undefined
          }
        }
        if (field === 'var' && parts[i + 3] !== undefined) {
          const varKey = parts[i + 3]
          i += 3
          try {
            const v = apiSystem.callSync('quest', 'getVar', sceneId, varKey)
            return v ?? undefined
          } catch {
            return undefined
          }
        }
        return undefined
      }
    }

    if (Array.isArray(current)) {
      const remaining = parts.slice(i)
      const idx = parseInt(remaining[0])
      const isNumIdx = !isNaN(idx) && String(idx) === remaining[0]
      if (isNumIdx) {
        if (remaining.length === 1) return current[idx] ?? 0
        current = current[idx]
        if (current === undefined) return 0
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
        if (agg) {
          return evaluateRelationAggregate(agg.kind, current, agg.args, ctx)
        }
        if (ctx.fieldAliases?.[part]) {
          if (ctx.fieldAliases[part] in current) {
            current = current[ctx.fieldAliases[part]]
          } else {
            return undefined
          }
        } else if ('base' in current && typeof current.base === 'object') {
          current = getEntityAttr(current, part)
        } else {
          return 0
        }
      }
    } else {
      return 0
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

// ============ 比较与求值 ============

function compareValues(left: any, op: string, right: any): boolean {
  if (typeof right === 'string') {
    switch (op) {
      case '==': return left === right
      case '!=': return left !== right
      default: throw new Error(`Operator '${op}' cannot be applied to string comparison`)
    }
  }
  if (typeof right === 'boolean') {
    if (right === true) {
      return op === '==' ? left === true : (op === '!=' ? left !== true : false)
    }
    const isFalsey = left === false || left === undefined || left === null
    return op === '==' ? isFalsey : (op === '!=' ? !isFalsey : false)
  }
  if (right === null || right === undefined) {
    const isMissing = left === null || left === undefined
    switch (op) {
      case '==': return isMissing
      case '!=': return !isMissing
      default: throw new Error(`Operator '${op}' cannot be applied to null check`)
    }
  }
  if (typeof right === 'number') {
    const leftNum = typeof left === 'number' ? left : 0
    switch (op) {
      case '>': return leftNum > right
      case '<': return leftNum < right
      case '>=': return leftNum >= right
      case '<=': return leftNum <= right
      case '==': return leftNum === right
      case '!=': return leftNum !== right
    }
  }
  throw new Error(`Right-hand value of type '${typeof right}' cannot be compared`)
}

function truthy(val: any): boolean { return !!val }

// ============ 前提注册表 ============

type PremiseHandler = (ctx: GameContext) => boolean | number

// 模块级注册表（weightAllToOne 等模块函数共享；ConditionEngine 提供 API 封装）
const enginePremises = new Map<string, PremiseHandler>()

// 前提返回值 → 权重数字（boolean → 1/0；number → 原值）——
// 权重消费方（npc-ai target-search / random-event，erArk `now_weight += premise_judge`）通用规范化
export function premiseWeight(v: boolean | number): number {
  return typeof v === 'boolean' ? (v ? 1 : 0) : v
}

// 口上前提权重（erArk weight_all_to_1 语义，handle_premise/__init__.py:246-300）——
// 数据格式约定（与 any() 聚合同性质，core 提供机制、不认知具体前提名）：
//   high_N 前提 → 权重 +N；其余前提满足 → +1；任一不满足 → 0（整句淘汰）；空前提集 → 1
export function weightAllToOne(premiseList: string[], ctx: GameContext): number {
  if (!premiseList || premiseList.length === 0) return 1
  let weight = 0
  for (const id of premiseList) {
    const key = id.toLowerCase()
    const value = getPremiseValueInternal(id, ctx)
    const ok = typeof value === 'boolean' ? value : value > 0
    if (!ok) return 0
    if (key.startsWith('high_')) {
      const n = parseInt(key.slice(5), 10)
      weight += Number.isFinite(n) ? n : 1
    } else {
      weight += 1
    }
  }
  return weight
}

// 注释：从条件表达式中提取 premise(X) 命名引用（消费方做前提权重/校验用）
export function extractPremiseRefs(expr: string): string[] {
  const out: string[] = []
  const stripped = expr.replace(/"[^"]*"|'[^']*'/g, '')
  const re = /premise\(([^)]*)\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(stripped)) !== null) {
    const id = m[1].trim()
    if (id) out.push(id)
  }
  return out
}

function getPremiseValueInternal(id: string, ctx: GameContext): boolean | number {
  const handler = enginePremises.get(id.toLowerCase())
  if (!handler) throw new Error(`Premise '${id}' is not registered`)
  return handler(ctx)
}

class ConditionEngine {
  private astCache = new Map<string, ExprNode>()

  // 注释：A2 重排开关——等价性测试用（重排前后求值结果必须一致）
  reorderEnabled = true

  // 注册（大小写不敏感；后注册覆盖——mod override 设计特性）
  registerPremise(id: string, handler: PremiseHandler): void {
    enginePremises.set(id.toLowerCase(), handler)
  }

  // TOML 前提：命名表达式 → AST 闭包（循环引用由求时检测兜底：未知前提抛错）
  registerPremiseFromExpression(id: string, expr: string): void {
    const parsed = this.parse(expr)
    enginePremises.set(id.toLowerCase(), (ctx: GameContext) => this.evaluateNode(parsed, ctx))
  }

  getRegisteredPremiseIds(): string[] {
    return Array.from(enginePremises.keys())
  }

  // 单个前提原始求值（权重场景取数值用）；未知 → 抛错（严格——校验层拦截漏网）
  getPremiseValue(id: string, ctx: GameContext): boolean | number {
    return getPremiseValueInternal(id, ctx)
  }

  // premises 数组简写：全部 truthy（number > 0 即过）；空数组 → true
  evaluatePremises(ids: string[], ctx: GameContext): boolean {
    if (!ids || ids.length === 0) return true
    for (const id of ids) {
      const value = getPremiseValueInternal(id, ctx)
      if (typeof value === 'boolean' ? !value : !(value > 0)) return false
    }
    return true
  }

  clear(): void {
    enginePremises.clear()
    this.astCache.clear()
  }

  evaluate(expr: string, ctx: GameContext): boolean {
    return truthy(this.evaluateNode(this.parseCached(expr), ctx))
  }

  private parseCached(expr: string): ExprNode {
    const cached = this.astCache.get(expr)
    if (cached) return cached
    const parsed = this.parse(expr)
    this.astCache.set(expr, parsed)
    return parsed
  }

  private parse(expr: string): ExprNode {
    const tokens = tokenize(expr)
    let ast = new Parser(tokens).parse()
    if (this.reorderEnabled) ast = reorderBoolOperands(ast)
    return ast
  }

  // 注释：A4——加载期 AST 预热（talk-common loadFromData 后传全部去重条件，
  // 把首句口上的解析成本摊到加载期；解析失败跳过——运行时求值会正常上报）
  warm(exprs: Iterable<string>): void {
    for (const expr of exprs) {
      try {
        this.parseCached(expr)
      } catch {
        // 非法表达式运行时求值时报错（talk-common 有去重上报）
      }
    }
  }

  private evaluateNode(node: ExprNode, ctx: GameContext): any {
    switch (node.kind) {
      case 'bool': {
        const l = this.evaluateNode(node.left, ctx)
        if (node.op === '&&') return truthy(l) ? truthy(this.evaluateNode(node.right, ctx)) : false
        return truthy(l) ? true : truthy(this.evaluateNode(node.right, ctx))
      }
      case 'not': return !truthy(this.evaluateNode(node.child, ctx))
      case 'lit': return node.value
      case 'premise': return this.getPremiseValue(node.id, ctx)
      case 'count': {
        const val = resolvePath(node.path, ctx)
        if (val === null || val === undefined) return 0
        if (Array.isArray(val)) return val.length
        if (typeof val === 'object') return Object.keys(val).length
        return 0
      }
      case 'path': return resolvePath(node, ctx)
      case 'cmp': {
        const left = this.evaluateNode(node.left, ctx)
        const right = this.evaluateNode(node.right, ctx)
        return compareValues(left, node.op, right)
      }
    }
  }
}

export const conditionEngine = new ConditionEngine()
