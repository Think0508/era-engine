// 注释：script 步骤执行器——沙箱运行 mod 脚本（瞬间逻辑，禁止跨存档点挂起）
// 复用 utils/sandbox 的 with(ctx) 模式，支持 async 函数体 + await 瞬间 API
import { errorReporter } from '../../core/error-reporter'
import { narrativeLog } from '../../core/narrative-log'
import { apiSystem } from '../../core/api'
import { bindingResolver } from '../../core/binding-resolver'

export interface QuestScriptCtx {
  sceneId: string
  stepId: string
  params: Record<string, any>
  sourceId: string | null
  targetIds: string[]
  payload: any
  getVar(key: string): any
  setVar(key: string, value: any): void
  say(speaker: string | null, text: string): void
  api: { call(ns: string, method: string, ...args: any[]): Promise<any> }
  getBinding(entityId: string, key: string): any
  rand(min: number, max: number): number
}

// AGENTS 安全铁律「脚本超时保护（5秒自动终止）」——runQuestScript 超时上限
const SCRIPT_TIMEOUT_MS = 5000

export async function runQuestScript(code: string, ctx: QuestScriptCtx): Promise<any> {
  const proxy = new Proxy(ctx, {
    get(target, key) {
      if (key in target) return (target as any)[key as string]
      return undefined
    },
    has: () => true,
    // 严格模式沙箱内 set 返回 false → 未声明赋值（x = 1）抛 TypeError 被 catch 上报，
    // 不再静默吞掉（禁止静默失败铁律）；let/const/var 局部声明与嵌套对象赋值不受影响
    set: () => false,
  })
  // 超时兜底：脚本可能 await 一个永不返回的 api.call（如存档点 API）——Promise.race 到点拒绝。
  // ⚠️ 同步死循环（while(true){}）阻塞事件循环，Promise.race 无法打断——留待 phase-15 acorn 方案
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`脚本执行超时（超过 ${SCRIPT_TIMEOUT_MS}ms 未完成，已中止并按 next 推进）`))
    }, SCRIPT_TIMEOUT_MS)
  })
  try {
    // 内层 async function 恒严格模式（"use strict" 双保险）→ this = undefined，this 逃逸关闭；
    // with 在外层（非严格）合法，内层严格函数引用外层 with 作用域链合法（2026-08-14 Node 实证）
    const fn = new Function('ctx', `with (ctx) { return (async function() { "use strict"; ${code} })() }`)
    return await Promise.race([fn(proxy), timeout])
  } catch (err) {
    const isTimeout = err instanceof Error && err.message.includes('超时')
    errorReporter.report({
      source: 'quest-system',
      severity: 'error',
      message: isTimeout
        ? `任务 '${ctx.sceneId}' 步骤 '${ctx.stepId}' 脚本执行超时（超过 ${SCRIPT_TIMEOUT_MS}ms 未完成，已中止并按 next 推进）`
        : `任务 '${ctx.sceneId}' 步骤 '${ctx.stepId}' 脚本执行失败：${err instanceof Error ? err.message : String(err)}`,
      suggestion: isTimeout
        ? '检查脚本是否 await 了永不返回的 API 调用（如存档点）——同步死循环无法被超时打断，phase-15 acorn 方案解决'
        : '检查 scripts/ 目录下脚本语法与抛错位置（脚本异常已隔离，按 next 分支推进）',
    })
    return null
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export function makeScriptCtx(
  sceneId: string,
  stepId: string,
  params: Record<string, any>,
  sourceId: string | null,
  targetIds: string[],
  payload: any,
  getVar: (k: string) => any,
  setVar: (k: string, v: any) => void,
): QuestScriptCtx {
  return {
    sceneId, stepId, params, sourceId, targetIds, payload, getVar, setVar,
    say: (_speaker, text) => narrativeLog.write(text, 'dialogue', 'quest-system'),
    api: { call: (ns, method, ...args) => apiSystem.call(ns, method, ...args) },
    getBinding: (entityId, key) => bindingResolver.get(entityId, key),
    rand: (min, max) => Math.floor(Math.random() * (max - min + 1)) + min,
  }
}
