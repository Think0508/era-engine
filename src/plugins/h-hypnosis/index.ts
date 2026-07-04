import type { PluginContext } from '../../core/types'
import { entitySystem } from '../../core/entity-system'
import { effectTypeRegistry } from '../../core/effect-type-registry'
import { narrativeLog } from '../../core/narrative-log'

interface HypnosisData {
  hypnosis_degree: number
  increase_body_sensitivity: boolean
  force_ovulation: boolean
  blockhead: boolean
  active_h: boolean
  pain_as_pleasure: boolean
  roleplay: number[]
}

const DEFAULT_HYPNOSIS: HypnosisData = {
  hypnosis_degree: 0, increase_body_sensitivity: false, force_ovulation: false,
  blockhead: false, active_h: false, pain_as_pleasure: false, roleplay: [],
}

const HYPNOSIS_TYPE_NAMES = ['无', '平然催眠', '空气催眠', '体控催眠', '心控催眠']

function getSelfId(ctx: any): string | null { return ctx.gameStore?.player?.id ?? ctx.sourceId ?? null }
function getTargetId(ctx: any): string | null { return ctx.selectedCharacterId ?? ctx.uiStore?.selectedCharacterId ?? null }

function getHypnosis(charId: string): HypnosisData {
  const ch = entitySystem.get('character', charId) as any
  if (!ch) return { ...DEFAULT_HYPNOSIS }
  if (!ch.hypnosis) ch.hypnosis = { ...DEFAULT_HYPNOSIS }
  return ch.hypnosis
}

function getUnconsciousH(charId: string): number {
  const ch = entitySystem.get('character', charId) as any
  return ch?.sp_flag?.unconscious_h ?? 0
}

function setUnconsciousH(charId: string, val: number): void {
  const ch = entitySystem.get('character', charId) as any
  if (!ch) return; if (!ch.sp_flag) ch.sp_flag = {}
  ch.sp_flag.unconscious_h = val
}

let lastHypnosisType = 1

function registerBoolEffect(type: string, field: string, value: boolean): void {
  effectTypeRegistry.register(type, (_p: any, execCtx: any) => {
    for (const id of execCtx._targetIds as string[]) (getHypnosis(id) as any)[field] = value
    return true
  })
}

export function onLoad(_ctx: PluginContext): void {
  void lastHypnosisType

  // Core: hypnosis_one
  effectTypeRegistry.register('hypnosis_one', (_p: any, execCtx: any) => {
    const ids = execCtx._targetIds as string[]
    if (ids.length === 0) return true
    const id = ids[0]
    const h = getHypnosis(id)
    const gain = 1
    h.hypnosis_degree = Math.min(h.hypnosis_degree + gain, 200)
    if (h.hypnosis_degree > 0 && (getUnconsciousH(id) < 4 || getUnconsciousH(id) > 7)) {
      setUnconsciousH(id, 4)
    }
    narrativeLog.write(`催眠程度 +${gain}`, 'system', 'h-hypnosis')
    return true
  })

  // Core: hypnosis_all
  effectTypeRegistry.register('hypnosis_all', (_p: any, execCtx: any) => {
    const allIds = entitySystem.getAllIds('character')
    for (const id of allIds) {
      const h = getHypnosis(id)
      if (h.hypnosis_degree === 0) {
        const gain = 1
        h.hypnosis_degree = Math.min(h.hypnosis_degree + gain, 200)
        if (h.hypnosis_degree > 0 && (getUnconsciousH(id) < 4 || getUnconsciousH(id) > 7)) {
          setUnconsciousH(id, 4)
        }
        narrativeLog.write(`催眠程度 +${gain}`, 'system', 'h-hypnosis')
      }
    }
    return true
  })

  // Core: hypnosis_cancel
  effectTypeRegistry.register('hypnosis_cancel', (_p: any, execCtx: any) => {
    for (const id of execCtx._targetIds as string[]) {
      const h = getHypnosis(id)
      h.hypnosis_degree = 0
      h.increase_body_sensitivity = false
      h.force_ovulation = false
      h.blockhead = false
      h.active_h = false
      h.pain_as_pleasure = false
      h.roleplay = []
      setUnconsciousH(id, 0)
    }
    return true
  })

  // Sub-state on/off: increase_body_sensitivity
  registerBoolEffect('hypnosis_increase_body_sensitivity_on', 'increase_body_sensitivity', true)
  registerBoolEffect('hypnosis_increase_body_sensitivity_off', 'increase_body_sensitivity', false)

  // Sub-state on/off: force_ovulation
  registerBoolEffect('hypnosis_force_ovulation_on', 'force_ovulation', true)
  registerBoolEffect('hypnosis_force_ovulation_off', 'force_ovulation', false)

  // Sub-state on/off: blockhead
  registerBoolEffect('hypnosis_blockhead_on', 'blockhead', true)
  registerBoolEffect('hypnosis_blockhead_off', 'blockhead', false)

  // Sub-state on/off: active_h
  registerBoolEffect('hypnosis_active_h_on', 'active_h', true)
  registerBoolEffect('hypnosis_active_h_off', 'active_h', false)

  // Sub-state on/off: pain_as_pleasure
  registerBoolEffect('hypnosis_pain_as_pleasure_on', 'pain_as_pleasure', true)
  registerBoolEffect('hypnosis_pain_as_pleasure_off', 'pain_as_pleasure', false)

  // Switch: blockhead
  effectTypeRegistry.register('hypnosis_blockhead_switch', (_p: any, execCtx: any) => {
    for (const id of execCtx._targetIds as string[]) {
      getHypnosis(id).blockhead = !getHypnosis(id).blockhead
    }
    return true
  })

  // Switch: active_h (toggle + trigger H when turning on)
  effectTypeRegistry.register('hypnosis_active_h_switch', (_p: any, execCtx: any) => {
    for (const id of execCtx._targetIds as string[]) {
      const h = getHypnosis(id)
      h.active_h = !h.active_h
      if (h.active_h) {
        narrativeLog.write(`逆推触发: ${id}`, 'system', 'h-hypnosis')
      }
    }
    return true
  })

  // Switch: pain_as_pleasure
  effectTypeRegistry.register('hypnosis_pain_as_pleasure_switch', (_p: any, execCtx: any) => {
    for (const id of execCtx._targetIds as string[]) {
      getHypnosis(id).pain_as_pleasure = !getHypnosis(id).pain_as_pleasure
    }
    return true
  })

  // Force climax
  effectTypeRegistry.register('hypnosis_force_climax', (_p: any, execCtx: any) => {
    for (const id of execCtx._targetIds as string[]) {
      narrativeLog.write(`强制绝顶: ${id}`, 'system', 'h-hypnosis')
    }
    return true
  })
}
export async function onEnable(ctx: PluginContext): Promise<void> {
  const reg = (id: string, fn: (c: any) => boolean) => {
    try { ctx.api.call('h-core', 'registerPremise', id, fn) } catch { }
  }

  reg('PRIMARY_HYPNOSIS', () => true)
  reg('INTERMEDIATE_HYPNOSIS', () => true)
  reg('ADVANCED_HYPNOSIS', () => true)
  reg('SPECIAL_HYPNOSIS', () => true)

  reg('SELF_HYPNOSIS_0', (ctx2: any) => { const id = getSelfId(ctx2); return id ? getHypnosis(id).hypnosis_degree === 0 : false })
  reg('T_HYPNOSIS_0', (ctx2: any) => { const id = getTargetId(ctx2); return id ? getHypnosis(id).hypnosis_degree === 0 : false })
  reg('SELF_HYPNOSIS_NE_0', (ctx2: any) => { const id = getSelfId(ctx2); return id ? getHypnosis(id).hypnosis_degree !== 0 : false })
  reg('T_HYPNOSIS_NE_0', (ctx2: any) => { const id = getTargetId(ctx2); return id ? getHypnosis(id).hypnosis_degree !== 0 : false })

  reg('IN_HYPNOSIS', (ctx2: any) => { const id = getSelfId(ctx2); if (!id) return false; const u = getUnconsciousH(id); return u >= 4 && u <= 7 })
  reg('NOT_IN_HYPNOSIS', (ctx2: any) => { const id = getSelfId(ctx2); if (!id) return false; const u = getUnconsciousH(id); return u < 4 || u > 7 })
  reg('T_IN_HYPNOSIS', (ctx2: any) => { const id = getTargetId(ctx2); if (!id) return false; const u = getUnconsciousH(id); return u >= 4 && u <= 7 })
  reg('T_NOT_IN_HYPNOSIS', (ctx2: any) => { const id = getTargetId(ctx2); if (!id) return false; const u = getUnconsciousH(id); return u < 4 || u > 7 })

  function regSubState(name: string, getter: (h: HypnosisData) => boolean) {
    reg(`HYPNOSIS_${name}`, (ctx2: any) => { const id = getSelfId(ctx2); return id ? getter(getHypnosis(id)) : false })
    reg(`NOT_HYPNOSIS_${name}`, (ctx2: any) => { const id = getSelfId(ctx2); return id ? !getter(getHypnosis(id)) : false })
    reg(`T_HYPNOSIS_${name}`, (ctx2: any) => { const id = getTargetId(ctx2); return id ? getter(getHypnosis(id)) : false })
    reg(`T_NOT_HYPNOSIS_${name}`, (ctx2: any) => { const id = getTargetId(ctx2); return id ? !getter(getHypnosis(id)) : false })
  }
  regSubState('INCREASE_BODY_SENSITIVITY', h => h.increase_body_sensitivity)
  regSubState('FORCE_OVULATION', h => h.force_ovulation)
  regSubState('BLOCKHEAD', h => h.blockhead)
  regSubState('ACTIVE_H', h => h.active_h)
  regSubState('PAIN_AS_PLEASURE', h => h.pain_as_pleasure)
  regSubState('ROLEPLAY', h => h.roleplay.length > 0)
}

export type { HypnosisData }
export { DEFAULT_HYPNOSIS, HYPNOSIS_TYPE_NAMES, getSelfId, getTargetId, getHypnosis, getUnconsciousH, setUnconsciousH }
