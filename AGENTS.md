# AGENTS.md — era-engine

## 项目定位
- **绿色项目**（尚无任何代码/配置/提交），从零搭建现代化文字MUD游戏引擎
- 对标 EmuERA/eraTW，核心原则：引擎/内容彻底分离、玩法插件化、多模组热切换
- 第一目标模组：武侠同人ERA，后续可切换哈利波特/仙侠等世界观

## 必读参考文档
位于 `前期与ai对话的参考文档/`：
- **架构总纲**：`文字MUD游戏引擎 架构与开发规范总览（ai自动生成，可能有错误但可参考）.md`
  - 三层架构（core/plugins/mods）、技术栈、分阶段计划 —— 整体方向正确，但以下点已被本文件纠正：
    - 地图不应硬编码三级（改平铺+parent）
    - TOML主力不再兼容YAML（只支持TOML）
    - 角色不应只有单文件夹模式（新增批量清单）
    - 属性不应写死在插件里（新增属性别名+绑定机制）
- **用户需求原文**：`我对ai描述的需求及问题.md` —— 理解玩法需求的第一手来源
- **条件字典机制**：`全局属性字典的ai自动生成的建议说明.md` —— 条件注册与自动汇总的机制参考
- **角色关系/移动**：`角色关系系统ai自动生成的参考.md`、`武侠mod中角色自动移动倾向参考.md`
- 其余文档为AI对话记录，有参考价值但不作为规范，与本文件冲突时以本文件为准

## 技术栈（严格遵循，不可换）
| 层 | 技术 | 用途 |
|----|------|------|
| 框架 | Vue 3 + TypeScript | 全项目统一 |
| 构建 | Vite | 构建/热更新/打包 |
| 状态 | Pinia | 仅UI状态同步，不存游戏数据 |
| 样式 | Tailwind CSS + CSS变量 | 主题系统，所有视觉走变量 |
| 组件 | Naive UI | 仅辅助界面（设置/存档/面板），核心游戏界面全定制 |
| 数据 | @iarna/toml | 主力数据格式，只支持TOML（不支持YAML） |
| 存储 | Dexie.js | IndexedDB存档，多命名空间隔离 |
| 脚本 | 自定义沙箱 | 动态逻辑用JS钩子（仅5%场景） |
| 测试 | Vitest | 单元测试 + 插件隔离测试 |

## 引擎源码目录结构（src/）
```
src/
├── core/                    # 内核：纯通用机制，禁止任何具体玩法/世界观/美术
│   ├── mod-loader.ts        # 模组加载器（TOML解析、模板继承、实体注册）
│   ├── plugin-manager.ts    # 插件发现、生命周期管理、依赖检查
│   ├── entity-system.ts     # 通用实体管理（按类型+ID存取，纯数据层）
│   ├── template.ts          # 模板深合并引擎（支持多级继承）
│   ├── binding-resolver.ts  # 属性绑定解析器（插件声明 ↔ 模组属性映射）
│   ├── condition.ts         # 条件表达式解析（仅支持比较+逻辑运算）
│   ├── event-bus.ts         # 事件总线（发布订阅、优先级、通配符）
│   ├── save-system.ts       # 存档/读档（Dexie.js，命名空间隔离）
│   ├── game-context.ts      # 全局游戏状态容器
│   ├── condition-registry.ts # 条件字段注册与手册生成
│   ├── error-reporter.ts     # 统一错误上报
│   ├── types.ts              # 所有核心接口定义（PluginContext/GameContext等）
│   └── api.ts               # 对外公共API注册器
├── plugins/                 # 通用玩法插件（多套可并存，模组按需启用）
│   ├── combat-base/         # 回合制战斗骨架（HP扣减、状态结算、事件钩子）
│   ├── combat-wuxia/        # 武侠战斗（extends combat-base）
│   ├── map-system/          # 地图与移动系统
│   ├── character-system/    # 角色属性管理（运行时读写绑定、AI行为等）
│   ├── dialogue-system/     # 口上与对话系统
│   ├── inventory-system/    # 背包物品系统
│   ├── quest-system/        # 任务剧情系统
│   └── effect-system/       # 统一效果执行器
├── ui/                      # UI层
│   ├── layout/              # 响应式整体布局（PC左右分栏、手机上下堆叠）
│   ├── components/          # 全定制游戏组件（属性条、头像、日志、按钮）
│   ├── views/               # 核心界面（主场景、战斗、对话、地图、背包）
│   ├── dev-panel/           # 开发者面板（属性字典、事件追踪、控制台、数据查看）
│   └── slots/               # UI插槽注册系统
└── utils/                   # 工具库
    ├── toml-validator.ts    # TOML结构校验（精准报文件名+行号）
    └── sandbox.ts           # 沙箱脚本执行环境
```

## 模组目录结构（mods/[模组名]/）
每个模组 = 一个独立游戏世界。一次只启用一个模组，切换需重启。存档按模组隔离。
```
mods/武侠/
├── meta.toml                # 模组元信息 + 依赖插件声明（含semver版本号）
├── bindings.toml            # 属性绑定：插件通用名 → 模组实际属性
├── theme.toml               # 主题变量（颜色、字体、圆角、间距）
├── theme.css                # 【可选】自定义样式（纹理、边框、动画）
├── definitions/
│   ├── attributes.toml      # 所有自定义属性定义
│   ├── talents.toml         # 天赋/特质定义
│   ├── abilities.toml       # 技能/能力定义
│   ├── items.toml           # 物品/装备定义
│   ├── factions.toml        # 势力/门派定义
│   ├── relations.toml       # 关系类型定义
│   └── status-effects.toml  # 状态/buff定义
├── templates/
│   ├── character/           # 角色模板（多级继承链）
│   └── item/                # 物品模板
├── characters/
│   ├── named/               # 重要角色：独立文件夹（50-100人）
│   │   └── linghuchong/
│   │       ├── base.toml
│   │       ├── dialogue.toml
│   │       ├── behavior.toml
│   │       └── assets/
│   ├── roster.toml          # 次要角色：批量清单（500人，每人8-10行）
│   └── npc.toml             # 路人NPC：纯模板实例化
├── maps/
│   └── locations/           # 地点平铺，parent字段定义层级
│       ├── zhongyuan.toml   # 中原（type=region, parent=null）
│       ├── huashan.toml     # 华山（parent=zhongyuan）
│       └── siguoya.toml     # 思过崖（parent=huashan）
├── quests/
│   ├── main/                # 主线任务（每个任务一个toml）
│   └── side/                # 支线任务
├── scripts/                 # 模组自定义JS脚本（沙箱执行）
├── plugins/                 # 【可选】模组专属插件（仅此模组加载）
├── migrations/              # 存档版本迁移规则
└── assets/                  # 全局素材
```

---

## 三步走启动（阶段1 —— 第一个可交付物）

### 目标
创建空项目，装齐所有依赖，建好完整目录，能 `npm run dev` 正常启动。

### 步骤
1. **创建项目**：`npm create vite@latest era-engine -- --template vue-ts`
2. **安装依赖**：
   ```
   npm install pinia @iarna/toml dexie @vueuse/core
   npm install -D tailwindcss @tailwindcss/vite vitest
   ```
   可选（阶段5再加）：`naive-ui`
3. **配置**：
   - `vite.config.ts`：设置 `@/` 路径别名、Tailwind插件、TOML导入支持
   - `tailwind.config.ts`：配置CSS主题变量基础
   - `tsconfig.json`：路径别名
4. **建目录**：按照上方「引擎源码目录结构」创建所有空目录，各目录下加 `.gitkeep`
5. **创建配置文件**：项目根目录下创建 `era-engine.config.toml`，写入 `active_mod = ""`（阶段2有测试模组后再填）
6. **验证**：`npm run dev` 无报错，页面显示正常

### 验收
- 浏览器打开无报错
- `src/core/`、`src/plugins/`、`src/ui/`、`mods/` 目录结构完整
- Tailwind CSS 样式生效

---

## 初始化与加载顺序（严格遵循）
阶段1之后的开发必须按此顺序初始化引擎：
1. TOML 解析器初始化（加载 `@iarna/toml`）
2. 插件管理器扫描 `src/plugins/` 下所有含 `plugin.toml` 的目录 → 执行各插件 `onLoad`
3. 模组加载器读取活跃模组的 `meta.toml` → 校验插件依赖（含semver）→ 缺少依赖则精准报错
4. 加载模组专属插件（`mods/[模组名]/plugins/` 下含 `plugin.toml` 的目录，执行 `onLoad`）
5. 加载模组 `definitions/` → 模板继承深合并 → 实体系统注册
6. 加载模组 `bindings.toml` → 校验所有启用插件所需属性都已绑定 → 缺绑定则精准报错
7. 条件注册器汇总所有条件字段 → 生成 `可用条件属性手册.md`（详见第21节）
8. 加载角色/地图/物品/任务等模组内容数据（加载时校验 condition 字段）
9. 执行插件 `onEnable`（子插件在父插件之后）
10. Vue 应用挂载 → Pinia store 初始化 → UI插槽注册 → 首场景渲染

---

## 关键机制详解

### 1. 属性系统：三层解耦

**核心原则**：引擎不认识任何属性名。所有属性名都是模组自定义的字符串key。

**模组定义**（`definitions/attributes.toml`）：
```toml
[attributes]
气血 = { type = "number", default = 100, category = "base" }
内力 = { type = "number", default = 50, category = "base" }
攻击力 = { type = "number", default = 10, category = "combat" }
调教度 = { type = "number", default = 0, category = "h" }
```

**插件声明**（`plugin.toml`）：
```toml
# combat-wuxia 需要这些通用属性
[required_attributes]
hp = { type = "number", description = "生命值，用于战斗扣减" }
mp = { type = "number", description = "能量值，用于技能消耗" }
attack = { type = "number", description = "攻击力，用于伤害计算" }
```

**模组绑定**（`bindings.toml`）：
```toml
[bindings.combat-wuxia]
hp = "气血"
mp = "内力"
attack = "攻击力"
# 调教度不需要绑定——只有本模组脚本访问
```

**代码读写API**——插件禁止直接写 `character.base.气血`，必须走引擎API：
```typescript
// ✅ 正确：通过引擎公共API + 绑定系统
const hp = ctx.api.call('engine', 'bindings.get', characterId, 'hp')
ctx.api.call('engine', 'bindings.set', characterId, 'hp', newValue)

// ❌ 错误：硬编码属性名
const hp = entity.base.气血
```

**加载时自动校验**：模组启用了 `combat-wuxia`，但其 `bindings.toml` 里没有 `[bindings.combat-wuxia].hp` → 报错「模组 `武侠` 缺少绑定：插件 `combat-wuxia` 需要 `hp`，请检查 `bindings.toml`」

**计算属性**：属性可在 `attributes.toml` 中标注需要脚本计算：
```toml
[attributes.最大气血]
type = "number"
compute = "calc_max_hp.js"   # 接收角色全部属性，返回计算值
```

---

### 2. 角色三级体系

| 级别 | 存放位置 | 数量 | 格式 |
|------|----------|------|------|
| 重要角色 | `characters/named/[角色ID]/` | 50-100 | 独立文件夹，含 base/dialogue/behavior/assets |
| 次要角色 | `characters/roster.toml` | 500+ | 单文件批量清单，每人8-10行 |
| 路人NPC | `characters/npc.toml` | 不限 | 纯模板实例化，运行时按需生成 |

**roster.toml 格式**：
```toml
[[roster]]
id = "华山_陆大有"
template = "huashan_disciple"
name = "陆大有"
base = { 年龄 = 18 }
abilities = { 华山剑法 = 3, 混元功 = 2 }
factions = { 华山派 = "弟子" }
behavior = { activity = 0.5, home_locations = { 华山_练武场 = 0.7 } }
```

**升级规则**：roster 角色如需独立台词/素材，把 `id` 从 roster 移到 `named/` 目录，保留原条目中差异属性作为 `base.toml` 的 override 输入。数据格式兼容。

**NPC生命周期**：
- 首次遇到时按模板生成，存入存档
- 下次加载：基础属性重新读取当前模板（反映任何手工修改），运行时状态（当前位置、临时buff等）从存档恢复
- 模板改动（如改默认HP）自动对所有该模板的NPC生效

---

### 3. 地图：平铺+parent（不限深度）

地点文件全部放在 `maps/locations/`，`parent` 字段定义层级：

```toml
# maps/locations/lingzhou_city.toml
id = "lingzhou_city"
name = "灵州城"
parent = "xixia_region"
type = "city"
tags = ["has_shop", "has_tavern", "has_palace"]
exits = [
  { target = "lingzhou_palace", name = "入宫" },
  { target = "lingzhou_tavern", name = "酒馆" }
]
```

- `type` 用户自定义（city/region/room/field...），引擎不预设，但可用于UI过滤
- `tags` 用于自动显示/隐藏对应功能按钮（有 `has_shop` → 显示交易按钮）
- `parent = null` 表示顶级
- **exit 校验**：加载时检查所有 exit 的 target ID 是否真实存在，不存在则报错（文件名+行号）
- **不可达警告**：没有其他地点指向此地的地点给出警告（可能是设计遗漏）

---

### 4. 插件继承（不违反"禁止直接import"）

`extends` 是**声明式配置继承 + 引擎中介**，不是 `import` 源文件：

**父插件 `combat-base`** 提供：
- 回合循环骨架
- HP扣减逻辑
- 状态效果结算
- 自己的 `plugin.toml` 声明 `required_attributes`
- **内部钩子**（如 `damage_calc`）——不是标准事件，仅父插件内部暴露给子插件覆盖

**子插件 `combat-wuxia`**：
```toml
[meta]
id = "combat-wuxia"
extends = "combat-base"
```
- 自动继承父插件的 `required_attributes`
- 自动继承父插件的事件监听（可在子插件 onEnable 中覆盖）
- 通过引擎扩展API访问父插件暴露的钩子
- **不 import 父插件源文件**——引擎在加载时建立链接

**加载顺序**：父插件 `onLoad` → 子插件 `onLoad` → 父插件 `onEnable` → 子插件 `onEnable`（子插件在 onEnable 时可调用父插件已注册的API）

**不支持多继承**：每个插件最多 `extends` 一个父插件。需要组合多个能力时，通过事件总线监听多个来源。

---

### 5. "同类型插件统一接口" = 标准事件契约

不是要求所有战斗插件导出同一批函数，而是**必须发出/响应同一套标准事件**。这样其他系统（对话、任务）不关心底层是哪个插件：

| 事件名 | 发出者 | 参数 | 说明 |
|--------|--------|------|------|
| `combat:request` | 调用方 | `{ enemies: string[], context: string }` | 请求开始战斗 |
| `combat:start` | 战斗插件 | `{ participants: string[] }` | 战斗已开始 |
| `combat:turn` | 战斗插件 | `{ actor: string, action: string, target: string, result: object }` | 每回合 |
| `combat:end` | 战斗插件 | `{ winner: string, outcome: string }` | 战斗结束 |

所有插件自定义事件必须加插件名前缀（`potion:brewed`、`hypnosis:triggered`），防止命名冲突。标准事件不加前缀。

---

### 6. 事件命名规范
格式：`领域:动作`

标准领域：`combat`、`item`、`location`、`dialogue`、`quest`、`character`、`game`、`save`

自定义领域：插件ID前缀（如 `potion`、`hypnosis`）

**各标准领域的最小事件集**（所有同类插件必须发出/响应）：

| 领域 | 标准事件 | 说明 |
|------|----------|------|
| `item` | `item:added`、`item:removed`、`item:used` | 物品增减/使用 |
| `location` | `location:enter`、`location:leave` | 进入/离开地点 |
| `dialogue` | `dialogue:line`、`dialogue:end` | 口上触发/对话结束 |
| `quest` | `quest:started`、`quest:updated`、`quest:completed` | 任务状态变更 |
| `character` | `character:changed` | 角色属性变化 |
| `game` | `game:new_day`、`game:hour_changed`、`game:night_start`、`game:save`、`game:load` | 时间/存档 |
| `save` | （由 `game:save`/`game:load` 覆盖） | 存档相关走 game 域 |

### 7. 事件链调试
- 每个 handler 必须 try/catch 包裹，报错不阻断后续 handler
- 开发者面板「事件追踪」页：实时显示事件名 → 触发时间 → 处理耗时 → 成功/失败
- 插件加载错误：降级为「禁用该插件 + 弹红色警告（含文件名+行号+原因）」，不死锁启动

---

### 8. 条件系统：简单比较 vs 复杂脚本

**核心原则**：条件字段不是写死在引擎里的，是每次启动时动态收集的。

**条件路径结构**（路径格式惯例，具体可用字段由动态收集决定）：

```
player.{属性名}             — 玩家属性（属性名来自 attributes.toml）
character.{角色ID}.{属性名} — 指定NPC的属性
location.{字段}              — 当前地点属性（id/type/tags/parent）
game.time.{单位}             — 游戏时间（hour/day/month）
inventory.{物品ID}.count     — 背包物品数量
quest.{任务ID}.status        — 任务状态
{插件注册的任意字段}          — 各插件可注册自定义条件字段
```

以上是**路径结构惯例**，不是硬编码列表。引擎不认识任何具体属性名，所有可用字段来自：
- 模组 `definitions/attributes.toml` 中定义的所有属性 → 自动注册为条件字段
- 各个插件在 `plugin.toml` 中声明的 `condition_fields`
- 绑定属性也自动加入条件字典（`player.hp` 等价于 `player.气血`）

**动态收集流程**（详见第21节）→ 引擎启动时扫描以上来源，合成完整字段表，自动生成 `可用条件属性手册.md`。写条件时只能用手册里的字段，否则加载时报错。换模组后手册自动不同。

**TOML 条件**（只支持 `> < >= <= == != && || !` 和括号）：
```toml
condition = "player.气血 < 30"
condition = "(player.气血 < 30 || player.内力 < 20) && game.time.hour >= 18"
```

**复杂判断 → JS 钩子**（禁止在 TOML 里写算术/函数/正则）：
```toml
condition_script = "check_training_ready.js"
```

JS 钩子签名：`(context: GameContext) => boolean`

---

### 9. 模板深合并规则

子项继承父模板时，按字段类型差异合并：

| 字段类型 | 合并规则 |
|----------|----------|
| 基本类型（number/string/boolean） | 子覆盖父 |
| 对象 | 深合并：子的key覆盖父的同名key，父独有的key保留 |
| 数组 | 子**替换**父（不追加） |
| 设为 `null` | 从结果中**移除**该字段 |

支持无限层级继承。引擎内置循环继承检测（A→B→C→A），发现死循环精准报错（文件+行号+继承链）。

---

### 10. 模组切换机制

- **一次只启用一个模组**。在启动配置中指定当前活跃模组
- 切换模组 = 重启游戏，加载新模组的全部数据
- 存档按模组命名空间隔离：`saves/武侠/slot_1`、`saves/哈利波特/slot_1` 互不影响
- 模组专属插件放在 `mods/[模组名]/plugins/`，只在加载该模组时发现并启用

---

### 11. 依赖与版本约束

所有依赖声明强制使用 semver：

**模组 meta.toml**：
```toml
[meta]
id = "武侠"
name = "武侠世界"
version = "1.0.0"

dependencies = [
  { plugin = "combat-wuxia", version = "^1.0.0" },
  { plugin = "map-system", version = ">=1.0.0" }
]
```

**插件 plugin.toml**：
```toml
[meta]
id = "combat-wuxia"
name = "武侠回合制战斗"
version = "1.0.0"
extends = "combat-base"
dependencies = [
  { plugin = "combat-base", version = "^1.0.0" }
]
```

版本不匹配时：明确报错（需要哪个版本、当前是哪个版本），阻止加载。

---

### 12. 存档内容迁移

模组迭代时属性改名/删除，旧存档通过迁移链自动升级：

```toml
# mods/武侠/migrations/1.0_to_2.0.toml
[[migrations]]
rename = { old = "hp_max", new = "max_hp" }
[[migrations]]
default = { field = "stamina", value = 100 }
[[migrations]]
transform = { field = "attack", script = "recalc_attack.js" }
```

加载旧存档时按版本号顺序执行迁移，自动升级到最新格式。每个模组/插件的迁移独立管理。

---

### 13. NPC性能模型

- **计算范围**：只处理「玩家当前所在地 + 直接相邻（exits可达）」的角色AI。远方角色冻结
- **分帧调度**：每帧最多执行 10ms 的AI计算，未完成的角色延迟到下一帧
- **活跃度降频**：`activity < 0.3` 的角色，AI检查间隔从0.1秒降到5秒

---

### 14. 测试策略（强制）

在阶段3（条件系统+事件总线）之后，插入 **阶段3.5：核心机制测试**：
- 测试框架：Vitest
- 每个核心模块（条件解析、事件总线、模板继承、实体系统）必须有单元测试
- 每个插件必须有启用/禁用隔离测试（禁用后不影响其他插件运行）
- 提供一个最小测试模组（3个角色、2个地点）用于集成测试
- 测试命令：`npm run test`、`npm run test:unit`、`npm run test:plugins`

---

### 15. TOML格式自动校验
- 数据加载时严格TOML解析 + 结构校验，精准报文件名+行号+原因+建议
- 提供 `npm run validate` 命令——脱离游戏，独立校验所有模组数据文件
- 自动生成的条件手册也要校验：确保所有引用的字段路径真实存在于属性表中

### 16. 数据加载技术实现（TOML在浏览器SPA中如何加载）

**问题**：纯浏览器端无Node `fs`，`mods/` 下的TOML文件如何读入内存？

**方案**：使用 Vite 的 `import.meta.glob` —— 构建时自动扫描文件系统，生成映射表打入bundle，运行时按需加载原始字符串：

```typescript
// src/core/mod-loader.ts
const tomlFiles = import.meta.glob('/mods/**/*.toml', { as: 'raw' })

// 运行时加载某个文件
const rawToml = await tomlFiles['/mods/武侠/definitions/attributes.toml']()
const data = TOML.parse(rawToml)
```

**关键特性**：
- 构建时：Vite 扫描 `/mods/` 下所有 `.toml` 文件，生成路径→模块的映射表
- 运行时：`import()` 走 Vite 内置模块系统，dev模式走真实HTTP请求（支持HMR），生产模式走代码分割chunk
- 模组切换：`mod-loader` 仅加载目标模组的文件，不碰其他模组
- HMR：开发时改TOML → Vite检测文件变化 → 引擎收到更新 → 重新加载对应文件，无需刷新页面
- 局限：新增模组文件夹需重启Vite dev server（因glob在启动时扫描）。但切换模组本来就要求重启，不是额外负担

---

### 17. plugin.toml 完整格式规范

每个插件目录下必须含 `plugin.toml`，引擎通过扫描 `src/plugins/` 和 `mods/[模组名]/plugins/` 下含此文件的目录来发现插件：

```toml
[meta]
id = "combat-wuxia"           # 必需：全局唯一ID（英文/拼音，推荐 kebab-case）
name = "武侠回合制战斗"        # 必需：显示名称
version = "1.0.0"            # 必需：semver版本号
extends = "combat-base"      # 可选：继承的父插件ID（最多一个）
description = "武侠风格的回合制战斗插件"  # 可选

# 必需：插件依赖声明
dependencies = [
  { plugin = "combat-base", version = "^1.0.0" }
]

# 可选：本插件需要模组绑定的属性（通用名 → 模组在bindings.toml中映射）
[required_attributes]
hp = { type = "number", description = "战斗用生命值" }
mp = { type = "number", description = "战斗用能量值" }
attack = { type = "number", description = "攻击力" }

# 可选：本插件注册到条件字典的字段
[condition_fields]
"combat.in_progress" = { type = "boolean", description = "是否正在战斗中" }
"combat.turn_count" = { type = "number", description = "当前战斗回合数" }

# 可选：本插件监听的事件
[[events.listen]]
name = "combat:request"
description = "响应战斗请求"

[[events.listen]]
name = "item:used"
description = "战斗中物品使用"

# 可选：UI入口注册
[ui]
main_menu = [{ id = "combat_test", label = "战斗测试", priority = 100 }]
location_commands = [
  { id = "challenge_npc", label = "挑战", condition = "location.tags...has_hostile" }
]
character_commands = [
  { id = "talk_character", label = "交谈", priority = 10 },
  { id = "attack_character", label = "攻击", priority = 90 }
]

# 可选：注册到控制台的GM指令
[[commands]]
name = "@battle_test"
description = "触发一场测试战斗"
handler = "test_battle.js"
```

**字段说明**：
- `meta.id`、`meta.name`、`meta.version` 为必填
- `extends`：声明继承，引擎加载时建立父子链接（详见第18节）
- `dependencies`：依赖的插件列表，含semver版本约束。引擎启动时校验
- `required_attributes`：声明本插件需要读写的通用属性名。模组在 `bindings.toml` 中映射到实际属性
- `condition_fields`：本插件贡献到全局条件字典的字段
- `ui`：本插件注册的UI入口，引擎自动挂载到对应位置

---

### 18. 插件继承技术实现细节

`extends` 不违反"禁止直接import"的机制：

**父插件暴露什么**：
- 父插件在 `onEnable` 中将自身功能注册到引擎的公共API系统
- 父插件将可定制的钩子暴露给引擎（如 `damage_calc_hook`）

**引擎如何建立链接**：
1. 加载顺序确保父先于子：父 `onLoad` → 子 `onLoad` → 父 `onEnable` → 子 `onEnable`
2. 子插件 `onEnable` 时，引擎将父插件已注册的API引用传入子插件的上下文：
```typescript
// combat-wuxia 入口
export function onEnable(ctx: PluginContext) {
  // ctx.parent.api 是父插件 combat-base 注册的全部公共API
  const parentCombat = ctx.parent.api.combat
  
  // 使用父插件的功能
  parentCombat.startBattle(enemies)
  
  // 覆盖父插件的钩子
  parentCombat.registerHook('damage_calc', wuxiaDamageFormula)
  
  // 注册自己的扩展
  ctx.api.register('combat-wuxia', { getQiLevel, ... })
}
```

**自动继承的内容**：
- `required_attributes`：子插件自动继承父插件的属性需求
- 事件监听：子插件可覆写父插件的事件handler

**不支持多继承**：每个插件最多 `extends` 一个父插件。需要组合多个能力时，通过事件总线监听多个来源。

**循环继承检测**：引擎在加载时检测 `extends` 链，发现死循环精准报错（A→B→C→A）。

**PluginContext 完整接口**（引擎传给每个插件 `onLoad`/`onEnable` 的上下文对象）：
```typescript
interface PluginContext {
  // 公共API系统
  api: {
    register: (namespace: string, methods: Record<string, Function>) => void
    call: (namespace: string, method: string, ...args: any[]) => Promise<any>
  }
  // UI插槽注册
  ui: {
    registerSlot: (slotName: string, item: UISlotItem) => void
  }
  // 父插件（extends 时非空）
  parent: {
    api: Record<string, any>   // 父插件注册的全部公共API
  } | null
  // 事件总线
  events: {
    on: (event: string, handler: Function) => void
    off: (event: string, handler: Function) => void
    emit: (event: string, payload: any) => void
  }
  // 当前游戏状态（只读快照）
  gameState: {
    currentLocation: LocationData | null
    player: EntityData | null
    time: GameTimeData
  }
}
```

---

### 19. UI插槽技术实现

**机制**：使用 Vue 3 `provide/inject` + 动态组件渲染。

**两种注册方式**：
- **静态声明**（`plugin.toml` 的 `[ui]` 段）：适用于始终存在的UI入口（菜单项、指令按钮）。引擎在 `onEnable` 时自动挂载
- **动态注册**（`ctx.ui.registerSlot()`）：适用于条件驱动的UI入口（如"只在有采集tag的地点显示采集按钮"）

**引擎端**：
- 主布局组件（`src/ui/layout/`）`provide` 插槽注册表（响应式数组）
- 预定义插槽名：`location-panel`（地点信息区）、`character-list`（角色列表区）、`command-bar`（底部指令栏）、`log-panel`（日志区）、`main-menu`（主菜单侧栏）
- 每个插槽区渲染时用 `<component :is="item.component" />` 遍历注册表

**插件端**——在 `onEnable` 中注册：
```typescript
// 注册一个地点指令按钮
ctx.ui.registerSlot('command-bar', {
  id: 'gather_herbs',
  component: GatherButton,        // Vue SFC组件
  priority: 50,                    // 数字越小越靠前
  condition: (gameCtx) => gameCtx.location.tags?.includes('has_gather')
})
```

**插件 `onDisable` 时自动移除注册**。引擎确保：
- 同名 slot + 同 id 的重复注册被拒绝
- 条件函数实时求值，不满足时组件不渲染
- 优先级排序渲染

**UISlotItem 接口定义**：
```typescript
interface UISlotItem {
  id: string                     // 唯一标识
  component: Component           // Vue SFC 组件
  priority: number               // 排序优先级，数字越小越靠前
  condition?: (ctx: GameContext) => boolean  // 可选：满足条件才渲染
}
```

**GameContext 接口定义**（供条件求值和插件访问的全局只读状态）：
```typescript
interface GameContext {
  player: EntityData | null           // 玩家实体
  location: LocationData | null       // 当前地点
  time: GameTimeData                  // 游戏时间
  getEntity: (type: string, id: string) => EntityData | null  // 查询任意实体
}
```

**相关领域类型**（由模组/插件数据结构决定，以下为最小共识）：
```typescript
interface GameTimeData {
  minute: number     // 0-59
  hour: number       // 0-23
  day: number        // 自然日
  month: number      // 自然月
  year: number       // 年
}

interface LocationData {
  id: string
  name: string
  parent: string | null
  type: string       // 用户自定义
  tags: string[]
  exits: { target: string; name: string; time_cost?: number }[]
}

// EntityData 是动态键值对容器，字段完全由模组定义决定
// 典型字段：base（基础属性）、talents、abilities、relations、
// factions、inventory、behavior、current_location 等
// 内核只提供存取方法，不预设任何字段名
type EntityData = Record<string, any>
```

---

### 20. 公共API系统

**目的**：插件之间通信的唯一合法通道（除事件总线外）。

**插件注册自己的API**（在 `onEnable` 中）：
```typescript
ctx.api.register('combat', {
  startBattle: (enemies: string[], context?: string) => BattleResult,
  getParticipants: () => string[],
  registerHook: (hookName: string, handler: Function) => void
})
```

**插件调用其他插件已注册的API**：
```typescript
// 任务系统调用战斗API
const result = await ctx.api.call('combat', 'startBattle', ['enemy_01', 'enemy_02'])
// 背包系统查询地图信息
const currentLocation = ctx.api.call('map', 'getCurrentLocation')
```

**引擎职责**：
- 存储全局 API 注册表（按插件ID/模块名命名空间）
- 同命名空间下重复注册某个方法名 → 报错
- 调用不存在的API → 抛出明确错误（含插件名+方法名）
- 所有API返回 Promise（支持异步操作）

**核心API命名空间**（引擎提供的通用能力，无需插件注册）：
```typescript
ctx.api.call('engine', 'getEntity', type, id)     // 获取实体数据
ctx.api.call('engine', 'bindings.get', entityId, key)  // 读绑定属性
ctx.api.call('engine', 'bindings.set', entityId, key, value)  // 写绑定属性
ctx.api.call('engine', 'saveGame', slot)          // 存档
ctx.api.call('engine', 'loadGame', slot)          // 读档
```

---

### 21. 条件字段动态收集与手册生成

引擎启动时按以下顺序收集所有可用条件字段：

1. **扫描模组 `attributes.toml`** → 每个属性自动生成条件路径：
   - `player.{属性名}`（用于玩家）
   - `character.{角色ID}.{属性名}`（用于NPC）
   - 路径类型、运算符自动推断

2. **扫描插件 `condition_fields`** → 每个插件在 `plugin.toml` 中声明的字段加入字典

3. **扫描 `bindings.toml`** → 每个绑定自动生成条件路径（`player.hp` 等价于 `player.气血`）

4. **引擎内置基础字段**（固定存在）：
   - `location.id`（string）、`location.type`（string）、`location.tags`（string[]）、`location.parent`（string|null）
   - `game.time.hour`（number 0-23）、`game.time.day`（number）、`game.time.month`（number）
   - `quest.{任务ID}.status`（string：`not_started`/`active`/`completed`）

系统将以上全部汇总，自动生成 `可用条件属性手册.md`（表格格式，含字段路径/类型/运算符/说明/来源），放在项目根目录。

**校验**：加载任何含有 `condition` 字段的TOML文件时，引擎检查条件中的字段路径是否在手册中存在。不存在则精准报错（文件+行号+不存在的字段名+建议查看手册）。

**换模组后**：引擎重新走完整收集流程，生成属于新模组的手册。

---

### 22. 游戏时间系统

**数据结构**：
```typescript
game.time = { minute: number, hour: number, day: number, month: number, year: number }
```

**核心机制**：时间不由真实时钟驱动，由每个行动完成后推进。行动自身报告耗时（分钟），引擎调用 `advanceTime(分钟数)`。

**行动耗时写入数据**：
- 移动：每个 exit 可写 `time_cost = 30`（分钟），不写则按距离默认（跨区域60分钟、同区域5分钟）
- 技能/物品/烹饪：在技能或物品定义里写 `time_cost` 字段
- 对话/交互：行动代码内部返回耗时

**日夜周期**：
- `hour >= 24` → `hour -= 24`，`day++`，发出事件 `game:new_day`
- 每整点变化时发出 `game:hour_changed`
- 夜晚阈值（如22:00）发出 `game:night_start`，UI提示

**睡觉**：睡觉行动跳转到第二天自设时刻（如6:00），触发精力回复。睡眠逻辑由精力插件实现，引擎只提供时间推进 + 事件。

**条件字段**（基础字段，已包含在第21节）：
```
game.time.hour   — 当前小时（0-23）
game.time.day    — 当前天数
game.time.month  — 当前月份
```

**可扩展性**：任何系统（困意/精力/马匹/轻功等）只需：
- 监 `game:hour_changed` 等事件做自己的逻辑
- 行动耗时修正：行动内部读角色属性/物品后返回修正后的耗时即可，不改引擎

---

### 23. 角色-地点关联

角色出现在哪个地点，全部通过角色的 `behavior` 定义：

```toml
# characters/named/linghuchong/behavior.toml
activity = 0.7
home_locations = { 华山_思过崖 = 0.5, 华山_剑坪 = 0.3, 华山_酒馆 = 0.2 }
time_rules = [
  { hour_range = [20, 23], target = "华山_酒馆", weight = 0.9 },
  { hour_range = [0, 6], target = "华山_卧室", weight = 1.0 }
]

# roster.toml 里
behavior = { activity = 0.5, home_locations = { 华山_练武场 = 0.7 } }
```

- **启动/读档时**：角色初始放在权重最高的 home_location
- **运行时 `current_location`**：是运行时状态，存于存档
- **地图系统不存角色列表**——角色系统按 `current_location == target_location_id` 反向查询
- `activity = 0` 的角色永不动

### 角色关系数据格式

`definitions/relations.toml` 定义有哪些关系种类（双向）：

```toml
# definitions/relations.toml
[types]
好感度 = { min = 0, max = 100, default = 30, name = "好感度" }
师徒值 = { min = 0, max = 100, default = 0, name = "师徒值" }
仇恨值 = { min = 0, max = 100, default = 0, name = "仇恨值" }
```

单个角色的关系值写在角色 `base.toml`（或 roster 条目）的 `relations` 字段中：

```toml
# 角色的 base.toml
relations = { 岳不群 = { 好感度 = 60, 师徒值 = 80 }, 岳灵珊 = { 好感度 = 75 } }
```

关系值可作为条件字段（`character.{角色ID}.relations.{对方ID}.{关系类型}`）。引擎自动处理双向关系同步。

---

### 24. 活跃模组配置

项目根目录下配置文件：

```toml
# era-engine.config.toml（项目根目录）
active_mod = "武侠"
```

`mod-loader.ts` 启动时读取 `active_mod`，只加载对应 `mods/[active_mod]/` 文件夹。切换模组：改此值，重启 `npm run dev`。

---

### 25. npc.toml 模板实例化格式

```toml
# characters/npc.toml

# 首次进入这些地点时随机生成路人
[[spawns]]
template = "huashan_disciple"             # 引用模板
at_locations = ["华山_练武场", "华山_正殿"]
count = { min = 2, max = 5 }             # 随机数量
name_generator = "huashan_names.js"      # 【可选】生成随机姓名

[[spawns]]
template = "tavern_patron"
at_locations = ["华山_酒馆"]
count = { min = 1, max = 3 }

# 覆写某些具体值
[[spawns]]
template = "innkeeper"
at_locations = ["华山_客栈"]
count = 1
overrides = { name = "王掌柜" }
```

- 首次进入地点时生成，之后永存于存档
- 下次加载：**模板重读**（反映修改），运行时状态从存档恢复
- `name_generator` 是可选的 JS 脚本（或直接写内联名称列表）

---

### 26. 主题变量最小必需集

`theme.toml` 必须包含以下变量（引擎 UI 组件只引用这些变量名）：

```toml
[colors]
primary = "#8B4513"          # 主色调
secondary = "#D2B48C"        # 辅助色
background = "#F5F0E1"       # 页面背景
surface = "#FFF8E7"          # 卡片/面板背景
text = "#2C1810"             # 主要文字
text_secondary = "#8B7355"   # 次要文字
border = "#A0866D"           # 边框
success = "#4CAF50"          # 成功/正面
danger = "#E53935"           # 危险/负面
warning = "#FF9800"          # 警告

[typography]
font_body = "楷体, serif"
font_title = "隶书, serif"
font_size_base = "16px"

[spacing]
radius_button = "2px"
radius_panel = "4px"
gap_small = "8px"
gap_medium = "16px"
gap_large = "32px"
```

映射为 CSS 变量（`--color-primary`、`--font-body` 等）。所有组件只用变量，永不写死值。模组可加自定义变量。

---

### 27. 统一错误上报接口

```typescript
// src/core/error-reporter.ts
errorReporter.report({
  source: "map-system",                  // 来源模块
  severity: "error",                     // "error" | "warning"
  file: "mods/武侠/maps/locations/huashan.toml",
  line: 15,
  message: "exit 目标 'lingzhou_palace' 不存在",
  suggestion: "检查 maps/locations/ 下是否有 lingzhou_palace.toml"
})
```

所有引擎代码通过此接口报错，**禁止直接 `console.error`**。开发者面板通过 `errorReporter.onError()` 订阅实时展示。`errorReporter.getErrors()` 查询全部错误列表。

---

### 28. 开发时TOML热更新（HMR）

`mod-loader.ts` 监听 Vite HMR：

```typescript
if (import.meta.hot) {
  import.meta.hot.accept('/mods/**/*.toml', (updatedModule) => {
    // 重新解析变更的 TOML，更新实体系统和模板缓存
    engine.reloadFile(updatedModule)
  })
}
```

改 TOML 文件 → Vite 检测 → 引擎重载对应文件，无需刷新页面。

---

## 开发阶段调整

| 调整 | 说明 |
|------|------|
| **插入3.5** | 核心机制测试（在事件总线之后） |
| **合并阶段1** | 项目初始化时直接用正确架构（平铺地图、属性绑定、三级角色） |
| **删除YAML** | 不安装 js-yaml，不写YAML解析代码 |
| **LLM口上独立阶段** | 从可选进阶升为独立可选阶段，含流式/上下文/token/降级设计 |
| **移动端PWA提前** | 阶段1就配置响应式基础，不要最后才适配 |

## 命名与文件规范
- **代码标识符**（变量名、组件名、文件路径、API字段、TOML键名）：必须英文/拼音，禁止中文
- **内容文本**（角色名、台词、属性显示名、地点描述）：可用中文
- **内容目录名**（模组文件夹、角色文件夹）：可用中文
- **ID命名**：同类型内唯一即可，跨类型允许重名。AI友好优先，不强制前缀
- **素材文件名**：英文/拼音，禁止中文

## 错误处理铁律
- 任何错误必须精准报出：**文件名 + 行号 + 错误原因 + 修复建议**
- 禁止静默失败、禁止控制台只打 `console.error`、禁止 catch 后什么都不做
- 插件错误降级为「禁用该插件 + 弹警告」，不清空数据、不死锁启动

## 样式铁律
- 所有颜色/字体/圆角/间距必须走 CSS 主题变量，禁止在组件内写死
- 核心游戏界面（主场景/战斗/对话/地图）全定制，禁止使用 Naive UI 组件
- 辅助界面（设置/存档/面板）可用 Naive UI 但必须走主题变量覆写
- 响应式设计：PC 端左右分栏，移动端（<768px）上下堆叠，按钮最小44px

## 安全
- 沙箱脚本禁止访问 DOM/全局对象/文件系统，只能调用受限公共API
- 脚本超时保护（5秒自动终止）
- LLM API key 只能通过环境变量或游戏设置面板输入，禁止写死在代码或配置文件里
