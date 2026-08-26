// 睡眠系统前提注册（erArk handle_premise 语义 + replicating-skill 规则：无 T_ 前缀查自己，有查目标）
// 睡眠时间窗口语义（Q2 grill 定案）：当前时间 ≥ plan_to_sleep_time（默认 18:00）或
// < plan_to_wake_time（默认 6:00）即"到点该睡了"——TIRED_GE_75_OR_SLEEP_TIME_OR_HP_1 的 SLEEP_TIME 部分

import { entitySystem } from '../../../core/entity-system'
import { gameContext } from '../../../core/game-context'
import { modLoader } from '../../../core/mod-loader'
import { getEntityAttr, ATTR } from '../../../core/entity-utils'
import { isSleeping, getSleepLevel } from '../sleep-state'

function self(_ctx: any): any {
  const playerId = gameContext.getContext().player?.id
  if (!playerId) return null
  return entitySystem.get('character', playerId) as any ?? null
}

function target(_ctx: any): any {
  const charId = _ctx.selectedCharacterId ?? _ctx.uiStore?.selectedCharacterId ?? null
  if (!charId) return null
  return entitySystem.get('character', charId) as any ?? null
}

// 注释：premise 求值上下文（command-eval 注入）——本文件只用 ctx 取选中角色；self 无 ctx 依赖

function getFatigue(char: any): number {
  const v = char ? getEntityAttr(char, ATTR.FATIGUE) : 0
  return typeof v === 'number' ? v : 0
}

// 疲劳阈值：erArk tired 前提按 160 满值百分比——TIRED_LE_84=≤134.4（既有 TIRED_LE_84 实现同源）、
// TIRED_GE_75 = ≥ 75%×160 = 120
const TIRED_GE_75_THRESHOLD = 120

// 睡眠时间窗口（Q2 定案）：≥ plan_to_sleep_time 或 < plan_to_wake_time（跨零点）
export function isSleepTimeWindow(): boolean {
  const cfg = modLoader.getMod()?.sleepConfig
  const [wH, wM] = cfg?.plan_to_wake_time ?? [6, 0]
  const [sH, sM] = cfg?.plan_to_sleep_time ?? [18, 0]
  const t = gameContext.getContext().time
  const total = t.hour * 60 + t.minute
  const wake = wH * 60 + wM
  const sleepStart = sH * 60 + sM
  return total >= sleepStart || total < wake
}

export function registerSleepPremises(registry: any): void {
  // ── 位置（erArk IN_DORMITORY_OR_HOTEL → location tag has_bedroom，location-tags.md:18/82）──
  registry.registerPremise('IN_DORMITORY_OR_HOTEL', (_ctx: any) => {
    const tags = gameContext.getContext().location?.tags ?? []
    return tags.includes('has_bedroom')
  })

  // ── 睡眠时间窗口（erArk GAME_TIME_IS_SLEEP_TIME / SLEEP_TIME / NOT_SLEEP_TIME）──
  registry.registerPremise('GAME_TIME_IS_SLEEP_TIME', () => isSleepTimeWindow())
  registry.registerPremise('SLEEP_TIME', () => isSleepTimeWindow())
  registry.registerPremise('NOT_SLEEP_TIME', () => !isSleepTimeWindow())

  // ── 困倦（自己）──
  registry.registerPremise('TIRED_GE_75', (_ctx: any) => getFatigue(self(_ctx)) >= TIRED_GE_75_THRESHOLD)
  registry.registerPremise('TARGET_TIRED_GE_75', (ctx: any) => getFatigue(target(ctx)) >= TIRED_GE_75_THRESHOLD)

  // 睡觉指令主前提（erArk 1014）：疲劳 ≥75% 或 到睡眠时间 或 体力 ≤1
  registry.registerPremise('TIRED_GE_75_OR_SLEEP_TIME_OR_HP_1', (ctx: any) => {
    const ch = self(ctx)
    if (!ch) return false
    if (getFatigue(ch) >= TIRED_GE_75_THRESHOLD) return true
    if (isSleepTimeWindow()) return true
    const hp = getEntityAttr(ch, ATTR.HP)
    return typeof hp === 'number' && hp <= 1
  })

  // ── 行为状态（查目标）──
  // T_ACTION_SLEEP——目标正在睡眠（erArk handle_action_sleep：行为是 SLEEP）
  registry.registerPremise('T_ACTION_SLEEP', (ctx: any) => isSleeping(target(ctx)))
  registry.registerPremise('T_ACTION_NOT_SLEEP', (ctx: any) => !isSleeping(target(ctx)))

  // ── 意识状态 NORMAL 族（erArk handle_normal_N：异常位未设置 = 正常）──
  // T_NORMAL_1：目标非"基础生理需求"行为中（休息/睡觉/解手/吃饭/沐浴/挤奶/自慰——erArk :919-927）
  // 本引擎简化：非睡眠中 且 行为类型非 rest/sleep 且 非自慰中；
  // TODO(sleep-system)：解手/吃饭/沐浴/挤奶标记（sp_flag.peeing/clean 等）字段盘点后补
  registry.registerPremise('T_NORMAL_1', (ctx: any) => {
    const ch = target(ctx)
    if (!ch) return false
    if (isSleeping(ch)) return false
    const type = ch.ai_behavior?.type
    if (type === 'sleep' || type === 'rest') return false
    if ((ch.sp_flag?.masturebate ?? 0) > 0) return false
    return true
  })
  // T_NORMAL_2：目标非临盆/产后/监禁（监禁系统未实装 → 恒正常，TODO(sleep-system)：监禁落地后补）
  registry.registerPremise('T_NORMAL_2', () => true)
  // T_NORMAL_6：目标非深度无意识（睡眠浅睡+ / 时停 / 空气催眠——erArk :1047-1049）
  // M5 修复：补 unconscious_flag_1 分支（自然醒但 unconscious_h=1 残留 + 熟睡值≥31 → 深度无意识）
  registry.registerPremise('T_NORMAL_6', (ctx: any) => {
    const ch = target(ctx)
    if (!ch) return false
    if (getSleepLevel(ch) >= 1 && (isSleeping(ch) || (ch.sp_flag?.unconscious_h ?? 0) === 1)) return false
    if ((ch.sp_flag?.unconscious_h ?? 0) === 3) return false // 时停
    if ((ch.sp_flag?.unconscious_h ?? 0) === 5) return false // 空气催眠（未实装，防御）
    return true
  })

  // T_NORMAL_5_6：目标 unnormal bit5、bit6 均为正常（erArk _check_normal_combo）
  // T_NORMAL_5_6_OR_UNCONSCIOUS_FLAG_4_7：56正常 或 平然/心控（unconscious_h=4/7）
  // D 组命令系指令引用（make_masturebate / make_lick_anal）
  registry.registerPremise('T_NORMAL_5_6', (ctx: any) => {
    const ch = target(ctx)
    if (!ch) return false
    const un = ch.sp_flag?.unnormal_flag ?? 0
    return (un & 0x30) === 0
  })
  registry.registerPremise('T_NORMAL_5_6_OR_UNCONSCIOUS_FLAG_4_7', (ctx: any) => {
    const ch = target(ctx)
    if (!ch) return false
    const un = ch.sp_flag?.unnormal_flag ?? 0
    const unconscious = ch.sp_flag?.unconscious_h ?? 0
    return (un & 0x30) === 0 || unconscious === 4 || unconscious === 7
  })


  // ── 无意识 flag 补全（h-core 已注册 T_UNCONSCIOUS_FLAG + _1.._6；此处补 _0 和 _7）──
  registry.registerPremise('T_UNCONSCIOUS_FLAG_0', (ctx: any) => {
    const ch = target(ctx)
    return (ch?.sp_flag?.unconscious_h ?? 0) === 0
  })
  registry.registerPremise('T_UNCONSCIOUS_FLAG_7', (ctx: any) => {
    const ch = target(ctx)
    return ch?.sp_flag?.unconscious_h === 7
  })

  // ── 场景全员无意识/睡眠（erArk handle_premise_place.py:502-557）──
  // 玩家所在地点：有玩家以外的角色，且所有角色都无意识或睡眠
  registry.registerPremise('SCENE_ALL_UNCONSCIOUS_OR_SLEEP', (_ctx: any) => {
    const loc = gameContext.getContext().location
    if (!loc) return false
    const playerId = gameContext.getContext().player?.id
    let others = 0
    for (const char of entitySystem.getAll('character')) {
      const c = char as any
      if (!c?.id || c.id === playerId) continue
      if (c.current_location !== loc.id && c.current_location !== undefined) continue
      if (c.current_location === undefined) continue
      others++
      if (!isUnconsciousOrSleep(c)) return false
    }
    return others > 0
  })
  // 该地点除了自己和交互对象以外的角色都无意识/睡眠（M6 修复：空集为真——erArk 语义
  // "除自己/对象外全部"是真空真；与 SCENE_ALL_UNCONSCIOUS_OR_SLEEP 的 others>0 语义不同）
  registry.registerPremise('SCENE_ALL_OTHERS_UNCONSCIOUS_OR_SLEEP', (ctx: any) => {
    const loc = gameContext.getContext().location
    if (!loc) return false
    const playerId = gameContext.getContext().player?.id
    const targetId = ctx.selectedCharacterId ?? ctx.uiStore?.selectedCharacterId ?? null
    for (const char of entitySystem.getAll('character')) {
      const c = char as any
      if (!c?.id || c.id === playerId || c.id === targetId) continue
      if (c.current_location !== loc.id) continue
      if (!isUnconsciousOrSleep(c)) return false
    }
    return true
  })

  // ── 睡奸醒来/装睡（睡奸系指令前提 + talk-common 地文 7700+ 条引用）──
  // ★1 修复（第六/七轮）：地文数据只引用 target_ 前缀（target_sleep_h_awake_but_pretend_sleep，
  // 3870+ 条），本插件原注册 T_ 前缀零消费 → 全部挂在 h-core 恒 false placeholder 上静默死亡；
  // 真语义同时注册 TARGET_ 前缀（覆盖 placeholder，h-core 的 placeholder 已从 pendingFalse 移除
  // ——onEnable 注册会覆盖 onLoad 真语义）+ 保留 T_ 前缀（防御未来数据）。
  // ⚠️ 半成品标记（2026-08-11 第八轮确认）：前提语义注册已通（talk-common-data.test.ts 全量
  // 校验 + sleep-system.test.ts 真语义断言绿灯），但**端到端不可达**——装睡/醒来地文的触发 =
  // orgasm 地文消费链，而 h-core 绝顶结算（orgasmJudge）只发 h:orgasm 事件、尚未调用
  // talk-common getBehaviorText 渲染地文（对话系统只接 trigger_dialogue 场景口上）。
  // 属 B3-B6 SEX 指令批次 + orgasm 地文渲染接线范畴，非本前提注册缺陷——届时无需改此处
  registry.registerPremise('SLEEP_H_AWAKE', (ctx: any) => !!self(ctx)?.sp_flag?.sleep_h_awake)
  registry.registerPremise('NOT_SLEEP_H_AWAKE', (ctx: any) => !self(ctx)?.sp_flag?.sleep_h_awake)
  registry.registerPremise('T_SLEEP_H_AWAKE', (ctx: any) => !!target(ctx)?.sp_flag?.sleep_h_awake)
  registry.registerPremise('T_NOT_SLEEP_H_AWAKE', (ctx: any) => !target(ctx)?.sp_flag?.sleep_h_awake)
  const tPretendSleep = (ctx: any) => {
    const ch = target(ctx)
    return !!ch?.sp_flag?.sleep_h_awake && !!ch?.h_state?.pretend_sleep
  }
  const tNotPretendSleep = (ctx: any) => {
    const ch = target(ctx)
    return !(ch?.sp_flag?.sleep_h_awake && ch?.h_state?.pretend_sleep)
  }
  registry.registerPremise('T_SLEEP_H_AWAKE_BUT_PRETEND_SLEEP', tPretendSleep)
  registry.registerPremise('T_NOT_SLEEP_H_AWAKE_BUT_PRETEND_SLEEP', tNotPretendSleep)
  // TARGET_ 前缀（地文数据实际引用——覆盖 h-core 的恒 false placeholder）
  registry.registerPremise('TARGET_SLEEP_H_AWAKE_BUT_PRETEND_SLEEP', tPretendSleep)
  registry.registerPremise('TARGET_NOT_SLEEP_H_AWAKE_BUT_PRETEND_SLEEP', tNotPretendSleep)

  // ── 安眠药（HAVE_SLEEPING_PILLS 由 h-core premise-instruct 注册真语义：查自己背包数组；
  //    其余睡眠药标记暂无消费方，保留 TODO）──
  registry.registerPremise('NOT_SLEEP_PILLS', () => true)
  registry.registerPremise('T_SLEEP_PILLS', () => false) // TODO(sleep-system)：同上
  registry.registerPremise('T_NOT_SLEEP_PILLS', () => true)
  registry.registerPremise('SELF_SLEEP_PILLS', () => false) // TODO(sleep-system)：同上
  registry.registerPremise('T_SELF_SLEEP_PILLS', () => false) // TODO(sleep-system)：同上
}

function isUnconsciousOrSleep(c: any): boolean {
  if (isSleeping(c)) return true
  return (c.sp_flag?.unconscious_h ?? 0) >= 1
}
