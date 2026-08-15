// 注释：h-time-stop 插件——时停系统，完全对齐 erArk
// 全局时停模式 + 精力消耗（consume_sanity 通道，按行动时长扣费）+ 归零自动中断 + 时停总时长统计
// 所有功能直接开放，无等级门槛

import { conditionEngine } from '../../core/condition-engine'
import type { PluginContext, GameContext } from '../../core/types'
import { effectTypeRegistry } from '../../core/effect-type-registry'
import { entitySystem } from '../../core/entity-system'
import { gameContext } from '../../core/game-context'
import { narrativeLog } from '../../core/narrative-log'
import { apiSystem } from '../../core/api'
import { errorReporter } from '../../core/error-reporter'
import { registerGameStateProvider } from '../../core/save-system'
import { bindingResolver } from '../../core/binding-resolver'
import { getEntityAttr, ATTR } from '../../core/entity-utils'

let timeStopActive = false
let timeStopDuration = 0  // 注释：时停总时长（分钟，erArk achievement.time_stop_duration）
let frozenTime: { minute: number; hour: number; day: number; month: number; year: number } | null = null
// 注释：自动时停移动开关（Task 3）——开：未时停的普通移动自动执行 时停on→瞬移→时停off 循环（完全静默）
let autoTimeStopMove = false
// 注释：sanity 绑定懒校验标记（2026-08-15 审计 C-I-1）——首次开时停时检查并提示一次；
// 放使用点而非 onEnable：插件全局加载，不用时停的 mod（如 example-mod）不该收到加载期噪音
let sanityBindWarned = false

// 注释：时停前无意识快照（★3 修复（第六轮））——time_stop_on 全图覆写 unconscious_h=3，
// 原 time_stop_off 全清 0 会把睡奸标记(1)/催眠(4-7)静默抹掉（催眠需重新催眠、睡奸标记丢失
// 且 settleSleepH 因 !==1 永久早退）——off 时恢复时停前的值。
// ⚠️ 2026-08-14 审查：原为 onLoad 闭包局部变量——时停中存档（非 H 时停可行）读档后
// off 无快照 → 角色永久冻结。提升模块级 + 随存档 provider 序列化。
let prevUnconscious = new Map<string, number>()

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

// 注释：时停精力读取（TSP → 精力统一，2026-08-15）——走 bindings
// （bindings.toml [bindings.h-time-stop].sanity → mod 实际属性，如 精力）
function getStamina(charId: string): number | null {
  const v = bindingResolver.getForPlugin('h-time-stop', charId, 'sanity')
  return typeof v === 'number' ? v : null
}

// 注释：时停精力成本公式（erArk realtime_settle.py:412-415）：
// cost = min(max(true_add_time × 2, 1), currentStamina)
function calcTimeStopCost(timeCost: number, cur: number): number {
  return Math.min(Math.max(timeCost * 2, 1), cur)
}

export function onLoad(_ctx: PluginContext): void {
  // 注释：时停前提（erArk TIME_STOP_ON/OFF——读模块级状态，睡眠等指令的 TIME_STOP_OFF 前提依赖）
  conditionEngine.registerPremise('TIME_STOP_ON', () => timeStopActive)
  conditionEngine.registerPremise('TIME_STOP_OFF', () => !timeStopActive)

  // 注释：时停精力前提（erArk SANITY_POINT_G_0——玩家精力 > 0，时停内行动可行性判定）
  conditionEngine.registerPremise('SANITY_POINT_G_0', (ctx: GameContext) => {
    const playerId = ctx.player?.id ?? gameContext.getContext().player?.id
    if (!playerId) return false
    return (getStamina(playerId) ?? 0) > 0
  })

  // 注释：时停解放前提（2026-08-13 审计补真语义——h-config talk.situations 情境加权引用）
  // ⚠️ 注册覆盖链（2026-08-15 审计修正注释）：本处 onLoad 先注册真语义 → h-core onEnable
  // 的恒 false 占位（premise-instruct.ts）后注册覆盖 → onEnable 末尾 reg() 再次覆盖回真语义。
  // 最终正确依赖 onEnable 的 reg()——若 reg 失败（premiseRegWarned 只报一次 warning），
  // 时停解放口上（地文 180 条引用）会静默全灭。
  // self_ = 行为发起者（sourceId）；target_ = 选中/被判定者
  const releaseOf = (charId: string | null | undefined): boolean => {
    const ch = charId ? entitySystem.get('character', charId) as any : null
    return !!ch?.h_state?.time_stop_release
  }
  conditionEngine.registerPremise('self_time_stop_orgasm_relase', (ctx: GameContext) => {
    return releaseOf(ctx.sourceId ?? ctx.player?.id)
  })
  conditionEngine.registerPremise('target_time_stop_orgasm_relase', (ctx: GameContext) => {
    return releaseOf(ctx.selectedCharacterId)
  })

  // 注释：时停前无意识快照（★3 修复（第六轮））——time_stop_on 全图覆写 unconscious_h=3，
  // 原 time_stop_off 全清 0 会把睡奸标记(1)/催眠(4-7)静默抹掉（催眠需重新催眠、睡奸标记丢失
  // 且 settleSleepH 因 !==1 永久早退）——off 时恢复时停前的值
  // 2026-08-14 审查：快照本体已提升为模块级（随存档 provider 序列化，防时停中存档读档后永久冻结）
  // 注释：time_stop_on——开启时停（对齐 erArk 效果 1241）
  effectTypeRegistry.register('time_stop_on', (params: any, _execCtx: any) => {
    if (timeStopActive) return true
    // 注释：sanity 绑定懒校验（2026-08-15 审计 C-I-1）——首次使用时检查；绑漏时
    // SANITY_POINT_G_0 恒 false（指令不可用）+ 行动误报"精力值不足自动解除"，此处
    // 一次性指明修复路径。放使用点：插件全局加载，不用时停的 mod 零加载期噪音。
    if (!sanityBindWarned) {
      const playerId = gameContext.getContext().player?.id
      if (!playerId) return true  // 注释：无玩家环境（测试/前奏）不置位不报——等真实游戏环境再查
      sanityBindWarned = true
      if (getStamina(playerId) === null) {
        errorReporter.report({
          source: 'h-time-stop',
          severity: 'warning',
          message: '时停无法读取精力：mod 未绑定 sanity（读取键 [bindings.h-time-stop].sanity；扣费键 [bindings.sleep-system].sanity，两键都需配置）——时停指令将不可用',
          suggestion: 'bindings.toml 追加：\n[bindings.h-time-stop]\nsanity = "精力"\n[bindings.sleep-system]\nsanity = "精力"',
        })
      }
    }
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
    if (!params?.quiet) narrativeLog.write('时间停止了！', 'system', 'h-time-stop')
    return true
  })

  // 注释：time_stop_off——关闭时停（对齐 erArk 1242 + 527）
  // erArk 链：1244(清搬运) → 1246(清自由) → 536 → 1242(关时停) → 527(释放绝顶)
  effectTypeRegistry.register('time_stop_off', async (params: any, _execCtx: any) => {
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
      // 注释：时停解放标记全场置位（最终审查 I-2——erArk default.py:6678
      // TIME_STOP_ORGASM_RELEASE 对全场无条件 time_stop_release=True；
      // 原实现只有带累积的角色经 release_time_stop_orgasm 置位）
      if (c.h_state) c.h_state.time_stop_release = true
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
          // 注释：只静默"未注册"（插件缺失降级）；其余错误如实上报（2026-08-15 审计收紧——
          // 原按消息含 'release_time_stop_orgasm' 过滤会把 handler 内部异常一并吞掉）
          if (!msg.includes('未注册')) {
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
    if (!params?.quiet) narrativeLog.write('时间重新流动', 'system', 'h-time-stop')
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

  // ⚠️ 半成品标记（2026-08-15 审计 C-I-2）：free 目标"在时停中自由活动"的 AI 豁免未实现——
  // npc-ai 跳过集对 unconscious_h>=1 一律跳过（无 freeTargetId 豁免），被"自由"的角色仍被冻结。
  // 本效果 + 8 个自由前提已注册（mod 可用前提做口上/条件），但目标的实际自由行动待 npc-ai
  // 豁免机制（skip-registry 无反向豁免）落地。无默认指令暴露本效果（erArk 原指令已砍，未实装）。
  effectTypeRegistry.register('time_stop_free', async (_p: any, execCtx: any) => {
    const ids = execCtx._targetIds as string[]
    if (ids.length > 0) {
      const src = entitySystem.get('character', execCtx.sourceId) as any
      if (src) {
        if (!src.time_stop_data) src.time_stop_data = {}
        src.time_stop_data.freeTargetId = ids[0]
        // 注释：自由活动解锁扣 50 精力（erArk 固定 50 理智）——TSP 删除后走 consume_sanity
        // 通道（sleep-system 注册：clamp 到当前值 + 累计 today_sanity_point_cost；跨插件禁直接 import）
        await apiSystem.call('effect-system', 'execute', [
          { type: 'consume_sanity', target: 'self', params: { amount: 50 } },
        ], { sourceId: execCtx.sourceId, _targetIds: [execCtx.sourceId] })
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

  // 注释：时停中 H 绝顶的累积由 h-core settleOrgasm 门控承担（orgasm.ts:395-400——
  // unconscious_h===3 → time_stop_orgasm_count[part] += climaxCount 且不结算不推事件）。
  // ⚠️ 2026-08-15 审计删除原 h:orgasm 监听器（累积 +1）：它只在"非冻结角色绝顶"时触发
  // （门控角色不发 h:orgasm），会把正常结算的绝顶再累计一次 → 解除时双结算。
  // 唯一合法累积入口 = settleOrgasm 门控；release 由 time_stop_off 调 release_time_stop_orgasm。

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

  // 注释：每次行动后——扣玩家精力 + 时间冻结 + 时长统计（erArk realtime_settle.py:412-434）
  // 精力成本公式：cost = min(max(true_add_time × 2, 1), currentStamina)
  // true_add_time = 本次行动的 timeCost（分钟，execution_end payload 直读——
  // 不再走 execution_start 记录 lastActionTimeCost，避免拦截/嵌套执行的误报耗时）
  // 归零自动中断（:417-434）：扣后精力 ≤ 0 → 自动执行 TIME_STOP_OFF 全链
  ctx.events.on('game:execution_end', async (payload: any) => {
    if (!timeStopActive) return
    // 注释：audit-i 修复——统一用 gameContext 解析玩家（id 非 'player' 时也正确）
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
    const timeCost = Number(payload?.timeCost ?? 0)
    if (timeCost > 0) {
      // 注释：时停总时长统计（erArk character_behavior.py:59-62 achievement.time_stop_duration += pl_duration）
      timeStopDuration += timeCost
      const cost = calcTimeStopCost(timeCost, getStamina(playerId) ?? 0)
      if (cost > 0) {
        try {
          // 注释：经 effect 通道走 consume_sanity（sleep-system 注册：clamp + 累计
          // today_sanity_point_cost；跨插件禁止直接 import sleep-system 源码）
          await apiSystem.call('effect-system', 'execute', [
            { type: 'consume_sanity', target: 'self', params: { amount: cost } },
          ], { sourceId: playerId, _targetIds: [playerId] })
        } catch (err) {
          errorReporter.report({
            source: 'h-time-stop',
            severity: 'error',
            message: `时停精力扣费失败：${err instanceof Error ? err.message : String(err)}`,
          })
        }
      }
      // 注释：归零自动中断（erArk realtime_settle.py:417-434）——扣后精力 ≤ 0 →
      // 自动执行 TIME_STOP_OFF 全链（quiet 避免重复叙事——此处已输出解除原因）
      if ((getStamina(playerId) ?? 0) <= 0) {
        narrativeLog.write('精力值不足，时停自动解除', 'system', 'h-time-stop')
        await apiSystem.call('effect-system', 'execute', [
          { type: 'time_stop_off', params: { quiet: true } },
        ], { sourceId: playerId, _targetIds: [playerId] })
      }
    }
    if (frozenTime) gameContext.setTime(frozenTime)
  })

  // 注释：时停开启/关闭（静默版）——自动时停移动的开关循环用（quiet 避免重复叙事）
  const quietTimeStop = async (on: boolean, sourceId: string): Promise<void> => {
    await apiSystem.call('effect-system', 'execute', [
      { type: on ? 'time_stop_on' : 'time_stop_off', params: { quiet: true } },
    ], { sourceId, _targetIds: [sourceId] })
  }

  ctx.api.register('h-time-stop', {
    isActive: () => timeStopActive,
    // 注释：TSP → 精力统一（2026-08-15）：getTSP/getTSPMax/getXP 删除，精力走 bindings
    getStamina: (charId: string) => getStamina(charId) ?? 0,
    getStaminaMax: (charId: string) => {
      const ch = entitySystem.get('character', charId) as any
      if (!ch) return 100
      const max = getEntityAttr(ch, ATTR.STAMINA_MAX)
      return typeof max === 'number' && max > 0 ? max : 100
    },
    getDuration: () => timeStopDuration,
    getOrgasmCount: (charId: string, partId?: number) => {
      const ch = entitySystem.get('character', charId) as any
      const oc = ch?.h_state?.time_stop_orgasm_count ?? {}
      return partId != null ? oc[partId] ?? 0 : oc
    },
    // 注释：自动时停移动开关（未时停时的便利功能）
    getAutoMove: () => autoTimeStopMove,
    setAutoMove: (on: boolean) => { autoTimeStopMove = !!on },
    // 注释：移动启动（Task 3）——时停中 = 瞬移（不推进时间）+ 精力扣费；未时停但开关开
    // 且前置满足（精力>0 + TIRED_LE_84 + NOT_H）→ 自动 on→瞬移→off 完整循环（完全静默）；
    // 其余 → normal（map-system 走普通移动路径）
    moveStart: async (timeCost: number) => {
      const playerId = gameContext.getContext().player?.id ?? null
      if (!playerId) return null
      const timeCostNum = Number(timeCost ?? 0)
      if (timeStopActive) {
        // 注释：时停时长统计对齐 erArk 口径（character_behavior.py:60 每次玩家行动含移动）
        timeStopDuration += timeCostNum
        const cost = calcTimeStopCost(timeCostNum, getStamina(playerId) ?? 0)
        if (cost > 0) {
          await apiSystem.call('effect-system', 'execute', [
            { type: 'consume_sanity', target: 'self', params: { amount: cost } },
          ], { sourceId: playerId, _targetIds: [playerId] })
        }
        // 注释：归零自动解除（与 execution_end 监听器同语义）
        if ((getStamina(playerId) ?? 0) <= 0) {
          narrativeLog.write('精力值不足，时停自动解除', 'system', 'h-time-stop')
          await quietTimeStop(false, playerId)
        }
        return { mode: 'teleport', cost }
      }
      if (autoTimeStopMove) {
        const ctx = gameContext.getContext() as any
        const sanityOk = (getStamina(playerId) ?? 0) > 0
        const tiredOk = conditionEngine.getPremiseValue('TIRED_LE_84', ctx)
        const notH = conditionEngine.getPremiseValue('NOT_H', ctx)
        if (sanityOk && tiredOk && notH) {
          await quietTimeStop(true, playerId)
          timeStopDuration += timeCostNum
          const cost = calcTimeStopCost(timeCostNum, getStamina(playerId) ?? 0)
          if (cost > 0) {
            await apiSystem.call('effect-system', 'execute', [
              { type: 'consume_sanity', target: 'self', params: { amount: cost } },
            ], { sourceId: playerId, _targetIds: [playerId] })
          }
          await quietTimeStop(false, playerId)
          return { mode: 'teleport', cost }
        }
      }
      return { mode: 'normal', cost: 0 }
    },
  })

  // 注释：搬运跟随（Task 3，erArk handle_npc_ai_in_h.py:74-80 语义）——时停中玩家行动后
  // 搬运目标同步位置（玩家瞬移/移动 → 被搬运者跟随到同地点）
  ctx.events.on('location:enter', (payload: any) => {
    const to = payload?.to, from = payload?.from
    if (!to || to === from) return
    if (!timeStopActive) return
    const playerId = gameContext.getContext().player?.id
    if (!playerId) return
    const player = entitySystem.get('character', playerId) as any
    const carryId = player?.time_stop_data?.carryTargetId
    if (!carryId) return
    const carried = entitySystem.get('character', carryId) as any
    if (carried) carried.current_location = to
  })

  // 注释：存档 provider（2026-08-14 存档复刻）——时停开关/冻结时刻/无意识快照随存档，
  // 否则读档后"实体全冻结但 timeStopActive=false"的半坏状态（时停中存不了档，
  // 防御深度：实体标记已随存档，开关必须配对恢复）
  registerGameStateProvider({
    id: 'h-time-stop',
    serialize: () => ({
      timeStopActive,
      frozenTime: frozenTime ? { ...frozenTime } : null,
      prevUnconscious: Object.fromEntries(prevUnconscious),
      timeStopDuration,
    }),
    restore: (data) => {
      timeStopActive = !!data?.timeStopActive
      frozenTime = data?.frozenTime ? { ...data.frozenTime } : null
      prevUnconscious = new Map(Object.entries(data?.prevUnconscious ?? {}))
      timeStopDuration = Number(data?.timeStopDuration ?? 0)
    },
  })

  // 注释：读档后一致性校验（防御深度）——存档没有时停开关记录（旧存档/异常路径）
  // 但实体带冻结标记（unconscious_h=3）→ 解冻降级（清 0）+ warning，不静默
  ctx.events.on('game:load', () => {
    if (timeStopActive) return
    let frozenCount = 0
    for (const ch of entitySystem.getAll('character')) {
      const c = ch as any
      if (c?.sp_flag?.unconscious_h === 3) {
        c.sp_flag.unconscious_h = 0
        frozenCount++
      }
    }
    if (frozenCount > 0) {
      errorReporter.report({
        source: 'h-time-stop',
        severity: 'warning',
        message: `读档检测到 ${frozenCount} 个角色带时停冻结标记但无时停开关记录——已解冻（旧存档降级恢复）`,
        suggestion: '时停中创建的存档缺少开关快照；解冻避免角色永久冻结',
      })
    }
  })
}
