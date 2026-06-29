// 注释：quest-system 插件——任务剧情系统
// 7 种 step 类型 + objective 事件驱动 + auto_start + 任务事件
// 任务状态存 game-state 实体

import type { PluginContext } from '../../core/types'
import { eventBus } from '../../core/event-bus'
import { narrativeLog } from '../../core/narrative-log'
import { modLoader } from '../../core/mod-loader'
import { apiSystem } from '../../core/api'
import { effectTypeRegistry } from '../../core/effect-type-registry'
import type { Quest } from '../../core/mod-loader'

// 注释：任务运行时状态
interface QuestRuntime {
  questId: string
  currentStepId: string
  completedSteps: string[]
  objectiveProgress: Map<string, number>  // stepId → count
}

// 注释：所有活跃任务的运行时状态
const activeQuests = new Map<string, QuestRuntime>()

export function onLoad(_ctx: PluginContext): void {
  // 注释：start_quest effect type
  effectTypeRegistry.register('start_quest', async (params: any) => {
    await startQuest(params.quest)
    return true
  })
}

export function onEnable(ctx: PluginContext): void {
  // 注释：注册 quest API
  ctx.api.register('quest', {
    start: async (questId: string): Promise<void> => {
      await startQuest(questId)
    },
    getActiveQuests: (): string[] => {
      return Array.from(activeQuests.keys())
    },
    getQuestStatus: (questId: string): string => {
      if (activeQuests.has(questId)) return 'active'
      // TODO: 检查已完成列表
      return 'not_started'
    },
    advanceStep: async (questId: string, nextStepId: string): Promise<void> => {
      await advanceToStep(questId, nextStepId)
    },
  })

  // 注释：监听事件 → objective 推进 + auto_start 检查
  ctx.events.on('location:enter', (payload: any) => {
    checkObjectives('reach_location', { target: payload?.to })
    checkAutoStart()
  })
  ctx.events.on('combat:end', (payload: any) => {
    checkObjectives('kill_count', payload)
    checkAutoStart()
  })
  ctx.events.on('item:added', (payload: any) => {
    checkObjectives('collect_items', payload)
  })
  ctx.events.on('dialogue:end', (payload: any) => {
    checkObjectives('talk_to', { character: payload?.character })
    checkAutoStart()
  })
}

// 注释：开始任务
async function startQuest(questId: string): Promise<void> {
  const mod = modLoader.getMod()
  if (!mod) return
  // TODO: mod 加载 quest TOML 文件——当前 mod-loader 未加载 quests
  // 注释：quest 数据需要从 mods/[mod]/quests/ 加载
  // TODO(task-10.2): mod-loader 加载 quest TOML
  const quest = getQuest(questId)
  if (!quest) {
    narrativeLog.write(`任务 '${questId}' 不存在`, 'quest', 'quest-system')
    return
  }

  // 注释：检查前置任务
  if (quest.prerequisites) {
    for (const prereqId of quest.prerequisites) {
      // TODO: 同步检查前置任务状态——当前简化跳过
      void prereqId
    }
  }

  const runtime: QuestRuntime = {
    questId,
    currentStepId: quest.steps[0]?.id ?? 'start',
    completedSteps: [],
    objectiveProgress: new Map(),
  }
  activeQuests.set(questId, runtime)

  await eventBus.emit('quest:started', { questId })
  narrativeLog.write(`任务开始：${quest.title}`, 'quest', 'quest-system')

  // 注释：执行第一个 step
  await executeStep(questId, runtime.currentStepId)
}

// 注释：执行 step
async function executeStep(questId: string, stepId: string): Promise<void> {
  const quest = getQuest(questId)
  if (!quest) return
  const runtime = activeQuests.get(questId)
  if (!runtime) return

  const step = quest.steps.find(s => s.id === stepId)
  if (!step) return

  runtime.currentStepId = stepId

  switch (step.type) {
    case 'dialogue':
      // 注释：委托 dialogue-system
      if (step.character && step.conversation) {
        await apiSystem.call('dialogue', 'startConversation', step.character, step.conversation)
      }
      // 注释：对话结束后跳转 next
      if (step.next) await advanceToStep(questId, step.next)
      break

    case 'combat':
      // 注释：委托 combat-system
      await apiSystem.call('combat', 'start', step.enemies ?? [], [])
      // TODO: 监听 combat:end 判断 on_win/on_lose
      break

    case 'objective':
      // 注释：目标追踪——等待事件自动推进
      runtime.objectiveProgress.set(stepId, 0)
      break

    case 'reward':
      // 注释：执行 effects
      if (step.effects) {
        await apiSystem.call('effect-system', 'execute', step.effects, {})
      }
      if (step.next) await advanceToStep(questId, step.next)
      break

    case 'spawn':
      // TODO: 创建角色/物品
      if (step.next) await advanceToStep(questId, step.next)
      break

    case 'condition':
      // 注释：检查游戏状态分支
      // TODO: condition 求值
      if (step.next) await advanceToStep(questId, step.next)
      break

    case 'goto':
      if (step.target) await advanceToStep(questId, step.target)
      break

    default:
      if (step.next) await advanceToStep(questId, step.next)
  }
}

// 注释：推进到指定 step
async function advanceToStep(questId: string, nextStepId: string): Promise<void> {
  const runtime = activeQuests.get(questId)
  if (!runtime) return
  runtime.completedSteps.push(runtime.currentStepId)

  const quest = getQuest(questId)
  if (!quest) return

  // 注释：检查是否是最后一步
  const nextStep = quest.steps.find(s => s.id === nextStepId)
  if (!nextStep) {
    // 注释：任务完成
    activeQuests.delete(questId)
    await eventBus.emit('quest:completed', { questId })
    narrativeLog.write(`任务完成：${quest.title}`, 'quest', 'quest-system')
    return
  }

  await eventBus.emit('quest:updated', { questId, step: nextStepId })
  await executeStep(questId, nextStepId)
}

// 注释：检查 objective 推进
function checkObjectives(objectiveType: string, payload: any): void {
  for (const [questId, runtime] of activeQuests) {
    const quest = getQuest(questId)
    if (!quest) continue
    const step = quest.steps.find(s => s.id === runtime.currentStepId)
    if (!step || step.type !== 'objective') continue

    const obj = step.objective
    if (!obj || obj.type !== objectiveType) continue

    // 注释：检查目标匹配
    let matched = false
    switch (objectiveType) {
      case 'reach_location':
        matched = obj.target === payload.target
        break
      case 'kill_count':
        // TODO: 按 target 累计击杀数
        matched = true
        break
      case 'collect_items':
        // TODO: 按 item 累计收集数
        matched = true
        break
      case 'talk_to':
        matched = obj.character === payload.character
        break
    }

    if (matched) {
      // 注释：推进到 next
      if (step.next) {
        advanceToStep(questId, step.next)
      }
    }
  }
}

// 注释：检查 auto_start_condition
function checkAutoStart(): void {
  const mod = modLoader.getMod()
  if (!mod) return
  // TODO: 遍历所有 quest 的 auto_start_condition，求值
  // 当前简化——需要 mod-loader 加载 quest 数据
}

// 注释：获取任务定义
// TODO(task-10.2): mod-loader 加载 quests/ 目录的 TOML
function getQuest(questId: string): Quest | undefined {
  const mod = modLoader.getMod() as any
  if (!mod?.quests) return undefined
  return (mod.quests as Map<string, Quest>).get(questId)
}
