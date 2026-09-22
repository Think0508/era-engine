# 属性系统全链路

> 属性是什么、定义在哪、插件怎么用、模版怎么继承、改名/改值改哪几个文件。
> 本文档覆盖整个链路：`attributes.toml` + `abilities.toml` → `ATTR` 常量 → `bindings.toml` → 模板 → 角色赋值。

## 数据流总览

```
 Layer 1（插件默认）
   src/plugins/*/data/default/
   ├── attributes.toml    ← 纯数值属性（体力/好感度/每日重置参数）
   └── abilities.toml     ← 带等级的能力（感觉/ABL/刻印/技术）
         ↓ deepMerge
 Layer 3（mod 定义）
   mods/[mod]/definitions/
   ├── attributes.toml    ← 覆盖同名属性
   └── abilities.toml     ← 覆盖同名能力（deepMerge 子字段）
         ↓
   mod.attributes  ← 最终合并结果
   mod.abilities   ← 最终合并结果
         ↓
 角色加载（模板 → roster/named → 存档）：
   expandCharacterAbilities():
     ① 遍历 mod.abilities，全部初始化为 {level: 0, xp: 0}
     ② 用角色已有 abilities 覆盖（从模板/roster 来的值）
   applyAttributeDefaults():
     遍历 mod.attributes，填 default 到对应命名空间
         ↓
   char.abilities["指技"] = { level: 0, xp: 0 }     ← 来自插件默认
   char.abilities["技巧"] = { level: 3, xp: 0 }      ← 来自 roster 覆盖
   char.base["体力"] = 1200                           ← 来自 attributes.toml default
```

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
  compute = "script.js",    # 可选：派生公式脚本（契约见本章末「计算属性（compute）与属性有效值」）
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

### 计算属性（compute）与属性有效值

**读取语义**（2026-09-22 起）：`getEntityAttr` 返回的是**有效值**，不是裸存储值。

```
有效值 = ( 派生公式(裸值) 或 裸值 )  然后叠加属性修正
```

- **裸值**：`entity.base.*` 等命名空间里的实际存储值（存档真相）。`setEntityAttr` 写的永远是裸值。
- **⚠️ 写路径契约（缓存失效）**：有效值缓存的失效挂在引擎写入路径上 —— `setEntityAttr` 写入成功后会
  失效该实体的有效值缓存；`bindingResolver.set*` 与 `settlement.applyChange` 都经由它，正常走这三条路无需额外处理。
  但**直接写 `entity.base[属性]`（或任何命名空间容器）会绕过失效**：属性自己的值还能自愈
  （缓存另外比对该属性自己的裸值），**派生属性却会陈旧** —— 它的缓存只认自己的裸值与版本号，
  依赖被直写时它不会重算，直到该实体上发生一次**无关的**失效
  （任何 `setEntityAttr`、增删修正，或 mod 数据重载触发的全局失效）。
  **结论：写属性走 `setEntityAttr` / `bindingResolver.set` / `settlement.applyChange`，不要直写 `entity.base[...]`。**
- **⚠️ 写路径安全 ≠ 读-改-写安全（接入修正前的阻塞项）**：上面三条路只保证"失效"正确，**不保证"读-改-写"正确**。
  `setEntityAttr` 写的是**裸值**，而下面这些站点是**经有效值读取器**做读-改-写（`write(read(x) + Δ)`）：
  一旦该属性有修正（或有 `compute`），`read(x)` 已经把修正/派生算进去了，回写就把**有效值烘焙进 `base`** ——
  下次读取再叠一次修正/公式，**无界膨胀**。站点清单：
  - `src/plugins/effect-system/settlement-context.ts:49-53`（`resolveValue` 走 `getEntityAttr` 有效值 → `writeValue` 走 `setEntityAttr` 写裸值；`modify_attribute` 与各 h-core 结算的主写路径）
  - `src/plugins/h-core/settle/hpmp-growth.ts:32-35,45-48`（`HP_MAX`/`MP_MAX`/`SEMEN_MAX` 上限成长）
  - `src/plugins/sleep-system/update-sleep.ts:35-39`（`STAMINA_MAX`）
  - `src/plugins/combat-base/index.ts:2126-2128`（吸内削 `mp_max`）
  - `src/plugins/effect-system/index.ts:60-63`（绑定回退 RMW）

  **规则：在接入任何属性修正来源之前，这些读-改-写站点必须先改为「读裸值」或改走增量写入 API**；否则修正会被写进 base 并重复叠加。
  （今天这套管线在生产里是惰性的——没有 mod 声明 `compute`、没有生产代码调 `registerModifier`——所以上面这条现在是"接来源前必办"，不是现网故障。）
- **派生公式**：属性定义里写 `compute = "某某.js"`，脚本签名 `(base, attrs) => number`。
  - `base` = 该属性的裸值（把它当**成长项**参与，如 `最大气血 = base + 根骨×10`，不要写纯 `根骨×10`，否则成长会被吞）
  - `attrs.get("根骨")` = 其他属性的**有效值**（带修正，递归求值）
  - **必须同步**：不得 `async`、不得返回 Promise；返回非有限数按失败处理
  - **无超时保护**：同步管线无法超时，脚本必须又快又纯（失败一律回退裸值并上报）
  - **四种失败姿态**：脚本缺失/为空、脚本抛错、返回非有限数、递归深度超过 **64** ——
    四种情况**都回退裸值并去重上报一次**（同名属性/脚本只报一条），**不会中断调用方**（调用方拿到的是裸值，不是异常）。
- **属性修正**：由效果/装配/装备/状态挂上来的临时或条件性增减（`flat` / `percent` / `set`）。
  叠加规则与战斗公式通道完全一致：`((set ?? 值) + Σflat) × (1 + Σpercent)`。
  **多个 percent 相加后只乘一次** —— 两个 `+10%` 是 `+20%`，不是复利。
  多个 `set` 并存时**只有一条生效** —— 按修正清单顺序（`listModifiers` 可见）最后一条的值胜出，覆盖而非相加。
  - ⚠️ **修正栈目前只是代码 API，数据驱动来源尚未接线**：上一句的"效果/装配/装备/状态"是**设计意图**。
    今天唯一能挂修正的方式，是插件/脚本调用 `src/core/attribute-eval.ts` 导出的
    `registerModifier(entity, id, attr, { flat, percent, set }, opts?)`
    （同文件另导出 `removeModifier` / `clearModifiers` / `listModifiers`；
    同 `(id, attr)` 重复注册 = 覆盖，可重复挂载与热重载）。
    **能力 / 天赋 / 物品上还没有 `attribute_mods` 这类字段，没有 `equipped_mods`，
    战斗效果动作里没有属性修正动作，也没有跨天限时属性修正** ——
    这些装备 / 被动技能 / 天赋 / 战斗效果 / 跨天状态来源属于**后续计划**；
    **今天在数据里写这类字段不会有任何效果**（引擎不认识这些字段，写了也不会挂上修正）。
  - mod 数据（重新）加载时（`loadMod`）会自动失效全部实体的有效值缓存（引擎内部调 `bumpDataVersion()`），作者无需处理；
    今天**没有** TOML 热重载（`src/` 里零处 `import.meta.hot`）——改完数据须重新加载模组才生效。

**闸门**：只有「在 `attributes.toml` 定义过 + 裸值是**有限数字**（代码用 `Number.isFinite`，`NaN`/`±Infinity` 同被拒）+ 声明了 `compute` 或有修正」的属性才走这套管线；
其余属性（含对象型如能力条目、字符串如性别）原样返回裸值。

**⚠️ 条件表达式的可见性**：`condition` 走同一个读取入口，因此条件判断看到的是**有效值** ——
临时修正会计入判断。写"挂上减属性的效果后触发的条件"时必须意识到这一点。

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
