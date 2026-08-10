# AGENTS.md — era-engine

## 项目定位
- **绿色项目**（尚无任何代码/配置/提交），从零搭建现代化文字MUD游戏引擎
- 对标 EmuERA/eraTW，核心原则：引擎/内容彻底分离、玩法插件化、多模组热切换
- 第一目标模组：武侠同人ERA，后续可切换哈利波特/仙侠等世界观

## 最高架构铁律（不可违反）

```
┌──────────────────────────────────────────────────────┐
│ engine core 层（src/core/）                           │
│ 纯通用机制，零世界观/零内容/零美术                      │
│ 条件引擎、事件总线、存档系统、实体系统——不认任何属性名  │
├──────────────────────────────────────────────────────┤
│ 通用插件系统层（src/plugins/）                        │
│ 通用玩法框架，提供默认数据                              │
│ dialogue-system、talk-common-system、effect-system    │
│ 所有 attributes.toml 等默认值在此层定义，mod 可 override│
├──────────────────────────────────────────────────────┤
│ mod 扩展层（mods/[mod名]/）                            │
│ 具体肉：角色、口上、世界观、专属指令                      │
│ 通过 patch/override 机制覆盖插件层的默认数据              │
│ 不能改引擎代码，只能改 TOML                            │
└──────────────────────────────────────────────────────┘
```

任何设计决策，优先检查：
1. 这个逻辑属于三层中的哪一层？
2. 跨层通信只能走 API 系统或事件总线（禁止直接 import 跨层）
3. 下层不能依赖上层（core 不知道 plugins 存在，plugins 不知道 mods 存在）

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
- **指令复刻检查清单**：`docs/skills/replicating-an-instruction.md` —— 逐条复刻 erArk 指令的完整验证清单（沉淀自 chat 复刻的 20+ 静默问题，复刻任何指令前必读）
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
│   ├── combat-base/         # 回合制战斗骨架（HP扣减、事件钩子；依赖 status-system）
│   ├── combat-wuxia/        # 武侠战斗（extends combat-base，用 optional_ability_tags 适应不同武侠 mod）
│   ├── status-system/       # 状态效果系统（独立插件：中毒/醉意/buff等，战斗内外都用）
│   ├── ability-progression/ # 能力升级系统（XP/等级/unlocks，独立插件，战斗外副职也用）
│   ├── map-system/          # 地图与移动系统
│   ├── character-system/    # 角色属性管理（运行时读写绑定、AI行为等）
│   ├── dialogue-system/     # 口上与对话系统（反应式口上 + 交互式对话树）
│   ├── inventory-system/    # 背包物品系统
│   ├── quest-system/        # 任务剧情系统
│   ├── effect-system/       # 统一效果执行器
│   └── random-event-system/ # 行为期随机事件（行为挂钩/加权候选/子事件选项/触发记录）
├── ui/                      # UI层
│   ├── layout/              # 响应式整体布局（PC左右分栏、手机上下堆叠）
│   ├── components/          # 全定制游戏组件（属性条、头像、日志、按钮）
│   ├── views/               # 核心界面（主场景、战斗、对话、地图、背包）
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
│   │       ├── dialogue.toml      # 反应式口上（场景触发的短台词）
│   │       ├── conversations/     # 交互式对话（一个文件一个对话树）
│   │       │   ├── talk_about_sword.toml
│   │       │   └── daily_chat.toml
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

**加载时自动校验**（两步）：
1. **存在性校验**：模组启用了 `combat-wuxia`，但其 `bindings.toml` 里没有 `[bindings.combat-wuxia].hp` → 报错「模组 `武侠` 缺少绑定：插件 `combat-wuxia` 需要 `hp`，请检查 `bindings.toml`」
2. **类型校验**：绑定的属性类型必须与插件声明的一致。插件声明 `hp = {type = "number"}`，但 `attributes.toml` 里 `气血` 定义为 `type = "string"` → 报错「绑定类型不匹配：插件 `combat-wuxia` 需要 `hp` (number)，但属性 `气血` 定义为 string（检查 `definitions/attributes.toml` 第 X 行）」

**可选绑定**：插件可声明 `optional_attributes`（而非 `required_attributes`）。缺少或类型不匹配 → warning（不阻止加载），插件必须处理未绑定的情况。

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
- 下次加载：角色完全从存档恢复（存档权威模型）。模板仅提供初始值，不覆盖存档数据
- 模板改动（如改默认HP）只影响**新游戏/新遭遇**的角色，已有存档中的角色不受影响
- 如需让旧存档角色反映模板改动，使用存档迁移脚本（见第12节）

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
| `relation` | `relation:added`、`relation:changed`、`relation:removed` | 关系变更（payload 含 type/sentiment/panel/address） |
| `game` | `game:new_day`、`game:hour_changed`、`game:night_start`、`game:save`、`game:load` | 时间/存档 |
| `save` | （由 `game:save`/`game:load` 覆盖） | 存档相关走 game 域 |

### 7. 事件链与异步处理
- 处理器可以是 async（返回 Promise），总线按优先级顺序 **await 每个处理器**——串行执行，不并行
- 每个 handler 必须 try/catch 包裹，报错不阻断后续 handler（错误隔离）
- 总线检测 same-tick 循环（同一事件 → 同一处理器触发两次）并断链报错，不死循环
- 慢操作（如 LLM 调用）不应作为事件处理器——应从 UI 渲染管线调用
- 插件加载错误：降级为「禁用该插件 + 弹红色警告（含文件名+行号+原因）」，不死锁启动
- `@` 前缀 debug 命令输出到叙事日志，浏览器 console 用于调试（无独立开发者面板）

---

### 8. 条件系统：简单比较 vs 复杂脚本

**核心原则**：条件字段不是写死在引擎里的，是每次启动时动态收集的。

**条件路径结构**（路径格式惯例，具体可用字段由动态收集决定）：

```
player.{属性名}              — 玩家属性（属性名来自 attributes.toml）
character.{角色ID}.{属性名}  — 指定NPC的属性
character.{角色ID}.abilities.{技能ID}  — NPC的技能等级
character.{角色ID}.talents.{天赋ID}    — NPC是否拥有该天赋
character.{角色ID}.factions.{势力ID}   — NPC在该势力的职位
character.{角色ID}.status.{状态ID}     — NPC是否拥有该状态效果（boolean）
character.{角色ID}.status.{状态ID}.stack — 状态效果叠加层数
location.{字段}              — 当前地点属性（id/type/tags/parent）
location.tags.{标签名}       — 当前地点是否拥有某标签（数组包含检查，返回boolean）
game.time.{单位}             — 游戏时间（hour/day/month）
inventory.{物品ID}.count     — 背包物品数量
quest.{任务ID}.status        — 任务状态
{插件注册的任意字段}          — 各插件可注册自定义条件字段
```

**数组包含检查**——使用点路径语法（不引入新运算符）：
```toml
condition = "location.tags.has_gather == true"
```
条件引擎在解析路径时：遇到 `location.tags` 返回数组 → 再解析 `.has_gather` → 发现上一级是数组 → 检查 `has_gather` 是否在数组中 → 返回 `true`/`false`。
对于对象数组（如 `status_effects`），按 `id` 字段匹配：`character.{id}.status.中毒` 检查是否有 `id == "中毒"` 的元素。

以上是**路径结构惯例**，不是硬编码列表。引擎不认识任何具体属性名，所有可用字段来自：
- 模组 `definitions/attributes.toml` 中定义的所有属性 → 自动注册为条件字段
- 各个插件在 `plugin.toml` 中声明的 `condition_fields`
- 绑定属性也自动加入条件字典（`player.hp` 等价于 `player.气血`）

**动态收集流程**（详见第21节）→ 引擎启动时扫描以上来源，合成完整字段表，自动生成 `可用条件属性手册.md`。写条件时只能用手册里的字段，否则加载时报错。换模组后手册自动不同。

**TOML 条件**（只支持 `> < >= <= == != && || !` 和括号）：
```toml
condition = "player.气血 < 30"
condition = "(player.气血 < 30 || player.内力 < 20) && game.time.hour >= 18"
condition = "location.tags.has_gather == true && character.令狐冲.status.醉意 == true"
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

### 13. NPC性能模型（2026-08-10 修订——行为块模型）

- **全量同步结算**：每次 `game:time_advanced`（玩家行动推进时间后）对所有 NPC 结算——行为窗口属性积累 + 到期行为完成结算 + 决策下一个（npc-ai-system 的 settle-pass）。**决策永远用真实时刻上下文，无"追算"**（冻结后补算会产生延迟计算的叙事/状态错位——已否决该方案）
- **成本控制**：行为未到期只做窗口结算（微成本）；到期才做目标搜索（前提结果轮内缓存 + 目标层短路——erArk 同款）；估算每轮几十 ms/500 NPC
- **分帧兜底**：单轮超预算（100ms）→ 剩余 NPC 排入后续轮次（玩家所在+直接相邻优先当轮）；每 NPC 结算自包含，分帧不产生上下文漂移
- **跳过集**：dead/离线/无意识（时停）/战斗中/插件注册谓词 → 不结算
- **活跃度**：`activity` 影响闲逛决策（越低越倾向原地停留），不影响排班与休息/睡眠需求
- **连锁上限**：单轮连锁决策上限 60 次（超长窗口 + 短行为链属正常，如睡 12 小时；超限防御性强制等待）

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

# 可选：本插件需要的能力标签（mod 必须有至少一个能力带此标签，否则 warning）
[required_ability_tags]
combat_active = { description = "可在战斗中主动使用的能力" }

# 可选：本插件可选使用的能力标签（mod 没有则降级处理，不阻止加载）
[optional_ability_tags]
sword = { description = "剑类技能，有剑法加成系数" }
internal = { description = "内功，影响内力计算" }
movement = { description = "轻功，影响闪避" }

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

# 可选：UI入口注册（命令声明）
# 分组（location_commands/character_commands/main_menu）只影响UI显示位置，不影响条件范围
# 每个命令必须有 modes（在哪些模式显示）和 effects 或 handler（做什么）
[ui]
main_menu = [
  { id = "combat_test", label = "战斗测试", modes = ["exploration"], priority = 100,
    effects = [{type = "start_combat", params = {enemies = ["test_enemy"]}}] }
]
location_commands = [
  { id = "gather_herbs", label = "采集", modes = ["exploration"],
    condition = "location.tags.has_gather == true", priority = 50,
    effects = [{type = "gather", params = {}}] }
]
character_commands = [
  { id = "talk", label = "交谈", modes = ["exploration", "combat"], priority = 10,
    effects = [{type = "start_conversation", params = {}}] },
  { id = "attack", label = "攻击", modes = ["exploration"], priority = 90,
    effects = [{type = "start_combat", params = {}}] }
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

### 23. 角色-地点关联（2026-08-10 修订——npc-ai-system 行为块模型）

角色出现在哪个地点，全部通过角色的 `behavior` 定义（作者数据）+ 运行时行为块（`ai_behavior`，引擎独占）：

```toml
# characters/named/linghuchong/behavior.toml
activity = 0.7
home_locations = { 华山_思过崖 = 0.5, 华山_剑坪 = 0.3, 华山_酒馆 = 0.2 }
time_rules = [
  { hour_range = [20, 23], target = "华山_酒馆", weight = 0.9 },
  { hour_range = [0, 6], target = "华山_卧室", weight = 1.0 }
]
work = { work_type = "gate_duty" }                    # 工种引用（ai-work.toml）
entertainment = { types = { evening = "drink" } }     # 三时段槽娱乐（morning/afternoon/evening）

# roster.toml 里
behavior = { activity = 0.5, home_locations = { 华山_练武场 = 0.7 } }
```

- **启动/读档时**：角色初始放在权重最高的 home_location（character-system）；行为块初始化后由 npc-ai-system 接管
- **运行时 `current_location` / `ai_behavior`**：运行时状态，存于存档（存档权威模型）
- **地图系统不存角色列表**——角色系统按 `current_location == target_location_id` 反向查询
- **npc-ai-system**（`docs/npc-ai-system.md`）：每次 `game:time_advanced` 全量结算——窗口属性积累 + 行为到期（`start + duration ≤ now`）→ 完成结算 + 决策下一个（门控 → 排班：time_rules/工作/娱乐 → 目标搜索：前提权重+分层）。`activity` 影响闲逛决策（越低越倾向原地停留），**不影响排班与休息/睡眠需求**
- 条件字段：`character.{id}.state`（行为类型）、`character.{id}.current_behavior`（行为规格 ID）

### 角色关系数据格式（关系系统 v2，2026-08-10 grill 定稿）

`definitions/relations.toml` 三段：types（关系类型）/ pairs（称呼词表）/ groups（关系组）。

**核心语义**：
- 关系**有向**：A→B 与 B→A 独立（A 视 B 为 X，B 未必回视——单方面关系合法，引擎不做自动双向同步）
- 两个正交维度：**种类**（类型名，方向编码）+ **档位**（kind=relation：正面/中立/负面 = 1/0/-1）
- 两型并存：`kind="sentiment"`（数值 0-100，好感度等）/ `kind="relation"`（三档）
- 一角色对另一角色**多关系**（父亲+仇人+炮友）与**多对象**（段誉两个父亲）天然支持
- 档位只影响行为阈值（正面：对方被威胁时愿牺牲）——行为推导由 mod 指令 condition 用聚合路径实现

```toml
[types]
# 数值型（kind=sentiment，默认）：
"好感度" = { min = 0, max = 100, default = 30, name = "好感度" }
# 三档型（kind=relation）：端对×端（side: big 为大 / small 为小；对称类型省略）
"父母子女（为大）" = { kind = "relation", pair = "parent_child", side = "big" }
"父母子女（为小）" = { kind = "relation", pair = "parent_child", side = "small" }
"夫妻" = { kind = "relation", pair = "spouse" }
# 纯类型（无 pair，称呼=类型名）：reverse 显式声明（默认"同名换端"自动推导）
"仇人" = { kind = "relation", reverse = "被仇" }

[pairs]   # 称呼词表（h-core 内置 parent_child/sibling/grandparent/teacher_student/
          # master_servant/spouse/lover；mod 可覆盖/新增）
[pairs.parent_child]
panel = { big_male = "父", big_female = "母", small_male = "子", small_female = "女" }
address = { big_male = "父亲", big_female = "母亲", small_male = "儿子", small_female = "女儿" }

[groups]  # 关系组（集中定义，一处增删调）；元素 = 类型名 或 { pair } 引用（展开为引用该 pair 的全部已定义类型）
"死对头" = ["仇人", "被仇"]
"血亲" = [{ pair = "parent_child" }, { pair = "sibling" }]   # 内置组（h-core 默认层）
```

角色数据（字符串档位或 1/0/-1 都收，加载统一存 -1/0/1）：

```toml
relations = { 岳不群 = { 好感度 = 60, "师徒值" = 80, "父母子女（为小）" = "正面" }, 岳灵珊 = { "夫妻" = "正面" } }
```

**称呼两层**：panel 成对名（关系面板显示：父子/父女/母子/母女，按双方性别组合）/
address 单方称呼（口上 `{relation_display}`：父亲/儿子…，按端+自己性别）。API：
`ctx.api.call('character','getRelationPanel/Address', A, B, type)`。

**条件路径**：
- 单类型：`character.{A}.relations.{B}.{类型}`（-1/0/1 或 sentiment 数值）——
  注意条件引擎不支持负数字面量（`== -1` 会触发算术检查），负面档位用 `< 0`
- 聚合（括号参数，跨种类）：`...any(类型,类型或group:组)`（存在）/ `...any_positive(列表)` /
  `...any_negative(列表)`；无括号 = 全部类型；组合用 `&& || !`

**修改/事件**：
- `modify_relation` effect：kind=relation 类型 = **直接设档**（value 收 -1/0/1 或 "正面"）；
  sentiment 保持加减；`remove_relation` effect 删除条目（解除关系，与设 0=中立区分）
- 标准事件：`relation:added` / `relation:changed`（类型级，payload 必带 type）/
  `relation:removed`，payload `{character, target, type, sentiment, panel, address}`
- ⚠️ 标记（2026-08-10）：口上系统暂不监听 relation:* 事件——"B 成为了 A 的 父亲！"类
  关系变化口上需 dialogue-system 支持事件触发（待补）；quest objective 暂无 relation 类型

**校验**：reverse 不对称 → warning（单方面关系合法，仅提示确认）；聚合引用未定义类型/组 → error；
三档值非法 → error。

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
- 下次加载：角色完全从存档恢复（存档权威模型）。模板仅提供初始值，不覆盖存档数据
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

所有引擎代码通过此接口报错，**禁止直接 `console.error`**。`@` 前缀 debug 命令可用于查看错误，浏览器 console 用于调试。`errorReporter.getErrors()` 查询全部错误列表。

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

### 29. 模式栈与执行状态

**执行状态**：游戏在 IDLE 和 EXECUTING 之间交替。
- **IDLE**：玩家可浏览NPC、查看菜单、从指令栏选择行动
- **EXECUTING**：行动执行中（移动、对话、战斗回合、物品使用）——指令栏隐藏，全屏文本布局激活，输出流到叙事日志
- **EXECUTING 不嵌套**：当前执行必须结束（或中止）才能开始下一个执行。对话被战斗打断 → 对话**中止**（不暂停、不恢复），战斗开始。战斗后回 IDLE，mod 可通过事件触发新对话。

**模式栈**：模式用栈管理。进入模式 push，退出模式 pop。
```
exploration → (交谈) → dialogue → (对话结束) → exploration
exploration → (战斗) → combat → (战斗中交谈) → dialogue → (对话结束) → combat → (战斗结束) → exploration
```

**模式切换机制**：通过 effect 触发
```toml
# 进入模式（push 到栈顶）
effects = [{type = "enter_mode", params = {mode = "dialogue"}}]
# 退出模式（pop 栈顶）
effects = [{type = "exit_mode", params = {}}]
```

`enter_mode` push 模式到栈并发出 `game:mode_changed` 事件。拥有该模式的系统监听事件，从 IDLE 接管。进入模式的系统负责在结束时调用 `exitMode()`。

**布局切换**：由 (state × mode) 驱动
- IDLE + exploration → 探索布局
- IDLE + combat → 战斗布局
- EXECUTING (任何模式) → 全屏文本布局

---

### 30. 对话数据格式

对话分两种类型，分开存放：

**反应式口上**（`dialogue.toml`）——场景触发的短台词，无分支，无玩家选择：
```toml
# characters/named/linghuchong/dialogue.toml

[[lines]]
scene = "greet"
condition = "character.令狐冲.好感度 >= 60"
text = "师弟来得正好，陪我喝一杯！"

[[lines]]
scene = "greet"
condition = "character.令狐冲.好感度 < 30"
text = "你是何人？怎敢擅闯华山禁地？"

[[lines]]
scene = "hurt"
text = "嘶……下手倒是不轻。"
```
- `scene`：场景分类（greet/farewell/hurt/battle_start 等，可无限扩展）
- `condition`：可选，满足条件才触发
- 多条同 scene + 满足 condition → 随机选一条
- dialogue-system 监听游戏事件 → 匹配 scene + condition → 输出到叙事日志

**交互式对话**（`conversations/` 目录）——分支对话树，有玩家选择：
```toml
# characters/named/linghuchong/conversations/talk_about_sword.toml
id = "talk_about_sword"
condition = "quest.独孤九剑.status == 'active'"

[[nodes]]
id = "start"
lines = ["令狐冲道：师弟，你来了。"]
choices = [
  { text = "询问独孤九剑", next = "ask_sword" },
  { text = "闲聊", next = "chitchat" },
  { text = "告别", next = "farewell" }
]

[[nodes]]
id = "ask_sword"
lines = ["令狐冲低声道：独孤九剑讲究无招胜有招..."]
effects = [{type = "set_field", params = {path = "abilities.独孤九剑", value = 1}}]
next = "start"

[[nodes]]
id = "farewell"
lines = ["令狐冲挥手道别。"]
effects = [{type = "exit_mode", params = {}}]
```
- 每个文件 = 一个对话树，`id` 唯一
- `condition`：可选，自动选择对话时检查（玩家点"交谈"→ 选第一个 condition 满足的对话）
- `[[nodes]]`：对话节点
  - `id`：节点唯一标识
  - `lines`：显示的文本数组
  - `choices`：可选，玩家选项 `{text, next, condition?}`，`condition` 控制选项可见性
  - `effects`：可选，到达节点时执行的效果
  - `next`：可选，单选项自动跳转（无 choices 时使用）
  - **节点无 condition**（条件只在对话级和选项级，条件在边上不在节点上）
  - 无 choices 且无 next = 终端节点（对话结束）
- 触发方式：`start_conversation` effect（dialogue-system 注册），自动进入 dialogue 模式

---

### 31. 任务数据格式

每个任务一个 TOML 文件，放在 `quests/main/` 或 `quests/side/`：

```toml
# quests/main/find_master.toml
id = "find_master"
title = "寻找师父"
description = "你的师父失踪了，去华山找线索。"
type = "main"                        # "main" | "side"（仅分类标签）
prerequisites = ["intro_quest"]      # 可选：前置任务必须已完成
auto_start_condition = "location.id == '华山_正殿'"  # 可选：条件满足时自动开始

[[steps]]
id = "start"
type = "dialogue"                    # 委托 dialogue-system
character = "岳灵珊"
conversation = "worry_about_master"
next = "go_to_huashan"

[[steps]]
id = "go_to_huashan"
type = "objective"                   # 目标追踪
description = "前往华山正殿"
objective = { type = "reach_location", target = "华山_正殿" }
next = "find_clue"

[[steps]]
id = "find_clue"
type = "combat"                      # 委托 combat-system
enemies = ["华山_弟子_甲", "华山_弟子_乙"]
on_win = "report"
on_lose = "retry"

[[steps]]
id = "report"
type = "reward"                      # 执行效果
effects = [
  {type = "modify_attribute", params = {attr = "声望", value = 10}},
  {type = "modify_relation", params = {target = "岳灵珊", relation = "好感度", value = 20}}
]
next = "complete"

[[steps]]
id = "complete"
type = "dialogue"
character = "岳灵珊"
conversation = "master_found"

[[steps]]
id = "retry"
type = "dialogue"
character = "岳灵珊"
conversation = "try_again"
next = "find_clue"
```

**步骤类型**（7种）：
| 类型 | 说明 | 特有字段 |
|------|------|----------|
| `dialogue` | 委托 dialogue-system | character, conversation |
| `combat` | 委托 combat-system | enemies, on_win, on_lose |
| `objective` | 目标追踪，事件驱动自动检查 | objective |
| `reward` | 执行效果 | effects |
| `spawn` | 创建角色/物品 | template, at_location, count |
| `condition` | 检查游戏状态分支 | condition, next(满足), else(不满足,可选) |
| `goto` | 跳转到另一个步骤 | target |

**objective 子格式**（事件驱动）：
```toml
objective = { type = "reach_location", target = "华山_正殿" }      # 监 location:enter
objective = { type = "kill_count", target = "华山_弟子", count = 5 } # 监 combat:end
objective = { type = "collect_items", item = "回血丹", count = 3 }   # 监 item:added
objective = { type = "talk_to", character = "令狐冲" }              # 监 dialogue:end
```
目标满足后自动跳转到 `next`。插件可注册更多 objective 类型。

**任务启动方式**：
1. `auto_start_condition`：条件满足时自动开始
2. `start_quest` effect：`{type = "start_quest", params = {quest = "find_master"}}`

**不支持（MVP）**：限时任务（需 `time_limit` 字段）、重复/日常任务（需重置机制）——后续扩展。

---

### 32. 状态效果格式

状态效果 = 持续性条件（中毒、醉意、buff/debuff），由独立的 `status-system` 插件管理（不属 combat-base），因为状态效果广泛用于战斗外：醉意影响对话好感度、春药影响H指令、中毒影响威胁成功率。

**定义格式**（`definitions/status-effects.toml`）：
```toml
[status-effects.中毒]
name = "中毒"
description = "持续受到毒素伤害"
category = "debuff"           # debuff | buff | neutral
duration = 360                # 持续分钟数，-1 = 永久
tick_interval = 60            # 每隔多少分钟触发一次 tick_effects
stackable = false             # 是否可叠加
max_stack = 1                 # 最大层数（stackable=true 时有效）
tick_effects = [
  {type = "modify_attribute", params = {attr = "气血", value = -5}}
]
on_apply_effects = []         # 施加时触发
on_remove_effects = []        # 移除时触发

[status-effects.醉意]
name = "醉意"
description = "喝醉了，对话好感度加成"
category = "buff"
duration = 120
tick_interval = 0             # 0 = 不触发 tick
stackable = true
max_stack = 3
```

**施加方式**（effect type，status-system 注册）：
```toml
effects = [{type = "apply_status", params = {status = "中毒", target = "selected"}}]
```

**移除方式**（effect type，status-system 注册）：
```toml
effects = [{type = "remove_status", params = {status = "中毒", target = "selected"}}]
```
- `remove_status` 触发 `on_remove_effects`（和自然到期一样）
- 移除整个状态（所有 stack），不支持只减一层
- 角色没有该状态 → 静默跳过（不报错）

**target 字段合法取值**（所有 effect 通用，不只是 apply_status）：

| target 值 | 含义 | 注册者 |
|-----------|------|--------|
| `self` | 施加者自己 | 引擎 |
| `selected` | UI 选中角色（默认值，省略时用这个） | 引擎 |
| `player` | 玩家角色 | 引擎 |
| `all_enemies` | 战斗中所有敌方 | 引擎 |
| `all_allies` | 战斗中所有友方 | combat-base |
| `target` | 战斗中当前目标 | combat-base |

- 非战斗场景下 `all_enemies`/`target` 不可用 → 静默跳过 + warning
- `selected = null` 时 → 静默跳过 + warning

**叠加规则**（重新施加已存在的状态时）：
- **总是刷新 duration** 为新 duration（重置计时器）
- `stackable = true` + 当前 stack < max_stack → stack +1
- `stackable = true` + 当前 stack = max_stack → stack 不变（截断）
- `stackable = false` → stack 不变（始终为 1）
- 一句话规则：**重新施加 = 刷新时长 + 叠加层数（上限 max_stack）**

**tick_effects 与层数**：
- 数值类 effect（modify_attribute 等）：`value × stack`（stack=3 的中毒 tick -5 → 实际 -15）
- 非数值类 effect（apply_status/narrative_output 等）：重复执行 `stack` 次
- 倍增逻辑由 status-system 内部处理，mod 作者只需写一份 tick_effects

**角色运行时状态**（存档保存）：
```json
{
  "status_effects": [
    {"id": "中毒", "remaining_duration": 300, "stack": 1, "last_tick_game_time": 1234}
  ]
}
```

**跳动机制**：status-system 监听 `game:hour_changed` → 遍历角色 status_effects → 检查 tick_interval → 执行 tick_effects → 扣减 remaining_duration → 到期执行 on_remove_effects 并移除。

**条件集成**（status-system 注册条件字段）：
- `character.{id}.status.{状态ID}` → boolean（是否拥有该状态）
- `character.{id}.status.{状态ID}.stack` → number（叠加层数）
- `character.{id}.status.{状态ID}.remaining` → number（剩余分钟数）

**combat-base 依赖 status-system**：战斗中的 buff/debuff 由 status-system 统一管理。

---

### 33. 天赋/能力/势力定义格式

这三者都是**定义文件（元数据）+ 角色实体字段（实际值）**的模式，不需要独立系统插件——它们是被其他系统消费的数据。

**天赋定义**（`definitions/talents.toml`）：
```toml
[talents.剑骨]
name = "剑骨"
description = "天生适合练剑，剑法学习速度+50%"
category = "innate"              # innate | learned
effects = [{type = "modify_attribute", params = {attr = "剑法学习速度", value = 0.5}}]
condition = "player.武学修养 >= 30"  # 可选：仅条件满足时生效
```

**能力定义**（`definitions/abilities.toml`）：
```toml
[abilities.华山剑法]
name = "华山剑法"
description = "华山派基础剑法"
type = "active"                  # active | passive
max_level = 10                   # 0 = 无等级能力
tags = ["combat_active", "sword"] # 标签：插件按标签查询能力
effects = [{type = "modify_attribute", params = {attr = "攻击力", value = 5}}]
time_cost = 10                   # 可选：使用耗时（分钟，active 专属）
condition = "player.内力 >= 20"   # 可选：使用条件（active 专属）

# 能力升级字段（由 ability-progression 插件管理）
xp_curve = "linear"              # linear | exponential | custom
xp_per_level = 100               # linear: 每级固定 XP；custom: 数组

# 技能树：升到某级解锁子能力/天赋
[[abilities.华山剑法.unlocks]]
at_level = 6
ability = "独孤九剑"

[[abilities.华山剑法.unlocks]]
at_level = 10
ability = "华山绝学"
talent = "剑意天赋"
```

**势力定义**（`definitions/factions.toml`）：
```toml
[factions.华山派]
name = "华山派"
description = "五岳剑派之一"
type = "sect"                    # sect | clan | gang | government
ranks = ["掌门", "长老", "弟子", "外门弟子"]
```

**角色数据**（`base.toml` 或 `roster.toml`）：
```toml
talents = { 剑骨 = 1 }
abilities = { 华山剑法 = 3, 混元功 = 2 }
factions = { 华山派 = "弟子" }
```

**条件访问**：
- `character.{id}.talents.{天赋ID}` → 等级或 false（无）
- `character.{id}.abilities.{能力ID}` → 等级
- `character.{id}.factions.{势力ID}` → 职位字符串或 false（非成员）

**修改方式**：通过 `set_field` effect（见第34节），不走绑定系统。

---

### 34. 效果系统核心类型

effect-system 插件在 onLoad 中注册以下**核心效果类型**：

| 效果类型 | 说明 | 走绑定系统 |
|----------|------|-----------|
| `set_attribute` | 设置属性值 | ✅ 是 |
| `modify_attribute` | 修改属性值（加减） | ✅ 是 |
| `set_field` | 直接修改实体字段（abilities/talents/factions等） | ❌ 否 |
| `add_item` | 添加物品到背包 | ❌ |
| `remove_item` | 从背包移除物品 | ❌ |
| `modify_relation` | 修改角色关系值 | ❌ |
| `advance_time` | 推进游戏时间 | ❌ |
| `narrative_output` | 输出到叙事日志 | ❌ |
| `enter_mode` | push 模式到栈 | ❌ |
| `exit_mode` | pop 模式出栈 | ❌ |

**区分 `set_attribute` 和 `set_field`**：
- `set_attribute` / `modify_attribute`：操作 `attributes.toml` 中定义的属性，走绑定系统（插件通用名 → 模组属性名映射）
- `set_field`：直接修改实体上的任意字段（abilities/talents/factions/status_effects/relations等复杂数据结构），不走绑定系统

```toml
# 走绑定系统（属性由 attributes.toml 定义，由 bindings.toml 映射）
effects = [{type = "modify_attribute", params = {attr = "hp", value = -10}}]

# 直接修改实体字段（不走绑定系统）
effects = [{type = "set_field", params = {path = "abilities.华山剑法", value = 3}}]
effects = [{type = "set_field", params = {path = "factions.华山派", value = "长老"}}]
```

**插件注册的效果类型**（非核心，由各插件注册）：
| 效果类型 | 注册者 | 说明 |
|----------|--------|------|
| `apply_status` | status-system | 施加状态效果 |
| `remove_status` | status-system | 移除状态效果（全层移除，触发 on_remove_effects） |
| `start_conversation` | dialogue-system | 开始交互式对话（自动进入 dialogue 模式） |
| `start_combat` | combat-base | 开始战斗 |
| `start_quest` | quest-system | 开始任务 |
| `gain_ability_xp` | ability-progression | 给能力增加经验值，可能触发升级 |
| `damage` | combat-wuxia | 战斗伤害 |
| `teach_kungfu` | combat-wuxia | 传授武功 |

所有效果使用统一结构 `{type, params}`，可选 `id` 和 `depends_on` 字段。执行上下文携带 `sourceId`、`targetId`、`extraContext`。效果组内按数组顺序执行；`depends_on` 表示"仅在前置效果成功时执行"（引用 effect 的 `id`，前置失败则跳过，不报错）。循环依赖或引用不存在的 id → 加载时报错。未知效果类型 → 加载时 warning，运行时静默跳过。

**effect 的 target 字段**（所有 effect 通用）：
```toml
effects = [
  {type = "apply_status", params = {status = "中毒", target = "selected"}},
  {type = "modify_attribute", params = {attr = "hp", value = -10, target = "all_enemies"}}
]
```
省略 target 时默认 `"selected"`。`selected = null` 时静默跳过 + warning。

---

### 35. 能力标签与查询

能力（abilities）使用**标签机制**（不是绑定）让插件按类型查询能力。标签是自由字符串，引擎不硬编码任何标签名。

**能力定义加 tags 字段**：
```toml
[abilities.华山剑法]
name = "华山剑法"
tags = ["combat_active", "sword"]

[abilities.混元功]
name = "混元功"
tags = ["combat_passive", "internal"]

[abilities.催眠术]
name = "催眠术"
tags = ["mystic_active"]
```

**插件声明期望标签**（plugin.toml）：
```toml
[required_ability_tags]
combat_active = { description = "可在战斗中主动使用的能力" }

[optional_ability_tags]
sword = { description = "剑类技能，有剑法加成" }
internal = { description = "内功，影响内力计算" }
mystic_active = { description = "奇术，触发奇术系统" }
```

**插件运行时查询 API**：
```typescript
// 获取角色所有带某标签的能力
const combatAbilities = ctx.api.call('engine', 'abilities.getByTag', charId, 'combat_active')
// 返回 [{id: "华山剑法", level: 3, xp: 45}, {id: "独孤九剑", level: 1, xp: 0}]

// 检查角色是否有带某标签的能力
const hasMystic = ctx.api.call('engine', 'abilities.hasTag', charId, 'mystic_active')
```

**技能树（unlocks）**：
```toml
[abilities.九阴真经]
name = "九阴真经"
max_level = 10
tags = ["combat_passive", "internal", "legendary"]

[[abilities.九阴真经.unlocks]]
at_level = 6
ability = "九阴神爪"

[[abilities.九阴真经.unlocks]]
at_level = 9
ability = "蛇行狸翻"

[[abilities.九阴真经.unlocks]]
at_level = 10
ability = "九阴神功"
talent = "九阴天赋"
```

---

### 36. 能力升级机制

由独立的 `ability-progression` 插件（`src/plugins/ability-progression/`）管理。

**能力定义新增升级字段**：
```toml
[abilities.华山剑法]
max_level = 10
xp_curve = "linear"           # linear | exponential | custom
xp_per_level = 100            # linear: 每级固定 100 XP
# 或 custom: xp_per_level = [100, 200, 400, 800, ...]
```

**角色数据存储**：
- mod 作者写简写：`abilities = { 华山剑法 = 3 }`（只等级）
- 引擎加载时展开为：`{ "华山剑法": { level: 3, xp: 0 } }`
- 存档保存完整结构（含 xp）
- 读档直接用完整结构

**增加经验值**：
```toml
effects = [{type = "gain_ability_xp", params = {ability = "华山剑法", xp = 20, target = "player"}}]
```

**升级触发**：
1. `gain_ability_xp` 增加经验值
2. xp 达到 `xp_per_level` → xp 归零 + level+1
3. 检查 `unlocks` → 自动给角色加新能力/天赋（发出 `set_field` effect）
4. 发出 `character:ability_up` 事件（其他插件可监听）

**无等级能力**（`max_level = 0`）：
- `gain_ability_xp` 对无等级能力静默跳过
- 存储为 `{ level: 1, xp: null }`

---

### 37. 跨文件 ID 引用校验

**加载时校验**（error，阻止加载）：

| 引用类型 | 校验内容 |
|----------|----------|
| 地点 `exit.target` | target ID 存在 |
| 能力 `unlocks.ability` | ability ID 存在 |
| 任务 `steps.character` | 角色 ID 存在 |
| 任务 `steps.conversation` | 对话 ID 存在 |
| `bindings.toml` 属性名 | 属性在 attributes.toml 中定义 |
| 对话 `choices.next` | node ID 存在 |
| effect `depends_on` | effect id 存在 |

报错格式：`文件名 第X行：引用 'XXX' 不存在（可用：YYY, ZZZ）`

**运行时校验**（warning + 跳过，不阻止）：
- `apply_status` 的 status ID → 不存在则 warning + 跳过
- `start_conversation` 的对话 ID → 不存在则 warning + 跳过
- `modify_attribute` 的 attr → 通过绑定系统解析，未绑定则 warning + 跳过

---

### 38. 条件路径默认值

条件路径解析不到值时，返回默认值（**永不抛异常**）：

| 类型 | 默认值 |
|------|--------|
| 数值属性不存在 | `0` |
| 字符串属性不存在 | `""`（空字符串） |
| boolean 属性不存在 | `false` |
| 数组包含检查，数组不存在 | `false` |
| 角色不存在 | 同上（按属性类型） |
| 关系不存在 | 用 `relations.toml` 中该关系类型的 `default` 值 |

**`selected` 条件路径**：
- `selected.好感度 >= 60` → 引用当前 UI 选中角色的属性
- `selected = null` 时 → 返回默认值（数值 0, boolean false）

**`player` 条件路径**：
- `player.气血 < 30` → 引用 `meta.toml.player_character` 指定的实体
- 和 `character.{player_character}.气血` 等价

---

### 39. 游戏启动流程

```
打开游戏
  ↓
引擎初始化（10步，后台）
  ↓
active_mod 为空？ 
  ├─ 是 → 显示「模组选择」界面（列出所有可用 mod）
  └─ 否 → 加载指定 mod
  ↓
显示「标题界面」（引擎提供，mod 只提供标题文字/图片）：
  ┌─────────────────┐
  │    {mod.title}   │
  │                   │
  │  [新的冒险]       │
  │  [继续冒险]       │ ← 有存档时显示
  │  [设置]           │
  │  [切换模组]       │
  └─────────────────┘
  ↓
[新的冒险] → 角色创建流程 → 进入游戏
[继续冒险] → 存档列表 → 选择 → 读档 → 进入游戏
```

mod 的 `meta.toml` 可声明标题信息：
```toml
[meta]
title = "武侠世界"
title_image = "assets/title.png"    # 可选
description = "一个武侠同人 ERA 游戏"
player_character = "player_01"       # 玩家实体的固定 ID
starting_location = "华山_正殿"       # 可选：创建完成后起始地点
# 加载画面素材（可选，2026-08-10）——引擎启动期间显示（loadMod 后、Vue 挂载前）：
#   loading_video 优先（autoplay muted loop）；否则 loading_image（图片/GIF）
#   路径相对 mod 根；未声明 → 引擎用闪烁"加载中……"文字 fallback（不报错）
loading_image = "assets/loading.gif"
# loading_video = "assets/loading.mp4"
```

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

## API 文档铁律（不可违反）
- **每个插件必须有完整的 API 文档**，记录在 `docs/plugin-author-guide.md` 中
- API 文档必须记录：namespace、所有方法名、参数签名、返回值、用途说明
- 新增插件时**必须同时更新 API 文档**，禁止"先写代码后补文档"
- 修改已有 API 签名/参数/行为时**必须同步更新 API 文档**
- `docs/plugin-author-guide.md` 的 API 速查表必须与实际 `ctx.api.register()` 一致
- 验收标准：`docs/plugin-author-guide.md` 覆盖所有已注册的 API namespace

## 使用手册铁律（不可违反）
- **每个插件系统必须有独立的使用手册**（`docs/` 下对应 .md 文件）
- 手册必须覆盖：该系统的概念、数据格式（TOML）、使用方法、前提条件、与其他系统的交互
- 手册的参考文档索引必须在 `docs/master-todo.md` 顶部维护
- 新增系统时**必须同时创建手册**，修改系统行为时**必须同步更新手册**

## 架构合规铁律（不可违反）
- **三层绝对分离**：`src/core/` 不得出现任何具体玩法名词（属性名、模式名、系统名）
- **插件之间禁止直接 import**：跨插件通信只能走 `ctx.api.call()` 或事件总线
- **属性名禁止硬编码**：插件代码中禁止出现中文属性名字符串（如 `'好感度'`、`'体力'`），必须走 `ctx.api.call('engine', 'bindings.get/set', ...)` 或 `entity-utils.ts` 常量
- 每次 commit 前必须验证：
  1. `src/core/` 无具体玩法引用
  2. 插件之间无直接 import（`import ... from '../other-plugin/'`）
  3. API 文档与代码一致
- 上述验证写进 `开发检查清单.md` 的"跨阶段持续检查项"

## 唯一数据/通信路径铁律
- 插件间的所有通信只有两条合法路径：
  1. **公共 API 系统**：`ctx.api.register()` + `ctx.api.call()` —— 适用于功能调用
  2. **事件总线**：`ctx.events.emit()` + `ctx.events.on()` —— 适用于通知/广播
- 禁止：直接 import、共享模块变量（singleton）、Pinia store 跨插件访问
- 引擎核心暴露的能力也走 API 系统：`ctx.api.call('engine', 'xxx', ...)`
- 插件对外暴露的所有功能必须通过 `ctx.api.register()` 注册，无隐藏 API

## 样式铁律
- 所有颜色/字体/圆角/间距必须走 CSS 主题变量，禁止在组件内写死
- 核心游戏界面（主场景/战斗/对话/地图）全定制，禁止使用 Naive UI 组件
- 辅助界面（设置/存档/面板）可用 Naive UI 但必须走主题变量覆写
- 响应式设计：PC 端左右分栏，移动端（<768px）上下堆叠，按钮最小44px

## 安全
- 沙箱脚本禁止访问 DOM/全局对象/文件系统，只能调用受限公共API
- 脚本超时保护（5秒自动终止）
- LLM API key 只能通过环境变量或游戏设置面板输入，禁止写死在代码或配置文件里

## 开发环境注意（Windows）
- 默认 shell 为 pwsh 7（UTF-8 无 BOM），写文件仍一律用 write 工具，禁止 `Set-Content`/重定向写含中文的文件

## Agent skills

### Issue tracker

Issues live in GitHub Issues on this repo. External PRs are not a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles use their default label names. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context repo: `CONTEXT.md` + `docs/adr/` at the repo root (neither exists yet; created lazily by `/domain-modeling`). See `docs/agents/domain.md`.
