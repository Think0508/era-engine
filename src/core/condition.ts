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
        current = { time: ctx.time }
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
          return current.some((item: any) => item?.id === remaining[0])
        }
        return current.includes(remaining[0])
      }
      const found = current.find((item: any) =>
        typeof item === 'object' && item !== null && item.id === remaining[0]
      )
      if (found) {
        current = found
        continue
      }
      return false
    }

    if (typeof current === 'object' && current !== null) {
      if (part in current) {
        current = current[part]
      } else if (ctx.fieldAliases?.[part] && ctx.fieldAliases[part] in current) {
        // 注释：字段别名（插件注册，如 status → status_effects）——core 不认知具体别名
        current = current[ctx.fieldAliases[part]]
      } else if ('base' in current && typeof current.base === 'object') {
        // 注释：实体对象 → 跨命名空间查找
        current = getEntityAttr(current, part)
      } else {
        return getDefaultValue(parts, i)
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
    const leftVal = resolveValue(left, ctx)

    if (right.startsWith('"') && right.endsWith('"')) {
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
      return op === '==' ? leftVal === false : (op === '!=' ? leftVal !== false : false)
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

  throw new Error(`Condition expression '${expr}' is invalid: no valid operator found`)
}

export function evaluateCondition(expr: string, ctx: GameContext): boolean {
  expr = expr.trim()

  const stripped = expr.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''").replace(/[><=!]/g, '')
  if (/[\+\-\*\/\%]/.test(stripped)) {
    throw new Error('Arithmetic operators are not allowed in conditions; use condition_script for complex logic')
  }

  let prev: string
  do {
    prev = expr
    expr = expr.replace(/\([^()]+\)/g, (match) => {
      const inner = match.slice(1, -1)
      return evaluateCondition(inner, ctx) ? 'true' : 'false'
    })
  } while (expr !== prev && expr.includes('('))

  expr = expr.replace(/!true/g, 'false').replace(/!false/g, 'true')

  if (!expr.includes('&&') && !expr.includes('||')) {
    return evalSimple(expr, ctx)
  }

  const orParts = expr.split(/\s*\|\|\s*/)
  for (const orPart of orParts) {
    const andParts = orPart.split(/\s*&&\s*/)
    if (andParts.every(ap => evalSimple(ap.trim(), ctx))) {
      return true
    }
  }
  return false
}
