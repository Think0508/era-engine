// 注释：save-system — 存档系统（Dexie.js + IndexedDB，双表分离）
// 对齐 erArk save_handle.py：头部信息（save_heads）与存档数据（save_data）分离存储，
// 列表面板只读头部（getSaveSlots 零开销），读档时才读数据。
// 存档全量保存所有角色，不保存 locations/definitions（从 TOML 重新加载）
// 存档权威模型：读档时角色从存档恢复，模板不覆盖存档数据
// 自动存档：autoSave（睡醒/退出到标题/崩溃 触发，无节流——对齐 erArk update_save 每次必存）
// 槽位模型：0..maxSave-1 数字槽 + 'auto'（自动）+ '99'（崩溃档，erArk 对齐）

import Dexie, { type Table } from 'dexie'
import { parse as parseTOML } from '@iarna/toml'
import { entitySystem } from './entity-system'
import { gameContext } from './game-context'
import { narrativeLog } from './narrative-log'
import { errorReporter } from './error-reporter'
import { eventBus } from './event-bus'
import { modLoader, fillMissingAttributes, normalizeMarksToAbilities } from './mod-loader'
import type { EntityData, MigrationStep } from './types'
export type { MigrationStep }
import configRaw from '../../era-engine.config.toml?raw'

// 注释：存档配置——era-engine.config.toml [save] 段（镜像 erArk config.ini max_save/save_page）
export interface SaveConfig {
  maxSave: number
  savePage: number
}

export function loadSaveConfig(raw?: string): SaveConfig {
  try {
    const data = parseTOML(raw ?? configRaw) as { save?: { max_save?: number; save_page?: number } }
    const save = data?.save
    return {
      maxSave: save?.max_save && save.max_save > 0 ? save.max_save : 100,
      savePage: save?.save_page && save.save_page > 0 ? save.save_page : 10,
    }
  } catch {
    return { maxSave: 100, savePage: 10 }
  }
}

export const SAVE_CONFIG = loadSaveConfig()

// 注释：存档头部（列表/槽位行只读此结构，对齐 erArk save_info_head 语义）
export interface SaveHead {
  id: string        // "modId_slotId"
  modId: string
  slotId: string
  modVersion: string
  label: string
  gameTime: { year: number; month: number; day: number; hour: number; minute: number }
  characterName: string
  saveTime: number
  createdAt: number
  updatedAt: number
}

export interface SaveDataRow {
  id: string
  modId: string
  slotId: string
  data: SaveData
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
  saveHeads!: Table<SaveHead>
  saveData!: Table<SaveDataRow>

  constructor() {
    super('era-engine')
    this.version(2).stores({
      saves: null, // 注释：v1 旧表（元数据+localStorage 数据混合）——升级时清除
      saveHeads: 'id, modId, slotId, updatedAt',
      saveData: 'id, modId, slotId',
    })
  }
}

const db = new SaveDatabase()
// 注释：导出 db 供测试清理（beforeEach clear 两表）——core 层导出存储实例不涉玩法语义
export { db as __saveDb }

// 注释：禁止存档的模式集——插件在 onEnable 中注册
// 这样 core 层不出现任何具体模式名
const noSaveModes = new Set<string>()

export function registerNoSaveMode(mode: string): void {
  noSaveModes.add(mode)
}

function isNoSaveMode(): boolean {
  return noSaveModes.has(gameContext.getCurrentMode())
}

function currentMod(): { id: string; version: string } {
  const mod = modLoader.getMod()
  if (!mod) throw new Error('no mod loaded')
  return { id: mod.id, version: mod.version }
}

function makeSlotId(modId: string, slotId: string): string {
  return `${modId}_${slotId}`
}

function formatGameTime(t: SaveData['gameTime']): string {
  return `${t.year}-${t.month}-${t.day} ${t.hour}:${String(t.minute).padStart(2, '0')}`
}

function playerName(): string {
  const mod = modLoader.getMod()
  const playerId = mod?.playerCharacter ?? 'player'
  const player = entitySystem.get('character', playerId) as any
  return player?.name ?? ''
}

async function writeSave(slotId: string, data: SaveData, label: string): Promise<void> {
  const mod = currentMod()
  const id = makeSlotId(mod.id, slotId)
  const now = Date.now()
  // 注释：⚠️ 2026-08-14 第七轮审计——head+data 原子事务：原实现先写 head 再写 data，
  // data 写失败（配额/异常）会留下孤儿 head（面板显示有档但读档失败 = 半档）。
  // 事务保证全写或全不写
  await db.transaction('rw', db.saveHeads, db.saveData, async () => {
    await db.saveHeads.put({
      id,
      modId: mod.id,
      slotId,
      modVersion: mod.version,
      label,
      gameTime: { ...data.gameTime },
      characterName: data.characters.find(c => c.id === (modLoader.getMod()?.playerCharacter ?? 'player'))?.name ?? playerName(),
      saveTime: now,
      createdAt: now,
      updatedAt: now,
    })
    await db.saveData.put({ id, modId: mod.id, slotId, data })
  })
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

  await writeSave(slotId, data, label ?? `存档 ${slotId}`)
  narrativeLog.write(`存档成功：${slotId}`, 'system', 'save-system')
}

// 注释：读档（读数据表，返回完整 SaveData）
export async function loadGame(slotId: string): Promise<SaveData | null> {
  const mod = currentMod()
  const row = await db.saveData.get(makeSlotId(mod.id, slotId))
  return row?.data ?? null
}

// 注释：获取单槽头部信息（二次确认/详情展示用）
export async function getSaveHead(slotId: string): Promise<SaveHead | null> {
  const mod = modLoader.getMod()
  if (!mod) return null
  return (await db.saveHeads.get(makeSlotId(mod.id, slotId))) ?? null
}

// 注释：获取存档列表（只读头部表——列表面板零开销，对齐 erArk 头/数据分离）
// ⚠️ 2026-08-14 审查修复：无参时按当前 mod 过滤（原实现返回全部 mod 的存档——
// 面板会混入其他模组的档：slotId 冲突 + loadGame 按当前 modId 读错档/读不到）
export async function getSaveSlots(modId?: string): Promise<SaveHead[]> {
  const target = modId ?? modLoader.getMod()?.id
  if (target) {
    return db.saveHeads.where('modId').equals(target).reverse().sortBy('updatedAt')
  }
  return db.saveHeads.orderBy('updatedAt').reverse().toArray()
}

// 注释：删除存档（head+data 原子事务——防半删：只删 head 留 data = 读档残留）
export async function deleteSave(slotId: string): Promise<void> {
  const mod = currentMod()
  const id = makeSlotId(mod.id, slotId)
  await db.transaction('rw', db.saveHeads, db.saveData, async () => {
    await db.saveHeads.delete(id)
    await db.saveData.delete(id)
  })
}

// 注释：自动存档——睡醒/退出到标题/崩溃 触发（erArk update_save 每次必存，无节流）
export async function autoSave(uiState: any, label?: string): Promise<void> {
  if (isNoSaveMode()) return
  await saveGame('auto', uiState, label ?? '自动存档')
}

// 注释：从 SaveData 恢复角色到 entity-system
export async function restoreFromSave(data: SaveData): Promise<void> {
  // 注释：⚠️ 2026-08-14 第三轮审查——损坏/被篡改存档防御：
  // characters 非数组（导入 JSON 结构损坏）→ 抛明确错误而非 for...of 崩溃。
  // ⚠️ 2026-08-14 第六轮审计：校验必须在 entitySystem.clear() **之前**——
  // 原顺序先 clear 后校验：损坏存档读档失败时实体池已被清空，玩家当前游戏
  // 世界被静默破坏（读档失败应保持原世界不动）
  if (!data || !Array.isArray(data.characters)) {
    throw new Error('存档数据损坏：characters 不是数组（读档中止）')
  }
  entitySystem.clear()
  // 注释：契约补齐（标准角色契约 spec §10.1 决策 11b）——旧存档缺字段按 attributes default
  // 补齐 + warning（不静默）。补齐在注册前执行，保证 entity-system 里的数据完整
  const mod = modLoader.getMod()
  let filledCount = 0
  const seenIds = new Set<string>()
  let skippedDuplicate = 0
  for (const char of data.characters) {
    if (!char || typeof char !== 'object' || typeof char.id !== 'string') {
      errorReporter.report({
        source: 'save-system',
        severity: 'warning',
        message: '读档跳过无效角色条目（缺少 id 字段）',
        suggestion: '存档数据可能被篡改或损坏；已跳过该条目继续读档',
      })
      continue
    }
    if (seenIds.has(char.id)) {
      skippedDuplicate++
      continue
    }
    seenIds.add(char.id)
    if (mod?.attributes) {
      filledCount += fillMissingAttributes(char, mod.attributes, `读档 ${data.modId}@${data.gameTime}`)
    }
    // 注释：marks 归一化（ADR-0007）——旧存档（本改动前保存）的 marks 值在恢复时拷入
    // abilities，防止刻印值静默丢失（读取方全走 abilities）；category=mark 属性同时保证
    // abilities 0 级条目（2026-08-11 按需展开——h-mark 升级写路径需要条目存在）
    normalizeMarksToAbilities(char as any, mod ?? undefined)
    entitySystem.register('character', char.id, char)
  }
  if (skippedDuplicate > 0) {
    errorReporter.report({
      source: 'save-system',
      severity: 'warning',
      message: `读档跳过 ${skippedDuplicate} 个重复角色条目（同 id 后注册覆盖——保留首个）`,
      suggestion: '存档数据可能被篡改或损坏；已保留首个条目',
    })
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
    // 注释：⚠️ 2026-08-14 第七轮审计——location 深拷贝注册（与 mod-loader registerEntities
    // 一致）：直接存 mod.locations 引用会让运行时修改污染静态数据
    for (const [id, loc] of mod.locations) {
      entitySystem.register('location', id, JSON.parse(JSON.stringify(loc)) as any)
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
  // 注释：迁移汇总（对齐 erArk input_load_save 输出"共 N 条数据更新"）——补齐统计叙事行
  if (filledCount > 0) {
    narrativeLog.write(`读档完成：补齐 ${filledCount} 个缺失字段（属性默认值）`, 'system', 'save-system')
  }
}

// 注释：读档完整流程（loadGame → 迁移 → restore）——UI 层统一入口，返回 SaveData 供 uiState 恢复
export async function loadAndRestoreSave(slotId: string): Promise<SaveData | null> {
  const data = await loadGame(slotId)
  if (!data) return null
  // 注释：⚠️ 2026-08-14 第六轮审计——损坏存档校验前置：migrateSaveData 的 for...of
  // 对非数组 characters 抛不友好 TypeError（在 restoreFromSave 的明确校验之前执行）；
  // 此处统一抛明确错误，世界保持不动
  if (!Array.isArray(data.characters)) {
    throw new Error('存档数据损坏：characters 不是数组（读档中止）')
  }
  const mod = modLoader.getMod()
  const migrations = mod?.migrations ?? []
  let migrated = data
  let summary: MigrationSummary | null = null
  if (migrations.length > 0) {
    const result = migrateSaveData(data, migrations)
    migrated = result.data
    summary = result.summary
  }
  await restoreFromSave(migrated)
  // 注释：⚠️ 2026-08-14 第八轮审计——迁移汇总行在 restore **之后**输出：
  // 原顺序在 restore 前写，restoreFromSave 广播 game:load 时 bridge 清空会话日志
  // （读档 = 回到存档时刻）→ 迁移行被静默清掉。移到 restore 后保留
  if (summary) {
    const parts: string[] = []
    if (summary.renamed > 0) parts.push(`重命名 ${summary.renamed} 处`)
    if (summary.defaulted > 0) parts.push(`补默认 ${summary.defaulted} 处`)
    if (summary.transformsSkipped > 0) parts.push(`transform 跳过 ${summary.transformsSkipped} 处（沙箱未实现）`)
    if (parts.length > 0) {
      narrativeLog.write(`存档迁移：${parts.join('，')}`, 'system', 'save-system')
    }
  }
  return migrated
}

// 注释：迁移汇总（统计 migrateSaveData 各 step 命中数，供读档汇总行输出）
export interface MigrationSummary {
  renamed: number
  defaulted: number
  transformsSkipped: number
}

// 注释：执行存档迁移（audit-f 修复，2026-08-12）——平铺 steps 按序执行，幂等设计：
// rename 对不存在字段无操作、default 对已有字段跳过、transform 待沙箱（warning）。
// 不按版本号门控（对齐 erArk 结构差异补丁语义；原实现 compareVersion(saveVer,...) 用
// 原始版本判断，链式迁移断链；且 migrations 文件无显式 from/to 字段，格式与旧签名不匹配
// ——零生产调用 = 迁移从未生效）。
// 迁移在内存中执行，玩家下次存盘写入新格式；失败 → 抛错中止读档
export function migrateSaveData(
  data: SaveData,
  migrations: MigrationStep[],
): { data: SaveData; summary: MigrationSummary } {
  const result = JSON.parse(JSON.stringify(data)) as SaveData // 深拷贝
  const summary: MigrationSummary = { renamed: 0, defaulted: 0, transformsSkipped: 0 }
  for (const step of migrations) {
    try {
      if (step.rename) {
        summary.renamed += applyRename(result, step.rename.old, step.rename.new)
      }
      if (step.default) {
        summary.defaulted += applyDefault(result, step.default.field, step.default.value)
      }
      if (step.transform) {
        // ⚠️ 半成品（2026-08-13 审计标注）：transform 脚本沙箱执行未实现（phase-12.1）——
        // 迁移步骤中的 transform 不执行，旧存档字段不转换（数据保持原状，不伪造转换结果）。
        // 读档后旧字段缺失由 fillMissingAttributes 兜底默认值；transform 依赖的字段需
        // 作者用 rename/default 表达，或等待沙箱落地后补迁移
        summary.transformsSkipped++
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
  return { data: result, summary }
}

// 注释：重命名字段（遍历所有角色），返回命中数
// ⚠️ 2026-08-14 第七轮审计：old === new 时跳过——原实现先赋值再删除同名字段
// = 静默清空该字段（数据丢失）。迁移作者笔误时保护数据
function applyRename(data: SaveData, oldName: string, newName: string): number {
  if (!oldName || oldName === newName) return 0
  let count = 0
  for (const char of data.characters) {
    if (char.base && oldName in char.base) {
      char.base[newName] = char.base[oldName]
      delete char.base[oldName]
      count++
    }
    if (oldName in char) {
      char[newName] = char[oldName]
      delete char[oldName]
      count++
    }
  }
  return count
}

// 注释：设置默认值，返回实际设置数
// ⚠️ 2026-08-14 第七轮审计：空 field 跳过（原实现 field='' → 设置 obj[''] 脏 key，
// 迁移作者笔误时静默写入脏数据）
function applyDefault(data: SaveData, field: string, value: any): number {
  if (!field || field.trim() === '') return 0
  let count = 0
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
      count++
    }
  }
  return count
}

// 注释：导出存档（JSON 字符串）
export async function exportSave(slotId: string): Promise<string | null> {
  const mod = modLoader.getMod()
  if (!mod) return null
  const row = await db.saveData.get(makeSlotId(mod.id, slotId))
  return row ? JSON.stringify(row.data) : null
}

// 注释：找第一个空数字槽（避开 99 崩溃槽——保留给崩溃存档，erArk 对齐），无空槽返回 null
async function findEmptySlot(): Promise<string | null> {
  const mod = modLoader.getMod()
  if (!mod) return null
  for (let i = 0; i < SAVE_CONFIG.maxSave; i++) {
    if (i === 99) continue
    const head = await db.saveHeads.get(makeSlotId(mod.id, String(i)))
    if (!head) return String(i)
  }
  return null
}

// 注释：导入存档——校验 modId 匹配当前模组（不匹配 → errorReporter 精准报错拒收），
// 自动分配空数字槽写入（废弃固定 imported 槽——避免互相覆盖）
export async function importSave(json: string): Promise<string> {
  let data: SaveData
  try {
    data = JSON.parse(json) as SaveData
  } catch (e) {
    errorReporter.report({
      source: 'save-system',
      severity: 'error',
      message: `导入存档解析失败：${e instanceof Error ? e.message : String(e)}`,
      suggestion: '请选择完整的存档 JSON 文件（erark-save-*.json）',
    })
    throw new Error('导入存档解析失败（JSON 格式不合法）')
  }
  if (!data || typeof data !== 'object' || !Array.isArray(data.characters)) {
    errorReporter.report({
      source: 'save-system',
      severity: 'error',
      message: '导入存档结构不合法（缺少 characters 数组）',
      suggestion: '请选择由本游戏导出的存档 JSON 文件',
    })
    throw new Error('导入存档结构不合法')
  }
  const mod = modLoader.getMod()
  if (!mod) throw new Error('no mod loaded')
  if (data.modId !== mod.id) {
    errorReporter.report({
      source: 'save-system',
      severity: 'error',
      message: `导入存档模组不匹配：存档属于 '${data.modId}'，当前模组为 '${mod.id}'`,
      suggestion: '存档只能在同模组下导入（切换模组后存档互相隔离）',
    })
    throw new Error(`导入存档模组不匹配：存档属于 '${data.modId}'，当前模组为 '${mod.id}'`)
  }
  const slotId = await findEmptySlot()
  if (slotId === null) {
    throw new Error('存档槽已满，请先删除一个存档再导入')
  }
  const gameTime = typeof data.gameTime === 'object' && data.gameTime ? data.gameTime : { minute: 0, hour: 8, day: 1, month: 1, year: 1 }
  await writeSave(slotId, data, `导入存档 ${formatGameTime(gameTime)}`)
  narrativeLog.write(`导入存档成功：槽位 ${slotId}`, 'system', 'save-system')
  return slotId
}

// 注释：存档界面记忆（对齐 erArk save/save_info.json last_save_page/last_save_id）——
// localStorage 设备级键，按 mod 命名空间隔离；由存档面板在数字槽保存成功后写入
const SAVE_MEMORY_PREFIX = 'era-engine:save-memory:'

export interface SaveMemory {
  lastSavePage: number
  lastSaveId: string
}

export function getSaveMemory(modId?: string): SaveMemory {
  const id = modId ?? modLoader.getMod()?.id ?? ''
  try {
    const raw = localStorage.getItem(SAVE_MEMORY_PREFIX + id)
    if (!raw) return { lastSavePage: 0, lastSaveId: '' }
    const parsed = JSON.parse(raw) as Partial<SaveMemory>
    return {
      lastSavePage: typeof parsed.lastSavePage === 'number' ? parsed.lastSavePage : 0,
      lastSaveId: typeof parsed.lastSaveId === 'string' ? parsed.lastSaveId : '',
    }
  } catch {
    return { lastSavePage: 0, lastSaveId: '' }
  }
}

export function setSaveMemory(mem: SaveMemory, modId?: string): void {
  const id = modId ?? modLoader.getMod()?.id ?? ''
  try {
    localStorage.setItem(SAVE_MEMORY_PREFIX + id, JSON.stringify(mem))
  } catch {
    // 注释：localStorage 不可用（隐私模式），静默跳过
  }
}
