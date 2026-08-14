// 注释：quest-system 插件——任务剧情系统（统一 scene 管理）
// 支持 event 和 quest（同一套数据格式）
// 8 种 step 类型 + objective 事件驱动 + auto_start + 嵌套子 scene
// scene 状态从 gameContext.completedScenes 持久化

import type { PluginContext } from '../../core/types'
import { eventBus } from '../../core/event-bus'
import { narrativeLog } from '../../core/narrative-log'
import { modLoader } from '../../core/mod-loader'
import { apiSystem } from '../../core/api'
import { effectTypeRegistry } from '../../core/effect-type-registry'
import { gameContext } from '../../core/game-context'
import { errorReporter } from '../../core/error-reporter'
import type { Quest, ConversationRef } from '../../core/mod-loader'
import { parseConversationRef } from '../../core/mod-loader'
import { conditionEngine } from '../../core/condition-engine'
import { registerCommandHook, clearCommandHooks } from '../../core/command-executor'
import { registerGameStateProvider } from '../../core/save-system'
import { runQuestScript, makeScriptCtx } from './script-runner'

// 注释：scene 运行时状态
interface SceneRuntime {
  sceneId: string
  currentStepId: string
  completedSteps: string[]
  objectiveProgress: Map<string, number>
  vars: Record<string, any>      // C2：场景变量
}

// 注释：所有活跃 scene 的运行时
const activeScenes = new Map<string, SceneRuntime>()
// 注释：嵌套场景栈——push 子 scene 时暂停父，完成后 pop
const sceneStack: { sceneId: string; resumeStepId: string }[] = []
// 注释：运行时注册的动态 scene（2026-08-14 confinement-system 追捕委托用）——
// mod.quests 是 TOML 静态数据，动态敌人（逃犯 id）写不进去 → 本表运行时注册，
// getScene 优先查本表。存档恢复：动态 scene 由注册方（confinement）的 provider
// 恢复后重新注册，本表不随存档序列化（activeScenes 持久化引用 sceneId，读档后
// 若动态 scene 未恢复 → getScene 返回 undefined → 任务无法推进——注册方负责
// 在 restore 时按原样重建）
const dynamicScenes = new Map<string, Quest>()

// 注释：C4——custom objective 事件监听——objective 声明监听什么事件，脚本只做匹配逻辑
// h:orgasm / h:end 由 h-core 发出；现有标准事件（location:enter 等）由既有监听覆盖
const CUSTOM_EVENT_TYPES = ['h:orgasm', 'h:end']

// 注释：C6——dialogue_end 触发索引（character → sceneIds），buildTriggerIndex 时重建
const dialogueEndTriggers = new Map<string, string[]>()

export function onLoad(_ctx: PluginContext): void {
  // 注释：start_scene——后台激活 scene（不打断当前操作）
  // event 和 quest 通用
  effectTypeRegistry.register('start_scene', async (params: any) => {
    const sceneId = params.scene as string
    if (!sceneId) return true
    await startScene(sceneId)
    return true
  })

  // 注释：start_quest——start_scene 的别名，向后兼容
  effectTypeRegistry.register('start_quest', async (params: any) => {
    const questId = params.quest as string
    if (questId) await startScene(questId)
    return true
  })

  // 注释：set_var——C2 写场景变量（任务间通信走数据）
  // params: { scene?, var, value }——scene 省略 = 最新激活场景
  effectTypeRegistry.register('set_var', async (params: any) => {
    const sceneId = params.scene ?? Array.from(activeScenes.keys()).pop()
    const r = sceneId ? activeScenes.get(sceneId) : undefined
    if (r) r.vars[params.var] = params.value
    return true
  })

  // 注释：C4——custom objective 监听（onLoad 注册，每次插件加载一次；幂等无碍）
  // 与 checkObjectives（既有 4 类型）独立并存：标准事件走 ctx.events 监听，custom 走本表
  for (const evt of CUSTOM_EVENT_TYPES) {
    eventBus.on(evt, async (payload: any) => {
      await checkCustomObjectives(evt, payload)
    })
  }
}

export function onEnable(ctx: PluginContext): void {
  ctx.api.register('quest', {
    start: async (sceneId: string): Promise<void> => {
      await startScene(sceneId)
    },
    getActiveScenes: (): string[] => Array.from(activeScenes.keys()),
    getSceneStatus: (sceneId: string): string => {
      if (gameContext.isCompleted(sceneId)) return 'completed'
      if (activeScenes.has(sceneId)) return 'active'
      return 'not_started'
    },
    // 注释：C2——场景变量读写（同步——条件引擎 resolvePath 同步求值链直接调用；
    // 场景不存在/无该变量 → undefined）
    getVar: (sceneId: string, key: string): any => {
      return activeScenes.get(sceneId)?.vars?.[key]
    },
    setVar: (sceneId: string, key: string, value: any): void => {
      const r = activeScenes.get(sceneId)
      if (r) r.vars[key] = value
    },
    advanceStep: async (sceneId: string, nextStepId: string): Promise<void> => {
      await advanceToStep(sceneId, nextStepId)
    },
    // 注释：检查是否有未开始的 scene 的 condition 满足当前游戏状态
    checkTriggerConditions: (): string[] => {
      const mod = modLoader.getMod()
      if (!mod) return []
      const triggered: string[] = []
      for (const [id, scene] of mod.quests) {
        if (!scene.condition) continue
        if (activeScenes.has(id)) continue
        if (gameContext.isCompleted(id)) continue
        // 注释：condition 求值由调用方完成（需要 GameContext）
        triggered.push(id)
      }
      return triggered
    },
    // 注释：运行时注册动态 scene（2026-08-14 confinement-system 追捕委托）——
    // 解决"敌人 id 运行时才知道，写不进 TOML"：构造 Quest 对象 → 注册 → 启动。
    // 注册方负责在存档 restore 后重建（动态 scene 不随存档序列化）
    registerDynamicScene: async (sceneId: string, scene: Quest): Promise<void> => {
      dynamicScenes.set(sceneId, scene)
    },
    // 注释：运行时构造并启动动态 scene（registerDynamicScene + start 一步完成）
    startDynamicScene: async (sceneId: string, scene: Quest): Promise<void> => {
      dynamicScenes.set(sceneId, scene)
      await startScene(sceneId)
    },
    // 注释：移除动态 scene（追捕结束/读档重建后清理）
    unregisterDynamicScene: async (sceneId: string): Promise<void> => {
      dynamicScenes.delete(sceneId)
    },
    // 注释：C6——重建触发器索引（triggers 声明 → command hook + dialogue_end 索引）。
    // 新增/删除带 triggers 的任务后调用（运行时注册动态 scene 等场景）
    reindexTriggers: (): void => {
      buildTriggerIndex()
    },
  })

  ctx.events.on('location:enter', async (payload: any) => {
    await checkObjectives('reach_location', { target: payload?.to })
    checkAutoStart()
  })
  ctx.events.on('combat:end', async (payload: any) => {
    await checkObjectives('kill_count', payload)
    checkAutoStart()
    // 注释：B3 修复（audit-c I3）——combat 步骤推进：当前步骤 type=combat 时按
    // winner/outcome 前进（winner='allies' = 玩家方胜利 → on_win；'enemies' → on_lose；
    // 缺 on_win/on_lose 时沿用 step.next 既有语义；逃跑（无胜负）不推进）
    const playerId = gameContext.getContext().player?.id
    const win = payload?.winner === 'allies' || (playerId != null && payload?.winner === playerId)
    const lose = payload?.winner === 'enemies' || (payload?.outcome === 'lose')
    for (const [sceneId, runtime] of activeScenes) {
      const scene = getScene(sceneId)
      if (!scene) continue
      const step = scene.steps.find(s => s.id === runtime.currentStepId)
      if (!step || step.type !== 'combat') continue
      // C1：参与者过滤——scene 的 enemies 与本次战斗 participants 有交集才推进
      //（无关战斗结束不推进，避免多场战斗串步；也防其它场景触发的战斗误推进）
      const stepEnemies = Array.isArray(step.enemies) ? step.enemies : []
      const participants = Array.isArray(payload?.participants) ? payload.participants : []
      if (!stepEnemies.some(e => participants.includes(e))) continue
      let nextStepId: string | undefined
      if (win) nextStepId = step.on_win ?? step.next
      else if (lose) nextStepId = step.on_lose ?? step.next
      if (nextStepId) {
        await advanceToStep(sceneId, nextStepId)
      }
    }
  })
  ctx.events.on('item:added', async (payload: any) => {
    await checkObjectives('collect_items', payload)
  })
  ctx.events.on('dialogue:end', async (payload: any) => {
    await checkObjectives('talk_to', { character: payload?.character })
    checkAutoStart()
  })
  // 注释：C6——dialogue_end 触发（与既有 talk_to objective 监听并存，职责分离）：
  // 与指定角色对话结束时启动匹配场景（已活跃/已完成 → 跳过）
  ctx.events.on('dialogue:end', async (payload: any) => {
    const sceneIds = dialogueEndTriggers.get(payload?.character) ?? []
    for (const sceneId of sceneIds) {
      if (!activeScenes.has(sceneId) && !gameContext.isCompleted(sceneId)) {
        await startScene(sceneId)
      }
    }
  })

  // 注释：C6——读档后 mod.quests 已重建 → 重建触发器索引
  ctx.events.on('game:load', () => {
    buildTriggerIndex()
  })

  // 注释：C6——初始构建触发器索引（新游戏启动即生效；读档由 game:load 重建，
  // 运行时增删任务由 reindexTriggers API 重建）
  buildTriggerIndex()

  // 注释：存档 provider（2026-08-14 存档系统复刻）——进行中任务进度随存档，
  // 读档后重建（此前 activeScenes/sceneStack 为模块级内存，读档任务直接消失）
  registerGameStateProvider({
    id: 'quest-system',
    serialize: () => ({
      activeScenes: Array.from(activeScenes.entries()).map(([sceneId, r]) => ({
        sceneId,
        currentStepId: r.currentStepId,
        completedSteps: [...r.completedSteps],
        objectiveProgress: Object.fromEntries(r.objectiveProgress),
        vars: { ...(r.vars ?? {}) },
      })),
      sceneStack: sceneStack.map(s => ({ ...s })),
    }),
    restore: (data) => {
      activeScenes.clear()
      sceneStack.length = 0
      for (const entry of data?.activeScenes ?? []) {
        activeScenes.set(entry.sceneId, {
          sceneId: entry.sceneId,
          currentStepId: entry.currentStepId,
          completedSteps: Array.isArray(entry.completedSteps) ? entry.completedSteps : [],
          objectiveProgress: new Map(Object.entries(entry.objectiveProgress ?? {})),
          vars: { ...(entry.vars ?? {}) },
        })
      }
      for (const s of data?.sceneStack ?? []) {
        sceneStack.push({ sceneId: s.sceneId, resumeStepId: s.resumeStepId ?? '' })
      }
    },
  })
}

// 注释：后台激活 scene（不打断当前）
async function startScene(sceneId: string): Promise<void> {
  const mod = modLoader.getMod()
  if (!mod) return
  const scene = getScene(sceneId)
  if (!scene) {
    // 注释：Scene 引用不存在 = 数据错误（2026-08-13 审计补上报——原仅用户提示）
    errorReporter.report({
      source: 'quest-system',
      severity: 'warning',
      message: `Scene '${sceneId}' 不存在（任务无法启动）`,
      suggestion: '检查 quests/ 目录是否定义了该任务，或 start_quest/start 引用的 id 是否拼写正确',
    })
    narrativeLog.write(`Scene '${sceneId}' 不存在`, 'system', 'quest-system')
    return
  }
  if (gameContext.isCompleted(sceneId)) {
    narrativeLog.write(`Scene '${scene.title ?? sceneId}' 已完成，跳过`, 'system', 'quest-system')
    return
  }
  if (activeScenes.has(sceneId)) return

  if (scene.prerequisites) {
    for (const pre of scene.prerequisites) {
      if (!gameContext.isCompleted(pre)) {
        narrativeLog.write(`Scene '${scene.title ?? sceneId}' 前置条件未满足（需要 ${pre}）`, 'system', 'quest-system')
        return
      }
    }
  }

  const runtime: SceneRuntime = {
    sceneId,
    currentStepId: scene.steps[0]?.id ?? 'start',
    completedSteps: [],
    objectiveProgress: new Map(),
    // C2：场景变量——scene 数据里的初始 vars 展开进运行时（task 数据可预置变量）
    vars: { ...(scene.vars ?? {}) },
  }
  activeScenes.set(sceneId, runtime)
  await eventBus.emit('scene:started', { sceneId })
  const display = scene.display ?? 'current'
  if (display !== 'hidden') {
    narrativeLog.write(`开始：${scene.title ?? sceneId}`, 'quest', 'quest-system')
  }
  await executeStep(sceneId, runtime.currentStepId)
}

// 注释：执行 step
async function executeStep(sceneId: string, stepId: string): Promise<void> {
  const scene = getScene(sceneId)
  if (!scene) return
  const runtime = activeScenes.get(sceneId)
  if (!runtime) return

  const step = scene.steps.find(s => s.id === stepId)
  if (!step) return

  runtime.currentStepId = stepId

  switch (step.type) {
    case 'dialogue':
      // 注释：先输出内联旁白（如果有）
      if (step.lines) {
        for (const line of step.lines) {
          narrativeLog.write(line, 'dialogue', 'quest-system')
        }
      }
      // 注释：起 conversation（如果有）
      if (step.conversation) {
        const ref = typeof step.conversation === 'string'
          ? parseConversationRef(step.conversation as string)
          : step.conversation as ConversationRef
        await apiSystem.call('dialogue', 'startConversation', ref, step.speaker ?? null)
      }
      if (step.next) await advanceToStep(sceneId, step.next)
      break

    case 'combat':
      // 注释：B3 修复（audit-c I3）——原 allies 传空数组：战斗瞬间"盟友全灭"结束
      // （combat-base checkCombatEnd：allies=[] → alliesAlive=false → 立即 lose），
      // 玩家永远无法参战，on_win/on_lose 永不读取。玩家加入参战者
      await apiSystem.call('combat', 'start', step.enemies ?? [], [gameContext.getContext().player?.id].filter(Boolean) as string[])
      break

    case 'objective':
      runtime.objectiveProgress.set(stepId, 0)
      break

    case 'reward':
      if (step.effects) {
        // C1：步骤执行上下文注入（sourceId + targetIds）
        // uiStore.selectedCharacterId 供 effect 显式写 target='selected' 时解析
        //（effect-system resolveTarget 读 ctx.uiStore?.selectedCharacterId）
        const ctx = buildStepExecCtx(sceneId, step, runtime)
        await apiSystem.call('effect-system', 'execute', step.effects, {
          sourceId: ctx.sourceId,
          _targetIds: ctx.targetIds,
          uiStore: { selectedCharacterId: gameContext.getContext().selectedCharacterId },
        })
      }
      if (step.next) await advanceToStep(sceneId, step.next)
      break

    case 'spawn':
      if (step.next) await advanceToStep(sceneId, step.next)
      break

    case 'condition':
      // 注释：条件分支（2026-08-13 审计修复——原实现从未求值 condition，else 从未处理，
      // 条件任务静默直通 next；AGENTS §31：condition 满足 → next，否则 → else（可选））
      let condOk = true
      if (step.condition) {
        try {
          condOk = conditionEngine.evaluate(step.condition, gameContext.getContext())
        } catch {
          condOk = false
        }
      }
      if (condOk) {
        if (step.next) await advanceToStep(sceneId, step.next)
      } else if (step.else) {
        await advanceToStep(sceneId, step.else)
      }
      break

    case 'scene':
      if (step.scene_id) {
        // 注释：嵌套子 scene——暂停当前，push 到栈
        sceneStack.push({ sceneId, resumeStepId: step.next ?? '' })
        await startScene(step.scene_id)
      } else if (step.next) {
        await advanceToStep(sceneId, step.next)
      }
      break

    case 'goto':
      if (step.target) await advanceToStep(sceneId, step.target)
      break

    case 'script': {
      // C3：脚本步骤——瞬间逻辑，返回值决定下一步
      const execCtx = buildStepExecCtx(sceneId, step, runtime)
      const scriptCode = modLoader.getMod()?.scripts?.get(step.script ?? '')
      let result: any = undefined
      if (scriptCode) {
        const ctx = makeScriptCtx(
          sceneId, step.id, step.params ?? {}, execCtx.sourceId, execCtx.targetIds, null,
          (k) => runtime.vars[k], (k, v) => { runtime.vars[k] = v },
        )
        result = await runQuestScript(scriptCode, ctx)
      } else if (step.script) {
        errorReporter.report({
          source: 'quest-system', severity: 'warning',
          message: `任务 '${sceneId}' 步骤 '${step.id}' 引用脚本 '${step.script}' 不存在`,
          suggestion: '检查 mods/{mod}/scripts/ 目录下是否有该文件',
        })
      }
      if (typeof result === 'string') {
        await advanceToStep(sceneId, result)
      } else if (result === false && step.else) {
        await advanceToStep(sceneId, step.else)
      } else if (step.next) {
        await advanceToStep(sceneId, step.next)
      }
      break
    }

    default:
      if (step.next) await advanceToStep(sceneId, step.next)
  }
}

// 注释：C1——构建步骤执行上下文（sourceId + targetIds）
// step.source：'player' | 'selected' | 角色ID（默认 'player'，即触发者）
// step.target：'player' | 'selected' | 角色ID（默认 UI 选中，无选中回退 player）
function buildStepExecCtx(_sceneId: string, step: any, _runtime: SceneRuntime): { sourceId: string | null; targetIds: string[] } {
  const gc = gameContext.getContext()
  const playerId = gc.player?.id ?? null
  const selected = gc.selectedCharacterId ?? null
  const resolveOne = (v: string | undefined): string | null => {
    if (!v) return null
    if (v === 'player') return playerId
    if (v === 'selected') return selected
    return v // 角色 ID 直传
  }
  const sourceId = resolveOne(step.source) ?? playerId
  const targetIds = [resolveOne(step.target) ?? selected ?? playerId].filter(Boolean) as string[]
  return { sourceId, targetIds }
}

// 注释：推进到指定 step
async function advanceToStep(sceneId: string, nextStepId: string): Promise<void> {
  const runtime = activeScenes.get(sceneId)
  if (!runtime) return
  runtime.completedSteps.push(runtime.currentStepId)

  const scene = getScene(sceneId)
  if (!scene) return

  const nextStep = scene.steps.find(s => s.id === nextStepId)
  if (!nextStep) {
    // 注释：没有下一步 → scene 完成
    await completeScene(sceneId)
    return
  }

  await eventBus.emit('scene:updated', { sceneId, step: nextStepId })
  await executeStep(sceneId, nextStepId)
}

// 注释：标记 scene 完成
async function completeScene(sceneId: string): Promise<void> {
  activeScenes.delete(sceneId)
  gameContext.addCompletedScene(sceneId)

  const scene = getScene(sceneId)
  await eventBus.emit('scene:completed', { sceneId })

  if (scene) {
    narrativeLog.write(`完成：${scene.title ?? sceneId}`, 'quest', 'quest-system')
  }

  // 注释：如果是从嵌套场景回来的，pop 回父 scene
  if (sceneStack.length > 0) {
    const parent = sceneStack.pop()
    if (parent && activeScenes.has(parent.sceneId)) {
      if (parent.resumeStepId) {
        await advanceToStep(parent.sceneId, parent.resumeStepId)
      }
    }
  }
}

// 注释：检查 objective 推进
async function checkObjectives(objectiveType: string, payload: any): Promise<void> {
  for (const [sceneId, runtime] of activeScenes) {
    const scene = getScene(sceneId)
    if (!scene) continue
    const step = scene.steps.find(s => s.id === runtime.currentStepId)
    if (!step || step.type !== 'objective') continue
    const obj = step.objective
    if (!obj || obj.type !== objectiveType) continue

    let matched = false
    switch (objectiveType) {
      case 'reach_location':
        matched = obj.target === payload.target
        break
      case 'kill_count':
        // 注释：2026-08-12 全面审计 I4 修复——原恒 true（任何战斗都推进，假绿）。
        // 现按"玩家方胜利 + 目标敌人参战"累计（combat:end payload {winner:'allies'|'enemies',
        // outcome, participants} 无击杀明细——按场次累计是近似，语义如实标注）。
        // obj: { type="kill_count", target=敌人id, count=N }
        if (payload.winner === 'allies' && payload.outcome === 'win'
            && (payload.participants ?? []).includes(obj.target)) {
          const cur = (runtime.objectiveProgress.get(step.id) ?? 0) + 1
          runtime.objectiveProgress.set(step.id, cur)
          matched = cur >= (obj.count ?? 1)
        }
        break
      case 'collect_items':
        // 注释：2026-08-12 全面审计 I4 修复——原恒 true。现按 itemId 匹配 + count 累计
        // （item:added payload {character, itemId, count}）。
        if (payload?.itemId === obj.item) {
          const cur = (runtime.objectiveProgress.get(step.id) ?? 0) + (payload?.count ?? 1)
          runtime.objectiveProgress.set(step.id, cur)
          matched = cur >= (obj.count ?? 1)
        }
        break
      case 'talk_to':
        matched = obj.character === payload.character
        break
    }

    if (matched && step.next) {
      await advanceToStep(sceneId, step.next)
    }
  }
}

// 注释：C4——custom objective 检查（事件驱动脚本化目标，独立于 checkObjectives）
// objective = { type="custom", event, script, params, fail_event?, on_fail? }
// 脚本签名 (payload, ctx) => 'done' | 'pending'：'done' → 走 next；
// fail_event 触发且脚本返回 'pending' → 走 on_fail（无 on_fail → 继续挂起）
// 计数等状态存场景变量（runtime.vars）——任务间通信/存档随 activeScenes 持久化
async function checkCustomObjectives(eventType: string, payload: any): Promise<void> {
  for (const [sceneId, runtime] of activeScenes) {
    const scene = getScene(sceneId)
    if (!scene) continue
    const step = scene.steps.find(s => s.id === runtime.currentStepId)
    if (!step || step.type !== 'objective') continue
    const obj = step.objective
    if (!obj || obj.type !== 'custom') continue
    if (obj.fail_event && eventType === obj.fail_event) {
      // 注释：失败事件——脚本判 pending → on_fail；on_fail 缺省 = 静默继续挂起
      const scriptCode = modLoader.getMod()?.scripts?.get(obj.script ?? '')
      const execCtx = buildStepExecCtx(sceneId, step, runtime)
      const ctx = makeScriptCtx(sceneId, step.id, obj.params ?? {}, execCtx.sourceId, execCtx.targetIds, payload,
        (k) => runtime.vars[k], (k, v) => { runtime.vars[k] = v })
      let result: any = 'pending'
      if (scriptCode) result = await runQuestScript(scriptCode, ctx)
      else if (obj.script) reportMissingCustomScript(sceneId, step.id, obj.script)
      if (result !== 'done' && obj.on_fail) {
        await advanceToStep(sceneId, obj.on_fail)
      }
      continue
    }
    if (eventType !== obj.event) continue
    const scriptCode = modLoader.getMod()?.scripts?.get(obj.script ?? '')
    const execCtx = buildStepExecCtx(sceneId, step, runtime)
    const ctx = makeScriptCtx(sceneId, step.id, obj.params ?? {}, execCtx.sourceId, execCtx.targetIds, payload,
      (k) => runtime.vars[k], (k, v) => { runtime.vars[k] = v })
    let result: any = 'pending'
    if (scriptCode) result = await runQuestScript(scriptCode, ctx)
    else if (obj.script) reportMissingCustomScript(sceneId, step.id, obj.script)
    if (result === 'done' && step.next) {
      await advanceToStep(sceneId, step.next)
    }
  }
}

// 注释：custom objective 引用脚本不存在 → 去重上报（2026-08-14 review Minor-1——
// 原实现静默 pending 导致任务永久挂起且零诊断，违反"禁止静默失败"铁律。
// 与 script 步骤（executeStep case 'script'）的缺失分支对齐，仅多一次性去重）
const reportedMissingCustomScripts = new Set<string>()

function reportMissingCustomScript(sceneId: string, stepId: string, script: string): void {
  const key = `${sceneId}|${stepId}|${script}`
  if (reportedMissingCustomScripts.has(key)) return
  reportedMissingCustomScripts.add(key)
  errorReporter.report({
    source: 'quest-system', severity: 'warning',
    message: `任务 '${sceneId}' 步骤 '${stepId}' 的 custom objective 引用脚本 '${script}' 不存在（目标将保持挂起）`,
    suggestion: '检查 mods/{mod}/scripts/ 目录下是否有该文件',
  })
}

// 注释：检查所有 scene 的 auto_start_condition / condition
function checkAutoStart(): void {
  const mod = modLoader.getMod()
  if (!mod) return
  for (const [id, scene] of mod.quests) {
    if (activeScenes.has(id)) continue
    if (gameContext.isCompleted(id)) continue
    const cond = scene.auto_start_condition ?? scene.condition
    if (!cond) continue
    // 2026-08-09 example-mod 验证修复：原为 TODO 死代码（auto_start_condition 从不求值，
    // 任务永不自动开始）→ 用条件引擎真实求值
    // 2026-08-13 审计：原 catch 写 narrativeLog（违规 + 无去重刷屏）→ errorReporter 去重上报
    try {
      if (conditionEngine.evaluate(cond, gameContext.getContext())) {
        startScene(id)
      }
    } catch (err) {
      if (!reportedAutoStartErrors.has(id)) {
        reportedAutoStartErrors.add(id)
        errorReporter.report({
          source: 'quest-system',
          severity: 'warning',
          message: `任务 '${id}' 的 auto_start 条件求值失败（任务不会自动开始）：${err instanceof Error ? err.message : String(err)}`,
          suggestion: '检查 auto_start_condition 表达式（字段路径/前提拼写）',
        })
      }
    }
  }
}

// 注释：auto_start 条件求值失败去重上报（2026-08-13 审计）
const reportedAutoStartErrors = new Set<string>()

// 注释：trigger condition 求值失败去重上报（2026-08-14 review Important-1——
// 原 command hook 空 catch 静默失败：触发器永不触发且零诊断，违反"禁止静默失败"铁律。
// 镜像 checkAutoStart 的 reportedAutoStartErrors 模式；key = sceneId + condition（同场景
// 多个坏条件各自上报一次））
const reportedTriggerCondErrors = new Set<string>()

// 注释：C6——构建触发器索引（triggers 声明 → command hook + dialogue_end 索引）
// 调用时机：onEnable（初始）/ game:load（读档后 mod.quests 重建）/ reindexTriggers API
// command 拦截语义：条件满足时指令改道执行场景、指令自身 effects/handler 不执行；
// 同一 command 多个 hook 条件同时满足 → errorReporter 报错 + 不拦截（走指令默认行为）
function buildTriggerIndex(): void {
  clearCommandHooks()
  dialogueEndTriggers.clear()
  const mod = modLoader.getMod()
  if (!mod) return
  const perCommand = new Map<string, { sceneId: string; condition?: string }[]>()
  for (const [sceneId, scene] of mod.quests) {
    for (const trig of scene.triggers ?? []) {
      if (trig.type === 'command' && trig.command) {
        const list = perCommand.get(trig.command) ?? []
        list.push({ sceneId, condition: trig.condition })
        perCommand.set(trig.command, list)
      } else if (trig.type === 'dialogue_end' && trig.character) {
        const list = dialogueEndTriggers.get(trig.character) ?? []
        list.push(sceneId)
        dialogueEndTriggers.set(trig.character, list)
      }
    }
  }
  for (const [commandId, hooks] of perCommand) {
    registerCommandHook(commandId, async (_execCtx: any) => {
      const satisfied: string[] = []
      for (const h of hooks) {
        if (activeScenes.has(h.sceneId) || gameContext.isCompleted(h.sceneId)) continue
        let ok = true
        if (h.condition) {
          try {
            // 注释：条件求值直接用 gameContext.getContext()——条件引擎 selected 路径读
            // ctx.selectedCharacterId（UI 选中已由 bridge 同步进 gameContext），无需从
            // execCtx.uiStore 手工搬运
            ok = conditionEngine.evaluate(h.condition, gameContext.getContext())
          } catch (err) {
            // 注释：Important-1 修复——原空 catch 静默失败（触发器永不触发且零诊断）。
            // 去重上报 warning，ok 保持 false → 不拦截，走指令默认行为（现有语义不变）
            const key = `${h.sceneId}|${h.condition}`
            if (!reportedTriggerCondErrors.has(key)) {
              reportedTriggerCondErrors.add(key)
              errorReporter.report({
                source: 'quest-system',
                severity: 'warning',
                message: `触发场景 '${h.sceneId}' 的指令触发条件求值失败（触发器不会触发）：${err instanceof Error ? err.message : String(err)}`,
                suggestion: '检查 triggers[].condition 表达式（字段路径/前提拼写）',
              })
            }
            ok = false
          }
        }
        if (ok) satisfied.push(h.sceneId)
      }
      if (satisfied.length === 0) return false
      if (satisfied.length > 1) {
        errorReporter.report({
          source: 'quest-system', severity: 'error',
          message: `指令 '${commandId}' 的多个触发条件同时满足：${satisfied.join(', ')}`,
          suggestion: '调整触发条件的互斥性（如 selected.id 判断），只保留一个场景命中',
        })
        return false // 冲突 → 不拦截，走指令默认行为
      }
      await startScene(satisfied[0])
      return true
    })
  }
}

function getScene(sceneId: string): Quest | undefined {
  // 注释：动态 scene 优先（confinement 追捕委托——运行时构造）
  const dyn = dynamicScenes.get(sceneId)
  if (dyn) return dyn
  const mod = modLoader.getMod() as any
  return mod?.quests?.get?.(sceneId) as Quest | undefined
}


