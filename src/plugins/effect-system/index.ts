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
import { conditionEngine } from '../../core/condition-engine'
import { modLoader } from '../../core/mod-loader'
import { SettlementContext } from './settlement-context'

// attributes.toml category=ability 的属性 → canonical 存储是 abilities[name].level（{level,xp} 结构）。
// 2026-08-09 第5轮修复：直写 base / setEntityAttr 整键替换会把 abilities[name] 换成数字，
// 直接读 .level 的读取方（calcJudge/settle_state/favorability/trust）恒 0 —— 静默失效
function isAbilityAttr(attr: string): boolean {
  return modLoader.getMod()?.attributes?.[attr]?.category === 'ability'
}

// 注释：onLoad——注册 10 核心类型 handler
export function onLoad(_ctx: PluginContext): void {
  // 注释：set_attribute——走 binding 系统；无绑定则按 attributes.toml category 落位
  effectTypeRegistry.register('set_attribute', (params: any, ctx: any) => {
    const targetIds = ctx._targetIds as string[]
    for (const id of targetIds) {
      const hasBinding = bindingResolver.get(id, params.attr) !== null
      if (hasBinding) {
        bindingResolver.set(id, params.attr, params.value)
      } else {
        const char = entitySystem.get('character', id) as any
        if (!char) continue
        if (isAbilityAttr(params.attr)) {
          if (!char.abilities) char.abilities = {}
          const entry = char.abilities[params.attr] ?? { level: 0, xp: 0 }
          entry.level = Math.max(0, params.value ?? 0)
          char.abilities[params.attr] = entry
        } else if (char?.base) {
          char.base[params.attr] = params.value
        }
      }
    }
    return true
  })

  // 注释：modify_attribute——加减属性，走 settlement 记录
  effectTypeRegistry.register('modify_attribute', (params: any, ctx: any) => {
    const targetIds = ctx._targetIds as string[]
    const delta = params.value as number ?? 0
    for (const id of targetIds) {
      if (ctx.settlement) {
        ctx.settlement.applyChange(id, params.attr, delta)
      } else {
        // fallback：没有 settlement 时直接改
        const hasBinding = bindingResolver.get(id, params.attr) !== null
        if (hasBinding) {
          const current = bindingResolver.get(id, params.attr) ?? 0
          bindingResolver.set(id, params.attr, current + delta)
        } else {
          const char = entitySystem.get('character', id) as any
          if (!char) continue
          if (isAbilityAttr(params.attr)) {
            // ability 类：改 abilities[name].level（保持 {level,xp} 结构，见 isAbilityAttr 注释）
            if (!char.abilities) char.abilities = {}
            const entry = char.abilities[params.attr] ?? { level: 0, xp: 0 }
            entry.level = Math.max(0, (entry.level ?? 0) + delta)
            char.abilities[params.attr] = entry
          } else if (char?.base) {
            const current = char.base[params.attr] ?? 0
            char.base[params.attr] = current + delta
          }
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

  // 注释：recover_permil——千分比恢复（eraTW 风格）
  effectTypeRegistry.register('recover_permil', (params: any, ctx: any) => {
    const targetIds = ctx._targetIds as string[]
    const attr = params.attr as string
    const rate = params.rate as number ?? 100
    const maxAttr = attr === '体力' ? '体力上限' : attr === '气力' ? '气力上限' : null
    if (!maxAttr) return true
    for (const id of targetIds) {
      const char = entitySystem.get('character', id) as any
      if (!char) continue
      let maxVal = 0
      if (char.base?.[maxAttr] !== undefined) maxVal = char.base[maxAttr]
      else if (char.params?.[maxAttr] !== undefined) maxVal = char.params[maxAttr]
      if (maxVal <= 0) continue
      const delta = Math.ceil(maxVal * rate / 1000)
      if (ctx.settlement) {
        ctx.settlement.applyChange(id, attr, delta)
      }
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

  // 注释：modify_relation——调 character API（关系系统 v2）
  // kind=relation（三档型）：直接设档（value 接受 -1/0/1 或 "正面"/"中立"/"负面"——设值而非加减）
  // kind=sentiment（数值型，如好感度）：保持加减语义
  effectTypeRegistry.register('modify_relation', async (params: any, ctx: any) => {
    const targetIds = ctx._targetIds as string[]
    for (const id of targetIds) {
      try {
        const def = modLoader.getMod()?.relationTypes?.[params.relation]
        if (def?.kind === 'relation') {
          await apiSystem.call('character', 'setRelation', id, params.target, params.relation, params.value)
        } else {
          const current = await apiSystem.call('character', 'getRelation', id, params.target, params.relation) ?? 0
          await apiSystem.call('character', 'setRelation', id, params.target, params.relation, current + params.value)
        }
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

  // 注释：remove_relation——删除关系条目（解除关系；与设 0=中立 区分，关系系统 v2）
  effectTypeRegistry.register('remove_relation', async (params: any, ctx: any) => {
    const targetIds = ctx._targetIds as string[]
    for (const id of targetIds) {
      try {
        await apiSystem.call('character', 'removeRelation', id, params.target, params.relation)
      } catch {
        errorReporter.report({
          source: 'effect-system',
          severity: 'warning',
          message: `remove_relation 失败：character 未注册`,
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

// 注释：depends_on 引用不存在去重上报（2026-08-13 审计——原静默跳过）
const reportedMissingDepIds = new Set<string>()
// 注释：effect condition 求值失败去重上报（2026-08-13 审计——原无 catch 中断整批）
const reportedEffectCondErrors = new Set<string>()
// 注释：战斗 target 不可用去重上报（2026-08-13 审计——原静默空目标，效果不执行无痕迹）
const reportedCombatTargetUnavailable = new Set<string>()
function reportCombatTargetUnavailable(target: string): void {
  if (reportedCombatTargetUnavailable.has(target)) return
  reportedCombatTargetUnavailable.add(target)
  errorReporter.report({
    source: 'effect-system',
    severity: 'warning',
    message: `target='${target}' 但当前不在战斗（或 combat 插件未加载），效果跳过`,
    suggestion: '战斗场景外请使用 self/selected/player 或角色 id 作为 target',
  })
}

// 注释：执行 effects 数组——遍历→查 registry→调 handler→depends_on→错误隔离→输出结算
async function executeEffects(effects: Effect[], execCtx: any): Promise<void> {
  const results = new Map<string, boolean>()
  const settlement = new SettlementContext()
  settlement.timeCost = execCtx._timeCost ?? 0
  // 注释：缓存调用方显式传入的初始目标——handlerCtx 的 Object.assign 会覆盖 execCtx._targetIds
  // （如嵌套链里 target='self' 的效果会把 _targetIds 写成 ['player']），无 target 的效果必须读初始值
  // 而不是被污染的当前值，否则静默结算到错误目标
  const initialTargetIds = execCtx._targetIds
  for (const effect of effects) {
    // 注释：depends_on 检查——前置成功才执行
    if (effect.depends_on) {
      const depResult = results.get(effect.depends_on)
      if (depResult !== true) {
        // 注释：前置失败 → 跳过（不报错，这是分支逻辑）；
        // 引用的 id 不存在（undefined）→ 数据错误（2026-08-13 审计：原静默——
        // 效果链中 depends_on 指向不存在的 id 时该效果永不执行且无痕迹；去重上报）
        if (depResult === undefined) {
          const key = effect.depends_on
          if (!reportedMissingDepIds.has(key)) {
            reportedMissingDepIds.add(key)
            errorReporter.report({
              source: 'effect-system',
              severity: 'warning',
              message: `effect 的 depends_on 引用了不存在的 effect id：'${key}'（该效果永不执行）`,
              suggestion: '检查效果链中 depends_on 引用的 id 是否存在（AGENTS §34：引用不存在的 id 应在加载时报错）',
            })
          }
        }
        continue
      }
    }

    // 注释：condition 检查——不满足时跳过
    if (effect.condition) {
      // 注释：求值失败 → 跳过该效果 + 去重上报（2026-08-13 审计：原无 catch——
      // condition 表达式错误会抛出让整批效果中断（后续效果静默不执行））
      try {
        const gc = gameContext.getContext()
        if (!conditionEngine.evaluate(effect.condition, gc)) {
          continue
        }
      } catch (err) {
        if (!reportedEffectCondErrors.has(effect.condition)) {
          reportedEffectCondErrors.add(effect.condition)
          errorReporter.report({
            source: 'effect-system',
            severity: 'warning',
            message: `effect condition 求值失败（该效果跳过）：${err instanceof Error ? err.message : String(err)}`,
            suggestion: '检查效果 condition 表达式（字段路径/前提拼写）',
          })
        }
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
    // 效果未显式写 target 时：调用方已显式传 _targetIds（如 h-core execution_end 的 body_item_tick）
    // → 优先用初始值；否则默认 'selected'（UI 选中）
    const targetIds = effect.target
      ? await resolveTarget(effect.target, execCtx)
      : (initialTargetIds ?? await resolveTarget('selected', execCtx))
    // 注释：handler 上下文必须共享同一对象——judge_check 写入 _judgeResult，
    // 后续 settle_* 效果要能读到（拷 贝会丢跨效果状态，判定门控会静默失效）
    const handlerCtx = Object.assign(execCtx, { _targetIds: targetIds, settlement })

    try {
      // 注释：链路修复（2026-08-15）——params 兜底 {}：effect 允许省略 params
      //（如 { type = "h_start_h", target = "selected" } 只有 type/target）——
      // 原传 undefined → handler 内 `_p.xxx` 读 undefined 属性抛裸 TypeError
      const result = await handler(effect.params ?? {}, handlerCtx)
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
  // 注释：_silent 标志（NPC AI 行为完成结算用）——玩家不在场时 NPC 的属性变化结算
  // 仍执行，但不输出叙事日志（erArk show_info_flag 同图检查同义；在场时由调用方
  // 去掉 _silent 正常输出）
  if (!settlement.isEmpty && !execCtx._silent) {
    narrativeLog.write(settlement.format(), 'system', 'effect-system')
  }
}

// 注释：解析 target 字段 → targetIds 数组
async function resolveTarget(target: string, ctx: any): Promise<string[]> {
  switch (target) {
    case 'self':
      if (!ctx.sourceId) {
        // 注释：self 无 sourceId（2026-08-13 审计补上报——原静默空目标，效果不执行无痕迹）
        errorReporter.report({
          source: 'effect-system',
          severity: 'warning',
          message: `target='self' 但执行上下文无 sourceId，跳过`,
          suggestion: '调用方需传入 sourceId（执行源角色），或改用其他 target',
        })
        return []
      }
      return [ctx.sourceId]
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
        if (!combatCtx) {
          // 注释：非战斗场景（2026-08-13 审计补上报——AGENTS §32：不可用 → 静默跳过 + warning）
          reportCombatTargetUnavailable(target)
          return []
        }
        if (target === 'all_enemies') return combatCtx.enemies ?? []
        if (target === 'all_allies') return combatCtx.allies ?? []
        if (target === 'target') return combatCtx.target ? [combatCtx.target] : []
      } catch {
        // 注释：combat 未注册 → 静默跳过（2026-08-13 审计补上报——原静默空目标无痕迹）
        reportCombatTargetUnavailable(target)
      }
      return []
    default:
      // 注释：直接当角色 ID 用
      return [target]
  }
}
