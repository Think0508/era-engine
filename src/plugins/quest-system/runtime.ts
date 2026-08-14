// 注释：quest-system 执行核心（W1 拆分自 index.ts）——场景生命周期 + 步骤执行 +
// 事件驱动推进。不变式集中在此文件（F-3 错误隔离 / 循环守卫 / sceneStack 三态）：
// 所有推进路径必经 advanceToStep → executeStep（两层咽喉），错误隔离在 executeStep。

import { eventBus } from '../../core/event-bus'
import { narrativeLog } from '../../core/narrative-log'
import { modLoader } from '../../core/mod-loader'
import { apiSystem } from '../../core/api'
import { gameContext } from '../../core/game-context'
import { errorReporter } from '../../core/error-reporter'
import { conditionEngine } from '../../core/condition-engine'
import type { Quest, ConversationRef } from '../../core/mod-loader'
import { parseConversationRef } from '../../core/mod-loader'
import { runQuestScript, makeScriptCtx } from './script-runner'
import {
  reportMissingCustomScript, reportExecuteStepSkip, reportAdvanceStepSkip,
  reportScriptResultWarning,
} from './report'

// 注释：scene 运行时状态
export interface SceneRuntime {
  sceneId: string
  currentStepId: string
  completedSteps: string[]
  objectiveProgress: Map<string, number>
  vars: Record<string, any>      // C2：场景变量
  stepAdvanceCount: number      // I-1：步骤推进计数（循环守卫）
}

// 注释：步骤推进循环守卫——script 步骤返回自身 step id（或 script/condition/goto
// 跨步互指成环）会 advanceToStep → executeStep 无限异步递归，游戏永久卡 EXECUTING 且零诊断。
// 超过该次数 → 上报 error + completeScene 终结（防卡死）
const MAX_STEP_ADVANCES = 100

// 注释：所有活跃 scene 的运行时
export const activeScenes = new Map<string, SceneRuntime>()
// 注释：嵌套场景栈——push 子 scene 时暂停父，完成后 pop。
// 条目记录 {parent, child, resumeStepId}——child = push 时实际启动的子 scene id；
// completeScene 只在 栈顶.child === 完成者 时 pop（原无条件 pop：非嵌套 scene 完成
// 会弹错父；且子 scene 无法启动时父永久挂起 + 栈条目泄漏）。旧存档格式
// {sceneId, resumeStepId} 恢复时兼容。
// resumeStepId 三态：'' = 子完成即结束父；string = 恢复推进；
// undefined = 父保持挂起——push 与 restore 都必须保留 undefined（勿 ?? ''）
export const sceneStack: { parent: string; child: string; resumeStepId: string | undefined }[] = []
// 注释：运行时注册的动态 scene（confinement-system 追捕委托用）——mod.quests 是
// TOML 静态数据，动态敌人（逃犯 id）写不进去 → 本表运行时注册，getScene 优先查本表。
// 存档恢复：动态 scene 由注册方（confinement）的 provider 恢复后重新注册，本表不随
// 存档序列化（activeScenes 持久化引用 sceneId，读档后若动态 scene 未恢复 →
// getScene 返回 undefined → 任务无法推进——注册方负责在 restore 时按原样重建）
const dynamicScenes = new Map<string, Quest>()
export { dynamicScenes }

// 注释：C4——custom objective 事件监听——objective 声明监听什么事件，脚本只做匹配逻辑
// h:orgasm / h:end 由 h-core 发出；现有标准事件（location:enter 等）由既有监听覆盖。
// 白名单单一来源（M2）——triggers.ts 的延迟校验按此表校验事件名合法性
export const CUSTOM_EVENT_TYPES = ['h:orgasm', 'h:end']

// 注释：M3（audit-i）——脚本执行上下文构造统一入口（script 步骤 + custom objective
// 共用；内部已含 buildStepExecCtx 的 sourceId/targetIds 解析与 vars 读写绑定。
// params 来源：script 步骤 = step.params；custom objective = obj.params（调用方传入））
export function buildScriptCtx(sceneId: string, step: any, runtime: SceneRuntime, payload: any, params?: Record<string, any>): any {
  const execCtx = buildStepExecCtx(sceneId, step, runtime)
  return makeScriptCtx(
    sceneId, step.id, params ?? step.params ?? {}, execCtx.sourceId, execCtx.targetIds, payload,
    (k) => runtime.vars[k], (k, v) => { runtime.vars[k] = v },
  )
}

// 注释：custom objective 脚本执行（event/fail_event 两分支共用；脚本缺失 →
// 去重上报 + 返回 'pending' 保持挂起）
async function runObjectiveScript(sceneId: string, step: any, runtime: SceneRuntime, obj: any, payload: any): Promise<any> {
  const scriptCode = modLoader.getMod()?.scripts?.get(obj.script ?? '')
  if (scriptCode) {
    return await runQuestScript(scriptCode, buildScriptCtx(sceneId, step, runtime, payload, obj.params))
  }
  if (obj.script) reportMissingCustomScript(sceneId, step.id, obj.script)
  return 'pending'
}

// 注释：后台激活 scene（不打断当前）
export async function startScene(sceneId: string): Promise<void> {
  const mod = modLoader.getMod()
  if (!mod) return
  const scene = getScene(sceneId)
  if (!scene) {
    // 注释：Scene 引用不存在 = 数据错误（原仅用户提示，审计补上报）
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
    stepAdvanceCount: 0,
    // C2：场景变量——scene 数据里的初始 vars 展开进运行时（task 数据可预置变量）
    vars: { ...(scene.vars ?? {}) },
  }
  activeScenes.set(sceneId, runtime)
  await eventBus.emit('scene:started', { sceneId })
  const display = scene.display ?? 'current'
  if (display !== 'hidden') {
    narrativeLog.write(`开始：${scene.title ?? sceneId}`, 'quest', 'quest-system')
  }
  try {
    await executeStep(sceneId, runtime.currentStepId)
  } catch (err) {
    // 注释：audit-e C3——executeStep 已内部隔离，此处仅防御性兜底：
    // executeStep 前置/回滚链异常时上报 + 回滚（防僵尸活跃场景）
    await rollbackScene(sceneId, err, `任务 '${sceneId}' 启动失败（首步 '${runtime.currentStepId}'）`)
  }
}

// 注释：场景回滚唯一入口：上报（含场景定位）+ completeScene 终结。
// 原两处（启动失败 / 步骤执行失败）各写一份 10 行相同的嵌套 catch——收敛为单函数
async function rollbackScene(sceneId: string, err: unknown, context: string): Promise<void> {
  errorReporter.report({
    source: 'quest-system',
    severity: 'error',
    message: `${context}，场景已回滚为已完成：${err instanceof Error ? err.message : String(err)}`,
    suggestion: '检查步骤引用的系统/API 是否可用（如 dialogue/combat 插件未加载）、步骤数据是否正确',
  })
  try {
    await completeScene(sceneId)
  } catch (rollbackErr) {
    // 注释：回滚本身兜底——completeScene 内部可能再抛（场景已删等），不阻断调用方
    errorReporter.report({
      source: 'quest-system',
      severity: 'error',
      message: `任务 '${sceneId}' 回滚失败：${rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr)}`,
      suggestion: '检查 completeScene 内部逻辑（activeScenes 状态是否已损坏）',
    })
  }
}

// 注释：执行 step
export async function executeStep(sceneId: string, stepId: string): Promise<void> {
  // 注释：按 stepId 参数定位（≠ runtime.currentStepId——advanceToStep 推进后
  // currentStepId 尚未更新，getCurrentStep 只用于"当前步骤"查询场景）
  const scene = getScene(sceneId)
  if (!scene) {
    // 注释：A-I-4——静默早退 → 僵尸活跃场景（动态 scene 未恢复 / 已注销）——
    // 原裸 return 零诊断：任务永久卡在 activeScenes，存档持续携带
    reportExecuteStepSkip(sceneId, stepId, '场景不存在')
    return
  }
  const runtime = activeScenes.get(sceneId)
  if (!runtime) {
    reportExecuteStepSkip(sceneId, stepId, '场景未激活')
    return
  }
  const step = scene.steps.find(s => s.id === stepId)
  if (!step) {
    reportExecuteStepSkip(sceneId, stepId, '步骤不存在')
    return
  }

  runtime.currentStepId = stepId

  try {
    await executeStepBody(sceneId, stepId, step, runtime)
  } catch (err) {
    // 注释：F-3——步骤执行抛错 → 就地隔离：上报（场景+步骤准确定位）+ 回滚。
    // 原错误沿嵌套链上抛（子场景 startScene catch 误归因给子、重复 completeScene、
    // 父僵尸）——executeStep 是执行唯一咽喉点，在此隔离后嵌套/恢复链全部安全
    await rollbackScene(sceneId, err, `任务 '${sceneId}' 步骤 '${stepId}' 执行失败`)
  }
}

// 注释：取当前场景/运行时/步骤（三查合一；"当前步骤"查询场景共用——
// 事件驱动推进（checkObjectives 等）与 combat:end handler 使用）
export function getCurrentStep(sceneId: string): { scene: Quest; runtime: SceneRuntime; step: any } | null {
  const scene = getScene(sceneId)
  if (!scene) return null
  const runtime = activeScenes.get(sceneId)
  if (!runtime) return null
  const step = scene.steps.find(s => s.id === runtime.currentStepId)
  if (!step) return null
  return { scene, runtime, step }
}

// 注释：步骤执行主体——各 case 只做"执行自己的动作"，返回下一步推进决定
//（string = 推进该步骤；'' = 显式结束标记；undefined = 挂起/事件驱动），
// 外层统一推进一次（8 份 next 守卫拷贝收敛为 1）
async function executeStepBody(sceneId: string, _stepId: string, step: any, runtime: SceneRuntime): Promise<void> {
  const follow = await dispatchStep(sceneId, step, runtime)
  if (follow != null) await advanceToStep(sceneId, follow)
}

async function dispatchStep(sceneId: string, step: any, runtime: SceneRuntime): Promise<string | undefined> {
  switch (step.type) {
    case 'dialogue':
      // 注释：先输出内联旁白（如果有）
      if (step.lines) {
        for (const line of step.lines) {
          narrativeLog.write(line, 'dialogue', 'quest-system')
        }
      }
      // 注释：起 conversation（如果有）——对话开放期间场景继续推进（"对话后"语义
      // 由 objective talk_to / dialogue_end trigger 提供）
      if (step.conversation) {
        const ref = typeof step.conversation === 'string'
          ? parseConversationRef(step.conversation as string)
          : step.conversation as ConversationRef
        await apiSystem.call('dialogue', 'startConversation', ref, step.speaker ?? null)
      }
      return step.next

    case 'combat':
      // 注释：B3 修复——原 allies 传空数组：战斗瞬间"盟友全灭"结束，玩家永远无法
      // 参战，on_win/on_lose 永不读取。玩家加入参战者
      await apiSystem.call('combat', 'start', step.enemies ?? [], [gameContext.getContext().player?.id].filter(Boolean) as string[])
      return undefined  // 事件驱动：combat:end 监听按胜负推进

    case 'objective':
      runtime.objectiveProgress.set(step.id, 0)
      return undefined  // 事件驱动：checkObjectives / checkCustomObjectives 监听

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
      return step.next

    case 'spawn': {
      // 注释：spawn 步骤接线——template/at_location/count → 循环调用
      // character.spawnCharacter 实例化（原空实现：字段写了完全不生效）
      if (!step.template) {
        errorReporter.report({
          source: 'quest-system', severity: 'warning',
          message: `任务 '${sceneId}' 的 spawn 步骤 '${step.id}' 缺少 template 字段（跳过生成）`,
          suggestion: 'spawn 步骤需声明 template（templates/character/ 下的模板 id）',
        })
      } else {
        // 注释：at_location 缺省且当前无地点上下文 → 落到空地点（角色注册在 ''
        // 地图上永远看不到）→ warning + 跳过本次生成
        const atLocation = step.at_location ?? gameContext.getContext().location?.id ?? ''
        if (!atLocation) {
          errorReporter.reportDedup(`spawn-no-location|${sceneId}|${step.id}`, {
            source: 'quest-system', severity: 'warning',
            message: `任务 '${sceneId}' 的 spawn 步骤 '${step.id}' 无法确定生成地点（当前无地点上下文且未声明 at_location，已跳过生成）`,
            suggestion: 'spawn 步骤显式声明 at_location，或确保在进入地点后执行该步骤',
          })
        } else {
          const count = Math.max(1, step.count ?? 1)
          let spawned = 0
          for (let i = 0; i < count; i++) {
            const id = await apiSystem.call('character', 'spawnCharacter', step.template, atLocation)
            if (id) spawned++
          }
          if (spawned === 0) {
            errorReporter.report({
              source: 'quest-system', severity: 'warning',
              message: `任务 '${sceneId}' 的 spawn 步骤 '${step.id}' 未生成任何角色（模板 '${step.template}'）`,
              suggestion: '检查模板是否存在（character-system spawnCharacter 已上报详细原因）',
            })
          }
        }
      }
      return step.next
    }

    case 'condition': {
      // 注释：条件分支（AGENTS §31：condition 满足 → next，否则 → else（可选））
      let condOk = true
      if (step.condition) {
        try {
          condOk = conditionEngine.evaluate(step.condition, gameContext.getContext())
        } catch (err) {
          // 注释：A-I-5——条件求值异常去重上报（原 catch 静默走 else：零诊断）
          condOk = false
          errorReporter.reportDedup(`cond-step|${sceneId}|${step.id}`, {
            source: 'quest-system',
            severity: 'warning',
            message: `任务 '${sceneId}' 步骤 '${step.id}' 的条件求值失败（走 else 分支）：${err instanceof Error ? err.message : String(err)}`,
            suggestion: '检查 condition 表达式（字段路径/前提拼写）',
          })
        }
      }
      return condOk ? step.next : step.else
    }

    case 'scene': {
      // 注释：A-I-1——push 前预检子 scene 可启动性（原无条件 push：子已完成或前置
      // 不满足时 startScene 静默 return → 父永久挂起 + 栈条目泄漏，且该泄漏条目会被
      // 之后任意无关 scene 的完成错误 pop（I-2 级联））
      const childId = step.scene_id
      if (!childId) return step.next
      const { ok, reason } = canStartChildScene(childId)
      if (ok) {
        // 注释：G1-I-1——push 保留 step.next 原值（undefined 不转 ''）：
        // resumeStepId 三态语义——'' = 子完成即结束父；string = 恢复推进；
        // undefined = 父保持挂起（AGENTS §31：省略 next = active 挂起）
        sceneStack.push({ parent: sceneId, child: childId, resumeStepId: step.next })
        await startScene(childId)
        return undefined  // 子完成后由 completeScene 恢复父
      }
      errorReporter.reportDedup(`scene-skip|${sceneId}|${step.id}`, {
        source: 'quest-system', severity: 'warning',
        message: `任务 '${sceneId}' 的 scene 步骤 '${step.id}' 无法启动子场景 '${childId}'（${reason}）`,
        suggestion: '检查子场景是否已完成/前置任务是否满足——父任务按 next 继续',
      })
      return step.next
    }

    case 'goto':
      return step.target

    case 'script': {
      // C3：脚本步骤——瞬间逻辑，返回值决定下一步
      const scriptCode = modLoader.getMod()?.scripts?.get(step.script ?? '')
      let result: any = undefined
      if (scriptCode) {
        result = await runQuestScript(scriptCode, buildScriptCtx(sceneId, step, runtime, null))
      } else if (step.script) {
        errorReporter.report({
          source: 'quest-system', severity: 'warning',
          message: `任务 '${sceneId}' 步骤 '${step.id}' 引用脚本 '${step.script}' 不存在`,
          suggestion: '检查 mods/{mod}/scripts/ 目录下是否有该文件',
        })
      }
      if (typeof result === 'string') return result
      if (result === false && step.else) return step.else
      // 注释：A-M-2/A-M-3——返回值异常去重上报（行为保持文档语义走 next，但作者
      // 笔误（return true / return 1）零痕迹不可接受；null = runQuestScript 内部
      // 错误哨兵（脚本抛错/超时，已上报 error）——不再重复 warning）
      if (result === false) {
        reportScriptResultWarning(sceneId, step.id, '脚本返回 false 且步骤无 else（已按 next 继续）')
      } else if (result !== undefined && result !== null) {
        reportScriptResultWarning(sceneId, step.id, `脚本返回了非 string/false/undefined 值（typeof ${typeof result}，已按 next 继续）`)
      }
      return step.next
    }

    default:
      return step.next
  }
}

// 注释：子场景可启动性判定（scene 步骤预检与 startScene 启动检查共享同一策略——
// 防两处漂移；startScene 自身的启动检查保留（启动时机不同））
export function canStartChildScene(childId: string): { ok: boolean; reason: string } {
  const child = getScene(childId)
  if (!child) return { ok: false, reason: '子场景不存在' }
  if (gameContext.isCompleted(childId)) return { ok: false, reason: '子场景已完成' }
  if (activeScenes.has(childId)) return { ok: false, reason: '子场景已活跃' }
  if (child.prerequisites && !child.prerequisites.every(pre => gameContext.isCompleted(pre))) {
    return { ok: false, reason: '子场景前置条件未满足' }
  }
  return { ok: true, reason: '' }
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

// 注释：推进到指定 step（nextStepId 可缺省——找不到目标步骤 = 场景完成，
// objective 达成但无 next 时按此语义终结场景，而非永久挂起）
export async function advanceToStep(sceneId: string, nextStepId: string | undefined): Promise<void> {
  const runtime = activeScenes.get(sceneId)
  if (!runtime) {
    // 注释：场景被先完成的调用移除（嵌套非 LIFO 完成等竞态）→ 推进静默丢弃。
    // 原裸 return 零痕迹（与 executeStep skip 纪律不一致）→ 去重上报
    reportAdvanceStepSkip(sceneId, nextStepId, '场景未激活（可能已被完成流程移除）')
    return
  }

  // 注释：I-1——循环守卫：每次推进 +1，超过上限 → 上报 + 终结（防 advanceToStep →
  // executeStep 无限递归卡死 EXECUTING；终结后 activeScenes 已删，递归栈逐帧空返）
  runtime.stepAdvanceCount++
  if (runtime.stepAdvanceCount > MAX_STEP_ADVANCES) {
    errorReporter.report({
      source: 'quest-system',
      severity: 'error',
      message: `场景 '${sceneId}' 步骤推进超过 ${MAX_STEP_ADVANCES} 次（当前步骤 '${runtime.currentStepId}'），疑似循环`,
      suggestion: '检查 script 返回值/goto/condition 分支是否成环',
    })
    await completeScene(sceneId)
    return
  }

  runtime.completedSteps.push(runtime.currentStepId)

  const scene = getScene(sceneId)
  if (!scene) {
    // 注释：场景不存在（动态 scene 已注销等竞态）→ 原裸 return 零痕迹
    reportAdvanceStepSkip(sceneId, nextStepId, '场景不存在（可能已被注销）')
    return
  }

  const nextStep = scene.steps.find(s => s.id === nextStepId)
  if (!nextStep) {
    // 注释：没有下一步 → scene 完成
    await completeScene(sceneId)
    return
  }

  await eventBus.emit('scene:updated', { sceneId, step: nextStepId })
  if (nextStepId) await executeStep(sceneId, nextStepId)
}

// 注释：标记 scene 完成
export async function completeScene(sceneId: string): Promise<void> {
  activeScenes.delete(sceneId)
  gameContext.addCompletedScene(sceneId)

  const scene = getScene(sceneId)
  await eventBus.emit('scene:completed', { sceneId })

  if (scene) {
    narrativeLog.write(`完成：${scene.title ?? sceneId}`, 'quest', 'quest-system')
  }

  // 注释：A-I-2——只弹真正嵌套的栈条目：栈顶.child 必须是完成者本身。原无条件
  // pop：非嵌套 scene 在嵌套链挂起期间完成会弹错父（A 挂起→C 完成→弹 B 而非 A；
  // 真正的父条目留在栈上，之后任意完成再次 pop → 同一父被二次恢复、与仍活跃的
  // 子并行执行——奖励/效果双执行）
  const top = sceneStack[sceneStack.length - 1]
  if (top && top.child === sceneId) {
    sceneStack.pop()
    // 注释：F-1——next="" 结束标记在 scene 步骤的空串感知：
    // resumeStepId === ''（子完成后立即结束父）≠ undefined（父保持挂起）。
    // 原 truthy 检查把 '' 与 undefined 混同——子完成后父永久停留 scene 步骤（僵尸）
    if (top.resumeStepId === '' && activeScenes.has(top.parent)) {
      await completeScene(top.parent)
    } else if (top.resumeStepId && activeScenes.has(top.parent)) {
      await advanceToStep(top.parent, top.resumeStepId)
    }
  }
}

// 注释：检查 objective 推进（事件驱动——标准 4 类型；由 index.ts 的事件监听调用）
export async function checkObjectives(objectiveType: string, payload: any): Promise<void> {
  for (const [sceneId, runtime] of activeScenes) {
    const cur = getCurrentStep(sceneId)
    if (!cur) continue
    const { step } = cur
    if (step.type !== 'objective') continue
    const obj = step.objective
    if (!obj || obj.type !== objectiveType) continue

    let matched = false
    switch (objectiveType) {
      case 'reach_location':
        matched = obj.target === payload.target
        break
      case 'kill_count':
        // 注释：按"玩家方胜利 + 目标敌人参战"累计（combat:end payload
        // {winner:'allies'|'enemies', outcome, participants} 无击杀明细——
        // 按场次累计是近似，语义如实标注）
        if (payload.winner === 'allies' && payload.outcome === 'win'
            && (payload.participants ?? []).includes(obj.target)) {
          const curCount = (runtime.objectiveProgress.get(step.id) ?? 0) + 1
          runtime.objectiveProgress.set(step.id, curCount)
          matched = curCount >= (obj.count ?? 1)
        }
        break
      case 'collect_items':
        // 注释：按 itemId 匹配 + count 累计（item:added payload {character, itemId, count}）
        if (payload?.itemId === obj.item) {
          const curCount = (runtime.objectiveProgress.get(step.id) ?? 0) + (payload?.count ?? 1)
          runtime.objectiveProgress.set(step.id, curCount)
          matched = curCount >= (obj.count ?? 1)
        }
        break
      case 'talk_to':
        matched = obj.character === payload.character
        break
    }

    // 注释：audit-e C2——objective 达成但步骤无 next → 无条件 advanceToStep
    //（next undefined → advanceToStep 找不到目标步骤 → completeScene 终结）。
    // 原 `matched && step.next`：无 next 时什么都不做 → 场景永久活跃挂起且零上报
    if (matched) {
      await advanceToStep(sceneId, step.next)
    }
  }
}

// 注释：C4——custom objective 检查（事件驱动脚本化目标，独立于 checkObjectives）
// objective = { type="custom", event, script, params, fail_event?, on_fail? }
// 脚本签名 (payload, ctx) => 'done' | 'pending'：'done' → 走 next；
// fail_event 触发且脚本返回 'pending' → 走 on_fail（无 on_fail → 继续挂起）
// 计数等状态存场景变量（runtime.vars）——任务间通信/存档随 activeScenes 持久化
export async function checkCustomObjectives(eventType: string, payload: any): Promise<void> {
  for (const [sceneId, runtime] of activeScenes) {
    const cur = getCurrentStep(sceneId)
    if (!cur) continue
    const { step } = cur
    if (step.type !== 'objective') continue
    const obj = step.objective
    if (!obj || obj.type !== 'custom') continue
    if (obj.fail_event && eventType === obj.fail_event) {
      // 注释：失败事件——脚本判 pending → on_fail；on_fail 缺省 = 静默继续挂起
      const result = await runObjectiveScript(sceneId, step, runtime, obj, payload)
      if (result === 'done') {
        // 注释：A-I-7——fail_event 下脚本判 done = 目标实际已达成——与主路径
        // 一致推进 next（原实现 'done' 分支无处理：objective 无 next 或脚本对
        // 失败负载单独判 done 时 → 场景永久挂起）
        await advanceToStep(sceneId, step.next)
      } else if (obj.on_fail) {
        await advanceToStep(sceneId, obj.on_fail)
      }
      continue
    }
    if (eventType !== obj.event) continue
    const result = await runObjectiveScript(sceneId, step, runtime, obj, payload)
    // 注释：audit-e C2——判 done 后无条件 advanceToStep（next undefined → 走
    // completeScene 终结语义；原 `&& step.next` 无 next 时永久挂起零上报）
    if (result === 'done') {
      await advanceToStep(sceneId, step.next)
    }
  }
}

// 注释：检查所有 scene 的 auto_start_condition / condition（M3：自动启动唯一实现——
// dialogue 口上链也经 checkAutoStart API 转发到本函数）
export async function checkAutoStart(): Promise<void> {
  const mod = modLoader.getMod()
  if (!mod) return
  for (const [id, scene] of mod.quests) {
    if (activeScenes.has(id)) continue
    if (gameContext.isCompleted(id)) continue
    const cond = scene.auto_start_condition ?? scene.condition
    if (!cond) continue
    // 注释：条件求值门控——满足才启动（求值失败 → 去重上报，不阻断其他场景）
    let ok = false
    try {
      ok = conditionEngine.evaluate(cond, gameContext.getContext())
    } catch (err) {
      errorReporter.reportDedup(`auto-start-cond|${id}`, {
        source: 'quest-system',
        severity: 'warning',
        message: `任务 '${id}' 的 auto_start 条件求值失败（任务不会自动开始）：${err instanceof Error ? err.message : String(err)}`,
        suggestion: '检查 auto_start_condition 表达式（字段路径/前提拼写）',
      })
    }
    if (!ok) continue
    try {
      // 注释：A-I-6——await + 隔离（原 fire-and-forget：startScene 抛错 →
      // unhandled rejection，任务静默卡步骤且零诊断。executeStep 已内部隔离，
      // 此处兜底前置缝）
      await startScene(id)
    } catch (err) {
      errorReporter.report({
        source: 'quest-system',
        severity: 'error',
        message: `任务 '${id}' 自动开始失败：${err instanceof Error ? err.message : String(err)}`,
        suggestion: '检查任务步骤引用的系统/API 是否可用（如 dialogue/combat 插件未加载）',
      })
    }
  }
}

export function getScene(sceneId: string): Quest | undefined {
  // 注释：动态 scene 优先（confinement 追捕委托——运行时构造）
  const dyn = dynamicScenes.get(sceneId)
  if (dyn) return dyn
  const mod = modLoader.getMod() as any
  return mod?.quests?.get?.(sceneId) as Quest | undefined
}
