// 注释：h-core 插件——核心入口

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
import { calcStateChange } from './settle/state'
import { calcTrust } from './settle/trust'
import { calcJudge, getLevel } from './settle/judge'
import { checkOrgasm } from './settle/orgasm'
import { modLoader } from '../../core/mod-loader'

export const premiseRegistry = new PremiseRegistry()

export function onLoad(_ctx: PluginContext): void {
  // 注释：settle_favorability——公式#1，base = _timeCost（指令耗时）
  effectTypeRegistry.register('settle_favorability', (params: any, execCtx: any) => {
    const targetIds = execCtx._targetIds as string[]
    const timeCost = execCtx._timeCost ?? params.base ?? 10
    for (const id of targetIds) {
      const result = calcFavorability(id, timeCost)
      if (result !== 0) applyStateChange(id, '好感度', result)
    }
    return true
  })

  // 注释：settle_state——公式#8
  // base = _timeCost + baseValue(default 30, 取自 erArk 各 effect 的 base_value)
  // 行为参数(baseValue=30) vs 快感部位(baseValue=50)，由指令 TOML 传入
  effectTypeRegistry.register('settle_state', (params: any, execCtx: any) => {
    const targetIds = execCtx._targetIds as string[]
    const hConfig = (modLoader.getMod()?.hConfig as any) ?? {}
    const abilityTable = hConfig.ability_lv_adjust ?? [1.0, 1.1, 1.25, 1.4, 1.6, 1.8, 2.1, 2.4, 2.8, 3.2, 4.0]
    const timeCost = execCtx._timeCost ?? 10
    const baseValue = params.baseValue ?? 30  // 注释：erArk 默认 base_value=30，快感等用 50
    const base = timeCost + baseValue
    for (const id of targetIds) {
      const char = entitySystem.get('character', id) as any
      const abilityLevel = char?.abilities?.[params.state]?.level ?? 0
      const finalValue = calcStateChange(base, abilityLevel, abilityTable)
      if (finalValue !== 0) applyStateChange(id, params.state, finalValue)
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
    for (const id of targetIds) applyStateChange(id, params.statusId, params.value)
    return true
  })

  effectTypeRegistry.register('h_favorability', (_params: any, _execCtx: any) => {
    return true
  })

  effectTypeRegistry.register('h_hp_mp_change', (_params: any, _execCtx: any) => {
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
        if (!hState.orgasm_count[partId]) hState.orgasm_count[partId] = [0, 0]
        hState.orgasm_count[partId][0]++
        hState.orgasm_count[partId][1]++
        if (!hState.orgasm_level[partId]) hState.orgasm_level[partId] = 0
        hState.orgasm_level[partId]++
        narrativeLog.write(`${char.name || id} ${result.level} 绝顶！`, 'dialogue', 'h-core')
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
  registerHPremises(premiseRegistry)
  registerTargetPremises(premiseRegistry)
  registerFallPremises(premiseRegistry)
  registerClothingPremises(premiseRegistry)

  ctx.api.register('h-core', {
    evaluatePremises: (premises: string[], evalCtx: any) => premiseRegistry.evaluate(premises, evalCtx),
    startHScene, endHScene, getLevel, calcFavorability, calcTrust, calcJudge,
    registerPremise: (id: string, handler: any) => premiseRegistry.register(id, handler),
  })

  loadHInstructions()

  const doHCmd: CommandDef = {
    id: 'do_h', label: '邀请H', group: 'character_commands',
    modes: ['exploration'], priority: 80, timeCost: 10,
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
    id: 'end_h', label: '结束H', group: 'character_commands',
    modes: ['h_scene'], priority: 1, source: 'plugin:h-core',
    handler: async (execCtx: any) => {
      const playerId = execCtx?.gameStore?.player?.id
      if (playerId) await endHScene(playerId)
    },
  }
  ctx.commands.register(endHCmd)
}

async function startHScene(allyId: string, targetId: string): Promise<void> {
  const targetChar = entitySystem.get('character', targetId) as any
  if (!targetChar) return
  targetChar.h_state = createHState()
  const allyChar = entitySystem.get('character', allyId) as any
  if (allyChar) allyChar.h_state = createHState()
  await gameContext.enterMode('h_scene')
  await eventBus.emit('h:start', { ally: allyId, target: targetId })
  narrativeLog.write('开始 H', 'dialogue', 'h-core')
}

async function endHScene(allyId: string): Promise<void> {
  for (const char of entitySystem.getAll('character')) {
    const c = char as any
    if (c.h_state?.is_h) c.h_state = undefined
  }
  await gameContext.exitMode()
  await eventBus.emit('h:end', { ally: allyId })
  narrativeLog.write('结束 H', 'dialogue', 'h-core')
}

function applyStateChange(charId: string, statusId: string, value: number): void {
  const char = entitySystem.get('character', charId) as any
  if (!char) return
  if (!char.base) char.base = {}
  const current = char.base[statusId] ?? 0
  char.base[statusId] = Math.max(0, current + value)
}
