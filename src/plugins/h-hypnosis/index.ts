import type { PluginContext } from '../../core/types'
import { entitySystem } from '../../core/entity-system'

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

export function onLoad(_ctx: PluginContext): void { void lastHypnosisType /* TODO Task 3 */ }
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
