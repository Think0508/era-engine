# Phase 5: UI 框架 — 详细实施计划

> 状态：**待实施**（生成于 2026-06-29，基于 grilling session 的全部决策）
> 前置：Phase 1-4 完成（core 10 模块 + 100 测试通过）
> 验收：`npm run dev` 加载 test-mod，能看到完整主界面（探索模式），可切换 era经典/现代主题，模式切换时指令栏替换，每日菜单出现

---

## 一、设计决策汇总（grilling 产出）

### 1. 两套 UI 主题
- **era经典**：全屏纵向堆叠，无侧栏，文本密度高
- **现代**：左侧可调宽侧栏（不变成底部抽屉）+ 主体区，参考 DOL
- **共享同一套底层 UI 插槽系统**，插件只注册一次
- **运行时切换**，两套都是"把相同的东西放在不同地方给玩家看"
- 移动端两套主题核心不变（现代主题保留侧栏）
- 插件不能只支持其中一套（因为本质相同）

### 2. Status vs Parameter
- **Status**：持久/半持久状态栏（体力/气力/精力 + 情绪/理性），mod 可扩展
- **Parameter**：每日默认归零的临时身体/情绪数值（类似 eraTW Palam），**仅 NPC 有**
- **主角的每日重置状态**：类似 Parameter 但不同名、有特殊性（B 方案）
- Parameter 每日重置发生在玩家醒来时（不依赖开场菜单出现）

### 3. 指令系统
- **指令栏分 Act_COM（场景行动）与 Ex_COM（系统指令）**，分别折叠
- **模式切换时指令栏整体替换**（不是叠加）
- `location_commands` / `character_commands` = Act_COM，`main_menu` = Ex_COM
- **编号显示在指令后**（如 `交谈 [12]`），可在选项中关闭
- **Command ID**（稳定字符串）用于自动化脚本；**Numeric shortcut**（每屏动态数字）用于键盘输入
- 自动化用字符串 ID：`talk;move(gate);gather`
- 屏幕小键盘：数字输入 + 快捷指令，两个功能独立开关，都默认关闭，浮动/可隐藏

### 4. 角色焦点/选中
- 当前地点有 NPC 时才有焦点（选中角色），无 NPC 时角色栏不存在
- 切换地点时选中角色清空
- 点击标题栏角色名 = 切换焦点（不打开面板）
- 长按角色名/立绘 = 先切换焦点 + 弹出相关指令
- 战斗中 selected = 当前战斗目标，可手动切换

### 5. 折叠区块
- Status / Parameter / Look / 指令栏（Act_COM 和 Ex_COM 分别）可独立折叠
- 折叠状态**保存到存档**
- 默认不折叠
- 支持嵌套折叠（Look 内服装/设定/立绘分别折叠）

### 6. 每日开场菜单
- **不能跳过**
- 触发：新游戏第一天 / 读档后 / 每个游戏内新天开始（被动昏迷睡觉除外）
- 内容可扩展（插件注册菜单项）
- 从子面板返回时回到每日菜单

### 7. 对话/口上
- 对话 = 全屏叙事日志滚动，选项在最新一行出现
- 选项可鼠标点击（hover 高亮）或键盘输入（y/n/编号/回车）
- 交互式对话树选项支持方向键转焦点

### 8. 现代主题侧栏
- 侧栏底部始终有按钮（类似 DOL）
- 点击按钮后在主显示区弹出大面板（覆盖主界面），关闭后回主界面
- 面板分选项卡，支持点击文字折叠对应项
- 侧栏模式可切换：盖在主界面上 / 与主界面并排
- 6 个按钮分组不写死，mod 可扩展/重命名
- cheat 按钮不自动隐藏（选项里可隐藏）

### 9. 地图
- Phase 5 先做文字节点列表式地图
- 点击地点移动，显示移动耗时
- 维护地图层级关系文档（与代码同源，避免改两处）

### 10. Look 区块
- 上半部分：选中角色的穿着/装备
- 下半部分：本地点所有角色立绘（按标题栏顺序排列）
- Phase 5 只支持单张立绘，多图（差分/部位放大）通过插槽预留扩展性

### 11. 模式切换视觉
- 最小化实现：瞬间替换
- 留出接口让 mod 可自定义过渡效果

### 12. Grilling 补充决策（G1-G21）

**G1 指令执行流程**：引擎在指令执行前后自动包裹 EXECUTING（command-executor 负责），effect-system 不关心 executionState。

**G3 地图与日志的关系**：地图作为日志中一条 `type='map'` 的 interactive entry，玩家可在 entry 上持续交互直到移动或取消。

**G4 对话选项渲染**：对话期间一直 EXECUTING，多个 node 的文本/choices 不断追加到日志，玩家选择不回 IDLE。

**G5 战斗模式布局**：战斗期间 modeStack=combat，executionState 在 IDLE（选行动，显示战斗指令）↔ EXECUTING（回合执行，全屏文本）间交替。

**G6 test-mod 数据补全**：提前到批次1，补 `attributes.toml`（体力/气力/精力/情绪/理性/Parameter 组）+ `meta.toml`（player_character/starting_location）+ 移除 combat-base 依赖。

**G7-G8 原生指令机制**：`src/ui/native-commands.ts` 通过 CommandRegistry 注册，source 字段标记来源，mod 可 override（ui-overrides.toml，Phase 5 留接口）。handler 函数走 NativeCommandContext（不是 PluginContext）。

**G9-G10 CommandRegistry vs SlotRegistry**：CommandRegistry（core）是指令 single source of truth，SlotRegistry 只管非指令插槽。插件 `ctx.ui.registerSlot('command-bar')` 内部写入 CommandRegistry。

**G11-G12 非指令插槽与分组**：location-parameter/look 等区都开放插槽扩展。display_group 字段是通用分组机制（Status/Parameter/Look 都用），组标题可在选项中开关（默认平铺不显示组标题，但折叠仍按组）。组内可嵌套折叠。

**G13 装备系统**：`definitions/equipment.toml` 定义部位，角色 `equipment` 字段存当前装备。Phase 5 只显示不操作，装备有实际数值意义（不是花瓶）。

**G14-G15 handler vs effects**：Phase 5 原生指令全 handler 类（不触发 effect-system），effects 类指令在 effect-system 未注册时 warning+跳过。move 指令调 `gameContext.moveTo()`。

**G15 moveTo 细节**：先 leave 后 enter；time_cost 最小化（同 parent=5min，不同 parent=60min），后续由 mod 驱动详细规则；Phase 5 放 core，Phase 6 map-system 可包装。

**G16 备忘机制**：代码中用 `// TODO(phase-x):` 注释（破例允许），计划文档末尾 Deferred 章节，开发检查清单标注。

**G17 game-store 与 GameContext 同步**：GameContext（core）是 source of truth，game-store（Pinia）是响应式镜像。core → Pinia 通过事件总线监听，Pinia → core 通过 bridge 调 core API。

**G18 NarrativeLog 归属**：core 维护 NarrativeLog 类（存储/淘汰/clear），LogEntry 加 `interactive`/`consumed`/`payload` 可选字段。ui 层注册自定义 type 渲染器。

**G19 测试义务**：新增 core 模块各一个测试文件，native-commands 测 handler 调用正确 uiStore action。

**G20 标题/模组选择/响应式/偏好持久化**：Phase 5 实现 TitleScreen+ModSelect 最小化（新游戏直进每日菜单，继续=开发中）。移动端现代主题侧栏默认收起滑出（overlay），选项可切并排。UI 偏好（theme/sidebar/numpad/字体/字号/深色模式）存 localStorage，foldStates 存存档。

**G21 深色模式**：mod 可在 `theme.toml` 加 `[colors_dark]` 段，未提供时引擎做简单算法反色 fallback。`data-color-scheme` 属性区分。字体/字号覆盖 mod 主题值，存 localStorage。

**G22 角色图片**：角色 `assets` 字段（portrait=主立绘，head=头图可选，无 head 用 portrait 当头图，无图不显示不占位）。多图 variants 留字段后续扩展。图片用 Vite glob 扫描打包，组件按选中角色响应式切换。

**G23 天气**：Phase 5 不实现天气系统，StatusBar 预留天气显示位。game-store 默认 `weather = { name: "晴", temperature: 20 }`（test-mod 假数据）。未来天气插件写入 game-store.weather。

**G24 金钱**：金钱是普通 attribute（display_group="economy"），Sidebar 平铺显示。预留 `economy-bar` 插槽供未来多货币/代币/股市/汇率插件接管。

**G25 日历显示**：`definitions/calendar.toml` 定义月名/星期名/时辰名（mod 文化层）。`formatTime(time, calendar)` 工具函数。未定义 → fallback 纯数字。星期 = `day % 7`（Phase 5 最简）。test-mod 加最简 calendar.toml。

**G26 charactersAtLocation 更新**：三个时机（location:enter / game:hour_changed / character:changed）。Phase 5 启动时初始化角色 current_location = home_locations 最高权重地点。character:changed 监听到位但无触发源（Phase 6）。

**G27 每日菜单触发**：新游戏→pushMode('daily_menu')；读档→pushMode（Phase 11 接入）；新天→`game:new_day` 事件 payload 加 `reason: 'natural'|'forced'`，forced 不触发。"睁开眼睛"→exitMode + emit `game:wake_up`（Parameter 重置监听）。Phase 5 加"@测试：跳到明天"作弊指令供测试。

**G28 启动流程**：main.ts 读 active_mod → 空→ModSelect（列 mods/ 下含 meta.toml 的目录，只读 name/description）→ 非空→TitleScreen（引擎提供 UI，mod 供 title/description）。新游戏→实例化 player entity（roster player 条目 + starting_location）→ pushMode('daily_menu')。ModSelect 不写回配置文件（只内存切换）。

**G29 localStorage 持久化**：ui-store 提供 saveToLocalStorage/loadFromLocalStorage，键 `era-engine:ui-preferences`（不加 mod 前缀，设备级跨 mod 共享）。watch+debounce 500ms 自动存。foldStates 不存 localStorage（存存档）。localStorage 不可用时 try/catch 静默跳过。

**G30 立绘交互**：立绘上方名字 + 立绘本身，点击→切换焦点，长按→切换焦点+弹出 CommandPopover（character_commands 按模式/条件过滤）。角色指令栏开关（全局，character_commands 是否在指令栏显示）Phase 5 留接口 TODO。

**G31 选项面板分类**：显示（主题/深色/组标题/字体/字号）、侧栏（模式/宽度）、指令栏（编号/收藏/角色指令开关）、小键盘（显示/数字/快捷指令）、游戏（cheat可见性）、存档（Phase 11）。`// TODO: 后期加选项、重排版`。

**G32 其他**：日志无搜索（TODO）；上回指令提示（Task 5.9 已含）；favorites 存 localStorage；侧栏角色选项卡切换显示对象（Parameter/head/status 跟着切换）；移动端指令栏多列网格（非一行一个）；大事志只做占位（"过了多少天"+日历，不填内容，TODO）。

---

## 二、架构设计

### 目录结构

```
src/
├── core/                        # Phase 5 新增 core 模块
│   ├── command-registry.ts      # 指令注册表（single source of truth）
│   ├── command-executor.ts      # 指令执行器（包裹 EXECUTING）
│   ├── narrative-log.ts         # 叙事日志（存储/淘汰/clear）
│   └── game-context.ts          # 扩展：moveTo 方法
├── ui/
│   ├── layout/
│   │   ├── AppLayout.vue          # 根布局：按 (state × mode × theme) 选子布局
│   │   ├── ExplorationLayout.vue  # era经典探索布局（纵向堆叠）
│   │   ├── ModernLayout.vue       # 现代主题布局（侧栏 + 主体）
│   │   ├── FullScreenTextLayout.vue  # EXECUTING 状态（仅叙事日志）
│   │   └── DailyMenuLayout.vue    # 每日开场菜单布局
│   ├── slots/
│   │   ├── slot-registry.ts       # 非指令插槽注册表（provide/inject）
│   │   └── SlotRenderer.vue       # 按优先级+条件渲染插槽项
│   ├── stores/
│   │   ├── ui-store.ts            # UI 状态（selected, fold, theme, sidebar, numpad, 字体, 深色模式）
│   │   └── game-store.ts          # 响应式游戏状态（player, location, time, mode stack, exec state）
│   ├── theme/
│   │   ├── theme-loader.ts        # 解析 theme.toml → CSS 变量（含 [colors_dark]）
│   │   └── theme-manager.ts       # 主题切换（era经典/现代/深色模式），应用/卸载
│   ├── components/
│   │   ├── ResourceBar.vue        # 通用资源条（label + value + max + 彩色条）
│   │   ├── CollapsibleSection.vue # 通用折叠区块（标题 + 折叠状态 + slot，支持嵌套）
│   │   ├── GameButton.vue         # 主题按钮
│   │   ├── StatusBar.vue          # 顶栏（时间/天气/地点/资源条）
│   │   ├── CharacterBar.vue       # 角色栏（NPC 列表 + 焦点选择）
│   │   ├── StatusSection.vue      # Status 折叠区（玩家 + 选中角色 + 情绪理性 + status-extra 插槽）
│   │   ├── ParameterSection.vue   # Parameter 折叠区（NPC 临时参数，display_group 分组）
│   │   ├── LookSection.vue        # Look 折叠区（装备 + 立绘 + look-extra 插槽）
│   │   ├── Portrait.vue           # 单张立绘（多图扩展性预留插槽）
│   │   ├── CommandBar.vue         # 指令栏（Act_COM + Ex_COM，编号，过滤，收藏）
│   │   ├── CommandItem.vue        # 单条指令（编号 + 标签 + 条件高亮）
│   │   ├── CommandPopover.vue     # 长按角色弹出的指令浮层
│   │   ├── NarrativeLog.vue       # 叙事日志（滚动文本，多类型样式，interactive entry 渲染）
│   │   ├── ScreenNumpad.vue       # 屏幕小键盘（浮动，数字+快捷指令）
│   │   ├── MapView.vue            # 地图视图（文字节点列表，interactive entry 渲染）
│   │   ├── DailyMenu.vue          # 每日开场菜单
│   │   ├── Sidebar.vue            # 现代主题侧栏
│   │   ├── SystemPanel.vue        # 系统面板容器（选项卡 + 折叠项）
│   │   └── CharacterPanel.vue     # 角色详情面板（多页签，区分 player/npc）
│   ├── views/
│   │   ├── TitleScreen.vue        # 标题界面（新游戏/继续/设置/切换模组）
│   │   ├── ModSelect.vue          # 模组选择界面
│   │   └── MainGame.vue           # 主游戏视图（挂载 AppLayout）
│   ├── composables/
│   │   ├── useKeyInput.ts         # 键盘输入处理（数字+回车+y/n+方向键）
│   │   └── useResponsive.ts       # 响应式断点检测（PC/移动）
│   ├── utils/
│   │   └── format-time.ts         # 时间格式化（读 calendar.toml）
│   ├── engine-ui-bridge.ts        # core ↔ Pinia 双向同步
│   └── native-commands.ts         # 原生指令注册（通过 CommandRegistry，可被 mod override）
```

### 布局选择逻辑

```
AppLayout.vue 决策树：
  if (executionState === 'EXECUTING') → FullScreenTextLayout
  else if (modeStack.top === 'daily_menu') → DailyMenuLayout
  else if (modeStack.top === 'combat') → combat layout（Phase 5 骨架，指令栏换战斗指令）
  else if (modeStack.top === 'dialogue') → 对话在 FullScreenTextLayout 中处理
  else (exploration) → era经典: ExplorationLayout / 现代: ModernLayout
```

### Pinia Store 设计

**uiStore**:
```typescript
interface UIState {
  theme: 'era' | 'modern'           // UI 主题
  selectedCharacterId: string | null // 选中角色（焦点）
  foldStates: {                      // 折叠状态（保存到存档）
    status: boolean
    parameter: boolean
    look: boolean
    lookEquipment: boolean
    lookPortrait: boolean
    actCom: boolean
    exCom: boolean
    [key: string]: boolean           // 可扩展
  }
  sidebarOpen: boolean               // 现代主题侧栏是否展开
  sidebarMode: 'overlay' | 'sideBySide'  // 侧栏模式
  sidebarWidth: number               // 侧栏宽度
  numpadVisible: boolean             // 屏幕小键盘显示
  numpadNumbers: boolean             // 小键盘数字功能开关
  numpadShortcuts: boolean           // 小键盘快捷指令功能开关
  showCommandNumbers: boolean        // 指令编号显示开关
  activePanel: string | null         // 当前打开的系统面板（null=无）
  commandFilter: string[]            // 指令过滤（显示哪些类别）
  favorites: string[]                // 收藏指令 ID 列表
}
```

**gameStore**:
```typescript
interface GameState {
  player: EntityData | null
  location: LocationData | null
  time: GameTimeData
  modeStack: string[]                // 模式栈
  executionState: 'IDLE' | 'EXECUTING'
  charactersAtLocation: EntityData[] // 当前地点角色列表
  narrativeLogEntries: LogEntry[]    // 叙事日志（session-only）
}
```

### 主题 CSS 变量映射

```typescript
// theme-loader.ts
const THEME_VAR_MAP = {
  'colors.primary': '--color-primary',
  'colors.secondary': '--color-secondary',
  'colors.background': '--color-background',
  'colors.surface': '--color-surface',
  'colors.text': '--color-text',
  'colors.text_secondary': '--color-text-secondary',
  'colors.border': '--color-border',
  'colors.success': '--color-success',
  'colors.danger': '--color-danger',
  'colors.warning': '--color-warning',
  'typography.font_body': '--font-body',
  'typography.font_title': '--font-title',
  'typography.font_size_base': '--font-size-base',
  'spacing.radius_button': '--radius-button',
  'spacing.radius_panel': '--radius-panel',
  'spacing.gap_small': '--gap-small',
  'spacing.gap_medium': '--gap-medium',
  'spacing.gap_large': '--gap-large',
}
```

---

## 三、Task 拆分

### Task 5.0：test-mod 数据补全（最先做）

**目标**：补全 test-mod 的 meta.toml 和 attributes.toml，为后续 UI 开发提供真实数据。

**Files:**
- Modify: `mods/test-mod/meta.toml`
- Modify: `mods/test-mod/definitions/attributes.toml`
- Create: `mods/test-mod/definitions/equipment.toml`
- Create: `mods/test-mod/definitions/calendar.toml`
- Modify: `mods/test-mod/characters/roster.toml`
- Modify: `src/core/mod-loader.ts`（解析新定义文件）
- Modify: `src/core/mod-loader.test.ts`（测试新解析）

**Steps:**

- [ ] **Step 1: meta.toml 补全**
  ```toml
  [meta]
  id = "test-mod"
  name = "测试模组"
  version = "1.0.0"
  player_character = "player"
  starting_location = "town_square"
  title = "测试模组"
  description = "era-engine 最小测试模组"
  dependencies = []
  ```

- [ ] **Step 2: attributes.toml 补全**
  - 现有 hp/mp/attack/defense/speed 加 display/display_group
  - 新增 体力/气力/精力（Status 显示，display_group="status"）
  - 新增 情绪/理性（Status 第3行，display_group="emotion"）
  - 新增 Parameter（快C/快V/润滑/恭顺/情欲/羞耻，display_group 分"身体快感"/"情绪心理"，daily_reset=true）
  - 新增 眠奸（display_group="特殊"，daily_reset=true，测试 mod 扩展参数）
  - 新增 金钱（display_group="economy"，display=true）

- [ ] **Step 3: equipment.toml 创建**
  ```toml
  [[slots]]
  id = "upper_body"
  name = "上身"
  category = "clothing"

  [[slots]]
  id = "lower_body"
  name = "下身"
  category = "clothing"

  [[slots]]
  id = "accessory"
  name = "饰品"
  category = "accessory"
  ```

- [ ] **Step 4: calendar.toml 创建**
  ```toml
  [calendar]
  month_names = ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"]
  weekday_names = ["日", "一", "二", "三", "四", "五", "六"]
  hour_names = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"]
  ```

- [ ] **Step 5: roster.toml 补全 equipment + assets 字段**
  - 给 player/innkeeper/guard 加 `equipment = { upper_body = "布衣", lower_body = "长裤" }`
  - 给 player 加 `assets = { portrait = "assets/char/player.png" }`（测试用，图可不存在→不显示）
  - `// 注释：assets.head 可选，无 head 用 portrait 当头图，无图不显示不占位`

- [ ] **Step 6: mod-loader.ts 更新解析**
  - `parseModData` 新增解析 `definitions/equipment.toml` → `equipment_slots` 字段
  - `parseModData` 新增解析 `definitions/calendar.toml` → `calendar` 字段
  - `// 注释：这两个定义文件是 mod 文化/显示层，非实体数据，不进存档`
  - 更新对应测试

- [ ] **Step 7: 验证**
```bash
npm run typecheck
npm run test
```

---

### Task 5.1：主题系统

**目标**：解析 `theme.toml`，注入 CSS 变量到 `:root`，支持主题切换与卸载。

**Files:**
- Create: `src/ui/theme/theme-loader.ts`
- Create: `src/ui/theme/theme-manager.ts`
- Create: `src/ui/theme/theme-loader.test.ts`

**Steps:**

- [ ] **Step 1: theme-loader.ts**
  - `parseTheme(rawToml: string): ThemeConfig` — 解析 theme.toml
  - `injectTheme(config: ThemeConfig): void` — 遍历 THEME_VAR_MAP，设置 `document.documentElement.style.setProperty(var, value)`
  - `removeTheme(): void` — 移除所有已注入的 CSS 变量
  - 支持模组自定义变量（`[custom]` 段直接映射为 `--custom-{key}`）

- [ ] **Step 2: theme-manager.ts**
  - `ThemeManager` 类（单例）
  - `loadModTheme(modId: string): Promise<void>` — 通过 mod-loader 读取 theme.toml → injectTheme
  - `setUITheme(theme: 'era' | 'modern'): void` — 切换 UI 主题，设置 `data-ui-theme` 属性 on `<html>`
  - `getUITheme(): 'era' | 'modern'`
  - `unload(): void` — removeTheme + 移除 data-ui-theme

- [ ] **Step 3: 测试**
  - 解析 theme.toml 返回正确结构
  - injectTheme 设置 CSS 变量（mock document）
  - removeTheme 清除变量
  - 主题切换设置 data-ui-theme 属性

```bash
npx vitest run src/ui/theme/theme-loader.test.ts
npm run typecheck
```

---

### Task 5.2：Pinia UI 状态 Store

**目标**：管理所有 UI 状态，支持保存到存档（foldStates）+ localStorage（偏好）+ mock 数据供组件开发。

**Files:**
- Create: `src/ui/stores/ui-store.ts`
- Create: `src/ui/stores/game-store.ts`
- Create: `src/ui/stores/ui-store.test.ts`
- Create: `src/ui/stores/game-store.test.ts`
- Create: `src/ui/stores/mock-data.ts`（组件开发期间的 mock 游戏数据）

**Steps:**

- [ ] **Step 1: ui-store.ts**
  - `useUIStore` Pinia store
  - State: theme, selectedCharacterId, foldStates, sidebarOpen, sidebarMode, sidebarWidth, numpadVisible, numpadNumbers, numpadShortcuts, showCommandNumbers, activePanel, commandFilter, favorites, displayMode(scroll/clear), colorScheme(light/dark), fontFamily, fontSize, showGroupTitles, commandPopoverMode(角色指令栏开关)
  - Actions: selectCharacter(id), clearSelection(), toggleFold(section), setTheme(t), openSidebar(), closeSidebar(), toggleSidebarMode(), setActivePanel(name), addFavorite(cmdId), removeFavorite(cmdId), setDisplayMode(m), setColorScheme(s), setFont(f), setFontSize(s), toggleGroupTitles()
  - Getters: hasSelection, isFolded(section)
  - `saveToLocalStorage(): void` / `loadFromLocalStorage(): void` — 键 `era-engine:ui-preferences`，watch+debounce 500ms 自动存，localStorage 不可用 try/catch 静默跳过
  - `toSaveData()` / `fromSaveData()` — 序列化 foldStates（供存档系统，Phase 11 接入。`// TODO(phase-11): foldStates 存档持久化，当前只内存`）

- [ ] **Step 2: game-store.ts**
  - `useGameStore` Pinia store
  - State: player, location, time, modeStack, executionState, charactersAtLocation, narrativeLogEntries, weather, calendar, equipmentSlots
  - Actions: setPlayer(e), setLocation(loc), setTime(t), pushMode(mode), popMode(), setExecutionState(s), refreshCharactersAtLocation(), addLogEntry(entry), setWeather(w), setCalendar(c), setEquipmentSlots(s)
  - Getters: currentMode (modeStack.top), isExecuting, isIdle
  - 与 core GameContext 双向同步（game-store 是 Vue 响应式镜像，bridge 在 Task 5.15 接入）

- [ ] **Step 3: mock-data.ts**
  - `// 注释：组件开发期间（Task 5.4-5.14）用此 mock 数据填充 game-store，Task 5.15 bridge 替换为真实 core 数据`
  - 导出 mockPlayer（test-mod player entity）、mockLocation（town_square）、mockTime、mockCharactersAtLocation（innkeeper+guard）、mockWeather、mockCalendar、mockEquipmentSlots
  - 数据来源：test-mod 的 TOML 文件内容手抄为 TS 常量（不依赖 mod-loader，纯前端测试用）

- [ ] **Step 4: 测试**
  - ui-store: selectCharacter/clearSelection, toggleFold, favorites 增删, saveToLocalStorage/loadFromLocalStorage（mock localStorage）
  - game-store: pushMode/popMode 栈行为, executionState 切换, addLogEntry

```bash
npx vitest run src/ui/stores/
npm run typecheck
```

---

### Task 5.3：UI 插槽系统 + Core 新模块

**目标**：实现 provide/inject 插槽系统 + core 层的 CommandRegistry/CommandExecutor/NarrativeLog。

**Files:**
- Create: `src/ui/slots/slot-registry.ts`
- Create: `src/ui/slots/SlotRenderer.vue`
- Create: `src/ui/slots/slot-registry.test.ts`
- Create: `src/core/command-registry.ts`
- Create: `src/core/command-registry.test.ts`
- Create: `src/core/command-executor.ts`
- Create: `src/core/command-executor.test.ts`
- Create: `src/core/narrative-log.ts`
- Create: `src/core/narrative-log.test.ts`

**Steps:**

- [ ] **Step 1: slot-registry.ts**
  - `SlotRegistry` 类（非指令插槽）
  - `register(slotName: string, item: UISlotItem): void` — 注册（拒绝同名 slot + 同 id 重复）
  - `unregister(slotName: string, id: string): void`
  - `getItems(slotName: string, ctx: GameContext): UISlotItem[]` — 返回排序后（priority 升序）且条件满足的项
  - `clear(): void`
  - `getSlotNames(): string[]`
  - 响应式：使用 Vue `reactive` 包装 items Map，条件重算通过 subscribe 模式

- [ ] **Step 2: SlotRenderer.vue**
  - Props: `slotName: string`
  - 通过 inject 获取 SlotRegistry
  - 通过 inject 获取 GameContext（响应式）
  - 渲染 `<component :is="item.component" v-for="item in visibleItems" :key="item.id" />`
  - visibleItems = computed(() => registry.getItems(slotName, gameCtx))
  - 条件函数实时求值（依赖 game-store 的响应式变更触发重算）

- [ ] **Step 3: provide/inject setup**
  - `provide` 的 key：`SLOT_REGISTRY_KEY` (Symbol)
  - 在 AppLayout.vue 根组件 provide
  - `useSlotRegistry()` composable — inject + 类型安全

- [ ] **Step 4: command-registry.ts (core)**
  - `CommandRegistry` 类 — 指令 single source of truth
  - `register(cmd: CommandDef): void` — 注册指令（id 唯一，重复报错）
  - `unregister(id: string): void`
  - `getById(id: string): CommandDef | undefined`
  - `getByGroup(group: 'location_commands' | 'character_commands' | 'main_menu'): CommandDef[]`
  - `getByMode(mode: string, group?: string): CommandDef[]` — 按模式过滤 + 按条件求值
  - `clear(): void`
  - CommandDef 接口：`{ id, label, group, modes, condition?, priority?, effects?, handler?, source }`
  - source: `'native' | 'plugin:xxx'`（为 mod override 留接口）
  - 条件求值调用 condition-registry（运行时）

- [ ] **Step 5: command-executor.ts (core)**
  - `CommandExecutor` 类
  - `execute(id: string, ctx: ExecutionContext): Promise<void>`
  - 流程：
    1. 查 CommandRegistry.getById
    2. 再次检查 condition（运行时求值）
    3. `gameContext.setExecutionState('EXECUTING')` + emit `game:execution_start`
    4. if cmd.handler → 调用 handler(ctx)
    5. if cmd.effects → `ctx.api.call('effect-system', 'execute', effects, ctx)` — effect-system 未注册时 warning + 跳过
    6. await 完成
    7. `gameContext.setExecutionState('IDLE')` + emit `game:execution_end`
  - 错误处理：handler/effects 抛错 → error-reporter 报告 + 仍回 IDLE
  - ExecutionContext 暴露：`uiStore`, `gameStore`, `engine` (core API), `api` (PluginContext.api 兼容)

- [ ] **Step 6: narrative-log.ts (core)**
  - `NarrativeLog` 类
  - `write(text: string, type: string, source?: string, interactive?: boolean, payload?: any): string` — 返回 entry id
  - `getEntries(): LogEntry[]`
  - `markConsumed(id: string): void` — 标记 interactive entry 已结束
  - `clear(): void`
  - 自动淘汰：超过 limit（默认1000）删最旧
  - LogEntry 接口：`{ id, text, type, source, timestamp, interactive?, consumed?, payload? }`
  - 新增 type：`'map'`（地图）、`'choice'`（选项列表）、`'dialogue_choice'`（对话选项）
  - `// 注释：write() 内部 emit 'narrative:written' 事件（带 entry），bridge 监听 → game-store.addLogEntry，core 不直接操作 Pinia`

- [ ] **Step 7: game-context.ts 扩展 moveTo + 执行状态/模式栈方法**
  - 新增 `moveTo(targetLocationId: string): Promise<void>`
  - 流程：查 exit 可达性 → 计算 time_cost（最小化：同parent=5min，跨parent=60min）→ advanceTime → emit location:leave → 更新 location → emit location:enter → ui clearSelection
  - `// TODO(phase-6): time_cost 详细规则由 mod 驱动`
  - 新增 `setExecutionState(state: 'IDLE' | 'EXECUTING'): void` — command-executor 调用，emit `game:execution_start`/`game:execution_end`
  - 新增 `enterMode(id: string): void` — push 模式栈，emit `game:mode_changed`（payload: `{ mode: id, action: 'enter' }`）
  - 新增 `exitMode(): void` — pop 模式栈，emit `game:mode_changed`（payload: `{ mode: poppedId, action: 'exit' }`）
  - `// 注释：模式栈由进入模式的系统负责调用 exitMode，引擎不自动 pop`

- [ ] **Step 8: 测试**
  - slot-registry: 注册/排序/条件过滤/拒绝重复/unregister/clear
  - command-registry: 注册/查id/getByGroup/getByMode/条件求值/clear
  - command-executor: EXECUTING 包裹/handler 调用/effects 缺失 effect-system 时 warning/错误仍回 IDLE
  - narrative-log: write/淘汰/clear/markConsumed
  - game-context moveTo: leave/enter 顺序/time_cost/clearSelection

```bash
npx vitest run src/ui/slots/ src/core/command-registry.test.ts src/core/command-executor.test.ts src/core/narrative-log.test.ts src/core/game-context.test.ts
npm run typecheck
```

---

### Task 5.4：布局框架

**目标**：实现响应式根布局，按 (state × mode × theme) 选择子布局。

**Files:**
- Create: `src/ui/layout/AppLayout.vue`
- Create: `src/ui/layout/ExplorationLayout.vue`
- Create: `src/ui/layout/ModernLayout.vue`
- Create: `src/ui/layout/FullScreenTextLayout.vue`
- Create: `src/ui/layout/DailyMenuLayout.vue`
- Create: `src/ui/composables/useResponsive.ts`

**Steps:**

- [ ] **Step 1: useResponsive.ts**
  - 断点：`isMobile = window.innerWidth < 768`
  - 使用 `@vueuse/core` 的 `useWindowSize`
  - 返回 `{ isMobile, isPC }`

- [ ] **Step 2: AppLayout.vue**
  - 读取 game-store 的 executionState + currentMode
  - 读取 ui-store 的 theme
  - 决策树：
    ```
    EXECUTING → FullScreenTextLayout
    daily_menu → DailyMenuLayout
    combat → ExplorationLayout/ModernLayout (指令栏换成战斗指令，Phase 5 骨架)
    dialogue → FullScreenTextLayout (对话在日志中处理)
    exploration → theme === 'era' ? ExplorationLayout : ModernLayout
    ```
  - provide SlotRegistry
  - 过渡接口：`modeTransitionStyle` prop（默认 'instant'，mod 可扩展为 'fade' 等）

- [ ] **Step 3: ExplorationLayout.vue（era经典）**
  - 纯纵向堆叠：StatusBar → CharacterBar → StatusSection → ParameterSection → LookSection → NarrativeLog → CommandBar
  - 全部用 CSS 变量，无硬编码颜色
  - 移动端：自然纵向（与 PC 相同结构，仅调整间距/字号）

- [ ] **Step 4: ModernLayout.vue（现代）**
  - 左侧 Sidebar（可调宽，overlay/sideBySide 两种模式）
  - 右侧主体：StatusBar → CharacterBar → StatusSection → LookSection → NarrativeLog → CommandBar
  - Parameter 默认在侧栏显示（不在主体）
  - 移动端：侧栏仍保留（不变成底部抽屉），主体缩窄

- [ ] **Step 5: FullScreenTextLayout.vue**
  - 仅 NarrativeLog（全屏）
  - 无 NPC 栏、无指令栏、无状态栏
  - 对话选项在日志最新一行渲染

- [ ] **Step 6: DailyMenuLayout.vue**
  - 顶栏：资源条 + 自宅位置 + 起床时间
  - 主菜单列表：睁开眼睛 / 能力显示 / 收集 / ...（插件可注册）
  - 系统菜单：SAVE / LOAD / OPTION
  - 子面板返回时回到此布局

- [ ] **Step 7: 验证**
  - `npm run dev` 加载 test-mod，目视确认布局切换
  - 切换 theme → 布局变化
  - 模拟 pushMode('combat') → 指令栏切换

---

### Task 5.5：通用基础组件

**目标**：实现可复用的基础 UI 原子组件 + 资源解析器 + 指令弹出层。

**Files:**
- Create: `src/ui/components/ResourceBar.vue`
- Create: `src/ui/components/CollapsibleSection.vue`
- Create: `src/ui/components/GameButton.vue`
- Create: `src/ui/components/Portrait.vue`
- Create: `src/ui/components/CommandPopover.vue`
- Create: `src/ui/utils/asset-resolver.ts`

**Steps:**

- [ ] **Step 1: ResourceBar.vue**
  - Props: `label: string`, `value: number`, `max: number`, `color?: string`（默认用主题变量）
  - 渲染：`快C 0 [████░░░░] 0/100` 风格（eraTW 简写 + 短进度条）
  - 进度条用 CSS 变量着色
  - value/max 为 0 时显示空条

- [ ] **Step 2: CollapsibleSection.vue**
  - Props: `title: string`, `folded: boolean`, `foldKey?: string`（关联 ui-store.foldStates）
  - Slot: default（内容）
  - 标题栏可点击切换折叠，显示 `[+]/[-]` 或三角图标
  - 折叠状态通过 foldKey 同步到 ui-store（支持保存到存档）
  - 支持嵌套（内部可再放 CollapsibleSection）

- [ ] **Step 3: GameButton.vue**
  - Props: `label`, `commandId?`, `number?`, `active?`（高亮）， `disabled?`
  - 渲染：`交谈 [12]` 或 `交谈`（showCommandNumbers 关闭时）
  - 点击触发 `@click` 事件，携带 commandId
  - active 状态用 CSS 变量高亮（如选中时停移动变蓝）
  - disabled 灰色

- [ ] **Step 4: Portrait.vue**
  - Props: `characterId`, `assets?`（角色 assets 对象，含 portrait/head），`name?`
  - 显示逻辑：head 有则用 head 当头图区，无 head 用 portrait；portrait 有则显示立绘，无图不占位
  - 上方显示名字（可点击切换焦点）
  - 下方显示立绘图片（调 asset-resolver 解析路径）
  - 多图扩展插槽：`<slot name="variants" />`（Phase 5 不实现，预留）
  - 长按触发 `@longpress` 事件（弹出 CommandPopover）

- [ ] **Step 5: CommandPopover.vue**
  - 从 CommandRegistry 取 `character_commands` + 当前模式过滤 + 该角色 condition 求值
  - 渲染为临时浮层（Popover），点外部/ESC 关闭
  - 点击指令 → 执行 → 关闭浮层
  - `// TODO: 角色指令栏开关（character_commands 从指令栏移除，只通过长按弹出），Phase 5 留接口`

- [ ] **Step 6: asset-resolver.ts**
  - `// 注释：用 Vite import.meta.glob 扫描 mods 下图片，建路径→URL 映射表`
  - `import.meta.glob('/mods/**/assets/**/*.{png,jpg,webp}', { query: '?url', import: 'default', eager: true })`
  - `resolveAsset(path: string): string | null` — 路径字符串 → Vite URL，未找到返回 null
  - Portrait/Sidebar 组件调此函数

---

### Task 5.6：叙事日志组件

**目标**：实现滚动文本日志，支持多类型样式、自动滚动、条目淘汰、DisplayMode 切换。

**Files:**
- Create: `src/ui/components/NarrativeLog.vue`
- Create: `src/ui/components/NarrativeLog.test.ts`

**Steps:**

- [ ] **Step 1: NarrativeLog.vue**
  - 从 game-store 读取 narrativeLogEntries
  - 从 ui-store 读取 displayMode（scroll/clear）
  - scroll 模式：新条目追加底部 + 自动滚动
  - clear 模式：每次 executionState 变 EXECUTING 时清空，新条目独占显示
  - 渲染滚动列表，每条按 type 应用不同 CSS 变量样式（颜色/缩进）
  - 超过 1000 条自动淘汰最旧的（在 game-store addLogEntry 中处理）
  - 对话选项渲染：当 entry.type === 'choice'/'dialogue_choice' 时，渲染为可点击/键盘选择的选项列表
  - interactive entry（type='map'）渲染为 MapView 组件
  - 选项 hover 高亮，支持方向键焦点切换

- [ ] **Step 2: 对话选项交互**
  - 选项格式：`> 询问独孤九剑` / `> 闲聊` / `> 告别`
  - 鼠标点击 → 触发选择
  - 键盘：方向键移动焦点，回车确认，或直接输入编号
  - 有默认选项时回车直接选默认

- [ ] **Step 3: 测试**
  - 添加条目 → 渲染正确
  - 超过 1000 条 → 最旧淘汰
  - 不同 type → 不同样式 class
  - displayMode scroll → 追加；clear → 清空后显示

---

### Task 5.7：状态栏 + 角色栏

**目标**：实现顶部状态栏与角色栏 + 时间格式化工具。

**Files:**
- Create: `src/ui/components/StatusBar.vue`
- Create: `src/ui/components/CharacterBar.vue`
- Create: `src/ui/utils/format-time.ts`

**Steps:**

- [ ] **Step 1: format-time.ts**
  - `formatTime(time: GameTimeData, calendar?: CalendarConfig): string`
  - 有 calendar：`秋之月 9日(四) 10时33分`（用 month_names/weekday_names/hour_names）
  - 无 calendar：`第1月 9日 10:33`（fallback 纯数字）
  - 星期 = `day % 7`（`// TODO: 复杂历法后续扩展`）

- [ ] **Step 2: StatusBar.vue**
  - 从 game-store 读取 time + location + weather + calendar
  - 显示：`formatTime(time, calendar) — weather.name — 气温{weather.temperature}℃`
  - 显示地点名（从 location.name）
  - 资源条：从 player entity 读取 display=true 且 display_group="status" 的属性，渲染为 ResourceBar
  - 默认 3 条（体力/气力/精力 — 由 mod 的 attributes.toml 定义）
  - 特殊状态标记：`[时间停止可]` 等（从 status_effects 读取，Phase 5 占位）
  - 资源条数量动态（按 mod 定义数量，可多可少）

- [ ] **Step 3: CharacterBar.vue**
  - 从 game-store 读取 charactersAtLocation（排除 player）
  - 无 NPC 时：不渲染（v-if）
  - 有 NPC 时：横向排列角色名按钮
  - 当前选中角色高亮（CSS 变量）
  - 点击角色名 → ui-store.selectCharacter(id)
  - 角色名上方可显示简要状态标记（关系标签等，mod 可扩展）

---

### Task 5.8：Status / Parameter / Look 折叠区

**目标**：实现三个主要折叠区块。

**Files:**
- Create: `src/ui/components/StatusSection.vue`
- Create: `src/ui/components/ParameterSection.vue`
- Create: `src/ui/components/LookSection.vue`

**Steps:**

- [ ] **Step 1: StatusSection.vue**
  - 使用 CollapsibleSection（foldKey='status'）
  - 内容：
    - 第 1 行：玩家 ResourceBar（体力/气力/精力 + 扩展）
    - 第 2 行：选中角色 ResourceBar（有选中时）
    - 第 3 行：选中角色的情绪/理性（mod 定义的具体属性）
    - 特殊情况行（status_effects 提示）
  - 无选中角色时：只显示玩家行

- [ ] **Step 2: ParameterSection.vue**
  - 使用 CollapsibleSection（foldKey='parameter'）
  - 内容：选中角色的 Parameter 条（快C/快V/润滑/... 由 mod 定义）
  - 仅 NPC 有 Parameter（主角用不同的机制，Phase 5 先留接口）
  - 现代主题下默认不在此显示（在侧栏），但选项可开启
  - era经典主题默认显示

- [ ] **Step 3: LookSection.vue**
  - 使用 CollapsibleSection（foldKey='look'）
  - 上半部分：选中角色的装备/穿着（嵌套 CollapsibleSection: foldKey='lookEquipment'）
    - 按部位分组（上身/下身/饰品/... 由 mod 定义部位）
  - 下半部分：立绘（嵌套 CollapsibleSection: foldKey='lookPortrait'）
    - 本地点所有角色立绘，按 CharacterBar 顺序排列
    - 使用 Portrait.vue 组件
    - 居中，自动换行
  - 可开关立绘、开关设定（Look 标题栏的子开关）

---

### Task 5.9：指令栏

**目标**：实现 Act_COM + Ex_COM 指令栏，带编号、过滤、收藏、模式切换。

**Files:**
- Create: `src/ui/components/CommandBar.vue`
- Create: `src/ui/components/CommandItem.vue`
- Create: `src/ui/composables/useKeyInput.ts`
- Create: `src/ui/components/CommandBar.test.ts`

**Steps:**

- [ ] **Step 1: useKeyInput.ts**
  - 监听键盘输入
  - 数字输入缓冲：连续输入数字 → 回车执行对应编号指令
  - y/n 快捷确认
  - ESC 取消
  - 方向键焦点切换（用于对话选项）
  - 返回 `{ keyPressed, numberBuffer, confirmSelection }`

- [ ] **Step 2: CommandItem.vue**
  - Props: command 对象（id, label, modes, condition, priority, effects/handler）
  - Props: `number?: number`（动态分配的编号）
  - Props: `active?: boolean`, `disabled?: boolean`
  - 渲染：`label [number]` 或 `label`（showCommandNumbers 关闭）
  - 收藏标记（星标）
  - 点击 → emit('execute', commandId)

- [ ] **Step 3: CommandBar.vue**
  - Act_COM 区（CollapsibleSection: foldKey='actCom'）
    - 从 slot registry 获取 location_commands + character_commands
    - 按模式过滤（currentMode）
    - 按条件过滤（condition 求值）
    - 按 priority 排序
    - 收藏项置顶
    - 类别过滤（commandFilter 中的类别才显示）
  - Ex_COM 区（CollapsibleSection: foldKey='exCom'）
    - 从 slot registry 获取 main_menu
    - 跨模式稳定（不随模式切换）
  - 编号分配：每屏按可见顺序从 1 开始分配（每屏唯一）
  - 编号映射表：`numberToCommand: Map<number, commandId>`（供键盘输入查找）
  - 键盘输入 → useKeyInput → 查映射表 → 执行
  - 上次指令提示：底部显示 `<上回指令: xxx>`

- [ ] **Step 4: 模式切换**
  - 监听 game-store.currentMode 变化
  - 模式变化 → 重新过滤 Act_COM
  - 瞬间替换（无动画，留接口）

- [ ] **Step 5: 测试**
  - 注册测试指令 → 按模式过滤正确
  - 编号分配 → 每屏唯一
  - 收藏 → 置顶
  - 条件过滤 → 不满足的不显示

---

### Task 5.10：屏幕小键盘

**目标**：实现浮动屏幕小键盘。

**Files:**
- Create: `src/ui/components/ScreenNumpad.vue`

**Steps:**

- [ ] **Step 1: ScreenNumpad.vue**
  - 浮动在右边缘（`position: fixed`）
  - 两个独立功能区：
    1. 数字输入区：1-9 + 确认键
       - 输入数字 → 查 CommandBar 的编号映射 → 确认后执行
       - 需要指令当前可用（与鼠标点击同效）
    2. 快捷指令区：自定义按钮（别名文字）
       - 从 ui-store.favorites 读取（或独立的快捷指令列表）
       - 点击即时执行（需当前可用）
  - 两个功能区各自独立开关（numpadNumbers / numpadShortcuts）
  - 整体可见性：numpadVisible
  - 在 EXECUTING 状态仍显示（对话选项也可用数字选择）
  - 可隐藏/展开按钮

---

### Task 5.11：地图视图

**目标**：实现文字节点列表式地图。

**Files:**
- Create: `src/ui/components/MapView.vue`
- Create: `docs/map-hierarchy-test-mod.md`

**Steps:**

- [ ] **Step 1: MapView.vue**
  - 从 game-store 读取当前 location
  - 显示当前地点名 + parent 链（递归向上：中原 > 华山 > 华山正殿）
  - 显示 exits 列表：`→ 华山练武场 (5min)` / `→ 华山后山 (10min)`
  - 显示子地点列表（parent === currentLocation.id 的地点）
  - 每个可点击项 → 触发移动 effect（`{type = "move", params = {target = id}}`）
  - 移动耗时显示在地点名后
  - 本地点角色提示（在地点后显示角色数量或名字）

- [ ] **Step 2: 地图层级文档（test-mod）**
  - 创建 `docs/map-hierarchy-test-mod.md`
  - 内容：
    ```
    # test-mod 地图层级关系

    ## town_square（room, parent=null）
    - 出口: tavern（auto, 5min）
    - tags: [has_shop]
    - home_of: [guard]

    ## tavern（room, parent=null）
    - 出口: town_square（auto, 5min）
    - tags: [has_tavern]
    - home_of: [innkeeper, guard]
    ```
  - **与代码同源**：文档引用 locations/*.toml 的内容，不手动维护第二份（在注释中标注来源文件）

- [ ] **Step 3: 地图触发**
  - 通过 Act_COM 的"移动"指令触发 MapView
  - MapView 作为叙事日志中的最新一屏内容渲染（或作为独立 view，由 mod 决定）
  - Phase 5：先作为独立 view 渲染（从指令栏点击"移动"→进入地图 view）

---

### Task 5.12：每日开场菜单

**目标**：实现每日开场菜单，不可跳过，可扩展。

**Files:**
- Create: `src/ui/components/DailyMenu.vue`

**Steps:**

- [ ] **Step 1: DailyMenu.vue**
  - 顶栏：资源条（玩家）+ 自宅位置 + 起床时间
  - 主菜单列表（可扩展，通过 slot registry 注册 'daily-menu' 插槽）：
    - 原生项：睁开眼睛、能力显示、收集、实绩解除
    - 系统项：SAVE、LOAD、OPTION
    - 插件注册项：通过 `ctx.ui.registerSlot('daily-menu', item)` 注册
  - 点击"睁开眼睛" → 退出每日菜单模式（exitMode）→ 进入探索模式
  - 点击其他项 → 打开对应面板 → 返回时回到每日菜单
  - 不可跳过：不能 ESC，不能直接进入探索

- [ ] **Step 2: 触发机制**
  - 监听 `game:new_day` 事件 → pushMode('daily_menu')
  - 新游戏/读档后 → pushMode('daily_menu')
  - 被动昏迷睡觉 → 不触发（直接进入探索）

- [ ] **Step 3: Parameter 每日重置集成**
  - 玩家醒来时（点"睁开眼睛"或被动醒来）→ 重置所有 NPC 的 Parameter
  - 发出 `game:wake_up` 事件 → status-system 或 parameter 管理器监听重置

---

### Task 5.13：现代主题侧栏 + 系统面板

**目标**：实现现代主题的侧栏与系统面板。

**Files:**
- Create: `src/ui/components/Sidebar.vue`
- Create: `src/ui/components/SystemPanel.vue`

**Steps:**

- [ ] **Step 1: Sidebar.vue**
  - 可调宽度（拖拽边缘或预设宽度）
  - 两种模式：
    - overlay：盖在主界面上（主界面不动）
    - sideBySide：推主界面与它并排
  - 顶部：角色头图（可在选项中隐藏）+ 两择选项卡（选中角色/主角）
    - 无选中角色时只显示主角
    - 无图则无（不占位）
  - 中部：简写时间 + 天气 + 金钱数等
  - Parameter 区：多栏排列，侧栏宽度决定每行列数（宽→4-5个，窄→1个）
  - 底部：6 个按钮（属性素质 / 个人情报 / 日志统计 / 选项 / 作弊 / 存档）
    - 按钮分组不写死，mod 可扩展/重命名
    - 点击按钮 → ui-store.setActivePanel(panelId) → 打开 SystemPanel

- [ ] **Step 2: SystemPanel.vue**
  - 从 ui-store.activePanel 读取当前面板
  - 在主显示区弹出大框架（覆盖主界面）
  - 选项卡切换（如"属性素质"按钮 → 属性/特质 两个 tab）
  - 选项卡内支持折叠项（点击文字折叠对应区块）
  - 关闭：点击面板外 / ESC / 手机返回键 → setActivePanel(null)
  - 面板内容通过 slot registry 注册（`'system-panel-{id}'` 插槽）

- [ ] **Step 3: 六个按钮的默认面板**
  - 属性素质：属性（核心属性/特征/技能/性技能）+ 特质（天赋）
  - 个人情报：社交（声望/人际关系）+ 个人好恶
  - 日志统计：日志（日历/备忘）+ 统计 + 额外统计 + 成就
  - 选项：UI 主题切换 / 侧栏模式 / 编号显示 / 小键盘 / 折叠默认 / cheat 可见性
  - 作弊：GM 指令入口（Phase 5 最小化）
  - 存档：SAVE / LOAD（Phase 5 最小化，Phase 11 完善）

---

### Task 5.14：角色详情面板

**目标**：实现多页签角色面板，区分 player/npc。

**Files:**
- Create: `src/ui/components/CharacterPanel.vue`

**Steps:**

- [ ] **Step 1: CharacterPanel.vue**
  - Props: `target: 'player' | 'npc'`, `characterId?: string`（npc 时必需）
  - 页签（由 mod 定义哪些页签显示，引擎提供机制）：
    - 服装&能力
    - 经验&宝珠（统计）
    - 个人情报（社交）
    - 个人好恶
    - 身体情报
    - 陷落状态/素质
    - 技能习得
  - player 模式与 npc 模式有小区别（如 player 无"陷落状态"）
  - 内容通过 slot registry 注册（`'character-panel-{tab}'` 插槽）
  - 入口：
    - 每日菜单"能力显示" → CharacterPanel(target='player')
    - 每日菜单"能力显示（主角）" → 同上
    - 指令栏"能力显示" → CharacterPanel(target='npc', characterId=selected)
    - 长按角色名后的指令中也可入口

- [ ] **Step 2: 装备/素质/能力网格**
  - 装备栏：按部位显示（由 mod 定义部位）
  - 素质分类：种族/性相关/身体/精神/技术/其他
  - 能力值网格：字母等级 + 数字（由 mod 定义显示格式）

---

### Task 5.15：模式栈 + 执行状态 UI 集成

**目标**：将 core 的模式栈与执行状态接入 UI，实现指令栏替换与全屏文本布局。

**Files:**
- Modify: `src/ui/layout/AppLayout.vue`
- Modify: `src/ui/components/CommandBar.vue`
- Modify: `src/main.ts`（引擎初始化 → Vue 挂载）
- Create: `src/ui/engine-ui-bridge.ts`

**Steps:**

- [ ] **Step 1: engine-ui-bridge.ts**
  - 连接 core GameContext 与 Pinia game-store
  - 监听 core 事件 → 更新 game-store
    - `game:mode_changed` → pushMode/popMode（按 payload.action 区分 enter/exit）
    - `game:execution_start`/`game:execution_end` → setExecutionState
    - `location:enter` → setLocation + refreshCharactersAtLocation
    - `location:leave` → 可选清理
    - `game:hour_changed` → refreshCharactersAtLocation（角色 AI 移动，Phase 5 机制到位无触发源）
    - `character:changed` → 更新 player entity（Phase 5 监听到位无触发源）
    - `game:new_day` → 检查 payload.reason，非 'forced' → pushMode('daily_menu')
    - `narrative:written` → game-store.addLogEntry（NarrativeLog core 发出）
  - game-store 变更 → 同步回 core（如 selectedCharacterId 是纯 UI 状态不同步）

- [ ] **Step 2: main.ts 重写（含两阶段初始化）**
  - `// 注释：两阶段初始化——active_mod 为空时跳过 mod 数据加载，显示 ModSelect；选择后执行完整初始化`
  - 流程：
    1. 引擎 core 初始化步骤 1-4（TOML 解析器、插件发现、onLoad、依赖检查）
    2. 读 `era-engine.config.toml` 的 `active_mod`
    3. **active_mod 为空**：创建 Vue app → 挂载 ModSelect（列 mods/ 下含 meta.toml 的目录，只读 name/description）→ 玩家选择 → 内存设 active_mod → 继续步骤 5-9
    4. **active_mod 非空**：执行步骤 5-9（加载 mod definitions + bindings + 条件注册 + 内容数据 + onEnable）
    5. 加载 mod theme → 注入 CSS 变量 + ui-store 偏好覆盖（字体/字号/深色模式）
    6. 创建 Pinia → 创建 Vue app → 初始化 SlotRegistry → 注册到 provide → 注册 native-commands
    7. 初始化 game-store（从 mock-data 切换为真实 core 数据，通过 bridge 同步）
    8. 挂载 App.vue → TitleScreen（或直接 MainGame 如果从 ModSelect 来）
    9. `// TODO(phase-11): 继续游戏读档流程`
  - `// 注释：ModSelect 不写回 era-engine.config.toml，只内存切换，避免污染 git`

- [ ] **Step 3: 指令栏模式替换**
  - CommandBar 监听 game-store.currentMode
  - 模式变化 → Act_COM 重新过滤（只显示当前模式的指令）
  - Ex_COM 不受模式影响
  - 瞬间替换（留 modeTransitionStyle 接口供 mod 扩展）

- [ ] **Step 4: 全屏文本布局激活**
  - executionState === 'EXECUTING' → AppLayout 切到 FullScreenTextLayout
  - 指令栏隐藏
  - 叙事日志全屏
  - executionState 回 IDLE → 恢复原布局

- [ ] **Step 5: 对话模式**
  - enter_mode('dialogue') → pushMode('dialogue')
  - 对话内容通过 narrativeLog 输出
  - 选项在日志最新一行渲染（NarrativeLog 的 choice 类型）
  - 玩家选择 → 触发对应 effect → 继续对话或 exitMode

---

### Task 5.16：集成测试 + test-mod 补全

**目标**：端到端验证，补充 test-mod 数据。

**Files:**
- Modify: `mods/test-mod/meta.toml`（加 player_character, starting_location）
- Modify: `mods/test-mod/definitions/attributes.toml`（加体力/气力/精力等显示属性）
- Create: `src/ui/integration.test.ts`
- Update: `.superpowers/sdd/progress.md`

**Steps:**

- [ ] **Step 1: 补全 test-mod meta.toml**
  ```toml
  [meta]
  id = "test-mod"
  name = "测试模组"
  version = "1.0.0"
  player_character = "player"
  starting_location = "town_square"
  title = "测试模组"
  description = "era-engine 最小测试模组"
  ```

- [ ] **Step 2: 补全 attributes.toml**
  - 添加 display/display_group 字段到现有属性
  - 添加 体力/气力/精力（era 默认3条）的别名绑定或直接定义
  - 添加情绪/理性属性（用于 Status 第3行）

- [ ] **Step 3: 集成测试**
  - 加载 test-mod
  - 验证：theme CSS 变量注入
  - 验证：StatusBar 显示时间/地点/资源条
  - 验证：CharacterBar 显示在场 NPC
  - 验证：点击 NPC → selectedCharacterId 更新
  - 验证：CommandBar 显示 Act_COM + Ex_COM
  - 验证：pushMode('combat') → Act_COM 切换
  - 验证：setExecutionState('EXECUTING') → FullScreenTextLayout
  - 验证：每日菜单触发
  - 验证：主题切换 era ↔ modern

- [ ] **Step 4: 全量测试**
```bash
npm run typecheck
npm run test
npm run dev  # 目视确认
```

- [ ] **Step 5: 更新进度账本**
  - 更新 `.superpowers/sdd/progress.md`
  - 更新 `开发检查清单.md`（Phase 5 项打勾）

---

## 四、依赖关系

```
Task 5.0 (test-mod 数据补全) ─┐
Task 5.1 (Theme)     ─────────┼─→ Task 5.4 (Layout) ──→ Task 5.15 (Bridge + Core 模块)
Task 5.2 (Stores)    ─────────┤                              │
Task 5.3 (Slots + Core registries) ─┘                        │
                                                              │
Task 5.5 (Primitives) ─→ Task 5.7 (Status/CharBar)           │
                        ─→ Task 5.8 (Sections)               │
                        ─→ Task 5.9 (CommandBar)             │
                                                              ↓
Task 5.6 (NarrativeLog) ─────────────────────→ Task 5.16 (Integration)
Task 5.10 (Numpad)     ─────────────────────→
Task 5.11 (Map)        ─────────────────────→
Task 5.12 (DailyMenu)  ─────────────────────→
Task 5.13 (Sidebar)    ─────────────────────→
Task 5.14 (CharPanel)  ─────────────────────→
```

**推荐实施顺序**：
0. 5.0（test-mod 数据补全，最先做）
1. 5.1 + 5.2 + 5.3（基础设施 + core 新模块，可并行）
2. 5.5（通用组件）
3. 5.4（布局框架）
4. 5.6 + 5.7（日志 + 状态栏）
5. 5.8 + 5.9（折叠区 + 指令栏）
6. 5.10 + 5.11 + 5.12（小键盘 + 地图 + 每日菜单）
7. 5.13 + 5.14（侧栏 + 角色面板）
8. 5.15（模式栈集成 + core 新模块 + bridge + main.ts）
9. 5.16（集成测试）

---

## 五、Deferred / 备忘（Phase 5 不做，后续阶段实现）

代码中用 `// TODO(phase-x):` 注释标记，此处汇总：

| # | 项目 | 后续阶段 | 备忘 |
|---|------|----------|------|
| 1 | time_cost 详细规则 | Phase 6+ | 当前最小化（同parent=5min，跨parent=60min）。后续由 mod 驱动，mod 信息不足时问用户 |
| 2 | 装备穿着/卸下操作 | Phase 9 (inventory) | Phase 5 只显示 equipment 字段 |
| 3 | 装备属性加成 | Phase 9 | 装备带数值意义，非花瓶 |
| 4 | 插件动态注册 daily-menu/system-panel/character-panel-tab | Phase 6+ | Phase 5 只原生注册，留接口 |
| 5 | mod override 原生指令 (ui-overrides.toml 解析) | 后续阶段 | 数据结构支持 source 字段，解析延后 |
| 6 | effect-system 集成 | Phase 9 | effects 类指令在 effect-system 未注册时 warning+跳过 |
| 7 | 插件指令注册 (plugin.toml [ui] 段) | Phase 6+ | CommandRegistry 已支持，插件未实现 |
| 8 | SAVE/LOAD 真实实现 | Phase 11 | Phase 5 只做 UI 按钮（显示"功能开发中"） |
| 9 | GM/作弊指令真实实现 | Phase 11 | Phase 5 只做面板入口 |
| 10 | 多图立绘 (差分/部位放大/截面图) | 后续阶段 | Portrait.vue 预留 variants slot |
| 11 | 地图可视化 (ASCII/节点图/美术资源) | 后续阶段 | Phase 5 只做文字节点列表 |
| 12 | 对话 condition_script (JS 钩子) | Phase 7 | |
| 13 | 主角特殊每日重置状态 | Phase 6+ | 类似 Parameter 但不同名有特殊性 |
| 14 | modeTransitionStyle mod 自定义过渡 | 后续阶段 | 留接口，默认瞬间替换 |
| 15 | 地图层级文档自动生成 (与代码同源) | 后续阶段 | 当前手动维护 docs/map-hierarchy-test-mod.md |
| 16 | semver 版本校验 | 后续阶段 | deferred from Phase 4 |
| 17 | onDisable/onUnload 生命周期 | 后续阶段 | deferred from Phase 4 |
| 18 | 角色创建流程 | Phase 11 | 新游戏跳过，直进每日菜单 |
| 19 | 深色模式 [colors_dark] 算法反色 fallback 优化 | 后续阶段 | 当前简单反色够用 |
| 20 | 自动化脚本/宏 (字符串 ID 链式执行) | 后续阶段 | Command ID 已稳定，脚本引擎延后 |
| 21 | 天气系统插件 | 后续阶段 | StatusBar 预留位，game-store 默认值占位 |
| 22 | 复杂货币系统 (多货币/代币/股市/汇率) | 后续阶段 | economy-bar 插槽预留 |
| 23 | 日志搜索/过滤 | 后续阶段 | Phase 5 只做滚动显示 |
| 24 | 角色指令栏开关 (character_commands 从指令栏移除) | 后续阶段 | Phase 5 留接口，长按弹出已实现 |
| 25 | 大事志内容填充 | 后续阶段 | Phase 5 只做占位（天数/日历） |
| 26 | 选项面板后期加选项、重排版 | 后续阶段 | 当前分类够用 |
| 27 | 复杂历法 (非 day%7 的星期计算) | 后续阶段 | Phase 5 用 day % 7 |
| 28 | 多图立绘 variants (差分/部位放大/截面) | 后续阶段 | assets.variants 字段预留 |
| 29 | foldStates 存档持久化 | Phase 11 | Phase 5 只内存（页面刷新丢失），toSaveData/fromSaveData 已就绪 |
| 30 | 角色指令栏开关 (character_commands 从指令栏移除) | 后续阶段 | CommandPopover 已实现长按弹出，开关留接口 |
| 31 | 大事志内容填充 | 后续阶段 | Phase 5 只做占位（天数/日历） |

---

## 六、验收标准

- [ ] `npm run dev` 加载 test-mod 无报错
- [ ] era经典主题：纵向堆叠布局，显示状态栏/角色栏/Status/Look/日志/指令栏
- [ ] 现代主题：侧栏 + 主体，侧栏可调宽，按钮打开系统面板
- [ ] 主题切换：运行时 era ↔ modern，CSS 变量生效
- [ ] 深色模式：选项开关，CSS 变量切换
- [ ] 字体/字号：选项可改，覆盖 mod 主题
- [ ] 指令栏：Act_COM + Ex_COM 分区，编号显示在指令后
- [ ] 模式切换：pushMode('combat') → Act_COM 替换为战斗指令
- [ ] EXECUTING 状态：全屏文本布局，指令栏隐藏
- [ ] 每日菜单：新游戏/读档/新天触发，不可跳过
- [ ] 折叠区块：Status/Parameter/Look/指令栏可折叠，状态保存到存档
- [ ] display_group 分组：组标题可开关（默认平铺），组可折叠
- [ ] 角色焦点：点击 NPC 切换选中，切换地点清空
- [ ] 地图：文字节点列表（interactive entry），点击移动，显示耗时
- [ ] 屏幕小键盘：浮动，数字+快捷指令独立开关
- [ ] 标题界面：显示标题 + 新游戏/继续/设置/切换模组
- [ ] 模组选择：列出可用 mod，可选择
- [ ] 响应式：PC 左右分栏，移动端上下堆叠（现代主题侧栏可滑出）
- [ ] `npm run typecheck` 无错误
- [ ] `npm run test` 全部通过（现有 + 新增 core 模块测试）
