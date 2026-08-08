// 注释：h-hidden 插件——隐奸系统，完全对齐 erArk
// 4 级隐奸模式（0=否 1=双不隐 2=女隐 3=男隐 4=双隐）
// 发现度系统 + 羞耻/快感 tick + 绝顶暴露 + 经验 + NPC 隐匿 + 成就
//
// 参考 erArk 源文件：
//   hidden_sex_panel.py   — 发现度积累/衰减/概率判定、模式选择面板
//   realtime_settle.py:503-509  — 羞耻/心理快感 tick
//   Second_effect.py:3274-3343 — 绝顶暴露（411-414）
//   default.py:5191-5252       — 隐奸状态清零（471-473）
//   handle_npc_ai.py:800-815   — NPC 隐匿逻辑
//   settle_behavior.py:683-699 — 隐奸经验（35）
//   second_behavior.py:457-460 — 成就记录
//   handle_premise_sp_flag.py  — 全部 32+ 前提
//   constant_effect.py         — 效果 ID 常量
//   game_type.py               — 数据结构
//   Behavior_Effect.csv:380-382 — 指令效果链
//   InstructConfig.csv:200,214 — 指令配置
//   Hidden_Level.csv           — 4 级发现度阈值

import type { PluginContext } from '../../core/types'
import { effectTypeRegistry } from '../../core/effect-type-registry'
import { entitySystem } from '../../core/entity-system'
import { eventBus } from '../../core/event-bus'
import { gameContext } from '../../core/game-context'
import { narrativeLog } from '../../core/narrative-log'
import { commandRegistry } from '../../core/command-registry'
import { apiSystem } from '../../core/api'


// 注释：Hidden_Level.csv 的 4 级发现度阈值
const HIDDEN_LEVELS = [
  { cid: 0, name: '完全隐蔽', threshold: 30 },
  { cid: 1, name: '隐蔽', threshold: 60 },
  { cid: 2, name: '引人注意', threshold: 80 },
  { cid: 3, name: '随时暴露', threshold: 95 },
]

// 注释：4 级隐奸模式名称
const MODE_NAMES = ['无', '双不隐', '女隐', '男隐', '双隐']

let lastActionTimeCost = 10

function getSelfId(ctx: any): string | null {
  return ctx.gameStore?.player?.id ?? ctx.sourceId ?? null
}

function getTargetId(ctx: any): string | null {
  return ctx.selectedCharacterId ?? ctx.uiStore?.selectedCharacterId ?? null
}

// 注释：getAbilityAdjust — 能力等级修正表（与 h-bondage 共享一致逻辑）
// erArk get_ability_adjust: [1.0, 1.1, 1.25, 1.4, 1.6, 1.8, 2.1, 2.4, 2.8, 3.2, 4.0]
function getAbilityAdjust(lv: number): number {
  const tbl = [1.0, 1.1, 1.25, 1.4, 1.6, 1.8, 2.1, 2.4, 2.8, 3.2, 4.0]
  return tbl[Math.min(Math.max(0, lv), 10)] ?? 4.0
}

// 注释：获取指定角色的 hidden_sex_mode（0=无 1=双不隐 2=女隐 3=男隐 4=双隐）
function getMode(charId: string): number {
  const ch = entitySystem.get('character', charId) as any
  return ch?.sp_flag?.hidden_sex_mode ?? 0
}

// 注释：getLevelName — 根据数值返回发现度等级
// 对应 erArk hidden_sex_panel.py:56 get_hidden_level()
function getLevelName(value: number): { cid: number; name: string } {
  for (const lv of HIDDEN_LEVELS) {
    if (value <= lv.threshold) return { cid: lv.cid, name: lv.name }
  }
  return { cid: 3, name: '随时暴露' }
}

// 注释：getBehaviorTagIntensity — 从行为标签推导强度
// erArk hidden_sex_panel.py:172-181
// 道具=4, 插入=3, 侍奉=2, 基础=1（取 max）
function getBehaviorTagIntensity(tags: string[]): number {
  let intensity = 1
  for (const tag of tags) {
    if (tag === '道具') intensity = Math.max(4, intensity)
    else if (tag === '插入') intensity = Math.max(3, intensity)
    else if (tag === '侍奉') intensity = Math.max(2, intensity)
  }
  return intensity
}

// 注释：settleHiddenValue — 结算隐蔽值变化
// 对应 erArk hidden_sex_panel.py:134 settle_hidden_value_by_action()
// 完整公式（erArk 源码逐行复刻）：
//   增加时: delta = int(duration × intensity × mode_adjust / ability_adjust[90] × max(charaCount-2, 1))
//   减少时: delta = int(duration × (-2 / mode_adjust) × ability_adjust[90])
//   mode_adjust: mode1=2, mode4=0.5, else=1
async function settleHiddenValue(
  charId: string,
  duration: number,
  addFlag: boolean,
  intensity?: number
): Promise<void> {
  const ch = entitySystem.get('character', charId) as any
  if (!ch) return
  const mode = ch?.sp_flag?.hidden_sex_mode ?? 0
  if (mode < 1) return

  // 注释：mode_adjust — erArk hidden_sex_panel.py:164-169
  let modeAdjust = 1.0
  if (mode === 1) modeAdjust = 2.0
  else if (mode === 4) modeAdjust = 0.5

  // 注释：ability[90] = 隐蔽能力 — erArk hidden_sex_panel.py:182-183
  const abilityLv = ch?.abilities?.['隐蔽']?.level ?? 0
  const abiAdjust = getAbilityAdjust(abilityLv)

  // 注释：other_chara_adjust — erArk hidden_sex_panel.py:185-187（同场景角色数——自己和玩家之外）
  // 2026-08-08 审查修复：原 getAll().length 跨地点多算（全角色数），改为同地点过滤
  const locId = ch.current_location
  const sceneCount = entitySystem.getAll('character').filter((c: any) => c.current_location === locId).length
  const otherCharaAdjust = Math.max(sceneCount - 2, 1)

  let delta: number
  if (addFlag) {
    // 注释：增加暴露 — erArk hidden_sex_panel.py:189-195
    const nowIntensity = intensity ?? getBehaviorTagIntensity([])
    const adjust = nowIntensity * modeAdjust / abiAdjust * otherCharaAdjust
    delta = Math.floor(duration * adjust)
  } else {
    // 注释：减少暴露（等待/休息）— erArk hidden_sex_panel.py:196-199
    const adjust = (-2 / modeAdjust) * abiAdjust
    delta = Math.floor(duration * adjust)
  }

  // 注释：更新发现度，限制在 0-100
  if (!ch.h_state) ch.h_state = {}
  ch.h_state.hidden_sex_discovery_dregree = Math.max(0, Math.min(100,
    (ch.h_state.hidden_sex_discovery_dregree ?? 0) + delta
  ))
}

// 注释：checkAndSettleDiscovery — 检查是否被发现
// 对应 erArk hidden_sex_panel.py:202 check_hidden_sex_discovery()
// 发现概率公式（level 2+）: (当前值 - 60) × 3 vs random(0,100)
async function checkAndSettleDiscovery(charId: string): Promise<boolean> {
  const ch = entitySystem.get('character', charId) as any
  if (!ch) return false
  const degree = ch?.h_state?.hidden_sex_discovery_dregree ?? 0

  // 注释：level < 2 (≤60) → 不可能被发现 — erArk hidden_sex_panel.py:207
  const lv = getLevelName(degree)
  if (lv.cid < 2) return false

  // 注释：发现概率 = (当前值 - 等级1阈值(60)) × 3 — erArk hidden_sex_panel.py:209
  const discoverRate = (degree - HIDDEN_LEVELS[1].threshold) * 3
  const roll = Math.floor(Math.random() * 101)  // 0-100
  if (discoverRate < roll) return false

  // 注释：被发现 — erArk hidden_sex_panel.py:223 settle_discovered()
  await settleDiscovered(charId)
  return true
}

// 注释：settleDiscovered — 被发现时的处理
// 对应 erArk hidden_sex_panel.py:223-251
async function settleDiscovered(charId: string): Promise<void> {
  const ch = entitySystem.get('character', charId) as any
  if (!ch) return
  // 注释：清除隐奸模式 — erArk: sp_flag.hidden_sex_mode = 0
  if (ch.sp_flag) ch.sp_flag.hidden_sex_mode = 0
  // 注释：找同场景中第一个隐奸角色作为目标（2026-08-08 审查修复：原未过滤地点，
  // 可能指向其他地点的隐奸角色——erArk get_hidden_sex_targets 同场景）
  const locId = ch.current_location
  const hiddenTargets = entitySystem.getAll('character').filter((c: any) =>
    c.id !== charId && c.current_location === locId && (c?.sp_flag?.hidden_sex_mode ?? 0) >= 1
  )
  if (hiddenTargets.length > 0 && ch.sp_flag) {
    ch.sp_flag.target_character_id = hiddenTargets[0].id
  }
  // 注释：标记被发现，用于成就 913 判定
  if (!ch.achievement) ch.achievement = {}
  if (!ch.achievement.hidden_sex_record) ch.achievement.hidden_sex_record = {}
  ch.achievement.hidden_sex_record[5] = 1
  narrativeLog.write(`${ch.name ?? charId} 的隐奸被发现了！`, 'system', 'h-hidden')
  // 注释：TODO — 打开被发现面板（需 UI 系统就绪）
  // TODO: 弹出 Sex_Be_Discovered_Panel
}


// 注释：applyHiddenSexTick — 隐奸中每 tick 增加羞耻和心理快感
// 对应 erArk realtime_settle.py:503-509 + common_default.py:154-234
// erArk 完整公式:
//   time_base_value = true_add_time * 5 + base_value(0)
//   final_adjust = chara_feel_state_adjust(charId, stateId, ability[34]) + extra_adjust
//   chara_feel_state_adjust 内部:
//     feel_adjust = get_ability_adjust(ability[stateId])   — state 16(羞耻)/102(心理快感)
//     tech_adjust = get_ability_adjust(ability[34])        — 露出经验
//     final_adjust = sqrt(feel_adjust * tech_adjust)       — 几何平均
//   final_value = time_base_value × final_adjust
//   extra_adjust 是加法（不是乘法），tenths_add=false
// TODO: 缺少 ability[16](羞耻感觉) 和 ability[102](心理感觉) 字段，暂用 ability[34] 简化
// 注释：隐奸/露出持续快感 tick（对齐 erArk realtime_settle.py:566-613 的隐奸块 + 露出块）
// 2026-08-08 重构：
//   - 原实现只覆盖隐奸块（缺外层条件/素质/fall/连续减值；'心理快感' 死键（正确键为 '心理'）静默失效；
//     sqrt(ability[16]) 注释为误解——state 16 羞耻走 base 分支（无 sqrt，ability_level=露出34））
//   - 改经 h-core API settleState 统一管线（跨插件禁止直接 import）；补露出块与条件
// erArk 公式：
//   隐奸中（场景人数>2 且 周围有清醒未睡他人）：
//     羞耻/心理快感 += time×5 × (ability_lv_adjust[露出] + 素质/fall 等 + (4-mode) + 他人×0.1)，tenths=False
//   露出模式（exhibitionism_sex_mode≥1）：
//     羞耻/心理快感 += time×3 × (ability_lv_adjust[露出] + ... + min(他人×0.1, 2))，tenths=False
async function applyHiddenSexTick(charId: string, addTime: number): Promise<void> {
  const ch = entitySystem.get('character', charId) as any
  if (!ch) return
  const mode = ch?.sp_flag?.hidden_sex_mode ?? 0
  const exhibitionMode = ch?.sp_flag?.exhibitionism_sex_mode ?? 0
  if (mode < 1 && exhibitionMode < 1) return

  // 场景人数（同地点）与"其他人"计数（减去自己和玩家）
  const locId = ch.current_location
  const sceneCount = entitySystem.getAll('character').filter((c: any) => c.current_location === locId).length
  const othersCount = Math.max(0, sceneCount - 2)
  // 周围有清醒未睡他人（erArk handle_scene_others_conscious——unconscious_h===0 近似，
  // 睡眠/催眠等状态未实装部分随 L1.7 细化）
  const hasConsciousOthers = entitySystem.getAll('character').some((c: any) =>
    c.id !== charId && c.current_location === locId && (c.sp_flag?.unconscious_h ?? 0) === 0)
  const exposeLv = ch?.abilities?.['露出']?.level ?? 0
  const opts = { abilityLevel: exposeLv, tenthsAdd: false }

  // 隐奸块：场景人数 > 2 且 周围有清醒未睡他人（erArk realtime_settle.py:580/585-598）
  if (mode >= 1 && sceneCount > 2 && hasConsciousOthers) {
    const extraAdd = (4 - mode) + othersCount * 0.1
    await apiSystem.call('h-core', 'settleState', charId, '羞耻', 0, addTime * 5, { ...opts, extraAdjust: extraAdd })
    await apiSystem.call('h-core', 'settleState', charId, '心理', 0, addTime * 5, { ...opts, extraAdjust: extraAdd })
  }
  // 露出块：露出模式中（erArk realtime_settle.py:610-613，系数=min(他人×0.1,2)）
  if (exhibitionMode >= 1) {
    const othersAdj = Math.min(othersCount * 0.1, 2)
    await apiSystem.call('h-core', 'settleState', charId, '羞耻', 0, addTime * 3, { ...opts, extraAdjust: othersAdj })
    await apiSystem.call('h-core', 'settleState', charId, '心理', 0, addTime * 3, { ...opts, extraAdjust: othersAdj })
  }
}

// 注释：isCharacterHiddenFromNPC — NPC AI 过滤
// 对应 erArk handle_npc_ai.py:800-815
// 返回 true 表示该角色对 NPC AI 不可见（应被跳过）
export function isCharacterHiddenFromNPC(charId: string): boolean {
  const mode = getMode(charId)
  if (mode === 0) return false
  if (mode === 4) return true
  if ((charId === 'player' || charId === '0') && mode === 3) return true
  if (charId !== 'player' && charId !== '0' && mode === 2) return true
  return false
}

// 注释：checkHiddenSexAchievements — 检查隐奸成就 911-913
// 对应 erArk 成就 ID 911-913
// 911: 隐奸中射精 ≥ 1
// 912: 射精 ≥ 3 + 隐藏方绝顶 ≥ 3
// 913: mode1 + 未被发现 + 射精 ≥ 3 + 绝顶 ≥ 3 + 在场无感知角色 ≥ 10
function checkHiddenSexAchievements(charId: string): number[] {
  const ch = entitySystem.get('character', charId) as any
  if (!ch?.achievement?.hidden_sex_record) return []
  const rec = ch.achievement.hidden_sex_record
  const achieved: number[] = []

  if ((rec[3] ?? 0) >= 1) achieved.push(911)
  if ((rec[3] ?? 0) >= 3 && (rec[4] ?? 0) >= 3) achieved.push(912)
  if (rec[1] === 1 && (rec[5] ?? 0) !== 1 && (rec[3] ?? 0) >= 3 && (rec[4] ?? 0) >= 3) {
    const unconsciousCount = entitySystem.getAll('character').filter((c: any) =>
      c?.sp_flag?.unconscious_h
    ).length
    if (unconsciousCount >= 10) achieved.push(913)
  }

  return achieved
}

export function onLoad(_ctx: PluginContext): void {
  // 注释：hidden_sex_set_mode — 设置隐奸模式
  // 对应 erArk Select_Hidden_Sex_Mode_Panel 的模式设置逻辑
  effectTypeRegistry.register('hidden_sex_set_mode', (params: any, execCtx: any) => {
    const mode = Math.max(1, Math.min(4, params.mode ?? 1))
    // 注释：检查模式 2/3/4 的条件（场景仅 2 人或所有人无意识）
    if (mode >= 2) {
      const allChars = entitySystem.getAll('character')
      const consciousCount = allChars.filter((c: any) => !c?.sp_flag?.unconscious_h).length
      if (consciousCount > 2 && !allChars.every((c: any) => c?.sp_flag?.unconscious_h || c.id === 'player' || c.id === '0')) {
        narrativeLog.write('场景条件不满足隐奸模式 ' + mode + '（需仅 2 人或所有人无意识）', 'system', 'h-hidden')
        return false
      }
    }
    const targetIds = execCtx._targetIds as string[]
    for (const id of targetIds) {
      const ch = entitySystem.get('character', id) as any
      if (!ch) continue
      if (!ch.sp_flag) ch.sp_flag = {}
      ch.sp_flag.hidden_sex_mode = mode
      // 注释：目标取消跟随（erArk: is_follow = 0）
      if (ch.sp_flag) ch.sp_flag.is_follow = 0
      // 注释：设置不正常 flag 3
      if (!ch.sp_flag.abnormal_flags) ch.sp_flag.abnormal_flags = {}
      ch.sp_flag.abnormal_flags['3'] = true
      // 注释：初始化发现度（存于 h_state）
      if (!ch.h_state) ch.h_state = {}
      ch.h_state.hidden_sex_discovery_dregree = 0
      // 注释：初始化成就记录
      if (!ch.achievement) ch.achievement = {}
      if (!ch.achievement.hidden_sex_record) ch.achievement.hidden_sex_record = {}
      ch.achievement.hidden_sex_record[1] = mode
      ch.achievement.hidden_sex_record[2] = Math.max(0, entitySystem.getAll('character').length - 2)
    }
    // 注释：模式 1(双不隐) 或模式 2(女隐) → 男不隐藏 → 清除玩家 H 标记
    if (mode === 1 || mode === 2) {
      for (const ch of entitySystem.getAll('character')) {
        const c = ch as any
        if (c.id === 'player' || c.id === '0') {
          if (c.h_state) c.h_state.is_h = false
        }
      }
    }
    narrativeLog.write(`进入隐奸模式：${MODE_NAMES[mode]}`, 'system', 'h-hidden')
    return true
  })

  // 注释：hidden_sex_clear — 清空隐奸模式为 0
  // 对应 erArk 效果 471(SELF) / 472(TARGET) / 473(BOTH)
  effectTypeRegistry.register('hidden_sex_clear', (params: any, execCtx: any) => {
    const target = params.target ?? 'self'
    const clearMode = (charId: string) => {
      const ch = entitySystem.get('character', charId) as any
      if (ch?.sp_flag) ch.sp_flag.hidden_sex_mode = 0
    }
    if (target === 'self') {
      clearMode(execCtx.sourceId)
    } else if (target === 'target') {
      for (const id of execCtx._targetIds as string[]) clearMode(id)
    } else if (target === 'both') {
      clearMode(execCtx.sourceId)
      for (const id of execCtx._targetIds as string[]) clearMode(id)
    }
    return true
  })

  // 注释：hidden_sex_orgasm_exposure — 绝顶暴露结算
  // 对应 erArk SecondEffect 411-414
  // 调用同一条 handle_hidden_sex_flow(add_flag=true, duration, intensity)
  effectTypeRegistry.register('hidden_sex_orgasm_exposure', async (params: any, execCtx: any) => {
    const duration = params.duration ?? 5
    const intensity = params.intensity ?? 2
    const targetIds = execCtx._targetIds as string[]
    for (const id of targetIds) {
      const ch = entitySystem.get('character', id) as any
      if (!ch || (ch?.sp_flag?.hidden_sex_mode ?? 0) < 1) continue
      // 注释：直接调用发现度积累（add_flag=true），然后检查是否被发现
      await settleHiddenValue(id, duration, true, intensity)
      await checkAndSettleDiscovery(id)
    }
    return true
  })
}

export async function onEnable(ctx: PluginContext): Promise<void> {
  const reg = async (id: string, fn: (c: any) => boolean) => {
    try { await ctx.api.call('h-core', 'registerPremise', id, fn) } catch { }
  }

  function getTargetMode(ctx2: any): number {
    const id = getTargetId(ctx2)
    if (!id) return 0
    return getMode(id)
  }

  function getSelfMode(ctx2: any): number {
    const id = getSelfId(ctx2)
    if (!id) return 0
    return getMode(id)
  }

  // 注释：HIDDEN_SEX_MODE_0 — 不在隐奸中
  reg('HIDDEN_SEX_MODE_0', (ctx2: any) => getSelfMode(ctx2) === 0)
  reg('HIDDEN_SEX_MODE_GE_1', (ctx2: any) => getSelfMode(ctx2) >= 1)
  reg('HIDDEN_SEX_MODE_1', (ctx2: any) => getSelfMode(ctx2) === 1)
  reg('HIDDEN_SEX_MODE_2', (ctx2: any) => getSelfMode(ctx2) === 2)
  reg('HIDDEN_SEX_MODE_3', (ctx2: any) => getSelfMode(ctx2) === 3)
  reg('HIDDEN_SEX_MODE_4', (ctx2: any) => getSelfMode(ctx2) === 4)
  reg('HIDDEN_SEX_MODE_1_OR_2', (ctx2: any) => { const m = getSelfMode(ctx2); return m === 1 || m === 2 })
  reg('HIDDEN_SEX_MODE_3_OR_4', (ctx2: any) => { const m = getSelfMode(ctx2); return m === 3 || m === 4 })
  reg('HIDDEN_SEX_MODE_1_OR_3', (ctx2: any) => { const m = getSelfMode(ctx2); return m === 1 || m === 3 })
  reg('HIDDEN_SEX_MODE_2_OR_4', (ctx2: any) => { const m = getSelfMode(ctx2); return m === 2 || m === 4 })

  // 注释：目标的对应前提
  reg('TARGET_HIDDEN_SEX_MODE_GE_1', (ctx2: any) => getTargetMode(ctx2) >= 1)
  reg('TARGET_HIDDEN_SEX_MODE_1', (ctx2: any) => getTargetMode(ctx2) === 1)
  reg('TARGET_HIDDEN_SEX_MODE_2', (ctx2: any) => getTargetMode(ctx2) === 2)
  reg('TARGET_HIDDEN_SEX_MODE_3', (ctx2: any) => getTargetMode(ctx2) === 3)
  reg('TARGET_HIDDEN_SEX_MODE_4', (ctx2: any) => getTargetMode(ctx2) === 4)
  reg('TARGET_HIDDEN_SEX_MODE_1_OR_2', (ctx2: any) => { const m = getTargetMode(ctx2); return m === 1 || m === 2 })
  reg('TARGET_HIDDEN_SEX_MODE_3_OR_4', (ctx2: any) => { const m = getTargetMode(ctx2); return m === 3 || m === 4 })

  // 注释：TARGET_NOT_IN_HIDDEN_SEX_MODE — 目标不在隐奸中
  reg('TARGET_NOT_IN_HIDDEN_SEX_MODE', (ctx2: any) => getTargetMode(ctx2) === 0)

  // 注释：玩家相关前提
  reg('PLAYER_IN_HIDDEN_SEX_MODE', (ctx2: any) => {
    const id = getSelfId(ctx2); if (!id) return false
    return getMode(id) >= 1
  })
  reg('PLAYER_NOT_IN_HIDDEN_SEX_MODE', (ctx2: any) => {
    const id = getSelfId(ctx2); if (!id) return false
    return getMode(id) === 0
  })
  reg('PL_NOT_HIDDEN_SEX_MODE_3_OR_4', (_ctx2: any) => {
    const playerId = entitySystem.getAll('character').find((c: any) => c.id === 'player' || c.id === '0')?.id
    if (!playerId) return true
    const m = getMode(playerId); return !(m === 3 || m === 4)
  })

  // 注释：复合前提
  reg('SLEEP_H_OR_HIDDEN_SEX', (ctx2: any) => {
    const id = getSelfId(ctx2); if (!id) return false
    const ch = entitySystem.get('character', id) as any
    // 注释：睡眠 H（unconscious_h=3）或 hidden_sex_mode >= 1
    return (ch?.sp_flag?.unconscious_h === 3) || (getMode(id) >= 1)
  })
  reg('TARGET_SLEEP_H_OR_HIDDEN_SEX', (ctx2: any) => {
    const id = getTargetId(ctx2); if (!id) return false
    const ch = entitySystem.get('character', id) as any
    return (ch?.sp_flag?.unconscious_h === 3) || (getMode(id) >= 1)
  })

  reg('PLAYER_NOT_H_OR_HIDDEN_SEX_MODE', (_ctx2: any) => {
    const playerId = entitySystem.getAll('character').find((c: any) => c.id === 'player' || c.id === '0')?.id
    if (!playerId) return true
    const ch = entitySystem.get('character', playerId) as any
    // 注释：不在 H 中 或者在隐奸中
    return !ch?.h_state?.is_h || getMode(playerId) >= 1
  })

  // 注释：UI/场所相关前提
  reg('SHOW_NON_H_IN_HIDDEN_SEX', (_ctx2: any) => {
    // 注释：cache 级标志，存于 game context
    return (gameContext.getContext() as any)?.show_non_h_in_hidden_sex === true
  })
  reg('NOT_SHOW_NON_H_IN_HIDDEN_SEX', (_ctx2: any) => {
    return (gameContext.getContext() as any)?.show_non_h_in_hidden_sex !== true
  })

  reg('PLACE_SOMEONE_H_BUT_NOT_HIDDEN_SEX', (_ctx2: any) => {
    // 注释：场景中有他人处于非隐奸 H 模式
    for (const ch of entitySystem.getAll('character')) {
      const c = ch as any
      if (c?.h_state?.is_h && (getMode(c.id) === 0)) return true
    }
    return false
  })

  reg('PLACE_SOMEONE_NOT_IN_HIDDEN_AND_CONSCIOUS', (_ctx2: any) => {
    // 注释：场景中有他人不在隐奸中且有意识
    for (const ch of entitySystem.getAll('character')) {
      const c = ch as any
      if (c.id === 'player' || c.id === '0') continue
      if (getMode(c.id) === 0 && !c?.sp_flag?.unconscious_h) return true
    }
    return false
  })

  ctx.api.register('h-hidden', {
    getMode: (charId: string): number => {
      const ch = entitySystem.get('character', charId) as any
      return ch?.sp_flag?.hidden_sex_mode ?? 0
    },
    setMode: (charId: string, mode: number) => {
      const ch = entitySystem.get('character', charId) as any
      if (!ch) return
      if (!ch.sp_flag) ch.sp_flag = {}
      ch.sp_flag.hidden_sex_mode = Math.max(0, Math.min(4, mode))
    },
    getDiscoveryDegree: (charId: string): number => {
      const ch = entitySystem.get('character', charId) as any
      return ch?.h_state?.hidden_sex_discovery_dregree ?? 0
    },
    getModeName: (charId: string): string => {
      const ch = entitySystem.get('character', charId) as any
      return MODE_NAMES[ch?.sp_flag?.hidden_sex_mode ?? 0] ?? '无'
    },
    getHiddenLevel: (charId: string): { cid: number; name: string } => {
      const ch = entitySystem.get('character', charId) as any
      const deg = ch?.h_state?.hidden_sex_discovery_dregree ?? 0
      return getLevelName(deg)
    },
    isHidden: (charId: string): boolean => isCharacterHiddenFromNPC(charId),
    checkAchievements: (charId: string): number[] => checkHiddenSexAchievements(charId),
  })

  // 注释：每次 H 行动后 → 发现度 tick + 羞耻/快感 tick + 经验
  ctx.events.on('game:execution_end', async (payload: any) => {
    const currentMode = gameContext.getCurrentMode()
    if (currentMode !== 'h_scene') return

    const addTime = payload?.timeCost ?? lastActionTimeCost

    for (const ch of entitySystem.getAll('character')) {
      const c = ch as any
      const mode = c?.sp_flag?.hidden_sex_mode ?? 0
      // 注释：露出模式角色也要走到持续快感 tick（2026-08-08 修复：原门槛跳过露出角色，
      // applyHiddenSexTick 的露出块永不触发——静默失效）
      const exhibitionMode = c?.sp_flag?.exhibitionism_sex_mode ?? 0
      if (mode < 1 && exhibitionMode < 1) continue

      const behaviorId = c?.behavior?.behavior_id
      const behaviorTags = c?.behavior?.tags ?? []
      const isSexTag = behaviorTags.some((t: string) => t === '猥亵' || t === '性爱')
      const isWait = behaviorId === 'WAIT'
      const addFlag = isWait ? false : isSexTag
      const intensity = getBehaviorTagIntensity(behaviorTags)

      await settleHiddenValue(c.id, addTime, addFlag, intensity)

      await applyHiddenSexTick(c.id, addTime)

      if (!isWait) {
        const discovered = await checkAndSettleDiscovery(c.id)
        if (discovered) break
      }

      if ((c.id === 'player' || c.id === '0') && isSexTag && !isWait) {
        if (!c.experience) c.experience = {}
        c.experience['hidden_sex'] = (c.experience['hidden_sex'] ?? 0) + 1
        const targetId = c?.sp_flag?.target_character_id
        if (targetId) {
          const target = entitySystem.get('character', targetId) as any
          if (target) {
            if (!target.experience) target.experience = {}
            target.experience['hidden_sex'] = (target.experience['hidden_sex'] ?? 0) + 1
          }
        }
      }
    }
  })

  // 注释：隐奸中绝顶 → 增加发现度（暴露对象 = 隐奸发起方/玩家，erArk EXPOSED_ORGASM_*_IN_HIDDEN_SEX
  // Second_effect.py:2411-2426 handle_hidden_sex_flow(character_id=0)）
  // 2026-08-08 修正：原暴露值加给绝顶者——触发条件"绝顶者 mode≥1"保证玩家发起的隐奸中绝顶者即玩家
  // （数值等价），但多人隐奸/NPC 发起场景语义错位；改为显式挂玩家（被发现是发起方的社交事件）
  eventBus.on('h:orgasm', async (payload: any) => {
    if (!payload?.character) return
    const ch = entitySystem.get('character', payload.character) as any
    if (!ch || (ch?.sp_flag?.hidden_sex_mode ?? 0) < 1) return
    const playerId = gameContext.getContext().player?.id

    const orgasmLv = payload.level ?? 0
    const orgasmMap = [
      { duration: 5, intensity: 2 },
      { duration: 6, intensity: 3 },
      { duration: 7, intensity: 4 },
      { duration: 10, intensity: 5 },
    ]
    const { duration, intensity } = orgasmMap[Math.min(orgasmLv, 3)]

    // 注释：暴露值/发现度挂玩家（隐奸发起方）——erArk character_id=0；绝顶者仅作触发检查
    if (playerId) {
      await settleHiddenValue(playerId, duration, true, intensity)
      await checkAndSettleDiscovery(playerId)
    }

    // 注释：成就记录（rec[4]=绝顶）挂玩家（隐藏方/发起方——成就 912/913 "隐藏方绝顶≥3"，
    // erArk 同；2026-08-08 修正：原记绝顶者（NPC）→ 绝顶成就永不满足）
    if (playerId) {
      const player = entitySystem.get('character', playerId) as any
      if (player) {
        if (!player.achievement) player.achievement = {}
        if (!player.achievement.hidden_sex_record) player.achievement.hidden_sex_record = {}
        player.achievement.hidden_sex_record[4] = (player.achievement.hidden_sex_record[4] ?? 0) + 1
      }
    }
  })

  // 注释：隐奸中射精 → 成就记录（rec[3]=射精，同样挂玩家——隐藏方射精，erArk 同）
  eventBus.on('h:shoot', (payload: any) => {
    if (!payload?.character) return
    const ch = entitySystem.get('character', payload.character) as any
    if (!ch || (ch?.sp_flag?.hidden_sex_mode ?? 0) < 1) return
    const playerId = gameContext.getContext().player?.id
    if (playerId) {
      const player = entitySystem.get('character', playerId) as any
      if (player) {
        if (!player.achievement) player.achievement = {}
        if (!player.achievement.hidden_sex_record) player.achievement.hidden_sex_record = {}
        player.achievement.hidden_sex_record[3] = (player.achievement.hidden_sex_record[3] ?? 0) + 1
      }
    }
  })

  // 注释：H 结束 → 清除隐奸模式
  eventBus.on('h:end', () => {
    for (const ch of entitySystem.getAll('character')) {
      const c = ch as any
      if (c?.sp_flag?.hidden_sex_mode) {
        c.sp_flag.hidden_sex_mode = 0
      }
    }
  })

  // 注释：记录每次行动的时间成本
  ctx.events.on('game:execution_start', (payload: any) => {
    const cmd = commandRegistry.getById(payload?.commandId)
    if (cmd) {
      lastActionTimeCost = (cmd as any)?.timeCost ?? 10
    }
  })

  // 注释：注册 UI 插槽 — 隐奸状态标签
  try {
    ctx.ui.registerSlot('character-tag', {
      id: 'hidden-sex-tag',
      component: 'HiddenSexTag' as any,   // 注释：TODO — 创建 Vue 组件
      priority: 50,
      condition: (gameCtx: any) => {
        if (!gameCtx?.selectedCharacterId) return false
        return getMode(gameCtx.selectedCharacterId) >= 1
      },
    })
  } catch { /* UI 未就绪 */ }
}
