// 注释：事件系统效果注册（复刻 erArk 系统效果 9999/10008/10009/10000）
// 10001 open_son_options：trigger.ts 特判（需要父事件上下文，不走注册表）
// 10002/10005/10006/10007/10013 set_interactant：trigger.ts 特判（顺序改写目标）
// 10008/10010/10011/10012：erArk 数据零使用，不实现（死代码偏差，见 ADR-0008）

import { effectTypeRegistry } from '../../core/effect-type-registry'
import { randomEventEngine } from '../../core/random-event'
import { apiSystem } from '../../core/api'
import { errorReporter } from '../../core/error-reporter'

export function registerSystemEffects(): void {
  // 注释：幂等注册（重复 onLoad——HMR/测试重载场景：effectTypeRegistry.register 对重复注册
  // 会 throw，若插件被重载会因重复注册被禁——has 检查跳过）
  if (effectTypeRegistry.has('noop')) return
  // 注释：erArk 9999 NOTHING——无操作空结算
  effectTypeRegistry.register('noop', () => true)

  // 注释：erArk 10008 ADD_THIS_EVENT_TO_TRIGGERED_RECORD——记全时触发记录
  //（erArk 数据零使用，机制保留——trigger_guard='seen_once'/'unseen_once' 依赖）
  effectTypeRegistry.register('record_event', (_params: any, ctx: any) => {
    if (ctx._eventId) randomEventEngine.recordTriggered(ctx._eventId)
    return true
  })

  // 注释：erArk 10009 ADD_THIS_EVENT_TO_TODAY_TRIGGERED_RECORD——记今日触发记录
  effectTypeRegistry.register('record_event_today', (_params: any, ctx: any) => {
    if (ctx._eventId) randomEventEngine.recordTodayTriggered(ctx._eventId)
    return true
  })

  // 注释：erArk 10000 INTERRUPT_TARGET_ACTIVITY——中断目标活动（改为等待行为）
  effectTypeRegistry.register('interrupt_activity', async (_params: any, ctx: any) => {
    const targets: string[] = ctx._targetIds ?? []
    if (targets.length === 0) return true
    for (const targetId of targets) {
      try {
        await apiSystem.call('npc-ai', 'setBehavior', targetId, 'wait')
      } catch {
        // npc-ai 未注册或无 wait 规格 → 降级跳过（warning 不阻断）
        errorReporter.report({
          source: 'random-event-system',
          severity: 'warning',
          message: `interrupt_activity 对 '${targetId}' 失败（npc-ai 未注册或行为规格 'wait' 不存在）`,
        })
      }
    }
    return true
  })
}
