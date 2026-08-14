// 注释：sandbox — JS 钩子执行沙箱（占位实现）
// 使用 new Function + Proxy 冻结 context
// 禁止：window/document/fetch/localStorage 等全局对象
// 注意：非完整安全，MVP 够用（mod 作者自写脚本，非第三方提交）
// TODO(phase-15): 用 acorn AST 插入超时检查语句 + iframe 隔离
//
// ⚠️ W4（audit-i 2026-08-15）：本文件当前**零消费者**（grep runSandbox 无调用点）——
// 实际使用的沙箱是 quest-system/script-runner.ts（异步 + 5s 超时 + 严格模式 set 守卫，
// 失败姿态为"上报"而非本文件的"静默接受"）。本文件保留为未来 condition_script 等
// 通用钩子的基础；**新增钩子一律走 script-runner 的安全姿态**，勿直接使用本文件

import { errorReporter } from '../core/error-reporter'
import { entitySystem } from '../core/entity-system'
import { gameContext } from '../core/game-context'
import type { EntityData, GameTimeData } from '../core/types'

export interface SandboxContext {
  player: EntityData | null
  location: { id: string; name: string; type: string; tags: string[] } | null
  time: GameTimeData
  getEntity: (type: string, id: string) => EntityData | null
  getBinding: (entityId: string, key: string) => any
  rand: (min: number, max: number) => number
  log: (msg: string) => void
  [key: string]: any
}

export function createSandboxContext(): SandboxContext {
  const ctx = gameContext.getContext()
  const loc = ctx.location
  return {
    player: ctx.player,
    location: loc ? { id: loc.id, name: loc.name, type: loc.type, tags: [...loc.tags] } : null,
    time: { ...ctx.time },
    getEntity: (type: string, id: string) => {
      const e = entitySystem.get(type, id)
      return e ? JSON.parse(JSON.stringify(e)) : null
    },
    getBinding: () => null,
    rand: (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min,
    log: (msg: string) => console.log(`[sandbox] ${msg}`),
  }
}

export function runSandbox(code: string, context: SandboxContext): any {
  const proxy = new Proxy(context, {
    get(target, key) {
      if (key in target) return target[key as string]
      return undefined
    },
    has: () => true,
    set: () => true,
  })

  try {
    return new Function('ctx', `with (ctx) { ${code} }`)(proxy)
  } catch (err) {
    errorReporter.report({
      source: 'sandbox', severity: 'error',
      message: `沙箱脚本执行失败：${err instanceof Error ? err.message : String(err)}`,
    })
    return null
  }
}
