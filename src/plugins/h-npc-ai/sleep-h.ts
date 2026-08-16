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
import { conditionEngine } from '../../core/condition-engine'
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
// mode 参数化（2026-08-16 时停复刻）：
//   'sleep'（缺省）——睡眠无意识（unconscious_h==1），睡眠专属分支（sleep_h_awake/装睡）
//   'time_stop'——时停无意识（unconscious_h==3），由 h-time-stop 的 time_stop_off 链调用
//     （erArk 536 RECOVER_FROM_UNCONSCIOUS_ADD_ADJUST 在 1242 清标记之前执行——目标仍无意识；
//     恢复后目标清醒配合 H 或结束 H，不装睡）
export type RecoverUnconsciousMode = 'sleep' | 'time_stop'
export async function recoverFromUnconsciousH(actorId: string, infoText?: string, opts?: { mode?: RecoverUnconsciousMode }): Promise<void> {
  const mode = opts?.mode ?? 'sleep'
  const actor = entitySystem.get('character', actorId) as any
  const target = getHPartner(actor)
  if (!target) return
  // 如果角色不在无意识H状态，则直接返回（:168）
  if ((target.sp_flag?.unconscious_h ?? 0) === 0) return
  // B2 修复（第三轮）：只处理本模式对应的无意识等级——睡眠(1)走本流程；醉酒(2)/催眠(4-7)
  // 的目标走各自系统流程（recover 会把催眠等级覆写为 1，静默错乱）；时停(3)走 time_stop 模式
  const expectLevel = mode === 'time_stop' ? 3 : 1
  if ((target.sp_flag?.unconscious_h ?? 0) !== expectLevel) return

  narrativeLog.write(
    infoText ?? `${target?.name ?? target?.id}从无意识状态中恢复过来`,
    'system', 'h-npc-ai',
  )

  // M2 修复：erArk :190-191 仅在目标睡眠中时设 sleep_h_awake（醉酒/时停等无意识醒来不打标记）
  const wasSleeping = mode === 'sleep' && isSleepingChar(target)
  // 终止对方的行动（:188）——清睡眠标记 + 行为块过期（npc-ai 下个 pass 重新决策）
  clearSleepFlags(target)
  // 睡眠中，则对方获得睡奸醒来状态（:190-191）
  if (wasSleeping && target.sp_flag) {
    target.sp_flag.sleep_h_awake = true
    target.sleep_h_awake = true
  }
  // 玩家的行动时间设为 5 分钟（:195）+ 时间推进 5 分钟（:256 update.game_update_flow(5)）
  // 二段结算（:198 settle_unconscious_semen_and_cloth）
  await settleUnconsciousSemenAndCloth(target)
  // 群交处理（:201-222）——TODO(h-npc-ai)：群交中恢复（清模板/关群交模式）随群交大改
  // 继续H判定（:225 handle_npc_instruct_condition）
  const continueH = await handleNpcInstructCondition(actorId, mode)

  if (continueH) {
    // 对方的行为时间改为 10 分钟（:237——行为块由 npc-ai 冻结期外管理，此处只标记）
    // 睡眠中，则对方获得装睡状态，仍继续无意识H（:238-243）
    if (mode === 'sleep') {
      setPretendSleep(target)
    } else {
      // 时停模式：目标清醒配合 H（erArk :250 handle_h_flag_to_1——is_h=True，不装睡；
      // unconscious_h 已被 handleNpcInstructCondition 复位 0）
      if (!target.h_state) target.h_state = {}
      target.h_state.is_h = true
      eventBus.emit('character:changed', { id: target.id })
    }
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
// 1. 监禁 → 继续；
// 2. handle_instruct_judge_high_obscenity（严重骚扰实行判定，InstructJudge.csv cid=22：
//    S 类 需求值 600）→ 判定失败 → DO_H_FAIL（不继续）；
// 3. 判定通过 → 按陷落等级三分支（get_character_fall_level，minus_flag=True）：
//    ≥3 继续 / >0 轻度性骚扰（不继续）/ <0 愤怒+100+angry_with_player（不继续）/
//    =0 高级性骚扰（不继续）。
// 注意（2026-08-16 复核）：erArk :301-305 先复位 unconscious_h=0 再判定（:312）——
// 时停/睡眠的 +9999 修正此时已不生效，判定为目标清醒状态下的正常实行判定。
// 引擎落点：判定经 h-core calcJudge API（严重骚扰 600 阈值）；陷落等级经 h-core
// getFallLevel API（跨插件禁止直接 import）。LOW/HIGH_OBSCENITY_ANUS/DO_H_FAIL 是
// erArk 行为状态机中间态（最终被 NO_CONSCIOUS_H_END 覆盖统一结束 H）——引擎无行为
// 状态机，落点收敛两分支（继续/不继续），中间态用叙事日志表达（grill Q6 定案）
export async function handleNpcInstructCondition(actorId: string, _mode?: RecoverUnconsciousMode): Promise<boolean> {
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
  // 注释：监禁修正（erArk handle_npc_ai_in_h.py:308——交互对象被监禁 → 直接满足继续H条件）。
  // 经条件引擎 T_IMPRISONMENT_1 前提求值（confinement-system 注册，2026-08-16 审查修正：
  // 原直查 sp_flag.imprisonment——语义条件应走前提注册表；插件未启用（前提未注册）→
  // 降级走正常判定，不报错）
  try {
    const impCtx = { ...gameContext.getContext(), selectedCharacterId: target.id } as any
    if (conditionEngine.getPremiseValue('T_IMPRISONMENT_1', impCtx)) return true
  } catch {
    // confinement 未启用 → T_IMPRISONMENT_1 未注册 → 走正常判定
  }

  // 严重骚扰实行判定（erArk handle_instruct_judge_high_obscenity：S 类 600）——
  // 经 h-core calcJudge API（公式同 instuct_judege.py：好感/信赖/状态/能力/刻印/心情/
  // 陷落/天赋个性/他人存在/判定族修正；judge_class='严重骚扰' 已在 S_TYPE_JUDGE_CLASSES）
  let judgeSuccess = true
  try {
    const fav = getEntityAttr(target, ATTR.FAVORABILITY) ?? 0
    const trust = getEntityAttr(target, ATTR.TRUST) ?? 0
    const result = await apiSystem.call('h-core', 'calcJudge', 600, Number(fav), Number(trust), target.id, '严重骚扰')
    judgeSuccess = !!result?.success
  } catch (err) {
    // h-core 未加载/API 缺失 → 降级：判定通过（不阻断恢复流程）+ 去重上报
    errorReporter.report({
      source: 'h-npc-ai',
      severity: 'warning',
      message: `严重骚扰实行判定调用失败，按通过处理：${err instanceof Error ? err.message : String(err)}`,
      suggestion: '检查 h-core 插件是否已加载（calcJudge API）',
    })
  }
  if (!judgeSuccess) {
    narrativeLog.write(`${target?.name ?? target?.id}醒来后激烈反抗，H 无法继续`, 'dialogue', 'h-npc-ai')
    return false
  }

  // 陷落三分支（erArk :314-329，get_character_fall_level minus_flag=True）
  let fallLevel = 0
  try {
    fallLevel = Number(await apiSystem.call('h-core', 'getFallLevel', target.id)) || 0
  } catch (err) {
    errorReporter.report({
      source: 'h-npc-ai',
      severity: 'warning',
      message: `陷落等级查询失败，按 0（高级性骚扰）处理：${err instanceof Error ? err.message : String(err)}`,
      suggestion: '检查 h-core 插件是否已加载（getFallLevel API）',
    })
  }
  if (fallLevel >= 3) return true
  if (fallLevel > 0) {
    // 轻度性骚扰（erArk LOW_OBSCENITY_ANUS——醒来后顺从，允许继续轻度接触，H 不延续）
    narrativeLog.write(`${target?.name ?? target?.id}微微发抖，却没有真正抗拒`, 'dialogue', 'h-npc-ai')
    return false
  }
  if (fallLevel < 0) {
    // 愤怒分支（erArk :323-325：angry_point += 100 + angry_with_player）——
    // 引擎"愤怒"属性 = base[ATTR.ANGER]（判定心情修正读它；angry_point 是 erArk 字段名，
    // 本引擎无此独立字段——2026-08-16 审查修复：原写 target.angry_point 为死字段，
    // 判定系统感知不到愤怒增长）
    const cur = getEntityAttr(target, ATTR.ANGER) ?? 0
    setEntityAttr(target, ATTR.ANGER, Number(cur) + 100)
    if (!target.sp_flag) target.sp_flag = {}
    target.sp_flag.angry_with_player = true
    narrativeLog.write(`${target?.name ?? target?.id}愤怒地推开你！`, 'dialogue', 'h-npc-ai')
    return false
  }
  // 陷落 0 = 高级性骚扰（erArk HIGH_OBSCENITY_ANUS——醒后抗拒但未至愤怒）
  narrativeLog.write(`${target?.name ?? target?.id}惊恐地抗拒着，H 无法继续`, 'dialogue', 'h-npc-ai')
  return false
}

// 无意识期间的部位精液与服装偷窃二段结算（erArk :352-387 settle_unconscious_semen_and_cloth）
// 二段行为机制（second_behavior）引擎未实装——erArk 的"触发二段行为"落点 = 逐部位触发
// talk-common 长文本口上（in_unconscious_cum_on_body_{引擎部位编号}，醒来发现精液的旁白，
// 数据在 talk-common-system 默认层，mod 可覆盖）：getText 条件选文 → {Name} 替换 → 叙事输出。
// TODO(h-npc-ai)：in_unconscious_cum_on_cloth_*/stolen_panty/socks（服装精液/失窃）依赖
// 服装精液槽与偷窃系统（未实装），保持字段清零不假装结算
async function settleUnconsciousSemenAndCloth(c: any): Promise<void> {
  if (c?.dirty && Array.isArray(c.dirty.body_semen_in_unconscious)) {
    for (const partId of [...new Set(c.dirty.body_semen_in_unconscious)]) {
      const text = await getUnconsciousSemenTalk(c, String(partId))
      if (text) narrativeLog.write(text, 'dialogue', 'h-npc-ai')
    }
    // 数据清零（erArk :404）
    c.dirty.body_semen_in_unconscious = []
  }
  if (c?.dirty && Array.isArray(c.dirty.cloth_semen_in_unconscious)) {
    c.dirty.cloth_semen_in_unconscious = []
  }
  if (c?.cloth) {
    c.cloth.stolen_panties_in_unconscious = false
    c.cloth.stolen_socks_in_unconscious = false
  }
}

// 无意识精液口上查询（talk-common 默认层数据；缺失/插件未加载 → null，数据内容缺省不报错）
let unconsciousTalkApiWarned = false
async function getUnconsciousSemenTalk(c: any, enginePartId: string): Promise<string | null> {
  const variable = `in_unconscious_cum_on_body_${enginePartId}`
  try {
    const text = await apiSystem.call('talk-common', 'getText', variable, c?.id ?? null)
    if (typeof text !== 'string' || text.length === 0) return null
    // 注释：先经 talk-common replace 做 {variable} 插值（mod 覆盖数据可用 talk-common 变量），
    // 再替换 {Name} 占位（talk-common index 无此变量，原样保留）
    const interpolated = await apiSystem.call('talk-common', 'replace', text, c?.id ?? null)
    const finalText = typeof interpolated === 'string' ? interpolated : text
    return finalText.replace(/\{Name\}/g, c?.name ?? c?.id ?? '她')
  } catch (err) {
    // talk-common 插件未加载（可选内容源）——去重上报一次，不阻断恢复流程
    if (!unconsciousTalkApiWarned) {
      unconsciousTalkApiWarned = true
      errorReporter.report({
        source: 'h-npc-ai',
        severity: 'warning',
        message: `无意识精液口上查询失败（talk-common 未加载？）：${err instanceof Error ? err.message : String(err)}`,
        suggestion: '启用 talk-common-system 插件以支持无意识醒来精液口上',
      })
    }
    return null
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
