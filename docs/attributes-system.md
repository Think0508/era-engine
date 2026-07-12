# 属性系统全链路

> 属性是什么、定义在哪、插件怎么用、模版怎么继承、改名/改值改哪几个文件。
> 本文档覆盖整个链路：`attributes.toml` → `ATTR` 常量 → `bindings.toml` → 模板 → 角色赋值。

---

## 一、属性定义（definitions/attributes.toml）

一个属性的完整格式：

```toml
[attributes]
"体力" = {
  type = "number",          # 类型：number / string / boolean
  default = 100,            # 初始默认值
  category = "base",        # 命名空间（base / parameter / mark / ability / social / economy / combat / emotion）
  display = true,           # 是否显示在 UI 状态栏/参数面板
  display_group = "status", # UI 分组
  daily_reset = false,      # true=每天起床时重置为 default
  level_thresholds = [],    # 等级阈值数组（如 [0,100,500,1000]）
  sex = "female",           # 可选：性别过滤（"male"/"female"）
  compute = "script.js",    # 可选：计算属性脚本
}
```

**各命名空间的作用**：

| category | 存放位置 | 特点 |
|----------|---------|------|
| `base` | `entity.base.*` | 不重置，存档保存 |
| `parameter` | `entity.params.*` | `daily_reset=true`，每天重置 |
| `mark` | `entity.marks.*` | 永久刻印，不重置 |
| `ability` | `entity.abilities.*` | 能力等级，由 ability-progression 管理 |
| `social` | `entity.social.*` | 好感度/信赖度等社交值 |
| `economy` | `entity.economy.*` | 金钱等经济值 |
| `combat` | `entity.combat.*` | 战斗力/防御等战斗属性 |

### 等级阈值（level_thresholds）

```
level_thresholds = [0, 100, 500, 1000, 2500, 6000, 12000, 30000, 50000, 75000, 100000]
                    ↑     ↑    ↑    ↑     ↑     ↑      ↑      ↑      ↑      ↑       ↑
                    Lv0  Lv1  Lv2  Lv3   Lv4   Lv5    Lv6    Lv7    Lv8    Lv9    Lv10
```

属性值到达哪个阈值就升到哪一级。10 级制是 erArk 默认，mod 可以任意调整数量。

---

## 二、插件如何使用属性（ATTR 常量）

插件代码中引用属性名时，**必须通过 `ATTR` 常量**，而不是直接写字符串：

```typescript
// ✅ 正确
import { ATTR } from '../../core/entity-utils'
getEntityAttr(char, ATTR.HP)
ctx.settlement.applyChange(id, ATTR.AROUSAL, delta)

// ❌ 错误——散落字符串，改名时找不到
getEntityAttr(char, '体力')
ctx.settlement.applyChange(id, '欲情', delta)
```

`ATTR` 常量定义在 `src/core/entity-utils.ts` 中：

```typescript
export const ATTR = {
  // 基础
  HP: '体力', MP: '气力', STAMINA: '精力',
  FATIGUE: '疲劳度', HUNGER: '饥饿值',
  // 社交
  FAVORABILITY: '好感度', TRUST: '信赖度',
  // 参数（PALAM）
  AROUSAL: '欲情', OBEDIENCE: '屈服', SHAME: '羞耻',
  PLEASURE: '快乐', PAIN: '苦痛', FEAR: '恐怖',
  // 战斗
  ATTACK: 'attack', DEFENSE: 'defense', SPEED: 'speed',
  // …
} as const
```

**改属性名**：改 `ATTR` 常量值 + 改 `attributes.toml` 的 key 名 + 改所有角色数据/模板中的同名引用。

---

## 三、绑定系统（bindings.toml）

### 什么时候需要

只有**插件在 `plugin.toml` 中声明了 `required_attributes`** 时才需要绑写 `bindings.toml`。

大多数插件（h-core、combat-wuxia 等）直接引用 `ATTR` 常量中的中文属性名，**不走绑定系统**。
这意味着用这些插件的 mod **默认不需要写 `bindings.toml`**。

### 什么时候才写

你**改了一个属性名**，但插件仍然在用 `ATTR.FAV`（比如 `'好感度'`），你需要在二者之间架一座桥：

```toml
# bindings.toml
[bindings.combat-wuxia]
hp = "气血"          # 插件说 hp，mod 叫气血
attack = "攻击力"     # 插件说 attack，mod 叫攻击力
```

### 不改名可以不写

90% 的 mod 直接用 `ATTR` 常量里的中文名，不需要 `bindings.toml`。只有以下情况才需要：

| 场景 | 需要 bindings？ |
|------|----------------|
| 直接用 erArk 那套中文属性名 | ❌ 不需要 |
| 改了某个属性名（体力→气血） | ✅ 需要映射到插件 |
| 新增了一个自定义属性 | ❌ 不需要（自己写的自己读）|

---

## 四、角色赋值的三级来源

### 来源链

一个角色的属性从三个来源按优先级合并（低→高）：

```
① 模板 (template/*.toml)
   ↓ deepMerge
② roster 条目 / named/base.toml
   ↓ 存档加载时完全覆盖
③ 存档（已保存的游戏数据）
```

### 加载流程

1. **模板解析**：按 `extends` 链深合并成一个基础实体
2. **覆盖合并**：如果该角色在 `roster.toml` 或 `named/base.toml` 中，深合并进去
3. **默认值填充**：`attributes.toml` 中定义了但角色还没有的属性，用 `default` 值补上
4. **存档覆盖**：如果是读档，存档数据**完全替换**模板/roster 的合并结果（不合并）
5. **运行时修改**：`setAttribute`、`settlement.applyChange` 直接改内存值

### 常见场景

**场景 1：模板有 zz，角色没有 zz**

```
模板: xx=1, yy=2, zz=3
角色: xx=10, yy=20    ← 没写 zz
结果: xx=10, yy=20, zz=3  ← zz 从模板继承
```

角色条目只写 diff（想改的字段），不改的字段从模板自动继承。

**场景 2：角色有 zz，模板没有 zz**

```
模板: xx=1, yy=2         ← 没 zz
角色: xx=10, zz=999      ← zz 是角色独有的
结果: xx=10, yy=2, zz=999 ← zz 保留
```

角色可以增加模板没有的字段，新增字段不受模板限制。

**场景 3：角色和模板都没有某字段，运行时读取它**

```typescript
getEntityAttr(char, '某不存在字段')  // 返回 0
```

加载时 `applyAttributeDefaults` 会用 `attributes.toml` 中定义的 `default` 值填充所有缺失属性。
但运行时通过 `getEntityAttr` 读取一个**连 attributes.toml 中都没有**的字段时 → 返回 `0`。

**场景 4：默认值从哪里来**

对于 `attributes.toml` 中定义的属性：
```toml
"体力" = { type = "number", default = 100, category = "base" }
```
加载时引擎自动补齐：`char.base["体力"] = 100`。

对于 `attributes.toml` **没有定义**的字段（比如角色临时加了自定义字段）：
```typescript
getEntityAttr(char, '某自定义字段')  // ⚠️ 返回 0
```
引擎不认识它，不会报错也不会自动填充。

**场景 5：只写 diff，不改模板**

```toml
# templates/character/huashan_disciple.toml
name = "华山弟子"
[base]
"体力" = 120
"气力" = 80

# roster 里的令狐冲——只写想改的
[[roster]]
id = "令狐冲"
template = "huashan_disciple"
name = "令狐冲"
[base]
"好感度" = 60     # 只加了这一个字段
# 体力=120, 气力=80 自动从模板继承
```

### 合并规则速查

| 情况 | 结果 |
|------|------|
| 角色定义同名字段 | 角色覆盖模板 |
| 角色未定义某字段 | 保留模板的值 |
| 角色定义了新字段 | 追加到结果 |
| 角色写 `= null` | 移除该字段 |
| 角色定义同名对象 | 深合并（独有 key 保留）|
| 角色定义同名数组 | 角色数组替换模板数组（不追加）|

详见 `docs/mod-override.md`。

---

## 五、模板系统

### 模板放在哪

```
mods/武侠/templates/character/
├── base-human.toml       ← 基础人形模板
├── huashan_disciple.toml ← 华山弟子模板
└── player.toml           ← 玩家模板
```

每个文件一个模板，文件名（不含后缀）是模板 ID。

### 继承链

```toml
# templates/character/base-human.toml
name = "基础人类"
[base]
"体力" = 100
"好感度" = 30
```

```toml
# templates/character/huashan_disciple.toml
extends = "base-human"   # 继承 base-human
name = "华山弟子"
[base]
"体力" = 120             # 覆盖 base-human 的 100
"气力" = 80              # 新增
```

```toml
# roster 条目
[[roster]]
id = "令狐冲"
template = "huashan_disciple"
name = "令狐冲"
[base]
"好感度" = 60            # 覆盖模板的 30
```

**最终合并结果**：`体力=120, 气力=80, 好感度=60`。

### 合并规则速查

| 情况 | 结果 |
|------|------|
| 子定义同名字段 | 子覆盖父 |
| 子未定义字段 | 保留父的值 |
| 子写 `= null` | 移除该字段 |
| 子定义同名对象 | 深合并（双方独有 key 保留）|
| 子定义同名数组 | 子数组替换父数组（不追加）|
| 循环继承 | 加载时报错（A→B→C→A）|

---

## 六、改名实操

把 `"好感度"` 改成 `"亲密度"`，需要改**4 个地方**：

| # | 改什么 | 文件 | 怎么改 |
|---|--------|------|--------|
| 1 | 属性定义 key | `definitions/attributes.toml` | `"好感度" = {…}` → `"亲密度" = {…}` |
| 2 | ATTR 常量值 | `src/core/entity-utils.ts` | `FAVORABILITY: '好感度'` → `FAVORABILITY: '亲密度'` |
| 3 | 所有模板/roster/named/base | `templates/` / `roster.toml` / `named/*/base.toml` | `"好感度" = 60` → `"亲密度" = 60` |
| 4 | 条件表达式中引用 | 所有 `condition` 字段 | `player.好感度 >= 60` → `player.亲密度 >= 60` |

**不需要改**：
- 插件代码（因为插件写的是 `ATTR.FAV`，常量值改了自动跟着变）
- bindings.toml（不走绑定的插件不需要）

### 如果插件声明了 required_attributes

如果某个插件在 `plugin.toml` 里有 `required_attributes`，比如 combat-wuxia 需要 `attack`，
且你在 `attributes.toml` 里不叫 `attack` 而叫 `"攻击力"`，
那就需要在 `bindings.toml` 里加一行：

```toml
[bindings.combat-wuxia]
attack = "攻击力"
```

---

## 七、改值实操

### 改默认值

```toml
# attributes.toml——改 default 字段
"体力" = { type = "number", default = 200, … }  # 原来 100
```

### 改角色初始值

```toml
# 模板里改（影响所有继承此模板的角色）
[base]
"体力" = 150

# 或 roster 里改（影响单个角色）
[[roster]]
id = "令狐冲"
[base]
"体力" = 200
```

### 改等级阈值

```toml
# attributes.toml——改 level_thresholds 数组
"皮肤" = {
  level_thresholds = [0, 50, 200, 500, 1000, 2000, 4000, 8000, 15000, 30000, 50000]
}
```

### 改绑定映射

```toml
# bindings.toml——改 value
[bindings.combat-wuxia]
attack = "力道"          # 之前是 "攻击力"
```

---

## 八、其他定义类型速查

| 类型 | 定义文件 | 文档参考 |
|------|---------|---------|
| 属性 | `definitions/attributes.toml` | 本文档 |
| 能力/技能 | `definitions/abilities.toml` | `docs/mod-author-guide.md` |
| 天赋 | `definitions/talents.toml` | `docs/mod-author-guide.md` |
| 状态效果 | `definitions/status-effects.toml` | `docs/mod-author-guide.md` |
| 物品 | `definitions/items.toml` | `docs/item-system.md` |
| 装备槽 | `definitions/equipment.toml` | `docs/clothing-system.md` |
| 服装 | `definitions/equipment.toml` | `docs/clothing-system.md` |

这些类型的**改名/改值流程**与属性相同：改定义 key → 改所有引用处。模板继承和 override 规则完全一致。

---

## 九、相关文档

| 文档 | 内容 |
|------|------|
| `docs/mod-override.md` | 三层优先级 + 合并规则 |
| `docs/mod-author-guide.md` | Mod 作者指南 |
| `docs/entity-namespaces.md` | 实体命名空间映射 |
| `CONTEXT.md` | 术语表 |
