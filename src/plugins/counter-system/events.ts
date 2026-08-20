// 计数器事件监听（events.ts）——按编译绑定把事件 payload 映射到 store 写入
// 声明 DSL 边界（ADR-0016）：计数目标 = payload.target（可 target_from 覆盖）；
// add/dims = payload 字段直取或常量；复杂判定（性别过滤）走内置参数，不做表达式语言。

import { eventBus } from '../../core/event-bus'
import { entitySystem } from '../../core/entity-system'
import { gameContext } from '../../core/game-context'
import { errorReporter } from '../../core/error-reporter'
import { getByPath, addNumber, addToList, addGroupField } from './store'
import { getDefs } from './register'
import type { CounterDef } from '../../core/mod-types'
import type { CompiledBinding } from './types'

/** 事件 → 绑定列表（index.ts 装配，mod 重载时重建） */
let activeBindings = new Map<string, CompiledBinding[]>()

export function setBindings(bindings: Map<string, CompiledBinding[]>): void {
  activeBindings = bindings
}

function getPayloadField(payload: any, ref?: string | number): any {
  if (ref === undefined || ref === null) return undefined
  if (typeof ref === 'number') return ref
  if (typeof ref !== 'string') return undefined
  if (ref.startsWith('payload.')) return getByPath(payload, ref.slice('payload.'.length))
  return ref // 常量字符串（如固定名单项）也允许
}

/** scope 版定义：同 id 可声明 player/character 两版（方向不同）；无 scope 键 → 直接 id 兜底 */
function defineForScope(counterId: string, scope: 'player' | 'character'): CounterDef | undefined {
  const defs = getDefs()
  return defs[`${scope}:${counterId}`] ?? defs[counterId]
}

/** character scope 的计数目标：事件作用对象（def.target_from 可覆盖，默认 payload.target） */
function resolveTargetId(def: CounterDef, payload: any): string | null {
  const ref = def.target_from ?? 'payload.target'
  const id = getPayloadField(payload, ref)
  return typeof id === 'string' && id ? id : null
}

function applyToDef(binding: CompiledBinding, def: CounterDef, targetId: string, payload: any): void {
  if (binding.kind === 'number') {
    const delta = getPayloadField(payload, def.add)
    if (typeof delta === 'number') addNumber(targetId, binding.counterId, def, delta)
    return
  }

  if (binding.kind === 'list') {
    const itemId = getPayloadField(payload, def.add)
    if (typeof itemId !== 'string' || !itemId) return
    // 性别过滤（查名单项角色 base.性别：1=男 2=女）
    if (def.filter_gender) {
      const char = entitySystem.get('character', itemId) as any
      const gender = getByPath(char, 'base.性别')
      const want = def.filter_gender === 'female' ? 2 : 1
      if (gender !== want) return
    }
    addToList(targetId, binding.counterId, def, itemId)
    return
  }

  if (binding.kind === 'group_field' && binding.field && def.dims) {
    const dims: (string | number)[] = []
    for (const d of def.dims) {
      const v = getPayloadField(payload, d.from)
      if (v === undefined || v === null) return
      dims.push(v as string | number)
    }
    const delta = getPayloadField(payload, binding.field.add)
    if (typeof delta !== 'number') return
    addGroupField(targetId, binding.counterId, def, dims, binding.field.id, delta)
  }
}

/**
 * 应用事件绑定：一次事件可能同时命中同一计数器的 player/character 两版定义
 * （如 h:start → 玩家 h_partners 记 target、女角色 h_partners 记 ally——两侧各写各的）。
 * scope 缺失的版本（defs 只有 character:male_stats）自动跳过。
 */
function applyBinding(binding: CompiledBinding, payload: any): void {
  for (const scope of ['player', 'character'] as const) {
    const def = defineForScope(binding.counterId, scope)
    if (!def || def.scope === 'global') continue
    // player scope：计数目标 = 玩家实体（名单项/增量从 payload 取）
    const targetId = scope === 'player'
      ? gameContext.getContext().player?.id ?? null
      : resolveTargetId(def, payload)
    if (!targetId) continue
    applyToDef(binding, def, targetId, payload)
  }
}

// ============ 监听器生命周期（mod 重载时重建）============
const activeHandlers = new Map<string, (payload: any) => Promise<void>>()

export function registerEventListeners(): void {
  detachEventListeners()
  const events = new Set<string>()
  for (const evt of activeBindings.keys()) events.add(evt)
  for (const evt of events) {
    const handler = async (payload: any): Promise<void> => {
      const bindings = activeBindings.get(evt) ?? []
      for (const b of bindings) {
        try {
          applyBinding(b, payload)
        } catch (err) {
          errorReporter.report({
            source: 'counter-system',
            severity: 'warning',
            message: `事件 '${evt}' 计数器应用抛错：${err instanceof Error ? err.message : String(err)}`,
          })
        }
      }
    }
    eventBus.on(evt, handler)
    activeHandlers.set(evt, handler)
  }
}

export function detachEventListeners(): void {
  for (const [evt, handler] of activeHandlers) {
    eventBus.off(evt, handler)
  }
  activeHandlers.clear()
}