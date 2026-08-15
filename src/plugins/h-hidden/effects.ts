// 注释：h-hidden 效果注册模块（index.ts 拆分）
// 职责：隐奸相关 effect-type 注册（hidden_sex_set_mode / hidden_sex_clear / hidden_sex_orgasm_exposure），
// 即原 onLoad 主体的全部内容。

import { effectTypeRegistry } from '../../core/effect-type-registry'
import { entitySystem } from '../../core/entity-system'
import { gameContext, isPlayerChar } from '../../core/game-context'
import { narrativeLog } from '../../core/narrative-log'
import { apiSystem } from '../../core/api'
import { MODE_NAMES, settleHiddenValue, checkAndSettleDiscovery } from './scene'

// 注释：注册隐奸效果类型（onLoad 原位内容）
export function registerHiddenSexEffects(): void {
  // 注释：hidden_sex_set_mode — 设置隐奸模式
  // 对应 erArk Select_Hidden_Sex_Mode_Panel 的模式设置逻辑
  effectTypeRegistry.register('hidden_sex_set_mode', (params: any, execCtx: any) => {
    const mode = Math.max(1, Math.min(4, params.mode ?? 1))
    const targetIds = execCtx._targetIds as string[]
    // 注释：检查模式 2/3/4 的条件（场景仅 2 人或所有人无意识）
    // C 修复（第四轮）：睡眠者不算清醒（与 A2 三处语义一致——sleeping=true, unconscious_h=0）
    // Find 1 修复（第五轮）：同地点过滤——原全图扫描在 500 NPC mod 下 consciousCount>2 且
    // every()==false 近乎恒真 → mode 2/3/4 静默不可用（erArk 语义 = 场景 = 同地点，
    // 与本项目 SCENE_ALL_UNCONSCIOUS_OR_SLEEP 前提一致）
    if (mode >= 2) {
      const firstTarget = targetIds[0] ? entitySystem.get('character', targetIds[0]) as any : null
      const locId = gameContext.getContext().location?.id ?? firstTarget?.current_location ?? null
      const allChars = locId
        ? entitySystem.getAll('character').filter((c: any) => c.current_location === locId)
        : []
      const consciousCount = allChars.filter((c: any) => !c?.sp_flag?.unconscious_h && !c?.sp_flag?.sleeping).length
      if (consciousCount > 2 && !allChars.every((c: any) => c?.sp_flag?.unconscious_h || c?.sp_flag?.sleeping || isPlayerChar(c.id))) {
        narrativeLog.write('场景条件不满足隐奸模式 ' + mode + '（需仅 2 人或所有人无意识）', 'system', 'h-hidden')
        return false
      }
    }
    for (const id of targetIds) {
      const ch = entitySystem.get('character', id) as any
      if (!ch) continue
      if (!ch.sp_flag) ch.sp_flag = {}
      ch.sp_flag.hidden_sex_mode = mode
      // 注释：目标取消跟随（erArk: is_follow = 0）——走 follow API（2026-08-10 重构：
      // 直写 sp_flag.is_follow 会绕过 follow:ended 事件与条件镜像字段 following/follow_mode）
      try {
        apiSystem.call('follow', 'end', id, 'hidden_sex')
      } catch {
        // 注释：follow-system 未启用 → 直写兜底（erArk 语义：隐奸开始必解除跟随）
        ch.sp_flag.is_follow = 0
      }
      // 注释：设置不正常 flag 3
      if (!ch.sp_flag.abnormal_flags) ch.sp_flag.abnormal_flags = {}
      ch.sp_flag.abnormal_flags['3'] = true
      // 注释：初始化发现度（存于 h_state）
      if (!ch.h_state) ch.h_state = {}
      ch.h_state.hidden_sex_discovery_dregree = 0
      // 注释：初始化成就记录——rec[1]=模式、rec[2]=场景在场人数（Find 3 修复（第五轮）：
      // 同地点——原全图计数在 500 NPC mod 下恒为全图人数，"在场"语义失真）
      if (!ch.achievement) ch.achievement = {}
      if (!ch.achievement.hidden_sex_record) ch.achievement.hidden_sex_record = {}
      ch.achievement.hidden_sex_record[1] = mode
      const sceneLoc = ch.current_location
      const sceneCount = entitySystem.getAll('character').filter((c: any) =>
        c.current_location === sceneLoc
      ).length
      ch.achievement.hidden_sex_record[2] = Math.max(0, sceneCount - 2)
    }
    // 注释：模式 1(双不隐) 或模式 2(女隐) → 男不隐藏 → 清除玩家 H 标记
    if (mode === 1 || mode === 2) {
      for (const ch of entitySystem.getAll('character')) {
        const c = ch as any
        if (isPlayerChar(c.id)) {
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
