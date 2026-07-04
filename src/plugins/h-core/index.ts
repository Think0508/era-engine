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
import { calcFavorability, getFavorabilityLevel, getTrustLevel } from './settle/favorability'
import { calcStateChange } from './settle/state'
import { calcTrust } from './settle/trust'
import { calcJudge, getLevel } from './settle/judge'
import { checkOrgasm } from './settle/orgasm'
import { modLoader } from '../../core/mod-loader'

export const premiseRegistry = new PremiseRegistry()

export function onLoad(_ctx: PluginContext): void {
  // 注释：judge_check——实行判定（公式#3），在效果前运行
  // 结果存 execCtx._judgeResult，settle_* 效果跳过 retreated
  effectTypeRegistry.register('judge_check', (params: any, execCtx: any) => {
    const targetIds = execCtx._targetIds as string[]
    const judgeBase = params.base ?? 0
    for (const id of targetIds) {
      const char = entitySystem.get('character', id) as any
      const f = char?.base?.好感度 ?? 0
      const t = char?.base?.信赖度 ?? 0
      const r = calcJudge(judgeBase, f, t)
      execCtx._judgeResult = r
      if (r.retreated) {
        narrativeLog.write(`${char?.name ?? id} 退缩了`, 'dialogue', 'h-core')
      }
    }
    return true
  })

  function canApply(ctx: any): boolean {
    const r = ctx._judgeResult
    return !r?.retreated
  }

  effectTypeRegistry.register('settle_favorability', (params: any, execCtx: any) => {
    if (!canApply(execCtx)) return true
    const ids = execCtx._targetIds as string[]
    const tc = execCtx._timeCost ?? params.base ?? 10
    for (const id of ids) {
      const r = calcFavorability(id, tc)
      if (r !== 0) applyStateChange(id, '好感度', r)
    }
    return true
  })

  effectTypeRegistry.register('settle_trust', (_p: any, execCtx: any) => {
    if (!canApply(execCtx)) return true
    const ids = execCtx._targetIds as string[]
    const tc = execCtx._timeCost ?? 10
    for (const id of ids) {
      const r = calcTrust(tc, 0)
      if (r > 0) applyStateChange(id, '信赖度', r)
    }
    return true
  })

  effectTypeRegistry.register('settle_state', (params: any, execCtx: any) => {
    if (!canApply(execCtx)) return true
    const ids = execCtx._targetIds as string[]
    const hc = (modLoader.getMod()?.hConfig as any) ?? {}
    const tbl = hc.ability_lv_adjust ?? [1.0, 1.1, 1.25, 1.4, 1.6, 1.8, 2.1, 2.4, 2.8, 3.2, 4.0]
    const tc = execCtx._timeCost ?? 10
    const bv = params.baseValue ?? 30
    const base = tc + bv
    for (const id of ids) {
      const ch = entitySystem.get('character', id) as any
      const al = ch?.abilities?.[params.state]?.level ?? 0
      const raw = calcStateChange(base, al, tbl)
      const fv = params.negate ? -raw : raw
      if (fv !== 0) applyStateChange(id, params.state, fv)
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

  effectTypeRegistry.register('h_end_h', async (_p: any, execCtx: any) => {
    const allyId = execCtx.sourceId
    if (allyId) await endHScene(allyId)
    return true
  })

  effectTypeRegistry.register('h_state_change', (params: any, execCtx: any) => {
    const ids = execCtx._targetIds as string[]
    for (const id of ids) applyStateChange(id, params.statusId, params.value)
    return true
  })

  effectTypeRegistry.register('h_orgasm_check', (params: any, execCtx: any) => {
    const ids = execCtx._targetIds as string[]
    const pt = params.partId ?? 0
    for (const id of ids) {
      const ch = entitySystem.get('character', id) as any
      if (!ch?.h_state) continue
      const hs = ch.h_state as H_STATE
      const sv = ch.base?.[params.statusKey] ?? 0
      const r = checkOrgasm(pt, sv, hs.orgasm_level[pt] ?? 0)
      if (r) {
        if (!hs.orgasm_count[pt]) hs.orgasm_count[pt] = [0, 0]
        hs.orgasm_count[pt][0]++; hs.orgasm_count[pt][1]++
        if (!hs.orgasm_level[pt]) hs.orgasm_level[pt] = 0
        hs.orgasm_level[pt]++
        narrativeLog.write(`${ch.name || id} ${r.level} 绝顶！`, 'dialogue', 'h-core')
        eventBus.emit('h:orgasm', { character: id, partId: pt, level: r.level })
      }
    }
    return true
  })

  effectTypeRegistry.register('h_experience', (params: any, execCtx: any) => {
    const ids = execCtx._targetIds as string[]
    for (const id of ids) {
      const ch = entitySystem.get('character', id) as any
      if (!ch) continue
      if (!ch.experience) ch.experience = {}
      ch.experience[params.expId] = (ch.experience[params.expId] ?? 0) + (params.value ?? 1)
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
    getFavorabilityLevel, getTrustLevel,
    registerPremise: (id: string, handler: any) => premiseRegistry.register(id, handler),
  })

  loadHInstructions()

  const doHCmd: CommandDef = {
    id: 'do_h', label: '邀请H', group: 'character_commands',
    modes: ['exploration'], priority: 80, timeCost: 10,
    condition: 'premises:HAVE_TARGET,NOT_H,T_NORMAL,SCENE_ONLY_TWO,TIRED_LE_74',
    source: 'plugin:h-core',
    handler: async (execCtx: any) => {
      const s = execCtx?.uiStore?.selectedCharacterId
      const p = execCtx?.gameStore?.player?.id
      if (s && p) await startHScene(p, s)
    },
  }
  ctx.commands.register(doHCmd)

  const endHCmd: CommandDef = {
    id: 'end_h', label: '结束H', group: 'character_commands',
    modes: ['h_scene'], priority: 1, source: 'plugin:h-core',
    handler: async (execCtx: any) => {
      const p = execCtx?.gameStore?.player?.id
      if (p) await endHScene(p)
    },
  }
  ctx.commands.register(endHCmd)
}

async function startHScene(allyId: string, targetId: string): Promise<void> {
  const t = entitySystem.get('character', targetId) as any
  if (!t) return
  t.h_state = createHState()
  const a = entitySystem.get('character', allyId) as any
  if (a) a.h_state = createHState()
  await gameContext.enterMode('h_scene')
  await eventBus.emit('h:start', { ally: allyId, target: targetId })
  narrativeLog.write('开始 H', 'dialogue', 'h-core')
}

async function endHScene(allyId: string): Promise<void> {
  for (const ch of entitySystem.getAll('character')) {
    const c = ch as any
    if (c.h_state?.is_h) c.h_state = undefined
  }
  await gameContext.exitMode()
  await eventBus.emit('h:end', { ally: allyId })
  narrativeLog.write('结束 H', 'dialogue', 'h-core')
}

function applyStateChange(charId: string, sid: string, val: number): void {
  const ch = entitySystem.get('character', charId) as any
  if (!ch) return
  if (!ch.base) ch.base = {}
  const cur = ch.base[sid] ?? 0
  ch.base[sid] = Math.max(0, cur + val)
}
