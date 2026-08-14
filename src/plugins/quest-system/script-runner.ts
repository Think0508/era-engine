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

export async function runQuestScript(code: string, ctx: QuestScriptCtx): Promise<any> {
  const proxy = new Proxy(ctx, {
    get(target, key) {
      if (key in target) return (target as any)[key as string]
      return undefined
    },
    has: () => true,
    set: () => true,
  })
  try {
    const fn = new Function('ctx', `with (ctx) { return (async () => { ${code} })() }`)
    return await fn(proxy)
  } catch (err) {
    errorReporter.report({
      source: 'quest-system',
      severity: 'error',
      message: `任务 '${ctx.sceneId}' 步骤 '${ctx.stepId}' 脚本执行失败：${err instanceof Error ? err.message : String(err)}`,
      suggestion: '检查 scripts/ 目录下脚本语法与抛错位置（脚本异常已隔离，按 next 分支推进）',
    })
    return null
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
