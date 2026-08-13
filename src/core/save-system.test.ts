// @vitest-environment happy-dom
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import {
  restoreFromSave,
  migrateSaveData,
  registerGameStateProvider,
  getGameStateProviders,
  saveGame,
  loadGame,
  getSaveSlots,
  getSaveHead,
  deleteSave,
  autoSave,
  exportSave,
  importSave,
  loadAndRestoreSave,
  getSaveMemory,
  setSaveMemory,
  loadSaveConfig,
  SAVE_CONFIG,
  __saveDb,
  registerNoSaveMode,
} from './save-system'
import { entitySystem } from './entity-system'
import { gameContext } from './game-context'
import { narrativeLog } from './narrative-log'
import { modLoader } from './mod-loader'

// 注释：save-system 测试——Dexie(IndexedDB) 用 fake-indexeddb 提供
// 双表分离：save_heads（列表只读）+ save_data（读档才读）

function makeSaveData(overrides: Record<string, any> = {}): any {
  return {
    modId: 'test-mod',
    modVersion: '1.0.0',
    gameTime: { minute: 0, hour: 8, day: 1, month: 1, year: 1 },
    characters: [{ id: 'player', name: '玩家', base: { hp: 100 } }],
    gameState: {},
    uiState: { foldStates: {} },
    ...overrides,
  }
}

describe('save-system', () => {
  beforeEach(async () => {
    entitySystem.clear()
    gameContext.reset()
    narrativeLog.clear()
    localStorage.clear()
    await __saveDb.saveHeads.clear()
    await __saveDb.saveData.clear()
    await modLoader.loadMod('test-mod')
    gameContext.setPlayer('player')
    // 注释：h-core 插件注册的 noSaveMode（测试环境无插件，手动注册模拟）
    registerNoSaveMode('h_scene')
    if (!entitySystem.get('character', 'player')) {
      entitySystem.register('character', 'player', { id: 'player', name: '玩家', base: { hp: 100 } })
    }
  })

  it('restoreFromSave restores characters', async () => {
    const data = makeSaveData()
    await restoreFromSave(data)
    const player = entitySystem.get('character', 'player')
    expect(player).not.toBeNull()
    expect(player?.name).toBe('玩家')
  })

  // 注释：读档后地点系统恢复（audit-a C2）——restoreFromSave 曾清掉 location 池且不恢复
  // 当前地点 → 读档后移动静默无操作 / moveTo 抛"当前地点未设置"
  it('restoreFromSave 恢复 location 实体与当前地点，读档后 moveTo 不抛错', async () => {
    const data = makeSaveData({
      characters: [{
        id: 'player', name: '玩家', base: { hp: 100 },
        current_location: 'tavern',
      }],
    })
    await restoreFromSave(data)
    expect(entitySystem.get('location', 'tavern')).not.toBeNull()
    expect(entitySystem.get('location', 'town_square')).not.toBeNull()
    expect(gameContext.getContext().location?.id).toBe('tavern')
    await expect(gameContext.moveTo('town_square')).resolves.toBeUndefined()
    expect(gameContext.getContext().location?.id).toBe('town_square')
  })

  it('restoreFromSave：玩家无 current_location → 用 mod starting_location 兜底', async () => {
    const data = makeSaveData({ characters: [{ id: 'player', name: '玩家', base: { hp: 100 } }] })
    await restoreFromSave(data)
    expect(gameContext.getContext().location?.id).toBe('town_square')
  })

  it('restoreFromSave：无 mod 时 location 恢复静默跳过（既有行为保持）', async () => {
    ;(modLoader as any).loadedMod = null
    const data = makeSaveData({ modId: 'nonexistent' })
    await expect(restoreFromSave(data)).resolves.not.toThrow()
    expect(gameContext.getContext().location).toBeNull()
  })

  // 注释：⚠️ 2026-08-14 第三轮审查——损坏/被篡改存档防御
  it('restoreFromSave：characters 非数组 → 明确报错（不 for...of 崩溃）', async () => {
    await expect(restoreFromSave(makeSaveData({ characters: 'oops' }) as any)).rejects.toThrow('存档数据损坏')
    await expect(restoreFromSave(null as any)).rejects.toThrow('存档数据损坏')
  })

  it('restoreFromSave：重复 id → 跳过 + 保留首个（不中断读档）', async () => {
    const data = makeSaveData({
      characters: [
        { id: 'player', name: '玩家A', base: { hp: 100 } },
        { id: 'player', name: '玩家B（重复）', base: { hp: 1 } },
        { id: 'npc_1', name: '正常NPC', base: {} },
      ],
    })
    await restoreFromSave(data)
    const player = entitySystem.get('character', 'player') as any
    expect(player.name).toBe('玩家A') // 保留首个
    expect(player.base.hp).toBe(100)
    expect(entitySystem.get('character', 'npc_1')).not.toBeNull()
  })

  it('restoreFromSave：缺 id 的角色条目 → 跳过 + warning', async () => {
    const data = makeSaveData({
      characters: [
        { id: 'player', name: '玩家', base: { hp: 100 } },
        { name: '无id条目' },
        null as any,
      ],
    })
    await restoreFromSave(data)
    expect(entitySystem.get('character', 'player')).not.toBeNull()
  })

  // 注释：双表分离——saveGame 写 head+data，getSaveSlots 只读 head，loadGame 读 data
  it('双表读写：saveGame → head 完整 + loadGame 数据一致', async () => {
    await saveGame('3', null, '手动存档')
    const heads = await getSaveSlots()
    expect(heads).toHaveLength(1)
    const head = heads[0]
    expect(head.slotId).toBe('3')
    expect(head.modId).toBe('test-mod')
    expect(head.modVersion).toBe('test-mod'.length ? modLoader.getMod()?.version : '')
    expect(head.characterName).toBe('玩家')
    expect(head.gameTime.year).toBe(1)
    expect(head.gameTime.hour).toBe(8)
    const data = await loadGame('3')
    expect(data).not.toBeNull()
    expect(data?.characters[0].id).toBe('player')
    expect(data?.uiState.foldStates).toEqual({})
  })

  it('getSaveHead：存在返回头部，不存在返回 null', async () => {
    await saveGame('5', null)
    const head = await getSaveHead('5')
    expect(head?.slotId).toBe('5')
    expect(await getSaveHead('nonexistent')).toBeNull()
  })

  it('auto 槽：autoSave 写入 auto，且 auto 槽可覆盖', async () => {
    await autoSave(null, '测试自动存档')
    const heads = await getSaveSlots()
    expect(heads.some(h => h.slotId === 'auto')).toBe(true)
    // 再次自动存 → 覆盖同一槽（不新增）
    await autoSave(null, '第二次自动存档')
    expect(await getSaveSlots()).toHaveLength(1)
  })

  it('autoSave 在 noSave 模式静默跳过', async () => {
    await gameContext.enterMode('h_scene')
    await autoSave(null)
    expect(await getSaveSlots()).toHaveLength(0)
    await gameContext.exitMode()
  })

  it('deleteSave 删除 head+data', async () => {
    await saveGame('7', null)
    await deleteSave('7')
    expect(await getSaveSlots()).toHaveLength(0)
    expect(await loadGame('7')).toBeNull()
  })

  it('saveGame 在 noSave 模式抛错（不写档）', async () => {
    await gameContext.enterMode('h_scene')
    await expect(saveGame('1', null)).rejects.toThrow('不可存档')
    expect(await getSaveSlots()).toHaveLength(0)
    await gameContext.exitMode()
  })

  // 注释：save-memory（对齐 erArk save/save_info.json last_save_page/last_save_id）
  it('save-memory roundtrip + mod 隔离', async () => {
    expect(getSaveMemory()).toEqual({ lastSavePage: 0, lastSaveId: '' })
    setSaveMemory({ lastSavePage: 2, lastSaveId: '25' })
    expect(getSaveMemory()).toEqual({ lastSavePage: 2, lastSaveId: '25' })
    expect(getSaveMemory('other-mod')).toEqual({ lastSavePage: 0, lastSaveId: '' })
  })

  // 注释：导出 = 读数据表 JSON；导入 = 校验 modId + 分配空数字槽（避开 99 崩溃槽）
  it('exportSave 返回 JSON，无档返回 null', async () => {
    expect(await exportSave('9')).toBeNull()
    await saveGame('9', null)
    const json = await exportSave('9')
    expect(json).not.toBeNull()
    expect(JSON.parse(json!).characters[0].id).toBe('player')
  })

  it('importSave：跨 mod 拒收（精准报错）', async () => {
    await expect(importSave(JSON.stringify(makeSaveData({ modId: 'other-mod' })))).rejects.toThrow('模组不匹配')
  })

  it('importSave：结构非法拒收', async () => {
    await expect(importSave('{"not":"save"}')).rejects.toThrow()
    await expect(importSave('not json')).rejects.toThrow()
  })

  it('importSave：分配空数字槽写入，避开 99 崩溃槽', async () => {
    // 注释：先把 99 槽占掉（模拟已有崩溃档）——导入应跳过 99 选 0
    await saveGame('99', null)
    const slot = await importSave(JSON.stringify(makeSaveData()))
    expect(slot).toBe('0')
    const data = await loadGame('0')
    expect(data?.characters[0].id).toBe('player')
    expect(await getSaveSlots()).toHaveLength(2)
  })

  it('importSave：槽满报错', async () => {
    // 注释：maxSave=100，跳过 99 占满 0-98
    for (let i = 0; i < 99; i++) {
      await __saveDb.saveHeads.put({
        id: `test-mod_${i}`, modId: 'test-mod', slotId: String(i), modVersion: '1.0.0',
        label: '', gameTime: { year: 1, month: 1, day: 1, hour: 8, minute: 0 }, characterName: '', saveTime: 0, createdAt: 0, updatedAt: 0,
      })
    }
    await expect(importSave(JSON.stringify(makeSaveData()))).rejects.toThrow('存档槽已满')
  })

  // 注释：loadAndRestoreSave 完整流程（loadGame → 迁移 → restore）
  it('loadAndRestoreSave：读档并恢复，返回 data 供 uiState 恢复', async () => {
    await saveGame('2', { foldStates: { status: true } })
    const data = await loadAndRestoreSave('2')
    expect(data).not.toBeNull()
    expect(data?.uiState.foldStates.status).toBe(true)
    const player = entitySystem.get('character', 'player')
    expect(player?.name).toBe('玩家')
  })

  // 注释：⚠️ 2026-08-14 第六轮审计——损坏存档：校验前置（不破坏当前世界）
  it('loadAndRestoreSave：损坏存档（characters 非数组）→ 明确报错且世界保持', async () => {
    // 先制造一个正常世界
    await saveGame('8', null)
    entitySystem.register('character', 'alive', { id: 'alive', name: '存活' })
    // 篡改存档数据
    const row = await __saveDb.saveData.get('test-mod_8')
    ;(row!.data as any).characters = 'corrupted'
    await __saveDb.saveData.put(row!)
    await expect(loadAndRestoreSave('8')).rejects.toThrow('存档数据损坏')
    // 世界未被破坏（校验在 entitySystem.clear 之前）
    expect(entitySystem.get('character', 'alive')).not.toBeNull()
    expect(entitySystem.get('character', 'player')).not.toBeNull()
  })

  it('H mode detection works', async () => {
    await gameContext.enterMode('h_scene')
    expect(gameContext.getCurrentMode()).toBe('h_scene')
    await gameContext.exitMode()
    expect(gameContext.getCurrentMode()).toBe('exploration')
  })

  describe('migrateSaveData（平铺 steps，audit-f 新格式 + summary 统计）', () => {
    it('renames field', () => {
      const result = migrateSaveData(makeSaveData({ characters: [{ id: 'char', base: { hp: 100 } }] }), [
        { rename: { old: 'hp', new: 'hit_point' } },
      ])
      expect(result.data.characters[0].base?.hp).toBeUndefined()
      expect(result.data.characters[0].base?.hit_point).toBe(100)
      expect(result.summary.renamed).toBe(1)
      // 迁移后版本 = 当前 mod 版本（无 mod 时保持原版本）
      expect(result.data.modVersion).toBe(modLoader.getMod()?.version ?? '1.0.0')
    })

    it('sets default（幂等：已有字段跳过）', () => {
      const result = migrateSaveData(makeSaveData({ characters: [{ id: 'char', base: { hp: 100 } }] }), [
        { default: { field: 'base.new_attr', value: 50 } },
        { default: { field: 'base.new_attr', value: 99 } }, // 已存在 → 不覆盖
      ])
      expect(result.data.characters[0].base?.new_attr).toBe(50)
      expect(result.summary.defaulted).toBe(1)
    })

    it('链式迁移（多 step 顺序执行，无版本断链）', () => {
      const result = migrateSaveData(makeSaveData({ characters: [{ id: 'char', base: { hp: 100, other: 1 } }] }), [
        { rename: { old: 'hp', new: 'hit_point' } },
        { rename: { old: 'hit_point', new: 'health' } },
      ])
      expect(result.data.characters[0].base?.health).toBe(100)
      expect(result.data.characters[0].base?.hit_point).toBeUndefined()
    })

    it('transform 步骤跳过（沙箱未实现）+ summary 计数', () => {
      const result = migrateSaveData(makeSaveData(), [
        { transform: { field: 'base.hp', script: 'x.js' } },
      ])
      expect(result.summary.transformsSkipped).toBe(1)
    })

    // 注释：⚠️ 2026-08-14 第七轮审计——数据完整性防护
    it('rename old===new 跳过（不静默清空字段）', () => {
      const result = migrateSaveData(makeSaveData({ characters: [{ id: 'char', base: { hp: 100 } }] }), [
        { rename: { old: 'hp', new: 'hp' } }, // 笔误迁移
      ])
      expect(result.data.characters[0].base?.hp).toBe(100)
      expect(result.summary.renamed).toBe(0)
    })

    it('default 空 field 跳过（不写脏 key）', () => {
      const result = migrateSaveData(makeSaveData({ characters: [{ id: 'char', base: { hp: 100 } }] }), [
        { default: { field: '', value: 1 } },
        { default: { field: '   ', value: 2 } },
      ])
      expect(result.summary.defaulted).toBe(0)
      const char = result.data.characters[0] as any
      expect(char['']).toBeUndefined()
    })
  })

  describe('gameState providers', () => {
    it('registers and lists providers', () => {
      const p = { id: 'p1', serialize: () => ({ a: 1 }), restore: () => {} }
      registerGameStateProvider(p)
      expect(getGameStateProviders().some(x => x.id === 'p1')).toBe(true)
    })

    it('restoreFromSave dispatches to providers by id', async () => {
      const calls: string[] = []
      registerGameStateProvider({
        id: 'test-provider',
        serialize: () => ({ value: 42 }),
        restore: (data) => { calls.push(`restored:${data?.value}`) },
      })
      await restoreFromSave(makeSaveData({ gameState: { 'test-provider': { value: 42 } } }))
      expect(calls).toContain('restored:42')
    })

    it('restoreFromSave tolerates missing provider data', async () => {
      let called = false
      registerGameStateProvider({
        id: 'empty-provider',
        serialize: () => ({}),
        restore: () => { called = true },
      })
      await restoreFromSave(makeSaveData())
      expect(called).toBe(true)
    })
  })

  describe('save config（[save] 段）', () => {
    it('缺省 100/10', () => {
      const cfg = loadSaveConfig('active_mod = "x"')
      expect(cfg).toEqual({ maxSave: 100, savePage: 10 })
    })

    it('自定义值解析', () => {
      const cfg = loadSaveConfig('[save]\nmax_save = 20\nsave_page = 5\n')
      expect(cfg).toEqual({ maxSave: 20, savePage: 5 })
    })

    it('非法值回退默认', () => {
      const cfg = loadSaveConfig('[save]\nmax_save = -1\nsave_page = 0\n')
      expect(cfg).toEqual({ maxSave: 100, savePage: 10 })
    })

    it('SAVE_CONFIG 常量存在且合法', () => {
      expect(SAVE_CONFIG.maxSave).toBeGreaterThan(0)
      expect(SAVE_CONFIG.savePage).toBeGreaterThan(0)
    })
  })
})
