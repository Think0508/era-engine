# Phase 6-7: 地图+角色+对话插件 — 详细实施计划

> 状态：**待实施**（生成于 2026-06-29，基于 grilling session G33-G62 的全部决策）
> 前置：Phase 1-5 完成（core 14 模块 + UI 框架 + 172 测试通过）
> 验收：`npm run dev` 加载 test-mod，能看到角色在场/移动、点"交谈"进对话、口上输出带格式、移动触发场景口上

---

## 一、设计决策汇总（grilling G33-G62）

### map-system 插件
- **职责**：加载时校验 exit.target/parent（mod-loader 做）、注册 move 指令、MapView 渲染（interactive log entry）、提供 map API、parent 递归导航、不可达警告
- **不参与口上触发**——只管移动 + 事件发射
- **tags 驱动指令**不属于 map-system——消费 tag 的插件自己注册（如 inventory-system 注册采集指令）
- **move 指令**覆盖 Phase 5 native-commands 的 move 占位（从 native-commands 移除）
- **moveTo** 封装 `gameContext.moveTo` + 加日志输出"你前往..."
- **API**：getCurrentLocation/getExits/getChildren/getAncestors/getLocation/hasTag/moveTo

### character-system 插件
- **职责**：初始化角色 current_location（home_locations 最高权重）、AI 移动（game:hour_changed）、NPC spawns（npc.toml）、注册 character API、emit character:changed
- **不注册任何指令**——纯服务插件
- **AI 移动**：所有角色都处理（不只当前+相邻），activity=0 跳过，activity<0.3 降频（hour%5==0），activity>=0.3 每小时检查，time_rules 优先 > home_locations 加权随机
- **NPC spawns**：监听 location:enter → 查 at_locations → 未生成则按 count 随机生成 + template 实例化 + overrides + name_generator（Phase 6-7 只支持内联名称列表，JS 脚本 TODO）
- **setAttribute/setField 后 emit character:changed**
- **关系管理**在 character-system（getRelation/setRelation，不需独立插件）
- **API**：getCharactersAt/getLocation/getAttribute/setAttribute/setField/getRelation/setRelation/moveTo

### dialogue-system 插件
- **职责**：反应式口上管线（triggerScene）、交互式对话管线（startConversation）、{var} 插值、文字格式解析
- **口上 = 演出**——几乎所有指令执行后触发对应口上，dialogue-system 不只是"对话系统"
- **三层口上**：场景通用（scene-dialogue.toml）+ 角色通用（character-dialogue.toml，fallback）+ 角色专属（characters/dialogue/{charId}/dialogue.toml）
- **优先级**：角色专属 > 角色通用，场景通用独立输出（两者都输出）
- **triggerScene(scene, charId?)**——同步调用，charId 可选（无 charId 只查场景通用）
- **startConversation(charId, conversationId?)**——异步触发 dialogue mode，自动选第一个 condition 满足的对话
- **对话期间 selected = 对话对象**
- **终端节点**自动 exitMode（不依赖 effects）
- **conversation node effects** Phase 7 跳过（effect-system Phase 9 接入后自动生效）
- **不硬依赖 character-system**——直接用 entity-system 查角色
- **注册 talk 指令**（character_commands，modes=['exploration']，condition=selected!=null），从 native-commands 移除 talk
- **scene 由其他系统主动调用**（不自己监听事件判断）——combat 调 triggerScene(target,'hurt')，map 调 triggerScene('move') 等
- **监听 location:enter** 自己触发 greet 口上（场景 + 在场角色逐个）
- **API**：triggerScene/startConversation/getConversations/interpolate
- **事件**：dialogue:start/dialogue:line/dialogue:end

### 插件加载顺序
- **data_dependencies topo-sort**：character-system provides="characters:initialized"，map-system/dialogue-system depends_on="characters:initialized"
- character-system onEnable 在 map-system/dialogue-system 之前

### plugin-manager 扩展
- **PluginContext 加 commands 引用**：ctx.commands.register(cmd)/unregister(id)
- **PluginContext 的 ui.registerSlot 真正注册到 SlotRegistry**（当前空实现）
- **plugin-manager 构造函数接收 SlotRegistry + CommandRegistry 引用**
- **plugin.toml [ui] 段指令注册到 CommandRegistry**（onEnable 后遍历 def.ui 注册，source='plugin:xxx'）
- **handler 类指令**（JS 脚本路径）Phase 6-7 跳过（需沙箱 Phase 11），只处理 effects 类 + 插件 onEnable 中动态注册

### mod-loader 扩展
- 加载 `characters/npc.toml`（spawns）
- 加载 `definitions/scene-dialogue.toml` + `definitions/character-dialogue.toml`
- 加载 `characters/dialogue/{charId}/dialogue.toml` + `characters/dialogue/{charId}/conversations/*.toml`
- 加载后校验 exit.target/parent 存在（validateLocations）
- 不可达警告（无 exit 指向且无 parent）

### 文字格式
- **Markdown 子集 + 扩展语法**，NarrativeLog 渲染层解析
- `**加粗**` / `*斜体*` / `~~删除线~~` / `||spoiler||`（黑框点击展开）
- `{{color:#RRGGBB 文字}}` / `{{color:#AARRGGBB 文字}}`（hex RGB + 透明度）
- `{{font:字体名 文字}}` / `{{size:large 文字}}`
- Phase 7 实现

### test-mod 数据补全
- npc.toml（spawns 测试）
- scene-dialogue.toml + character-dialogue.toml
- innkeeper 的 `characters/dialogue/innkeeper/dialogue.toml` + conversations/
- roster 角色也能有专属口上（三级体系只是资源分组，不影响功能）

---

## 二、Task 拆分

### Phase 6（map-system + character-system）

### Task 6.0：plugin-manager 扩展

**目标**：PluginContext 加 commands/ui 引用，TOML [ui] 指令注册到 CommandRegistry，data_dependencies topo-sort。

**Files:**
- Modify: `src/core/plugin-manager.ts`
- Modify: `src/core/types.ts`（PluginContext 加 commands）
- Modify: `src/core/plugin-manager.test.ts`
- Create: `src/core/data-dependencies.ts`（topo-sort 逻辑）
- Create: `src/core/data-dependencies.test.ts`

**Steps:**

- [ ] **Step 1: PluginContext 扩展 types.ts**
  - 加 `commands: { register: (cmd: CommandDef) => void; unregister: (id: string) => void }`
  - ui.registerSlot 改为真实注册（类型签名不变，实现由 plugin-manager 注入）

- [ ] **Step 2: plugin-manager 构造函数加 SlotRegistry + CommandRegistry**
  - `constructor(apiSystem, eventBus, slotRegistry?, commandRegistry?)`
  - createContext 时注入 commands.register → commandRegistry.register
  - createContext 时注入 ui.registerSlot → slotRegistry.register

- [ ] **Step 3: TOML [ui] 指令注册到 CommandRegistry**
  - loadPlugins onEnable 后遍历 def.ui 的 location_commands/character_commands/main_menu
  - 转换为 CommandDef 注册到 commandRegistry，source='plugin:{id}'
  - handler 类指令（JS 脚本路径）Phase 6-7 跳过 + warning

- [ ] **Step 4: data_dependencies topo-sort**
  - `// 注释：插件在 plugin.toml 声明 data_dependencies.provides 和 data_dependencies.depends_on`
  - `resolveDataDependencies(plugins: PluginDef[]): string[]` → topo-sort 返回 onEnable 顺序
  - character-system provides="characters:initialized"，map-system/dialogue-system depends_on 它
  - 无 data_dependencies 的插件按原 sortByExtends 顺序

- [ ] **Step 5: 测试**
  - PluginContext.commands.register 注册到 CommandRegistry
  - TOML [ui] 指令注册到 CommandRegistry
  - data_dependencies topo-sort 正确排序

```bash
npx vitest run src/core/plugin-manager.test.ts src/core/data-dependencies.test.ts
npm run typecheck
```

---

### Task 6.1：mod-loader 扩展

**目标**：加载 npc.toml、对话数据、校验 exit/parent。

**Files:**
- Modify: `src/core/mod-loader.ts`
- Modify: `src/core/mod-loader.test.ts`

**Steps:**

- [ ] **Step 1: 加载 npc.toml**
  - parseModData 解析 `characters/npc.toml` 的 `[[spawns]]` → `mod.npcSpawns`

- [ ] **Step 2: 加载对话数据**
  - 解析 `definitions/scene-dialogue.toml` → `mod.sceneDialogue`（`[[scene_lines]]`）
  - 解析 `definitions/character-dialogue.toml` → `mod.characterDialogue`（`[[character_lines]]`）
  - 解析 `characters/dialogue/*/dialogue.toml` → `mod.characterSpecificDialogue`（Map<charId, lines[]>）
  - 解析 `characters/dialogue/*/conversations/*.toml` → `mod.conversations`（Map<charId, Conversation[]>）

- [ ] **Step 3: validateLocations**
  - 加载完所有 locations 后校验 exit.target 存在
  - 校验 parent 存在（非 null 时）
  - 不可达警告（无 exit 指向且无 parent）

- [ ] **Step 4: LoadedMod 接口扩展**
  - 加 npcSpawns/sceneDialogue/characterDialogue/characterSpecificDialogue/conversations 字段

- [ ] **Step 5: 测试**
  - npc.toml 解析
  - 对话数据解析
  - exit.target 不存在报错
  - parent 不存在报错
  - 不可达 warning

```bash
npx vitest run src/core/mod-loader.test.ts
npm run typecheck
```

---

### Task 6.2：map-system 插件

**目标**：实现 map-system 插件——move 指令、map API、MapView 渲染。

**Files:**
- Create: `src/plugins/map-system/plugin.toml`
- Create: `src/plugins/map-system/index.ts`
- Create: `src/plugins/map-system/map-system.test.ts`

**Steps:**

- [ ] **Step 1: plugin.toml**
  ```toml
  [meta]
  id = "map-system"
  name = "地图系统"
  version = "1.0.0"

  [data_dependencies]
  provides = ["map:loaded"]
  depends_on = ["characters:initialized"]

  [condition_fields]
  "location.id" = { type = "string", description = "当前地点ID" }
  "location.type" = { type = "string", description = "当前地点类型" }
  "location.parent" = { type = "string", description = "父地点ID" }

  [[events.listen]]
  name = "location:enter"
  description = "玩家进入地点"

  [ui]
  location_commands = [
    { id = "move", label = "移动", modes = ["exploration"], priority = 5,
      handler = "move.js" }
  ]
  ```

- [ ] **Step 2: index.ts onLoad + onEnable**
  - onLoad: 无（map-system 无需提前声明）
  - onEnable:
    - 注册 map API（ctx.api.register('map', {...})）
    - 注册 move 指令（ctx.commands.register，handler 调 MapView 渲染）
    - 从 native-commands 移除 move 占位

- [ ] **Step 3: map API 实现**
  - getCurrentLocation/getExits/getChildren/getAncestors/getLocation/hasTag/moveTo
  - moveTo 封装 gameContext.moveTo + 日志输出

- [ ] **Step 4: move 指令 handler**
  - 把 MapView 作为 interactive log entry 写入叙事日志
  - 玩家点击地点 → 调 map.moveTo → markConsumed

- [ ] **Step 5: 测试**
  - map API 正确返回数据
  - move 指令注册
  - getAncestors 递归正确

```bash
npx vitest run src/plugins/map-system/
npm run typecheck
```

---

### Task 6.3：character-system 插件

**目标**：实现 character-system 插件——current_location 初始化、AI 移动、NPC spawns、character API。

**Files:**
- Create: `src/plugins/character-system/plugin.toml`
- Create: `src/plugins/character-system/index.ts`
- Create: `src/plugins/character-system/character-system.test.ts`

**Steps:**

- [ ] **Step 1: plugin.toml**
  ```toml
  [meta]
  id = "character-system"
  name = "角色系统"
  version = "1.0.0"

  [data_dependencies]
  provides = ["characters:initialized"]
  depends_on = []

  [condition_fields]
  "character.{id}.current_location" = { type = "string", description = "角色当前地点" }

  [[events.listen]]
  name = "game:hour_changed"
  description = "AI 移动检查"

  [[events.listen]]
  name = "location:enter"
  description = "NPC spawns 检查"
  ```

- [ ] **Step 2: index.ts onLoad + onEnable**
  - onLoad: 无
  - onEnable:
    - 初始化所有角色 current_location（home_locations 最高权重）
    - 注册 character API
    - 监听 game:hour_changed → AI 移动
    - 监听 location:enter → NPC spawns

- [ ] **Step 3: current_location 初始化**
  - 遍历 entitySystem.getAll('character')
  - 每个角色的 home_locations 按权重选最高 → 设 current_location
  - 无 home_locations → current_location = null（或 starting_location？TODO）

- [ ] **Step 4: AI 移动**
  - game:hour_changed handler：
    - 遍历所有角色
    - activity=0 跳过
    - activity<0.3 → hour%5==0 才检查
    - activity>=0.3 → 每小时检查
    - Math.random() < activity → 触发移动决策
    - time_rules 优先（hour_range 匹配 → 加权随机 target）
    - 无 time_rules → home_locations 加权随机
    - 更新 current_location + emit character:changed

- [ ] **Step 5: NPC spawns**
  - location:enter handler：
    - 查 npcSpawns 中 at_locations 包含当前地点的条目
    - 检查已生成记录（game-state 实体）
    - 未生成 → 按 count 随机数量 + template 实例化 + overrides
    - name_generator：Phase 6-7 只支持内联 names 列表，JS 脚本 TODO
    - 注册到 entity-system + 设 current_location

- [ ] **Step 6: character API**
  - getCharactersAt/getLocation/getAttribute/setAttribute/setField/getRelation/setRelation/moveTo
  - setAttribute/setField 后 emit character:changed

- [ ] **Step 7: 测试**
  - current_location 初始化正确
  - AI 移动概率逻辑
  - NPC spawns 生成
  - character API 读写

```bash
npx vitest run src/plugins/character-system/
npm run typecheck
```

---

### Task 6.4：test-mod 数据补全

**目标**：补全 test-mod 的 npc.toml + 对话数据。

**Files:**
- Create: `mods/test-mod/characters/npc.toml`
- Create: `mods/test-mod/definitions/scene-dialogue.toml`
- Create: `mods/test-mod/definitions/character-dialogue.toml`
- Create: `mods/test-mod/characters/dialogue/innkeeper/dialogue.toml`
- Create: `mods/test-mod/characters/dialogue/innkeeper/conversations/daily_chat.toml`
- Modify: `mods/test-mod/maps/locations/town_square.toml`（加更多 exits 测试）

**Steps:**
- npc.toml: 1-2 个 spawn 条目
- scene-dialogue.toml: 进入酒馆场景口上
- character-dialogue.toml: greet 默认口上
- innkeeper dialogue.toml: greet 专属口上 + hurt 口上
- innkeeper conversations/daily_chat.toml: 3-4 个 node 的分支对话
- 验证: npm run test + typecheck

---

### Task 6.5：Phase 6 集成测试

**目标**：端到端验证 map-system + character-system。

**Files:**
- Create: `src/plugins/phase-6-integration.test.ts`

**Steps:**
- 加载 test-mod → 角色初始化 current_location
- move 指令触发 MapView log entry
- game:hour_changed → AI 移动
- NPC spawns 生成
- npm run test + typecheck + dev 目视

---

### Phase 7（dialogue-system）

### Task 7.1：dialogue-system 插件核心

**目标**：实现 dialogue-system 插件——API 注册、triggerScene、startConversation、{var} 插值。

**Files:**
- Create: `src/plugins/dialogue-system/plugin.toml`
- Create: `src/plugins/dialogue-system/index.ts`
- Create: `src/plugins/dialogue-system/dialogue-system.test.ts`

**Steps:**

- [ ] **Step 1: plugin.toml**
  ```toml
  [meta]
  id = "dialogue-system"
  name = "对话/口上系统"
  version = "1.0.0"

  [data_dependencies]
  provides = ["dialogue:ready"]
  depends_on = ["characters:initialized"]

  [[events.listen]]
  name = "location:enter"
  description = "触发 greet 口上"

  [ui]
  character_commands = [
    { id = "talk", label = "交谈", modes = ["exploration"], priority = 10,
      condition = "selected != null" }
  ]
  ```

- [ ] **Step 2: index.ts onLoad + onEnable**
  - onLoad: 注册 start_conversation effect type（TODO: effect-system Phase 9 接入）
  - onEnable:
    - 注册 dialogue API
    - 注册 talk 指令
    - 监听 location:enter → 触发 greet 口上
    - 从 native-commands 移除 talk 占位

- [ ] **Step 3: dialogue API**
  - triggerScene(scene, charId?) — 同步，三层口上匹配
  - startConversation(charId, conversationId?) — 异步触发 dialogue mode
  - getConversations(charId) — 返回对话列表
  - interpolate(text, context) — {var} 插值

- [ ] **Step 4: triggerScene 实现**
  - 查 scene-dialogue.toml（场景通用）→ 匹配 scene + condition → 随机选 → 写日志
  - 有 charId 时查角色专属 > 角色通用 fallback → 匹配 → 写日志
  - 无匹配 → 静默跳过

- [ ] **Step 5: startConversation 实现**
  - 获取对话列表 → 选第一个 condition 满足的
  - enterMode('dialogue') + 设 selected = charId
  - 渲染 start node（lines 写日志 + choices 写 interactive entry）
  - emit dialogue:start

- [ ] **Step 6: {var} 插值**
  - 正则匹配 {xxx} → 从 context 解析
  - {player.name}/{player.气血}/{character.name}/{character.好感度}/{location.name}/{time.hour}
  - 未找到保留原样

- [ ] **Step 7: 测试**
  - triggerScene 三层匹配
  - startConversation 进入 dialogue mode
  - {var} 插值

---

### Task 7.2：反应式口上管线

**目标**：完善三层口上匹配 + 优先级 + location:enter 触发 greet。

**Files:**
- Modify: `src/plugins/dialogue-system/index.ts`
- Create: `src/plugins/dialogue-system/reactive-lines.test.ts`

**Steps:**

- [ ] **Step 1: 三层口上数据加载**
  - 从 mod-loader 获取 sceneDialogue/characterDialogue/characterSpecificDialogue
  - 构建 Map<scene, lines[]>（场景通用）+ Map<charId, Map<scene, lines[]>>（角色专属+通用）

- [ ] **Step 2: 优先级逻辑**
  - 角色专属 > 角色通用
  - 场景通用独立输出
  - 多条匹配 → 随机选一条

- [ ] **Step 3: location:enter 触发 greet**
  - 查场景通用（scene="enter" 或 scene=locationId）
  - 遍历在场角色 → 对每个调 triggerScene('greet', charId)

- [ ] **Step 4: 测试**
  - 三层优先级
  - 随机选择
  - location:enter 触发

---

### Task 7.3：交互式对话管线

**目标**：conversation 加载 + node 渲染 + choice 选择 + exitMode。

**Files:**
- Modify: `src/plugins/dialogue-system/index.ts`
- Create: `src/plugins/dialogue-system/conversations.test.ts`

**Steps:**

- [ ] **Step 1: conversation 运行时状态**
  - currentConversation: { charId, convId, nodeId } | null

- [ ] **Step 2: node 渲染**
  - lines 写入叙事日志（type='dialogue'，应用 {var} 插值 + 文字格式）
  - choices 写入 interactive entry（type='dialogue_choice'，payload={choices}）
  - node effects 跳过（TODO phase-9 effect-system）

- [ ] **Step 3: choice 选择**
  - 玩家选 choice → markConsumed → condition 求值 → 跳转 next node
  - 无 choices 无 next → 终端节点 → exitMode + emit dialogue:end

- [ ] **Step 4: 对话中断**
  - 模式被 abort → 清空 currentConversation

- [ ] **Step 5: 测试**
  - node 渲染
  - choice 选择跳转
  - 终端节点 exitMode
  - 中断清空

---

### Task 7.4：文字格式解析 + native-commands 补口上

**目标**：NarrativeLog 支持 Markdown 子集格式 + native-commands 各指令补 triggerScene 调用。

**Files:**
- Create: `src/ui/utils/text-formatter.ts`
- Create: `src/ui/utils/text-formatter.test.ts`
- Modify: `src/ui/components/NarrativeLog.vue`
- Modify: `src/ui/native-commands.ts`

**Steps:**

- [ ] **Step 1: text-formatter.ts**
  - `formatText(text: string): FormattedSegment[]` — 解析为带样式的段落数组
  - 支持：`**bold**` / `*italic*` / `~~strikethrough~~` / `||spoiler||` / `{{color:#RRGGBB text}}` / `{{font:name text}}` / `{{size:large text}}`
  - 颜色格式：#RRGGBB 和 #AARRGGBB（含透明度）

- [ ] **Step 2: NarrativeLog.vue 渲染格式化文本**
  - 普通文本条目调 formatText → 渲染为带 span 样式的 HTML
  - spoiler 渲染为黑框（点击展开）

- [ ] **Step 3: native-commands 补 triggerScene**
  - rest 指令 handler 执行后调 ctx.api.call('dialogue', 'triggerScene', 'rest')
  - move 指令（map-system 接管后）调 triggerScene('move')
  - 其他指令按需补

- [ ] **Step 4: 测试**
  - formatText 解析各种格式
  - 颜色 hex 解析
  - spoiler 标记

---

### Task 7.5：Phase 7 集成测试

**目标**：端到端验证 dialogue-system。

**Files:**
- Create: `src/plugins/phase-7-integration.test.ts`

**Steps:**
- triggerScene 输出口上到日志
- startConversation 进入对话模式
- choice 选择跳转
- 终端节点退出对话
- 文字格式渲染
- native-commands 指令触口上
- npm run test + typecheck + dev 目视

---

## 三、依赖关系

```
Task 6.0 (plugin-manager 扩展) ─┐
Task 6.1 (mod-loader 扩展)     ─┼─→ Task 6.2 (map-system) ─┐
                                 └─→ Task 6.3 (character-system) ─┤
                                                                  ├─→ Task 6.5 (集成测试)
Task 6.4 (test-mod 数据)        ──────────────────────────────→─┘
                                                                      │
                                                                      ↓
Task 7.1 (dialogue-system 核心) ─→ Task 7.2 (反应式口上)          │
                                  ─→ Task 7.3 (交互式对话)         │
                                  ─→ Task 7.4 (文字格式+口上补)    │
                                                                      │
                                                                  Task 7.5 (集成测试)
```

**推荐实施顺序**：
1. 6.0 + 6.1（基础设施，可并行）
2. 6.4（test-mod 数据）
3. 6.2 + 6.3（map-system + character-system，可并行）
4. 6.5（Phase 6 集成测试）
5. 7.1（dialogue-system 核心）
6. 7.2 + 7.3 + 7.4（口上管线 + 对话管线 + 文字格式，可并行）
7. 7.5（Phase 7 集成测试）

---

## 四、Deferred / 备忘

| # | 项目 | 后续阶段 | 备忘 |
|---|------|----------|------|
| 1 | npc.toml name_generator JS 脚本 | 后续阶段 | Phase 6-7 只支持内联 names 列表 |
| 2 | conversation node effects 执行 | Phase 9 | effect-system 接入后自动生效 |
| 3 | plugin.toml handler 类指令（JS 脚本路径） | Phase 11 | 需沙箱执行 |
| 4 | ui-overrides.toml mod override 指令 | 后续阶段 | source 字段已支持 |
| 5 | talk 指令 label 可配置 | 后续阶段 | Phase 7 用默认"交谈" |
| 6 | 任务/事件中的口上 | Phase 8-10 | quest-system 委托 dialogue-system |
| 7 | 场景专属口上（任务/事件触发） | 后续阶段 | 写在任务/事件 TOML 里 |
| 8 | time_cost 详细规则（mod 驱动） | 后续阶段 | 当前最小化 |
| 9 | 复杂历法 | 后续阶段 | Phase 5 用 day%7 |
| 10 | data_dependencies 完整实现 | Phase 6 | provides/depends_on topo-sort |

---

## 五、验收标准

- [ ] `npm run dev` 加载 test-mod 无报错
- [ ] character-system：角色初始化 current_location，AI 移动在 hour_changed 时触发
- [ ] map-system：move 指令显示 MapView，点击地点移动，显示耗时
- [ ] map API：getExits/getChildren/getAncestors 正确返回
- [ ] NPC spawns：首次进入地点生成路人
- [ ] dialogue-system：triggerScene 输出三层口上（场景+角色专属/通用）
- [ ] dialogue-system：startConversation 进入对话模式，node 渲染，choice 选择
- [ ] dialogue-system：终端节点自动 exitMode
- [ ] 文字格式：**加粗**/*斜体*/||spoiler||/{{color}} 正确渲染
- [ ] {var} 插值：{player.name} 等正确替换
- [ ] native-commands：rest/move 等指令执行后触口上
- [ ] 插件隔离：禁用 dialogue-system 不影响 map/character-system
- [ ] `npm run typecheck` 无错误
- [ ] `npm run test` 全部通过
