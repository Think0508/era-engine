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
import type { EntityData, MigrationStep } from './types'
export type { MigrationStep }

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
export async function restoreFromSave(data: SaveData): Promise<void> {
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
  // 注释：恢复游戏时间（audit-f 修复，2026-08-12——原 Object.assign 改的是 getContext()
  // 的 spread 副本，存档时间从未恢复：读档后恒回 8:00/day1。改用 setTime 写真实状态）
  gameContext.reset()
  gameContext.setTime(data.gameTime)
  // 注释：关系组恢复（reset 清空了 relationGroups——聚合条件 any(group:xxx) 需要）
  gameContext.setRelationGroups(mod?.relationGroups ?? {})
  // 注释：恢复玩家（audit-f 修复——原 restoreFromSave 不调 setPlayer → 读档后
  // gameContext.player 恒 null：player.* 条件路径/玩家结算/UI 玩家数据全部失效）
  const playerId = mod?.playerCharacter ?? 'player'
  if (entitySystem.get('character', playerId)) {
    gameContext.setPlayer(playerId)
  }
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
  // 2026-08-12 第 9 轮：原同步函数内 emit 无 await——监听器错误/清理顺序悬空，改 async 并 await
  await eventBus.emit('game:load', {})
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

// 注释：迁移 step 接口见 core/types.ts（MigrationStep）——mods/[mod]/migrations/*.toml 条目对应

// 注释：执行存档迁移（audit-f 修复，2026-08-12）——平铺 steps 按序执行，幂等设计：
// rename 对不存在字段无操作、default 对已有字段跳过、transform 待沙箱（warning）。
// 不按版本号门控（原实现 compareVersion(saveVer,...) 用原始版本判断，链式迁移断链；
// 且 migrations 文件无显式 from/to 字段，格式与旧签名不匹配——零生产调用 = 迁移从未生效）。
// 迁移在内存中执行，玩家下次存盘写入新格式；失败 → 抛错中止读档
export function migrateSaveData(
  data: SaveData,
  migrations: MigrationStep[],
): SaveData {
  const result = JSON.parse(JSON.stringify(data)) as SaveData // 深拷贝
  for (const step of migrations) {
    try {
      if (step.rename) {
        applyRename(result, step.rename.old, step.rename.new)
      }
      if (step.default) {
        applyDefault(result, step.default.field, step.default.value)
      }
      if (step.transform) {
        // ⚠️ 半成品（2026-08-13 审计标注）：transform 脚本沙箱执行未实现（phase-12.1）——
        // 迁移步骤中的 transform 不执行，旧存档字段不转换（数据保持原状，不伪造转换结果）。
        // 读档后旧字段缺失由 fillMissingAttributes 兜底默认值；transform 依赖的字段需
        // 作者用 rename/default 表达，或等待沙箱落地后补迁移
        errorReporter.report({
          source: 'save-system',
          severity: 'warning',
          message: `存档迁移 transform 步骤未执行（沙箱未实现）：${step.transform.script}`,
          suggestion: 'transform 依赖沙箱脚本执行（phase-12.1）；当前可用 rename/default 表达迁移，或保持旧字段',
        })
      }
    } catch (e) {
      throw new Error(
        `存档迁移失败（step ${step.rename ? step.rename.old : step.default?.field}）：${e instanceof Error ? e.message : String(e)}`,
      )
    }
  }
  // 注释：迁移后版本 = 当前 mod 版本（迁移链全部执行）
  const mod = modLoader.getMod()
  if (mod) result.modVersion = mod.version
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
      // 注释：仅非对象时重建容器（2026-08-13 审计——原 `!obj[parts[i]]` 会把
      // 中间存在的 0/空串等 falsy 值覆盖成 {}，静默破坏存档数据）
      if (typeof obj[parts[i]] !== 'object' || obj[parts[i]] === null) {
        obj[parts[i]] = {}
      }
      obj = obj[parts[i]]
    }
    if (!(parts[parts.length - 1] in obj)) {
      obj[parts[parts.length - 1]] = value
    }
  }
}

