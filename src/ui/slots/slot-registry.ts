// 注释：SlotRegistry 管理非指令类的 UI 插槽注册
// 插件通过 ctx.ui.registerSlot('character-list', {...}) 注册自定义组件
// 指令不走 SlotRegistry——指令走 CommandRegistry
// SlotRegistry 存储 UISlotItem，按 priority 排序，按 condition 过滤

import type { GameContext, UISlotItem } from '../../core/types'

export class SlotRegistry {
  // 注释：slotName → Map<id, UISlotItem>
  private slots = new Map<string, Map<string, UISlotItem>>()

  // 注释：注册一个插槽项，拒绝同名 slot + 同 id 重复
  register(slotName: string, item: UISlotItem): void {
    let slotMap = this.slots.get(slotName)
    if (!slotMap) {
      slotMap = new Map()
      this.slots.set(slotName, slotMap)
    }
    if (slotMap.has(item.id)) {
      throw new Error(
        `SlotRegistry: 插槽 '${slotName}' 已有 id='${item.id}' 的项，重复注册被拒绝`,
      )
    }
    slotMap.set(item.id, item)
  }

  unregister(slotName: string, id: string): void {
    const slotMap = this.slots.get(slotName)
    if (slotMap) {
      slotMap.delete(id)
    }
  }

  // 注释：返回排序后（priority 升序）且条件满足的项
  getItems(slotName: string, ctx: GameContext): UISlotItem[] {
    const slotMap = this.slots.get(slotName)
    if (!slotMap) return []
    const items: UISlotItem[] = []
    for (const item of slotMap.values()) {
      // 注释：条件函数实时求值，不满足则过滤掉
      if (!item.condition || item.condition(ctx)) {
        items.push(item)
      }
    }
    // 注释：按 priority 升序排列（数字越小越靠前）
    items.sort((a, b) => a.priority - b.priority)
    return items
  }

  clear(): void {
    this.slots.clear()
  }

  getSlotNames(): string[] {
    return Array.from(this.slots.keys())
  }
}

// 注释：provide/inject key
export const SLOT_REGISTRY_KEY = Symbol('slot-registry')
