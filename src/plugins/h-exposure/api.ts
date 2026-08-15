// 注释：h-exposure 公共 API 注册模块（index.ts 拆分）
// 职责：ctx.api.register('h-exposure', ...) 的全部方法
// （getLevel/setLevel/getModeName/updateMode/checkAchievements）

import type { PluginContext } from '../../core/types'
import { entitySystem } from '../../core/entity-system'
import { MODE_NAMES, getMode, updateExhibitionismMode, checkExposureAchievements } from './scene'

export function registerExposureApi(ctx: PluginContext): void {
  ctx.api.register('h-exposure', {
    getLevel: (charId: string): number => getMode(charId),
    setLevel: (charId: string, level: number) => {
      const ch = entitySystem.get('character', charId) as any
      if (!ch) return
      if (!ch.sp_flag) ch.sp_flag = {}
      ch.sp_flag.exhibitionism_sex_mode = Math.max(0, Math.min(4, level))
    },
    getModeName: (charId: string): string => {
      return MODE_NAMES[getMode(charId)] ?? '无'
    },
    updateMode: (charId: string): number => updateExhibitionismMode(charId),
    checkAchievements: (charId: string): number[] => checkExposureAchievements(charId),
  })
}
