// 注释：叙事输出——NPC 行为开始/移动消息，仅玩家同地点时输出（erArk show_info_flag：
// `character_data.position == cache.character_data[0].position` 同图检查）
// 模板：行为规格的 narrative 字段（{name} = 角色名，{place} = 目标地点名）；
// 无自定义模板时用类型默认模板（数据缺省，非叙事场景静默）

import { gameContext } from '../../core/game-context'
import { narrativeLog } from '../../core/narrative-log'
import { modLoader } from '../../core/mod-loader'
import type { BehaviorBlock, BehaviorSpec } from './types'

// 注释：类型默认叙事模板（可被行为规格 narrative 覆盖）
const DEFAULT_NARRATIVES: Record<string, string> = {
  move: '{name}前往{place}。',
  rest: '{name}找了个地方休息。',
  sleep: '{name}睡着了。',
  work: '{name}开始工作。',
  entertainment: '{name}去消遣了。',
  wander: '{name}四处闲逛。',
  socialize: '{name}去找人聊天。',
}

export function getBehaviorSpec(specId: string): BehaviorSpec | undefined {
  const mod = modLoader.getMod() as any
  return mod?.aiBehaviors?.[specId] as BehaviorSpec | undefined
}

// 注释：行为开始叙事——玩家与 NPC 同地点才输出；返回是否输出了
export function narrateBehaviorStart(char: any, block: BehaviorBlock): boolean {
  const playerLoc = gameContext.getContext().location?.id
  if (!playerLoc || char.current_location !== playerLoc) return false
  const spec = getBehaviorSpec(block.id)
  let template = spec?.narrative
  if (!template) {
    template = DEFAULT_NARRATIVES[block.type]
    if (!template) return false
  }
  // 注释：{place} 占位——目标地点名（move 的终点/所在位置）
  let text = template.replaceAll('{name}', char.name ?? char.id)
  if (text.includes('{place}')) {
    let placeName = ''
    if (block.target) {
      const loc = gameContext.getContext().getEntity('location', block.target) as any
      placeName = loc?.name ?? block.target
    }
    text = text.replaceAll('{place}', placeName)
  }
  narrativeLog.write(text, 'npc', 'npc-ai-system')
  return true
}
