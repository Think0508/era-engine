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
export async function onEnable(_ctx: PluginContext): Promise<void> { /* TODO Task 2 */ }

export type { HypnosisData }
export { DEFAULT_HYPNOSIS, HYPNOSIS_TYPE_NAMES, getSelfId, getTargetId, getHypnosis, getUnconsciousH, setUnconsciousH }
