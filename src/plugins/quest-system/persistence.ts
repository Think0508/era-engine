// 注释：quest-system 存档序列化/恢复（W1 拆分自 index.ts）
// 职责：进行中任务进度（activeScenes + sceneStack）随存档持久化

import { errorReporter } from '../../core/error-reporter'
import { activeScenes, sceneStack, getScene } from './runtime'

export interface QuestState {
  activeScenes: {
    sceneId: string
    currentStepId: string
    completedSteps: string[]
    objectiveProgress: Record<string, number>
    vars: Record<string, any>
    stepAdvanceCount: number
  }[]
  // 注释：新格式 {parent, child, resumeStepId}；旧格式 {sceneId, resumeStepId} 兼容
  sceneStack: ({ parent: string; child: string; resumeStepId?: string } | { sceneId: string; resumeStepId?: string })[]
}

export function serializeQuestState(): QuestState {
  return {
    activeScenes: Array.from(activeScenes.entries()).map(([sceneId, r]) => ({
      sceneId,
      currentStepId: r.currentStepId,
      completedSteps: [...r.completedSteps],
      objectiveProgress: Object.fromEntries(r.objectiveProgress),
      vars: { ...(r.vars ?? {}) },
      stepAdvanceCount: r.stepAdvanceCount,
    })),
    sceneStack: sceneStack.map(s => ({ ...s })),
  }
}

export function restoreQuestState(data: QuestState | undefined): void {
  activeScenes.clear()
  sceneStack.length = 0
  for (const entry of data?.activeScenes ?? []) {
    // 注释：对象守卫（原直接 entry.sceneId：null/非对象条目 → TypeError →
    // save-system 按 provider 隔离上报 → 整段恢复中断，其余进行中任务全部消失
    // 且无条目定位）——单条目跳过不中断整段
    if (!entry || typeof entry !== 'object') {
      errorReporter.reportDedup('restore|bad-active-scene-entry', {
        source: 'quest-system',
        severity: 'warning',
        message: `读档恢复：activeScenes 含非法条目（${entry === null ? 'null' : typeof entry}，已跳过）——该条目的任务进度可能丢失`,
        suggestion: '存档数据损坏或任务 id 格式异常；其余进行中任务不受影响',
      })
      continue
    }
    activeScenes.set(entry.sceneId, {
      sceneId: entry.sceneId,
      currentStepId: entry.currentStepId,
      completedSteps: Array.isArray(entry.completedSteps) ? entry.completedSteps : [],
      objectiveProgress: new Map(Object.entries(entry.objectiveProgress ?? {})),
      vars: { ...(entry.vars ?? {}) },
      // 注释：循环守卫计数不跨会话持久化（合法长链任务跨多会话累计推进接近
      // 100 次会在少量推进后误触发守卫终结；守卫价值在防同帧递归环，存档只
      // 发生在 IDLE，循环链执行原子不可中途存档）
      stepAdvanceCount: 0,
    })
    // 注释：读档后 currentStepId 存在性校验——任务文件更新改了 step id
    //（迁移未覆盖）→ 该任务恢复后永远无法推进且零诊断（原静默恢复）
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
    // 注释：坏条目守卫（栈条目丢失时嵌套任务恢复状态与存档不符无提示）
    if (!s || typeof s !== 'object') {
      errorReporter.reportDedup('restore|bad-scene-stack-entry', {
        source: 'quest-system',
        severity: 'warning',
        message: `读档恢复：sceneStack 含非法条目（${s === null ? 'null' : typeof s}，已跳过）——嵌套场景恢复状态可能与存档不符`,
        suggestion: '存档数据损坏；其余条目不受影响',
      })
      continue
    }
    // 注释：新条目结构 {parent, child, resumeStepId}（child = push 时实际启动的
    // 子 scene）——completeScene 只弹 child === 完成者的条目。
    // 旧存档 {sceneId, resumeStepId} 兼容：sceneId 语义是**父**（旧 push 代码
    // sceneStack.push({ sceneId, resumeStepId: step.next }) 中 sceneId = 挂起的父，
    // 非子 scene）——旧格式不记录子 id，无法精确恢复嵌套关系：child 置空
    //（completeScene 的 top.child === 完成者恒不匹配 → 条目安全搁置不会误弹），
    // parent 恢复为 sceneId，恢复时发 warning 告知"无法精确恢复"。
    // resumeStepId 缺省保持 undefined（两种格式都是：新格式省略 next / 旧格式
    // 无 next = 父挂起；勿 ?? '' 否则被 F-1 的空串结束标记误触发 completeScene(parent)
    // ——M1 修复：新格式分支此前漏改，嵌套任务存档往返后父场景被错误终结）
    const stackEntry = s as any
    if (stackEntry.child !== undefined) {
      sceneStack.push({ parent: stackEntry.parent ?? '', child: stackEntry.child, resumeStepId: stackEntry.resumeStepId })
    } else if (stackEntry.sceneId !== undefined) {
      sceneStack.push({ parent: stackEntry.sceneId, child: '', resumeStepId: stackEntry.resumeStepId })
      errorReporter.reportDedup(`restore|old-stack|${String(stackEntry.sceneId)}`, {
        source: 'quest-system',
        severity: 'warning',
        message: `读档恢复：场景 '${String(stackEntry.sceneId)}' 的嵌套栈条目来自旧存档格式（未记录子场景 id，嵌套关系无法精确恢复）`,
        suggestion: '旧格式存档的嵌套任务恢复后可能停在挂起步骤，如遇卡住请重新触发该任务或迁移存档',
      })
    }
  }
}
