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
import { parseConversationRef, validateSceneSteps } from '../../core/mod-loader'
import { conditionEngine } from '../../core/condition-engine'
import { conditionRegistry } from '../../core/condition-registry'
import { registerCommandHook, clearCommandHooks } from '../../core/command-executor'
import { commandRegistry } from '../../core/command-registry'
import { registerGameStateProvider } from '../../core/save-system'
import { runQuestScript, makeScriptCtx } from './script-runner'

// 注释：scene 运行时状态
interface SceneRuntime {
  sceneId: string
  currentStepId: string
  completedSteps: string[]
  objectiveProgress: Map<string, number>
  vars: Record<string, any>      // C2：场景变量
  stepAdvanceCount: number      // I-1：步骤推进计数（循环守卫）
}

// 注释：I-1——步骤推进循环守卫——script 步骤返回自身 step id（或 script/condition/goto
// 跨步互指成环）会 advanceToStep → executeStep 无限异步递归，游戏永久卡 EXECUTING 且零诊断。
// 超过该次数 → 上报 error + completeScene 终结（防卡死）
const MAX_STEP_ADVANCES = 100

// 注释：所有活跃 scene 的运行时
const activeScenes = new Map<string, SceneRuntime>()
// 注释：嵌套场景栈——push 子 scene 时暂停父，完成后 pop。
// A-I-1/A-I-2（audit-a I-1/I-2）：条目记录 {parent, child, resumeStepId}——
// child = push 时实际启动的子 scene id；completeScene 只在 栈顶.child === 完成者
// 时 pop（原无条件 pop：非嵌套 scene 完成会弹错父；且子 scene 无法启动时父
// 永久挂起 + 栈条目泄漏）。旧存档格式 {sceneId, resumeStepId} 恢复时兼容
const sceneStack: { parent: string; child: string; resumeStepId: string }[] = []
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
    if (!sceneId) {
      // 注释：audit-e M3——缺参静默返回零痕迹 → 去重 warning（不阻断）
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
    // 注释：audit-e M2——var 键缺失 → 去重 warning（原静默创建键名 "undefined" 的
    // 条目 = 数据污染，条件路径 quest.{id}.var.undefined 才能读到）
    if (params.var === undefined || params.var === null || params.var === '') {
      const key = `${String(sceneId ?? '')}|<missing>`
      if (!reportedSetVarMissing.has(key)) {
        reportedSetVarMissing.add(key)
        errorReporter.report({
          source: 'quest-system', severity: 'warning',
          message: `set_var 缺少 var 键（变量名不能为空，未写入）`,
          suggestion: 'set_var 的 params 需声明 var = "变量名"（任务间通信写读同一键名）',
        })
      }
      return true
    }
    if (r) {
      r.vars[params.var] = params.value
    } else if (params.scene != null) {
      // 注释：B-M-12/A-M-9（audit-b M-12 / audit-a M-9）——显式指定场景但不存在/
      // 未激活 → 去重 warning（任务间通信写丢失零诊断不可接受；省略 scene 的
      // 隐式目标保持静默——无活跃场景是合法状态）
      const key = `${params.scene}|${params.var}`
      if (!reportedSetVarMissing.has(key)) {
        reportedSetVarMissing.add(key)
        errorReporter.report({
          source: 'quest-system', severity: 'warning',
          message: `set_var 目标场景 '${params.scene}' 不存在或未激活（变量 '${params.var}' 未写入）`,
          suggestion: '检查 set_var 的 scene 参数——任务间通信只能写活跃场景的变量',
        })
      }
    }
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
    // 注释：C7——运行时注册 scene（动态/制式任务生成入口）——写入 mod.quests，
    // 数据走与 TOML 任务同一套校验/执行链路。与 registerDynamicScene 的区别：
    // 本 API 注册的 scene 持久进 mod.quests（后续 start/getSceneStatus 等 API 生效），
    // 且立即重建触发器索引 + 检查 condition 自动触发
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
      // 注释：A-M-7（audit-a M-7）——空 steps 场景启动后永久 active 无出路——
      // 注册即拒绝（空步骤 = 数据错误，静默注册会让任务启动后永远无法推进）
      if (!Array.isArray(scene.steps) || scene.steps.length === 0) {
        errorReporter.report({
          source: 'quest-system', severity: 'error',
          message: `registerScene 失败：场景 '${scene.id}' 的 steps 为空`,
          suggestion: '动态任务至少需要一个步骤（startScene 从 steps[0] 开始）',
        })
        return
      }
      // 注释：audit-e I6——运行时注册路径跳过全部步骤级校验（坏数据直接触发
      // C2/I3 类静默挂起）→ 与 TOML 路径共用 mod-loader 的 validateSceneSteps
      //（步骤引用/必填字段/combat 出路等）。校验失败 → error + 拒绝注册
      const sceneErrCount = validateSceneSteps(scene as Quest)
      if (sceneErrCount > 0) {
        errorReporter.report({
          source: 'quest-system', severity: 'error',
          message: `registerScene 失败：场景 '${scene.id}' 存在 ${sceneErrCount} 处步骤图校验错误（已拒绝注册）`,
          suggestion: '修复上述步骤引用/必填字段错误后重新注册（动态场景数据与 TOML 任务同一标准）',
        })
        return
      }
      // 注释：B-M-10（audit-b M-10）——运行时注册 scene 的内嵌对话同步写入
      // conversations.scene——否则自引用 scene:{id}/{name} 运行期必 miss
      //（resolveConversation 查不到 → "对话不存在"warning + 步骤跳步）
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
      buildTriggerIndex()   // C6：新场景的 triggers 立即生效
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
      // 注释：2026-08-15——空字符串 = 显式结束标记（advanceToStep 找不到目标 → 完成）
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

  // 注释：B-I-3（audit-b I-3）——触发器条件加载期校验——镜像 validateInstructionData
  // 的延迟校验模式：game:plugins_loaded 时所有插件 condition_fields/premises 已注册，
  // conditionRegistry 完整（main.ts 在插件加载前已 registerFromAttributes）。
  // 放 buildTriggerIndex 内会在测试/早期环境（registry 未填充）误报，故独立延迟校验
  const onPluginsLoaded = (): void => {
    validateQuestTriggerConditions()
    // 注释：G2-M-8——插件全就绪后重建触发器索引（幂等、owner 隔离）——
    // 覆盖任何迟到注册的指令（模组专属插件 plugin.toml [ui] 指令在 quest-system
    // 之后 onEnable 的场景：首次 buildTriggerIndex 时指令不存在被去重 warning
    // 跳过且不挂 hook，此处一劳永逸补挂）
    buildTriggerIndex()
    eventBus.off('game:plugins_loaded', onPluginsLoaded)
  }
  eventBus.on('game:plugins_loaded', onPluginsLoaded)

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
        stepAdvanceCount: r.stepAdvanceCount,
      })),
      sceneStack: sceneStack.map(s => ({ ...s })),
    }),
    restore: (data) => {
      activeScenes.clear()
      sceneStack.length = 0
      for (const entry of data?.activeScenes ?? []) {
        // 注释：audit-e I9——镜像 sceneStack 循环的对象守卫（原直接 entry.sceneId：
        // null/非对象条目 → TypeError → save-system 按 provider 隔离上报 → 整段恢复
        // 中断，其余进行中任务全部消失且无条目定位）——单条目跳过不中断整段
        if (!entry || typeof entry !== 'object') {
          if (!reportedRestoreEntrySkips.has('bad-active-scene-entry')) {
            reportedRestoreEntrySkips.add('bad-active-scene-entry')
            errorReporter.report({
              source: 'quest-system',
              severity: 'warning',
              message: `读档恢复：activeScenes 含非法条目（${entry === null ? 'null' : typeof entry}，已跳过）——该条目的任务进度可能丢失`,
              suggestion: '存档数据损坏或任务 id 格式异常；其余进行中任务不受影响',
            })
          }
          continue
        }
        activeScenes.set(entry.sceneId, {
          sceneId: entry.sceneId,
          currentStepId: entry.currentStepId,
          completedSteps: Array.isArray(entry.completedSteps) ? entry.completedSteps : [],
          objectiveProgress: new Map(Object.entries(entry.objectiveProgress ?? {})),
          vars: { ...(entry.vars ?? {}) },
          // 注释：A-M-10（audit-a M-10）——循环守卫计数不跨会话持久化（合法长链
          // 任务跨多会话累计推进接近 100 次会在少量推进后误触发守卫终结；守卫价值
          // 在防同帧递归环，存档只发生在 IDLE，循环链执行原子不可中途存档）
          stepAdvanceCount: 0,
        })
        // 注释：A-I-4——读档后 currentStepId 存在性校验——任务文件更新改了 step id
        // （迁移未覆盖）→ 该任务恢复后永远无法推进且零诊断（原静默恢复）
        const scene = getScene(entry.sceneId)
        const step = scene?.steps.find(s => s.id === entry.currentStepId)
        if (!step) {
          errorReporter.report({
            source: 'quest-system',
            severity: 'warning',
            message: `读档恢复：场景 '${entry.sceneId}' 的当前步骤 '${entry.currentStepId}' 不存在（任务可能无法推进）`,
            suggestion: '检查任务数据更新是否改了步骤 id（存档迁移需覆盖步骤 id 变更）',
          })
        }
      }
      for (const s of data?.sceneStack ?? []) {
        // 注释：F-4（audit-f）——坏条目守卫镜像 activeScenes 循环：静默跳过 →
        // 去重 warning（栈条目丢失时嵌套任务恢复状态与存档不符无提示）
        if (!s || typeof s !== 'object') {
          if (!reportedRestoreEntrySkips.has('bad-scene-stack-entry')) {
            reportedRestoreEntrySkips.add('bad-scene-stack-entry')
            errorReporter.report({
              source: 'quest-system',
              severity: 'warning',
              message: `读档恢复：sceneStack 含非法条目（${s === null ? 'null' : typeof s}，已跳过）——嵌套场景恢复状态可能与存档不符`,
              suggestion: '存档数据损坏；其余条目不受影响',
            })
          }
          continue
        }
        // 注释：A-I-1——新条目结构 {parent, child, resumeStepId}（child = push 时
        // 实际启动的子 scene）——completeScene 只弹 child === 完成者的条目。
        // 旧存档 {sceneId, resumeStepId} 兼容：sceneId 语义是**父**（旧 push 代码
        // sceneStack.push({ sceneId, resumeStepId: step.next }) 中 sceneId = 挂起的父，
        // 非子 scene）——旧格式不记录子 id，无法精确恢复嵌套关系：child 置空
        //（completeScene 的 top.child === 完成者恒不匹配 → 条目安全搁置不会误弹），
        // parent 恢复为 sceneId，恢复时发 warning 告知"无法精确恢复"。
        // resumeStepId 缺省保持 undefined（旧格式无 next = 父挂起；勿 ?? '' 否则
        // 被 F-1 的空串结束标记误触发 completeScene(parent)）
        if (s.child !== undefined) {
          sceneStack.push({ parent: s.parent ?? '', child: s.child, resumeStepId: s.resumeStepId ?? '' })
        } else if (s.sceneId !== undefined) {
          sceneStack.push({ parent: s.sceneId, child: '', resumeStepId: s.resumeStepId })
          if (!reportedOldStackRestore.has(String(s.sceneId))) {
            reportedOldStackRestore.add(String(s.sceneId))
            errorReporter.report({
              source: 'quest-system',
              severity: 'warning',
              message: `读档恢复：场景 '${String(s.sceneId)}' 的嵌套栈条目来自旧存档格式（未记录子场景 id，嵌套关系无法精确恢复）`,
              suggestion: '旧格式存档的嵌套任务恢复后可能停在挂起步骤，如遇卡住请重新触发该任务或迁移存档',
            })
          }
        }
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
    // 注释：audit-e C3——executeStep 已内部隔离（F-3），此处仅防御性兜底：
    // executeStep 前置/回滚链异常时上报 + 回滚（防僵尸活跃场景）
    errorReporter.report({
      source: 'quest-system',
      severity: 'error',
      message: `任务 '${sceneId}' 启动失败（首步 '${runtime.currentStepId}'），场景已回滚为已完成：${err instanceof Error ? err.message : String(err)}`,
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
}

// 注释：执行 step
async function executeStep(sceneId: string, stepId: string): Promise<void> {
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
    // 注释：F-3（audit-f）——步骤执行抛错 → 就地隔离：上报（场景+步骤准确定位）+ 回滚。
    // 原错误沿嵌套链上抛（子场景 startScene catch 误归因给子、重复 completeScene、
    // 父僵尸）——executeStep 是推进唯一咽喉点，在此隔离后嵌套/恢复链全部安全
    errorReporter.report({
      source: 'quest-system',
      severity: 'error',
      message: `任务 '${sceneId}' 步骤 '${stepId}' 执行失败，场景已回滚为已完成：${err instanceof Error ? err.message : String(err)}`,
      suggestion: '检查步骤数据（conversation/script/effects 引用）与依赖系统是否可用',
    })
    try {
      await completeScene(sceneId)
    } catch (rollbackErr) {
      errorReporter.report({
        source: 'quest-system',
        severity: 'error',
        message: `任务 '${sceneId}' 回滚失败：${rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr)}`,
        suggestion: '检查 completeScene 内部逻辑（activeScenes 状态是否已损坏）',
      })
    }
  }
}

// 注释：F-3——步骤执行主体（供 executeStep 隔离调用，保持 switch 结构与原实现一致）
async function executeStepBody(sceneId: string, stepId: string, step: any, runtime: SceneRuntime): Promise<void> {
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
      // 注释：2026-08-15——next 空字符串 = 显式结束标记（advanceToStep 找不到目标 → 完成）
      if (step.next != null) await advanceToStep(sceneId, step.next)
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
      // 注释：2026-08-15——next 空字符串 = 显式结束标记
      if (step.next != null) await advanceToStep(sceneId, step.next)
      break

    case 'spawn': {
      // 注释：A-I-3/B-M-11（audit-a I-3 / audit-b M-11）——spawn 步骤接线——
      // template/at_location/count → 循环调用 character.spawnCharacter 实例化。
      // 原空实现：字段写了完全不生效（角色永不出现、任务静默直通，零诊断）
      if (!step.template) {
        errorReporter.report({
          source: 'quest-system', severity: 'warning',
          message: `任务 '${sceneId}' 的 spawn 步骤 '${step.id}' 缺少 template 字段（跳过生成）`,
          suggestion: 'spawn 步骤需声明 template（templates/character/ 下的模板 id）',
        })
      } else {
        // 注释：audit-e I10——at_location 缺省且当前无地点上下文 → 落到空地点
        //（角色注册在 '' 地图上永远看不到，spawned 计数还不报错）→ warning + 跳过本次生成
        const atLocation = step.at_location ?? gameContext.getContext().location?.id ?? ''
        if (!atLocation) {
          const key = `${sceneId}|${step.id}`
          if (!reportedSpawnNoLocation.has(key)) {
            reportedSpawnNoLocation.add(key)
            errorReporter.report({
              source: 'quest-system', severity: 'warning',
              message: `任务 '${sceneId}' 的 spawn 步骤 '${step.id}' 无法确定生成地点（当前无地点上下文且未声明 at_location，已跳过生成）`,
              suggestion: 'spawn 步骤显式声明 at_location，或确保在进入地点后执行该步骤',
            })
          }
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
      // 注释：2026-08-15——next 空字符串 = 显式结束标记
      if (step.next != null) await advanceToStep(sceneId, step.next)
      break
    }

    case 'condition':
      // 注释：条件分支（2026-08-13 审计修复——原实现从未求值 condition，else 从未处理，
      // 条件任务静默直通 next；AGENTS §31：condition 满足 → next，否则 → else（可选））
      let condOk = true
      if (step.condition) {
        try {
          condOk = conditionEngine.evaluate(step.condition, gameContext.getContext())
        } catch (err) {
          // 注释：A-I-5（audit-a I-5）——镜像 checkAutoStart/trigger 的去重上报模式
          // （原 catch 静默走 else：表达式错误零诊断，是唯一还静默的求值点）
          condOk = false
          const key = `${sceneId}|${step.id}`
          if (!reportedConditionStepErrors.has(key)) {
            reportedConditionStepErrors.add(key)
            errorReporter.report({
              source: 'quest-system',
              severity: 'warning',
              message: `任务 '${sceneId}' 步骤 '${step.id}' 的条件求值失败（走 else 分支）：${err instanceof Error ? err.message : String(err)}`,
              suggestion: '检查 condition 表达式（字段路径/前提拼写）',
            })
          }
        }
      }
      if (condOk) {
        // 注释：2026-08-15——next 空字符串 = 显式结束标记
        if (step.next != null) await advanceToStep(sceneId, step.next)
      } else if (step.else) {
        await advanceToStep(sceneId, step.else)
      }
      break

    case 'scene': {
      if (step.scene_id) {
        // 注释：A-I-1（audit-a I-1）——push 前预检子 scene 可启动性（镜像 startScene
        // 的检查逻辑：存在 / 未完成 / 未活跃 / 前置满足）。原无条件 push：子 scene
        // 已完成或前置不满足时 startScene 静默 return → 父永久挂起 + 栈条目泄漏，
        // 且该泄漏条目会被之后任意无关 scene 的完成错误 pop（I-2 级联）
        const child = getScene(step.scene_id)
        const canStart = child != null
          && !gameContext.isCompleted(step.scene_id)
          && !activeScenes.has(step.scene_id)
          && (child.prerequisites == null || child.prerequisites.every(pre => gameContext.isCompleted(pre)))
        if (canStart) {
          // 注释：G1-I-1——push 保留 step.next 原值（undefined 不转 ''）：
          // resumeStepId 三态语义——'' = 子完成即结束父；string = 恢复推进；
          // undefined = 父保持挂起（AGENTS §31：省略 next = active 挂起）。
          // 原 `?? ''` 把省略 next 的 scene 步骤静默转成"结束父"（与恢复路径矛盾）
          sceneStack.push({ parent: sceneId, child: step.scene_id, resumeStepId: step.next })
          await startScene(step.scene_id)
        } else {
          const reason = !child ? '子场景不存在'
            : gameContext.isCompleted(step.scene_id) ? '子场景已完成'
            : activeScenes.has(step.scene_id) ? '子场景已活跃'
            : '子场景前置条件未满足'
          const key = `${sceneId}|${step.id}`
          if (!reportedSceneStepSkips.has(key)) {
            reportedSceneStepSkips.add(key)
            errorReporter.report({
              source: 'quest-system', severity: 'warning',
              message: `任务 '${sceneId}' 的 scene 步骤 '${step.id}' 无法启动子场景 '${step.scene_id}'（${reason}）`,
              suggestion: '检查子场景是否已完成/前置任务是否满足——父任务按 next 继续',
            })
          }
          if (step.next != null) await advanceToStep(sceneId, step.next)
        }
      } else if (step.next != null) {
        await advanceToStep(sceneId, step.next)
      }
      break
    }

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
      } else {
        // 注释：A-M-2/A-M-3（audit-a M-2/M-3）——脚本返回值异常去重上报——
        // 行为保持文档语义（false 无 else / 非 string / undefined 都走 next），
        // 但作者笔误（return true / return 1）零痕迹不可接受。
        // null = runQuestScript 内部错误哨兵（脚本抛错/超时，已上报 error）——不再重复 warning
        if (result === false) {
          reportScriptResultWarning(sceneId, step.id, '脚本返回 false 且步骤无 else（已按 next 继续）')
        } else if (result !== undefined && result !== null) {
          reportScriptResultWarning(sceneId, step.id, `脚本返回了非 string/false/undefined 值（typeof ${typeof result}，已按 next 继续）`)
        }
        // 注释：2026-08-15——next 空字符串 = 显式结束标记
        if (step.next != null) await advanceToStep(sceneId, step.next)
      }
      break
    }

    default:
      // 注释：2026-08-15——next 空字符串 = 显式结束标记
      if (step.next != null) await advanceToStep(sceneId, step.next)
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

// 注释：推进到指定 step（nextStepId 可缺省——找不到目标步骤 = 场景完成，
// audit-e C2 起客观步骤达成但无 next 时按此语义终结场景，而非永久挂起）
async function advanceToStep(sceneId: string, nextStepId: string | undefined): Promise<void> {
  const runtime = activeScenes.get(sceneId)
  if (!runtime) {
    // 注释：audit-e I5——场景被先完成的调用移除（嵌套非 LIFO 完成等竞态）→ 推进
    // 静默丢弃。原裸 return 零痕迹（与 executeStep skip 纪律不一致）→ 去重上报
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
    // 注释：audit-e I5——场景不存在（动态 scene 已注销等竞态）→ 原裸 return 零痕迹
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
async function completeScene(sceneId: string): Promise<void> {
  activeScenes.delete(sceneId)
  gameContext.addCompletedScene(sceneId)

  const scene = getScene(sceneId)
  await eventBus.emit('scene:completed', { sceneId })

  if (scene) {
    narrativeLog.write(`完成：${scene.title ?? sceneId}`, 'quest', 'quest-system')
  }

  // 注释：A-I-2（audit-a I-2）——只弹真正嵌套的栈条目：栈顶.child 必须是完成者
  // 本身。原无条件 pop：非嵌套 scene 在嵌套链挂起期间完成会弹错父（A 挂起→C
  // 完成→弹 B 而非 A；真正的父条目留在栈上，之后任意完成再次 pop → 同一父被
  // 二次恢复、与仍活跃的子并行执行——奖励/效果双执行）
  const top = sceneStack[sceneStack.length - 1]
  if (top && top.child === sceneId) {
    sceneStack.pop()
    // 注释：F-1（audit-f）——next="" 结束标记在 scene 步骤的空串感知：
    // resumeStepId === ''（子完成后立即结束父）≠ undefined（父保持挂起）。
    // 原 truthy 检查把 '' 与 undefined 混同——子完成后父永久停留 scene 步骤（僵尸）
    if (top.resumeStepId === '' && activeScenes.has(top.parent)) {
      await completeScene(top.parent)
    } else if (top.resumeStepId && activeScenes.has(top.parent)) {
      await advanceToStep(top.parent, top.resumeStepId)
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

    // 注释：audit-e C2——objective 达成但步骤无 next → 无条件 advanceToStep
    //（next undefined → advanceToStep 找不到目标步骤 → completeScene 终结，与既有
    // 语义一致）。原 `matched && step.next`：无 next 时什么都不做 → 场景永久活跃
    // 挂起且零上报（条件 quest.{id}.status == 'active' 恒真）
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
      if (result === 'done') {
        // 注释：A-I-7（audit-a I-7）——fail_event 下脚本判 done = 目标实际已达成——
        // 与主路径一致推进 next（原实现 'done' 分支无处理：objective 无 next 或
        // 脚本对 fail 负载单独判 done 时 → 场景永久挂起）
        await advanceToStep(sceneId, step.next)
      } else if (obj.on_fail) {
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
    // 注释：audit-e C2——custom objective 判 done 后无条件 advanceToStep（next
    // undefined → 走 completeScene 终结语义；原 `&& step.next` 无 next 时永久挂起零上报）
    if (result === 'done') {
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
async function checkAutoStart(): Promise<void> {
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
        // 注释：A-I-6（audit-a I-6）——await + 隔离（原 fire-and-forget：
        // startScene 抛错 → unhandled rejection，任务静默卡步骤且零诊断——
        // 依赖插件未加载/API namespace 缺失时触发。镜像 command hook 隔离模式）
        try {
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

// 注释：B-M-12/A-M-9——set_var 显式场景缺失去重上报（key = scene|var）
const reportedSetVarMissing = new Set<string>()

// 注释：A-I-5——condition 步骤求值异常去重上报（key = sceneId|stepId）
const reportedConditionStepErrors = new Set<string>()

// 注释：A-I-4——executeStep 静默早退去重上报（key = sceneId|stepId）
const reportedExecuteStepSkips = new Set<string>()

// 注释：A-I-1——嵌套 scene 步骤不可启动去重上报（key = parentId|stepId）
const reportedSceneStepSkips = new Set<string>()

// 注释：A-M-2/A-M-3——脚本返回值异常去重上报（key = sceneId|stepId|原因）
const reportedScriptResultWarnings = new Set<string>()

// 注释：旧存档 sceneStack 条目恢复去重上报（2026-08-15 audit-d I-1——旧格式
// {sceneId, resumeStepId} 的 sceneId 语义是父场景；恢复为 parent + warning，key = sceneId）
const reportedOldStackRestore = new Set<string>()

// 注释：存档恢复非法条目去重上报（audit-e I9——activeScenes 含 null/非对象条目时
// 单条目跳过不中断整段，去重后只报一次）
const reportedRestoreEntrySkips = new Set<string>()

// 注释：spawn 步骤无地点上下文去重上报（audit-e I10——key = sceneId|stepId）
const reportedSpawnNoLocation = new Set<string>()

// 注释：effect 缺参数去重上报（audit-e M3——key = effectType|param）
const reportedMissingEffectParams = new Set<string>()

function reportMissingEffectParam(effectType: string, param: string): void {
  const key = `${effectType}|${param}`
  if (reportedMissingEffectParams.has(key)) return
  reportedMissingEffectParams.add(key)
  errorReporter.report({
    source: 'quest-system', severity: 'warning',
    message: `效果 ${effectType} 缺少参数 '${param}'（已跳过）`,
    suggestion: `effects 的 params 需声明 ${param} = "任务 id"（作者漏写参数时零痕迹不可接受）`,
  })
}

// 注释：B-I-3——trigger 引用不存在指令去重上报（key = sceneId|command）
const reportedUnknownTriggerCommands = new Set<string>()

// 注释：trigger condition 求值失败去重上报（2026-08-14 review Important-1——
// 原 command hook 空 catch 静默失败：触发器永不触发且零诊断，违反"禁止静默失败"铁律。
// 镜像 checkAutoStart 的 reportedAutoStartErrors 模式；key = sceneId + condition（同场景
// 多个坏条件各自上报一次））
const reportedTriggerCondErrors = new Set<string>()

// 注释：指令多 trigger 冲突去重上报（audit-e I8——key = commandId；冲突为数据层面
// 稳定状态，原每次执行指令都刷 error）
const reportedTriggerConflicts = new Set<string>()

// 注释：C6——构建触发器索引（triggers 声明 → command hook + dialogue_end 索引）
// 调用时机：onEnable（初始）/ game:load（读档后 mod.quests 重建）/ reindexTriggers API
// command 拦截语义：条件满足时指令改道执行场景、指令自身 effects/handler 不执行；
// 同一 command 多个 hook 条件同时满足 → errorReporter 报错 + 不拦截（走指令默认行为）
function buildTriggerIndex(): void {
  // 注释：C2-I-2/B-M-1——owner 隔离：只清本插件注册的 hook（原 clearCommandHooks()
  // 全局清空会静默清掉其他插件注册的拦截器）
  clearCommandHooks('quest-system')
  dialogueEndTriggers.clear()
  const mod = modLoader.getMod()
  if (!mod) return
  const perCommand = new Map<string, { sceneId: string; condition?: string }[]>()
  for (const [sceneId, scene] of mod.quests) {
    for (const trig of scene.triggers ?? []) {
      if (trig.type === 'command' && trig.command) {
        // 注释：B-I-3（audit-c2 I-4）——trigger 引用不存在的指令 → 去重 warning +
        // 不挂 hook（原静默挂载：触发器永不命中且零诊断。加载期无法校验——指令由
        // 插件 onEnable 注册——在索引构建时补查）
        if (!commandRegistry.getById(trig.command)) {
          const key = `${sceneId}|${trig.command}`
          if (!reportedUnknownTriggerCommands.has(key)) {
            reportedUnknownTriggerCommands.add(key)
            errorReporter.report({
              source: 'quest-system', severity: 'warning',
              message: `任务 '${sceneId}' 的触发器引用不存在的指令 '${trig.command}'（触发器不会触发）`,
              suggestion: '检查 triggers[].command 是否拼写正确、指令是否已注册（插件 onEnable 注册）',
            })
          }
          continue
        }
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
    registerCommandHook(commandId, 'quest-system', async (_execCtx: any) => {
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
        // 注释：audit-e I8——冲突是数据层面的稳定状态，每次执行指令都刷一条 error
        // → 按 commandId 去重（原每次执行都报，玩家每点一次刷屏一条）
        if (!reportedTriggerConflicts.has(commandId)) {
          reportedTriggerConflicts.add(commandId)
          errorReporter.report({
            source: 'quest-system', severity: 'error',
            message: `指令 '${commandId}' 的多个触发条件同时满足：${satisfied.join(', ')}`,
            suggestion: '调整触发条件的互斥性（如 selected.id 判断），只保留一个场景命中',
          })
        }
        return false // 冲突 → 不拦截，走指令默认行为
      }
      await startScene(satisfied[0])
      return true
    })
  }
}

// 注释：A-I-4——executeStep 静默早退去重上报（场景不存在/未激活/步骤不存在——
// 原裸 return：任务永久卡在 activeScenes 且零诊断，存档持续携带）
function reportExecuteStepSkip(sceneId: string, stepId: string, reason: string): void {
  const key = `${sceneId}|${stepId}`
  if (reportedExecuteStepSkips.has(key)) return
  reportedExecuteStepSkips.add(key)
  errorReporter.report({
    source: 'quest-system', severity: 'warning',
    message: `任务 '${sceneId}' 步骤 '${stepId}' 无法执行（${reason}，任务可能无法推进）`,
    suggestion: '检查动态场景是否已恢复注册/任务数据步骤 id 是否存在',
  })
}

// 注释：advanceToStep 静默早退去重上报（audit-e I5——场景未激活/不存在时推进被
// 丢弃零痕迹；key = sceneId|nextStepId，镜像 executeStep skip 模式）
const reportedAdvanceStepSkips = new Set<string>()

function reportAdvanceStepSkip(sceneId: string, nextStepId: string | undefined, reason: string): void {
  const key = `${sceneId}|${String(nextStepId ?? '')}`
  if (reportedAdvanceStepSkips.has(key)) return
  reportedAdvanceStepSkips.add(key)
  errorReporter.report({
    source: 'quest-system', severity: 'warning',
    message: `任务 '${sceneId}' 推进到步骤 '${String(nextStepId ?? '')}' 被丢弃（${reason}）`,
    suggestion: '检查嵌套场景完成顺序/动态场景注册生命周期是否与推进时序冲突',
  })
}

// 注释：A-M-2/A-M-3——脚本返回值异常去重上报（key = sceneId|stepId|原因）
function reportScriptResultWarning(sceneId: string, stepId: string, reason: string): void {
  const key = `${sceneId}|${stepId}|${reason}`
  if (reportedScriptResultWarnings.has(key)) return
  reportedScriptResultWarnings.add(key)
  errorReporter.report({
    source: 'quest-system', severity: 'warning',
    message: `任务 '${sceneId}' 步骤 '${stepId}'：${reason}`,
    suggestion: '脚本返回值应为 string（跳转步骤 id）/ false（走 else）/ undefined（走 next）',
  })
}

// 注释：B-I-3——triggers[].condition 加载期校验（延迟到 game:plugins_loaded 执行——
// 此时 conditionRegistry 已完整）。未知字段/未注册前提 → error（违反 §21"加载时
// 校验，禁止静默失效"——原坏条件只在玩家执行指令时才暴露去重 warning，触发器
// 静默失效期间作者无感知）。与 validateInstructionData 同标准同强度。
// audit-e I4：扩展校验所有 scene 的 condition / auto_start_condition（原只有 trigger
// 条件升级为加载期 error，场景条件仍滞后到运行时 checkAutoStart 去重 warning——
// 同一挂点统一校验）
export function validateQuestTriggerConditions(): void {
  const mod = modLoader.getMod()
  if (!mod) return
  for (const [sceneId, scene] of mod.quests) {
    const conds: [string, string][] = []
    if (scene.condition) conds.push(['condition', scene.condition])
    if (scene.auto_start_condition) conds.push(['auto_start_condition', scene.auto_start_condition])
    for (const [kind, cond] of conds) {
      const { ok, unknown } = conditionRegistry.validateExpression(cond)
      if (!ok) {
        errorReporter.report({
          source: 'quest-system',
          severity: 'error',
          message: `任务 '${sceneId}' 的 ${kind} 引用了未注册字段/前提：${unknown.join(', ')}（条件：${cond}，任务不会自动开始）`,
          suggestion: '对照 可用条件属性手册 检查字段路径；premise(X) 需在插件 onLoad 注册（engine API premises.register）',
        })
      }
    }
    for (const trig of scene.triggers ?? []) {
      if (!trig?.condition) continue
      const { ok, unknown } = conditionRegistry.validateExpression(trig.condition)
      if (!ok) {
        errorReporter.report({
          source: 'quest-system',
          severity: 'error',
          message: `任务 '${sceneId}' 的触发器条件引用了未注册字段/前提：${unknown.join(', ')}（条件：${trig.condition}，触发器不会触发）`,
          suggestion: '对照 可用条件属性手册 检查字段路径；premise(X) 需在插件 onLoad 注册（engine API premises.register）',
        })
      }
    }
  }
}

function getScene(sceneId: string): Quest | undefined {
  // 注释：动态 scene 优先（confinement 追捕委托——运行时构造）
  const dyn = dynamicScenes.get(sceneId)
  if (dyn) return dyn
  const mod = modLoader.getMod() as any
  return mod?.quests?.get?.(sceneId) as Quest | undefined
}


