// 注释：h-hidden 公共 API 注册模块（index.ts 拆分）
// 职责：ctx.api.register('h-hidden', ...) 的全部方法（getMode/setMode/getDiscoveryDegree/
// getModeName/getHiddenLevel/isHidden/checkAchievements），即原 onEnable 中 API 注册段落的全部内容。

import type { PluginContext } from '../../core/types'
import { entitySystem } from '../../core/entity-system'
import { MODE_NAMES, getLevelName, isCharacterHiddenFromNPC, checkHiddenSexAchievements } from './scene'

// 注释：注册隐奸公共 API（onEnable 原位内容）
export function registerHiddenSexApi(ctx: PluginContext): void {
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
}
