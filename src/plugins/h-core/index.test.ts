// 注释：h-core body_item 归还语义测试（2026-08-12 Task 3，grill Q4 定案）
// 装槽占用（equip 扣背包）→ 手动卸下归还（unequip +1）→ H 结束 h_end 归还（+1）
import { describe, it, expect, beforeAll } from 'vitest'
import { modLoader } from '../../core/mod-loader'
import { entitySystem } from '../../core/entity-system'
import { apiSystem } from '../../core/api'
import { eventBus } from '../../core/event-bus'
import { gameContext } from '../../core/game-context'
import { bindingResolver } from '../../core/binding-resolver'
import { PluginManager } from '../../core/plugin-manager'
import { SlotRegistry } from '../../ui/slots/slot-registry'
import { commandRegistry } from '../../core/command-registry'
import { errorReporter } from '../../core/error-reporter'

async function bootPlugins() {
  const pluginManager = new PluginManager(apiSystem, eventBus, new SlotRegistry(), commandRegistry)
  const pluginModules = import.meta.glob('/src/plugins/*/index.ts', { eager: true }) as Record<string, any>
  const pluginTomls = import.meta.glob('/src/plugins/*/plugin.toml', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
  const enginePlugins = new Map<string, { toml: string; module?: any }>()
  for (const [path, toml] of Object.entries(pluginTomls)) {
    const dirName = path.match(/\/src\/plugins\/([^/]+)\//)?.[1]
    if (!dirName) continue
    enginePlugins.set(dirName, { toml, module: pluginModules[`/src/plugins/${dirName}/index.ts`] ?? undefined })
  }
  await pluginManager.loadPlugins(enginePlugins, new Map())
}

describe('body_item 归还语义', () => {
  beforeAll(async () => {
    entitySystem.clear()
    commandRegistry.clear()
    errorReporter.clear()
    await modLoader.loadMod('test-mod')
    const mod = modLoader.getMod()
    if (!mod) throw new Error('模组加载失败')
    bindingResolver.loadBindings(mod.bindings)
    await bootPlugins()
    gameContext.setPlayer('player')
    for (const id of ['toy1', 'toy2', 'toy3', 'gift_target']) {
      entitySystem.register('character', id, { id, name: id, inventory: [], base: { hp: 100 } })
    }
  })

  // 注释：body_item 归还语义（2026-08-12 Task 3，grill Q4 定案）
  function charWithToy(id: string) {
    const ch = entitySystem.get('character', id) as any
    if (!ch) return
    ch.inventory = [{ itemId: '乳头夹', count: 2 }]
    ch.body_items = {}
  }

  it('装槽占用：body_item_equip 扣背包 1，物品进槽', async () => {
    charWithToy('toy1')
    await apiSystem.call('effect-system', 'execute', [
      { type: 'body_item_equip', params: { slot: 0 } },
    ], { sourceId: 'toy1', _itemId: '乳头夹', _targetIds: ['toy1'] })
    const ch = entitySystem.get('character', 'toy1') as any
    expect(ch.inventory.find((i: any) => i.itemId === '乳头夹').count).toBe(1)
    expect(ch.body_items['0'].itemId).toBe('乳头夹')
  })

  it('手动卸下归还：body_item_unequip → 背包 +1，槽清空', async () => {
    charWithToy('toy2')
    await apiSystem.call('effect-system', 'execute', [
      { type: 'body_item_equip', params: { slot: 0 } },
    ], { sourceId: 'toy2', _itemId: '乳头夹', _targetIds: ['toy2'] })
    await apiSystem.call('effect-system', 'execute', [
      { type: 'body_item_unequip', params: { slot: 0 } },
    ], { sourceId: 'toy2', _targetIds: ['toy2'] })
    const ch = entitySystem.get('character', 'toy2') as any
    expect(ch.body_items['0']).toBeUndefined()
    expect(ch.inventory.find((i: any) => i.itemId === '乳头夹').count).toBe(2)
  })

  it('H 结束清理 h_end 玩具 → 回背包（挤奶器）', async () => {
    const ch = entitySystem.get('character', 'toy3') as any
    if (!ch) return
    ch.inventory = [{ itemId: '挤奶器', count: 1 }]
    ch.body_items = { '4': { itemId: '挤奶器', active: true } }
    ch.h_state = { is_h: true, insert_position: -1 }
    // 触发 endHScene——h-core 在 onEnable 注册了 API：apiSystem.call('h-core', 'endHScene', playerId)
    // （h-npc-ai.test.ts / sleep-system.test.ts 同款驱动方式）
    await apiSystem.call('h-core', 'endHScene', 'player')
    const after = entitySystem.get('character', 'toy3') as any
    expect(after.body_items['4']).toBeUndefined()
    expect(after.inventory.find((i: any) => i.itemId === '挤奶器').count).toBe(2)
  })

  // 注释：礼物基础版（2026-08-12 Task 6，erArk 22-礼物与咖啡系统.md：1.2 礼物类别/1.3 好感礼物公式）
  describe('give_gift 礼物效果', () => {
    function setupGiftChars() {
      const target = entitySystem.get('character', 'gift_target') as any
      if (!target) return
      target.base['好感度'] = 30
      target.base['信赖度'] = 0
      target.base['好意'] = 0
      target.base['愤怒'] = 80
    }

    it('favor 礼物：好感按 calcFavorability 管线增加', async () => {
      setupGiftChars()
      const target = entitySystem.get('character', 'gift_target') as any
      const before = target.base['好感度']
      await apiSystem.call('effect-system', 'execute', [
        { type: 'give_gift', params: { mode: 'favor', favor_base: 30, target: 'selected' } },
      ], { sourceId: 'player', _targetIds: ['gift_target'] })
      // calcFavorability(30) 在无状态修正时为 floor(1.0×30)=30
      expect(target.base['好感度']).toBe(before + 30)
    })

    it('apology 礼物：愤怒清零 + 好感+10 + 好意+10', async () => {
      setupGiftChars()
      const target = entitySystem.get('character', 'gift_target') as any
      await apiSystem.call('effect-system', 'execute', [
        { type: 'give_gift', params: { mode: 'apology', target: 'selected' } },
      ], { sourceId: 'player', _targetIds: ['gift_target'] })
      expect(target.base['愤怒']).toBe(0)
      expect(target.base['好感度']).toBe(40)
      expect(target.base['好意']).toBe(10)
    })
  })
})
