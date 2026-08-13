// 注释：character-system 插件——角色属性管理、生命周期、character API
// 职责：初始化角色 current_location、离线/在线生命周期、character API
// （getLocation/moveTo/关系/离线/属性读写）。不注册任何指令——纯服务插件
// 瘦身（2026-08-10 npc-ai-system 归位）：AI 移动 → npc-ai-system（行为块模型）；
// NPC spawns（npc.toml 路人生成）→ npc-ai-system；每日欲望增长 → npc-ai-system
// （原 core newday-settle 归位）。本插件只保留属性/生命周期/API 服务。

import type { PluginContext, EntityData } from '../../core/types'
import { entitySystem } from '../../core/entity-system'
import { bindingResolver } from '../../core/binding-resolver'
import { setEntityPath, ATTR } from '../../core/entity-utils'
import { eventBus } from '../../core/event-bus'
import { modLoader } from '../../core/mod-loader'
import { errorReporter } from '../../core/error-reporter'
import { resolveRelationPanel, resolveRelationAddress } from '../../core/relation-display'

// 注释：关系三档字符串映射（关系系统 v2）——与 mod-loader 的转换一致
const RELATION_SENTIMENT_MAP: Record<string, number> = { '正面': 1, '中立': 0, '负面': -1 }

// 注释：onLoad——character-system 无需提前声明
export function onLoad(_ctx: PluginContext): void {
}

// 注释：onEnable——初始化角色位置 + 注册 API + 监听事件
export function onEnable(ctx: PluginContext): void {
  // 注释：1. 初始化所有角色 current_location（home_locations 最高权重）
  initCharacterLocations()

  // 注释：2. 注册 character API
  ctx.api.register('character', {    // 注释：获取某地点的角色列表
    getCharactersAt: (locationId: string): EntityData[] => {
      const result: EntityData[] = []
      for (const char of entitySystem.getAll('character')) {
        if ((char as any).current_location === locationId) {
          result.push(char)
        }
      }
      return result
    },
    // 注释：获取角色当前地点
    getLocation: (charId: string): string | null => {
      const char = entitySystem.get('character', charId) as any
      return char?.current_location ?? null
    },
    // 注释：bindings 读写便捷封装
    getAttribute: (charId: string, attr: string): any => {
      return bindingResolver.get(charId, attr)
    },
    setAttribute: (charId: string, attr: string, value: any): void => {
      bindingResolver.set(charId, attr, value)
      // 注释：修改后 emit character:changed
      eventBus.emit('character:changed', { id: charId })
    },
    // 注释：直接修改角色字段（abilities/talents/factions 等非 attribute）
    setField: (charId: string, path: string, value: any): void => {
      const char = entitySystem.get('character', charId) as any
      if (!char) return
      // 注释：按点路径设置字段（如 "abilities.华山剑法"）——
      // 2026-08-13 审计：原重复实现（`if (!obj[parts[i]]) obj[parts[i]] = {}`）会把
      // 中间路径的 0/空串覆盖成 {}（静默破坏数据）——统一走 entity-utils setEntityPath
      setEntityPath(char, path, value)
      eventBus.emit('character:changed', { id: charId })
    },
    // 注释：角色关系（关系系统 v2）——有向、多关系；kind=relation 三档（-1/0/1 或 字符串）
    getRelation: (charId: string, targetId: string, relationType: string): number => {
      const char = entitySystem.get('character', charId) as any
      return char?.relations?.[targetId]?.[relationType] ?? 0
    },
    // 注释：设置关系——value 接受数值（sentiment 任意数；relation 型 -1/0/1）
    // 或字符串档位（"正面"/"中立"/"负面"，仅 relation 型）。新类型 → relation:added；
    // 已存在类型 → relation:changed。payload 带 panel（成对名）/address（单方称呼）。
    setRelation: (charId: string, targetId: string, relationType: string, value: number | string): void => {
      const char = entitySystem.get('character', charId) as any
      if (!char) return
      const def = modLoader.getMod()?.relationTypes?.[relationType]
      let numValue: number
      if (typeof value === 'string') {
        // 字符串档位：三档 map 转换（kind=relation）；sentiment 型明确报错；
        // def 未知（测试/未定义类型）时按三档宽松处理
        const mapped = RELATION_SENTIMENT_MAP[value]
        if (mapped === undefined) {
          errorReporter.report({
            source: 'character-system',
            severity: 'error',
            message: `关系 '${relationType}' 的档位值 '${value}' 非法（只接受 正面/中立/负面 或 1/0/-1）`,
          })
          return
        }
        if (def?.kind === 'sentiment') {
          errorReporter.report({
            source: 'character-system',
            severity: 'error',
            message: `关系 '${relationType}' 是数值型（kind=sentiment），不接受字符串档位`,
          })
          return
        }
        numValue = mapped
      } else {
        numValue = value
      }
      if (!char.relations) char.relations = {}
      if (!char.relations[targetId]) char.relations[targetId] = {}
      const existed = char.relations[targetId][relationType] !== undefined
      char.relations[targetId][relationType] = numValue
      const display = relationDisplayOf(charId, targetId, relationType)
      eventBus.emit(existed ? 'relation:changed' : 'relation:added', {
        character: charId,
        target: targetId,
        type: relationType,
        sentiment: numValue,
        panel: display.panel,
        address: display.address,
      })
      eventBus.emit('character:changed', { id: charId })
    },
    // 注释：删除关系条目（解除关系——与设 0=中立 区分）。发 relation:removed。
    removeRelation: (charId: string, targetId: string, relationType: string): void => {
      const char = entitySystem.get('character', charId) as any
      if (!char?.relations?.[targetId]) return
      if (char.relations[targetId][relationType] === undefined) return
      delete char.relations[targetId][relationType]
      if (Object.keys(char.relations[targetId]).length === 0) {
        delete char.relations[targetId]
      }
      const display = relationDisplayOf(charId, targetId, relationType)
      eventBus.emit('relation:removed', {
        character: charId,
        target: targetId,
        type: relationType,
        panel: display.panel,
        address: display.address,
      })
      eventBus.emit('character:changed', { id: charId })
    },
    // 注释：关系称呼（关系系统 v2）——panel 成对名（关系面板显示）/ address 单方称呼
    getRelationPanel: (charId: string, targetId: string, relationType: string): string => {
      return relationDisplayOf(charId, targetId, relationType).panel
    },
    getRelationAddress: (charId: string, targetId: string, relationType: string): string => {
      return relationDisplayOf(charId, targetId, relationType).address
    },
    // 注释：强制移动角色（AI 或脚本用）
    moveTo: (charId: string, locationId: string): void => {
      const char = entitySystem.get('character', charId) as any
      if (!char) return
      char.current_location = locationId
      eventBus.emit('character:changed', { id: charId })
    },
    // 注释：角色离线生命周期（2026-08-10 前置）——离线 = 角色从活动世界消失
    // （装袋搬走/外勤/逃跑等未来指令的落点）。通用契约：只清位置 + 发事件，
    // 各"在场活动状态"属主（follow/h-core/status…）监听 character:offline 清自己的领域。
    setOffline: (charId: string, reason?: string): void => {
      const char = entitySystem.get('character', charId) as any
      if (!char) return
      if (char.sp_flag?.offline) return // 幂等
      if (!char.sp_flag) char.sp_flag = {}
      char.sp_flag.offline = true
      char.current_location = null
      eventBus.emit('character:offline', { id: charId, reason })
      eventBus.emit('character:changed', { id: charId })
    },
    // 注释：恢复在线——缺省位置用 home_locations 最高权重
    setOnline: (charId: string, locationId?: string): void => {
      const char = entitySystem.get('character', charId) as any
      if (!char) return
      if (!char.sp_flag?.offline) return // 幂等
      char.sp_flag.offline = false
      char.current_location = locationId ?? pickBestHomeLocation(char)
      eventBus.emit('character:online', { id: charId })
      eventBus.emit('character:changed', { id: charId })
    },
    // 注释：查询角色是否离线
    isOffline: (charId: string): boolean => {
      const char = entitySystem.get('character', charId) as any
      return char?.sp_flag?.offline === true
    },
  })
}

// 注释：初始化所有角色 current_location——home_locations 按权重选最高
function initCharacterLocations(): void {
  for (const char of entitySystem.getAll('character')) {
    const c = char as any
    if (c.current_location) continue // 注释：已有值跳过（读档情况）
    // 注释：离线角色不重放回地图（读档/启动时 sp_flag.offline 持久化）
    if (c.sp_flag?.offline) continue
    const best = pickBestHomeLocation(c)
    if (best) c.current_location = best
  }
}

// 注释：选 home_locations 权重最高的地点（null = 无 home_locations）
function pickBestHomeLocation(c: any): string | null {
  const homeLocations = c.behavior?.home_locations
  if (!homeLocations) return null
  let bestLocation: string | null = null
  let bestWeight = -1
  for (const [locId, weight] of Object.entries(homeLocations)) {
    if ((weight as number) > bestWeight) {
      bestWeight = weight as number
      bestLocation = locId
    }
  }
  return bestLocation
}

// 注释：关系称呼生成（关系系统 v2）——按 类型 → pair 词表 + 端 + 双方性别 生成
// panel 成对名（关系面板显示，big 词+small 词组合）+ address 单方称呼（口上 {relation_display}）
// 纯类型（无 pair）：panel/address = 类型显示名
function relationDisplayOf(charId: string, targetId: string, relationType: string): { panel: string; address: string } {
  const mod = modLoader.getMod()
  const def = mod?.relationTypes?.[relationType]
  const pair = def?.pair ? mod?.relationPairs?.[def.pair] : undefined
  const genderOf = (id: string): number => {
    const c = entitySystem.get('character', id) as any
    return c?.base?.[ATTR.SEX] ?? 0
  }
  if (!pair) {
    // 纯类型（无端对词表）：panel/address 都用类型显示名
    const name = def?.name ?? relationType
    return { panel: name, address: name }
  }
  if (!def?.side) {
    // 对称类型（夫妻/恋人）：panel 固定；address 按 charId 性别（丈夫/妻子）
    return {
      panel: typeof pair.panel === 'string' ? pair.panel : relationType,
      address: resolveRelationAddress(pair, null, genderOf(charId)),
    }
  }
  // 端对型：charId 是 side 端（big/small）
  const charGender = genderOf(charId)
  const targetGender = genderOf(targetId)
  const bigGender = def.side === 'big' ? charGender : targetGender
  const smallGender = def.side === 'big' ? targetGender : charGender
  return {
    panel: resolveRelationPanel(pair, { bigGender, smallGender }),
    address: resolveRelationAddress(pair, def.side, charGender),
  }
}

