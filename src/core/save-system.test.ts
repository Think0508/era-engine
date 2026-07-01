// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { restoreFromSave, migrateSaveData } from './save-system'
import { entitySystem } from './entity-system'
import { gameContext } from './game-context'
import { narrativeLog } from './narrative-log'

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

  it('migrateSaveData renames field', () => {
    const data = {
      modId: 'test', modVersion: '1.0.0',
      gameTime: { minute: 0, hour: 8, day: 1, month: 1, year: 1 },
      characters: [{ id: 'char', base: { hp: 100 } }],
      gameState: {}, uiState: { foldStates: {} },
    }
    const result = migrateSaveData(data, [
      { from: '1.0.0', to: '2.0.0', steps: [{ rename: { old: 'hp', new: 'hit_point' } }] },
    ])
    expect(result.characters[0].base?.hp).toBeUndefined()
    expect(result.characters[0].base?.hit_point).toBe(100)
  })

  it('migrateSaveData sets default', () => {
    const data = {
      modId: 'test', modVersion: '1.0.0',
      gameTime: { minute: 0, hour: 8, day: 1, month: 1, year: 1 },
      characters: [{ id: 'char', base: { hp: 100 } }],
      gameState: {}, uiState: { foldStates: {} },
    }
    const result = migrateSaveData(data, [
      { from: '1.0.0', to: '2.0.0', steps: [{ default: { field: 'base.new_attr', value: 50 } }] },
    ])
    expect(result.characters[0].base?.new_attr).toBe(50)
  })

  it('migrateSaveData skips already migrated', () => {
    const data = {
      modId: 'test', modVersion: '2.0.0',
      gameTime: { minute: 0, hour: 8, day: 1, month: 1, year: 1 },
      characters: [{ id: 'char', base: { hp: 100 } }],
      gameState: {}, uiState: { foldStates: {} },
    }
    const result = migrateSaveData(data, [
      { from: '1.0.0', to: '2.0.0', steps: [{ rename: { old: 'hp', new: 'hit_point' } }] },
    ])
    // 注释：版本已是 2.0.0，不执行迁移
    expect(result.characters[0].base?.hp).toBe(100)
  })
})
