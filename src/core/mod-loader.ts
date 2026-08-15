// 模组加载器——入口壳（2026-08-15 E1 拆分）
// 依赖方向：mod-types ← mod-validate ← mod-parse ← mod-loader（无环；对既有 import 面零变化：
// 所有导出符号经 export * 透传，外部仍从 './mod-loader' 导入）
//
// 拆分前 mod-loader.ts 2507 行四段混合（types/parse/validate/class）；现：
//   mod-types.ts     schema 类型 + parseConversationRef/resolveConversation + RawTomlMap
//   mod-validate.ts  加载期校验（character-contract/关系/场景步骤/地点/天赋/能力升级）+ 关系规范化
//   mod-parse.ts     parseModData + 文件/条目解析 + 字符处理（finalizeCharacterData 等）
//   mod-loader.ts    本文件：glob 声明 + ModLoader class + modLoader 实例 + re-exports

import { parseModData } from './mod-parse'
import { bindingResolver } from './binding-resolver'
import { conditionRegistry } from './condition-registry'
import { entitySystem } from './entity-system'
import { gameContext } from './game-context'
import { resetPendingSpawns } from './spawn-system'
import type { LoadedMod, RawTomlMap } from './mod-types'

export * from './mod-types'
export * from './mod-validate'
export * from './mod-parse'

const tomlModules = import.meta.glob('/mods/**/*.toml', {
  import: 'default',
  eager: false,
})

const pluginDefaultModules = import.meta.glob('/src/plugins/*/data/default/**/*.toml', {
  import: 'default',
  eager: false,
})

const layoutModules = import.meta.glob('/mods/**/maps/layout/*.json', {
  import: 'default',
  eager: false,
})

// 注释：C3：mod 自定义脚本（scripts/*.js，raw 文本）——Vite 8 语法 query:'?raw'；
// glob 参数必须是字面量（Vite 禁止变量插值），故用 /mods/*/scripts/*.js，
// loadMod 时按 mod 前缀过滤（同 tomlModules 模式）
const scriptModules = import.meta.glob<string>('/mods/*/scripts/*.js', {
  query: '?raw',
  import: 'default',
  eager: false,
})

export class ModLoader {
  private loadedMod: LoadedMod | null = null

  // 注释：插件默认层 rawTomlMap 缓存（2026-08-11 全量超时优化）——
  // talk-common-system 默认层 165 个 TOML / 71.6MB，每次 loadMod 全量 await loader() 是
  // 测试超时热点（单 fork 串行下每个文件重复解析）。loader() 结果（字符串）模块级缓存，
  // 首次 loadMod 解析一次，后续复用。生产零影响（只 loadMod 一次）；插件默认层本不在
  // HMR 监听范围（AGENTS §28 只监听 /mods/**），无热更新损失。
  private pluginDefaultCache = new Map<string, string>()

  async loadMod(modName: string): Promise<LoadedMod> {
    const rawTomlMap: RawTomlMap = {}
    // 注释：Layer 1——插件默认数据（优先级最低；缓存复用，避免 71.6MB 重复解析）
    for (const [path, loader] of Object.entries(pluginDefaultModules)) {
      let raw = this.pluginDefaultCache.get(path)
      if (raw === undefined) {
        raw = await loader() as string
        this.pluginDefaultCache.set(path, raw)
      }
      rawTomlMap[path] = raw
    }
    // 注释：Layer 3——mod 定义数据（优先级最高，同名覆盖 plugin defaults）
    const prefix = `/mods/${modName}/`
    for (const [path, loader] of Object.entries(tomlModules)) {
      if (path.startsWith(prefix)) {
        rawTomlMap[path] = await loader() as string
      }
    }
    // 注释：加载 layout JSON 文件
    for (const [path, loader] of Object.entries(layoutModules)) {
      if (path.startsWith(prefix)) {
        rawTomlMap[path] = await loader() as string
      }
    }
    const mod = parseModData(modName, rawTomlMap)
    // 注释：C3：加载 mod 自定义脚本（raw 文本，按文件名索引）——副作用区（glob 惰性加载
    // 需 await；parseModData 保持纯函数无 glob 副作用）。test-mod 无 scripts/ 目录时
    // glob 返回空对象，scripts 保持 parseModData 的空 Map
    const scripts = new Map<string, string>()
    const scriptPrefix = `/mods/${modName}/scripts/`
    for (const [path, loader] of Object.entries(scriptModules)) {
      if (!path.startsWith(scriptPrefix)) continue
      const name = path.slice(scriptPrefix.length)
      if (name) scripts.set(name, await loader() as string)
    }
    mod.scripts = scripts
    this.registerEntities(mod)
    bindingResolver.loadBindings(mod.bindings)
    conditionRegistry.clear()
    conditionRegistry.registerFromAttributes(mod.attributes)
    conditionRegistry.registerFromBindings(mod.bindings)
    // 注释：关系组注入（关系系统 v2）——条件引擎聚合路径 any(group:xxx) 求值用
    gameContext.setRelationGroups(mod.relationGroups)
    // 注释：关系数据注入条件注册器（聚合路径参数校验用）
    conditionRegistry.setRelationData(mod.relationTypes, mod.relationGroups)
    this.loadedMod = mod
    // 注释：audit-i 修复——新模组加载 = 新世界边界：清空 spawn 激活记录
    // （processedIds 跨 loadMod 残留 → 同 id pending 在新世界永不激活，静默）。
    // 运行时调用无循环问题（spawn-system 顶层不访问 modLoader 实例）
    resetPendingSpawns()
    return mod
  }

  private registerEntities(mod: LoadedMod): void {
    // 注释：⚠️ 2026-08-14 第四轮审查——深拷贝注册：entitySystem 持有运行时可变实体，
    // 直接存 mod.entities 的引用会让运行时修改（移动/物品/状态）污染静态初始数据——
    // "退出到标题→新游戏"需干净的初始世界，污染后无法重建。mod.entities/locations
    // 保持纯净模板（读档恢复/新游戏重置的数据源）
    const characters = mod.entities.get('character')
    if (characters) {
      for (const [id, data] of characters) {
        entitySystem.register('character', id, JSON.parse(JSON.stringify(data)))
      }
    }
    // Also register locations so map plugin can query them
    for (const [id, data] of mod.locations) {
      entitySystem.register('location', id, JSON.parse(JSON.stringify(data)) as any)
    }
  }

  // 注释：重建世界实体（新游戏/退出到标题后的干净世界）——entitySystem.clear +
  // 从 mod 初始数据深拷贝注册。不重新解析 TOML（71.6MB 插件默认层解析代价不可接受；
  // mod.entities 因深拷贝注册保持纯净，可直接作重建来源）
  resetWorld(): void {
    entitySystem.clear()
    const mod = this.loadedMod
    if (mod) {
      this.registerEntities(mod)
    }
  }

  getMod(): LoadedMod | null {
    return this.loadedMod
  }
}

export const modLoader = new ModLoader()
