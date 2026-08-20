// 计数器系统入口（index.ts）——装配：校验声明 → 注册条件字段 → 编译绑定 → 监听事件 →
// 注册代理域与公共 API。时序（关键，见 ADR-0016 §条件接入）：
//   - onLoad：注册条件字段——**必须早于所有消费方 onEnable 的条件校验**（gain-rule/quest/
//     talk/random-event 等在各自 onEnable 校验 mod 数据条件，若 counters 模板未注册 → 报未知
//     字段 = 静默失效）。所有插件的 onLoad 先于所有 onEnable（标准生命周期）；此时 mod 已由
//     main.ts 的 loadMod 加载（mod.counterDefs 就绪）。
//   - onEnable：事件监听 / 代理域 / 公共 API（运行期能力）。
//   - game:mod_loaded：conditionRegistry 已被 loadMod clear → 全量重建声明/条件/绑定/监听。

import type { PluginContext } from '../../core/types'
import { effectTypeRegistry } from '../../core/effect-type-registry'
import { registerProxyDomain } from '../../core/condition-engine'
import { errorReporter } from '../../core/error-reporter'
import {
  validateDefs, pendingItems, registerConditionFields, buildRegistry,
  getDefs, getViews, getDefForChar,
} from './register'
import { setBindings, registerEventListeners, detachEventListeners } from './events'
import { resolvePath, relationList } from './queries'
import { addNumber, addToList, addGroupField } from './store'
import { REAL_SEG, META_KEY } from './types'

let enabled = false

// 注释：onLoad——条件字段注册（时序关键：早于一切消费方 onEnable 校验）+ counter_add 效果
export function onLoad(_ctx: PluginContext): void {
  validateDefs()
  pendingItems()
  registerConditionFields()

  effectTypeRegistry.register('counter_add', (params: any, execCtx: any) => {
    const counterId = params?.counterId as string | undefined
    if (!counterId) {
      errorReporter.report({ source: 'counter-system', severity: 'warning', message: 'counter_add 缺少 params.counterId' })
      return false
    }
    const ids = (execCtx._targetIds as string[]) ?? []
    let anyApplied = false
    // value 校验：NaN/非法值拒绝（污染计数字段 = 静默坏数据）
    const checkNumber = (label: string): number | null => {
      const v = Number(params?.value ?? 1)
      if (!Number.isFinite(v)) {
        errorReporter.report({ source: 'counter-system', severity: 'warning', message: `counter_add '${counterId}' 的 ${label} value 非法（${String(params?.value)}）——已跳过` })
        return null
      }
      return v
    }
    for (const id of ids) {
      const def = getDefForChar(id, counterId)
      if (!def) {
        errorReporter.report({ source: 'counter-system', severity: 'warning', message: `counter_add 引用未声明计数器 '${counterId}'（目标 '${id}'）` })
        continue
      }
      try {
        if (def.type === 'number') {
          const v = checkNumber('数值')
          if (v === null) continue
          addNumber(id, counterId, def, v)
        } else if (def.type === 'list') {
          // 名单项只认 params.item（避免 value 数字被当名单项——value:0 → '0' 入名单的静默错误）
          const item = typeof params?.item === 'string' ? params.item : ''
          if (!item) {
            errorReporter.report({ source: 'counter-system', severity: 'warning', message: `counter_add 名单 '${counterId}' 缺少 params.item（要加入名单的角色 id）` })
            continue
          }
          addToList(id, counterId, def, item)
        } else if (def.type === 'group_table') {
          const dims: (string | number)[] = Array.isArray(params.dims) ? params.dims : []
          if (dims.length === 0) {
            errorReporter.report({ source: 'counter-system', severity: 'warning', message: `counter_add 分组表 '${counterId}' 缺少 params.dims（维度值数组）——已跳过` })
            continue
          }
          const field = params.field as string | undefined
          if (!field) {
            errorReporter.report({ source: 'counter-system', severity: 'warning', message: `counter_add 分组表 '${counterId}' 缺少 params.field` })
            continue
          }
          const v = checkNumber('字段值')
          if (v === null) continue
          addGroupField(id, counterId, def, dims, field, v)
        }
        anyApplied = true
      } catch (err) {
        errorReporter.report({
          source: 'counter-system',
          severity: 'warning',
          message: `counter_add '${counterId}' 执行抛错：${err instanceof Error ? err.message : String(err)}`,
        })
      }
    }
    return anyApplied
  })
}

// 注释：onEnable——事件绑定 + 代理域 + 公共 API + mod 重载重建
export async function onEnable(ctx: PluginContext): Promise<void> {
  if (enabled) return
  enabled = true

  setBindings(buildRegistry().bindingsByEvent)
  registerEventListeners()

  // 条件引擎代理域：counters.{charId}.{key}.{dims...} / .real.{dims...}
  registerProxyDomain('counters', 'counter-system', 'resolvePath')

  // mod 热更新/切换 → loadMod 已 conditionRegistry.clear() → 全量重建（声明校验/条件重注册/
  // 绑定重编译/监听重建）
  ctx.events.on('game:mod_loaded', () => {
    detachEventListeners()
    validateDefs()
    pendingItems()
    registerConditionFields()
    setBindings(buildRegistry().bindingsByEvent)
    registerEventListeners()
  })

  ctx.api.register('counter-system', {
    resolvePath,
    /** 读任意计数/视图：get(charId, key, ...rest) */
    get: (charId: string, key: string, ...rest: string[]): any => resolvePath([charId, key, ...rest], null),
    /** 真实值（减初始）：getReal(charId, key, ...dims) */
    real: (charId: string, key: string, ...rest: string[]): any => resolvePath([charId, key, REAL_SEG, ...rest], null),
    /** 名单：{ initial, named, list }（named=具名初始，list=游戏内新增） */
    list: (charId: string, counterId: string): { initial: number; named: string[]; list: string[] } | null => {
      const v = resolvePath([charId, counterId], null)
      return v && typeof v === 'object' && Array.isArray(v.list) ? v : null
    },
    /** 分组表 dim1 节点（条目标签+字段）：listGroup(charId, counterId, dim1?) */
    listGroup: (charId: string, counterId: string, dim1?: string | number): any => {
      const v = resolvePath([charId, counterId], null)
      if (!v || typeof v !== 'object') return null
      const table = v
      if (dim1 === undefined) {
        const keys = Object.keys(table).filter(k => k !== META_KEY)
        return keys.map(k => ({ key: k, entries: table[k] }))
      }
      const target = table[String(dim1)]
      if (!target || typeof target !== 'object') return null
      return Object.entries(target).map(([key, entry]) => ({ key, data: entry }))
    },
    relationList,
    /** 当前作用域（安装后断言用） */
    defs: () => getDefs(),
    views: () => getViews(),
  })
}