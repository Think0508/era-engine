// 注释：陷落前提——查角色 talent 是否有爱情系(201-204)或隶属系(211-214)

import { entitySystem } from '../../../core/entity-system'

const LOVE_TALENTS = [201, 202, 203, 204]
const SUB_TALENTS = [211, 212, 213, 214]

export function registerFallPremises(registry: any): void {
  // 注释：FALL_LEVEL_GE_1~4：陷落链等级≥指定值
  for (let level = 1; level <= 4; level++) {
    const id = `FALL_LEVEL_GE_${level}` as const
    registry.register(id, (ctx: any) => {
      const charId = ctx.selectedCharacterId ?? ctx.uiStore?.selectedCharacterId
      if (!charId) return false
      return getFallLevel(charId) >= level
    })
  }
}

// 注释：获取陷落等级（0=未陷落，1-4=爱情/隶属）
export function getFallLevel(charId: string): number {
  const char = entitySystem.get('character', charId) as any
  if (!char?.talents) return 0

  // 注释：查爱情系 talent（201-204）
  for (let i = 0; i < LOVE_TALENTS.length; i++) {
    if (char.talents[LOVE_TALENTS[i]]) return i + 1
  }
  // 注释：查隶属系 talent（211-214）
  for (let i = 0; i < SUB_TALENTS.length; i++) {
    if (char.talents[SUB_TALENTS[i]]) return -(i + 1)
  }
  return 0
}
