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

    if (part === 'character' && i === 0) {
      const charId = parts[i + 1]
      current = ctx.getEntity('character', charId)
      i++
      continue
    }

    if (part === 'selected') {
      if (!ctx.selectedCharacterId) return getDefaultValue(parts, i)
      current = ctx.getEntity('character', ctx.selectedCharacterId)
      if (!current) return getDefaultValue(parts, i)
      continue
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
    return 0
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
