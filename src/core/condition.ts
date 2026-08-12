import type { GameContext } from './types'
import { getEntityAttr } from './entity-utils'

function getDefaultValue(_parts: string[], _index: number): any {
  return 0
}

function resolveValue(path: string, ctx: GameContext): any {
  const parts = path.split('.')
  let current: any = ctx

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]

    if (current === null || current === undefined) {
      return getDefaultValue(parts, i)
    }

    // 注释：根路径（player/location/game/selected/target）只在路径首位生效，
    // 防止实体深层字段（如名为 player/location 的字段）被根路径遮蔽
    if (i === 0) {
      if (part === 'player') {
        current = ctx.player
        continue
      }

      if (part === 'location') {
        current = ctx.location
        continue
      }

      if (part === 'game') {
        // 注释：time + mode（B1 修复——game.mode 为模式栈栈顶，战斗门控条件取值源）
        current = { time: ctx.time, mode: ctx.mode }
        continue
      }

      // 注释：inventory 根 = 当前玩家背包的快捷路径（AGENTS §8：inventory.{物品ID}.count）
      // 直接进入背包数组（数组对象按 itemId 匹配），而非走实体跨命名空间查找
      if (part === 'inventory') {
        current = (ctx.player as any)?.inventory ?? []
        continue
      }

      if (part === 'character') {
        const charId = parts[i + 1]
        current = ctx.getEntity('character', charId)
        i++
        continue
      }

      if (part === 'selected') {
        // 注释：无选中 → undefined（保持"缺失"语义，支持 `selected != null` 存在性检查）
        if (!ctx.selectedCharacterId) return undefined
        current = ctx.getEntity('character', ctx.selectedCharacterId)
        if (!current) return undefined
        continue
      }

      if (part === 'target') {
        // 注释：target = 被判定角色（judge adjustments 等场景），与 selected 同解
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
        if (remaining.length === 1) return current[idx] ?? getDefaultValue(parts, i)
        current = current[idx]
        if (current === undefined) return getDefaultValue(parts, i)
        continue
      }
      if (remaining.length === 1) {
        // 注释：单段——字符串数组做包含检查；对象数组（如 status_effects）按 id 匹配返回存在性
        const first = current[0]
        if (first && typeof first === 'object') {
          return current.some((item: any) => item?.id === remaining[0] || item?.itemId === remaining[0])
        }
        return current.includes(remaining[0])
      }
      const found = current.find((item: any) =>
        typeof item === 'object' && item !== null && (item.id === remaining[0] || item.itemId === remaining[0])
      )
      if (found) {
        current = found
        continue
      }
      return false
    }

    if (typeof current === 'object' && current !== null) {
      // 注释：类型名优先——关系类型可能恰好叫 any/any_positive/any_negative（2026-08-10 自查修复）；
      // 命中键 → 普通字段；未命中才尝试聚合（带括号的 any(...) 永不是合法键 → 直接聚合；
      // 无括号的 any 在无同名类型时才是聚合语义）
      if (part in current) {
        current = current[part]
      } else {
        // 注释：关系聚合路径（关系系统 v2）——any(...)/any_positive(...)/any_negative(...)
        // current 为 relations[对方] 对象 {类型: 档位}；参数 = 类型列表 或 group:组名
        const agg = extractAggregatePart(part)
        if (agg) {
          return evaluateRelationAggregate(agg.kind, current, agg.args, ctx)
        }
        if (ctx.fieldAliases?.[part]) {
          // 注释：字段别名（插件注册，如 status → status_effects）——core 不认知具体别名
          // B2 修复：别名容器键缺失（如角色无 status_effects）→ 返回 undefined 保持
          // 缺失语义（`status.中毒 == false` 为 true、`== true` 为 false），不落入数值默认 0
          if (ctx.fieldAliases[part] in current) {
            current = current[ctx.fieldAliases[part]]
          } else {
            return undefined
          }
        } else if ('base' in current && typeof current.base === 'object') {
          // 注释：实体对象 → 跨命名空间查找
          current = getEntityAttr(current, part)
        } else {
          return getDefaultValue(parts, i)
        }
      }
    } else {
      return getDefaultValue(parts, i)
    }
  }

  if (current === null || current === undefined) {
    // 注释：根路径缺失（如无 player/无选中）→ undefined（`X != null` 存在性检查可判别）
    return undefined
  }
  if (typeof current === 'object') {
    // 注释：终端对象解包（引擎数据契约，AGENTS §36/§32）：
    // 能力记录 {level, xp} → 等级；状态条目 {id, remaining_duration, stack} → 存在性 true
    if (typeof (current as any).level === 'number' && 'xp' in current) {
      return (current as any).level
    }
    if ('remaining_duration' in current && 'stack' in current) {
      return true
    }
  }
  return current
}

const OPS = ['>=', '<=', '!=', '==', '>', '<']

// 注释：关系聚合路径段解析（关系系统 v2）——any(...)/any_positive(...)/any_negative(...)
// 返回 { kind, args }；非聚合段 → null
function extractAggregatePart(part: string): { kind: 'any' | 'any_positive' | 'any_negative'; args: string[] } | null {
  const m = part.match(/^(any|any_positive|any_negative)(?:\(([^)]*)\))?$/)
  if (!m) return null
  const kind = m[1] as 'any' | 'any_positive' | 'any_negative'
  const raw = m[2] ?? ''
  const args = raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : []
  return { kind, args }
}

// 注释：关系聚合求值——current 为 relations[对方] 对象 {类型: 档位}
// 参数展开：类型名直接 / group:组名 从 ctx.relationGroups（mod 加载后注入的展开组）
// any：任一类型存在（值 0=中立关系也算存在）；any_positive：任一 === 1；any_negative：任一 === -1
// 无参数 = 全部类型
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

function evalSimple(expr: string, ctx: GameContext): boolean {
  expr = expr.trim()
  if (expr === 'true') return true
  if (expr === 'false') return false
  if (expr.startsWith('!')) {
    return !evalSimple(expr.slice(1), ctx)
  }

  for (const op of OPS) {
    const idx = expr.indexOf(op)
    if (idx === -1) continue

    const left = expr.slice(0, idx).trim()
    const right = expr.slice(idx + op.length).trim()
    // 注释：左值字面量（2026-08-10 复检修复）——括号分组递归会把子表达式替换成
    // 'true'/'false'，形如 `(true && true) == true`；左值若是字面量则直接取值，
    // 不再当字段路径解析（否则 resolveValue('true') 返回 0，比较静默出错）
    const leftVal = left === 'true' ? true : left === 'false' ? false : resolveValue(left, ctx)

    // 注释：字符串右值（双引号/单引号都支持——2026-08-09 修复：原只认双引号，
    // 单引号字符串（文档/示例惯用 'active'/'山村' 等）被 parseFloat 抛错，
    // 导致所有含字符串比较的条件求值崩溃（quest auto_start 等静默失败）
    if ((right.startsWith('"') && right.endsWith('"')) || (right.startsWith("'") && right.endsWith("'"))) {
      const rightVal = right.slice(1, -1)
      switch (op) {
        case '==': return leftVal === rightVal
        case '!=': return leftVal !== rightVal
        default: throw new Error(`Operator '${op}' cannot be applied to string comparison`)
      }
    }

    if (right === 'true') {
      return op === '==' ? leftVal === true : (op === '!=' ? leftVal !== true : false)
    }
    if (right === 'false') {
      // 注释：B2 修复——`path == false` 容忍缺失（undefined/null）：
      // 容器缺失的字段（如无 status_effects 时的 status.中毒）== false 应为 true
      const isFalsey = leftVal === false || leftVal === undefined || leftVal === null
      return op === '==' ? isFalsey : (op === '!=' ? !isFalsey : false)
    }
    // 注释：null/undefined 右值——存在性检查（`selected != null`、`player.字段 == null`）
    // resolveValue 对缺失根路径返回 undefined，对缺失数值字段返回 0（AGENTS §38 默认值）
    if (right === 'null' || right === 'undefined') {
      const isMissing = leftVal === null || leftVal === undefined
      switch (op) {
        case '==': return isMissing
        case '!=': return !isMissing
        default: throw new Error(`Operator '${op}' cannot be applied to null check`)
      }
    }

    const rightVal = parseFloat(right)
    if (isNaN(rightVal)) {
      throw new Error(`Right-hand value '${right}' cannot be parsed as a number`)
    }

    const leftNum = typeof leftVal === 'number' ? leftVal : 0
    switch (op) {
      case '>': return leftNum > rightVal
      case '<': return leftNum < rightVal
      case '>=': return leftNum >= rightVal
      case '<=': return leftNum <= rightVal
      case '==': return leftNum === rightVal
      case '!=': return leftNum !== rightVal
    }
  }

  // 注释：裸路径求值（B2 修复）——`!character.x.status.中毒` 的 `!` 前缀递归到
  // 无运算符表达式；仅根路径 token 形态回退为真值求值（保持非法表达式抛错语义）。
  // 支持 selected/target 裸根（存在性检查：`!selected`）
  if (/^(player|selected|target|character|location|game|inventory)(\.|\b)/.test(expr)) {
    return !!resolveValue(expr, ctx)
  }

  throw new Error(`Condition expression '${expr}' is invalid: no valid operator found`)
}

export function evaluateCondition(expr: string, ctx: GameContext): boolean {
  // 注释：聚合占位符表在闭包内共享（2026-08-10 复检修复）——
  // 括号分组递归（evalExpr 递归调用）必须共享同一张表，否则递归层的还原把
  // 外层聚合路径（\u0001n\u0001）替换成空——括号内嵌聚合的条件静默损坏
  const aggPlaceholders: string[] = []

  const evalExpr = (e: string): boolean => {
    e = e.trim()

    const stripped = e.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''").replace(/[><=!]/g, '')
    if (/[\+\-\*\/\%]/.test(stripped)) {
      throw new Error('Arithmetic operators are not allowed in conditions; use condition_script for complex logic')
    }

    // 注释：保护聚合参数括号（关系系统 v2：any(恩人,有恩)/any_positive(group:亲属)）——
    // 这些括号是路径参数不是逻辑分组，若直接走下面的分组递归会被当作子表达式求值而报错
    e = e.replace(/(any|any_positive|any_negative)\([^()]*\)/g, (m) => {
      aggPlaceholders.push(m)
      return `\u0001${aggPlaceholders.length - 1}\u0001`
    })

    let prev: string
    do {
      prev = e
      e = e.replace(/\([^()]+\)/g, (match) => {
        const inner = match.slice(1, -1)
        return evalExpr(inner) ? 'true' : 'false'
      })
    } while (e !== prev && e.includes('('))

    // 注释：还原聚合段（还原只在当前层做——递归层里占位符保留，最终由调用链顶层还原）
    e = e.replace(/\u0001(\d+)\u0001/g, (_m, i) => aggPlaceholders[Number(i)] ?? '')

    e = e.replace(/!true/g, 'false').replace(/!false/g, 'true')

    if (!e.includes('&&') && !e.includes('||')) {
      return evalSimple(e, ctx)
    }

    const orParts = e.split(/\s*\|\|\s*/)
    for (const orPart of orParts) {
      const andParts = orPart.split(/\s*&&\s*/)
      if (andParts.every(ap => evalSimple(ap.trim(), ctx))) {
        return true
      }
    }
    return false
  }

  return evalExpr(expr)
}
