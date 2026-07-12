# 地图系统（map-system）

## 做什么

管理游戏世界所有地点的层级结构、连接关系、玩家和 NPC 的移动。采用平铺+parent 层级，不限深度。每个地点一个 TOML 文件放在 `maps/locations/`。

## 数据格式

```toml
# maps/locations/lingzhou_city.toml
id = "lingzhou_city"          # 全局唯一
name = "灵州城"
parent = "xixia_region"       # null = 顶级
type = "city"                 # 任意：region/city/room/field…
tags = ["has_shop", "has_tavern"]
exits = [
  { target = "lingzhou_palace", name = "入宫" },
  { target = "lingzhou_tavern", name = "酒馆", time_cost = 15 }
]
```

- `time_cost` 缺省时自动按类型算（跨区域 60min、同区域 5min）
- `parent` 用于按层级自动埋入 UI 面包屑和导航树

## Mod 作者使用

在 `mods/[mod]/maps/locations/` 下建地点文件。加载时自动校验：所有 `exit.target` 必须真实存在；没有地点指向的地点给出警告（可能是遗漏）。

## API（见 `docs/plugin-author-guide.md`）

```
ctx.api.call('map', 'getCurrentLocation')        → LocationData | null
ctx.api.call('map', 'getExits', locationId?)      → Exit[]
ctx.api.call('map', 'getChildren', locationId)    → LocationData[]
ctx.api.call('map', 'getAncestors', locationId)   → LocationData[]
ctx.api.call('map', 'getLocation', locationId)    → LocationData | null
ctx.api.call('map', 'hasTag', locationId, tag)    → boolean
ctx.api.call('map', 'moveTo', targetLocationId)   → void（触发 location:enter）
```

## Override 规则

地点文件在 `mods/[mod]/maps/locations/`，遵循三层数据 override（见 `docs/mod-override.md`）。插件可在 `data/default/maps/locations/` 提供默认地点，mod 同名 ID 覆盖。
