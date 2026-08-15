# 地图系统（map-system）

## 做什么

管理游戏世界所有地点的层级结构、连接关系、玩家和 NPC 的移动。采用平铺+parent 层级，不限深度。地点用 `[[locations]]` 数组放在 `maps/locations/*.toml` 中，跨树连接和捷径放在 `maps/graph/*.toml` 中。

## 核心概念：parent 链 + graph 边

```
                中原（region）
              ↙     ↓       ↘
          华山     少林      武当
        ↙    ↘             ↙   ↘
    思过崖   练武场      藏经阁  大雄宝殿
                              ╱
                    graph 边 ╱ （华山_思过崖 → 藏经阁，需轻功）
```

- **parent 链**：地点通过 `parent` 字段形成树。默认导航 = 上到 parent + 下到 children
- **graph 边**：跨树连接和捷径，写在独立的 `maps/graph/*.toml` 中。可带条件（`condition`）

玩家打开地图时，`getReachable` 自动合并两者，生成可达地点列表。

## 数据格式

### 地点定义

```toml
# maps/locations/map.toml — 一个文件可包含多个地点
[[locations]]
id = "huashan"
name = "华山"
type = "sect_hq"
tags = ["sword_sect", "martial"]

[[locations]]
id = "huashan_cliff"
name = "思过崖"
parent = "huashan"
type = "scenic"
tags = ["secluded", "training"]

[[locations]]
id = "huashan_dojo"
name = "练武场"
parent = "huashan"
type = "training"
tags = ["training"]
```

- `id`：全局唯一（跨类型允许重名，同类型内唯一即可）
- `parent`：父地点 ID，`null` 或省略 = 顶级
- `type`：任意字符串（region/city/room/field/…），引擎不预设，UI 用作文本显示
- `tags`：功能标签，用于条件判断和 UI 按钮显隐

### Graph 边定义

```toml
# maps/graph/huashan.toml
[[edges]]
from = "huashan_cliff"
to = "shaolin_library"
time_cost = 60
condition = "player.talents.轻功绝顶 == 1"

[[edges]]
from = "huashan"
to = "huashan_cliff"
time_cost = 20
```

- `from` / `to`：地点 ID（加载时校验存在性）
- `time_cost`：耗时（分钟），缺失时使用 `move.toml` 中的 `edge_default_time_cost`（默认 10）
- `condition`：可选，条件表达式。不满足时该边不可达

### 移动耗时配置

```toml
# src/plugins/map-system/data/default/move.toml（引擎默认）
# mods/武侠/definitions/move.toml（mod 可 override）
[move]
parent_time_cost = 10          # 上到 parent（分钟）
child_time_cost = 5            # 下到 child（分钟）
edge_default_time_cost = 10    # graph 边未指定 time_cost 时的默认值（分钟）
```

Mod 只需写想覆盖的字段：
```toml
# mods/武侠/definitions/move.toml
[move]
child_time_cost = 8
```

## 可达性算法（getReachable）

从当前地点出发，综合三种来源：

1. **parent 链向上**：`fromLoc.parent` 存在 → 可前往 parent（耗时 `parent_time_cost`）
2. **parent 链向下**：所有 `parent === fromLoc.id` 的地点 → 可前往 child（耗时 `child_time_cost`）
3. **graph 边**：所有 `edge.from === fromLoc.id` 且 condition 满足的边 → 可前往 `edge.to`（耗时 `edge.time_cost ?? edge_default_time_cost`）

同目标去重（按 ID），先出现的来源优先。

## Mod 作者使用

### 定义地点

1. 在 `mods/[mod]/maps/locations/` 下建 `.toml` 文件（文件名不限，建议按区域分文件）
2. 用 `[[locations]]` 数组定义地点（兼容单对象旧格式，但旧格式的 `exits` 字段被静默忽略）
3. 用 `parent` 字段建立层级

### 定义捷径

1. 在 `mods/[mod]/maps/graph/` 下建 `.toml` 文件
2. 用 `[[edges]]` 数组定义连接

### 自定义耗时

1. 在 `mods/[mod]/definitions/move.toml` 中写想覆盖的字段

### 条件字段

地图系统注册的条件字段（条件表达式中可使用）：

| 路径 | 类型 | 说明 |
|------|------|------|
| `location.id` | string | 当前地点 ID |
| `location.type` | string | 当前地点类型 |
| `location.parent` | string \| null | 父地点 ID |
| `location.tags.{tag}` | boolean | 是否拥有某标签 |
| `game.time.hour` | number | 当前小时 0-23 |
| `game.time.day` | number | 当前天数 |
| `game.time.month` | number | 当前月份 |

## 加载时校验

| 校验 | 级别 | 说明 |
|------|------|------|
| `parent` 存在 | error | 引用的 parent ID 必须在 locations 中存在 |
| graph `from`/`to` 存在 | error | 边的两端必须在 locations 中存在 |
| 地点不可达 | warning | 无 graph 边指向且无 parent 的顶级地点 |

## API（见 `docs/plugin-author-guide.md`）

```
ctx.api.call('map', 'getCurrentLocation')      → LocationData | null
ctx.api.call('map', 'getReachable', locationId?) → ReachableLocation[]
ctx.api.call('map', 'getChildren', locationId)  → LocationData[]
ctx.api.call('map', 'getAncestors', locationId) → LocationData[]
ctx.api.call('map', 'getLocation', locationId)  → LocationData | null
ctx.api.call('map', 'hasTag', locationId, tag)  → boolean
ctx.api.call('map', 'moveTo', targetLocationId) → void（触发 location:enter）
```

## 时停集成（2026-08-15）

`moveTo` 在可达性校验后调用 `h-time-stop.moveStart(time_cost)`（可选集成，try/catch 降级）：

- 时停激活中 → `{mode:'teleport'}` → 零耗时瞬移（`gameContext.moveTo(id, 0)`，时间不推进）+ 精力扣费；时停中玩家移动时搬运目标（`time_stop_carry`）`current_location` 跟随同步
- 未时停但自动时停移动开关开（`h-time-stop.setAutoMove(true)`）且前置满足 → 自动 时停on→瞬移→off 静默循环
- 其余情况 → 普通移动（花时间），与未集成前行为完全一致；h-time-stop 未启用/出错 → 自动走普通移动

## Override 规则

- 地点 TOML：`mods/[mod]/maps/locations/`，无插件默认层
- graph TOML：`mods/[mod]/maps/graph/`，无插件默认层
- 移动耗时：三层 override（插件默认 `data/default/move.toml` → mod `definitions/move.toml`，deepMerge）
