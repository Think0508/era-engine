// 注释：sleep-system 插件——睡眠系统（L1.7 全链）
// 复刻 erArk：
//   - 睡觉指令（1014）：跨天跳转（advance_to_hour）+ 14 效果链 + settle_mode（settle_sleep 数值）
//   - updateSleepAll：update_sleep 对全员（玩家睡觉时）
//   - 睡眠状态管理：sp_flag.sleeping / unnormal_flag bit5,6 / 睡眠等级（Sleep_Level.csv）
//   - 睡醒自动存档（pl_sleep_save_flag → update_save）
//   - 睡奸/唤醒/无意识H AI 归属 h-npc-ai（settle_sleep_h / judge_weak_up_in_sleep_h /
//     recover_from_unconscious_h——按 erArk 文件映射：这些都在 handle_npc_ai_in_h.py/realtime_settle.py）
// 本插件只做睡眠本体 + 全员结算 + 状态/前提；H 侧经事件/API 协作（不跨插件 import）

import { conditionEngine } from '../../core/condition-engine'
import type { PluginContext } from '../../core/types'
import { entitySystem } from '../../core/entity-system'
import { eventBus } from '../../core/event-bus'
import { gameContext } from '../../core/game-context'
import { apiSystem } from '../../core/api'
import { effectTypeRegistry } from '../../core/effect-type-registry'
import { bindingResolver } from '../../core/binding-resolver'
import { errorReporter } from '../../core/error-reporter'
import { getEntityAttr, setEntityAttr, ATTR } from '../../core/entity-utils'
import { registerSleepPremises, isSleepTimeWindow } from './premise/sleep'
import { updateSleepAll } from './update-sleep'
import { setAsleep, clearAsleep, isSleeping, getSleepLevel, getSleepLevelInfo } from './sleep-state'

// 注释：onLoad——注册效果类型 + 前提
export function onLoad(_ctx: PluginContext): void {
  // 1504 ADD_SMALL_SANITY_POINT——理智恢复 15%/h（erArk default.py handle_add_small_sanity_point：
  // add = int(add_time/60 × 0.15 × sanity_point_max)，上限 max）
  // 本引擎：理智 = 精力属性，经绑定系统读取（mod 在 bindings.toml 绑定 sanity → 实际属性）；
  // 未绑定 → 跳过（可选绑定语义，warning 提示）。上限 = "精力上限"属性（缺省 100）
  effectTypeRegistry.register('add_small_sanity_point', (_params: any, execCtx: any) => {
    const ids = (execCtx._targetIds as string[]) ?? []
    const addTime = execCtx._timeCost ?? 0
    if (addTime <= 0) return true
    for (const id of ids) {
      const char = entitySystem.get('character', id) as any
      if (!char) continue
      const cur = bindingResolver.getForPlugin('sleep-system', id, 'sanity')
      if (cur === null || cur === undefined) {
        errorReporter.report({
          source: 'sleep-system',
          severity: 'warning',
          message: `add_small_sanity_point：角色 '${id}' 未绑定 sanity 属性（bindings.toml [bindings.sleep-system].sanity），跳过`,
          suggestion: 'mod 在 bindings.toml 中把 sanity 绑定到实际属性（如 精力）',
        })
        continue
      }
      // 2026-08-11：上限读"精力上限"属性（erArk sanity_point_max，缺省 100）——不再硬编码
      const max = getEntityAttr(char, ATTR.STAMINA_MAX)
      const staminaMax = typeof max === 'number' && max > 0 ? max : 100
      const add = Math.floor(addTime / 60 * 0.15 * staminaMax)
      // 注释：绑定写入走插件作用域（setForPlugin，M7 修复——set() 跨插件首键胜出会写错属性）
      bindingResolver.setForPlugin('sleep-system', id, 'sanity', Math.min(staminaMax, Number(cur) + add))
    }
    return true
  })

  // consume_sanity——精力消耗（erArk 源石技艺/催眠/体控指令的理智消耗，default.py 867-911 段：
  // 透视 1/催眠按公式/强制高潮 50 等；结算时扣当前值 + 累加今日消耗 today_sanity_point_cost，
  // 供睡眠精力成长（sanity_point_grow）使用）。未绑定 sanity → warning + 跳过。
  // 2026-08-11 完整复刻：h-hypnosis 原"精神"属性已删，催眠系指令消耗走本 effect
  effectTypeRegistry.register('consume_sanity', (params: any, execCtx: any) => {
    const ids = (execCtx._targetIds as string[]) ?? []
    const amount = Number(params?.amount ?? 0)
    if (amount <= 0) return true
    for (const id of ids) {
      const char = entitySystem.get('character', id) as any
      if (!char) continue
      const cur = bindingResolver.getForPlugin('sleep-system', id, 'sanity')
      if (cur === null || cur === undefined) {
        errorReporter.report({
          source: 'sleep-system',
          severity: 'warning',
          message: `consume_sanity：角色 '${id}' 未绑定 sanity 属性（bindings.toml [bindings.sleep-system].sanity），跳过`,
          suggestion: 'mod 在 bindings.toml 中把 sanity 绑定到实际属性（如 精力）',
        })
        continue
      }
      const down = Math.min(amount, Number(cur))
      bindingResolver.setForPlugin('sleep-system', id, 'sanity', Number(cur) - down)
      // 今日消耗累计（erArk pl_ability.today_sanity_point_cost）
      if (!char.action_info) char.action_info = {}
      char.action_info.today_sanity_point_cost = (char.action_info.today_sanity_point_cost ?? 0) + down
    }
    return true
  })

  // 1505 ADD_SMALL_SEMEN_POINT——精液恢复 15%/h，仅玩家（erArk default.py handle_add_small_semen_point：
  // character_id > 0 直接返回；add = int(add_time/60 × 0.15 × semen_point_max)，上限 max）
  effectTypeRegistry.register('add_small_semen_point', (_params: any, execCtx: any) => {
    const ids = (execCtx._targetIds as string[]) ?? []
    const addTime = execCtx._timeCost ?? 0
    if (addTime <= 0) return true
    const playerId = gameContext.getContext().player?.id
    for (const id of ids) {
      if (id !== playerId) continue
      const char = entitySystem.get('character', id) as any
      if (!char) continue
      const max = getEntityAttr(char, ATTR.SEMEN_MAX)
      const cur = getEntityAttr(char, ATTR.SEMEN)
      if (typeof max !== 'number' || typeof cur !== 'number' || max <= 0) continue
      const add = Math.floor(addTime / 60 * 0.15 * max)
      setEntityAttr(char, ATTR.SEMEN, Math.min(max, cur + add))
    }
    return true
  })

  // unconscious_h_set——设置目标无意识等级（睡奸=1；erArk sleep_obscenity → unconscious_h=1 +
  // unnormal flag bits 5,6；时停=3/催眠=4-7 由各自插件专属效果管理）
  effectTypeRegistry.register('unconscious_h_set', (params: any, execCtx: any) => {
    const ids = (execCtx._targetIds as string[]) ?? []
    const level = Number(params?.level ?? 1)
    if (!Number.isInteger(level) || level < 0 || level > 7) {
      errorReporter.report({
        source: 'sleep-system',
        severity: 'warning',
        message: `unconscious_h_set 收到非法等级 ${level}（合法 0-7），跳过`,
      })
      return false
    }
    for (const id of ids) {
      const char = entitySystem.get('character', id) as any
      if (!char) continue
      if (!char.sp_flag) char.sp_flag = {}
      char.sp_flag.unconscious_h = level
      if (level >= 1) {
        // 无意识 → 意识模糊(bit5) + 完全意识不清醒(bit6)（11-睡眠与无意识H.md §6）
        char.sp_flag.unnormal_flag = (char.sp_flag.unnormal_flag ?? 0) | 0x30
      } else {
        char.sp_flag.unnormal_flag = (char.sp_flag.unnormal_flag ?? 0) & ~0x30
      }
      eventBus.emit('character:changed', { id })
    }
    return true
  })

  // unconscious_h_clear——清除目标无意识等级 + unnormal bit5,6（stop_sleep_obscenity 等）
  // 同时清 sleeping 标记 + pretend_sleep（M18 修复：装睡状态结束清除，防永久残留——
  // C1 修复：睡奸结束的清除路径之一）
  // A1 修复（第三轮）：params.wake（默认 true）控制是否唤醒——6005 结束无意识奸要唤醒；
  // 5046 停止睡眠猥亵只清无意识奸标记，目标应**继续睡**（erArk 语义：行为=SLEEP 保留，
  // 清醒判定靠 sleeping 标记）→ wake=false 不清 sleeping，避免"醒着却带睡眠块"矛盾态
  // A 修复（第四轮）：bits 清/留与 B1 不变量同构——wake=false 且仍 sleeping → 保留 bit5|6
  effectTypeRegistry.register('unconscious_h_clear', (params: any, execCtx: any) => {
    const ids = (execCtx._targetIds as string[]) ?? []
    const wake = params?.wake !== false
    for (const id of ids) {
      const char = entitySystem.get('character', id) as any
      if (!char) continue
      if (!char.sp_flag) char.sp_flag = {}
      char.sp_flag.unconscious_h = 0
      char.sp_flag.unnormal_flag = (!wake && char.sp_flag.sleeping)
        ? ((char.sp_flag.unnormal_flag ?? 0) | 0x30)
        : ((char.sp_flag.unnormal_flag ?? 0) & ~0x30)
      if (wake) {
        char.sp_flag.sleeping = false
        char.sleeping = false
      }
      if (char.h_state) char.h_state.pretend_sleep = false
      eventBus.emit('character:changed', { id })
    }
    return true
  })

  // target_add_tired_to_sleep——安眠药（erArk 1007：目标疲劳=160、熟睡=100、
  // body_item[9] 8h、入睡状态 = sleeping + unnormal bit5,6）
  effectTypeRegistry.register('target_add_tired_to_sleep', (_p: any, execCtx: any) => {
    const ids = (execCtx._targetIds as string[]) ?? []
    const now = gameContext.getContext().time
    const expiry = now.hour * 60 + now.minute + 480
    for (const id of ids) {
      const char = entitySystem.get('character', id) as any
      if (!char) continue
      if (!char.base) char.base = {}
      char.base[ATTR.FATIGUE] = 160
      setEntityAttr(char, ATTR.SLEEP, 100)
      if (!char.body_items) char.body_items = {}
      char.body_items['9'] = { itemId: '安眠药', active: true, expiry }
      setAsleep(char)
      eventBus.emit('character:changed', { id })
    }
    return true
  })

  // ask_sleep——让对方去睡觉（erArk 1022 语义：目标睡眠请求 → 入睡）
  // 经 npc-ai setBehavior 设 sleep 行为块（处理器默认睡到 wake_hour 6:00），
  // setBehavior 会发 npc:behavior_started(type='sleep') → 本插件 listener 自动 setAsleep
  effectTypeRegistry.register('ask_sleep', async (_params: any, execCtx: any) => {
    const ids = (execCtx._targetIds as string[]) ?? []
    let ok = true
    for (const id of ids) {
      try {
        const result = await apiSystem.call('npc-ai', 'setBehavior', id, 'sleep') as boolean
        if (result !== true) ok = false
      } catch (err) {
        ok = false
        errorReporter.report({
          source: 'sleep-system',
          severity: 'warning',
          message: `ask_sleep：NPC '${id}' 入睡失败：${err instanceof Error ? err.message : String(err)}`,
          suggestion: '检查 npc-ai-system 是否已加载（setBehavior API）',
        })
      }
    }
    return ok
  })

  // ask_rest——让对方休息（erArk 1021 语义：目标 sp_flag.rest=True + WAIT 1 分钟；
  // 本引擎经 npc-ai setBehavior('rest') 设休息行为块，npc-ai restHandler 固定 120 分钟）
  effectTypeRegistry.register('ask_rest', async (_params: any, execCtx: any) => {
    const ids = (execCtx._targetIds as string[]) ?? []
    let ok = true
    for (const id of ids) {
      try {
        const result = await apiSystem.call('npc-ai', 'setBehavior', id, 'rest') as boolean
        if (result !== true) ok = false
      } catch (err) {
        ok = false
        errorReporter.report({
          source: 'sleep-system',
          severity: 'warning',
          message: `ask_rest：NPC '${id}' 休息失败：${err instanceof Error ? err.message : String(err)}`,
          suggestion: '检查 npc-ai-system 是否已加载（setBehavior API）',
        })
      }
    }
    return ok
  })

  registerSleepPremises(conditionEngine)
}

// 注释：onEnable——事件监听 + API
export async function onEnable(ctx: PluginContext): Promise<void> {
  // 注释：睡觉指令开始（game:execution_start）——玩家"正在睡眠"标记置位（I2 修复：
  // erArk 玩家行为=SLEEP 时 handle_action_sleep=True；321 效果已删，此处为唯一置位点）
  ctx.events.on('game:execution_start', (payload: any) => {
    if (payload?.commandId !== 'sleep') return
    const playerId = gameContext.getContext().player?.id
    if (!playerId) return
    const player = entitySystem.get('character', playerId) as any
    if (player) setAsleep(player)
  })

  // 注释：睡觉指令收尾（game:execution_end）
  // commandId === 'sleep'：睡眠结算对全员（updateSleepAll）+ 睡醒自动存档（erArk pl_sleep_save_flag）
  ctx.events.on('game:execution_end', async (payload: any) => {
    if (payload?.commandId !== 'sleep') return
    const minutes = typeof payload?.timeCost === 'number' ? payload.timeCost : 0
    try {
      await updateSleepAll(minutes)
      // 睡醒自动存档（erArk sleep_settle.update_save——UI 层 bridge 监听执行，插件无 uiState）
      eventBus.emit('game:autosave_requested', { label: '睡醒自动存档' })
    } catch (err) {
      errorReporter.report({
        source: 'sleep-system',
        severity: 'warning',
        message: `睡眠结算（updateSleepAll）失败：${err instanceof Error ? err.message : String(err)}`,
      })
    }
  })

  // 注释：NPC 睡眠行为开始/结束 → 睡眠状态标记（睡奸前提 T_ACTION_SLEEP 依赖）
  // npc-ai-system 每次决策都会发 npc:behavior_started——type==='sleep' 入睡，其他类型醒来
  // ★4 修复（第六轮）：醒来时顺带清睡眠猥亵标记（unconscious_h===1 + unnormal bits）——
  // 跳过集已放行"睡眠中的睡奸标记者"照常结算（否则 NPC 永不醒），自然醒后标记必须清除，
  // 否则醒来 NPC 又因 unconscious_h===1（非 sleeping）被跳过集冻结
  ctx.events.on('npc:behavior_started', (payload: any) => {
    const char = payload?.character ? entitySystem.get('character', payload.character) as any : null
    if (!char) return
    if (payload?.type === 'sleep') {
      setAsleep(char)
    } else if (isSleeping(char)) {
      clearAsleep(char)
      // 睡眠猥亵标记随醒来清除（睡奸可重新发起；h:end 兜底路径也清 ===1——此处覆盖自然醒）
      if (char.sp_flag?.unconscious_h === 1) {
        char.sp_flag.unconscious_h = 0
        char.sp_flag.unnormal_flag = (char.sp_flag.unnormal_flag ?? 0) & ~0x30
      }
      // ★ 修复（第七轮）：醒来顺带清 sleep_h_awake（装睡流结束后残留，非参与方场景
      // onHEnd 覆盖不到——自然醒是唯一清除点）
      if (char.sp_flag?.sleep_h_awake) {
        char.sp_flag.sleep_h_awake = false
        char.sleep_h_awake = false
      }
    }
    eventBus.emit('character:changed', { id: char.id })
  })

  // 注释：公共 API
  ctx.api.register('sleep-system', {
    // 是否正在睡眠（sp_flag.sleeping——睡奸/前提/叙事查询）
    isSleeping: (charId: string): boolean => {
      const char = entitySystem.get('character', charId) as any
      return isSleeping(char)
    },
    // 睡眠等级 0-3（由熟睡值推导，阈值来自 sleep.toml）
    getSleepLevel: (charId: string): number => {
      const char = entitySystem.get('character', charId) as any
      return getSleepLevel(char)
    },
    // 睡眠等级详情（level + 名称）
    getSleepLevelInfo: (sleepPoint: number): { level: number; name: string } => getSleepLevelInfo(sleepPoint),
    // 是否处于睡眠时间窗口（Q2 定案语义：≥ plan_to_sleep_time 或 < plan_to_wake_time）
    isSleepTimeWindow: (): boolean => isSleepTimeWindow(),
    // 入睡/醒来标记（h-npc-ai 睡奸流程、GM 指令用）
    setAsleep: (charId: string): void => {
      const char = entitySystem.get('character', charId) as any
      if (char) setAsleep(char)
    },
    clearAsleep: (charId: string): void => {
      const char = entitySystem.get('character', charId) as any
      if (char) clearAsleep(char)
    },
  })
}
