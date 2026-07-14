# 地图系统重构计划

> 目标：将地图系统从"一地一文件"重构为三层分离结构，并提供独立可视化编辑工具。

## 现状

当前地图用 `maps/locations/*.toml` 一地一文件，`exits` 字段写在地点内。
缺乏图形化编辑能力，100+ 地点时维护困难。

## 目标架构

```
maps/
├── locations/           ← 地点元数据（按区域批量文件）
│   ├── 中原.toml
│   └── 西域.toml
├── graph/               ← 邻接关系（仅存例外/捷径）
│   └── 中原.toml
└── layout/              ← 视觉布局（工具模式 B 导出）
    └── 中原.json
```

地点 `parent` 链自动推导默认导航路径，graph 只存跨树连接和同层捷径。

---

## Phase 1：引擎改造（游戏侧）

> 改 `mod-loader` 和 `map-system` 支持新格式，不涉及工具。
> 完成时旧 `exits` 字段停用，地图仍可从手写 TOML 加载。

### 1.1 `[[locations]]` 数组加载

**当前**：单个文件一个 location，`mod-loader` 用 `parseFile` 解析后直接存进 Map。

**改为**：识别 TOML 中的 `[[locations]]` 数组，展平存入 `mod.locations`。

```typescript
// mod-loader.ts
for (const [path, raw] of Object.entries(rawTomlMap)) {
  if (!path.startsWith(`/mods/${modName}/maps/locations/`)) continue
  const data = parseTOML(raw) as any
  const entries = data.locations as any[] ?? [data]  // 数组或单个对象
  for (const loc of entries) {
    if (loc.id) mod.locations.set(loc.id, loc)
  }
}
```

### 1.2 graph 加载

新增 `maps/graph/*.toml` 扫描路径，存 `mod.graph: Edge[]`。

```toml
# maps/graph/中原.toml
[[edges]]
from = "大雄宝殿"
to = "藏经阁"
time_cost = 3

[[edges]]
from = "华山_思过崖"
to = "终南山_古墓"
time_cost = 60
condition = "player.talents.轻功绝顶 == 1"
```

```typescript
// LoadedMod 新增
graph: Edge[]
// Edge 类型
interface Edge {
  from: string
  to: string
  time_cost: number
  condition?: string
}
```

### 1.3 move 指令改造

**当前**：`move` 指令读当前地点的 `exits` 字段。

**改为**：`getReachable(fromId): Reachable[]` 综合 parent 链 + graph：

```typescript
function getReachable(fromId: string, gc: GameContext): Reachable[] {
  const results: Reachable[] = []

  // 1. parent 链：上到 parent，下到 direct children
  const loc = mod.locations.get(fromId)
  if (loc?.parent) {
    results.push({ target: loc.parent, time_cost: 10, via: 'parent' })
  }
  for (const [id, other] of mod.locations) {
    if (other.parent === fromId) {
      results.push({ target: id, time_cost: 5, via: 'child' })
    }
  }

  // 2. graph 例外边
  for (const edge of mod.graph) {
    if (edge.from === fromId) {
      if (!edge.condition || evaluateCondition(edge.condition, gc)) {
        results.push({ target: edge.to, time_cost: edge.time_cost, via: 'graph' })
      }
    }
  }

  return results
}
```

玩家 UI 看到所有可达地点，按区域/耗时分组显示，选中后执行 `gameContext.moveTo(targetId)`。

### 1.4 旧字段清理

`exits` 从 Location 类型定义和场景 `reach_location` objective 中移除。
已经存在的 `exits` 在加载时静默忽略（不报错，方便旧 mod 过渡）。

---

## Phase 2：可视化工具（工具侧）

> 独立应用，与游戏代码分离，只读写 TOML/JSON。
> 技术栈：**Tauri + Vue 3 + Vue Flow**

### 2.1 工具目录结构

```
era-map-editor/
├── src-tauri/            ← Rust 后端（文件读写、窗口管理）
│   └── src/main.rs
├── src/                  ← Vue 3 前端
│   ├── App.vue
│   ├── components/
│   │   ├── TopologyCanvas.vue    ← Vue Flow 画布
│   │   ├── NodePanel.vue         ← 节点属性编辑面板
│   │   ├── GraphPanel.vue        ← 邻接边编辑面板
│   │   ├── TagPool.vue           ← Tag 管理中心
│   │   └── ImportExportBar.vue   ← 导入/导出
│   ├── stores/
│   │   └── mapStore.ts           ← 项目数据状态
│   └── utils/
│       ├── tomlExport.ts         ← 导出 TOML
│       └── importParser.ts       ← 导入现有 TOML
├── package.json
└── tauri.conf.json
```

### 2.2 核心功能（Phase 2 MVP）

| 功能 | 实现 |
|------|------|
| 节点树 | Vue Flow 渲染，Tab 下钻子节点 |
| 画布/缩放 | Vue Flow 内建 |
| 拖拽连线 | Vue Flow `onConnect` 事件 |
| 边耗时 | 双击边 → 输入框 |
| 边方向 | 右键边 → 切换双向/单向 |
| 删除边/节点 | 右键菜单 |
| 重命名 | 选中节点后直接编辑 |
| 显隐切换 | 右键 → 切换 `visible` |
| Tag 管理 | Tag 输入框 + 拖拽到节点 |
| 导出 TOML | 生成 `locations/*.toml` + `graph/*.toml` |
| 导入 TOML | 解析现有 mod 的 maps/ 目录 |
| 项目存档 | 存 JSON（布局/缩放/折叠状态） |

### 2.3 导出文件格式

对应 Phase 1 引擎侧格式，工具负责生成：

**locations TOML**：

```toml
[[locations]]
id = "huashan"
type = "sect_hq"
name = "华山派"
parent = "zhongyuan"
tags = ["sword_sect", "martial"]
visible = true

[[locations]]
id = "huashan_inn"
type = "inn"
name = "华山客栈"
parent = "huashan"
tags = ["rest"]
```

**graph TOML**：

```toml
[[edges]]
from = "huashan"
to = "huashan_inn"
time_cost = 10

[[edges]]
from = "华山_思过崖"
to = "终南山_古墓"
time_cost = 60
condition = "player.talents.轻功绝顶 == 1"
```

### 2.4 项目文件（.mapedit）

工具自身记忆文件，不参与游戏：

```json
{
  "version": 1,
  "canvas": {
    "viewport": { "x": 0, "y": 0, "zoom": 1 },
    "nodes": [
      {
        "id": "huashan",
        "position": { "x": 350, "y": 200 },
        "collapsed": false
      }
    ],
    "edges": []
  },
  "import_source": "/mods/武侠/maps/"
}
```

### 2.5 先不做（Phase 3）

- 模式 B 背景图 + 点击区域
- 子地图递归编辑
- 自动布局算法
- 多人协作

## Phase 3：视觉地图（工具侧 + UI 侧）

> 工具的 Mode B：切换后画布支持背景图，节点变为可设矩形点击区。
> 游戏侧：`MapView.vue` 读 `layout/*.json` 渲染可点击地图。

### 3.1 工具新增

- 切换开关"开始做固定坐标地图"
- 拖入背景图片
- 拖拽节点到背景图上定位（比例坐标 0~1）
- 拖矩形框定义点击区域（`x, y, w, h` 比例）
- 导出 `layout/*.json`

### 3.2 引擎新增

- `map-system` 注册 `getMapLayout(locationId)` API
- `MapView.vue` 渲染：
  - 背景图
  - 可点击区域（`x, y, w, h` 映射到图片像素）
  - 路径线（`edges.path` 贝塞尔）
  - 缩放到对应 zoom 层级

### 3.3 layout JSON 格式

```json
{
  "version": 1,
  "background": "/maps/中原手绘.png",
  "zoom_levels": 3,
  "nodes": [
    {
      "id": "huashan",
      "x": 0.35, "y": 0.42,
      "w": 0.08, "h": 0.06,
      "zoom": [1, 2]
    }
  ],
  "edges": [
    {
      "from": "huashan", "to": "huashan_inn",
      "path": [{ "x": 0.40, "y": 0.43 }],
      "zoom": [1, 2, 3]
    }
  ],
  "sub_maps": {
    "songshan": "songshan.json"
  }
}
```

## 实施顺序

```
Phase 1（引擎侧）
  1.1 [[locations]] 数组加载
  1.2 graph 加载
  1.3 move 指令改造
  1.4 旧字段清理
  → 验证：np run typecheck + test

Phase 2（工具 MVP）
  2.1 Tauri + Vue 3 项目初始化
  2.2 Vue Flow 画布 + 节点/边编辑
  2.3 TOML 导入/导出
  2.4 项目存档
  → 验证：用工具编辑→导出→游戏加载→移动

Phase 3（工具 + UI）
  3.1 工具模式 B：背景图 + 点击区域
  3.2 引擎 MapView + layout 加载
  → 验证：手绘地图→工具定位→游戏中可点击
```

## 技术决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 工具框架 | Tauri + Vue 3 | 5MB，与游戏同栈，文件读写简单 |
| 画布引擎 | Vue Flow | 自带拖拽/连线/缩放/自定义节点 |
| 项目存档 | JSON | 自然、不依赖外部数据库 |
| 布局坐标 | 比例坐标 0~1 | 分辨率无关，适配任意屏幕 |
| TOML 导出 | @iarna/toml + 手写序列化 | 引擎已用同一库 |
