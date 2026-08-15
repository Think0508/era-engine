// 无意识H 分支（②④③）——复刻 erArk handle_npc_ai_in_h.py + realtime_settle.py:436-464
// ② settle_sleep_h：睡奸实时结算（玩家对睡眠中目标 H 的窗口结算——熟睡值双倍扣除 + 吵醒判定）
// ④ judge_weak_up_in_sleep_h：醒来判定（weak_rate 公式 + randint）
// ③ recover_from_unconscious_h：恢复流程（5 分钟窗口/二段结算/继续H判定/装睡或结束）
//    + handle_npc_instruct_condition（继续H判定）+ settle_unconscious_semen_and_cloth（无意识二段结算）
// 依赖 sleep-system 的字段契约（sp_flag.sleeping/熟睡值/sleep_h_awake/pretend_sleep）——
// 实体字段直读 + core modLoader.sleepConfig（睡眠等级阈值），不跨插件 import（架构铁律）

import { entitySystem } from '../../core/entity-system'
import { gameContext } from '../../core/game-context'
import { eventBus } from '../../core/event-bus'
import { narrativeLog } from '../../core/narrative-log'
import { apiSystem } from '../../core/api'
import { errorReporter } from '../../core/error-reporter'
import { behaviorHistory } from '../../core/command-executor'
import { getEntityAttr, setEntityAttr, ATTR } from '../../core/entity-utils'
import { modLoader } from '../../core/mod-loader'
import { getPlayerId, isInH } from './state'

// ── 睡眠等级（阈值来自 modLoader.sleepConfig（sleep.toml，mod 可覆盖），缺省 erArk Sleep_Level.csv）──
function sleepLevels(): { name: string; sleep_point: number }[] {
  const levels = modLoader.getMod()?.sleepConfig?.sleep_levels
  if (levels && levels.length > 0) return levels
  return [
    { name: '半梦半醒', sleep_point: 30 },
    { name: '浅睡', sleep_point: 60 },
    { name: '熟睡', sleep_point: 80 },
    { name: '完全深眠', sleep_point: 100 },
  ]
}

function sleepPointOf(c: any): number {
  const v = getEntityAttr(c, ATTR.SLEEP)
  return typeof v === 'number' ? v : 0
}

function sleepLevelOf(c: any): number {
  const sp = sleepPointOf(c)
  const list = sleepLevels()
  for (let i = 0; i < list.length; i++) {
    if (sp <= list[i].sleep_point) return i
  }
  return list.length - 1
}

function sleepLevelThreshold(idx: number): number {
  const list = sleepLevels()
  if (idx < list.length) return list[idx].sleep_point
  return list[list.length - 1].sleep_point
}

function isSleepingChar(c: any): boolean {
  return !!c?.sp_flag?.sleeping
}

// 玩家当前 H 目标（erArk target_character_id；本引擎存 h_state.target_character_id）
function getHPartner(char: any): any | null {
  const id = char?.h_state?.target_character_id
  if (!id) return null
  return entitySystem.get('character', id) as any ?? null
}

// 醒来：清 sleeping + unnormal bit5(0x10)/bit6(0x20)（erArk settle_chara_unnormal_flag 5/6）
function clearSleepFlags(c: any): void {
  if (!c) return
  if (c.sp_flag) {
    c.sp_flag.sleeping = false
    c.sp_flag.unnormal_flag = (c.sp_flag.unnormal_flag ?? 0) & ~0x30
  }
  c.sleeping = false
  // 行为块立即过期（erArk :188 end_now=2 终止对方行动）——npc-ai 下个 pass 完成结算 + 重新决策
  if (c.ai_behavior) c.ai_behavior.duration = 0
  eventBus.emit('character:changed', { id: c.id })
}

// 装睡继续：睡醒但装睡（erArk :238-243 pretend_sleep + unconscious_h=1 + unnormal 5,6）
// 注意：装睡 ≠ 仍在睡眠行为——erArk 恢复后对方行为改为 WAIT（:228-229），settle_sleep_h
// 只对 SLEEP 行为结算 → 装睡后不再触发吵醒判定（否则熟睡值清零后 90% 概率无限醒→恢复循环）
// B3 联动修复：handleNpcInstructCondition 复位了 h_state.is_h（erArk :285-288），
// 继续 H 须重设（erArk :233 target.sp_flag.is_h = True）——否则装睡目标退出 H 参与方，
// 窗口结算/睡奸继续语义破坏
export function setPretendSleep(c: any): void {
  if (!c) return
  if (!c.sp_flag) c.sp_flag = {}
  if (!c.h_state) c.h_state = {}
  c.h_state.is_h = true
  c.h_state.pretend_sleep = true
  c.sp_flag.unconscious_h = 1
  c.sp_flag.sleeping = false
  c.sp_flag.unnormal_flag = (c.sp_flag.unnormal_flag ?? 0) | 0x30
  c.sleeping = false
  eventBus.emit('character:changed', { id: c.id })
}

// ② 睡奸实时结算（erArk realtime_settle.py:436-464 settle_sleep_h）——
// 玩家在 H 中且目标睡眠 + unconscious_h==1：WAIT 指令/安眠药中 → sleep_level=2 规避吵醒判定；
// 否则熟睡值 -= t×3（:458-459——睡眠中 +1.5/min 的双倍扣除）→ 等级 ≤1 → 吵醒判定
// 挂点：per-tick 玩家分支（game:time_advanced，与 erArk character_aotu_change_value 同源）
// async（I3 修复）：吵醒恢复流程（recover）含时间推进——必须 await，不能 fire-and-forget
export async function settleSleepH(minutes: number): Promise<void> {
  const playerId = getPlayerId()
  if (!playerId) return
  const player = entitySystem.get('character', playerId) as any
  if (!player || !isInH(player)) return
  const target = getHPartner(player)
  if (!target || !isSleepingChar(target)) return
  if ((target.sp_flag?.unconscious_h ?? 0) !== 1) return

  // WAIT 指令或安眠药中 → 赋 2 规避吵醒判定（:449-454）
  const lastCmdId = behaviorHistory[behaviorHistory.length - 1]
  const isWait = lastCmdId === 'wait'
  // TODO(h-npc-ai)：安眠药 body_item[9] 未实装（道具系统落地后按 sp_flag.sleep_pill_effect 接入）
  const sleepPills = target.sp_flag?.sleep_pill_effect === true

  let sleepLevel: number
  if (isWait || sleepPills) {
    sleepLevel = 2
  } else {
    // M3 修复：熟睡值不钳下界（erArk :459 无下钳——负熟睡值时 weak_rate >60 必醒）
    const downSleep = Math.floor(minutes * 3)
    setEntityAttr(target, ATTR.SLEEP, sleepPointOf(target) - downSleep)
    sleepLevel = sleepLevelOf(target)
  }
  if (sleepLevel <= 1) {
    await judgeWeakUpInSleepH(playerId)
  }
}

// ④ 醒来判定（erArk handle_npc_ai_in_h.py:327-349 judge_weak_up_in_sleep_h）
// weak_rate = LV1阈值(60) - 熟睡值 + max(LV0阈值(30) - 熟睡值, 0)（阈值取 sleep.toml）
// weak_rate ≥ randint(1,100) → 醒：疲劳=0、熟睡值=0、unnormal bit5 清 → recover 流程
export async function judgeWeakUpInSleepH(actorId: string): Promise<boolean> {
  const actor = entitySystem.get('character', actorId) as any
  const target = getHPartner(actor)
  if (!target) return false
  const sp = sleepPointOf(target)
  const lv1 = sleepLevelThreshold(1)
  const lv0 = sleepLevelThreshold(0)
  let weakRate = lv1 - sp
  if (sp <= lv0) weakRate += lv0 - sp
  if (weakRate < 1 + Math.floor(Math.random() * 100)) return false

  // 清空疲劳和睡眠程度（:343-344）+ unnormal bit5 清（:345）
  // 注意：sleeping 标记不清——erArk 此处目标行为仍为 SLEEP，recover_from_unconscious_h
  // 内 handle_action_sleep(target) 判定需要它（M2 修复：sleep_h_awake 仅在睡眠中被吵醒时设）
  setEntityAttr(target, ATTR.FATIGUE, 0)
  setEntityAttr(target, ATTR.SLEEP, 0)
  if (target.sp_flag) {
    target.sp_flag.unnormal_flag = (target.sp_flag.unnormal_flag ?? 0) & ~0x10
  }
  const infoText = `因为${actor?.name ?? '你的'}的动作，${target?.name ?? target?.id}从梦中惊醒过来`
  await recoverFromUnconsciousH(actorId, infoText)
  return true
}

// ③ 从无意识H中恢复（erArk handle_npc_ai_in_h.py:155-256 recover_from_unconscious_h）
export async function recoverFromUnconsciousH(actorId: string, infoText?: string): Promise<void> {
  const actor = entitySystem.get('character', actorId) as any
  const target = getHPartner(actor)
  if (!target) return
  // 如果角色不在无意识H状态，则直接返回（:168）
  if ((target.sp_flag?.unconscious_h ?? 0) === 0) return
  // B2 修复（第三轮）：只处理睡眠无意识(===1)——醉酒(2)/催眠(4-7)的目标走各自系统流程
  // （recover 会把催眠等级覆写为 1，静默错乱）；时停(===3)由 h-time-stop 管理（M19）
  if ((target.sp_flag?.unconscious_h ?? 0) !== 1) return

  narrativeLog.write(
    infoText ?? `${target?.name ?? target?.id}从无意识状态中恢复过来`,
    'system', 'h-npc-ai',
  )

  // M2 修复：erArk :190-191 仅在目标睡眠中时设 sleep_h_awake（醉酒/时停等无意识醒来不打标记）
  const wasSleeping = isSleepingChar(target)
  // 终止对方的行动（:188）——清睡眠标记 + 行为块过期（npc-ai 下个 pass 重新决策）
  clearSleepFlags(target)
  // 睡眠中，则对方获得睡奸醒来状态（:190-191）
  if (wasSleeping && target.sp_flag) {
    target.sp_flag.sleep_h_awake = true
    target.sleep_h_awake = true
  }
  // 玩家的行动时间设为 5 分钟（:195）+ 时间推进 5 分钟（:256 update.game_update_flow(5)）
  // 二段结算（:198 settle_unconscious_semen_and_cloth）
  settleUnconsciousSemenAndCloth(target)
  // 群交处理（:201-222）——TODO(h-npc-ai)：群交中恢复（清模板/关群交模式）随群交大改
  // 继续H判定（:225 handle_npc_instruct_condition）
  const continueH = handleNpcInstructCondition(actorId)

  if (continueH) {
    // 对方的行为时间改为 10 分钟（:237——行为块由 npc-ai 冻结期外管理，此处只标记）
    // 睡眠中，则对方获得装睡状态，仍继续无意识H（:238-243）
    setPretendSleep(target)
  } else {
    // 结束（:249-253）：双方 H 状态重置（endHScene——h-core API）+ 地点开门（关门机制未实装）
    await endHScene(actorId)
  }

  // 时间推进 5 分钟（:256）
  // M17 注释：若本函数在 game:time_advanced 处理器内被调（正常路径），嵌套 emit 的
  // time_advanced 会被 eventBus 重入守卫丢弃（设计内已知代价）——hour_changed/new_day
  // 事件名不同照发；5 分钟窗口的 npc-ai settle-pass 跳过（熟睡值已为 0，无实害）
  await gameContext.advanceTime(5)
}

// 继续H判定（erArk handle_npc_instruct_condition :258-325）——
// 监禁 → 继续；高级性骚扰实行判定 → 陷落≥3 继续 / >0 轻度性骚扰 / <0 愤怒+100 / =0 高级性骚扰；
// 不满足 → DO_H_FAIL。陷落系统（get_character_fall_level）未实装：
// 本引擎简化——睡眠目标恒继续（装睡），退出由玩家主动结束无意识奸（unconscious_h_end 6005 指令）
// TODO(h-npc-ai)：陷落等级/实行判定接入后按 erArk 三分支（LOW_OBSCENITY_ANUS/HIGH_OBSCENITY_ANUS/DO_H_FAIL）
export function handleNpcInstructCondition(actorId: string): boolean {
  const actor = entitySystem.get('character', actorId) as any
  const target = getHPartner(actor)
  if (!target) return false
  // 停止对方的无意识状态与 H 状态（:285-288）——判定前复位
  // B3 修复：本引擎 is_h 在 h_state（erArk 在 sp_flag——字段位置不同，sp_flag.is_h 是死字段）
  if (target.sp_flag) {
    target.sp_flag.unconscious_h = 0
  }
  if (target.h_state) {
    target.h_state.is_h = false
  }
  clearSleepFlags(target)
  // 注释：监禁修正（erArk handle_npc_ai_in_h.py:308——交互对象被监禁 → 直接满足继续H条件；
  // confinement-system 的 sp_flag.imprisonment 直查，不依赖插件注册）
  // TODO(h-npc-ai)：陷落判定（get_character_fall_level 未实装）——恒继续
  if (target.sp_flag?.imprisonment) return true
  return true
}

// 无意识期间的部位精液与服装偷窃二段结算（erArk :352-387 settle_unconscious_semen_and_cloth）
// 二段行为（second_behavior）机制未实装：数据去重后清零，不假装结算
// TODO(h-npc-ai)：in_unconscious_cum_on_body_*/cloth_*/stolen_panty/socks 二段行为随 second-behavior 落地
function settleUnconsciousSemenAndCloth(c: any): void {
  if (!c?.dirty) return
  if (Array.isArray(c.dirty.body_semen_in_unconscious)) {
    c.dirty.body_semen_in_unconscious = [...new Set(c.dirty.body_semen_in_unconscious)]
  }
  if (Array.isArray(c.dirty.cloth_semen_in_unconscious)) {
    c.dirty.cloth_semen_in_unconscious = [...new Set(c.dirty.cloth_semen_in_unconscious)]
  }
  c.dirty.body_semen_in_unconscious = []
  c.dirty.cloth_semen_in_unconscious = []
  if (c.cloth) {
    c.cloth.stolen_panties_in_unconscious = false
    c.cloth.stolen_socks_in_unconscious = false
  }
}

// 结束 H（h-core endHScene 经 API 通道——h-npc-ai 既有模式）
// Find 6 修复（第五轮）：失败时上报 + 诚实 fallback 文本（原 catch 无条件写"H 结束了"——
// 调用失败也写，叙事误导）
async function endHScene(playerId: string): Promise<void> {
  try {
    await apiSystem.call('h-core', 'endHScene', playerId)
  } catch (err) {
    errorReporter.report({
      source: 'h-npc-ai',
      severity: 'warning',
      message: `结束 H 失败：${err instanceof Error ? err.message : String(err)}`,
    })
    narrativeLog.write('H 中断了。', 'dialogue', 'h-npc-ai')
  }
}
