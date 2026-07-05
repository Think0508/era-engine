// 注释：h-time-stop 插件——时停系统，完全对齐 erArk
// 全局时停模式 + TSP 消耗（按行动时长）+ 隐藏经验线性增长 TSP 上限
// 所有功能直接开放，无等级门槛

import type { PluginContext } from '../../core/types'
import { effectTypeRegistry } from '../../core/effect-type-registry'
import { entitySystem } from '../../core/entity-system'
import { gameContext } from '../../core/game-context'
import { narrativeLog } from '../../core/narrative-log'
import { commandRegistry } from '../../core/command-registry'

let timeStopActive = false
let lastActionTimeCost = 10  // 注释：缺省 10 分钟
let frozenTime: { minute: number; hour: number; day: number; month: number; year: number } | null = null

function getTargetId(ctx: any): string | null {
  return ctx.selectedCharacterId ?? ctx.uiStore?.selectedCharacterId ?? null
}

function getSelfId(ctx: any): string | null {
  return ctx.gameStore?.player?.id ?? ctx.sourceId ?? null
}

// 注释：获取角色的时停标记
function getUnconsciousH(charId: string): number {
  const ch = entitySystem.get('character', charId) as any
  return ch?.sp_flag?.unconscious_h ?? 0
}

export function onLoad(_ctx: PluginContext): void {
  // 注释：time_stop_on——开启时停（对齐 erArk 效果 1241）
  effectTypeRegistry.register('time_stop_on', (_p: any, _execCtx: any) => {
    if (timeStopActive) return true
    timeStopActive = true
    frozenTime = { ...gameContext.getContext().time }
    for (const ch of entitySystem.getAll('character')) {
      const c = ch as any
      if (!c.sp_flag) c.sp_flag = {}
      c.sp_flag.unconscious_h = 3
      if (c.h_state) {
        c.h_state.time_stop_orgasm_count = {}
        c.h_state.time_stop_release = false
      }
    }
    narrativeLog.write('时间停止了！', 'system', 'h-time-stop')
    return true
  })

  // 注释：time_stop_off——关闭时停（对齐 erArk 1242 + 527）
  // erArk 链：1244(清搬运) → 1246(清自由) → 536 → 1242(关时停) → 527(释放绝顶)
  effectTypeRegistry.register('time_stop_off', async (_p: any, _execCtx: any) => {
    if (!timeStopActive) return true
    timeStopActive = false
    frozenTime = null
    // 注释：清搬运 + 清自由 + 清除时停状态 + 释放绝顶
    for (const ch of entitySystem.getAll('character')) {
      const c = ch as any
      // 注释：清除搬运/自由数据（对齐 1244 + 1246）
      if (c.time_stop_data) { c.time_stop_data = {} }
      // 注释：清除时停状态（对齐 1242）
      if (c.sp_flag) c.sp_flag.unconscious_h = 0
      // 注释：绝顶释放（对齐 527）
      if (c.h_state?.time_stop_orgasm_count) {
        c.h_state.time_stop_release = true
        for (const [partStr, count] of Object.entries(c.h_state.time_stop_orgasm_count) as [string, number][]) {
          const partId = parseInt(partStr)
          if (count >= 3) {
            const feelLv = c.abilities?.[`feel_${partId}`]?.level ?? 0
            const degree = feelLv >= 6 ? 3 : 2
            narrativeLog.write(`${c.name ?? ''} 时停解放！${count}次累积→超强绝顶(Lv${degree})`, 'system', 'h-time-stop')
          } else if (count > 0) {
            narrativeLog.write(`${c.name ?? ''} 时停解放！${count}次绝顶释放`, 'system', 'h-time-stop')
          }
        }
        c.h_state.time_stop_orgasm_count = {}
      }
    }
    if (frozenTime) gameContext.setTime(frozenTime)
    narrativeLog.write('时间重新流动', 'system', 'h-time-stop')
    return true
  })

  // 注释：unconscious_flag_to_3——单独设置角色时停状态（对齐 erArk 效果 484）
  effectTypeRegistry.register('unconscious_flag_to_3', (_p: any, execCtx: any) => {
    for (const id of execCtx._targetIds as string[]) {
      const ch = entitySystem.get('character', id) as any
      if (!ch) continue
      if (!ch.sp_flag) ch.sp_flag = {}
      ch.sp_flag.unconscious_h = 3
    }
    return true
  })

  // 搬运/自由效果
  effectTypeRegistry.register('time_stop_carry', (_p: any, execCtx: any) => {
    const ids = execCtx._targetIds as string[]
    if (ids.length > 0) {
      const src = entitySystem.get('character', execCtx.sourceId) as any
      if (src) {
        if (!src.time_stop_data) src.time_stop_data = {}
        src.time_stop_data.carryTargetId = ids[0]
        narrativeLog.write(`开始搬运${(entitySystem.get('character', ids[0]) as any)?.name ?? ids[0]}`, 'system', 'h-time-stop')
      }
    }
    return true
  })

  effectTypeRegistry.register('time_stop_carry_stop', (_p: any, execCtx: any) => {
    const src = entitySystem.get('character', execCtx.sourceId) as any
    if (src?.time_stop_data) {
      delete src.time_stop_data.carryTargetId
      narrativeLog.write('停止搬运', 'system', 'h-time-stop')
    }
    return true
  })

  effectTypeRegistry.register('time_stop_free', (_p: any, execCtx: any) => {
    const ids = execCtx._targetIds as string[]
    if (ids.length > 0) {
      const src = entitySystem.get('character', execCtx.sourceId) as any
      if (src) {
        if (!src.time_stop_data) src.time_stop_data = {}
        src.time_stop_data.freeTargetId = ids[0]
        if (src.base) src.base['TSP'] = Math.max(0, (src.base['TSP'] ?? 0) - 50)
        narrativeLog.write(`${(entitySystem.get('character', ids[0]) as any)?.name ?? ids[0]} 可在时停中自由活动`, 'system', 'h-time-stop')
      }
    }
    return true
  })

  effectTypeRegistry.register('time_stop_free_stop', (_p: any, execCtx: any) => {
    const src = entitySystem.get('character', execCtx.sourceId) as any
    if (src?.time_stop_data) delete src.time_stop_data.freeTargetId
    return true
  })
}

export async function onEnable(ctx: PluginContext): Promise<void> {
  const reg = async (id: string, fn: (c: any) => boolean) => {
    try { await ctx.api.call('h-core', 'registerPremise', id, fn) } catch { }
  }

  // 时停状态前提
  reg('TIME_STOP_ON', () => timeStopActive)
  reg('TIME_STOP_OFF', () => !timeStopActive)
  reg('UNCONSCIOUS_FLAG_3', (ctx2: any) => {
    const charId = getSelfId(ctx2); return charId ? getUnconsciousH(charId) === 3 : false
  })
  reg('T_UNCONSCIOUS_FLAG_3', (ctx2: any) => {
    const charId = getTargetId(ctx2); return charId ? getUnconsciousH(charId) === 3 : false
  })

  // 能力等级前提——全部开放，无门槛
  reg('PRIMARY_TIME_STOP', () => true)
  reg('INTERMEDIATE_TIME_STOP', () => true)
  reg('ADVANCED_TIME_STOP', () => true)
  reg('TIME_STOP_JUDGE_FOR_MOVE', () => true)

  // 搬运前提
  reg('NOT_CARRY_ANYBODY_IN_TIME_STOP', (ctx2: any) => {
    const id = getSelfId(ctx2); if (!id) return true
    return !(entitySystem.get('character', id) as any)?.time_stop_data?.carryTargetId
  })
  reg('CARRY_SOMEBODY_IN_TIME_STOP', (ctx2: any) => {
    const id = getSelfId(ctx2); if (!id) return false
    return !!(entitySystem.get('character', id) as any)?.time_stop_data?.carryTargetId
  })
  reg('TARGET_IS_CARRIED_IN_TIME_STOP', (ctx2: any) => {
    const id = getSelfId(ctx2); const tId = getTargetId(ctx2); if (!id || !tId) return false
    return (entitySystem.get('character', id) as any)?.time_stop_data?.carryTargetId === tId
  })

  // 自由活动前提
  reg('NOBODY_FREE_IN_TIME_STOP', (ctx2: any) => {
    const id = getSelfId(ctx2); if (!id) return true
    return !(entitySystem.get('character', id) as any)?.time_stop_data?.freeTargetId
  })
  reg('SOMEBODY_FREE_IN_TIME_STOP', (ctx2: any) => {
    const id = getSelfId(ctx2); if (!id) return false
    return !!(entitySystem.get('character', id) as any)?.time_stop_data?.freeTargetId
  })
  reg('SELF_FREE_IN_TIME_STOP', (ctx2: any) => {
    const id = getSelfId(ctx2); if (!id) return false
    return entitySystem.getAll('character').some((c: any) => c?.time_stop_data?.freeTargetId === id)
  })
  reg('SELF_NOT_FREE_IN_TIME_STOP', (ctx2: any) => {
    const id = getSelfId(ctx2); if (!id) return true
    return !entitySystem.getAll('character').some((c: any) => c?.time_stop_data?.freeTargetId === id)
  })
  reg('TARGET_FREE_IN_TIME_STOP', (ctx2: any) => {
    const tId = getTargetId(ctx2); if (!tId) return false
    return entitySystem.getAll('character').some((c: any) => c?.time_stop_data?.freeTargetId === tId)
  })
  reg('TARGET_NOT_FREE_IN_TIME_STOP', (ctx2: any) => {
    const tId = getTargetId(ctx2); if (!tId) return true
    return !entitySystem.getAll('character').some((c: any) => c?.time_stop_data?.freeTargetId === tId)
  })

  // 绝顶释放前提
  reg('SELF_TIME_STOP_ORGASM_RELEASE', (ctx2: any) => {
    const id = getSelfId(ctx2); if (!id) return false
    return (entitySystem.get('character', id) as any)?.h_state?.time_stop_release === true
  })
  reg('TARGET_TIME_STOP_ORGASM_RELEASE', (ctx2: any) => {
    const tId = getTargetId(ctx2); if (!tId) return false
    return (entitySystem.get('character', tId) as any)?.h_state?.time_stop_release === true
  })
  reg('SELF_ORGASM_EDGE_RELAESE_OR_TIME_STOP_ORGASM_RELAESE', (ctx2: any) => {
    const id = getSelfId(ctx2); if (!id) return false
    const ch = entitySystem.get('character', id) as any
    return (ch?.h_state?.orgasm_edge === 2) || (ch?.h_state?.time_stop_release === true)
  })

  // 注释：H 中绝顶时，若时停中则累积不处理
  ctx.events.on('h:orgasm', (payload: any) => {
    if (!timeStopActive || !payload?.character) return
    const ch = entitySystem.get('character', payload.character) as any
    if (!ch?.h_state) return
    if (!ch.h_state.time_stop_orgasm_count) ch.h_state.time_stop_orgasm_count = {}
    const partId = payload.partId ?? 0
    ch.h_state.time_stop_orgasm_count[partId] = (ch.h_state.time_stop_orgasm_count[partId] ?? 0) + 1
  })

  // 注释：每次 H 行动后，若时停中，给时姦经验（对齐 erArk common_default.py:938-941）
  ctx.events.on('game:execution_end', () => {
    if (!timeStopActive) return
    for (const ch of entitySystem.getAll('character')) {
      const c = ch as any
      if (!c.h_state?.is_h || !c.sp_flag?.unconscious_h) continue
      if (!c.experience) c.experience = {}
      // 注释：时姦经验 ID 124（erArk），被时姦经验 ID 125
      c.experience['time_stop_rape'] = (c.experience['time_stop_rape'] ?? 0) + 1
      // 注释：给玩家被时姦经验（简化——所有 H 角色都算）
      if (c.id !== 'player') {
        const p = entitySystem.get('character', 'player') as any
        if (p) { if (!p.experience) p.experience = {}; p.experience['time_stop_raped'] = (p.experience['time_stop_raped'] ?? 0) + 1 }
      }
    }
  })

  // 注释：每次行动前记录时间成本
  ctx.events.on('game:execution_start', (payload: any) => {
    const cmd = commandRegistry.getById(payload?.commandId)
    lastActionTimeCost = (cmd as any)?.timeCost ?? 10
  })

  // 注释：每次行动后——扣玩家 TSP + 时间冻结 + 隐藏经验涨上限
  // TSP 成本公式（erArk realtime_settle.py:412）：
  //   cost = min(max(true_add_time × 2, 1), currentTSP)
  //   true_add_time = 本次行动的 timeCost（分钟）
  ctx.events.on('game:execution_end', () => {
    if (!timeStopActive) return
    const playerId = entitySystem.getAll('character').find((c: any) => c.id === 'player' || c.id === '0')?.id
    if (!playerId) { timeStopActive = false; frozenTime = null; return }
    const player = entitySystem.get('character', playerId) as any
    if (player?.base) {
      const cur = player.base['TSP'] ?? 0
      const cost = Math.min(Math.max(lastActionTimeCost * 2, 1), cur)
      // 注释：隐藏经验 —— 每扣 1 TSP = 1 XP
      if (!player.experience) player.experience = {}
      player.experience['time_stop_xp'] = (player.experience['time_stop_xp'] ?? 0) + cost
      // 注释：线性换算 TSP 上限 = 200 + floor(XP / 5)
      const newMax = 200 + Math.floor((player.experience['time_stop_xp'] ?? 0) / 5)
      if (newMax > (player.base['tsp_max'] ?? 0)) {
        player.base['tsp_max'] = newMax
        // 注释：升级时补满 TSP
        player.base['TSP'] = newMax
      }
    }
    if (frozenTime) gameContext.setTime(frozenTime)
  })

  // 注释：每日恢复 TSP（上限按隐藏经验增长）
  ctx.events.on('game:new_day', () => {
    for (const ch of entitySystem.getAll('character')) {
      const c = ch as any
      if (c.base) {
        const xp = c.experience?.time_stop_xp ?? 0
        c.base['tsp_max'] = 200 + Math.floor(xp / 5)
        c.base['TSP'] = c.base['tsp_max']
      }
    }
  })

  ctx.api.register('h-time-stop', {
    isActive: () => timeStopActive,
    getTSP: (charId: string) => { const ch = entitySystem.get('character', charId) as any; return ch?.base?.['TSP'] ?? 0 },
    getTSPMax: (charId: string) => {
      const ch = entitySystem.get('character', charId) as any
      return ch?.base?.['tsp_max'] ?? 200
    },
    getOrgasmCount: (charId: string, partId?: number) => {
      const ch = entitySystem.get('character', charId) as any
      const oc = ch?.h_state?.time_stop_orgasm_count ?? {}
      return partId != null ? oc[partId] ?? 0 : oc
    },
    getXP: (charId: string) => {
      const ch = entitySystem.get('character', charId) as any
      return ch?.experience?.time_stop_xp ?? 0
    },
  })
}
