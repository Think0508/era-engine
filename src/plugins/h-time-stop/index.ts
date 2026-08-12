// 注释：h-time-stop 插件——时停系统，完全对齐 erArk
// 全局时停模式 + TSP 消耗（按行动时长）+ 隐藏经验线性增长 TSP 上限
// 所有功能直接开放，无等级门槛

import { conditionEngine } from '../../core/condition-engine'
import type { PluginContext } from '../../core/types'
import { effectTypeRegistry } from '../../core/effect-type-registry'
import { entitySystem } from '../../core/entity-system'
import { gameContext } from '../../core/game-context'
import { narrativeLog } from '../../core/narrative-log'
import { commandRegistry } from '../../core/command-registry'
import { apiSystem } from '../../core/api'
import { errorReporter } from '../../core/error-reporter'

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
  // 注释：时停前提（erArk TIME_STOP_ON/OFF——读模块级状态，睡眠等指令的 TIME_STOP_OFF 前提依赖）
  conditionEngine.registerPremise('TIME_STOP_ON', () => timeStopActive)
  conditionEngine.registerPremise('TIME_STOP_OFF', () => !timeStopActive)

  // 注释：时停前无意识快照（★3 修复（第六轮））——time_stop_on 全图覆写 unconscious_h=3，
  // 原 time_stop_off 全清 0 会把睡奸标记(1)/催眠(4-7)静默抹掉（催眠需重新催眠、睡奸标记丢失
  // 且 settleSleepH 因 !==1 永久早退）——off 时恢复时停前的值
  let prevUnconscious = new Map<string, number>()

  // 注释：time_stop_on——开启时停（对齐 erArk 效果 1241）
  effectTypeRegistry.register('time_stop_on', (_p: any, _execCtx: any) => {
    if (timeStopActive) return true
    timeStopActive = true
    frozenTime = { ...gameContext.getContext().time }
    prevUnconscious = new Map()
    for (const ch of entitySystem.getAll('character')) {
      const c = ch as any
      if (!c.sp_flag) c.sp_flag = {}
      prevUnconscious.set(c.id, c.sp_flag.unconscious_h ?? 0)
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
      // 注释：恢复时停前无意识值（★3 修复——原全清 0 抹掉睡奸/催眠标记）。
      // ★3 边缘修复（第七轮）：只恢复快照内角色——时停中 spawn 的新角色不在快照，
      // 不触碰其标记（原 `?? 0` 会把新角色带的无意识标记抹成 0）
      if (c.sp_flag && prevUnconscious.has(c.id)) {
        c.sp_flag.unconscious_h = prevUnconscious.get(c.id) ?? 0
      }
      // 注释：绝顶释放（对齐 527 / erArk TIME_STOP_ORGASM_RELEASE，default.py:6764-6800）
      // 2026-08-08 修复：原只输出日志无数值——时停累计的绝顶被静默丢弃。
      // 经 effect 通道调 h-core 的 release_time_stop_orgasm（跨插件禁止直接 import），
      // 把 time_stop_orgasm_count 转成真实高潮结算（数值+事件+日志）
      if (c.h_state?.time_stop_orgasm_count && Object.keys(c.h_state.time_stop_orgasm_count).length > 0) {
        try {
          await apiSystem.call('effect-system', 'execute', [{ type: 'release_time_stop_orgasm' }], {
            sourceId: c.id,
            _targetIds: [c.id],
          })
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          if (!msg.includes('release_time_stop_orgasm') && !msg.includes('未注册')) {
            errorReporter.report({
              source: 'h-time-stop',
              severity: 'error',
              message: `时停解放结算失败：${msg}`,
            })
          }
        }
      }
    }
    // 注释：死代码清理（第七轮）——frozenTime 在 :68 已置 null，此判断恒假；
    // 时停恢复时刻的回拨语义由 time_stop_off 的调用方（指令链）处理，此处不恢复
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
  let premiseRegWarned = false
  const reg = async (id: string, fn: (c: any) => boolean) => {
    try { await ctx.api.call('engine', 'premises.register', id, fn) } catch (err) {
      if (!premiseRegWarned) {
        premiseRegWarned = true
        errorReporter.report({
          source: 'h-time-stop',
          severity: 'warning',
          message: "前提注册失败（h-core 未就绪？）：" + (err instanceof Error ? err.message : String(err)),
          suggestion: 'h-core plugin may not be loaded (registerPremise API) - this plugin premises will be unavailable',
        })
      }
    }
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
  // ★ 修复（第七轮）：地文数据 180 条引用拼错版本 `target_time_stop_orgasm_relase`
  // （erArk 源码同拼错，handle_premise_sp_flag.py:2449）——真语义别名注册，
  // 否则时停解放口上全部静默死亡（h-core placeholder 注册的是错拼版，恒 false）
  reg('TARGET_TIME_STOP_ORGASM_RELASE', (ctx2: any) => {
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
  // B9 修复（audit-b I8）：原写自定义字符串键（time_stop_rape/time_stop_raped）——
  // 能力升级表按 erArk 数字 ID 读（erark-attr-ledger：时姦=124、被时姦=125），
  // 字符串键无消费方 → 经验永不能驱动升级。时停中玩家为施为方（得 124），
  // 被冻结的 H 角色为受害方（得 125，11-睡眠与无意识H.md §5.2）
  ctx.events.on('game:execution_end', () => {
    if (!timeStopActive) return
    const playerId = gameContext.getContext().player?.id
    const player = playerId ? entitySystem.get('character', playerId) as any : null
    if (player) {
      if (!player.experience) player.experience = {}
      player.experience['124'] = (player.experience['124'] ?? 0) + 1
    }
    for (const ch of entitySystem.getAll('character')) {
      const c = ch as any
      if (!c.h_state?.is_h || !c.sp_flag?.unconscious_h) continue
      if (!c.experience) c.experience = {}
      // 注释：被时姦经验 125（erArk 数字 ID）
      c.experience['125'] = (c.experience['125'] ?? 0) + 1
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
    // 注释：audit-i 修复——原硬编码 'player'/'0' 扫描（与 :272 的 gameContext 解析不一致，
    // 玩家 id 非 'player' 时找不到并**静默关停时停**）。统一用 gameContext 解析。
    const playerId = gameContext.getContext().player?.id ?? null
    if (!playerId) {
      timeStopActive = false; frozenTime = null
      errorReporter.report({
        source: 'h-time-stop',
        severity: 'warning',
        message: '时停中找不到玩家实体——时停已解除（正常流程不应发生）',
      })
      return
    }
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
