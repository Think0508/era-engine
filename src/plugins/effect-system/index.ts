// 注释：effect-system 插件——统一效果执行器
// onLoad 注册 10 核心类型 handler
// execute 方法遍历 effects→查 registry→调 handler→depends_on 检查→错误隔离
// target 解析：effect-system 统一解析为 targetIds

import type { PluginContext } from '../../core/types'
import { effectTypeRegistry, type Effect, type EffectHandler } from '../../core/effect-type-registry'
import { bindingResolver } from '../../core/binding-resolver'
import { entitySystem } from '../../core/entity-system'
import { gameContext } from '../../core/game-context'
import { narrativeLog } from '../../core/narrative-log'
import { errorReporter } from '../../core/error-reporter'
import { apiSystem } from '../../core/api'
import { evaluateCondition } from '../../core/condition'
import { SettlementContext } from './settlement-context'

// 注释：onLoad——注册 10 核心类型 handler
export function onLoad(_ctx: PluginContext): void {
  // 注释：set_attribute——走 binding 系统；无绑定则直接改实体 base
  // TODO: 后续区分「插件键名→binding」和「mod 属性名→直接 base」
  effectTypeRegistry.register('set_attribute', (params: any, ctx: any) => {
    const targetIds = ctx._targetIds as string[]
    for (const id of targetIds) {
      const hasBinding = bindingResolver.get(id, params.attr) !== null
      if (hasBinding) {
        bindingResolver.set(id, params.attr, params.value)
      } else {
        const char = entitySystem.get('character', id) as any
        if (char?.base) char.base[params.attr] = params.value
      }
    }
    return true
  })

  // 注释：modify_attribute——加减属性，逻辑同上
  effectTypeRegistry.register('modify_attribute', (params: any, ctx: any) => {
    const targetIds = ctx._targetIds as string[]
    for (const id of targetIds) {
      const hasBinding = bindingResolver.get(id, params.attr) !== null
      if (hasBinding) {
        const current = bindingResolver.get(id, params.attr) ?? 0
        bindingResolver.set(id, params.attr, current + params.value)
      } else {
        const char = entitySystem.get('character', id) as any
        if (char?.base) {
          const current = char.base[params.attr] ?? 0
          char.base[params.attr] = current + params.value
        }
      }
    }
    return true
  })

  // 注释：set_field——直接改实体字段，不走 binding
  effectTypeRegistry.register('set_field', (params: any, ctx: any) => {
    const targetIds = ctx._targetIds as string[]
    for (const id of targetIds) {
      const char = entitySystem.get('character', id) as any
      if (!char) continue
      const parts = params.path.split('.')
      let obj = char
      for (let i = 0; i < parts.length - 1; i++) {
        if (!obj[parts[i]]) obj[parts[i]] = {}
        obj = obj[parts[i]]
      }
      obj[parts[parts.length - 1]] = params.value
    }
    return true
  })

  // 注释：add_item——调 inventory API（未注册时 warning+跳过）
  effectTypeRegistry.register('add_item', async (params: any, ctx: any) => {
    const targetIds = ctx._targetIds as string[]
    for (const id of targetIds) {
      try {
        await apiSystem.call('inventory', 'addItem', id, params.itemId, params.count ?? 1)
      } catch {
        errorReporter.report({
          source: 'effect-system',
          severity: 'warning',
          message: `add_item 失败：inventory 未注册或 addItem 调用失败`,
        })
      }
    }
    return true
  })

  // 注释：remove_item——调 inventory API
  effectTypeRegistry.register('remove_item', async (params: any, ctx: any) => {
    const targetIds = ctx._targetIds as string[]
    for (const id of targetIds) {
      try {
        await apiSystem.call('inventory', 'removeItem', id, params.itemId, params.count ?? 1)
      } catch {
        errorReporter.report({
          source: 'effect-system',
          severity: 'warning',
          message: `remove_item 失败：inventory 未注册`,
        })
      }
    }
    return true
  })

  // 注释：modify_relation——调 character API
  effectTypeRegistry.register('modify_relation', async (params: any, ctx: any) => {
    const targetIds = ctx._targetIds as string[]
    for (const id of targetIds) {
      try {
        const current = await apiSystem.call('character', 'getRelation', id, params.target, params.relation) ?? 0
        await apiSystem.call('character', 'setRelation', id, params.target, params.relation, current + params.value)
      } catch {
        errorReporter.report({
          source: 'effect-system',
          severity: 'warning',
          message: `modify_relation 失败：character 未注册`,
        })
      }
    }
    return true
  })

  // 注释：advance_time——推进游戏时间
  effectTypeRegistry.register('advance_time', async (params: any) => {
    await gameContext.advanceTime(params.minutes ?? 0)
    return true
  })

  // 注释：narrative_output——写入叙事日志
  effectTypeRegistry.register('narrative_output', (params: any) => {
    narrativeLog.write(params.text, params.type || 'system', 'effect-system')
    return true
  })

  // 注释：enter_mode——push 模式到栈
  effectTypeRegistry.register('enter_mode', async (params: any) => {
    await gameContext.enterMode(params.mode)
    return true
  })

  // 注释：exit_mode——pop 模式出栈
  effectTypeRegistry.register('exit_mode', async () => {
    await gameContext.exitMode()
    return true
  })

  // 注释：nop——无操作（占位用，显式跳过）
  effectTypeRegistry.register('nop', () => true)
}

// 注释：onEnable——注册 effect API（execute 方法）
export function onEnable(ctx: PluginContext): void {
  ctx.api.register('effect-system', {
    // 注释：执行 effects 数组——统一入口
    execute: async (effects: Effect[], execCtx: any): Promise<void> => {
      await executeEffects(effects, execCtx)
    },
    // 注释：注册自定义 effect type（其他插件调）
    registerType: (type: string, handler: EffectHandler): void => {
      effectTypeRegistry.register(type, handler)
    },
    // 注释：查 type 是否已注册
    hasType: (type: string): boolean => {
      return effectTypeRegistry.has(type)
    },
  })
}

// 注释：执行 effects 数组——遍历→查 registry→调 handler→depends_on→错误隔离→输出结算
async function executeEffects(effects: Effect[], execCtx: any): Promise<void> {
  const results = new Map<string, boolean>()
  const settlement = new SettlementContext()

  for (const effect of effects) {
    // 注释：depends_on 检查——前置成功才执行
    if (effect.depends_on) {
      const depResult = results.get(effect.depends_on)
      if (depResult !== true) {
        // 注释：前置失败 → 跳过（不报错，这是分支逻辑）
        continue
      }
    }

    // 注释：condition 检查——不满足时跳过
    if (effect.condition) {
      const gc = gameContext.getContext()
      if (!evaluateCondition(effect.condition, gc)) {
        continue
      }
    }

    const handler = effectTypeRegistry.getHandler(effect.type)
    if (!handler) {
      // 注释：未知 type → warning + 跳过（不崩）
      errorReporter.report({
        source: 'effect-system',
        severity: 'warning',
        message: `未知 effect type '${effect.type}'，跳过`,
        suggestion: `检查 effect type 是否已注册（可用：${effectTypeRegistry.getAllTypes().join(', ')}）`,
      })
      continue
    }

    // 注释：解析 target → targetIds
    const targetIds = await resolveTarget(effect.target ?? 'selected', execCtx)
    const handlerCtx = { ...execCtx, _targetIds: targetIds, settlement }

    try {
      const result = await handler(effect.params, handlerCtx)
      if (effect.id) {
        // 注释：handler 没抛错且没返回 false = 成功
        results.set(effect.id, result !== false)
      }
    } catch (err) {
      // 注释：handler 抛错 → error-reporter 报告 + 继续执行下一个（错误隔离）
      errorReporter.report({
        source: 'effect-system',
        severity: 'error',
        message: `effect '${effect.type}' 执行抛错：${err instanceof Error ? err.message : String(err)}`,
      })
      if (effect.id) {
        results.set(effect.id, false)
      }
    }
  }

  // 注释：输出结算变化到日志
  if (!settlement.isEmpty) {
    narrativeLog.write(settlement.format(), 'system', 'effect-system')
  }
}

// 注释：解析 target 字段 → targetIds 数组
async function resolveTarget(target: string, ctx: any): Promise<string[]> {
  switch (target) {
    case 'self':
      return ctx.sourceId ? [ctx.sourceId] : []
    case 'selected':
      const selected = ctx.uiStore?.selectedCharacterId
      if (!selected) {
        errorReporter.report({
          source: 'effect-system',
          severity: 'warning',
          message: `target='selected' 但无选中角色，跳过`,
        })
        return []
      }
      return [selected]
    case 'player':
      const player = gameContext.getContext().player
      return player ? [player.id] : []
    case 'all_enemies':
    case 'all_allies':
    case 'target':
      // 注释：战斗上下文——调 combat API
      try {
        const combatCtx = await apiSystem.call('combat', 'getCombatContext')
        if (!combatCtx) return []
        if (target === 'all_enemies') return combatCtx.enemies ?? []
        if (target === 'all_allies') return combatCtx.allies ?? []
        if (target === 'target') return combatCtx.target ? [combatCtx.target] : []
      } catch {
        // 注释：combat 未注册 → 静默跳过
      }
      return []
    default:
      // 注释：直接当角色 ID 用
      return [target]
  }
}
