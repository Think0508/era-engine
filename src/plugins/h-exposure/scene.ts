// 注释：h-exposure 场景与核心机制模块（index.ts 拆分）
// 职责：露出模式状态/动态模式切换、露出持续快感 tick、露出经验、
// 成就记录（exhibitionism_sex_record）、h:end 模式清理。
// 参考 erArk 源文件：
//   exhibitionism_sex_panel.py       — update_exhibiionism_sex_mode（动态模式切换，源码不在仓库，
//                                     语义取自 12-露出系统.md §3 + character_behavior.py:426-429）
//   realtime_settle.py:610-613       — 露出中羞耻/心理快感（露出块，2026-08-08 实现于 h-hidden，
//                                     2026-08-15 迁出至本插件）
//   settle_behavior.py:670-672       — 露出经验 +1（extra_exp_settle，无条件）
//   second_behavior.py:457-460       — 成就记录
//   default.py:4191 / h:end 兜底      — 露出模式清零
//   handle_premise_sp_flag.py        — 露出前提（见 premises.ts）

import type { PluginContext } from '../../core/types'
import { entitySystem } from '../../core/entity-system'
import { eventBus } from '../../core/event-bus'
import { gameContext } from '../../core/game-context'
import { modLoader } from '../../core/mod-loader'
import { apiSystem } from '../../core/api'
import { errorReporter } from '../../core/error-reporter'
import { commandRegistry } from '../../core/command-registry'
import { ATTR } from '../../core/entity-utils'

// 注释：5 级露出模式名称（erArk exhibitionism_sex_mode 0-4）
export const MODE_NAMES = ['无', '室内露出', '室外露出', '人前露出', '无意识露出']

// 注释：记录每次行动的时间成本（execution_start 监听；露出 tick/经验用）
let lastActionTimeCost = 10

// 注释：场景逻辑只注册一次守卫——plugin-manager 的 loadPlugins 无幂等守卫，
// 重复 onEnable 会双倍注册监听器（tick/经验/成就双倍结算；h-core index.ts 同款防御）
let exposureSceneLogicRegistered = false

// 注释：getMode — 读取角色的露出模式（0=无 1=室内 2=室外 3=人前 4=无意识人前）
export function getMode(charId: string): number {
  const ch = entitySystem.get('character', charId) as any
  return ch?.sp_flag?.exhibitionism_sex_mode ?? 0
}

// 注释：同地点角色列表（"场景"语义——h-hidden 同款：current_location 过滤，全图计数失真）
function getSceneChars(locId: string | null): any[] {
  if (!locId) return []
  return entitySystem.getAll('character').filter((c: any) => c.current_location === locId)
}

// 注释：场景中除自己+自己的 H 目标外的旁观者（mode 3/4 判定用）
// 目标 id：h_state.target_character_id（H 中）→ sp_flag.target_character_id（邀请瞬间 h_state 未建）
// ⚠️ 邀请瞬间（exposure_set_level 执行、h_start_h 之前）h_state 不存在——目标未知时旁观者
// 含目标，mode 3/4 判定略宽松；首次行动后 execution_end 动态切换修正（erArk 同款首次 update）
function getObservers(charId: string): any[] {
  const ch = entitySystem.get('character', charId) as any
  if (!ch?.current_location) return []
  const targetId = ch.h_state?.target_character_id ?? ch.sp_flag?.target_character_id ?? null
  return getSceneChars(ch.current_location).filter((c: any) => c.id !== charId && c.id !== targetId)
}

// 注释：地点是否为室内（mod 数据 tag 约定——缺省=室外；门未锁条件已砍，见 ADR-0014）
function isIndoor(locId: string): boolean {
  const mod = modLoader.getMod()
  const loc = (mod?.locations as Map<string, any> | undefined)?.get(locId)
  return loc?.tags?.includes('has_indoor') === true
}

// 注释：checkIndoorTagCoverage — 加载期卫生检查
// 模组没有任何 has_indoor 地点 → 一次性 warning（露出模式 1 不可达——室内外判定缺省=室外，
// 全部 2 人场景恒为模式 2；tag 是自由约定，漏打不报错，此检查帮作者知晓而非静默）
export function checkIndoorTagCoverage(): void {
  const mod = modLoader.getMod()
  const locations = mod?.locations as Map<string, any> | undefined
  if (!locations || locations.size === 0) return
  let hasIndoor = false
  for (const loc of locations.values()) {
    if (loc?.tags?.includes('has_indoor')) { hasIndoor = true; break }
  }
  if (!hasIndoor) {
    // 注释：reportDedup——重复 onEnable（plugin-manager 无幂等守卫）不刷屏
    errorReporter.reportDedup('exposure:indoor-tag-coverage', {
      source: 'h-exposure',
      severity: 'warning',
      message: '本模组没有任何带 has_indoor 标签的地点——露出模式 1（室内露出）不可达，2 人场景恒为模式 2（室外露出）',
      suggestion: '室内地点（建筑内部等）在 maps/locations/*.toml 打 tags = ["has_indoor"]；不想要室内区分可忽略此警告',
    })
  }
}

// 注释：computeModeByScene — 按场景计算应处的露出模式（邀请初始模式 + 动态切换共用）
// erArk 动态切换规则（12-露出系统.md §3 + §1）：
//   场景>2人 → 3(旁观者有清醒) / 4(旁观者全部无意识/睡眠)
//   场景=2人 → 1(室内) / 2(室外)
// 门未锁条件已砍（设计决策，ADR-0014：门概念限定世界观，通用 mod 无门模型）
export function computeModeByScene(charId: string): number {
  const ch = entitySystem.get('character', charId) as any
  if (!ch?.current_location) return 2
  const sceneCount = getSceneChars(ch.current_location).length
  if (sceneCount > 2) {
    const observers = getObservers(charId)
    // 旁观者全部无意识/睡眠（sleeping=true 的睡眠者不算清醒——与 h-hidden A2 修复语义一致）
    const allUnconscious = observers.length > 0 &&
      observers.every((o: any) => (o.sp_flag?.unconscious_h ?? 0) || o.sp_flag?.sleeping)
    return allUnconscious ? 4 : 3
  }
  if (sceneCount === 2) {
    return isIndoor(ch.current_location) ? 1 : 2
  }
  // 场景 <2（防御：露出中自己+目标恒≥2；目标缺失时按室外处理，不阻断流程）
  return 2
}

// 注释：updateExhibitionismMode — 动态模式切换（erArk update_exhibiionism_sex_mode 等价）
// 仅对已在露出模式（mode≥1）的角色重评估；每次 H 行动后调用（execution_end）
export function updateExhibitionismMode(charId: string): number {
  const ch = entitySystem.get('character', charId) as any
  if (!ch) return 0
  if ((ch.sp_flag?.exhibitionism_sex_mode ?? 0) < 1) return 0
  const next = computeModeByScene(charId)
  ch.sp_flag.exhibitionism_sex_mode = next
  return next
}

// 注释：applyExposureTick — 露出中每 tick 羞耻/心理快感（realtime_settle.py:610-613 露出块）
// erArk 完整公式：
//   露出模式（exhibitionism_sex_mode≥1）：
//     羞耻/心理快感 += time×3 × (ability_lv_adjust[露出] + 素质/fall 等 + min(他人×0.1, 2))，tenths=False
// 注：露出块的系数不读 mode 数值（只做 ≥1 门槛）——mode 1/2/3/4 不参与数值区分
// 2026-08-15 自 h-hidden/scene.ts applyHiddenSexTick 迁出（露出逻辑归 h-exposure，h-hidden 只留隐奸块）
export async function applyExposureTick(charId: string, addTime: number): Promise<void> {
  const ch = entitySystem.get('character', charId) as any
  if (!ch) return
  if (getMode(charId) < 1) return

  const locId = ch.current_location
  const sceneCount = getSceneChars(locId).length
  const othersCount = Math.max(0, sceneCount - 2)
  const othersAdj = Math.min(othersCount * 0.1, 2)
  const exposeLv = ch?.abilities?.[ATTR.EXPOSURE]?.level ?? 0
  const opts = { abilityLevel: exposeLv, tenthsAdd: false }

  await apiSystem.call('h-core', 'settleState', charId, ATTR.SHAME, 0, addTime * 3, { ...opts, extraAdjust: othersAdj })
  await apiSystem.call('h-core', 'settleState', charId, ATTR.MIND, 0, addTime * 3, { ...opts, extraAdjust: othersAdj })
}

// 注释：checkExposureAchievements — 检查露出成就 931-933
// 对应 erArk 成就 ID 931-934（934 依赖被发现系统，未实现——半成品 TODO）
// 931 展示自我：首次露出（rec[1] 存在）+ 射精≥1
// 932 光天化日：模式3/4 + 其他在场≥1 + 射精≥1 + 绝顶≥1
// 933 众目睽睽：其他在场≥10 + 射精≥3 + 绝顶≥3
// rec 结构（erArk exhibitionism_sex_record，game_type.py:933-934）：
//   rec[1]=进入时模式、rec[2]=进入时场景其他人数、rec[3]=射精次数、rec[4]=露出绝顶次数
// ⚠️ 成就结构契约已记入 ADR-0014（用户要求：成就可能增删改）
export function checkExposureAchievements(charId: string): number[] {
  const ch = entitySystem.get('character', charId) as any
  if (!ch?.achievement?.exhibitionism_sex_record) return []
  const rec = ch.achievement.exhibitionism_sex_record
  const achieved: number[] = []

  if (rec[1] !== undefined && (rec[3] ?? 0) >= 1) achieved.push(931)
  if ((rec[1] === 3 || rec[1] === 4) && (rec[2] ?? 0) >= 1 && (rec[3] ?? 0) >= 1 && (rec[4] ?? 0) >= 1) achieved.push(932)
  if ((rec[2] ?? 0) >= 10 && (rec[3] ?? 0) >= 3 && (rec[4] ?? 0) >= 3) achieved.push(933)

  return achieved
}

// 注释：注册露出场景生命周期监听（onEnable 调用；事件注册顺序与 h-hidden 对齐）：
// execution_start（耗时记录）→ execution_end（tick+经验+动态切换）→ h:orgasm/h:shoot（成就记录）
// → h:end（模式清理）→ game:load（瞬态重置）
export function registerExposureSceneLogic(ctx: PluginContext): void {
  if (exposureSceneLogicRegistered) return
  exposureSceneLogicRegistered = true

  // 注释：每次 H 行动后 → 露出 tick + 露出经验 + 动态模式切换
  ctx.events.on('game:execution_end', async (payload: any) => {
    const currentMode = gameContext.getCurrentMode()
    if (currentMode !== 'h_scene') return

    const addTime = payload?.timeCost ?? lastActionTimeCost

    // 注释：M-2 对齐——hook 拦截（quest trigger 改道等）时间未推进，execution_end 上报 0；
    // erArk 行为结算只在时间推进后发生（拦截=无行为结算=无 tick/经验/切换）
    if (addTime <= 0) return

    for (const ch of entitySystem.getAll('character')) {
      const c = ch as any
      const mode = c?.sp_flag?.exhibitionism_sex_mode ?? 0
      if (mode < 1) continue

      // 注释：露出持续快感（realtime_settle.py:610-613）
      await applyExposureTick(c.id, addTime)

      // 注释：露出经验 +1（settle_behavior.py:670-672——extra_exp_settle 对每个露出角色无条件 +1，
      // 不看行为类型；与隐奸经验（玩家+猥亵/性爱+非等待，h-hidden scene.ts）语义不同）
      if (!c.experience) c.experience = {}
      c.experience['34'] = (c.experience['34'] ?? 0) + 1

      // 注释：动态模式切换（character_behavior.py:426-429——每次行为结算重评估）
      updateExhibitionismMode(c.id)
    }
  })

  // 注释：记录每次行动的时间成本（对齐 h-hidden——execution_start 的 payload 只有 commandId，
  // 耗时从 commandRegistry 读指令定义；拦截/无指令时保留上值）
  ctx.events.on('game:execution_start', (payload: any) => {
    const cmd = commandRegistry.getById(payload?.commandId)
    if (cmd) {
      lastActionTimeCost = (cmd as any)?.timeCost ?? 10
    }
  })

  // 注释：露出中绝顶 → 成就记录 rec[4]（挂玩家=露出发起方/成就者——对齐 h-hidden
  // "绝顶者≠发起方"修正先例：绝顶者模式≥1 只是触发检查，记录挂玩家）
  eventBus.on('h:orgasm', (payload: any) => {
    if (!payload?.character) return
    const ch = entitySystem.get('character', payload.character) as any
    if (!ch || getMode(payload.character) < 1) return
    const playerId = gameContext.getContext().player?.id
    if (playerId) {
      const player = entitySystem.get('character', playerId) as any
      if (player) {
        if (!player.achievement) player.achievement = {}
        if (!player.achievement.exhibitionism_sex_record) player.achievement.exhibitionism_sex_record = {}
        player.achievement.exhibitionism_sex_record[4] = (player.achievement.exhibitionism_sex_record[4] ?? 0) + 1
      }
    }
  })

  // 注释：露出中射精 → 成就记录 rec[3]（挂玩家，同上）
  eventBus.on('h:shoot', (payload: any) => {
    if (!payload?.character) return
    const ch = entitySystem.get('character', payload.character) as any
    if (!ch || getMode(payload.character) < 1) return
    const playerId = gameContext.getContext().player?.id
    if (playerId) {
      const player = entitySystem.get('character', playerId) as any
      if (player) {
        if (!player.achievement) player.achievement = {}
        if (!player.achievement.exhibitionism_sex_record) player.achievement.exhibitionism_sex_record = {}
        player.achievement.exhibitionism_sex_record[3] = (player.achievement.exhibitionism_sex_record[3] ?? 0) + 1
      }
    }
  })

  // 注释：H 结束 → 清除全部露出模式（erArk 404 BOTH_H_STATE_RESET 清零露出模式语义，
  // default.py:4191；与 h-hidden 清 hidden_sex_mode 完全对称——结束露出指令效果链
  // 526/753/528/404/631 中 404 由此覆盖，753 门重置已砍）
  eventBus.on('h:end', () => {
    for (const ch of entitySystem.getAll('character')) {
      const c = ch as any
      if (c?.sp_flag?.exhibitionism_sex_mode) {
        c.sp_flag.exhibitionism_sex_mode = 0
      }
    }
  })

  // 注释：读档后重置瞬态状态（对齐 h-hidden）
  ctx.events.on('game:load', () => {
    lastActionTimeCost = 10
  })

  // 注释：注册 UI 插槽 — 露出状态标签 `<露>`
  // TODO: 创建 Vue 组件（与 h-hidden HiddenSexTag 同为半成品占位，H UI 完整版落地）
  try {
    ctx.ui.registerSlot('character-tag', {
      id: 'exposure-tag',
      component: 'ExposureTag' as any,
      priority: 60,
      condition: (gameCtx: any) => {
        if (!gameCtx?.selectedCharacterId) return false
        return getMode(gameCtx.selectedCharacterId) >= 1
      },
    })
  } catch { /* UI 未就绪 */ }
}
