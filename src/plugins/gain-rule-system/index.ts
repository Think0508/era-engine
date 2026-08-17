// 注释：gain-rule-system 插件——「满足条件后获得xx」统一规则管线
// 2026-08-16 建（grill 定稿）：
//   - 数据：mod.gainRules（gain-rules.toml）+ talentDefs gain 语法糖（compileRules）
//   - 触发：auto（execution 玩家指令后 / npc-settle NPC 行为结算 / sleep 睡觉全量）+
//           manual（UI 候选 API；UI 待用户设计）+ event（后续步骤）
//   - 迁移：core talent-utils checkTalentGain 调用点移除，改由本插件监听事件/API 接管
// 通信：跨插件只走 API/事件（effect-system execute、npc-ai/sleep 集成点）

import type { PluginContext } from '../../core/types'
import { eventBus } from '../../core/event-bus'
import { gameContext } from '../../core/game-context'
import { entitySystem } from '../../core/entity-system'
import { effectTypeRegistry } from '../../core/effect-type-registry'
import { errorReporter } from '../../core/error-reporter'
import { registerGameStateProvider } from '../../core/save-system'
import {
  compileRules, invalidateRules, checkAutoForChar, checkAutoAll,
  queryManualCandidates, confirmManual, checkEventRule, getCompiledRules,
  grantTalentToChar, removeTalentFromChar,
  recordAchievement, isAchievementUnlocked,
  getGlobalAchievements, setGlobalAchievements,
  getGlobalRuleState, setGlobalRuleState,
} from './rule-engine'

// 注释：事件监听注册表——event:xxx 规则挂载的事件 → 规则列表（重载时重建）
const eventListeners = new Map<string, (payload: any) => void>()

function registerEventListeners(): void {
  // 先移除旧监听（mod 重载）
  for (const [evt, handler] of eventListeners) {
    eventBus.off(evt, handler)
  }
  eventListeners.clear()

  for (const rule of getCompiledRules()) {
    if (!rule.when.startsWith('event:')) continue
    const evt = rule.when.slice('event:'.length)
    if (eventListeners.has(evt)) {
      // 同一事件已有监听——共享一个 handler（内部遍历规则）
      continue
    }
    // 注释：handler 返回 Promise（2026-08-16 二轮审查修复：原 void async fire-and-forget——
    // eventBus.emit 的 await handler(payload) 等不到内部 async 完成，事件规则检查时序不可控，
    // 测试/调用方无法确认规则已执行。改 async handler：emit 完整等待）
    const handler = async (payload: any): Promise<void> => {
      try {
        const eventRules = getCompiledRules().filter(r => r.when === `event:${evt}`)
        for (const rule of eventRules) {
          await checkEventRule(rule, payload)
        }
      } catch (err) {
        errorReporter.report({
          source: 'gain-rule-system',
          severity: 'warning',
          message: `事件 '${evt}' 规则检查抛错：${err instanceof Error ? err.message : String(err)}`,
        })
      }
    }
    eventBus.on(evt, handler)
    eventListeners.set(evt, handler)
  }
}

// 注释：onLoad——注册效果类型（grant_talent / remove_talent）
export function onLoad(_ctx: PluginContext): void {
  // grant_talent——让目标角色获得天赋（等级+1，写日志，处理 replace 升级链）
  effectTypeRegistry.register('grant_talent', (params: any, execCtx: any) => {
    const ids = (execCtx._targetIds as string[]) ?? []
    const talentId = params?.talent as string
    if (!talentId) {
      errorReporter.report({
        source: 'gain-rule-system',
        severity: 'warning',
        message: 'grant_talent 缺少 params.talent（天赋 ID）',
      })
      return false
    }
    let any = false
    for (const id of ids) {
      const char = entitySystem.get('character', id) as any
      if (!char) continue
      if (grantTalentToChar(char, talentId)) any = true
    }
    return any
  })

  // remove_talent——让目标角色失去天赋（删除条目 + 日志）
  effectTypeRegistry.register('remove_talent', (params: any, execCtx: any) => {
    const ids = (execCtx._targetIds as string[]) ?? []
    const talentId = params?.talent as string
    if (!talentId) {
      errorReporter.report({
        source: 'gain-rule-system',
        severity: 'warning',
        message: 'remove_talent 缺少 params.talent（天赋 ID）',
      })
      return false
    }
    let any = false
    for (const id of ids) {
      const char = entitySystem.get('character', id) as any
      if (!char) continue
      if (removeTalentFromChar(char, talentId)) any = true
    }
    return any
  })

  // record_achievement——记录成就达成（按成就定义的 scope 记入 player/character/global）
  effectTypeRegistry.register('record_achievement', (params: any, _execCtx: any) => {
    const achId = params?.id as string
    if (!achId) {
      errorReporter.report({
        source: 'gain-rule-system',
        severity: 'warning',
        message: 'record_achievement 缺少 params.id（成就 ID）',
      })
      return false
    }
    return recordAchievement(achId)
  })
}

// 注释：onEnable——编译规则 + 事件监听 + 公共 API
export async function onEnable(ctx: PluginContext): Promise<void> {
  compileRules()
  registerEventListeners()

  // 注释：全局成就 + 全局规则状态存档持久化（gameStateProviders——读档自动 restore）
  registerGameStateProvider({
    id: 'gain-rule-system:achievements',
    serialize: () => ({
      global: getGlobalAchievements(),
      ruleState: getGlobalRuleState(),
    }),
    restore: (data: any) => {
      setGlobalAchievements(data?.global ?? {})
      setGlobalRuleState(data?.ruleState ?? {})
    },
  })

  // 注释：规则数据重载（mod 热更新/切换）——重新编译 + 重建事件监听
  eventBus.on('game:mod_loaded', () => {
    invalidateRules()
    compileRules()
    registerEventListeners()
  })

  // 注释：auto 时机①——玩家指令执行后（增量：player + selected）
  // 对齐 erArk character_behavior gain_talent type=0（玩家行为结算后）
  ctx.events.on('game:execution_end', async () => {
    try {
      const playerId = gameContext.getContext().player?.id
      if (playerId) await checkAutoForChar(playerId, 'execution')
      const selectedId = gameContext.getContext().selectedCharacterId
      if (selectedId && selectedId !== playerId) {
        await checkAutoForChar(selectedId, 'execution')
      }
    } catch (err) {
      errorReporter.report({
        source: 'gain-rule-system',
        severity: 'warning',
        message: `指令后规则检查抛错：${err instanceof Error ? err.message : String(err)}`,
      })
    }
  })

  // 注释：auto 时机②——睡觉全量（sleep-system 调用 API，对齐 erArk sleep_settle gain_talent type=3）
  // ⚠️ 实际接线（2026-08-16 四轮审查确认）：update-sleep 对 NPC 分支逐角色调 checkAuto('sleep')；
  // checkAll 保留为通用入口（读档后全量重扫/调试/未来玩家分支用），当前无调用者但非死代码（对外 API）

  // 注释：公共 API
  ctx.api.register('gain-rule-system', {
    // 检查单个角色（npc-ai 结算通道调用；ctx=execution/npc-settle/sleep）
    checkAuto: async (charId: string, context: string = 'execution'): Promise<void> => {
      await checkAutoForChar(charId, context as any)
    },
    // 全量检查（睡觉/读档后）
    checkAll: async (context: string = 'sleep'): Promise<void> => {
      await checkAutoAll(context as any)
    },
    // 手动候选查询（UI 待用户设计；返回满足条件的 manual 规则）
    queryManualCandidates: (charId: string) => queryManualCandidates(charId),
    // 手动确认（跳过条件直接执行效果）
    confirmManual: async (charId: string, ruleId: string): Promise<boolean> =>
      confirmManual(charId, ruleId),
    // 规则列表（调试/校验）——用缓存，避免每次全量重编译+校验（I2 修复）
    listRules: () => getCompiledRules(),
    // 成就达成状态查询（UI 面板/条件/调试用）
    isAchievementUnlocked: (achId: string, targetId?: string): boolean =>
      isAchievementUnlocked(achId, targetId),
    // 全局成就表（存档/UI 面板用）
    getGlobalAchievements: (): Record<string, boolean> => getGlobalAchievements(),
  })
}
