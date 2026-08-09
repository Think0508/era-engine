// 注释：status-system 插件——状态效果（中毒/醉意/buff等）
// 战斗内外都用——独立于 combat-base
// apply_status/remove_status effect type + tick + stack 缩放 + duration 扣减

import type { PluginContext } from '../../core/types'
import { effectTypeRegistry } from '../../core/effect-type-registry'
import { entitySystem } from '../../core/entity-system'
import { modLoader } from '../../core/mod-loader'
import { apiSystem } from '../../core/api'
import { errorReporter } from '../../core/error-reporter'
import { gameContext, gameTimeToTotalMinutes } from '../../core/game-context'

// 注释：onLoad——注册 apply_status/remove_status effect type
export function onLoad(_ctx: PluginContext): void {
  // 注释：apply_status——施加状态效果
  effectTypeRegistry.register('apply_status', async (params: any, ctx: any) => {
    const targetIds = ctx._targetIds as string[]
    for (const id of targetIds) {
      applyStatus(id, params.status)
    }
    return true
  })

  // 注释：remove_status——移除状态效果（全层移除，触发 on_remove_effects）
  effectTypeRegistry.register('remove_status', async (params: any, ctx: any) => {
    const targetIds = ctx._targetIds as string[]
    for (const id of targetIds) {
      removeStatus(id, params.status)
    }
    return true
  })
}

// 注释：onEnable——注册 status API + 监听 hour_changed + condition 字段
export function onEnable(ctx: PluginContext): void {
  // 注释：注册条件路径字段别名（文档路径 status./remaining → 运行时字段名）
  // core 条件引擎保持通用，别名知识由本插件持有（AGENTS §32 条件集成）
  gameContext.setFieldAliases({
    status: 'status_effects',
    remaining: 'remaining_duration',
  })

  ctx.api.register('status', {
    hasStatus: (charId: string, statusId: string): boolean => {
      const char = entitySystem.get('character', charId) as any
      return char?.status_effects?.some((s: any) => s.id === statusId) ?? false
    },
    getStack: (charId: string, statusId: string): number => {
      const char = entitySystem.get('character', charId) as any
      return char?.status_effects?.find((s: any) => s.id === statusId)?.stack ?? 0
    },
    getRemaining: (charId: string, statusId: string): number => {
      const char = entitySystem.get('character', charId) as any
      return char?.status_effects?.find((s: any) => s.id === statusId)?.remaining_duration ?? 0
    },
    apply: (charId: string, statusId: string): void => applyStatus(charId, statusId),
    remove: (charId: string, statusId: string): void => removeStatus(charId, statusId),
  })

  // 注释：监听 game:hour_changed → tick + duration 扣减
  ctx.events.on('game:hour_changed', () => {
    handleTick()
  })
}

// 注释：施加状态——叠加规则：刷新 duration + stack 递增到 max_stack
function applyStatus(charId: string, statusId: string): void {
  const mod = modLoader.getMod()
  const def = mod?.statusEffects[statusId]
  if (!def) {
    errorReporter.report({
      source: 'status-system',
      severity: 'warning',
      message: `状态效果 '${statusId}' 不存在`,
    })
    return
  }

  const char = entitySystem.get('character', charId) as any
  if (!char) return
  if (!char.status_effects) char.status_effects = []

  const existing = char.status_effects.find((s: any) => s.id === statusId)
  if (existing) {
    // 注释：已存在——刷新 duration
    existing.remaining_duration = def.duration
    // 注释：stack 递增（如果 stackable 且未达 max_stack）
    if (def.stackable && existing.stack < def.max_stack) {
      existing.stack++
    }
  } else {
    // 注释：新施加
    char.status_effects.push({
      id: statusId,
      remaining_duration: def.duration,
      stack: 1,
      last_tick_game_time: 0,
    })
    // 注释：on_apply_effects
    if (def.on_apply_effects) {
      apiSystem.call('effect-system', 'execute', def.on_apply_effects, { sourceId: charId, _targetIds: [charId] })
    }
  }
}

// 注释：移除状态——触发 on_remove_effects
function removeStatus(charId: string, statusId: string): void {
  const mod = modLoader.getMod()
  const def = mod?.statusEffects[statusId]
  const char = entitySystem.get('character', charId) as any
  if (!char?.status_effects) return

  const idx = char.status_effects.findIndex((s: any) => s.id === statusId)
  if (idx === -1) return // 注释：没有该状态，静默跳过

  // 注释：on_remove_effects
  if (def?.on_remove_effects) {
    apiSystem.call('effect-system', 'execute', def.on_remove_effects, { sourceId: charId, _targetIds: [charId] })
  }
  char.status_effects.splice(idx, 1)
}

// 注释：tick——遍历所有角色 status_effects
// TODO: 战斗外精确分钟级 tick，MVP 用 hour_changed
function handleTick(): void {
  const mod = modLoader.getMod()
  if (!mod) return

  for (const char of entitySystem.getAll('character')) {
    const c = char as any
    if (!c.status_effects) continue

    for (let i = c.status_effects.length - 1; i >= 0; i--) {
      const status = c.status_effects[i]
      const def = mod.statusEffects[status.id]
      if (!def) continue

      // 注释：duration 扣减（每小时 ~60 分钟）
      status.remaining_duration -= 60
      if (status.remaining_duration <= 0 && def.duration !== -1) {
        // 注释：到期——on_remove_effects + 移除
        if (def.on_remove_effects) {
          apiSystem.call('effect-system', 'execute', def.on_remove_effects, { sourceId: c.id, _targetIds: [c.id] })
        }
        c.status_effects.splice(i, 1)
        continue
      }

      // 注释：tick——tick_interval 检查
      if (def.tick_interval > 0 && status.last_tick_game_time + def.tick_interval <= getCurrentGameMinutes()) {
        status.last_tick_game_time = getCurrentGameMinutes()
        // 注释：tick_effects 执行——stack 缩放
        if (def.tick_effects) {
          const scaledEffects = scaleEffectsByStack(def.tick_effects, status.stack)
          apiSystem.call('effect-system', 'execute', scaledEffects, { sourceId: c.id, _targetIds: [c.id] })
        }
      }
    }
  }
}

// 注释：stack 缩放——数值类(value 为 number)×stack，非数值类重复 stack 次
function scaleEffectsByStack(effects: any[], stack: number): any[] {
  const result: any[] = []
  for (const effect of effects) {
    if (effect.params && typeof effect.params.value === 'number') {
      // 注释：数值类——深拷贝 + value × stack
      const scaled = JSON.parse(JSON.stringify(effect))
      scaled.params.value = effect.params.value * stack
      result.push(scaled)
    } else {
      // 注释：非数值类——重复 stack 次
      for (let i = 0; i < stack; i++) {
        result.push(JSON.parse(JSON.stringify(effect)))
      }
    }
  }
  return result
}

// 注释：获取当前游戏时间（分钟）——2026-08-09 example-mod 验证修复：原实现恒返回 0
// （TODO 未接 gameContext）→ tick_interval 检查 `last_tick + interval <= 0` 永假 →
// 所有 tick_effects 静默死代码。改为真实游戏时间（gameTimeToTotalMinutes 跨年月日累计）。
function getCurrentGameMinutes(): number {
  return gameTimeToTotalMinutes(gameContext.getContext().time)
}
