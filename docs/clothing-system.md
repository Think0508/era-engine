# 服装系统手册

## 一、概览

服装系统三层结构：
- **物品层**（`items.toml`）：每件服装有 `cloth_tag` 标记类型
- **槽位层**（`equipment.toml`）：定义角色身上 9 个槽位
- **前提层**（`premise-clothing.ts`）：指令根据前提显隐

## 二、cloth_tag（7 种）

定义在衣物的 `items.toml` 中：

```toml
[items."裙子"]
id = "裙子"
type = "clothing"
cloth_tag = 5   # ← 这里
```

| ID | 标签 | 影响 |
|----|------|------|
| 0 | 普通 | 默认，普通衣物/裤子 |
| 1 | 童装 | 幼女尺寸 |
| 2 | 情趣 | 性感内衣，H 相关 |
| 3 | 泳装 | 游泳场景 |
| 4 | 和服 | 浴衣/和服 |
| 5 | 裙子 | 裙子（vs 裤子） |
| 6 | 饰品 | H 中不自动脱 |

### 饰品特殊规则
`cloth_tag = 6` 的物品在 H 开始时**不会被自动脱下**——即使该槽位标注了 `auto_off = true`。对应 erArk 的「戴着饰品不妨碍 H」设定。

## 三、槽位（9 Slots）

定义在 `equipment.toml`：

```toml
[[slots]]
id = "bra"          # 代码里用的 ID
name = "胸罩"        # 显示名
category = "underwear"  # 分类
removable = true     # H 中是否可手动脱
semen_capacity = 1000  # 精液容量
auto_off = true      # H 开始自动脱
```

| 槽位 ID | 名称 | 可脱 | 自动脱 | 涉及前提 |
|---------|------|------|--------|---------|
| `head` | 头 | ✅ | — | HAT |
| `upper` | 上身 | ✅ | — | IN_UP |
| `coat` | 外套 | ✅ | — | IN_UP |
| `bra` | 胸罩 | ✅ | ✅ | BRA |
| `hand` | 手 | ❌ | — | GLOVES |
| `panties` | 内裤 | ✅ | ✅ | PAN |
| `lower` | 下身 | ✅ | — | IN_DOWN, TROUSERS, SKIRT |
| `foot` | 脚 | ✅ | — | SOCKS, SHOES |
| `accessory` | 饰品 | ❌ | — | IN_EAR, IN_NECK |

`auto_off` 的槽位：H 开始自动移到 `equipment_off`，H 结束自动穿回。
`removable = false` 的槽位不受 `cloth_remove_all` 影响。

## 四、全部前提速查

### 4.1 自己版（Self）——检查玩家自己

| 前提名 | 逻辑 |
|--------|------|
| `WEAR_HAT` | 自己戴帽子 |
| `WEAR_IN_EAR` | 自己戴耳饰 |
| `WEAR_IN_NECK` | 自己戴脖饰 |
| `WEAR_IN_UP` | 自己穿上身或外套 |
| `WEAR_BRA` | 自己穿胸罩 |
| `WEAR_GLOVES` | 自己戴手套 |
| `WEAR_IN_DOWN` | 自己穿下装 |
| `WEAR_TROUSERS` | 自己穿裤子（下身且非裙子） |
| `WEAR_PAN` | 自己穿内裤 |
| `WEAR_SOCKS` | 自己穿袜子 |
| `WEAR_SHOES` | 自己穿鞋子 |
| `WEAR_SKIRT` | 自己穿裙子（tag=5） |

### 4.2 自己否定版

| 前提名 | 逻辑 |
|--------|------|
| `NOT_WEAR_HAT` ~ `NOT_WEAR_SHOES` | 对应 WEAR_* 的否定 |
| `NOT_WEAR_SKIRT` | 自己没穿裙子 |

### 4.3 目标版（TARGET）——检查目标角色

| 前提名 | 对应自己版 | 额外目标版 |
|--------|-----------|-----------|
| `TARGET_WEAR_HAT` ~ `TARGET_WEAR_SHOES` | 全部对应 | |
| `TARGET_WEAR_GLASS` | — | 无对应槽位，始终 false |
| `TARGET_WEAR_IN_MOUSE` | — | 无对应槽位，始终 false |

### 4.4 目标否定版

| 前提名 | 逻辑 |
|--------|------|
| `TARGET_NOT_WEAR_HAT` ~ `TARGET_NOT_WEAR_SHOES` | 对应 TARGET_WEAR_* 的否定 |
| `TARGET_NOT_WEAR_GLASS` | 始终 true（没玻璃槽=没戴） |
| `TARGET_NOT_WEAR_IN_MOUSE` | 始终 true |

### 4.5 标签版（cloth_tag 检查）

| 目标版本 | 自己版本 |
|---------|---------|
| `TARGET_WEAR_SWIM` (tag=3) | — |
| `TARGET_WEAR_SKIRT` (tag=5) | `WEAR_SKIRT` |
| `TARGET_WEAR_SEXY` (tag=2) | — |
| `TARGET_WEAR_KIMONO` (tag=4) | — |
| `TARGET_WEAR_CHILDISH` (tag=1) | — |

标签版有对应的 `TARGET_NOT_WEAR_*` 否定版。

### 4.6 复合状态

| 前提名 | 目标/自己 | 逻辑 |
|--------|----------|------|
| `CLOTH_OFF` | 目标 | 全裸（所有可脱槽位空） |
| `NOT_CLOTH_OFF` | 目标 | 不全裸 |
| `CLOTH_MOST_OFF` | 目标 | 大部分裸（upper/bra/lower/panties 全空） |
| `NOT_CLOTH_MOST_OFF` | 目标 | 非大部分裸 |
| `NOW_WEAR_BRA_OR_PAN` | 自己 | 缺少胸罩或内裤 |

### 4.7 旧版兼容前提

| 前提名 | 说明 |
|--------|------|
| `CLOTH_WEAR` | 指定槽位穿着（参数：slotId） |
| `BRA_VISIBLE` | 胸罩可见（已脱下或未穿） |
| `PANTIES_VISIBLE` | 内裤可见 |
| `NOT_WEAR_BRA` | 自己没穿胸罩（旧版，erArk 标准） |
| `NOT_WEAR_PAN` | 自己没穿内裤（旧版，erArk 标准） |

## 五、命名规范速查

```
前缀      含义              示例
WEAR_     自己（玩家）穿     WEAR_BRA
NOT_WEAR_ 自己（玩家）没穿   NOT_WEAR_BRA
TARGET_WEAR_     目标穿              TARGET_WEAR_BRA
TARGET_NOT_WEAR_ 目标没穿            TARGET_NOT_WEAR_BRA
```

## 六、在指令中使用

```toml
[[commands]]
id = "lift_skirt"
label = "掀裙子"
premises = ["HAVE_TARGET", "TARGET_WEAR_SKIRT"]

[[commands]]
id = "reach_into_bra"
label = "伸入胸罩"
premises = ["IS_H", "TARGET_WEAR_BRA"]

[[commands]]
id = "undress_pants"
label = "脱裤子"
premises = ["HAVE_TARGET", "TARGET_WEAR_TROUSERS"]

[[commands]]
id = "take_off_own_bra"
label = "脱自己胸罩"
premises = ["WEAR_BRA"]
```

## 七、H 中的衣服脱穿流程

```
H 开始
  ├─ autoClothOff: 自动脱 auto_off 槽位（bra, panties）
  │                 但跳过 cloth_tag=6（饰品）
  ├─ 玩家可手动脱其他槽位 (cloth_remove effect)
  ├─ 玩家可手动穿回 (cloth_wear effect)
  └─ 可见性标记 (cloth_set_visible effect)

H 结束
  └─ cloth_wear_all: 所有 equipment_off 穿回
```

## 八、添加新服装

1. 在 `items.toml` 加条目，设 `cloth_tag`
2. 角色 `roster.toml` 的 `equipment` 字段引用：`equipment = { upper = "新服装", lower = "..." }`
3. 如需新前提 → 在 `premise-clothing.ts` 的 `registerClothingPremises` 中添加

## 九、添加新槽位

1. 在 `equipment.toml` 加 `[[slots]]` 条目
2. 如需该槽位 H 自动脱，加 `auto_off = true`
3. 如需该槽位 H 中不可脱，加 `removable = false`
4. 如需对应的前提，在 `premise-clothing.ts` 加一行 `slotPremise('新槽位', targetId)` 等

当前 9 槽之外，erArk 还有独立槽位：GLASS（眼镜）、IN_MOUSE（口饰）、socks 与 shoes 分立、weapon、extras。当前 MOD 如需，加槽 + 前提即可。

## 十、场景服装 TODO

以下 erArk 前提尚未实现（需场景系统支持后补）：

| 前提名 | 含义 |
|--------|------|
| `SHOWER_CLOTH` / `NOT_SHOWER_CLOTH` | 穿着浴巾（浴室场景） |
| `SLEEP_CLOTH` | 穿着睡衣（寝取场景） |

实现方式：注册一个 item-set 检查（类似 `WEAR_SKIRT` 的 tag 检查），检测角色是否穿着对应 tag 或特定物品 ID。

## 十一、文件索引

| 文件 | 用途 |
|------|------|
| `mods/test-mod/definitions/equipment.toml` | 槽位定义 |
| `mods/test-mod/definitions/items.toml` | 服装物品 + cloth_tag |
| `mods/test-mod/characters/roster.toml` | 角色初始服装 |
| `src/plugins/h-core/premise/premise-clothing.ts` | 全部服装前提（~80 个注册） |
| `src/plugins/h-core/index.ts` | autoClothOff / cloth_remove / cloth_wear 效果 |
| `src/plugins/inventory-system/index.ts` | 装备/卸下 API |

前提注册在 `premise-clothing.ts:registerClothingPremises`，H 核心在 `h-core/index.ts:startHScene`/`endHScene`。
