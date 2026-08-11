// 注释：① 每时间片 H 状态判定（复刻 erArk handle_npc_ai_in_h.py:34-152）
// 挂点：game:time_advanced（grill Q5 定案——H 中时间推进的唯一来源）
// 判定内容：
//   玩家部分（erArk :48-81）：just_shoot 递减 / 口交后阴茎污浊重置 /
//     手口胸类清体位数据 / 子宫性交位置清零 / 体力≤1 退出（含群交）
//   NPC 部分：
//     - 不在玩家场景且 is_h → 结束 H（erArk :95-118 防御性检查）
//     - is_h 或木头人（blockhead）→ 锁死确认（行为块 h_wait；时停 NPC 跳过）
//     - 群交中 + AI type 1/2 → 群交 AI（erArk :129-135）
//     - 体力≤1 → 疲劳/HP 退出（普通 H / 群交三路分流）
// 注：绝顶判定/道具 tick 等二段结算由 h-core execution_end 负责（不在此重复）

import { entitySystem } from '../../core/entity-system'
import { apiSystem } from '../../core/api'
import { gameContext } from '../../core/game-context'
import { eventBus } from '../../core/event-bus'
import { narrativeLog } from '../../core/narrative-log'
import { errorReporter } from '../../core/error-reporter'
import { commandRegistry } from '../../core/command-registry'
import { behaviorHistory } from '../../core/command-executor'
import { settleTired, settleUrine, settleHunger, sleepPassSettle } from '../../core/realtime-settle'
import { getPlayerId, isInH, isTimeStopped, isBlockhead, exitHBlock, getStamina, nowMinutes } from './state'
import { runGroupSexAi } from './group-sex-ai'
import { settleSleepH } from './sleep-h'

// 注释：疲劳等级 ≥2 的疲劳度阈值（erArk get_tired_level：疲劳度/160，≤0.74→0，
// ≤0.84→1，<1→2，≥1→3 → level≥2 ⟺ 疲劳度 > 134.4）——handle_npc_ai.py:57
const TIRED_LEVEL_2_THRESHOLD = 134.4

// 注释：从群交模板移出 NPC（玩家模板 A/B 全清）——h-group-sex getTemplate 引用直改
async function removeFromTemplate(playerId: string, npcId: string): Promise<void> {
  try {
    if (!apiSystem.has('h-group-sex', 'getTemplate')) return
    const tmpl = await apiSystem.call('h-group-sex', 'getTemplate', playerId) as any
    if (!tmpl) return
    for (const t of [tmpl.A, tmpl.B]) {
      for (const name of ['mouth', 'L_hand', 'R_hand', 'penis', 'anal']) {
        const slot = t[name]
        if (slot?.targetId === npcId) {
          slot.targetId = null
          slot.behaviorId = null
        }
      }
      if (t.worship) {
        t.worship.targetIds = (t.worship.targetIds ?? []).filter((id: string) => id !== npcId)
      }
    }
  } catch (err) {
    // 注释：移出失败不可静默（NPC 会残留在模板——模板执行仍会对它结算）
    errorReporter.report({
      source: 'h-npc-ai',
      severity: 'warning',
      message: `NPC '${npcId}' 移出群交模板失败：${err instanceof Error ? err.message : String(err)}`,
      suggestion: '检查 h-group-sex 是否已加载（getTemplate API）',
    })
  }
}

// 注释：模板剩余参与 NPC 数
async function countTemplateMembers(playerId: string): Promise<number> {
  try {
    if (!apiSystem.has('h-group-sex', 'getTemplate')) return 0
    const tmpl = await apiSystem.call('h-group-sex', 'getTemplate', playerId) as any
    if (!tmpl) return 0
    let count = 0
    for (const t of [tmpl.A, tmpl.B]) {
      for (const name of ['mouth', 'L_hand', 'R_hand', 'penis', 'anal']) {
        if (t[name]?.targetId !== null) count++
      }
      count += t.worship?.targetIds?.length ?? 0
    }
    return count
  } catch (err) {
    errorReporter.report({
      source: 'h-npc-ai',
      severity: 'warning',
      message: `统计群交模板人数失败：${err instanceof Error ? err.message : String(err)}`,
    })
    return 0
  }
}

// 注释：群交模式状态（h-group-sex API）
async function isGroupSexMode(): Promise<boolean> {
  try {
    if (!apiSystem.has('h-group-sex', 'isActive')) return false
    return (await apiSystem.call('h-group-sex', 'isActive')) === true
  } catch (err) {
    errorReporter.report({
      source: 'h-npc-ai',
      severity: 'warning',
      message: `查询群交模式失败：${err instanceof Error ? err.message : String(err)}`,
    })
    return false
  }
}

// 注释：关闭群交模式（h-group-sex 效果——经 effect-system 通道）
// 导出：h:end 时统一关（玩家 end_h 结束 H 不经过群交分流——模式残留会污染下次 H）
// 幂等：已关则跳过（群交分流与 h:end 可能重复调用——避免重复"退出群交模式"叙事）
export async function groupSexModeOff(): Promise<void> {
  if (!(await isGroupSexMode())) return
  try {
    await apiSystem.call('effect-system', 'execute', [{ type: 'group_sex_mode_off', params: {} }], {
      sourceId: getPlayerId(), _targetIds: [], _timeCost: 0,
    })
  } catch (err) {
    errorReporter.report({
      source: 'h-npc-ai',
      severity: 'warning',
      message: `关闭群交模式失败：${err instanceof Error ? err.message : String(err)}`,
      suggestion: '检查 h-group-sex 是否已加载（group_sex_mode_off 效果）',
    })
  }
}

// 注释：结束整个 H（h-core endHScene 等价物——经 API 通道，grill Q9 确认复用）
// Find 6 修复（第五轮）：失败上报（原 catch 吞掉 + 写"结束 H"误导叙事）
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

// 注释：NPC 疲劳/HP 退出（erArk handle_npc_ai.py:38-134 judge_character_tired_sleep）
// 退出条件：体力≤1（tired 标记等价）**或** 疲劳等级 ≥2（疲劳度 >134.4，:57）
// 普通 H：→ 结束 H；群交：移出模板 → 剩余 1 转单人 / 剩余 0 结束
// 无意识 H 例外（erArk :96-102）：无意识目标只检测 HP，不检测疲劳（睡奸不被疲劳中断）
export async function checkNpcFatigueExit(npcId: string): Promise<void> {
  const playerId = getPlayerId()
  if (!playerId) return
  const npc = entitySystem.get('character', npcId) as any
  if (!npc || !isInH(npc)) return
  // 注释：时停 NPC 跳过（时停 = 时间停止，体力不因 H 行动变化——erArk 时停特判）
  if (isTimeStopped(npc)) return
  // 无意识 H（睡眠/醉酒/催眠/时停）→ 只查 HP（erArk :96-102：无意识不检测疲劳）
  const unconscious = (npc.sp_flag?.unconscious_h ?? 0) >= 1
  const tired = !unconscious && (npc.base?.['疲劳度'] ?? 0) > TIRED_LEVEL_2_THRESHOLD
  if (getStamina(npc) > 1 && !tired) return

  const inGroup = await isGroupSexMode()
  if (!inGroup) {
    // 注释：普通 H（erArk T_H_HP_0 → handle_h_end）——无意识分支后置（TODO，依赖睡眠系统）
    narrativeLog.write(`${npc.name ?? npcId} 体力不支，H 中断了。`, 'system', 'h-npc-ai')
    await endHScene(playerId)
    return
  }

  // 注释：群交退出（erArk group_sex_npc_hp_0_end——效果链含 403 清 H 状态）
  narrativeLog.write(`${npc.name ?? npcId} 体力不支，退出了群交。`, 'system', 'h-npc-ai')
  npc.h_state = undefined
  exitHBlock(npc)
  await removeFromTemplate(playerId, npcId)
  const remaining = await countTemplateMembers(playerId)
  if (remaining <= 0) {
    // 剩余 0 → 结束群交 + 结束 H（erArk handle_group_sex_end）
    await groupSexModeOff()
    await endHScene(playerId)
  } else if (remaining === 1) {
    // 剩余 1 → 转单人 H（erArk GROUP_SEX_TO_H——关群交模式，H 状态保留）
    await groupSexModeOff()
    narrativeLog.write('群交结束，转为单独 H。', 'system', 'h-npc-ai')
  }
}

// 注释：玩家疲劳/HP 退出（erArk handle_npc_ai.py:110-134）
// 普通 H：H_HP_0；群交：GROUP_SEX_PL_HP_0_END（连带关群交模式）
export async function checkPlayerFatigueExit(): Promise<void> {
  const playerId = getPlayerId()
  if (!playerId) return
  const player = entitySystem.get('character', playerId) as any
  if (!player || !isInH(player)) return
  if (getStamina(player) > 1) return

  narrativeLog.write('你体力不支，再也无法继续了。', 'system', 'h-npc-ai')
  if (await isGroupSexMode()) {
    await groupSexModeOff()
  }
  await endHScene(playerId)
}

// 注释：玩家部分 flag 归零（erArk judge_character_h_obscenity_unconscious :48-81）
//   - just_shoot 递减（:65-68：1→2（保留一回合）→0——射精后两回合内 still 可读）
//   - 口交后阴茎污浊重置（:53-55：前指令是口交类 → 清玩家阴茎污浊）
//   - 手/口/胸类指令清体位数据（:57-59：手交/口交/乳交时不保持性交体位）
//   - 子宫性交位置清零（:61-63：阴茎不在 V/W 时清——体位换了子宫奸数据失效）
// 判定"前指令类型"用 behaviorHistory + 指令 part tag（本引擎无 erArk last_cmd 字段，
// part:hand/mouth/breast 语义等价于 erArk 手/口/胸类行为 tag）
function settlePlayerHFlags(playerId: string): void {
  const player = entitySystem.get('character', playerId) as any
  const h = player?.h_state
  if (!h?.is_h) return

  // just_shoot 递减（erArk :65-68）
  if (h.just_shoot === 1) h.just_shoot = 2
  else h.just_shoot = 0

  // 前指令类型（手/口/胸类判断）
  const lastId = behaviorHistory[behaviorHistory.length - 1]
  const lastCmd = lastId ? commandRegistry.getById(lastId) : undefined
  const tags = lastCmd?.tags ?? []
  const isHand = tags.includes('part:hand')
  const isMouth = tags.includes('part:mouth')
  const isBreast = tags.includes('part:breast')

  // 手/口/胸类时清体位数据（erArk :57-59）
  if ((isHand || isMouth || isBreast) && h.current_sex_position !== -1) {
    h.current_sex_position = -1
  }
  // 口交后清阴茎污浊（erArk :53-55）
  if (isMouth && player?.dirty?.penis_dirty_dict) {
    for (const key of Object.keys(player.dirty.penis_dirty_dict)) {
      player.dirty.penis_dirty_dict[key] = false
    }
  }
  // 子宫性交位置清零（erArk :61-63：insert_position 0=V 3=W 保留，其余清）
  if (h.current_womb_sex_position > 0 && h.insert_position !== 0 && h.insert_position !== 3) {
    h.current_womb_sex_position = 0
  }
}

// 注释：① 每时间片判定主入口（game:time_advanced 监听）
// minutes：本次时间推进量（H 中 NPC 窗口结算用——erArk H 中 WAIT 行为照常
// character_aotu_change_value 积累疲劳/尿意/饥饿；本引擎跳过集冻结了 npc-ai 窗口结算，
// 此处补齐，否则 H 永不因疲劳终止）
export async function judgeCharacterHStateTick(minutes = 0): Promise<void> {
  const playerId = getPlayerId()
  if (!playerId) return

  await checkPlayerFatigueExit()
  settlePlayerHFlags(playerId)

  // 注释：玩家所在地点——gameContext 场景兜底（玩家实体 current_location 可能未写入；
  // erArk :95 用角色 position 比较，本引擎以场景为准）
  const playerChar = entitySystem.get('character', playerId) as any
  const playerLoc = playerChar?.current_location ?? gameContext.getContext().location?.id ?? null
  for (const char of entitySystem.getAll('character')) {
    const c = char as any
    if (!c?.id || c.id === playerId) continue

    // 注释：不在玩家场景且 is_h → 结束 H（erArk :95-118——防御性检查：
    // H 中玩家不可移动，正常不会触发；群交邀请未到场的 NPC 由 h-group-sex 流程管理）
    // 时停 NPC 跳过（时停搬运/时停奸中位置变化是时停机制本身，不结束 H）
    if (isInH(c) && !isTimeStopped(c) && playerLoc && c.current_location !== playerLoc) {
      narrativeLog.write(`${c.name ?? c.id} 离开了。`, 'system', 'h-npc-ai')
      c.h_state = undefined
      exitHBlock(c)
      await removeFromTemplate(playerId, c.id)
      // 注释：群交中 → 与疲劳退出同款分流（剩余 1 转单人 / 剩余 0 结束群交+结束 H）；
      // 1v1（玩家 target 是它）→ 整体结束 H（玩家 H 状态残留会卡死指令面板）
      const inGroup = await isGroupSexMode()
      if (inGroup) {
        const remaining = await countTemplateMembers(playerId)
        if (remaining <= 0) {
          await groupSexModeOff()
          await endHScene(playerId)
        } else if (remaining === 1) {
          await groupSexModeOff()
          narrativeLog.write('群交结束，转为单独 H。', 'system', 'h-npc-ai')
        }
      } else {
        await endHScene(playerId)
      }
      continue
    }

    // 注释：H 状态或木头人 → 行动锁死（erArk :120-152）
    // 本引擎锁死模型：h:start 时行为块已置 h_wait，跳过集（in_h）冻结不结算——
    // per-tick 不再改写 is_h 角色行为块（改写会破坏冻结语义/条件字段一致性）
    if (isInH(c) || isBlockhead(c)) {
      // 时停 NPC 跳过锁死判定（grill Q5 定案：时停 = 时间停止，行为块本就冻结）
      if (isTimeStopped(c)) continue
      // 睡奸例外（erArk :123-124）：睡眠中的 H 角色不参与锁死逻辑——
      // B5 注记（第三轮）：h:start 的 enterHBlocksForAllInH 实际已把参与方覆写为 h_wait
      // 块（运行时靠 sp_flag.sleeping 分支识别睡奸目标 + 下方显式 sleepPassSettle 补偿
      // erArk 的 SLEEP 行为结算——注释此前误述为"保持睡眠行为"，已修正）
      if (isInH(c) && (c.sp_flag?.sleeping === true)) {
        // I4 修复：睡奸目标窗口结算补齐（erArk 目标行为=SLEEP → character_aotu_change_value
        // 照常 settle_sleep：疲劳 2 倍削减 + 熟睡值积累 + 体力恢复——settle_sleep_h 扣 3t
        // 与积累 1.5t 相抵 = 净 -1.5t/分；跳过集冻结了 npc-ai 窗口，此处显式补）
        if (minutes > 0) {
          sleepPassSettle(c, minutes)
        }
        // M16 修复：睡眠目标仍查 HP 退出（erArk :96-102 无意识 H 只查 HP 不查疲劳——
        // 睡眠中目标不被行动扣体力，但体力 ≤1 必须能退出 H，防止死锁）
        if (getStamina(c) <= 1) {
          narrativeLog.write(`${c.name ?? c.id} 体力不支，睡奸结束了。`, 'system', 'h-npc-ai')
          await endHScene(playerId)
        }
        continue
      }
      // 群交中 + AI type 1/2 → 群交 AI（erArk :129-135；type 3 由模板执行事件触发）
      if (isInH(c) && await isGroupSexMode()) {
        await runGroupSexAi(c.id)
      }
      // 注释：H 中 NPC 窗口结算（erArk WAIT 行为 character_aotu_change_value：
      // 疲劳/尿意/饥饿照常积累 → 疲劳等级 ≥2 触发退出，H 不会无限持续）
      if (isInH(c) && minutes > 0) {
        settleTired(c, minutes, {})
        settleUrine(c, minutes)
        settleHunger(c, minutes)
      }
      // 注释：木头人锁死（erArk :121 木头人锁 WAIT，H 外同样锁）——用 60 分钟短块
      // + 每时间片刷新 start_time：解催眠后 ≤60 分钟自然过期，日常 AI 恢复决策
      // （长块会让解催眠后的 NPC 冻结数小时）
      if (isBlockhead(c) && !isInH(c)) {
        c.ai_behavior = { id: 'h_wait', type: 'h_wait', start_time: nowMinutes(), duration: 60 }
        c.state = 'h_wait'
        c.current_behavior = 'h_wait'
        eventBus.emit('character:changed', { id: c.id })
      }
    }

    // 注释：疲劳/HP 退出（每时间片检查——erArk judge_character_tired_sleep）
    await checkNpcFatigueExit(c.id)
  }

  // 注释：睡奸实时结算（② erArk realtime_settle.py:436-464 settle_sleep_h——
  // 玩家 H 中 + 目标睡眠 + unconscious_h==1 → 熟睡值扣除 + 吵醒判定；挂玩家分支）
  // await（I3 修复）：吵醒恢复流程含时间推进，不得 fire-and-forget
  if (minutes > 0 && isInH(playerChar)) {
    await settleSleepH(minutes)
  }
}
