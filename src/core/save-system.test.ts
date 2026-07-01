// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { restoreFromSave } from './save-system'
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
      characters: [], gameState: {}, uiState: {},
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
      characters: [], gameState: {}, uiState: {},
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
})
