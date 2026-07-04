// 注释：h-core 插件——核心入口
// onLoad: 注册 effect types 到 EffectTypeRegistry
// onEnable: 注册 API + 注册指令 + 监听事件

import type { PluginContext } from '../../core/types'
import { createHState } from './types'
import type { H_STATE } from './types'
import { effectTypeRegistry } from '../../core/effect-type-registry'
import { entitySystem } from '../../core/entity-system'
import { eventBus } from '../../core/event-bus'
import { gameContext } from '../../core/game-context'
import { narrativeLog } from '../../core/narrative-log'
import type { CommandDef } from '../../core/command-registry'
import { PremiseRegistry } from './premise/premise-registry'
import { registerHPremises } from './premise/premise-h'
import { registerTargetPremises } from './premise/premise-target'
import { registerFallPremises } from './premise/premise-fall'
import { registerClothingPremises } from './premise/premise-clothing'
import { loadHInstructions } from './h-instruction-loader'
import { calcFavorability } from './settle/favorability'
import { calcTrust } from './settle/trust'
import { calcJudge, getLevel } from './settle/judge'
import { checkOrgasm } from './settle/orgasm'
import { modLoader } from '../../core/mod-loader'

export const premiseRegistry = new PremiseRegistry()

export function onLoad(_ctx: PluginContext): void {
  // 注释：settle_favorability——公式#1，不硬编码数值
  // 注释：modify_attribute 应用户需求保留但仅用于特殊场景，规范用法走 settle 公式
  effectTypeRegistry.register('settle_favorability', (params: any, execCtx: any) => {
    const targetIds = execCtx._targetIds as string[]
    const base = params.base ?? 10
    for (const id of targetIds) {
      const result = calcFavorability(id, base)
      if (result !== 0) {
        applyStateChange(id, '好感度', result)
      }
    }
    return true
  })

  // 注释：settle_state——公式#8，按 magnitude(small/mid/large) 取基数
  effectTypeRegistry.register('settle_state', (params: any, execCtx: any) => {
    const targetIds = execCtx._targetIds as string[]
    const hConfig = (modLoader.getMod()?.hConfig as any) ?? {}
    const mag = hConfig.magnitude_base ?? { small: 10, mid: 30, large: 80 }
    const magnitude = params.magnitude as string ?? 'small'
    const baseValue = mag[magnitude] ?? 10
    for (const id of targetIds) {
      applyStateChange(id, params.state, baseValue)
    }
    return true
  })
  effectTypeRegistry.register('h_start_h', async (params: any, execCtx: any) => {
    const allyId = execCtx.sourceId
    const targetId = params.targetId ?? execCtx._targetIds?.[0]
    if (!allyId || !targetId) return
    await startHScene(allyId, targetId)
    return true
  })

  effectTypeRegistry.register('h_end_h', async (_params: any, execCtx: any) => {
    const allyId = execCtx.sourceId
    if (allyId) await endHScene(allyId)
    return true
  })

  effectTypeRegistry.register('h_state_change', (params: any, execCtx: any) => {
    const targetIds = execCtx._targetIds as string[]
    for (const id of targetIds) {
      applyStateChange(id, params.statusId, params.value)
    }
    return true
  })

  effectTypeRegistry.register('h_favorability', (_params: any, _execCtx: any) => {
    // TODO: 改用 settle_favorability 效果类型，此 type 保留供向后兼容
    return true
  })

  effectTypeRegistry.register('h_hp_mp_change', (_params: any, _execCtx: any) => {
    // TODO: 调 settle/hp-mp 的 calcHpMpChange
    return true
  })

  effectTypeRegistry.register('h_orgasm_check', (params: any, execCtx: any) => {
    const targetIds = execCtx._targetIds as string[]
    const partId = params.partId ?? 0
    for (const id of targetIds) {
      const char = entitySystem.get('character', id) as any
      if (!char?.h_state) continue
      const hState = char.h_state as H_STATE
      const statusVal = char.base?.[params.statusKey] ?? 0
      const result = checkOrgasm(partId, statusVal, hState.orgasm_level[partId] ?? 0)
      if (result) {
        // 注释：绝顶触发——记录
        if (!hState.orgasm_count[partId]) hState.orgasm_count[partId] = [0, 0]
        hState.orgasm_count[partId][0]++
        hState.orgasm_count[partId][1]++
        if (!hState.orgasm_level[partId]) hState.orgasm_level[partId] = 0
        hState.orgasm_level[partId]++
        narrativeLog.write(`${char.name}${result.level} 绝顶！`, 'dialogue', 'h-core')
        eventBus.emit('h:orgasm', { character: id, partId, level: result.level })
      }
    }
    return true
  })

  effectTypeRegistry.register('h_experience', (params: any, execCtx: any) => {
    const targetIds = execCtx._targetIds as string[]
    for (const id of targetIds) {
      const char = entitySystem.get('character', id) as any
      if (!char) continue
      if (!char.experience) char.experience = {}
      char.experience[params.expId] = (char.experience[params.expId] ?? 0) + (params.value ?? 1)
    }
    return true
  })
}

export function onEnable(ctx: PluginContext): void {
  // 注释：注册前提 handler
  registerHPremises(premiseRegistry)
  registerTargetPremises(premiseRegistry)
  registerFallPremises(premiseRegistry)
  registerClothingPremises(premiseRegistry)

  // 注释：注册 h-core API
  ctx.api.register('h-core', {
    evaluatePremises: (premises: string[], evalCtx: any) => premiseRegistry.evaluate(premises, evalCtx),
    startHScene,
    endHScene,
    getLevel,
    calcFavorability,
    calcTrust,
    calcJudge,
    registerPremise: (id: string, handler: any) => premiseRegistry.register(id, handler),
  })

  // 注释：加载 h-instructions 到 CommandRegistry
  loadHInstructions()

  // 注释：注册 do_h/end_h 指令
  const doHCmd: CommandDef = {
    id: 'do_h',
    label: '邀请H',
    group: 'character_commands',
    modes: ['exploration'],
    priority: 80,
    condition: 'premises:HAVE_TARGET,NOT_H,T_NORMAL,SCENE_ONLY_TWO,TIRED_LE_74',
    source: 'plugin:h-core',
    handler: async (execCtx: any) => {
      const selectedId = execCtx?.uiStore?.selectedCharacterId
      const playerId = execCtx?.gameStore?.player?.id
      if (selectedId && playerId) await startHScene(playerId, selectedId)
    },
  }
  ctx.commands.register(doHCmd)

  const endHCmd: CommandDef = {
    id: 'end_h',
    label: '结束H',
    group: 'character_commands',
    modes: ['h_scene'],
    priority: 1,
    source: 'plugin:h-core',
    handler: async (execCtx: any) => {
      const playerId = execCtx?.gameStore?.player?.id
      if (playerId) await endHScene(playerId)
    },
  }
  ctx.commands.register(endHCmd)
}

// 注释：开始 H
async function startHScene(allyId: string, targetId: string): Promise<void> {
  const targetChar = entitySystem.get('character', targetId) as any
  if (!targetChar) return

  // 注释：初始化双方的 h_state
  targetChar.h_state = createHState()
  const allyChar = entitySystem.get('character', allyId) as any
  if (allyChar) allyChar.h_state = createHState()

  // 注释：未选中目标时设定目标
  await gameContext.enterMode('h_scene')
  await eventBus.emit('h:start', { ally: allyId, target: targetId })
  narrativeLog.write(`开始 H`, 'dialogue', 'h-core')
}

// 注释：结束 H
async function endHScene(allyId: string): Promise<void> {
  const player = gameContext.getContext().player
  if (!player) return

  // 注释：重置 h_state
  const allChars = entitySystem.getAll('character')
  for (const char of allChars) {
    const c = char as any
    if (c.h_state?.is_h) {
      // 注释：结算 HPMP 成长
      // TODO: 完整结束结算（体力上限成长等）
      c.h_state = undefined
    }
  }

  await gameContext.exitMode()
  await eventBus.emit('h:end', { ally: allyId })
  narrativeLog.write(`结束 H`, 'dialogue', 'h-core')
}

// 注释：应用状态值变化
function applyStateChange(charId: string, statusId: string, value: number): void {
  const char = entitySystem.get('character', charId) as any
  if (!char) return
  if (!char.base) char.base = {}
  const current = char.base[statusId] ?? 0
  char.base[statusId] = Math.max(0, current + value)
}
