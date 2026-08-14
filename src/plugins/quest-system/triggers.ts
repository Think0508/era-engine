// 注释：quest-system 触发器索引与加载期校验（W1 拆分自 index.ts）
// 职责：triggers 声明 → command hook + dialogue_end 索引；延迟校验挂点

import { modLoader } from '../../core/mod-loader'
import { gameContext } from '../../core/game-context'
import { errorReporter } from '../../core/error-reporter'
import { conditionEngine } from '../../core/condition-engine'
import { conditionRegistry } from '../../core/condition-registry'
import { registerCommandHook, clearCommandHooks } from '../../core/command-executor'
import { commandRegistry } from '../../core/command-registry'
import { activeScenes, startScene, CUSTOM_EVENT_TYPES } from './runtime'

// 注释：C6——dialogue_end 触发索引（character → sceneIds），buildTriggerIndex 时重建
export const dialogueEndTriggers = new Map<string, string[]>()

// 注释：C6——构建触发器索引（triggers 声明 → command hook + dialogue_end 索引）
// 调用时机：onEnable（初始）/ game:load（读档后 mod.quests 重建）/ reindexTriggers API
// command 拦截语义：条件满足时指令改道执行场景、指令自身 effects/handler 不执行；
// 同一 command 多个 hook 条件同时满足 → errorReporter 报错 + 不拦截（走指令默认行为）
export function buildTriggerIndex(): void {
  // 注释：owner 隔离：只清本插件注册的 hook（原全局清空会静默清掉其他插件的拦截器）
  clearCommandHooks('quest-system')
  dialogueEndTriggers.clear()
  const mod = modLoader.getMod()
  if (!mod) return
  const perCommand = new Map<string, { sceneId: string; condition?: string }[]>()
  for (const [sceneId, scene] of mod.quests) {
    for (const trig of scene.triggers ?? []) {
      if (trig.type === 'command' && trig.command) {
        // 注释：B-I-3——trigger 引用不存在的指令 → 去重 warning + 不挂 hook
        //（原静默挂载：触发器永不命中且零诊断。加载期无法校验——指令由插件
        // onEnable 注册——在索引构建时补查）
        if (!commandRegistry.getById(trig.command)) {
          errorReporter.reportDedup(`unknown-cmd|${sceneId}|${trig.command}`, {
            source: 'quest-system', severity: 'warning',
            message: `任务 '${sceneId}' 的触发器引用不存在的指令 '${trig.command}'（触发器不会触发）`,
            suggestion: '检查 triggers[].command 是否拼写正确、指令是否已注册（插件 onEnable 注册）',
          })
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
            // 注释：条件求值直接用 gameContext.getContext()——条件引擎 selected
            // 路径读 ctx.selectedCharacterId（UI 选中已由 bridge 同步进 gameContext）
            ok = conditionEngine.evaluate(h.condition, gameContext.getContext())
          } catch (err) {
            // 注释：触发器条件求值失败 → 去重上报（原空 catch 静默失败：触发器
            // 永不触发且零诊断），ok 保持 false → 不拦截，走指令默认行为
            errorReporter.reportDedup(`trigger-cond|${h.sceneId}|${h.condition}`, {
              source: 'quest-system',
              severity: 'warning',
              message: `触发场景 '${h.sceneId}' 的指令触发条件求值失败（触发器不会触发）：${err instanceof Error ? err.message : String(err)}`,
              suggestion: '检查 triggers[].condition 表达式（字段路径/前提拼写）',
            })
            ok = false
          }
        }
        if (ok) satisfied.push(h.sceneId)
      }
      if (satisfied.length === 0) return false
      if (satisfied.length > 1) {
        // 注释：冲突是数据层面的稳定状态，每次执行指令都刷一条 error → 按
        // commandId 去重（原每次执行都报，玩家每点一次刷屏一条）
        errorReporter.reportDedup(`trigger-conflict|${commandId}`, {
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

// 注释：B-I-3——triggers[].condition 加载期校验（延迟到 game:plugins_loaded 执行——
// 此时 conditionRegistry 已完整）。未知字段/未注册前提 → error（违反 §21"加载时
// 校验，禁止静默失效"——原坏条件只在玩家执行指令时才暴露去重 warning，触发器
// 静默失效期间作者无感知）。与 validateInstructionData 同标准同强度。
// audit-e I4：扩展校验所有 scene 的 condition / auto_start_condition（同一挂点统一校验）
// M2：custom objective 事件名合法性（白名单单一来源 = runtime.CUSTOM_EVENT_TYPES）
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
    // 注释：M2——custom objective 事件名合法性校验（白名单单一来源 =
    // runtime.CUSTOM_EVENT_TYPES 监听表，延迟到插件就绪后校验）
    for (const step of scene.steps ?? []) {
      const obj = step.objective
      if (step.type !== 'objective' || obj?.type !== 'custom') continue
      if (typeof obj.event === 'string' && obj.event && !CUSTOM_EVENT_TYPES.includes(obj.event)) {
        errorReporter.report({
          source: 'quest-system',
          severity: 'error',
          message: `任务 '${sceneId}' 步骤 '${step.id}' 的 custom objective 监听了未知事件 '${obj.event}'（目标不会推进）`,
          suggestion: `objective.event 目前可监听：${CUSTOM_EVENT_TYPES.join(' / ')}（事件由各插件发出，新增事件需在 quest-system 注册监听）`,
        })
      }
    }
  }
}

// 注释：供 index.ts 注册 game:load 监听（读档后重建触发器索引）
export function onGameLoad(): void {
  buildTriggerIndex()
}

// 注释：供 index.ts 的 game:plugins_loaded 挂点调用（延迟校验 + 迟到指令补挂）
export function onPluginsLoaded(): void {
  validateQuestTriggerConditions()
  buildTriggerIndex()
}

// 注释：保持 eventBus import 使用（index.ts 的 dialogue_end 触发监听用它查索引）
export function getDialogueEndTriggerSceneIds(character: string): string[] {
  return dialogueEndTriggers.get(character) ?? []
}
