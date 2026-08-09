// 注释：character-system 插件——角色属性管理、AI移动、NPC生成
// 职责：初始化角色 current_location、AI 移动、NPC spawns、character API
// 不注册任何指令——纯服务插件

import type { PluginContext, EntityData } from '../../core/types'
import { entitySystem } from '../../core/entity-system'
import { bindingResolver } from '../../core/binding-resolver'
import { eventBus } from '../../core/event-bus'
import { modLoader, finalizeCharacterData } from '../../core/mod-loader'

// 注释：onLoad——character-system 无需提前声明
export function onLoad(_ctx: PluginContext): void {
}

// 注释：onEnable——初始化角色位置 + 注册 API + 监听事件
export function onEnable(ctx: PluginContext): void {
  // 注释：1. 初始化所有角色 current_location（home_locations 最高权重）
  initCharacterLocations()

  // 注释：2. 注册 character API
  ctx.api.register('character', {
    // 注释：获取某地点的角色列表
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
      // 注释：按点路径设置字段（如 "abilities.华山剑法"）
      const parts = path.split('.')
      let obj = char
      for (let i = 0; i < parts.length - 1; i++) {
        if (!obj[parts[i]]) obj[parts[i]] = {}
        obj = obj[parts[i]]
      }
      obj[parts[parts.length - 1]] = value
      eventBus.emit('character:changed', { id: charId })
    },
    // 注释：角色关系
    getRelation: (charId: string, targetId: string, relationType: string): number => {
      const char = entitySystem.get('character', charId) as any
      return char?.relations?.[targetId]?.[relationType] ?? 0
    },
    setRelation: (charId: string, targetId: string, relationType: string, value: number): void => {
      const char = entitySystem.get('character', charId) as any
      if (!char) return
      if (!char.relations) char.relations = {}
      if (!char.relations[targetId]) char.relations[targetId] = {}
      char.relations[targetId][relationType] = value
      eventBus.emit('character:changed', { id: charId })
    },
    // 注释：强制移动角色（AI 或脚本用）
    moveTo: (charId: string, locationId: string): void => {
      const char = entitySystem.get('character', charId) as any
      if (!char) return
      char.current_location = locationId
      eventBus.emit('character:changed', { id: charId })
    },
  })

  // 注释：3. 监听 game:hour_changed → AI 移动
  ctx.events.on('game:hour_changed', (payload: any) => {
    handleAiMovement(payload?.hour ?? 0)
  })

  // 注释：4. 监听 location:enter → NPC spawns
  ctx.events.on('location:enter', (payload: any) => {
    handleNpcSpawns(payload?.to)
  })
}

// 注释：初始化所有角色 current_location——home_locations 按权重选最高
function initCharacterLocations(): void {
  for (const char of entitySystem.getAll('character')) {
    const c = char as any
    if (c.current_location) continue // 注释：已有值跳过（读档情况）
    const homeLocations = c.behavior?.home_locations
    if (!homeLocations) continue
    // 注释：选权重最高的 home_location
    let bestLocation: string | null = null
    let bestWeight = -1
    for (const [locId, weight] of Object.entries(homeLocations)) {
      if ((weight as number) > bestWeight) {
        bestWeight = weight as number
        bestLocation = locId
      }
    }
    if (bestLocation) {
      c.current_location = bestLocation
    }
  }
}

// 注释：AI 移动——所有角色都处理（不只当前+相邻）
function handleAiMovement(hour: number): void {
  for (const char of entitySystem.getAll('character')) {
    const c = char as any
    const behavior = c.behavior
    if (!behavior) continue
    const activity = behavior.activity ?? 0
    // 注释：activity=0 永不动
    if (activity === 0) continue
    // 注释：activity<0.3 降频——每 5 小时检查一次
    if (activity < 0.3 && hour % 5 !== 0) continue
    // 注释：概率检查
    if (Math.random() >= activity) continue

    // 注释：移动决策——time_rules 优先
    const timeRules = behavior.time_rules as any[] | undefined
    if (timeRules && timeRules.length > 0) {
      // 注释：查匹配当前 hour 的 time_rule
      const matched = timeRules.filter(
        (rule: any) => hour >= rule.hour_range[0] && hour <= rule.hour_range[1],
      )
      if (matched.length > 0) {
        // 注释：按 weight 加权随机选一个
        const target = weightedRandom(matched.map((r: any) => ({ target: r.target, weight: r.weight ?? 1 })))
        if (target) {
          c.current_location = target
          eventBus.emit('character:changed', { id: c.id })
          continue
        }
      }
    }

    // 注释：无匹配 time_rule → home_locations 加权随机
    const homeLocations = behavior.home_locations
    if (homeLocations) {
      const entries = Object.entries(homeLocations).map(([locId, weight]) => ({
        target: locId,
        weight: weight as number,
      }))
      const target = weightedRandom(entries)
      if (target) {
        c.current_location = target
        eventBus.emit('character:changed', { id: c.id })
      }
    }
  }
}

// 注释：加权随机选择
function weightedRandom(items: { target: string; weight: number }[]): string | null {
  if (items.length === 0) return null
  const total = items.reduce((sum, item) => sum + item.weight, 0)
  if (total <= 0) return items[0].target
  let r = Math.random() * total
  for (const item of items) {
    r -= item.weight
    if (r <= 0) return item.target
  }
  return items[items.length - 1].target
}

// 注释：NPC spawns——首次进入地点时随机生成路人
// TODO(phase-x): name_generator JS 脚本支持，当前只支持内联 names 列表
function handleNpcSpawns(locationId: string): void {
  if (!locationId) return
  const mod = modLoader.getMod()
  if (!mod) return

  for (const spawn of mod.npcSpawns) {
    // 注释：查 spawns 中 at_locations 包含当前地点的条目
    if (!spawn.at_locations.includes(locationId)) continue

    // 注释：检查已生成记录（game-state 实体）
    // TODO: 用 game-state 实体记录已生成 NPC，当前简化——每次都生成（测试用）
    const count = randomInt(spawn.count.min, spawn.count.max)
    for (let i = 0; i < count; i++) {
      const npcId = `npc_${locationId}_${Date.now()}_${i}`
      // 注释：用 template 实例化 + overrides
      const templates = mod.entities.get('__templates_character__')
      let npcData: EntityData = { id: npcId, template: spawn.template }
      if (templates && templates.has(spawn.template)) {
        const template = templates.get(spawn.template)
        npcData = { ...template, ...npcData }
      }
      // 注释：应用 overrides
      if (spawn.overrides) {
        npcData = { ...npcData, ...spawn.overrides }
      }
      // 注释：生成姓名
      if (spawn.names && spawn.names.length > 0) {
        npcData.name = spawn.names[randomInt(0, spawn.names.length - 1)]
      }
      npcData.current_location = locationId
      // 注释：先克隆 finalize 会触及的命名空间——template 是共享对象，浅拷贝下
      // applyAttributeDefaults 会污染模板（base 被加默认键）；克隆后各自独立
      for (const ns of ['base', 'params', 'marks', 'abilities', 'talents']) {
        if (npcData[ns] && typeof npcData[ns] === 'object') {
          npcData[ns] = { ...npcData[ns] }
        }
      }
      // 注释：契约最终化（标准角色契约 spec §10.1）——attributes 默认值落位 +
      // abilities 简写展开 + talents 初始化。此前缺失：路人 NPC 的 abilities 是裸数字
      // （.level 恒 undefined → 结算系数静默 0）、marks/params 缺默认（面板不显示）
      finalizeCharacterData(npcData, mod)
      // 注释：注册到 entity-system
      entitySystem.register('character', npcId, npcData)
    }
  }
}

// 注释：随机整数 [min, max] 含两端
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}
