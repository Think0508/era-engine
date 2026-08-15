// 注释：h-exposure 效果注册模块（index.ts 拆分）
// 职责：exposure_set_level（模式设置：显式 level 或按场景自动计算 + 成就记录初始化）、
// exposure_discovered（被发现处理——半成品，依赖被发现面板系统）

import { effectTypeRegistry } from '../../core/effect-type-registry'
import { entitySystem } from '../../core/entity-system'
import { narrativeLog } from '../../core/narrative-log'
import { computeModeByScene } from './scene'

// 注释：exposure_set_level — 设置露出模式 0-4
// params.level 省略 → 按当前场景自动计算初始模式（邀请露出 TOML 写 params = {}；
// 复用动态切换的场景判定 computeModeByScene——场景=2人→室内tag?1:2、>2人→3/4）
// 设置 mode≥1 时初始化成就记录 rec[1]=模式、rec[2]=场景其他人数（erArk
// exhibitionism_sex_record，game_type.py:933-934；对齐 h-hidden hidden_sex_record）
export function registerExposureEffects(): void {
  effectTypeRegistry.register('exposure_set_level', (params: any, execCtx: any) => {
    const targetIds = execCtx._targetIds as string[]
    for (const id of targetIds) {
      const ch = entitySystem.get('character', id) as any
      if (!ch) continue
      if (!ch.sp_flag) ch.sp_flag = {}

      const level = params?.level === undefined
        ? computeModeByScene(id)
        : Math.max(0, Math.min(4, params.level ?? 0))
      ch.sp_flag.exhibitionism_sex_mode = level

      if (level >= 1) {
        if (!ch.achievement) ch.achievement = {}
        if (!ch.achievement.exhibitionism_sex_record) ch.achievement.exhibitionism_sex_record = {}
        ch.achievement.exhibitionism_sex_record[1] = level
        const locId = ch.current_location
        const sceneCount = locId
          ? entitySystem.getAll('character').filter((c: any) => c.current_location === locId).length
          : 0
        ch.achievement.exhibitionism_sex_record[2] = Math.max(0, sceneCount - 2)
      }
    }
    return true
  })

  // 注释：exposure_discovered — 露出中被发现的处理
  // ⚠️ 半成品（2026-08-15 决策）：erArk 被发现走 Sex_Be_Discovered_Panel（5 选项面板：
  // 话术支开判定200 / 转隐奸 / 转露出判定500 / 邀请群交判定600 / 结束H）——面板级 UI
  // 不做，留 TODO（与 h-hidden settleDiscovered 的 TODO 对齐）。检测事件本身
  // （NPC 进入场景+目睹露出H）随被发现系统一并推迟，本效果仅保留占位。
  effectTypeRegistry.register('exposure_discovered', (_params: any, execCtx: any) => {
    const targetIds = execCtx._targetIds as string[]
    for (const id of targetIds) {
      const ch = entitySystem.get('character', id) as any
      narrativeLog.write(`${ch?.name ?? id} 暴露了！`, 'system', 'h-exposure')
      // TODO: 弹出 Sex_Be_Discovered_Panel（5 选项：话术支开/转隐奸/转露出/邀请群交/结束H）
    }
    return true
  })
}
