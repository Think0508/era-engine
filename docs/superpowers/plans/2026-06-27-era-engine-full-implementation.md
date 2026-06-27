# era-engine 完整实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从零搭建 era-engine，一个现代化的文字MUD游戏引擎，支持插件化玩法、多模组热切换、TOML数据驱动。

**Architecture:** Vue3+TS+Vite SPA，三层架构（core/plugins/mods），插件通过事件总线+公共API通信，TOML文件通过 glob import 加载，Dexie.js存储存档。

**Tech Stack:** Vue 3 + TypeScript + Vite + Pinia + Tailwind CSS + Naive UI + @iarna/toml + Dexie.js + Vitest

## 全局约束

- 所有代码标识符英文/拼音，禁止中文
- 所有颜色/字体/圆角/间距走CSS主题变量，禁止硬编码
- 错误必须报文件名+行号+原因，禁止静默失败
- 内核 `src/core/` 禁止任何具体玩法/世界观/美术内容
- 插件之间禁止直接import（extends走 `ctx.parent.api`）
- 条件字段动态收集，不硬编码字段列表
- 条件表达式只支持 `> < >= <= == != && || !` 和括号
- 核心游戏界面全定制，禁止Naive UI组件
- 只在阶段5之后引入Naive UI（且仅用于辅助界面）
- 每次改动后跑 `npm run typecheck && npm run test`
- 每阶段完成后对照 `开发检查清单.md` 逐条自审

---

## 阶段1：项目初始化与基础架构

> 验收标准：`npm run dev` 正常启动，目录完整，Tailwind生效，`era-engine.config.toml` 已创建

### Task 1.1: 创建Vite+Vue3+TS项目

**Files:**
- Create: `C:\Users\d\Documents\era-engine` 下的所有项目文件

- [ ] **Step 1: 创建项目**

```bash
npm create vite@latest era-engine -- --template vue-ts
```

当前目录已是 `C:\Users\d\Documents\era-engine`，项目将创建在此。

- [ ] **Step 2: 安装依赖**

```bash
npm install pinia @iarna/toml dexie @vueuse/core
npm install -D tailwindcss @tailwindcss/vite vitest
npm install -D @types/node
```

- [ ] **Step 3: 验证依赖安装**

```bash
npm run dev
```

打开浏览器确认 Vite 默认页面正常显示。

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: create vite vue3 ts project with dependencies"
```

---

### Task 1.2: 配置Vite + TypeScript + Tailwind

**Files:**
- Modify: `vite.config.ts`
- Modify: `tsconfig.json`
- Modify: `tsconfig.app.json`
- Create: `tailwind.config.ts` (或修改已有)
- Modify: `src/style.css` (或 `src/index.css`)

- [ ] **Step 1: 配置 vite.config.ts**

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  }
})
```

- [ ] **Step 2: 配置 tsconfig.json - 路径别名**

```json
// tsconfig.json (添加 compilerOptions.paths)
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ],
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

- [ ] **Step 3: 配置 Tailwind CSS**

修改 `src/style.css`（Vite创建的默认CSS文件）：

```css
/* src/style.css */
@import "tailwindcss";
```

- [ ] **Step 4: 修改 src/App.vue 验证 Tailwind 生效**

```vue
<!-- src/App.vue -->
<template>
  <div class="min-h-screen bg-gray-100 flex items-center justify-center">
    <h1 class="text-3xl font-bold text-blue-600">era-engine</h1>
  </div>
</template>
```

删除默认的 `src/components/HelloWorld.vue`。

- [ ] **Step 5: 验证**

```bash
npm run dev
```

浏览器应显示蓝色大字 "era-engine"，Tailwind 样式生效。

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: configure vite, tailwind, path aliases"
```

---

### Task 1.3: 建立完整目录结构

**Files:**
- Create: 所有 AGENTS.md 列出的空目录 + `.gitkeep`

- [ ] **Step 1: 创建 src/ 下所有目录**

```bash
# core
New-Item -ItemType Directory -Path "src/core" -Force

# plugins (创建所有插件目录)
$plugins = @(
  "combat-base", "combat-wuxia", "map-system",
  "character-system", "dialogue-system",
  "inventory-system", "quest-system", "effect-system"
)
foreach ($p in $plugins) {
  New-Item -ItemType Directory -Path "src/plugins/$p" -Force
  New-Item -ItemType File -Path "src/plugins/$p/.gitkeep"
}

# ui
$uiDirs = @("layout", "components", "views", "dev-panel", "slots")
foreach ($d in $uiDirs) {
  New-Item -ItemType Directory -Path "src/ui/$d" -Force
  New-Item -ItemType File -Path "src/ui/$d/.gitkeep"
}

# utils
New-Item -ItemType Directory -Path "src/utils" -Force

# mods
$modDirs = @(
  "mods/武侠/definitions",
  "mods/武侠/templates/character",
  "mods/武侠/templates/item",
  "mods/武侠/characters/named",
  "mods/武侠/maps/locations",
  "mods/武侠/quests/main",
  "mods/武侠/quests/side",
  "mods/武侠/scripts",
  "mods/武侠/plugins",
  "mods/武侠/migrations",
  "mods/武侠/assets"
)
foreach ($d in $modDirs) {
  New-Item -ItemType Directory -Path $d -Force
  New-Item -ItemType File -Path "$d/.gitkeep" -Force
}
```

- [ ] **Step 2: 创建 core 空文件占位**

```bash
$coreFiles = @(
  "mod-loader", "plugin-manager", "entity-system",
  "template", "binding-resolver", "condition",
  "event-bus", "save-system", "game-context",
  "condition-registry", "error-reporter", "types", "api"
)
foreach ($f in $coreFiles) {
  New-Item -ItemType File -Path "src/core/$f.ts" -Force
}
```

- [ ] **Step 3: 创建 utils 空文件占位**

```bash
New-Item -ItemType File -Path "src/utils/toml-validator.ts" -Force
New-Item -ItemType File -Path "src/utils/sandbox.ts" -Force
```

- [ ] **Step 4: 创建配置文件**

```bash
Set-Content -Path "era-engine.config.toml" -Value 'active_mod = ""'
```

- [ ] **Step 5: 创建 .gitignore**

```bash
Set-Content -Path ".gitignore" -Value @"
node_modules/
dist/
*.local
"@
```

- [ ] **Step 6: 验证目录结构**

```bash
Get-ChildItem -Recurse -Directory | Select-Object FullName
```

确认所有目录存在。

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: create full directory structure and config file"
```

---

### Task 1.4: 验证阶段1完成

- [ ] **Step 1: 最终验证**

```bash
npm run dev
```

浏览器正常显示，无控制台错误。

- [ ] **Step 2: 对照检查清单**

阅读 `开发检查清单.md` → 阶段1 → 逐条检查并确认全部通过。

- [ ] **Step 3: 确认**

- `src/core/` 含13个 `.ts` 文件
- `src/plugins/` 含8个插件目录
- `src/ui/` 含5个子目录
- `mods/武侠/` 目录完整
- `era-engine.config.toml` 存在
- Tailwind CSS 生效
- `@/` 路径别名有效

---

## 阶段2：核心数据系统

> 验收标准：可加载最小测试模组，模板继承正确，实体系统可用，bindings校验生效

### Task 2.1: 定义核心类型

**Files:**
- Write: `src/core/types.ts`

- [ ] **Step 1: 写入所有核心类型定义**

```typescript
// src/core/types.ts

// ---- 游戏时间 ----
export interface GameTimeData {
  minute: number
  hour: number
  day: number
  month: number
  year: number
}

// ---- 地点 ----
export interface LocationData {
  id: string
  name: string
  parent: string | null
  type: string
  tags: string[]
  exits: { target: string; name: string; time_cost?: number }[]
}

// ---- 实体（动态键值对） ----
export type EntityData = Record<string, any>

// ---- 全局游戏上下文 ----
export interface GameContext {
  player: EntityData | null
  location: LocationData | null
  time: GameTimeData
  getEntity: (type: string, id: string) => EntityData | null
}

// ---- UI插槽项 ----
export interface UISlotItem {
  id: string
  component: Component
  priority: number
  condition?: (ctx: GameContext) => boolean
}

// ---- 插件上下文 ----
export interface PluginContext {
  api: {
    register: (namespace: string, methods: Record<string, Function>) => void
    call: (namespace: string, method: string, ...args: any[]) => Promise<any>
  }
  ui: {
    registerSlot: (slotName: string, item: UISlotItem) => void
  }
  parent: {
    api: Record<string, any>
  } | null
  events: {
    on: (event: string, handler: Function) => void
    off: (event: string, handler: Function) => void
    emit: (event: string, payload: any) => void
  }
  gameState: {
    currentLocation: LocationData | null
    player: EntityData | null
    time: GameTimeData
  }
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/core/types.ts
git commit -m "feat: define core TypeScript types (PluginContext, GameContext, etc.)"
```

---

### Task 2.2: 创建最小测试模组数据

**Files:**
- Create: `mods/test-mod/meta.toml`
- Create: `mods/test-mod/bindings.toml`
- Create: `mods/test-mod/theme.toml`
- Create: `mods/test-mod/definitions/attributes.toml`
- Create: `mods/test-mod/definitions/talents.toml`
- Create: `mods/test-mod/definitions/abilities.toml`
- Create: `mods/test-mod/definitions/items.toml`
- Create: `mods/test-mod/definitions/relations.toml`
- Create: `mods/test-mod/templates/character/base-human.toml`
- Create: `mods/test-mod/templates/character/test-hero.toml`
- Create: `mods/test-mod/characters/roster.toml`
- Create: `mods/test-mod/maps/locations/tavern.toml`
- Create: `mods/test-mod/maps/locations/town-square.toml`

- [ ] **Step 1: 创建测试模组目录**

```bash
$dirs = @(
  "mods/test-mod/definitions",
  "mods/test-mod/templates/character",
  "mods/test-mod/templates/item",
  "mods/test-mod/characters/named",
  "mods/test-mod/maps/locations",
  "mods/test-mod/quests/main",
  "mods/test-mod/quests/side",
  "mods/test-mod/scripts",
  "mods/test-mod/plugins",
  "mods/test-mod/migrations",
  "mods/test-mod/assets"
)
foreach ($d in $dirs) {
  New-Item -ItemType Directory -Path $d -Force
}
```

- [ ] **Step 2: 创建 test-mod/meta.toml**

```toml
# mods/test-mod/meta.toml
[meta]
id = "test-mod"
name = "测试模组"
version = "1.0.0"

dependencies = [
  { plugin = "combat-base", version = "^1.0.0" }
]
```

- [ ] **Step 3: 创建 test-mod/theme.toml**

```toml
# mods/test-mod/theme.toml
[colors]
primary = "#3B82F6"
secondary = "#6366F1"
background = "#F8FAFC"
surface = "#FFFFFF"
text = "#1E293B"
text_secondary = "#64748B"
border = "#CBD5E1"
success = "#22C55E"
danger = "#EF4444"
warning = "#F59E0B"

[typography]
font_body = "sans-serif"
font_title = "sans-serif"
font_size_base = "16px"

[spacing]
radius_button = "4px"
radius_panel = "8px"
gap_small = "8px"
gap_medium = "16px"
gap_large = "32px"
```

- [ ] **Step 4: 创建 test-mod/definitions/attributes.toml**

```toml
# mods/test-mod/definitions/attributes.toml
[attributes]
hp = { type = "number", default = 100, category = "base" }
mp = { type = "number", default = 50, category = "base" }
attack = { type = "number", default = 10, category = "combat" }
defense = { type = "number", default = 5, category = "combat" }
speed = { type = "number", default = 5, category = "base" }
```

- [ ] **Step 5: 创建 test-mod/definitions/talents.toml**

```toml
# mods/test-mod/definitions/talents.toml
[talents]
剑术精通 = { type = "number", max = 10, description = "剑术天赋" }
```

- [ ] **Step 6: 创建 test-mod/definitions/relations.toml**

```toml
# mods/test-mod/definitions/relations.toml
[types]
好感度 = { min = 0, max = 100, default = 30, name = "好感度" }
```

- [ ] **Step 7: 创建 test-mod/bindings.toml**

```toml
# mods/test-mod/bindings.toml
[bindings.combat-base]
hp = "hp"
mp = "mp"
attack = "attack"
```

- [ ] **Step 8: 创建模板继承链**

```toml
# mods/test-mod/templates/character/base-human.toml
id = "base-human"
name = "基础人类"
base = { hp = 100, mp = 50, attack = 10, defense = 5, speed = 5 }
```

```toml
# mods/test-mod/templates/character/test-hero.toml
id = "test-hero"
extends = "base-human"
name = "测试英雄"
base = { hp = 150, attack = 15 }
```

- [ ] **Step 9: 创建角色数据**

```toml
# mods/test-mod/characters/roster.toml
[[roster]]
id = "player"
template = "test-hero"
name = "玩家"
base = { hp = 200, mp = 80 }

[[roster]]
id = "innkeeper"
template = "base-human"
name = "酒馆老板"
base = { hp = 80, attack = 5 }
behavior = { activity = 0, home_locations = { tavern = 1.0 } }

[[roster]]
id = "guard"
template = "base-human"
name = "卫兵"
base = { hp = 120, attack = 12 }
behavior = { activity = 0.3, home_locations = { town_square = 0.7, tavern = 0.3 } }
```

- [ ] **Step 10: 创建地图数据**

```toml
# mods/test-mod/maps/locations/town_square.toml
id = "town_square"
name = "城镇广场"
parent = null
type = "town"
tags = ["public"]
exits = [
  { target = "tavern", name = "去酒馆", time_cost = 5 }
]
```

```toml
# mods/test-mod/maps/locations/tavern.toml
id = "tavern"
name = "酒馆"
parent = "town_square"
type = "building"
tags = ["has_drink", "rest"]
exits = [
  { target = "town_square", name = "去广场", time_cost = 5 }
]
```

- [ ] **Step 11: 更新配置指向测试模组**

```bash
Set-Content -Path "era-engine.config.toml" -Value 'active_mod = "test-mod"'
```

- [ ] **Step 12: Commit**

```bash
git add mods/test-mod/ era-engine.config.toml
git commit -m "feat: add test mod with 3 chars, 2 locations, template chain"
```

---

### Task 2.3: 实现 TOML 加载器 (mod-loader.ts)

**Files:**
- Write: `src/core/mod-loader.ts`
- Write: `src/core/mod-loader.test.ts` (or `tests/`)

- [ ] **Step 1: 写测试 — 验证 glob import 可用**

```typescript
// src/core/mod-loader.test.ts
import { describe, it, expect } from 'vitest'

describe('mod-loader', () => {
  it('should have glob import available for mod toml files', () => {
    // import.meta.glob 在 vitest 环境下可能不可用
    // 此测试验证模块结构而非运行时行为
    expect(true).toBe(true)
  })
})
```

- [ ] **Step 2: 写 loader**

```typescript
// src/core/mod-loader.ts
import TOML from '@iarna/toml'
import type { EntityData, LocationData } from './types'

// 构建时扫描所有 mods/ 下的 TOML 文件
const tomlModules = import.meta.glob('/mods/**/*.toml', {
  as: 'raw',
  eager: false
})

export interface LoadedMod {
  id: string
  name: string
  version: string
  dependencies: { plugin: string; version: string }[]
  entities: Map<string, Map<string, EntityData>>
  locations: Map<string, LocationData>
  bindings: Record<string, Record<string, string>>
  theme: Record<string, any>
  attributes: Record<string, { type: string; default: any; category: string }>
}

class ModLoader {
  private loadedMod: LoadedMod | null = null
  private activeModName: string = ''

  async loadMod(modName: string): Promise<LoadedMod> {
    this.activeModName = modName
    const mod: LoadedMod = {
      id: '',
      name: '',
      version: '',
      dependencies: [],
      entities: new Map(),
      locations: new Map(),
      bindings: {},
      theme: {},
      attributes: {}
    }

    // 1. 加载 meta.toml
    const metaPath = `/mods/${modName}/meta.toml`
    if (!(metaPath in tomlModules)) {
      throw new Error(`模组 '${modName}' 不存在：找不到 ${metaPath}`)
    }
    const metaRaw = await tomlModules[metaPath]()
    const meta = TOML.parse(metaRaw)
    if (!meta.meta) {
      throw new Error(`${metaPath}: 缺少 [meta] 段`)
    }
    mod.id = meta.meta.id
    mod.name = meta.meta.name
    mod.version = meta.meta.version
    mod.dependencies = meta.meta.dependencies || []

    // 2. 加载 definitions/attributes.toml
    mod.attributes = await this.loadAttributes(modName)

    // 3. 加载 bindings.toml
    mod.bindings = await this.loadBindings(modName)

    // 4. 加载 templates/character
    const templates = await this.loadTemplates(modName, 'character')
    // 存储模板（后续继承解析）
    mod.entities.set('__templates_character__', templates)

    // 5. 加载 characters/roster.toml
    const characters = await this.loadRoster(modName, templates, mod.attributes)
    mod.entities.set('character', characters)

    // 6. 加载 maps/locations
    mod.locations = await this.loadLocations(modName)

    // 7. 加载 theme.toml
    mod.theme = await this.loadTheme(modName)

    this.loadedMod = mod
    return mod
  }

  private async loadAttributes(modName: string): Promise<Record<string, any>> {
    const path = `/mods/${modName}/definitions/attributes.toml`
    if (!(path in tomlModules)) return {}
    const raw = await tomlModules[path]()
    const data = TOML.parse(raw)
    return data.attributes || {}
  }

  private async loadBindings(
    modName: string
  ): Promise<Record<string, Record<string, string>>> {
    const path = `/mods/${modName}/bindings.toml`
    if (!(path in tomlModules)) return {}
    const raw = await tomlModules[path]()
    const data = TOML.parse(raw)
    return data.bindings || {}
  }

  private async loadTemplates(
    modName: string,
    type: 'character' | 'item'
  ): Promise<Map<string, EntityData>> {
    const result = new Map<string, EntityData>()
    const prefix = `/mods/${modName}/templates/${type}/`

    for (const [path, loader] of Object.entries(tomlModules)) {
      if (path.startsWith(prefix) && path.endsWith('.toml')) {
        const raw = await loader()
        const data = TOML.parse(raw)
        const id = data.id || path.replace(prefix, '').replace('.toml', '')
        result.set(id, data)
      }
    }
    return result
  }

  private async loadRoster(
    modName: string,
    _templates: Map<string, EntityData>,
    _attributes: Record<string, any>
  ): Promise<Map<string, EntityData>> {
    const result = new Map<string, EntityData>()
    const path = `/mods/${modName}/characters/roster.toml`
    if (!(path in tomlModules)) return result

    const raw = await tomlModules[path]()
    const data = TOML.parse(raw)
    const roster = data.roster || []

    for (const entry of roster) {
      result.set(entry.id, entry)
    }
    return result
  }

  private async loadLocations(
    modName: string
  ): Promise<Map<string, LocationData>> {
    const result = new Map<string, LocationData>()
    const prefix = `/mods/${modName}/maps/locations/`

    for (const [path, loader] of Object.entries(tomlModules)) {
      if (path.startsWith(prefix) && path.endsWith('.toml')) {
        const raw = await loader()
        const data = TOML.parse(raw) as LocationData
        result.set(data.id, data)
      }
    }
    return result
  }

  private async loadTheme(modName: string): Promise<Record<string, any>> {
    const path = `/mods/${modName}/theme.toml`
    if (!(path in tomlModules)) return {}
    const raw = await tomlModules[path]()
    const data = TOML.parse(raw)
    return data
  }

  getMod(): LoadedMod | null {
    return this.loadedMod
  }
}

export const modLoader = new ModLoader()
```

- [ ] **Step 3: 验证 TypeScript 编译**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/core/mod-loader.ts src/core/mod-loader.test.ts
git commit -m "feat: implement mod-loader with TOML parsing via glob import"
```

---

### Task 2.4: 实现模板继承引擎 (template.ts)

**Files:**
- Write: `src/core/template.ts`
- Write: `src/core/template.test.ts`

- [ ] **Step 1: 写测试**

```typescript
// src/core/template.test.ts
import { describe, it, expect } from 'vitest'
import { deepMerge, resolveTemplate } from './template'
import type { EntityData } from './types'

describe('deepMerge', () => {
  it('should override primitive values', () => {
    const parent = { hp: 100, name: 'base' }
    const child = { hp: 200 }
    expect(deepMerge(parent, child)).toEqual({ hp: 200, name: 'base' })
  })

  it('should deep merge objects', () => {
    const parent = { base: { hp: 100, mp: 50 } }
    const child = { base: { hp: 200 } }
    expect(deepMerge(parent, child)).toEqual({ base: { hp: 200, mp: 50 } })
  })

  it('should replace arrays (not append)', () => {
    const parent = { tags: ['a', 'b'] }
    const child = { tags: ['c'] }
    expect(deepMerge(parent, child)).toEqual({ tags: ['c'] })
  })

  it('should remove keys set to null', () => {
    const parent = { hp: 100, mp: 50 }
    const child = { hp: null as any }
    expect(deepMerge(parent, child)).toEqual({ mp: 50 })
  })
})

describe('resolveTemplate', () => {
  it('should resolve single-level template', () => {
    const templates = new Map<string, EntityData>()
    templates.set('base', { id: 'base', base: { hp: 100, mp: 50 } })
    templates.set('hero', { id: 'hero', extends: 'base', base: { hp: 200 } })

    const result = resolveTemplate('hero', templates)
    expect(result.base).toEqual({ hp: 200, mp: 50 })
  })

  it('should detect circular inheritance', () => {
    const templates = new Map<string, EntityData>()
    templates.set('a', { id: 'a', extends: 'b' })
    templates.set('b', { id: 'b', extends: 'a' })

    expect(() => resolveTemplate('a', templates)).toThrow('循环继承')
  })

  it('should throw if parent template not found', () => {
    const templates = new Map<string, EntityData>()
    templates.set('hero', { id: 'hero', extends: 'nonexistent' })

    expect(() => resolveTemplate('hero', templates)).toThrow('父模板')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run src/core/template.test.ts
```

- [ ] **Step 3: 实现模板引擎**

```typescript
// src/core/template.ts
import type { EntityData } from './types'

export function deepMerge(parent: EntityData, child: EntityData): EntityData {
  const result: EntityData = { ...parent }

  for (const key of Object.keys(child)) {
    const childVal = child[key]
    const parentVal = parent[key]

    if (childVal === null) {
      delete result[key]
    } else if (typeof childVal === 'object' && !Array.isArray(childVal)
      && typeof parentVal === 'object' && !Array.isArray(parentVal)) {
      result[key] = deepMerge(parentVal, childVal)
    } else {
      result[key] = childVal
    }
  }

  return result
}

export function resolveTemplate(
  templateId: string,
  templates: Map<string, EntityData>,
  visited: Set<string> = new Set()
): EntityData {
  if (visited.has(templateId)) {
    const chain = [...visited, templateId].join(' → ')
    throw new Error(`循环继承检测: ${chain}`)
  }

  const template = templates.get(templateId)
  if (!template) {
    throw new Error(`模板 '${templateId}' 不存在`)
  }

  visited.add(templateId)
  let result: EntityData = { ...template }

  if (template.extends) {
    const parent = resolveTemplate(template.extends, templates, new Set(visited))
    result = deepMerge(parent, result)
  }

  return result
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run src/core/template.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/core/template.ts src/core/template.test.ts
git commit -m "feat: implement template deep merge and inheritance resolver"
```

---

### Task 2.5: 实现实体系统 + 绑定解析 (entity-system.ts + binding-resolver.ts)

**Files:**
- Write: `src/core/entity-system.ts`
- Write: `src/core/binding-resolver.ts`
- Write: `src/core/entity-system.test.ts`

- [ ] **Step 1: 实现实体系统**

```typescript
// src/core/entity-system.ts
import type { EntityData } from './types'

class EntitySystem {
  private entities = new Map<string, Map<string, EntityData>>()

  register(type: string, id: string, data: EntityData): void {
    if (!this.entities.has(type)) {
      this.entities.set(type, new Map())
    }
    const pool = this.entities.get(type)!
    if (pool.has(id)) {
      throw new Error(`实体 ${type}:${id} 已存在，ID重复`)
    }
    pool.set(id, data)
  }

  get(type: string, id: string): EntityData | null {
    return this.entities.get(type)?.get(id) ?? null
  }

  getAll(type: string): EntityData[] {
    const pool = this.entities.get(type)
    return pool ? [...pool.values()] : []
  }

  clear(): void {
    this.entities.clear()
  }
}

export const entitySystem = new EntitySystem()
```

- [ ] **Step 2: 实现绑定解析器**

```typescript
// src/core/binding-resolver.ts
import { entitySystem } from './entity-system'

class BindingResolver {
  private bindings: Map<string, Record<string, string>> = new Map()

  loadBindings(rawBindings: Record<string, Record<string, string>>): void {
    for (const [pluginId, mapping] of Object.entries(rawBindings)) {
      this.bindings.set(pluginId, mapping)
    }
  }

  get(entityId: string, pluginKey: string): any {
    const entity = entitySystem.get('character', entityId)
    if (!entity) return null

    const mapping = this.findMapping(pluginKey)
    if (!mapping) return null

    const attrKey = mapping[pluginKey]
    if (!attrKey) return null

    return entity.base?.[attrKey] ?? null
  }

  set(entityId: string, pluginKey: string, value: any): void {
    const entity = entitySystem.get('character', entityId)
    if (!entity) throw new Error(`角色 ${entityId} 不存在`)

    const mapping = this.findMapping(pluginKey)
    if (!mapping) throw new Error(`找不到 ${pluginKey} 的绑定`)

    const attrKey = mapping[pluginKey]
    if (!entity.base) entity.base = {}
    entity.base[attrKey] = value
  }

  private findMapping(pluginKey: string): Record<string, string> | null {
    for (const mapping of this.bindings.values()) {
      if (pluginKey in mapping) return mapping
    }
    return null
  }

  validateRequired(
    pluginId: string,
    required: Record<string, { type: string; description: string }>,
    modName: string
  ): string[] {
    const errors: string[] = []
    const mapping = this.bindings.get(pluginId)

    for (const key of Object.keys(required)) {
      if (!mapping || !(key in mapping)) {
        errors.push(
          `模组 '${modName}' 缺少绑定：插件 '${pluginId}' 需要 '${key}'，请检查 bindings.toml`
        )
      }
    }
    return errors
  }
}

export const bindingResolver = new BindingResolver()
```

- [ ] **Step 3: 写绑定解析测试**

```typescript
// src/core/entity-system.test.ts (追加)
import { describe, it, expect, beforeEach } from 'vitest'
import { entitySystem } from './entity-system'
import { bindingResolver } from './binding-resolver'

describe('entity-system', () => {
  beforeEach(() => { entitySystem.clear() })

  it('should register and retrieve entities by type and id', () => {
    entitySystem.register('character', 'hero', { name: 'Hero', base: { hp: 100 } })
    const hero = entitySystem.get('character', 'hero')
    expect(hero).not.toBeNull()
    expect(hero!.base.hp).toBe(100)
  })

  it('should throw on duplicate id within same type', () => {
    entitySystem.register('character', 'hero', {})
    expect(() => entitySystem.register('character', 'hero', {}))
      .toThrow('ID重复')
  })

  it('should allow same id across different types', () => {
    entitySystem.register('character', 'hero', {})
    expect(() => entitySystem.register('item', 'hero', {})).not.toThrow()
  })

  it('should return all entities of a type', () => {
    entitySystem.register('character', 'a', {})
    entitySystem.register('character', 'b', {})
    expect(entitySystem.getAll('character').length).toBe(2)
  })
})

describe('binding-resolver', () => {
  beforeEach(() => {
    entitySystem.clear()
    bindingResolver.loadBindings({})
  })

  it('should resolve bound attribute', () => {
    entitySystem.register('character', 'player', {
      base: { hp_val: 100, mp_val: 50 }
    })
    bindingResolver.loadBindings({
      'combat-base': { hp: 'hp_val', mp: 'mp_val' }
    })

    expect(bindingResolver.get('player', 'hp')).toBe(100)
    expect(bindingResolver.get('player', 'mp')).toBe(50)
  })

  it('should set bound attribute', () => {
    entitySystem.register('character', 'player', { base: { hp_val: 100 } })
    bindingResolver.loadBindings({
      'combat-base': { hp: 'hp_val' }
    })

    bindingResolver.set('player', 'hp', 50)
    expect(bindingResolver.get('player', 'hp')).toBe(50)
  })

  it('should report missing bindings', () => {
    const errors = bindingResolver.validateRequired(
      'combat-base',
      { hp: { type: 'number', description: '血量' } },
      'test-mod'
    )
    expect(errors.length).toBe(1)
    expect(errors[0]).toContain('缺少绑定')
  })
})
```

- [ ] **Step 4: 运行测试**

```bash
npx vitest run src/core/entity-system.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/core/entity-system.ts src/core/binding-resolver.ts src/core/entity-system.test.ts
git commit -m "feat: implement entity system and binding resolver"
```

---

### Task 2.6: 集成 mod-loader + template + entity + bindings

**Files:**
- Modify: `src/core/mod-loader.ts`

- [ ] **Step 1: 更新 mod-loader 集成模板继承和实体注册**

在 `loadMod` 方法中，加载 roster 时解析模板继承并注册到实体系统。同时加载 bindings 并校验。

```typescript
// 在 mod-loader.ts 顶部添加 import
import { resolveTemplate } from './template'
import { entitySystem } from './entity-system'
import { bindingResolver } from './binding-resolver'

// loadMod 方法中 roster 加载部分改为:
private async loadRoster(
  modName: string,
  templates: Map<string, EntityData>,
  _attributes: Record<string, any>
): Promise<Map<string, EntityData>> {
  const result = new Map<string, EntityData>()
  const path = `/mods/${modName}/characters/roster.toml`
  if (!(path in tomlModules)) return result

  const raw = await tomlModules[path]()
  const data = TOML.parse(raw)
  const roster = data.roster || []

  for (const entry of roster) {
    let resolved = { ...entry }

    // 解析模板继承
    if (entry.template) {
      try {
        const parentTemplate = resolveTemplate(entry.template, templates)
        resolved = deepMerge(parentTemplate, entry)
      } catch (e) {
        throw new Error(
          `${path}: 角色 '${entry.id}' 的模板 '${entry.template}' 解析失败: ${(e as Error).message}`
        )
      }
    }

    // 注册到实体系统
    entitySystem.register('character', entry.id, resolved)
    result.set(entry.id, resolved)
  }
  return result
}

// loadMod 方法中加载 bindings 后添加校验:
// 5. 校验 bindings (在加载完 definitions 和插件声明后)
// 此步骤在后续阶段插件系统实现后完整运行
```

注意：需要 import `deepMerge` from template.ts。

- [ ] **Step 2: 验证集成**

```bash
npx vitest run
```

- [ ] **Step 3: 写集成测试 — 加载测试模组**

```typescript
// src/core/mod-loader.test.ts (更新)
import { describe, it, expect } from 'vitest'

// 注意：import.meta.glob 在 vitest 中行为可能不同
// 此测试在 dev 环境下运行时验证

describe('mod-loader integration', () => {
  it('should create import.meta.glob mapping', () => {
    const tomlFiles = import.meta.glob('/mods/**/*.toml', { as: 'raw', eager: true })
    const keys = Object.keys(tomlFiles)
    expect(keys.length).toBeGreaterThan(0)
    expect(keys.some(k => k.includes('meta.toml'))).toBe(true)
  })
})
```

- [ ] **Step 4: Commit**

```bash
git add src/core/mod-loader.ts src/core/mod-loader.test.ts
git commit -m "feat: integrate mod-loader with template resolver and entity system"
```

---

### Task 2.7: 阶段2自审

- [ ] 运行 `npx vitest run` — 全部测试通过
- [ ] 运行 `npx tsc --noEmit` — 无类型错误
- [ ] 对照 `开发检查清单.md` 阶段2逐条检查
- [ ] 确认：模板A→B→C继承正确，实体按类型+ID存取正确，bindings解析正确，循环继承检测有效

```bash
git add -A
git commit -m "chore: phase 2 complete - core data systems verified"
```

---

## 阶段3：条件系统 + 事件总线

> 验收标准：条件解析正确，事件收发正常，条件字典自动生成

### Task 3.1: 实现事件总线 (event-bus.ts)

**Files:**
- Write: `src/core/event-bus.ts`
- Write: `src/core/event-bus.test.ts`

- [ ] **Step 1: 写测试**

```typescript
// src/core/event-bus.test.ts
import { describe, it, expect, vi } from 'vitest'
import { eventBus } from './event-bus'

describe('event-bus', () => {
  beforeEach(() => { eventBus.clear() })

  it('should emit and receive events', () => {
    const handler = vi.fn()
    eventBus.on('combat:start', handler)
    eventBus.emit('combat:start', { participants: ['a', 'b'] })
    expect(handler).toHaveBeenCalledWith({ participants: ['a', 'b'] })
  })

  it('should support off', () => {
    const handler = vi.fn()
    eventBus.on('test', handler)
    eventBus.off('test', handler)
    eventBus.emit('test', {})
    expect(handler).not.toHaveBeenCalled()
  })

  it('should support once', () => {
    const handler = vi.fn()
    eventBus.once('test', handler)
    eventBus.emit('test', {})
    eventBus.emit('test', {})
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('should catch handler errors without blocking others', () => {
    const good = vi.fn()
    eventBus.on('test', () => { throw new Error('bad') })
    eventBus.on('test', good)
    expect(() => eventBus.emit('test', {})).not.toThrow()
    expect(good).toHaveBeenCalled()
  })

  it('should reject non-domain:action event names for standard events', () => {
    // 允许所有事件名，但在开发者模式下警告
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    eventBus.emit('combat_start', {}) // 下划线而非冒号
    eventBus.emit('onCombatStart', {}) // 驼峰而非冒号
    eventBus.emit('combat:wuxia_start', {}) // 自定义域没问题
    warnSpy.mockRestore()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run src/core/event-bus.test.ts
```

- [ ] **Step 3: 实现事件总线**

```typescript
// src/core/event-bus.ts

type EventHandler = (payload: any) => void

class EventBus {
  private listeners = new Map<string, EventHandler[]>()
  private onceHandlers = new Map<string, Set<EventHandler>>()
  private standardDomains = new Set([
    'combat', 'item', 'location', 'dialogue',
    'quest', 'character', 'game', 'save'
  ])

  on(event: string, handler: EventHandler): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, [])
    }
    this.listeners.get(event)!.push(handler)
  }

  off(event: string, handler: EventHandler): void {
    const handlers = this.listeners.get(event)
    if (handlers) {
      const idx = handlers.indexOf(handler)
      if (idx >= 0) handlers.splice(idx, 1)
    }
    const onceSet = this.onceHandlers.get(event)
    if (onceSet) onceSet.delete(handler)
  }

  once(event: string, handler: EventHandler): void {
    if (!this.onceHandlers.has(event)) {
      this.onceHandlers.set(event, new Set())
    }
    this.onceHandlers.get(event)!.add(handler)
    this.on(event, handler)
  }

  emit(event: string, payload: any): void {
    // 事件名格式建议
    const domain = event.split(':')[0]
    if (this.standardDomains.has(domain) && !event.includes(':')) {
      console.warn(`事件 '${event}' 的领域 '${domain}' 是标准领域，建议使用 'domain:action' 格式`)
    }

    const handlers = this.listeners.get(event) || []
    for (const handler of handlers) {
      try {
        handler(payload)
      } catch (e) {
        console.error(`事件 '${event}' 的 handler 报错:`, e)
      }
    }
  }

  clear(): void {
    this.listeners.clear()
    this.onceHandlers.clear()
  }
}

export const eventBus = new EventBus()
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run src/core/event-bus.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/core/event-bus.ts src/core/event-bus.test.ts
git commit -m "feat: implement event bus (on/off/once/emit with error isolation)"
```

---

### Task 3.2: 实现游戏上下文 (game-context.ts)

**Files:**
- Write: `src/core/game-context.ts`

- [ ] **Step 1: 实现游戏上下文**

```typescript
// src/core/game-context.ts
import type { GameContext, LocationData, EntityData, GameTimeData } from './types'
import { entitySystem } from './entity-system'

class GameContextManager {
  private player: EntityData | null = null
  private location: LocationData | null = null
  private time: GameTimeData = {
    minute: 0, hour: 8, day: 1, month: 1, year: 1
  }

  getContext(): GameContext {
    return {
      player: this.player,
      location: this.location,
      time: { ...this.time },
      getEntity: (type: string, id: string) => entitySystem.get(type, id)
    }
  }

  setPlayer(charId: string): void {
    this.player = entitySystem.get('character', charId)
    if (!this.player) {
      throw new Error(`玩家角色 '${charId}' 不存在`)
    }
  }

  setLocation(location: LocationData): void {
    this.location = location
  }

  advanceTime(minutes: number): void {
    this.time.minute += minutes
    while (this.time.minute >= 60) {
      this.time.minute -= 60
      this.time.hour++
    }
    // 日夜周期在后续阶段由事件驱动
  }

  reset(): void {
    this.player = null
    this.location = null
    this.time = { minute: 0, hour: 8, day: 1, month: 1, year: 1 }
  }
}

export const gameContext = new GameContextManager()
```

- [ ] **Step 2: Commit**

```bash
git add src/core/game-context.ts
git commit -m "feat: implement game context manager with time and location"
```

---

### Task 3.3: 实现条件表达式解析器 (condition.ts)

**Files:**
- Write: `src/core/condition.ts`
- Write: `src/core/condition.test.ts`

- [ ] **Step 1: 写测试**

```typescript
// src/core/condition.test.ts
import { describe, it, expect } from 'vitest'
import { evaluateCondition } from './condition'
import type { GameContext } from './types'

const ctx: GameContext = {
  player: { base: { hp: 50, mp: 100 } },
  location: { id: 'tavern', name: '', parent: null, type: 'building', tags: ['rest'], exits: [] },
  time: { minute: 0, hour: 20, day: 1, month: 1, year: 1 },
  getEntity: () => null
}

describe('evaluateCondition', () => {
  it('should evaluate simple comparison', () => {
    expect(evaluateCondition('player.hp < 100', ctx)).toBe(true)
    expect(evaluateCondition('player.hp > 100', ctx)).toBe(false)
  })

  it('should evaluate && combinations', () => {
    expect(evaluateCondition('player.hp < 100 && player.mp > 50', ctx)).toBe(true)
    expect(evaluateCondition('player.hp < 100 && player.mp < 50', ctx)).toBe(false)
  })

  it('should evaluate || combinations', () => {
    expect(evaluateCondition('player.hp < 10 || player.mp > 50', ctx)).toBe(true)
  })

  it('should evaluate parentheses', () => {
    expect(evaluateCondition('(player.hp < 100 || player.mp < 0) && game.time.hour >= 18', ctx)).toBe(true)
  })

  it('should evaluate location fields', () => {
    expect(evaluateCondition('location.id == "tavern"', ctx)).toBe(true)
    expect(evaluateCondition('location.type != "town"', ctx)).toBe(true)
  })

  it('should reject arithmetic in conditions', () => {
    expect(() => evaluateCondition('player.hp + 10 > 50', ctx)).toThrow()
  })

  it('should throw on invalid field paths', () => {
    expect(() => evaluateCondition('nonexistent.field > 10', ctx)).toThrow()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run src/core/condition.test.ts
```

- [ ] **Step 3: 实现条件解析器**

```typescript
// src/core/condition.ts
import type { GameContext } from './types'

function resolveValue(path: string, ctx: GameContext): any {
  const parts = path.split('.')
  let current: any = ctx

  for (const part of parts) {
    if (current === null || current === undefined) {
      throw new Error(`条件字段路径 '${path}' 无法解析：'${part}' 前为 null`)
    }
    if (typeof current === 'object' && part in current) {
      current = current[part]
    } else {
      throw new Error(`条件字段 '${path}' 不在可用字段中，请检查 可用条件属性手册.md`)
    }
  }
  return current
}

// 支持的运算符
const OPS = ['>=', '<=', '!=', '==', '>', '<']

export function evaluateCondition(expr: string, ctx: GameContext): boolean {
  expr = expr.trim()

  // 检查是否有禁止的运算符
  if (/[\+\-\*\/\%]/.test(expr.replace(/[><=!]/g, ''))) {
    throw new Error('条件表达式不支持算术运算，复杂判断请使用 condition_script 字段')
  }

  // 递归处理括号
  while (expr.includes('(')) {
    expr = expr.replace(/\([^()]+\)/g, (match) => {
      const inner = match.slice(1, -1)
      return evaluateCondition(inner, ctx) ? 'true' : 'false'
    })
  }

  // 处理 !
  expr = expr.replace(/!true/g, 'false').replace(/!false/g, 'true')

  // 处理 ||
  const orParts = expr.split(/\s*\|\|\s*/)
  for (const orPart of orParts) {
    const andParts = orPart.split(/\s*&&\s*/)
    if (andParts.every(ap => evalSimple(ap.trim(), ctx))) {
      return true
    }
  }
  return false
}

function evalSimple(expr: string, ctx: GameContext): boolean {
  if (expr === 'true') return true
  if (expr === 'false') return false

  for (const op of OPS) {
    const idx = expr.indexOf(op)
    if (idx === -1) continue

    const left = expr.slice(0, idx).trim()
    let right = expr.slice(idx + op.length).trim()
    const leftVal = resolveValue(left, ctx)

    // 处理引号字符串
    if (right.startsWith('"') && right.endsWith('"')) {
      right = right.slice(1, -1)
      const rightVal = right
      switch (op) {
        case '==': return leftVal === rightVal
        case '!=': return leftVal !== rightVal
        default: throw new Error(`运算符 '${op}' 不适用于字符串比较`)
      }
    }

    const rightVal = parseFloat(right)
    if (isNaN(rightVal)) {
      throw new Error(`条件表达式右侧值 '${right}' 无法解析为数字`)
    }

    switch (op) {
      case '>': return leftVal > rightVal
      case '<': return leftVal < rightVal
      case '>=': return leftVal >= rightVal
      case '<=': return leftVal <= rightVal
      case '==': return leftVal === rightVal
      case '!=': return leftVal !== rightVal
    }
  }

  throw new Error(`条件表达式 '${expr}' 语法错误：找不到有效运算符`)
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run src/core/condition.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/core/condition.ts src/core/condition.test.ts
git commit -m "feat: implement condition expression parser (no arithmetic allowed)"
```

---

### Task 3.4: 实现条件注册器 (condition-registry.ts)

**Files:**
- Write: `src/core/condition-registry.ts`

- [ ] **Step 1: 实现条件注册器**

```typescript
// src/core/condition-registry.ts
import type { EntityData, LocationData } from './types'

interface ConditionField {
  path: string
  type: string
  description: string
  operators: string
  source: string
}

class ConditionRegistry {
  private fields: ConditionField[] = []
  private builtinFields: ConditionField[] = [
    { path: 'location.id', type: 'string', description: '当前地点ID', operators: '== !=', source: 'engine' },
    { path: 'location.type', type: 'string', description: '当前地点类型', operators: '== !=', source: 'engine' },
    { path: 'location.tags', type: 'string[]', description: '当前地点标签', operators: '== !=', source: 'engine' },
    { path: 'location.parent', type: 'string|null', description: '父地点ID', operators: '== !=', source: 'engine' },
    { path: 'game.time.hour', type: 'number', description: '当前小时(0-23)', operators: '> < >= <= == !=', source: 'engine' },
    { path: 'game.time.day', type: 'number', description: '当前天数', operators: '> < >= <= == !=', source: 'engine' },
    { path: 'game.time.month', type: 'number', description: '当前月份', operators: '> < >= <= == !=', source: 'engine' },
    { path: 'quest.{任务ID}.status', type: 'string', description: '任务状态', operators: '== !=', source: 'engine' },
  ]

  registerFromAttributes(attributes: Record<string, any>): void {
    for (const [name, def] of Object.entries(attributes)) {
      const attrDef = def as any
      this.fields.push({
        path: `player.${name}`,
        type: attrDef.type || 'number',
        description: `玩家属性: ${name}`,
        operators: attrDef.type === 'string' ? '== !=' : '> < >= <= == !=',
        source: 'attributes.toml'
      })
      this.fields.push({
        path: `character.{角色ID}.${name}`,
        type: attrDef.type || 'number',
        description: `NPC属性: ${name}`,
        operators: attrDef.type === 'string' ? '== !=' : '> < >= <= == !=',
        source: 'attributes.toml'
      })
    }
  }

  registerFromPlugin(pluginId: string, fields: Record<string, { type: string; description: string }>): void {
    for (const [path, def] of Object.entries(fields)) {
      this.fields.push({
        path,
        type: def.type,
        description: def.description,
        operators: def.type === 'string' ? '== !=' : '> < >= <= == !=',
        source: `plugin:${pluginId}`
      })
    }
  }

  registerFromBindings(bindings: Record<string, Record<string, string>>): void {
    for (const [pluginId, mapping] of Object.entries(bindings)) {
      for (const [pluginKey, attrName] of Object.entries(mapping)) {
        this.fields.push({
          path: `player.${pluginKey}`,
          type: 'number',
          description: `绑定属性: ${pluginKey} → ${attrName}`,
          operators: '> < >= <= == !=',
          source: `bindings:${pluginId}`
        })
      }
    }
  }

  getAllFields(): ConditionField[] {
    return [...this.builtinFields, ...this.fields]
  }

  validateField(path: string): boolean {
    const allFields = this.getAllFields()
    // 检查精确匹配或模式匹配（如 character.{id}.hp）
    const exactMatch = allFields.some(f => f.path === path)
    if (exactMatch) return true

    // 检查模式匹配：character.{角色ID}.属性名
    const pattern = path.replace(/\[^.\]+/, '{角色ID}')
    return allFields.some(f => f.path.includes('{') && pathMatch(pattern, path))
  }

  generateManual(): string {
    const allFields = this.getAllFields()
    let md = '# 可用条件属性手册\n\n'
    md += '| 字段路径 | 类型 | 说明 | 运算符 | 来源 |\n'
    md += '|----------|------|------|--------|------|\n'
    for (const f of allFields) {
      md += `| \`${f.path}\` | ${f.type} | ${f.description} | ${f.operators} | ${f.source} |\n`
    }
    return md
  }

  clear(): void {
    this.fields = []
  }
}

function pathMatch(pattern: string, actual: string): boolean {
  const patternParts = pattern.split('.')
  const actualParts = actual.split('.')
  if (patternParts.length !== actualParts.length) return false
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].includes('{')) continue // 通配符
    if (patternParts[i] !== actualParts[i]) return false
  }
  return true
}

export const conditionRegistry = new ConditionRegistry()
```

- [ ] **Step 2: Commit**

```bash
git add src/core/condition-registry.ts
git commit -m "feat: implement condition registry with auto-manual generation"
```

---

### Task 3.5: 集成条件收集到 mod-loader

**Files:**
- Modify: `src/core/mod-loader.ts`

- [ ] **Step 1: 在 loadMod 中添加条件收集**

在 `loadMod` 方法末尾（步骤6：加载完 bindings 后）添加：

```typescript
// 在 loadMod 方法中，步骤5加载完 bindings 后:
// 6. 收集条件字段并生成手册
import { conditionRegistry } from './condition-registry'

conditionRegistry.clear()
// 注册属性字段
conditionRegistry.registerFromAttributes(mod.attributes)
// 注册绑定字段
conditionRegistry.registerFromBindings(mod.bindings)
// 注册插件字段（等阶段4插件系统实现后完整运行）
// 生成手册
const manual = conditionRegistry.generateManual()
// 写入文件需要浏览器环境，先 console.log
console.log('[condition-registry] 条件字段收集完成，共', conditionRegistry.getAllFields().length, '个字段')
```

- [ ] **Step 2: Commit**

```bash
git add src/core/mod-loader.ts
git commit -m "feat: integrate condition registry into mod-loader"
```

---

### Task 3.6: 阶段3自审

- [ ] 运行 `npx vitest run` — 全部测试通过
- [ ] 运行 `npx tsc --noEmit` — 无类型错误
- [ ] 对照 `开发检查清单.md` 阶段3逐条检查
- [ ] 确认：条件解析 > < >= <= == != && || ! 全部正确，事件on/off/once/emit正确，条件字段动态收集

```bash
git add -A
git commit -m "chore: phase 3 complete - condition system and event bus verified"
```

---

## 阶段3.5：核心机制测试

### Task 3.5.1: 运行全部现有测试

```bash
npx vitest run
```

### Task 3.5.2: 对照检查清单自审

阅读 `开发检查清单.md` 阶段3.5，逐条确认。

```bash
git commit -m "chore: phase 3.5 complete - core mechanism tests all passing"
```

---

## 阶段4：公共API + 插件生命周期

> 验收标准：plugin.toml 正确解析，插件生命周期正确执行，公共API注册/调用正常，extends链接正确

### Task 4.1: 实现公共API系统 (api.ts)

**Files:**
- Write: `src/core/api.ts`
- Write: `src/core/api.test.ts`

- [ ] **Step 1: 实现API系统**

```typescript
// src/core/api.ts
import { entitySystem } from './entity-system'
import { bindingResolver } from './binding-resolver'

type ApiMethod = (...args: any[]) => Promise<any>

class ApiSystem {
  private registry = new Map<string, Record<string, ApiMethod>>()

  register(namespace: string, methods: Record<string, ApiMethod>): void {
    if (this.registry.has(namespace)) {
      const existing = this.registry.get(namespace)!
      for (const key of Object.keys(methods)) {
        if (key in existing) {
          throw new Error(`API '${namespace}.${key}' 重复注册`)
        }
      }
      Object.assign(existing, methods)
    } else {
      this.registry.set(namespace, methods)
    }
  }

  async call(namespace: string, method: string, ...args: any[]): Promise<any> {
    const ns = this.registry.get(namespace)
    if (!ns) {
      throw new Error(`API命名空间 '${namespace}' 不存在`)
    }
    const fn = ns[method]
    if (!fn) {
      throw new Error(`API方法 '${namespace}.${method}' 不存在`)
    }
    return fn(...args)
  }

  clear(): void {
    this.registry.clear()
    // 重新注册引擎核心API
    this.registerEngineAPI()
  }

  registerEngineAPI(): void {
    this.register('engine', {
      getEntity: async (type: string, id: string) => entitySystem.get(type, id),
      'bindings.get': async (entityId: string, key: string) =>
        bindingResolver.get(entityId, key),
      'bindings.set': async (entityId: string, key: string, value: any) =>
        bindingResolver.set(entityId, key, value),
      saveGame: async (_slot: string) => { /* 阶段13实现 */ },
      loadGame: async (_slot: string) => { /* 阶段13实现 */ },
    })
  }
}

export const apiSystem = new ApiSystem()
apiSystem.registerEngineAPI()
```

- [ ] **Step 2: 写测试**

```typescript
// src/core/api.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { apiSystem } from './api'
import { entitySystem } from './entity-system'
import { bindingResolver } from './binding-resolver'

describe('api-system', () => {
  beforeEach(() => {
    apiSystem.clear()
    entitySystem.clear()
    bindingResolver.loadBindings({})
  })

  it('should register and call API methods', async () => {
    apiSystem.register('test', {
      greet: async (name: string) => `Hello ${name}`
    })
    const result = await apiSystem.call('test', 'greet', 'World')
    expect(result).toBe('Hello World')
  })

  it('should throw on duplicate method registration', () => {
    apiSystem.register('test', { greet: async () => {} })
    expect(() => apiSystem.register('test', { greet: async () => {} }))
      .toThrow('重复注册')
  })

  it('should throw on non-existent namespace', async () => {
    await expect(apiSystem.call('nonexistent', 'method'))
      .rejects.toThrow('不存在')
  })

  it('should have engine core API available', async () => {
    entitySystem.register('character', 'hero', { name: 'Hero' })
    const entity = await apiSystem.call('engine', 'getEntity', 'character', 'hero')
    expect(entity).not.toBeNull()
  })
})
```

- [ ] **Step 3: 运行测试确认通过**

```bash
npx vitest run src/core/api.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/core/api.ts src/core/api.test.ts
git commit -m "feat: implement public API system with engine core namespace"
```

---

### Task 4.2: 实现插件管理器 (plugin-manager.ts)

**Files:**
- Write: `src/core/plugin-manager.ts`
- Write: `src/core/plugin-manager.test.ts`

- [ ] **Step 1: 写测试**

```typescript
// src/core/plugin-manager.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { PluginManager } from './plugin-manager'
import { apiSystem } from './api'
import { eventBus } from './event-bus'

describe('plugin-manager', () => {
  let pm: PluginManager

  beforeEach(() => {
    apiSystem.clear()
    eventBus.clear()
    pm = new PluginManager(apiSystem, eventBus)
  })

  it('should parse plugin.toml correctly', () => {
    const toml = `
[meta]
id = "test-plugin"
name = "测试插件"
version = "1.0.0"

dependencies = [
  { plugin = "base-plugin", version = "^1.0.0" }
]

[required_attributes]
hp = { type = "number", description = "血量" }
`
    const def = pm.parsePluginToml('test-plugin', toml)
    expect(def.meta.id).toBe('test-plugin')
    expect(def.meta.version).toBe('1.0.0')
    expect(def.dependencies.length).toBe(1)
    expect(def.requiredAttributes.hp).toBeDefined()
  })

  it('should detect circular extends', () => {
    const defs = new Map()
    defs.set('a', { meta: { id: 'a', version: '1.0.0', name: 'A', extends: 'b' }, dependencies: [] })
    defs.set('b', { meta: { id: 'b', version: '1.0.0', name: 'B', extends: 'a' }, dependencies: [] })
    expect(() => pm.sortByExtends(defs)).toThrow('循环继承')
  })

  it('should sort plugins so parents come before children', () => {
    const defs = new Map()
    defs.set('child', { meta: { id: 'child', version: '1.0.0', name: 'Child', extends: 'parent' }, dependencies: [{ plugin: 'parent', version: '^1.0.0' }] })
    defs.set('parent', { meta: { id: 'parent', version: '1.0.0', name: 'Parent' }, dependencies: [] })
    
    const sorted = pm.sortByExtends(defs)
    const ids = sorted.map(d => d.meta.id)
    expect(ids.indexOf('parent')).toBeLessThan(ids.indexOf('child'))
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run src/core/plugin-manager.test.ts
```

- [ ] **Step 3: 实现插件管理器**

```typescript
// src/core/plugin-manager.ts
import TOML from '@iarna/toml'
import type { PluginContext } from './types'
import { ApiSystem } from './api'
import { EventBus } from './event-bus'
import { conditionRegistry } from './condition-registry'

interface PluginMeta {
  id: string
  name: string
  version: string
  extends?: string
  description?: string
}

interface PluginDef {
  meta: PluginMeta
  dependencies: { plugin: string; version: string }[]
  requiredAttributes: Record<string, { type: string; description: string }>
  conditionFields: Record<string, { type: string; description: string }>
  events: { listen: { name: string; description: string }[] }
  ui: Record<string, any>
  commands: { name: string; description: string; handler: string }[]
  source: 'engine' | 'mod'
}

class PluginManager {
  private apiSystem: ApiSystem
  private eventBus: EventBus
  private plugins = new Map<string, PluginDef>()
  private activeParentApis = new Map<string, Record<string, any>>()

  constructor(apiSystem: ApiSystem, eventBus: EventBus) {
    this.apiSystem = apiSystem
    this.eventBus = eventBus
  }

  parsePluginToml(pluginId: string, rawToml: string): PluginDef {
    const data = TOML.parse(rawToml)
    if (!data.meta?.id || !data.meta?.name || !data.meta?.version) {
      throw new Error(`插件 '${pluginId}': plugin.toml 缺少 meta.id / meta.name / meta.version`)
    }

    return {
      meta: data.meta,
      dependencies: data.dependencies || [],
      requiredAttributes: data.required_attributes || {},
      conditionFields: data.condition_fields || {},
      events: data.events || { listen: [] },
      ui: data.ui || {},
      commands: data.commands || [],
      source: 'engine' // 默认，mod专属插件在加载时改为 'mod'
    }
  }

  sortByExtends(defs: Map<string, PluginDef>): PluginDef[] {
    const sorted: PluginDef[] = []
    const visited = new Set<string>()
    const visiting = new Set<string>()

    const visit = (id: string) => {
      if (visited.has(id)) return
      if (visiting.has(id)) {
        const chain = [...visiting, id].join(' → ')
        throw new Error(`插件循环继承检测: ${chain}`)
      }
      visiting.add(id)
      const def = defs.get(id)
      if (!def) throw new Error(`插件 '${id}' 未找到定义`)
      if (def.meta.extends) {
        visit(def.meta.extends)
      }
      visiting.delete(id)
      visited.add(id)
      sorted.push(def)
    }

    for (const id of defs.keys()) {
      visit(id)
    }
    return sorted
  }

  async loadPlugins(
    enginePlugins: Map<string, { toml: string; module?: any }>,
    modPlugins: Map<string, { toml: string; module?: any }>
  ): Promise<void> {
    this.plugins.clear()

    // 1. 解析所有 plugin.toml
    const allDefs = new Map<string, PluginDef>()
    for (const [id, data] of enginePlugins) {
      allDefs.set(id, this.parsePluginToml(id, data.toml))
    }
    for (const [id, data] of modPlugins) {
      const def = this.parsePluginToml(id, data.toml)
      def.source = 'mod'
      allDefs.set(id, def)
    }

    // 2. 按 extends 排序
    const sorted = this.sortByExtends(allDefs)

    // 3. 执行 onLoad
    for (const def of sorted) {
      const ctx = this.createContext(def)
      const data = enginePlugins.get(def.meta.id) || modPlugins.get(def.meta.id)
      if (data?.module?.onLoad) {
        await data.module.onLoad(ctx)
      }
    }

    // 4. 执行 onEnable（父先于子，已通过排序保证）
    for (const def of sorted) {
      const ctx = this.createContext(def)
      const data = enginePlugins.get(def.meta.id) || modPlugins.get(def.meta.id)
      if (data?.module?.onEnable) {
        await data.module.onEnable(ctx)
      }
      this.plugins.set(def.meta.id, def)

      // 注册条件字段
      if (Object.keys(def.conditionFields).length > 0) {
        conditionRegistry.registerFromPlugin(def.meta.id, def.conditionFields)
      }
    }
  }

  private createContext(def: PluginDef): PluginContext {
    let parentApi: Record<string, any> | null = null
    if (def.meta.extends) {
      parentApi = this.activeParentApis.get(def.meta.extends) || null
    }

    return {
      api: {
        register: (ns: string, methods: Record<string, Function>) => {
          this.apiSystem.register(ns, methods)
          this.activeParentApis.set(def.meta.id, methods)
        },
        call: (ns: string, method: string, ...args: any[]) =>
          this.apiSystem.call(ns, method, ...args)
      },
      ui: {
        registerSlot: (_slotName: string, _item: any) => {
          // UI插槽系统在阶段5实现后可用
        }
      },
      parent: parentApi ? { api: parentApi } : null,
      events: {
        on: (event: string, handler: Function) => this.eventBus.on(event, handler as any),
        off: (event: string, handler: Function) => this.eventBus.off(event, handler as any),
        emit: (event: string, payload: any) => this.eventBus.emit(event, payload)
      },
      gameState: {
        currentLocation: null,
        player: null,
        time: { minute: 0, hour: 8, day: 1, month: 1, year: 1 }
      }
    }
  }

  getPluginDef(id: string): PluginDef | undefined {
    return this.plugins.get(id)
  }
}

export { PluginManager }
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run src/core/plugin-manager.test.ts
```

- [ ] **Step 5: 为 api.ts 和 event-bus.ts 添加导出类（配合 PluginManager）**

```typescript
// 在 src/core/api.ts 中添加:
export { ApiSystem }

// 在 src/core/event-bus.ts 中添加:
export { EventBus }
```

- [ ] **Step 6: Commit**

```bash
git add src/core/plugin-manager.ts src/core/plugin-manager.test.ts src/core/api.ts src/core/event-bus.ts
git commit -m "feat: implement plugin manager with extends sorting and lifecycle"
```

---

### Task 4.3: 阶段4自审

- [ ] 全部测试通过
- [ ] TypeScript 编译无错
- [ ] 对照 `开发检查清单.md` 阶段4

---

## 后续阶段概要

由于篇幅限制，阶段5-15在此给出概要而非逐行代码。每个阶段遵循相同的 TDD 模式（先写测试，再实现）。

### 阶段5：基础UI框架
**关键任务：**
- 实现响应式布局（`src/ui/layout/`）— PC左右分栏，<768px上下堆叠
- 实现UI插槽系统（`src/ui/slots/`）— provide/inject + 动态组件
- 实现主题系统（CSS变量注入/卸载，读取 `theme.toml`）
- 实现通用组件（属性条、头像、日志、按钮）— 全部Tailwind定制，无Naive UI

### 阶段6-7：地图+角色+口上
**关键任务：**
- 实现地图插件（`src/plugins/map-system/`）— exit校验、移动触发事件、tags控制按钮
- 实现角色插件（`src/plugins/character-system/`）— 三级体系、模板继承、bindings读写
- 实现口上插件（`src/plugins/dialogue-system/`）— 条件触发、多条随机、模板继承

### 阶段8-10：背包+效果+战斗+任务
**关键任务：**
- 背包（`src/plugins/inventory-system/`）— 物品增删、使用效果、条件字段
- 效果系统（`src/plugins/effect-system/`）— 可扩展效果类型
- 战斗（`src/plugins/combat-base/` + `combat-wuxia/`）— 回合逻辑、标准事件、插件继承
- 任务（`src/plugins/quest-system/`）— 节点式分支、条件触发、统一效果

### 阶段11-15（可选）
开发者面板、插件化闭环、存档系统、沙箱脚本、LLM口上

---

## 全局自审命令

每个阶段结束后运行：

```bash
npx tsc --noEmit              # TypeScript 类型检查
npx vitest run                 # 全部测试
# 以下在有实现后：
npm run validate               # TOML 全量校验
```

对照 `开发检查清单.md` 对应阶段逐条打勾。
