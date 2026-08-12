// 注释：save-system — 存档系统（Dexie.js + IndexedDB）
// 存档全量保存所有角色，不保存 locations/definitions（从 TOML 重新加载）
// 存档权威模型：读档时角色从存档恢复，模板不覆盖存档数据
// 自动存档：autoSave（bridge/location:enter/combat:start/end/new_day 触发）

import Dexie, { type Table } from 'dexie'
import { entitySystem } from './entity-system'
import { gameContext } from './game-context'
import { narrativeLog } from './narrative-log'
import { errorReporter } from './error-reporter'
import { eventBus } from './event-bus'
import { modLoader, fillMissingAttributes, normalizeMarksToAbilities } from './mod-loader'
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

// 注释：游戏状态段提供器注册表（通用机制）——插件注册 {id, serialize, restore}，
// 存档时 serialize 结果写入 gameState[id]，读档时按 id 分发 restore。
// core 不认任何具体段语义（completedScenes 为既有先例，保留原路径）
export interface GameStateProvider {
  id: string
  serialize: () => Record<string, any>
  restore: (data: Record<string, any>) => void
}

const gameStateProviders = new Map<string, GameStateProvider>()

export function registerGameStateProvider(provider: GameStateProvider): void {
  gameStateProviders.set(provider.id, provider)
}

export function getGameStateProviders(): GameStateProvider[] {
  return [...gameStateProviders.values()]
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

// 注释：禁止存档的模式集——插件在 onEnable 中注册
// 这样 core 层不出现任何具体模式名
const noSaveModes = new Set<string>()

export function registerNoSaveMode(mode: string): void {
  noSaveModes.add(mode)
}

function isNoSaveMode(): boolean {
  return noSaveModes.has(gameContext.getCurrentMode())
}

// 注释：保存游戏
export async function saveGame(slotId: string, uiState: any, label?: string): Promise<void> {
  const mod = modLoader.getMod()
  if (!mod) throw new Error('no mod loaded')

  if (isNoSaveMode()) {
    throw new Error('当前模式不可存档')
  }

  const ctx = gameContext.getContext()
  const allChars = entitySystem.getAll('character')
  const data: SaveData = {
    modId: mod.id,
    modVersion: mod.version,
    gameTime: { ...ctx.time },
    characters: allChars.map(c => JSON.parse(JSON.stringify(c))),
    gameState: {
      completedScenes: gameContext.getCompletedScenes(),
      // 注释：插件注册的游戏状态段（random-event-system 的触发记录等）——
      // 单段 serialize 失败隔离（不阻断存档；与 restore 侧一致）
      ...(Object.fromEntries(
        [...gameStateProviders.values()].map(p => {
          try {
            return [p.id, p.serialize()] as const
          } catch (e) {
            errorReporter.report({
              source: 'save-system',
              severity: 'warning',
              message: `游戏状态段 '${p.id}' 序列化失败：${e instanceof Error ? e.message : String(e)}`,
            })
            return [p.id, {}] as const
          }
        }),
      )),
    },
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
  if (isNoSaveMode()) return
  lastAutoSave = now
  await saveGame('autosave', uiState, label ?? '自动存档')
}

// 注释：从 SaveData 恢复角色到 entity-system
export function restoreFromSave(data: SaveData): void {
  entitySystem.clear()
  // 注释：契约补齐（标准角色契约 spec §10.1 决策 11b）——旧存档缺字段按 attributes default
  // 补齐 + warning（不静默）。补齐在注册前执行，保证 entity-system 里的数据完整
  const mod = modLoader.getMod()
  for (const char of data.characters) {
    if (mod?.attributes) {
      fillMissingAttributes(char, mod.attributes, `读档 ${data.modId}@${data.gameTime}`)
    }
    // 注释：marks 归一化（ADR-0007）——旧存档（本改动前保存）的 marks 值在恢复时拷入
    // abilities，防止刻印值静默丢失（读取方全走 abilities）；category=mark 属性同时保证
    // abilities 0 级条目（2026-08-11 按需展开——h-mark 升级写路径需要条目存在）
    normalizeMarksToAbilities(char as any, mod ?? undefined)
    entitySystem.register('character', char.id, char)
  }
  // 注释：恢复游戏时间
  gameContext.reset()
  // 注释：关系组恢复（reset 清空了 relationGroups——聚合条件 any(group:xxx) 需要）
  gameContext.setRelationGroups(mod?.relationGroups ?? {})
  const t = data.gameTime
  gameContext.advanceTime(0)
  Object.assign(gameContext.getContext().time, t)
  // 注释：恢复 location 实体池与当前地点（audit-a C2）——entitySystem.clear() 清掉了
  // character 和 location 两池，此前只重注册 character → 读档后移动静默无操作 /
  // moveTo 抛"当前地点未设置"。地点数据不随存档保存（从 TOML 重新加载，见文件头注释）
  if (mod) {
    for (const [id, loc] of mod.locations) {
      entitySystem.register('location', id, loc as any)
    }
    // 注释：当前地点恢复——玩家 current_location 优先（存档运行时字段），
    // 缺省 → mod.meta.starting_location 兜底，再无 → 第一个地点（同 main.ts 兜底逻辑）
    const playerId = mod.playerCharacter ?? 'player'
    const player = entitySystem.get('character', playerId) as any
    const currentId = player?.current_location as string | undefined
    let loc = currentId ? (entitySystem.get('location', currentId) as any) : null
    if (!loc && mod.startingLocation) {
      loc = entitySystem.get('location', mod.startingLocation) as any
    }
    if (!loc) {
      loc = mod.locations.values().next().value as any
    }
    if (loc) gameContext.setLocation(loc)
  }
  // 注释：恢复已完成 scene
  if (data.gameState?.completedScenes) {
    gameContext.setCompletedScenes(data.gameState.completedScenes)
  }
  // 注释：分发到插件注册的游戏状态段（try/catch 隔离——单段失败不阻断读档）
  for (const provider of gameStateProviders.values()) {
    try {
      provider.restore(data.gameState?.[provider.id])
    } catch (e) {
      errorReporter.report({
        source: 'save-system',
        severity: 'warning',
        message: `游戏状态段 '${provider.id}' 恢复失败：${e instanceof Error ? e.message : String(e)}`,
      })
    }
  }
  // 注释：读档完成广播（标准事件 game:load——插件清理运行时瞬态状态，如随机事件挂起选项）
  eventBus.emit('game:load', {})
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

// 注释：解析版本号（"1.2.3" → [1,2,3]）
function parseVersion(v: string): number[] {
  return v.split('.').map(Number)
}

// 注释：比较版本号，a > b 返回 >0
function compareVersion(a: string, b: string): number {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const va = pa[i] ?? 0
    const vb = pb[i] ?? 0
    if (va !== vb) return va - vb
  }
  return 0
}

// 注释：迁移 step 接口
interface MigrationStep {
  rename?: { old: string; new: string }
  default?: { field: string; value: any }
  transform?: { field: string; script: string }
}

// 注释：执行存档迁移——将存档数据从旧版本升级到当前版本
// 迁移在内存中执行，不修改存档文件。玩家下次存盘时写入新格式
// 迁移失败 → 中止读档 + 报错
export function migrateSaveData(
  data: SaveData,
  migrations: { from: string; to: string; steps: MigrationStep[] }[],
): SaveData {
  const saveVer = data.modVersion
  const result = JSON.parse(JSON.stringify(data)) as SaveData // 深拷贝

  // 注释：按 from → to 顺序执行所有需要的迁移
  for (const mig of migrations) {
    if (compareVersion(saveVer, mig.from) < 0) continue
    if (compareVersion(result.modVersion, mig.to) >= 0) continue
    for (const step of mig.steps) {
      try {
        if (step.rename) {
          applyRename(result, step.rename.old, step.rename.new)
        }
        if (step.default) {
          applyDefault(result, step.default.field, step.default.value)
        }
        if (step.transform) {
          // TODO(phase-12.1): transform 脚本需沙箱执行
          console.warn(`迁移 transform 跳过：${step.transform.script}，需沙箱`)
        }
      } catch (e) {
        throw new Error(
          `存档迁移失败（${mig.from}→${mig.to}，step ${step.rename ? step.rename.old : step.default?.field}）：${e instanceof Error ? e.message : String(e)}`,
        )
      }
    }
    result.modVersion = mig.to
  }
  return result
}

// 注释：重命名字段（遍历所有角色）
function applyRename(data: SaveData, oldName: string, newName: string): void {
  for (const char of data.characters) {
    if (char.base && oldName in char.base) {
      char.base[newName] = char.base[oldName]
      delete char.base[oldName]
    }
    if (oldName in char) {
      char[newName] = char[oldName]
      delete char[oldName]
    }
  }
}

// 注释：设置默认值
function applyDefault(data: SaveData, field: string, value: any): void {
  for (const char of data.characters) {
    const parts = field.split('.')
    let obj: any = char
    for (let i = 0; i < parts.length - 1; i++) {
      if (!obj[parts[i]]) obj[parts[i]] = {}
      obj = obj[parts[i]]
    }
    if (!(parts[parts.length - 1] in obj)) {
      obj[parts[parts.length - 1]] = value
    }
  }
}

