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

// 注释：scene 运行时状态
interface SceneRuntime {
  sceneId: string
  currentStepId: string
  completedSteps: string[]
  objectiveProgress: Map<string, number>
}

// 注释：所有活跃 scene 的运行时
const activeScenes = new Map<string, SceneRuntime>()
// 注释：嵌套场景栈——push 子 scene 时暂停父，完成后 pop
const sceneStack: { sceneId: string; resumeStepId: string }[] = []

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
        await apiSystem.call('effect-system', 'execute', step.effects, {})
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

    default:
      if (step.next) await advanceToStep(sceneId, step.next)
  }
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

function getScene(sceneId: string): Quest | undefined {
  const mod = modLoader.getMod() as any
  return mod?.quests?.get?.(sceneId) as Quest | undefined
}


