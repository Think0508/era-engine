// 注释：save-system — 存档系统（Dexie.js + IndexedDB）
// 存档全量保存所有角色，不保存 locations/definitions（从 TOML 重新加载）
// 存档权威模型：读档时角色从存档恢复，模板不覆盖存档数据
// TODO: 存档迁移（Phase 11.3）
// TODO: 自动存档

import Dexie, { type Table } from 'dexie'
import { entitySystem } from './entity-system'
import { gameContext } from './game-context'
import { narrativeLog } from './narrative-log'
import { modLoader } from './mod-loader'
import type { EntityData } from './types'

export interface SaveSlot {
  id: string        // "modId_slotId"
  modId: string
  slotId: string
  modVersion: string
  label: string
  gameTime: string
  createdAt: number
  updatedAt: number
}

export interface SaveData {
  modId: string
  modVersion: string
  gameTime: { minute: number; hour: number; day: number; month: number; year: number }
  characters: EntityData[]
  gameState: Record<string, any>
  uiState: { foldStates: Record<string, boolean> }
}

class SaveDatabase extends Dexie {
  saves!: Table<SaveSlot>

  constructor() {
    super('era-engine')
    this.version(1).stores({
      saves: 'id, modId, slotId, updatedAt',
    })
  }
}

const db = new SaveDatabase()
const MAX_AUTO_INTERVAL = 5 * 60 * 1000 // 5 minutes
let lastAutoSave = 0

// 注释：保存游戏
export async function saveGame(slotId: string, uiState: any, label?: string): Promise<void> {
  const mod = modLoader.getMod()
  if (!mod) throw new Error('no mod loaded')

  // 注释：H 中不可存档
  const mode = gameContext.getCurrentMode()
  if (mode === 'h_scene') {
    throw new Error('H 中不可存档')
  }

  const ctx = gameContext.getContext()
  const allChars = entitySystem.getAll('character')
  const data: SaveData = {
    modId: mod.id,
    modVersion: mod.version,
    gameTime: { ...ctx.time },
    characters: allChars.map(c => JSON.parse(JSON.stringify(c))),
    gameState: {},
    uiState: { foldStates: uiState?.foldStates ?? {} },
  }

  const id = `${mod.id}_${slotId}`
  const now = Date.now()
  const timeStr = `${ctx.time.year}-${ctx.time.month}-${ctx.time.day} ${ctx.time.hour}:${ctx.time.minute}`
  await db.saves.put({
    id, modId: mod.id, slotId, modVersion: mod.version,
    label: label ?? `存档 ${slotId}`,
    gameTime: timeStr,
    createdAt: now,
    updatedAt: now,
  })
  // 注释：SaveData 存到 IndexedDB 的独立 key（通过 localStorage 获取 key）
  localStorage.setItem(`save:${id}`, JSON.stringify(data))
  narrativeLog.write(`存档成功：${slotId}`, 'system', 'save-system')
}

// 注释：读档
export async function loadGame(slotId: string): Promise<SaveData | null> {
  const mod = modLoader.getMod()
  if (!mod) throw new Error('no mod loaded')
  const id = `${mod.id}_${slotId}`
  const raw = localStorage.getItem(`save:${id}`)
  if (!raw) return null
  return JSON.parse(raw) as SaveData
}

// 注释：获取所有存档列表
export async function getSaveSlots(modId?: string): Promise<SaveSlot[]> {
  if (modId) {
    return db.saves.where('modId').equals(modId).reverse().sortBy('updatedAt')
  }
  return db.saves.orderBy('updatedAt').reverse().toArray()
}

// 注释：删除存档
export async function deleteSave(slotId: string): Promise<void> {
  const mod = modLoader.getMod()
  if (!mod) throw new Error('no mod loaded')
  const id = `${mod.id}_${slotId}`
  await db.saves.delete(id)
  localStorage.removeItem(`save:${id}`)
}

// 注释：自动存档——由 bridge/location:enter/combat:start/end/new_day 触发
export async function autoSave(uiState: any, label?: string): Promise<void> {
  const now = Date.now()
  if (now - lastAutoSave < MAX_AUTO_INTERVAL) return
  // 注释：H 中不自动存档
  if (gameContext.getCurrentMode() === 'h_scene') return
  lastAutoSave = now
  await saveGame('autosave', uiState, label ?? '自动存档')
}

// 注释：从 SaveData 恢复角色到 entity-system
export function restoreFromSave(data: SaveData): void {
  entitySystem.clear()
  for (const char of data.characters) {
    entitySystem.register('character', char.id, char)
  }
  // 注释：恢复游戏时间
  gameContext.reset()
  const t = data.gameTime
  gameContext.advanceTime(0) // 触发时间初始化
  // 注释：使用内部方法设置时间
  Object.assign(gameContext.getContext().time, t)
}

// 注释：导出存档（JSON 字符串）
export function exportSave(slotId: string): string | null {
  const raw = localStorage.getItem(`save:${modLoader.getMod()?.id}_${slotId}`)
  return raw
}

// 注释：导入存档
export async function importSave(json: string): Promise<void> {
  const data = JSON.parse(json) as SaveData
  const id = `${data.modId}_imported`
  localStorage.setItem(`save:${id}`, json)
  const now = Date.now()
  await db.saves.put({
    id, modId: data.modId, slotId: 'imported', modVersion: data.modVersion,
    label: `导入存档 ${data.gameTime}`,
    gameTime: typeof data.gameTime === 'string' ? data.gameTime : `${data.gameTime.year}-${data.gameTime.month}-${data.gameTime.day}`,
    createdAt: now, updatedAt: now,
  })
}
