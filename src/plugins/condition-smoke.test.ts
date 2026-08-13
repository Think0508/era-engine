// 注释：全模组条件运行时求值冒烟（2026-08-13 条件引擎统一后新增）
// 目的：抓"校验通过但运行时求值抛错"的静默错误——conditionRegistry.validateExpression 只查
// 字段存在不查语法；新引擎解析失败的表达式在调用方被 catch → 数据静默不可用。
// 遍历 mod 数据全部 condition/premises 字段（指令/口上/对话树/任务/地图/天赋/状态/目标/事件/判定修正），
// 用真实上下文 evaluate 不抛 + 返回 boolean。

import { describe, it, expect, beforeAll } from 'vitest'
import { modLoader, type LoadedMod } from '../core/mod-loader'
import { gameContext } from '../core/game-context'
import { entitySystem } from '../core/entity-system'
import { eventBus } from '../core/event-bus'
import { apiSystem } from '../core/api'
import { commandRegistry } from '../core/command-registry'
import { bindingResolver } from '../core/binding-resolver'
import { conditionRegistry } from '../core/condition-registry'
import { errorReporter } from '../core/error-reporter'
import { PluginManager, warnMissingPluginTomls } from '../core/plugin-manager'
import { SlotRegistry } from '../ui/slots/slot-registry'
import { conditionEngine } from '../core/condition-engine'
import type { GameContext } from '../core/types'

describe('全模组条件运行时求值冒烟', () => {
  let mod: LoadedMod
  let gc: GameContext

  beforeAll(async () => {
    entitySystem.clear()
    commandRegistry.clear()
    errorReporter.clear()
    conditionEngine.clear()
    await modLoader.loadMod('test-mod')
    mod = modLoader.getMod() as LoadedMod
    if (!mod) throw new Error('模组加载失败')
    bindingResolver.loadBindings(mod.bindings)
    conditionRegistry.clear()
    conditionRegistry.registerFromAttributes(mod.attributes)
    conditionRegistry.registerFromBindings(mod.bindings)
    gameContext.setPlayer('player')
    const startLoc = entitySystem.get('location', 'town_square') as any
    if (startLoc) gameContext.setLocation(startLoc)
    warnMissingPluginTomls()
    const pluginManager = new PluginManager(apiSystem, eventBus, new SlotRegistry(), commandRegistry)
    const pluginModules = import.meta.glob('/src/plugins/*/index.ts', { eager: true }) as Record<string, any>
    const pluginTomls = import.meta.glob('/src/plugins/*/plugin.toml', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
    const enginePlugins = new Map<string, { toml: string; module?: any }>()
    for (const [path, toml] of Object.entries(pluginTomls)) {
      const dirName = path.match(/\/src\/plugins\/([^/]+)\//)?.[1]
      if (!dirName) continue
      enginePlugins.set(dirName, { toml, module: pluginModules[`/src/plugins/${dirName}/index.ts`] ?? undefined })
    }
    await pluginManager.loadPlugins(enginePlugins, new Map())
    gc = gameContext.getContext()
    // 玩家实体存在性（resolveValue 的 player 根）
    if (!gc.player) gameContext.setPlayer('player')
    gc = gameContext.getContext()
  })

  // 注释：求值一条条件——不抛 + boolean 结果
  function evalCond(expr: string, where: string, bad: string[]): void {
    try {
      const r = conditionEngine.evaluate(expr, gc)
      if (typeof r !== 'boolean') bad.push(`${where}: ${expr} -> 非布尔 ${typeof r}`)
    } catch (err) {
      bad.push(`${where}: ${expr} -> ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  function evalPremises(premises: string[] | undefined, where: string, bad: string[]): void {
    if (!premises || premises.length === 0) return
    try {
      conditionEngine.evaluatePremises(premises, gc)
    } catch (err) {
      bad.push(`${where}: premises ${premises.join(',')} -> ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  it('指令 condition/premises 全部可求值', () => {
    const bad: string[] = []
    for (const inst of mod.instructions ?? []) {
      if (inst.condition) evalCond(inst.condition, `指令 ${inst.id}`, bad)
      evalPremises(inst.premises, `指令 ${inst.id}`, bad)
    }
    expect(bad.slice(0, 20)).toEqual([])
  })

  it('口上 condition 全部可求值（场景通用/角色通用/角色专属）', () => {
    const bad: string[] = []
    for (const l of mod.sceneDialogue ?? []) if (l.condition) evalCond(l.condition, `场景口上 ${l.scene}`, bad)
    for (const l of mod.characterDialogue ?? []) if (l.condition) evalCond(l.condition, `角色通用口上 ${l.scene}`, bad)
    for (const lines of mod.characterSpecificDialogue?.values() ?? []) {
      for (const l of lines) if (l.condition) evalCond(l.condition, `角色专属口上 ${l.scene}`, bad)
    }
    expect(bad.slice(0, 20)).toEqual([])
  })

  it('对话树 condition/选项 condition 全部可求值', () => {
    const bad: string[] = []
    const convs = mod.conversations
    for (const group of [convs?.character?.values(), convs?.global?.values(), convs?.quest?.values(), convs?.event?.values()]) {
      if (!group) continue
      for (const conv of group) {
        if (!conv) continue
        const entries = conv instanceof Map ? conv.values() : [conv]
        for (const c of entries) {
          if (c?.condition) evalCond(c.condition, `对话树 ${c.id}`, bad)
          for (const n of c?.nodes ?? []) {
            for (const ch of n.choices ?? []) {
              if (ch.condition) evalCond(ch.condition, `对话树 ${c.id}.${n.id}.choice:${ch.text}`, bad)
            }
          }
        }
      }
    }
    expect(bad.slice(0, 20)).toEqual([])
  })

  it('任务 condition 全部可求值（auto_start/steps）', () => {
    const bad: string[] = []
    for (const quest of mod.quests?.values() ?? []) {
      if (quest.auto_start_condition) evalCond(quest.auto_start_condition, `任务 ${quest.id} auto_start`, bad)
      for (const step of quest.steps ?? []) {
        if (step.condition) evalCond(step.condition, `任务 ${quest.id}.${step.id}`, bad)
      }
    }
    expect(bad.slice(0, 20)).toEqual([])
  })

  it('地图 edge condition 全部可求值', () => {
    const bad: string[] = []
    for (const e of mod.graph ?? []) {
      if (e.condition) evalCond(e.condition, `地图边 ${e.from}->${e.to}`, bad)
    }
    expect(bad.slice(0, 20)).toEqual([])
  })

  it('天赋/状态效果/能力 condition 全部可求值', () => {
    const bad: string[] = []
    for (const [id, def] of Object.entries(mod.talentDefs ?? {})) {
      if (def.gain?.condition) evalCond(def.gain.condition, `天赋 ${id}.gain`, bad)
      for (const m of def.modifiers ?? []) {
        if (m.condition) evalCond(m.condition, `天赋 ${id}.modifier`, bad)
      }
    }
    for (const [id, def] of Object.entries(mod.abilities ?? {})) {
      if (def.condition) evalCond(def.condition, `能力 ${id}`, bad)
    }
    expect(bad.slice(0, 20)).toEqual([])
  })

  it('NPC AI 目标 condition/premises 全部可求值', () => {
    const bad: string[] = []
    for (const t of mod.aiTargets ?? []) {
      if (t.condition) evalCond(t.condition, `AI 目标 ${t.id}`, bad)
      evalPremises(t.premises, `AI 目标 ${t.id}`, bad)
    }
    expect(bad.slice(0, 20)).toEqual([])
  })

  it('随机事件 condition/premises 全部可求值', () => {
    const bad: string[] = []
    for (const ev of mod.events ?? []) {
      if (ev.condition) evalCond(ev.condition, `事件 ${ev.id}`, bad)
      evalPremises(ev.premises, `事件 ${ev.id}`, bad)
    }
    expect(bad.slice(0, 20)).toEqual([])
  })

  it('判定修正 condition 全部可求值', () => {
    const bad: string[] = []
    const adjustments = (mod.hConfig as any)?.judge?.adjustments as Record<string, { condition: string }[]> | undefined
    if (adjustments) {
      for (const [judgeClass, entries] of Object.entries(adjustments)) {
        for (const entry of entries) {
          if (entry.condition) evalCond(entry.condition, `判定修正 ${judgeClass}`, bad)
        }
      }
    }
    expect(bad.slice(0, 20)).toEqual([])
  })

  it('待激活角色 spawn_condition 全部可求值', () => {
    const bad: string[] = []
    for (const s of mod.pendingSpawns ?? []) {
      if (s.condition) evalCond(s.condition, `待激活角色 ${s.id}`, bad)
    }
    expect(bad.slice(0, 20)).toEqual([])
  })

  it('hConfig talk.situations 前提引用已注册', () => {
    const situations = (mod.hConfig as any)?.talk?.situations as { premises?: string[] }[] | undefined
    const registered = new Set(conditionEngine.getRegisteredPremiseIds())
    const missing: string[] = []
    for (const s of situations ?? []) {
      for (const p of s.premises ?? []) {
        if (!registered.has(p.toLowerCase())) missing.push(p)
      }
    }
    expect(missing).toEqual([])
  })
})
