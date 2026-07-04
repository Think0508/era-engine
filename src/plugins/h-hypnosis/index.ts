import type { PluginContext } from '../../core/types'
import { entitySystem } from '../../core/entity-system'
import { effectTypeRegistry } from '../../core/effect-type-registry'
import { narrativeLog } from '../../core/narrative-log'
import { eventBus } from '../../core/event-bus'

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

// 精神力 — 消耗资源，参考 h-time-stop TSP 模式
const HYPNOSIS_SANITY_MAX = 100

function getSanity(charId: string): number {
  const ch = entitySystem.get('character', charId) as any
  return ch?.base?.['精神'] ?? HYPNOSIS_SANITY_MAX
}

function setSanity(charId: string, val: number): void {
  const ch = entitySystem.get('character', charId) as any
  if (!ch) return
  if (!ch.base) ch.base = {}
  ch.base['精神'] = Math.max(0, Math.min(HYPNOSIS_SANITY_MAX, val))
}

function getHypnosisXp(charId: string): number {
  const ch = entitySystem.get('character', charId) as any
  return ch?.experience?.hypnosis ?? 0
}

function addHypnosisXp(charId: string, amount: number): void {
  const ch = entitySystem.get('character', charId) as any
  if (!ch) return
  if (!ch.experience) ch.experience = {}
  ch.experience.hypnosis = (ch.experience.hypnosis ?? 0) + amount
}

// 玩家催眠天赋检查 — xp 阈值: 1→331, 10→332, 50→333, 200→334
const HYPNOSIS_TALENT_XP = [1, 10, 50, 200]  // 331, 332, 333, 334
function hasHypnosisTalent(talentId: number): boolean {
  const playerId = entitySystem.getAll('character').find((c: any) => c.id === 'player' || c.id === '0')?.id
  if (!playerId) return false
  const xp = getHypnosisXp(playerId)
  const idx = talentId - 331
  if (idx < 0 || idx >= HYPNOSIS_TALENT_XP.length) return false
  return xp >= HYPNOSIS_TALENT_XP[idx]
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

function getAbilityAdjust(lv: number): number {
  const tbl = [1.0, 1.1, 1.25, 1.4, 1.6, 1.8, 2.1, 2.4, 2.8, 3.2, 4.0]
  return tbl[Math.min(Math.max(0, lv), 10)] ?? 4.0
}

function calculateHypnosisDegree(charId: string): number {
  const target = entitySystem.get('character', charId) as any
  if (!target) return 0
  const type = lastHypnosisType
  let baseCoeff = 2
  if (type === 2) baseCoeff = 4
  else if (type >= 3) baseCoeff = 6
  const markLv = target?.abilities?.['无觉刻印']?.level ?? 0
  const abilityAdj = getAbilityAdjust(markLv)
  const adjust = baseCoeff * abilityAdj
  const rand = 0.5 + Math.random()
  return Math.round(1 * adjust * rand * 10) / 10
}

// TODO: 调香加成（aromatherapy == 6）依赖香薰系统就绪后接入
function calculateSanityCost(charId: string): number {
  const target = entitySystem.get('character', charId) as any
  if (!target) return 20
  if (!target.talent) target.talent = {}
  if (target.talent[73]) return 1
  if (target.talent[72]) return 30
  if (target.talent[71]) return 25
  return 20
}

function getHypnosisDegreeLimit(): number {
  const limits = [0, 50, 100, 100, 200]  // 331→50, 332→100, 333→100, 334→200
  for (let i = limits.length - 1; i >= 0; i--) {
    if (hasHypnosisTalent(331 + i)) return limits[i]
  }
  return 0
}

// 注释：NPC 催眠天赋阈值 — 程度 ≥ 50→71, ≥ 100→72, ≥ 200→73
// erArk hypnosis_panel.py:107-158 + handle_talent.py:189-222
function checkHypnosisCompletion(charId: string): boolean {
  const ch = entitySystem.get('character', charId) as any
  if (!ch) return false
  const h = getHypnosis(charId)
  const degree = h.hypnosis_degree
  if (!ch.talent) ch.talent = {}
  const talent = ch.talent
  let changed = false

  // 注释：程度 ≥ 200 → 完全催眠(73)
  if (degree >= 200 && !talent[73]) {
    talent[73] = true
    narrativeLog.write(`${ch.name ?? charId} 被完全催眠了！`, 'system', 'h-hypnosis')
    changed = true
  }
  // 注释：程度 ≥ 100 → 深度催眠(72)
  if (degree >= 100 && !talent[72]) {
    talent[72] = true
    narrativeLog.write(`${ch.name ?? charId} 被深度催眠了！`, 'system', 'h-hypnosis')
    changed = true
  }
  // 注释：程度 ≥ 50 → 初级催眠(71)
  if (degree >= 50 && !talent[71]) {
    talent[71] = true
    narrativeLog.write(`${ch.name ?? charId} 被初级催眠了！`, 'system', 'h-hypnosis')
    changed = true
  }
  return changed
}

function applySensitivityBonus(charId: string, baseAdjust: number): number {
  const h = getHypnosis(charId)
  if (h.increase_body_sensitivity) return baseAdjust + 2
  return baseAdjust
}

function applyPainAsPleasure(charId: string, stateId: number): number {
  const h = getHypnosis(charId)
  if (h.pain_as_pleasure && stateId === 17) return 23
  return stateId
}

function applyAirHypnosisTrustMod(charId: string, trustGain: number): number {
  if (getUnconsciousH(charId) === 5) return 0
  return trustGain
}

function applyHypnosisSexExp(charId: string): void {
  const u = getUnconsciousH(charId)
  if (u >= 4 && u <= 7) {
    const target = entitySystem.get('character', charId) as any
    if (target) {
      if (!target.h_exp) target.h_exp = {}
      target.h_exp.hypnosis = (target.h_exp.hypnosis ?? 0) + 1
    }
  }
}

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
    const gain = calculateHypnosisDegree(id)
    h.hypnosis_degree = Math.min(h.hypnosis_degree + gain, getHypnosisDegreeLimit())
    checkHypnosisCompletion(id)
    if (h.hypnosis_degree > 0 && (getUnconsciousH(id) < 4 || getUnconsciousH(id) > 7)) {
      setUnconsciousH(id, 4)
    }
    narrativeLog.write(`催眠程度 +${gain}`, 'system', 'h-hypnosis')
    return true
  })

  // Core: hypnosis_all
  effectTypeRegistry.register('hypnosis_all', (_p: any, _execCtx: any) => {
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

  reg('PRIMARY_HYPNOSIS', () => hasHypnosisTalent(331))
  reg('INTERMEDIATE_HYPNOSIS', () => hasHypnosisTalent(332))
  reg('ADVANCED_HYPNOSIS', () => hasHypnosisTalent(333))
  reg('SPECIAL_HYPNOSIS', () => hasHypnosisTalent(334))

  eventBus.on('game:new_day', () => {
    for (const ch of entitySystem.getAll('character')) {
      setSanity(ch.id, HYPNOSIS_SANITY_MAX)
    }
  })

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
  // TODO: 角色扮演系统（第二阶段）— roleplay 逻辑待实现
  regSubState('ROLEPLAY', h => h.roleplay.length > 0)

  // 注册公共 API
  ctx.api.register('h-hypnosis', {
    getDegree: (charId: string) => getHypnosis(charId).hypnosis_degree,
    getType: () => lastHypnosisType,
    isHypnotized: (charId: string) => { const u = getUnconsciousH(charId); return u >= 4 && u <= 7 },
    getTypeName: (charId: string) => HYPNOSIS_TYPE_NAMES[getUnconsciousH(charId) >= 4 && getUnconsciousH(charId) <= 7 ? getUnconsciousH(charId) - 3 : 0] ?? '无',
  })

  // 注册 UI 插槽 — 催眠状态标签
  try {
    ctx.ui.registerSlot('character-tag', {
      id: 'hypnosis-tag',
      component: 'HypnosisTag' as any,
      priority: 40,
      condition: (gc: any) => gc?.selectedCharacterId ? (getUnconsciousH(gc.selectedCharacterId) >= 4 && getUnconsciousH(gc.selectedCharacterId) <= 7) : false,
    })
  } catch { /* UI 未就绪 */ }
}

export type { HypnosisData }
export {
  DEFAULT_HYPNOSIS, HYPNOSIS_TYPE_NAMES, getSelfId, getTargetId, getHypnosis, getUnconsciousH, setUnconsciousH,
  getAbilityAdjust, calculateHypnosisDegree, calculateSanityCost, getHypnosisDegreeLimit, checkHypnosisCompletion,
  applySensitivityBonus, applyPainAsPleasure, applyAirHypnosisTrustMod, applyHypnosisSexExp,
}
