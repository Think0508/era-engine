// 注释：quest-system 上报 helper——去重上报统一封装（W1 拆分自 index.ts）
// 全部基于 errorReporter.reportDedup（key 含场景/步骤/表达式定位）

import { errorReporter } from '../../core/error-reporter'

// 注释：custom objective 引用脚本不存在 → 去重上报（原静默 pending 导致任务永久
// 挂起且零诊断——与 script 步骤缺失分支对齐）
export function reportMissingCustomScript(sceneId: string, stepId: string, script: string): void {
  errorReporter.reportDedup(`missing-script|${sceneId}|${stepId}|${script}`, {
    source: 'quest-system', severity: 'warning',
    message: `任务 '${sceneId}' 步骤 '${stepId}' 的 custom objective 引用脚本 '${script}' 不存在（目标将保持挂起）`,
    suggestion: '检查 mods/{mod}/scripts/ 目录下是否有该文件',
  })
}

// 注释：executeStep 静默早退去重上报（场景不存在/未激活/步骤不存在——原裸
// return：任务永久卡在 activeScenes 且零诊断，存档持续携带）
export function reportExecuteStepSkip(sceneId: string, stepId: string, reason: string): void {
  errorReporter.reportDedup(`step-skip|${sceneId}|${stepId}`, {
    source: 'quest-system', severity: 'warning',
    message: `任务 '${sceneId}' 步骤 '${stepId}' 无法执行（${reason}，任务可能无法推进）`,
    suggestion: '检查动态场景是否已恢复注册/任务数据步骤 id 是否存在',
  })
}

// 注释：advanceToStep 静默早退去重上报（场景未激活/不存在时推进被丢弃零痕迹）
export function reportAdvanceStepSkip(sceneId: string, nextStepId: string | undefined, reason: string): void {
  errorReporter.reportDedup(`advance-skip|${sceneId}|${String(nextStepId ?? '')}`, {
    source: 'quest-system', severity: 'warning',
    message: `任务 '${sceneId}' 推进到步骤 '${String(nextStepId ?? '')}' 被丢弃（${reason}）`,
    suggestion: '检查嵌套场景完成顺序/动态场景注册生命周期是否与推进时序冲突',
  })
}

// 注释：脚本返回值异常去重上报（行为保持文档语义走 next，但作者笔误
//（return true / return 1）零痕迹不可接受）
export function reportScriptResultWarning(sceneId: string, stepId: string, reason: string): void {
  errorReporter.reportDedup(`script-result|${sceneId}|${stepId}|${reason}`, {
    source: 'quest-system', severity: 'warning',
    message: `任务 '${sceneId}' 步骤 '${stepId}'：${reason}`,
    suggestion: '脚本返回值应为 string（跳转步骤 id）/ false（走 else）/ undefined（走 next）',
  })
}

// 注释：effect 缺参数去重上报
export function reportMissingEffectParam(effectType: string, param: string): void {
  errorReporter.reportDedup(`missing-param|${effectType}|${param}`, {
    source: 'quest-system', severity: 'warning',
    message: `效果 ${effectType} 缺少参数 '${param}'（已跳过）`,
    suggestion: `effects 的 params 需声明 ${param} = "任务 id"（作者漏写参数时零痕迹不可接受）`,
  })
}

// 注释：set_var 缺 var 键 / 目标场景不存在去重上报（key = scene|var）
export function reportSetVarIssue(key: string, message: string): void {
  errorReporter.reportDedup(`set_var|${key}`, {
    source: 'quest-system', severity: 'warning',
    message,
    suggestion: 'set_var 的 params 需声明 var = "变量名"；scene 参数须指向活跃场景（任务间通信写读同一键名）',
  })
}
