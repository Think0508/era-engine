// 注释：h-bondage 插件——紧缚系统
// 绳艺捆绑，完全对齐 erArk bondage 系统
// - h_state.bondage: int（0=未捆绑, 1-15=捆绑类型ID）
// - 前提：HAVE_BONDAGE / SELF_NOW_BONDAGE / TARGET_NOW_BONDAGE 等
// - 效果：bind / unbind / bondage_tick
// - 每行动后 tick：欲情/羞耻/苦痛 += time×3 × getAdj × level×0.5

import type { PluginContext } from '../../core/types'
import { effectTypeRegistry } from '../../core/effect-type-registry'
import { entitySystem } from '../../core/entity-system'
import { eventBus } from '../../core/event-bus'
import { gameContext } from '../../core/game-context'
import { modLoader } from '../../core/mod-loader'
import { apiSystem } from '../../core/api'
import { narrativeLog } from '../../core/narrative-log'

export interface BondageType {
  id: number
  name: string
  level: number
  affect_walking: boolean
  need_facility: boolean
  description: string
}

let bondageTypes: BondageType[] = []

// 注释：加载 bondage.toml
function loadBondageTypes(): void {
  const files = import.meta.glob('/mods/**/bondage/types.toml', { as: 'raw', eager: true })
  for (const content of Object.values(files)) {
    if (content) {
      const data = JSON.parse(JSON.stringify((globalThis as any).TOML?.parse?.(content) ?? {}))
      if (data?.types) { bondageTypes = data.types as BondageType[]; return }
      // 注释：fallback——同步解析
      try {
        const toml = content as string
        const lines = toml.split('\n')
        const result: BondageType[] = []
        let current: any = null
        for (const line of lines) {
          const t = line.trim()
          if (t === '[[types]]') { current = {}; continue }
          if (!current) continue
          const m = t.match(/^(\w+)\s*=\s*(.+)$/)
          if (m) {
            const k = m[1]; const v = m[2]
            if (v === 'true') current[k] = true
            else if (v === 'false') current[k] = false
            else if (!isNaN(Number(v))) current[k] = Number(v)
            else current[k] = v.replace(/^"|"$/g, '')
          }
          if (t.startsWith('[[') && current && current.id != null) { result.push(current as BondageType); current = null }
        }
        if (current?.id != null) result.push(current as BondageType)
        bondageTypes = result
        return
      } catch { }
    }
  }
}

function getAbilityAdjust(lv: number): number {
  const hc = (modLoader.getMod()?.hConfig as any) ?? {}
  const tbl = hc.ability_lv_adjust ?? [1.0, 1.1, 1.25, 1.4, 1.6, 1.8, 2.1, 2.4, 2.8, 3.2, 4.0]
  return tbl[Math.min(Math.max(0, lv), 10)] ?? 4.0
}

// 注释：刻印调整表（erArk get_mark_debuff_adjust: 0→1, 1→1.5, 2→3, 3+→5）
function getMarkAdjust(lv: number): number {
  return lv >= 3 ? 5 : [1, 1.5, 3, 5][Math.max(0, lv)]
}

function getSelfId(ctx: any): string | null {
  return ctx.gameStore?.player?.id ?? ctx.sourceId ?? null
}

function getTargetId(ctx: any): string | null {
  return ctx.selectedCharacterId ?? ctx.uiStore?.selectedCharacterId ?? null
}

export function onLoad(_ctx: PluginContext): void {
  loadBondageTypes()

  // 注释：bind——执行捆绑
  // erArk behavior_effect: 15(屈服) 16(羞耻) 21/59/81/86(经验)
  effectTypeRegistry.register('bind', async (_p: any, execCtx: any) => {
    const bondageId = (_p.bondageId as number) ?? 0
    const addTime = execCtx._timeCost ?? 10
    for (const id of execCtx._targetIds as string[]) {
      const ch = entitySystem.get('character', id) as any
      if (!ch) continue
      if (!ch.h_state) continue
      ch.h_state.bondage = bondageId
      const cfg = bondageTypes.find(b => b.id === bondageId)
      const name = cfg?.name ?? bondageId.toString()
      narrativeLog.write(`${ch.name ?? id} 被捆成了${name}`, 'system', 'h-bondage')
      // 注释：屈服(15) + 羞耻(16)
      if (!ch.base) ch.base = {}
      ch.base['屈服'] = Math.min(99999, (ch.base['屈服'] ?? 0) + Math.floor(addTime * 1.5))
      ch.base['羞耻'] = Math.min(99999, (ch.base['羞耻'] ?? 0) + Math.floor(addTime * 1.5))
      // 注释：经验——SM/被虐
      if (!ch.experience) ch.experience = {}
      ch.experience['sm'] = (ch.experience['sm'] ?? 0) + 1
      ch.experience['abused'] = (ch.experience['abused'] ?? 0) + 1
      eventBus.emit('character:changed', { id })
    }
    return true
  })

  // 注释：unbind——解除捆绑
  // erArk behavior_effect: 15(屈服) 16(羞耻) 21/81(经验)
  effectTypeRegistry.register('unbind', async (_p: any, execCtx: any) => {
    const addTime = execCtx._timeCost ?? 10
    for (const id of execCtx._targetIds as string[]) {
      const ch = entitySystem.get('character', id) as any
      if (!ch?.h_state) continue
      ch.h_state.bondage = 0
      narrativeLog.write(`${ch.name ?? id} 的绳子被解开了`, 'system', 'h-bondage')
      if (!ch.base) ch.base = {}
      ch.base['屈服'] = Math.min(99999, (ch.base['屈服'] ?? 0) + Math.floor(addTime * 1.5))
      ch.base['羞耻'] = Math.min(99999, (ch.base['羞耻'] ?? 0) + Math.floor(addTime * 1.5))
      if (!ch.experience) ch.experience = {}
      ch.experience['sm'] = (ch.experience['sm'] ?? 0) + 1
      eventBus.emit('character:changed', { id })
    }
    return true
  })

  // 注释：bondage_tick——持续欲情/羞耻/苦痛
  // erArk realtime_settle.py 公式：
  //   timeBase = true_add_time × 3
  //   adjust = level × 0.5
  //   final_adjust = feel_adjust + adjust        ← 相加，不是相乘！
  //   final_value = timeBase × final_adjust
  //   feel_adjust:
  //     欲情(12) → ability[33] → get_ability_adjust（标准表）
  //     羞耻(16) → ability[34] → get_ability_adjust（标准表）
  //     苦痛(17) → ability[15] → get_mark_debuff_adjust（刻印表）
  effectTypeRegistry.register('bondage_tick', (_p: any, execCtx: any) => {
    const addTime = execCtx._timeCost ?? 10
    for (const id of execCtx._targetIds as string[]) {
      const ch = entitySystem.get('character', id) as any
      if (!ch?.h_state) continue
      const bId = ch.h_state.bondage ?? 0
      if (bId <= 0) continue
      const cfg = bondageTypes.find(b => b.id === bId)
      if (!cfg) continue
      const lvl = cfg.level
      const adjust = lvl * 0.5
      const timeBase = addTime * 3
      if (!ch.base) ch.base = {}
      // 注释：欲情(12) = standard adjust(ability[33]) + adjust
      const lustAb = ch.abilities?.['欲情']?.level ?? 0
      const lustAdj = getAbilityAdjust(lustAb) + adjust
      ch.base['欲情'] = Math.min(99999, (ch.base['欲情'] ?? 0) + Math.floor(timeBase * lustAdj))
      // 注释：羞耻(16) = standard adjust(ability[34]) + adjust
      const shameAb = ch.abilities?.['露出']?.level ?? 0
      const shameAdj = getAbilityAdjust(shameAb) + adjust
      ch.base['羞耻'] = Math.min(99999, (ch.base['羞耻'] ?? 0) + Math.floor(timeBase * shameAdj))
      // 注释：苦痛(17) = mark_debuff_adjust(ability[15]) + adjust
      const painAb = ch.abilities?.['苦痛刻印']?.level ?? 0
      const painAdj = getMarkAdjust(painAb) + adjust
      ch.base['苦痛'] = Math.min(99999, (ch.base['苦痛'] ?? 0) + Math.floor(timeBase * painAdj))
    }
    return true
  })
}

export async function onEnable(ctx: PluginContext): Promise<void> {
  // 通过插件 API 注册
  const reg = async (id: string, fn: (c: any) => boolean) => {
    try { await ctx.api.call('h-core', 'registerPremise', id, fn) } catch { }
  }

  reg('HAVE_BONDAGE', (ctx2: any) => {
    const charId = getSelfId(ctx2)
    if (!charId) return false
    const ch = entitySystem.get('character', charId) as any
    return ch?.inventory?.some((i: any) => i.itemId === '绳子' && i.count > 0) ?? false
  })

  reg('SELF_NOW_BONDAGE', (ctx2: any) => {
    const charId = getSelfId(ctx2)
    if (!charId) return false
    const ch = entitySystem.get('character', charId) as any
    return (ch?.h_state?.bondage ?? 0) > 0
  })

  reg('SELF_NOT_BONDAGE', (ctx2: any) => {
    const charId = getSelfId(ctx2)
    if (!charId) return true
    const ch = entitySystem.get('character', charId) as any
    return (ch?.h_state?.bondage ?? 0) <= 0
  })

  reg('TARGET_NOW_BONDAGE', (ctx2: any) => {
    const charId = getTargetId(ctx2)
    if (!charId) return false
    const ch = entitySystem.get('character', charId) as any
    return (ch?.h_state?.bondage ?? 0) > 0
  })

  reg('TARGET_NOT_BONDAGE', (ctx2: any) => {
    const charId = getTargetId(ctx2)
    if (!charId) return true
    const ch = entitySystem.get('character', charId) as any
    return (ch?.h_state?.bondage ?? 0) <= 0
  })

  // 注释：每次 H 行动后 bondage_tick
  ctx.events.on('game:execution_end', async () => {
    if (gameContext.getCurrentMode() !== 'h_scene') return
    const bound: string[] = []
    for (const ch of entitySystem.getAll('character')) {
      const c = ch as any
      if ((c.h_state?.bondage ?? 0) > 0) bound.push(c.id)
    }
    if (bound.length === 0) return
    await apiSystem.call('effect-system', 'execute', [{ type: 'bondage_tick', params: { target: 'self' } }], {
      sourceId: bound[0],
      _targetIds: bound,
      _timeCost: 10,
    })
  })

  // 注释：H 结束清除 bondage
  eventBus.on('h:end', () => {
    for (const ch of entitySystem.getAll('character')) {
      const c = ch as any
      if (c.h_state?.bondage) c.h_state.bondage = 0
    }
  })

  // 注释：注册 API
  ctx.api.register('h-bondage', {
    getBondage: (charId: string): number => {
      const ch = entitySystem.get('character', charId) as any
      return ch?.h_state?.bondage ?? 0
    },
    getBondageName: (charId: string): string => {
      const ch = entitySystem.get('character', charId) as any
      const bId = ch?.h_state?.bondage ?? 0
      const cfg = bondageTypes.find(b => b.id === bId)
      return cfg?.name ?? ''
    },
    getBondageTypes: (): BondageType[] => bondageTypes,
  })
}
