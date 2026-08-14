// 注释：quest-system 插件——任务剧情系统（统一 scene 管理）接线层（W1 拆分）
// 职责：插件生命周期（onLoad/onEnable）、API 注册、事件订阅、存档 provider 注册。
// 执行语义在 runtime.ts（场景生命周期/步骤执行/事件驱动推进）；
// 触发器索引与延迟校验在 triggers.ts；存档序列化在 persistence.ts；上报 helper 在 report.ts。

import type { PluginContext } from '../../core/types'
import { eventBus } from '../../core/event-bus'
import { modLoader } from '../../core/mod-loader'
import { effectTypeRegistry } from '../../core/effect-type-registry'
import { gameContext } from '../../core/game-context'
import { errorReporter } from '../../core/error-reporter'
import type { Quest } from '../../core/mod-loader'
import { validateSceneSteps } from '../../core/mod-loader'
import { registerGameStateProvider } from '../../core/save-system'
import {
  activeScenes, startScene, advanceToStep, checkAutoStart, checkObjectives,
  checkCustomObjectives, getCurrentStep, CUSTOM_EVENT_TYPES, dynamicScenes,
} from './runtime'
import { buildTriggerIndex, validateQuestTriggerConditions, getDialogueEndTriggerSceneIds } from './triggers'
import { serializeQuestState, restoreQuestState } from './persistence'
import { reportMissingEffectParam, reportSetVarIssue } from './report'

export function onLoad(_ctx: PluginContext): void {
  // 注释：start_scene——后台激活 scene（不打断当前操作），event 和 quest 通用
  effectTypeRegistry.register('start_scene', async (params: any) => {
    const sceneId = params.scene as string
    if (!sceneId) {
      reportMissingEffectParam('start_scene', 'scene')
      return true
    }
    await startScene(sceneId)
    return true
  })

  // 注释：start_quest——start_scene 的别名，向后兼容
  effectTypeRegistry.register('start_quest', async (params: any) => {
    const questId = params.quest as string
    if (!questId) {
      reportMissingEffectParam('start_quest', 'quest')
      return true
    }
    await startScene(questId)
    return true
  })

  // 注释：set_var——C2 写场景变量（任务间通信走数据）
  // params: { scene?, var, value }——scene 省略 = 最新激活场景
  effectTypeRegistry.register('set_var', async (params: any) => {
    const sceneId = params.scene ?? Array.from(activeScenes.keys()).pop()
    const r = sceneId ? activeScenes.get(sceneId) : undefined
    // 注释：var 键缺失 → 去重 warning（原静默创建键名 "undefined" 的条目 =
    // 数据污染，条件路径 quest.{id}.var.undefined 才能读到）
    if (params.var === undefined || params.var === null || params.var === '') {
      reportSetVarIssue(`${String(sceneId ?? '')}|<missing>`, 'set_var 缺少 var 键（变量名不能为空，未写入）')
      return true
    }
    if (r) {
      r.vars[params.var] = params.value
    } else if (params.scene != null) {
      // 注释：显式指定场景但不存在/未激活 → 去重 warning（任务间通信写丢失零诊断
      // 不可接受；省略 scene 的隐式目标保持静默——无活跃场景是合法状态）
      reportSetVarIssue(
        `${params.scene}|${params.var}`,
        `set_var 目标场景 '${params.scene}' 不存在或未激活（变量 '${params.var}' 未写入）`,
      )
    }
    return true
  })

  // 注释：C4——custom objective 监听（onLoad 注册，每次插件加载一次）
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
    // 注释：场景变量读写（同步——条件引擎 resolvePath 同步求值链直接调用；
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
    // 注释：M3——自动启动统一入口（求值所有未开始场景的 condition/
    // auto_start_condition，满足即启动；dialogue 口上链也经此转发）
    checkAutoStart: async (): Promise<void> => {
      await checkAutoStart()
    },
    // 注释：运行时注册动态 scene（confinement-system 追捕委托）——
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
    // 注释：重建触发器索引（新增/删除带 triggers 的任务后调用）
    reindexTriggers: (): void => {
      buildTriggerIndex()
    },
    // 注释：C7——运行时注册 scene（动态/制式任务生成入口）——写入 mod.quests，
    // 数据走与 TOML 任务同一套校验/执行链路。与 registerDynamicScene 的区别：
    // 本 API 注册的 scene 持久进 mod.quests（会话内），且立即重建触发器索引 +
    // 检查 condition 自动触发。跨会话持久需注册方在启动时重建（W5）
    registerScene: async (scene: any): Promise<void> => {
      const mod = modLoader.getMod()
      if (!mod) return
      if (!scene?.id) {
        errorReporter.report({
          source: 'quest-system', severity: 'error',
          message: 'registerScene 失败：场景缺少 id 字段',
          suggestion: '动态任务必须携带 id（唯一标识）',
        })
        return
      }
      if (mod.quests.has(scene.id)) {
        errorReporter.report({
          source: 'quest-system', severity: 'error',
          message: `registerScene 失败：场景 id '${scene.id}' 已存在`,
          suggestion: '动态任务 id 需全局唯一（可加前缀/时间戳）',
        })
        return
      }
      // 注释：空 steps 场景启动后永久 active 无出路——注册即拒绝（空步骤 =
      // 数据错误，静默注册会让任务启动后永远无法推进）
      if (!Array.isArray(scene.steps) || scene.steps.length === 0) {
        errorReporter.report({
          source: 'quest-system', severity: 'error',
          message: `registerScene 失败：场景 '${scene.id}' 的 steps 为空`,
          suggestion: '动态任务至少需要一个步骤（startScene 从 steps[0] 开始）',
        })
        return
      }
      // 注释：与 TOML 路径共用 mod-loader 的 validateSceneSteps（步骤引用/必填
      // 字段/combat 出路等）。校验失败 → error + 拒绝注册
      const sceneErrCount = validateSceneSteps(scene as Quest)
      if (sceneErrCount > 0) {
        errorReporter.report({
          source: 'quest-system', severity: 'error',
          message: `registerScene 失败：场景 '${scene.id}' 存在 ${sceneErrCount} 处步骤图校验错误（已拒绝注册）`,
          suggestion: '修复上述步骤引用/必填字段错误后重新注册（动态场景数据与 TOML 任务同一标准）',
        })
        return
      }
      // 注释：运行时注册 scene 的内嵌对话同步写入 conversations.scene——否则
      // 自引用 scene:{id}/{name} 运行期必 miss（resolveConversation 查不到）
      if (Array.isArray(scene.dialogues) && scene.dialogues.length > 0) {
        let map = mod.conversations.scene.get(scene.id)
        if (!map) {
          map = new Map()
          mod.conversations.scene.set(scene.id, map)
        }
        for (const dlg of scene.dialogues) {
          if (dlg?.id) map.set(dlg.id, { id: dlg.id, nodes: dlg.nodes ?? [] })
        }
      }
      mod.quests.set(scene.id, scene as Quest)
      buildTriggerIndex()   // 新场景的 triggers 立即生效
      try {
        await checkAutoStart()  // 立即检查 condition 自动触发
      } catch (err) {
        errorReporter.report({
          source: 'quest-system',
          severity: 'error',
          message: `registerScene 后自动触发检查失败：${err instanceof Error ? err.message : String(err)}`,
          suggestion: '检查 checkAutoStart 内部场景启动逻辑',
        })
      }
    },
  })

  ctx.events.on('location:enter', async (payload: any) => {
    await checkObjectives('reach_location', { target: payload?.to })
    await checkAutoStart()
  })
  ctx.events.on('combat:end', async (payload: any) => {
    await checkObjectives('kill_count', payload)
    await checkAutoStart()
    // 注释：combat 步骤推进：当前步骤 type=combat 时按 winner/outcome 前进
    //（winner='allies' = 玩家方胜利 → on_win；'enemies' → on_lose；
    // 缺 on_win/on_lose 时沿用 step.next 既有语义；逃跑（无胜负）不推进）
    const playerId = gameContext.getContext().player?.id
    const win = payload?.winner === 'allies' || (playerId != null && payload?.winner === playerId)
    const lose = payload?.winner === 'enemies' || (payload?.outcome === 'lose')
    for (const [sceneId] of activeScenes) {
      const cur = getCurrentStep(sceneId)
      if (!cur) continue
      const { step } = cur
      if (step.type !== 'combat') continue
      // 参与者过滤——scene 的 enemies 与本次战斗 participants 有交集才推进
      const stepEnemies = Array.isArray(step.enemies) ? step.enemies : []
      const participants = Array.isArray(payload?.participants) ? payload.participants : []
      if (!stepEnemies.some((e: string) => participants.includes(e))) continue
      let nextStepId: string | undefined
      if (win) nextStepId = step.on_win ?? step.next
      else if (lose) nextStepId = step.on_lose ?? step.next
      // 空字符串 = 显式结束标记（advanceToStep 找不到目标 → 完成）
      if (nextStepId != null) {
        await advanceToStep(sceneId, nextStepId)
      }
    }
  })
  ctx.events.on('item:added', async (payload: any) => {
    await checkObjectives('collect_items', payload)
  })
  ctx.events.on('dialogue:end', async (payload: any) => {
    await checkObjectives('talk_to', { character: payload?.character })
    await checkAutoStart()
  })
  // 注释：dialogue_end 触发（与既有 talk_to objective 监听并存，职责分离）：
  // 与指定角色对话结束时启动匹配场景（已活跃/已完成 → 跳过）
  ctx.events.on('dialogue:end', async (payload: any) => {
    const sceneIds = getDialogueEndTriggerSceneIds(payload?.character)
    for (const sceneId of sceneIds) {
      if (!activeScenes.has(sceneId) && !gameContext.isCompleted(sceneId)) {
        await startScene(sceneId)
      }
    }
  })

  // 注释：读档后 mod.quests 已重建 → 重建触发器索引
  ctx.events.on('game:load', () => {
    buildTriggerIndex()
  })

  // 注释：初始构建触发器索引（新游戏启动即生效；读档由 game:load 重建，
  // 运行时增删任务由 reindexTriggers API 重建）
  buildTriggerIndex()

  // 注释：B-I-3——触发器条件加载期校验——镜像 validateInstructionData 的延迟校验
  // 模式：game:plugins_loaded 时所有插件 condition_fields/premises 已注册，
  // conditionRegistry 完整。放 buildTriggerIndex 内会在测试/早期环境（registry
  // 未填充）误报，故独立延迟校验 + 迟到指令补挂
  const onPluginsLoaded = (): void => {
    validateQuestTriggerConditions()
    buildTriggerIndex()
    eventBus.off('game:plugins_loaded', onPluginsLoaded)
  }
  eventBus.on('game:plugins_loaded', onPluginsLoaded)

  // 注释：存档 provider——进行中任务进度随存档，读档后重建
  registerGameStateProvider({
    id: 'quest-system',
    serialize: () => serializeQuestState(),
    restore: (data) => {
      restoreQuestState(data as any)
    },
  })
}

// 注释：combat:end 推进用"当前步骤"查询（runtime.getCurrentStep 转发）

