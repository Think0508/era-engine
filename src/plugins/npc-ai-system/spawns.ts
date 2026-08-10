// 注释：NPC 生成（npc.toml 路人生成）——从 character-system 归位（2026-08-10）
// 职责：首次进入地点时按模板随机生成路人（AGENTS §25 npc.toml 格式）
// 生成后立即 initBehaviorBlock（npc-ai 行为块——不初始化则首个结算 pass 也会补，但显式初始化更干净）

import type { EntityData } from '../../core/types'
import { entitySystem } from '../../core/entity-system'
import { eventBus } from '../../core/event-bus'
import { modLoader, finalizeCharacterData } from '../../core/mod-loader'
import { initBehaviorBlock } from './behavior-block'

// 注释：NPC spawns——首次进入地点时随机生成路人
// TODO(phase-x): name_generator JS 脚本支持，当前只支持内联 names 列表
// ⚠️ 标记（2026-08-09）：NPC spawn 记录机制未做——已生成记录（game-state 实体）未实现，
// 每次进入地点都会重复生成路人（数量膨胀）。依赖 spawn 记录系统补齐（勿局部修补）。
export function handleNpcSpawns(locationId: string): void {
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
      // abilities 简写展开 + talents 初始化
      finalizeCharacterData(npcData, mod)
      // 注释：行为块初始化（npc-ai——首个结算 pass 决策行为）
      initBehaviorBlock(npcData)
      // 注释：注册到 entity-system
      entitySystem.register('character', npcId, npcData)
      eventBus.emit('character:changed', { id: npcId })
    }
  }
}

// 注释：随机整数 [min, max] 含两端
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}
