// 注释：npc-ai-system 插件——NPC 行为系统（复刻 erArk handle_npc_ai + character_behavior）
// 职责：行为块时间模型 / 前提权重目标搜索 / 行为状态机（9 种日常处理器）/
//       工作娱乐排班 / 前置门控 / 带耗时移动 / 行为完成结算 / NPC 每日结算
// 不注册任何指令——纯服务插件（数据在 data/default/，mod 可覆盖）

import type { PluginContext } from '../../core/types'
import { eventBus } from '../../core/event-bus'
import { modLoader } from '../../core/mod-loader'
import { entitySystem } from '../../core/entity-system'
import { getEntityAttr, setEntityAttr, ATTR } from '../../core/entity-utils'
import { errorReporter } from '../../core/error-reporter'
import { registerBuiltinPreChecks } from './pre-check'
import { registerBuiltinHandlers } from './behavior-handlers'
import { registerAiPremises } from './premise/ai'
import { runSettlePass, resetPendingQueue } from './settle-pass'
import { handleNpcSpawns } from './spawns'
import { initBehaviorBlock, setBehaviorBlock, nowMinutes } from './behavior-block'
import { registerBehaviorHandler, getBehaviorHandler, type HandlerContext } from './behavior-handlers'
import { registerPreCheck } from './pre-check'
import { getBehaviorSpec, narrateBehaviorStart } from './narrative'
import { registerSkipRule, isSkipped } from '../../core/skip-registry'
import type { BehaviorBlock } from './types'

// 注释：onLoad——注册门控/处理器/前提/跳过谓词 + 校验 AI 数据
export function onLoad(_ctx: PluginContext): void {
  registerBuiltinPreChecks()
  registerBuiltinHandlers()
  registerAiPremises()
  // 注释：内建跳过谓词（core 注册表是通用机制，具体判定在插件层声明——
  // erArk 对应：character_behavior.py dead 跳过 / 离线生命周期 / settle-gate 无意识）
  registerSkipRule('dead', (_id, entity) => !!entity?.dead)
  registerSkipRule('offline', (_id, entity) => !!entity?.sp_flag?.offline)
  // ★4 修复（第六轮）：睡眠猥亵标记的睡眠者（unconscious_h===1 && sleeping）**不跳过**——
  // erArk 中该标记只表示"睡奸可发起"，NPC 睡眠行为照常结算（6:00 自然醒）；
  // 原规则冻结其行为块 → 永不醒（要等玩家睡觉 updateSleepAll 兜底，NPC 可能睡数天）。
  // 睡奸中（H 内）由 in_h 规则冻结；时停(3)/催眠(4-7)/醉酒(2) 照常跳过
  registerSkipRule('unconscious', (_id, entity) => {
    const u = entity?.sp_flag?.unconscious_h ?? 0
    if (u >= 1 && u !== 1) return true
    if (u === 1 && !entity?.sp_flag?.sleeping) return true
    return false
  })
  // 注释：H 中的 NPC 不跑日常 AI（erArk：H 中 NPC 进 over_behavior_character 跳过；
  // H 内 AI 后置——日常决策不与该会话竞争；交互 pin 已覆盖选中者，此谓词兜底全员。
  // 2026-08-10 排查修复：H 标志在 h_state.is_h（h-core 写入）——此前误用 erArk 的
  // sp_flag.is_h（本引擎无此字段），谓词永不触发）
  registerSkipRule('in_h', (_id, entity) => entity?.h_state?.is_h === true)
  validateAiData()
}

// 注释：onEnable——初始化行为块 + 注册 npc-ai API + 监听结算/每日事件
export function onEnable(ctx: PluginContext): void {
  // 注释：1. 初始化所有 NPC 行为块（无块 → 首个结算 pass 决策）
  const playerId = modLoader.getMod()?.playerCharacter
  for (const char of entitySystem.getAll('character')) {
    const c = char as any
    if (c?.id && c.id !== playerId) initBehaviorBlock(c)
  }

  // 注释：2. 注册 npc-ai API
  ctx.api.register('npc-ai', {
    // 注释：获取角色当前行为块（null = 无）
    getBehavior: (charId: string): BehaviorBlock | null => {
      const char = entitySystem.get('character', charId) as any
      return char?.ai_behavior ?? null
    },
    // 注释：获取角色当前行为状态（wait/move/rest/...；null = 无）
    getState: (charId: string): string | null => {
      const char = entitySystem.get('character', charId) as any
      return char?.ai_behavior?.type ?? null
    },
    // 注释：强制设定行为（脚本/指令用）——按行为规格 + 处理器生成行为块
    // params：行为规格 ID；行为规格 type 的处理器 + 可选参数
    setBehavior: async (charId: string, specId: string, params?: Record<string, any>): Promise<boolean> => {
      const char = entitySystem.get('character', charId) as any
      if (!char) return false
      const spec = getBehaviorSpec(specId)
      if (!spec) {
        errorReporter.report({
          source: 'npc-ai-system',
          severity: 'warning',
          message: `setBehavior：未定义的行为规格 '${specId}'`,
          suggestion: '检查 ai-behaviors.toml',
        })
        return false
      }
      const handler = getBehaviorHandler(spec.type)
      if (!handler) {
        errorReporter.report({
          source: 'npc-ai-system',
          severity: 'warning',
          message: `setBehavior：行为规格 '${specId}' 类型 '${spec.type}' 未注册处理器`,
        })
        return false
      }
      const now = nowMinutes()
      // 注释：强制设定 = 从现在开始（覆盖旧行为，不接续旧块的时间线）
      const ctx: HandlerContext = {
        charId, char, spec,
        params: params ?? {},
        start_time: now,
        now,
      }
      try {
        const block = await handler(ctx)
        setBehaviorBlock(char, block)
        // 注释：行为变更对外宣告（与结算通道一致——npc:behavior_started + 同地叙事）
        await eventBus.emit('npc:behavior_started', {
          character: charId,
          behavior_id: block.id,
          type: block.type,
          duration: block.duration,
          target: block.target,
        })
        narrateBehaviorStart(char, block)
        eventBus.emit('character:changed', { id: charId })
        return true
      } catch (e) {
        errorReporter.report({
          source: 'npc-ai-system',
          severity: 'warning',
          message: `setBehavior '${specId}' 执行失败：${e instanceof Error ? e.message : String(e)}`,
        })
        return false
      }
    },
    // 注释：查询角色是否被 AI 跳过（dead/离线/无意识/插件谓词）
    isSkipped: (charId: string): boolean => {
      const char = entitySystem.get('character', charId) as any
      return isSkipped(charId, char)
    },
    // 注释：注册行为类型处理器（mod 插件扩展新行为类型；H 期在同一注册表扩展 h_*）
    registerBehaviorHandler: (type: string, handler: (ctx: HandlerContext) => BehaviorBlock | Promise<BehaviorBlock>): void => {
      registerBehaviorHandler(type, handler)
    },
    // 注释：注册前置门控（mod 插件扩展禁移动等判定）
    registerPreCheck: (id: string, fn: (charId: string, char: any, now: number) => { handled: boolean }): void => {
      registerPreCheck(id, fn)
    },
  })

  // 注释：3. 监听 game:time_advanced → NPC 结算通道
  ctx.events.on('game:time_advanced', async (payload: any) => {
    await runSettlePass(payload?.minutes ?? 0)
  })

  // 注释：4. 监听 game:new_day → NPC 每日结算（原 core newday-settle 归位）
  ctx.events.on('game:new_day', () => {
    dailySettle()
  })

  // 注释：5. 监听 location:enter → NPC spawns（npc.toml 路人生成，原 character-system 归位）
  ctx.events.on('location:enter', (payload: any) => {
    handleNpcSpawns(payload?.to)
  })
}

// 注释：NPC 每日结算（对齐 erArk past_day_settle.py:76 `if character_id:` 排除玩家；
// 欲望积累 random(ability[33] ~ ability[33]*2)——33=欲望，abilities 按名存）
// 导出供测试（原 core newday-settle.ts 归位，G2 决策 2026-08-09）
export function dailySettle(): void {
  const playerId = modLoader.getMod()?.playerCharacter
  for (const char of entitySystem.getAll('character')) {
    const c = char as any
    if (!c?.id || c.id === playerId || c.id === '0') continue
    if (isSkipped(c.id, c)) continue
    const abl33 = c.abilities?.['欲望']?.level ?? 0
      if (abl33 > 0) {
        const add = abl33 + Math.floor(Math.random() * (abl33 + 1))
        const desire = getEntityAttr(c, ATTR.DESIRE)
        if (typeof desire === 'number') {
          setEntityAttr(c, ATTR.DESIRE, Math.min(100, desire + add))
        }
      }
  }
}

// 注释：AI 数据校验（加载时 warning——不阻止启动，但显式暴露数据错误）
function validateAiData(): void {
  const mod = modLoader.getMod() as any
  if (!mod) return
  // 目标引用的行为规格存在性
  for (const target of (mod.aiTargets ?? []) as any[]) {
    if (!mod.aiBehaviors?.[target.behavior?.type]) {
      errorReporter.report({
        source: 'npc-ai-system',
        severity: 'warning',
        message: `AI 目标 '${target.id}' 引用未定义的行为规格 '${target.behavior?.type}'`,
        suggestion: '检查 ai-behaviors.toml（插件默认层或 mod definitions/）',
      })
    }
  }
  // 行为规格的类型处理器存在性
  for (const [specId, spec] of Object.entries(mod.aiBehaviors ?? {}) as [string, any][]) {
    if (!getBehaviorHandler(spec?.type)) {
      errorReporter.report({
        source: 'npc-ai-system',
        severity: 'warning',
        message: `行为规格 '${specId}' 的类型 '${spec?.type}' 未注册处理器`,
        suggestion: '内置类型：wait/stay/move/rest/sleep/work/entertainment/socialize/wander；扩展需 mod 插件注册',
      })
    }
  }
  // 工种地点存在性
  for (const [workId, def] of Object.entries(mod.aiWorkTypes ?? {}) as [string, any][]) {
    if (!mod.locations?.has(def?.place)) {
      errorReporter.report({
        source: 'npc-ai-system',
        severity: 'warning',
        message: `工种 '${workId}' 的工作地点 '${def?.place}' 不存在`,
        suggestion: '检查 ai-work.toml 的 place 字段是否指向 maps/locations/ 下的地点 ID',
      })
    }
  }
  // 娱乐类型地点存在性
  for (const [entId, def] of Object.entries(mod.aiEntertainmentTypes ?? {}) as [string, any][]) {
    if (!mod.locations?.has(def?.place)) {
      errorReporter.report({
        source: 'npc-ai-system',
        severity: 'warning',
        message: `娱乐类型 '${entId}' 的地点 '${def?.place}' 不存在`,
        suggestion: '检查 ai-entertainment.toml 的 place 字段',
      })
    }
  }
  // 工种时段格式（半开 [start, end)，0-23）——非法时段静默失效（2026-08-10 排查补缺）
  for (const [workId, def] of Object.entries(mod.aiWorkTypes ?? {}) as [string, any][]) {
    for (const slot of (def?.time_slots ?? []) as any[]) {
      if (!Array.isArray(slot) || slot.length !== 2 || typeof slot[0] !== 'number' || typeof slot[1] !== 'number'
        || slot[0] < 0 || slot[0] > 23 || slot[1] < 0 || slot[1] > 23 || slot[0] >= slot[1]) {
        errorReporter.report({
          source: 'npc-ai-system',
          severity: 'warning',
          message: `工种 '${workId}' 的时段 [${String(slot)}] 非法`,
          suggestion: '时段须为 [开始小时, 结束小时) 闭数组，如 [8, 12]（8:00-11:59）；结束须大于开始',
        })
      }
    }
  }
  // 角色引用存在性：work_type / entertainment 类型 / time_rules 目标地点
  for (const [charId, char] of mod.entities.get('character') ?? []) {
    const behavior = (char as any)?.behavior
    if (!behavior) continue
    const workTypeId = behavior.work?.work_type as string | undefined
    if (workTypeId && !mod.aiWorkTypes?.[workTypeId]) {
      errorReporter.report({
        source: 'npc-ai-system',
        severity: 'warning',
        message: `角色 '${charId}' 引用了未定义的工种 '${workTypeId}'`,
        suggestion: '检查 ai-work.toml 是否定义了该工种，或删除角色数据中的 work 字段',
      })
    }
    const entTypes = behavior.entertainment?.types as Record<string, string> | undefined
    if (entTypes) {
      for (const [period, entId] of Object.entries(entTypes)) {
        if (!mod.aiEntertainmentTypes?.[entId]) {
          errorReporter.report({
            source: 'npc-ai-system',
            severity: 'warning',
            message: `角色 '${charId}' 的 ${period} 娱乐引用了未定义的类型 '${entId}'`,
            suggestion: '检查 ai-entertainment.toml 是否定义了该类型，或删除该槽位',
          })
        }
      }
    }
    for (const rule of (behavior.time_rules ?? []) as any[]) {
      if (!Array.isArray(rule?.hour_range) || rule.hour_range.length !== 2
        || typeof rule.hour_range[0] !== 'number' || typeof rule.hour_range[1] !== 'number'
        || rule.hour_range[0] < 0 || rule.hour_range[0] > 23 || rule.hour_range[1] < 0 || rule.hour_range[1] > 23
        || rule.hour_range[0] >= rule.hour_range[1]) {
        errorReporter.report({
          source: 'npc-ai-system',
          severity: 'warning',
          message: `角色 '${charId}' 的时间规律时段非法：${JSON.stringify(rule?.hour_range)}`,
          suggestion: 'hour_range 须为 [开始小时, 结束小时) 闭数组（如 [20, 23]）；结束须大于开始',
        })
        continue
      }
      if (!mod.locations?.has(rule?.target)) {
        errorReporter.report({
          source: 'npc-ai-system',
          severity: 'warning',
          message: `角色 '${charId}' 的时间规律目标地点 '${rule?.target}' 不存在`,
          suggestion: '检查 time_rules 的 target 是否指向 maps/locations/ 下的地点 ID',
        })
      }
    }
  }
}

// 注释：供测试/重载清空
export function _resetForTest(): void {
  resetPendingQueue()
}
