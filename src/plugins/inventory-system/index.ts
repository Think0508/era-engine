// 注释：inventory-system 插件——背包物品系统
// addItem/removeItem/useItem + 装备穿脱 + item 事件 + tags 驱动指令

import type { PluginContext } from '../../core/types'
import { entitySystem } from '../../core/entity-system'
import { eventBus } from '../../core/event-bus'
import { modLoader } from '../../core/mod-loader'
import { apiSystem } from '../../core/api'
import type { CommandDef } from '../../core/command-registry'
import { errorReporter } from '../../core/error-reporter'

export function onLoad(_ctx: PluginContext): void {
  // 注释：add_item/remove_item effect type 由 effect-system 核心 handler 调 inventory API
  // 这里不重复注册——effect-system 的 handler 调 ctx.api.call('inventory', 'addItem', ...)
}

export function onEnable(ctx: PluginContext): void {
  // 注释：注册 inventory API
  ctx.api.register('inventory', {
    addItem: (charId: string, itemId: string, count: number = 1): void => {
      const char = entitySystem.get('character', charId) as any
      if (!char) return
      if (!char.inventory) char.inventory = []
      const existing = char.inventory.find((i: any) => i.itemId === itemId)
      if (existing) {
        existing.count += count
      } else {
        char.inventory.push({ itemId, count })
      }
      eventBus.emit('item:added', { character: charId, itemId, count })
    },
    removeItem: (charId: string, itemId: string, count: number = 1): boolean => {
      const char = entitySystem.get('character', charId) as any
      if (!char?.inventory) return false
      const existing = char.inventory.find((i: any) => i.itemId === itemId)
      if (!existing || existing.count < count) return false
      existing.count -= count
      if (existing.count <= 0) {
        char.inventory = char.inventory.filter((i: any) => i.itemId !== itemId)
      }
      eventBus.emit('item:removed', { character: charId, itemId, count })
      return true
    },
    useItem: async (charId: string, itemId: string, targetId?: string): Promise<boolean> => {
      const mod = modLoader.getMod()
      const itemDef = mod?.items[itemId]
      if (!itemDef) {
        errorReporter.report({
          source: 'inventory-system',
          severity: 'warning',
          message: `物品 '${itemId}' 不存在`,
        })
        return false
      }
      // 注释：消耗语义（grill 定案）——consume 默认 true：先扣 1（数量不足则不执行效果）
      // ⚠️ 双扣陷阱注记（final review）：consume=true 已在此扣 1，物品 effects 里若再含扣减类
      // 效果（如 body_item_equip 从背包再扣 1）会造成双扣。当前无调用方走此路（h-core 装玩具
      // 不经 useItem），mod 作者勿在 effects 里重复扣减——装槽类物品建议 consume=false。
      const consume = itemDef.consume !== false
      if (consume) {
        const removed = await apiSystem.call('inventory', 'removeItem', charId, itemId, 1)
        if (!removed) return false
      }
      // 注释：执行物品定义的 effects（effect-system）；targetId 优先（h_drug 给目标用药等）
      if (itemDef.effects) {
        await apiSystem.call('effect-system', 'execute', itemDef.effects, {
          sourceId: charId,
          _targetIds: [targetId ?? charId],
        })
      }
      eventBus.emit('item:used', { character: charId, itemId, targetId })
      return true
    },
    getInventory: (charId: string): any[] => {
      const char = entitySystem.get('character', charId) as any
      return char?.inventory ?? []
    },
    // 注释：装备穿着——从背包移除 + 设 equipment 字段
    equip: (charId: string, itemId: string, slot: string): void => {
      const char = entitySystem.get('character', charId) as any
      if (!char) return
      // 注释：从背包移除
      if (char.inventory) {
        const item = char.inventory.find((i: any) => i.itemId === itemId)
        if (item) {
          item.count--
          if (item.count <= 0) {
            char.inventory = char.inventory.filter((i: any) => i.itemId !== itemId)
          }
        }
      }
      // 注释：设 equipment 字段
      if (!char.equipment) char.equipment = {}
      char.equipment[slot] = itemId
      eventBus.emit('character:changed', { id: charId })
    },
    // 注释：装备卸下——反向
    unequip: (charId: string, slot: string): void => {
      const char = entitySystem.get('character', charId) as any
      if (!char?.equipment) return
      const itemId = char.equipment[slot]
      if (!itemId) return
      delete char.equipment[slot]
      // 注释：放回背包
      if (!char.inventory) char.inventory = []
      const existing = char.inventory.find((i: any) => i.itemId === itemId)
      if (existing) {
        existing.count++
      } else {
        char.inventory.push({ itemId, count: 1 })
      }
      eventBus.emit('character:changed', { id: charId })
    },
  })

  // 注释：tags 驱动指令注册——有 has_shop tag 显示交易，有 has_gather 显示采集
  // ⚠️ 标记（2026-08-09）：tags 驱动指令系统未做完——仅 gather 占位（无交易指令、
  // 回血丹硬编码未校验物品存在）。依赖 inventory tags 驱动指令系统补齐（勿局部修补）。
  const gatherCmd: CommandDef = {
    id: 'gather',
    label: '采集',
    group: 'location_commands',
    modes: ['exploration'],
    priority: 50,
    condition: 'location.tags.has_gather == true',
    source: 'plugin:inventory-system',
    handler: async (execCtx: any) => {
      // TODO: 完整采集逻辑——正式采集管线后续规划，当前给回血丹作占位
      const charId = execCtx?.gameStore?.player?.id
      if (charId) {
        await apiSystem.call('inventory', 'addItem', charId, '回血丹', 1)
      }
    },
  }
  ctx.commands.register(gatherCmd)
}
