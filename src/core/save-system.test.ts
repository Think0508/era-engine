// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { restoreFromSave, migrateSaveData, registerGameStateProvider, getGameStateProviders } from './save-system'
import { entitySystem } from './entity-system'
import { gameContext } from './game-context'
import { narrativeLog } from './narrative-log'
import { modLoader } from './mod-loader'

// 注释：save-system 测试——跳过 Dexie(IndexedDB) 依赖的测试
// Dexie 在 happy-dom 环境中不可用，只在浏览器中完整测试

describe('save-system', () => {
  beforeEach(() => {
    entitySystem.clear()
    gameContext.reset()
    narrativeLog.clear()
    localStorage.clear()
  })

  it('restoreFromSave restores characters', () => {
    const data = {
      modId: 'test', modVersion: '1.0.0',
      gameTime: { minute: 0, hour: 8, day: 1, month: 1, year: 1 },
      characters: [{ id: 'player', name: '玩家', base: { hp: 100 } }],
      gameState: {},
      uiState: { foldStates: { status: true } },
    }
    restoreFromSave(data)
    const player = entitySystem.get('character', 'player')
    expect(player).not.toBeNull()
    expect(player?.name).toBe('玩家')
  })

  // 注释：读档后地点系统恢复（audit-a C2）——restoreFromSave 曾清掉 location 池且不恢复
  // 当前地点 → 读档后移动静默无操作 / moveTo 抛"当前地点未设置"
  it('restoreFromSave 恢复 location 实体与当前地点，读档后 moveTo 不抛错', async () => {
    await modLoader.loadMod('test-mod')
    const data = {
      modId: 'test-mod', modVersion: '1.0.0',
      gameTime: { minute: 0, hour: 8, day: 1, month: 1, year: 1 },
      characters: [{
        id: 'player', name: '玩家', base: { hp: 100 },
        current_location: 'tavern',
      }],
      gameState: {},
      uiState: { foldStates: {} },
    }
    restoreFromSave(data)
    // location 实体池恢复（entitySystem.clear() 清空了两池，此前只重注册 character）
    expect(entitySystem.get('location', 'tavern')).not.toBeNull()
    expect(entitySystem.get('location', 'town_square')).not.toBeNull()
    // 当前地点从玩家 current_location 恢复
    expect(gameContext.getContext().location?.id).toBe('tavern')
    // 读档后移动不抛错（此前 location 为 null → moveTo 抛"当前地点未设置"）
    await expect(gameContext.moveTo('town_square')).resolves.toBeUndefined()
    expect(gameContext.getContext().location?.id).toBe('town_square')
  })

  it('restoreFromSave：玩家无 current_location → 用 mod starting_location 兜底', async () => {
    await modLoader.loadMod('test-mod')
    const data = {
      modId: 'test-mod', modVersion: '1.0.0',
      gameTime: { minute: 0, hour: 8, day: 1, month: 1, year: 1 },
      characters: [{ id: 'player', name: '玩家', base: { hp: 100 } }],
      gameState: {},
      uiState: { foldStates: {} },
    }
    restoreFromSave(data)
    expect(gameContext.getContext().location?.id).toBe('town_square')
  })

  it('restoreFromSave：无 mod 时 location 恢复静默跳过（既有行为保持）', () => {
    ;(modLoader as any).loadedMod = null
    const data = {
      modId: 'nonexistent', modVersion: '1.0.0',
      gameTime: { minute: 0, hour: 8, day: 1, month: 1, year: 1 },
      characters: [{ id: 'player', name: '玩家', base: { hp: 100 }, current_location: 'tavern' }],
      gameState: {},
      uiState: { foldStates: {} },
    }
    expect(() => restoreFromSave(data)).not.toThrow()
    expect(gameContext.getContext().location).toBeNull()
  })

  it('localStorage save/load roundtrip', () => {
    const data = {
      modId: 'test', modVersion: '1.0.0',
      gameTime: { minute: 0, hour: 8, day: 1, month: 1, year: 1 },
      characters: [], gameState: {}, uiState: { foldStates: {} },
    }
    localStorage.setItem('save:test_slot1', JSON.stringify(data))
    const loaded = JSON.parse(localStorage.getItem('save:test_slot1')!)
    expect(loaded.modId).toBe('test')
    expect(loaded.modVersion).toBe('1.0.0')
  })

  it('export produces correct JSON', () => {
    const data = {
      modId: 'test', modVersion: '1.0.0',
      gameTime: { minute: 0, hour: 8, day: 1, month: 1, year: 1 },
      characters: [], gameState: {}, uiState: { foldStates: {} },
    }
    localStorage.setItem('save:test_export', JSON.stringify(data))
    const raw = localStorage.getItem('save:test_export')
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw!)
    expect(parsed.modId).toBe('test')
  })

  it('H mode detection works', async () => {
    await gameContext.enterMode('h_scene')
    expect(gameContext.getCurrentMode()).toBe('h_scene')
    await gameContext.exitMode()
    expect(gameContext.getCurrentMode()).toBe('exploration')
  })

  it('migrateSaveData renames field（平铺 steps，audit-f 新格式）', () => {
    const data = {
      modId: 'test', modVersion: '1.0.0',
      gameTime: { minute: 0, hour: 8, day: 1, month: 1, year: 1 },
      characters: [{ id: 'char', base: { hp: 100 } }],
      gameState: {}, uiState: { foldStates: {} },
    }
    const result = migrateSaveData(data, [
      { rename: { old: 'hp', new: 'hit_point' } },
    ])
    expect(result.characters[0].base?.hp).toBeUndefined()
    expect(result.characters[0].base?.hit_point).toBe(100)
    // 迁移后版本 = 当前 mod 版本（无 mod 时保持原版本）
    expect(result.modVersion).toBe(modLoader.getMod()?.version ?? '1.0.0')
  })

  it('migrateSaveData sets default（幂等：已有字段跳过）', () => {
    const data = {
      modId: 'test', modVersion: '1.0.0',
      gameTime: { minute: 0, hour: 8, day: 1, month: 1, year: 1 },
      characters: [{ id: 'char', base: { hp: 100 } }],
      gameState: {}, uiState: { foldStates: {} },
    }
    const result = migrateSaveData(data, [
      { default: { field: 'base.new_attr', value: 50 } },
      { default: { field: 'base.new_attr', value: 99 } }, // 已存在 → 不覆盖
    ])
    expect(result.characters[0].base?.new_attr).toBe(50)
  })

  it('migrateSaveData 链式迁移（多 step 顺序执行，无版本断链）', () => {
    const data = {
      modId: 'test', modVersion: '1.0.0',
      gameTime: { minute: 0, hour: 8, day: 1, month: 1, year: 1 },
      characters: [{ id: 'char', base: { hp: 100, other: 1 } }],
      gameState: {}, uiState: { foldStates: {} },
    }
    const result = migrateSaveData(data, [
      { rename: { old: 'hp', new: 'hit_point' } },
      { rename: { old: 'hit_point', new: 'health' } },
    ])
    expect(result.characters[0].base?.health).toBe(100)
    expect(result.characters[0].base?.hit_point).toBeUndefined()
  })

  describe('gameState providers', () => {
    it('registers and lists providers', () => {
      const p = { id: 'p1', serialize: () => ({ a: 1 }), restore: () => {} }
      registerGameStateProvider(p)
      expect(getGameStateProviders().some(x => x.id === 'p1')).toBe(true)
    })

    it('restoreFromSave dispatches to providers by id', () => {
      const calls: string[] = []
      registerGameStateProvider({
        id: 'test-provider',
        serialize: () => ({ value: 42 }),
        restore: (data) => { calls.push(`restored:${data?.value}`) },
      })
      const data = {
        modId: 'test', modVersion: '1.0.0',
        gameTime: { minute: 0, hour: 8, day: 1, month: 1, year: 1 },
        characters: [],
        gameState: { 'test-provider': { value: 42 } },
        uiState: { foldStates: {} },
      }
      restoreFromSave(data)
      expect(calls).toContain('restored:42')
    })

    it('restoreFromSave tolerates missing provider data', () => {
      let called = false
      registerGameStateProvider({
        id: 'empty-provider',
        serialize: () => ({}),
        restore: () => { called = true },
      })
      restoreFromSave({
        modId: 'test', modVersion: '1.0.0',
        gameTime: { minute: 0, hour: 8, day: 1, month: 1, year: 1 },
        characters: [], gameState: {}, uiState: { foldStates: {} },
      })
      expect(called).toBe(true)
    })
  })
})
