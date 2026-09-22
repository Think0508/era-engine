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
- **⚠️ 写路径安全 ≠ 读-改-写安全（两种形态，2026-09-23 已全部清扫）**：上面三条路只保证"失效"正确，**不保证"读-改-写"正确**。
  `setEntityAttr` 写的是**基础值**，读出来的却可能是**有效值**，于是同一类缺陷有两种长相：
  1. **读-加-写回**：`读有效值 → 加一点 → 写基础值`。修正/派生被**烘焙进 `base`**，下次读取再叠一次 —— **无界膨胀**
     （例：`体力上限` 基础 500 挂 +500 修正 → 读 1000 → 成长写回 1002 → 下次读 1502，每场 H 多烙一遍 500）。
     2026-09-22 清扫了 5 处（各 h-core 结算主路径、上限成长、精力上限成长、吸内削上限、效果绑定回退），
     **但那次清扫只扫了这一个形状**。
  2. **快照-回写**：`T1 读有效值（存进字段/对象/快照）→ T2 写基础值`。两处可以隔着函数边界与时间
     （战斗入场快照 → 战斗结束回写；行为窗口开始 → 窗口结算）。没有"加一点"这个动作，所以形态 1 的
     扫法看不见它。探针：base 气血 100 + `{attr:'hp', flat:-50}` → 入场快照 50 → 战后 **raw = 50**
     （应仍为 100）；撤掉修正仍是 50；第二场再读 50 → raw 0（**逐场复利**）。
  2026-09-23 的清扫把**两种形态**一起扫（战斗 hp/mp 回写改「读基础 → 加增量 → 写基础」、
  `damage` 效果、NPC 每日结算/休息回血、睡眠经验/睡奸睡眠点、`core/realtime-settle` 全部累积与衰减、
  休息/睡眠恢复、状态结算的 `当前值/10` 追加项、h-core 反感/信赖增量、监禁训练消耗、精力消耗与恢复），
  并补了防回归测试（`combat-base.test.ts` 的「回写只结算增量」组、`realtime-settle.test.ts` 的
  「基础值域」组、`entity-utils.test.ts` 的 `applyAttrDelta` 组、`h-core/settle/hpmp-growth.test.ts`
  的真实站点回归——变异验证：把读改回有效值会得到 `expected 1006 to be 506`）。
- **规则（写新代码必守）**：**要写回哪个值，就从哪个值出发读**；白字（基础）会被写，绿字（加成）只用于显示与判断。
  - 做「加 N」这类读-改-写 → 用 `applyAttrDelta(entity, attr, delta, { clamp?, max? })`
    （读基础 → 加 → 钳制 → 写基础，原子；返回 `{ old, new }` 均为基础值）
  - 需要在**基础值域**自行运算 → 用 `readRawAttr(entity, attr)`（走绑定键时为 `bindingResolver.getRaw(id, key)`；
    插件作用域镜像为 `getRawForPlugin(pluginId, id, key)`——多个插件绑同一通用键时必须用后者）
  - **写回只结算"变化量"**：`读基础 → 加上这次的变化 → 写基础`。凡是有「入场快照 / 窗口开始快照」的地方，
    回写都必须是 `raw + (现值 − 快照值)` 这种**增量**形式，不能把现值整值写回（否则形态 2 复利）。
  - **上限/门槛判据仍用有效值**（`getEntityAttr` / `clampAttrValue`）——「上限 +500」这类修正的意义就是抬高上限，
    判超限时必须看到加成后的上限。`applyAttrDelta` 的 `clamp: true` 已按此实现
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
  多个 `set` 并存时**只有一条生效** —— 按修正清单顺序最后一条的值胜出，覆盖而非相加
  （顺序 = 声明式来源（装备 → 被动技能 → 天赋 → 插件追加）→ **运行时清单 `char.attr_mods`** → push 栈；
  `listModifiers` 只列 push 栈条目）—— 故**临时修正的 `set` 压过常驻来源**，push 栈的 `set` 又在最后。
  **修正来源共三类**：① 声明式（数据里写的 `attribute_mods`）② **运行时清单**（`char.attr_mods`，状态/战斗
  挂上来的带到期时刻条目，随存档往返）③ push 栈（代码 `registerModifier()`，存内存 `WeakMap`、**不随存档**）。
  - ⚠️ **先分清三种「属性变化」（D1 —— 写数据/写代码前必读）**：

    | 你要做的事 | 走哪条路 | 落地在哪 |
    |---|---|---|
    | **永久成长**（修炼/吃药涨上限、扣血掉血） | 写**基础值** | `setEntityAttr` / `settlement.applyChange` / `applyAttrDelta`；演出文本自行播报「xx+30 yy+60」 |
    | **临时修正**（生效期间 +N，到期消失） | 进**修正清单** | 状态写 `attribute_mods`、战斗写 `modify_attribute` 动作；**绝不写基础值** |
    | **派生**（上限/总攻防随其他属性变） | `compute` 脚本**读时算** | 属性定义里 `compute = "xxx.js"`，不落任何存储 |

    **第一类绝不走修正，第二类绝不写基础值。** 违反后者 = 临时加成永久沉淀成角色属性：
    迁移前的「攻击增益」用 `on_apply_effects` 改 `attack` 基础值、到期再 −10 减回去 ——
    中间只要发生成长/读档/其他改动，减回去的数值就对不上（详见下面「状态钩子」一节的禁令）。
  - ✅ **数据驱动来源已接线（2026-09-22 计划二）**：上一句的"效果/装配/装备/状态"里，
    **装备/服装、被动技能、天赋**三类**声明式来源**今天写在数据里即生效 —— 不需要任何注册代码。
    读属性时按角色**当前状态现算**（`char.equipment` / `char.abilities` / `char.talents`），
    **不缓存聚合结果、不需要任何变更通知**：脱下装备 / 技能掉级 / 失去天赋**立即**不再生效。

    | 来源 | 读哪里 | 等级缩放 |
    |---|---|---|
    | 装备/服装 | `char.equipment[槽位]` → `items.toml` 的该物品定义 | 无（写 `per_level` 是**加载期报错**，不静默当 1 级） |
    | 被动技能 | `char.abilities[技能ID].level` → `abilities.toml` | `per_level × (等级−1)` 追加到 `flat`/`percent` |
    | 天赋 | `char.talents[天赋ID]`（数字等级） → `talents.toml` | 同上（与被动技能同规则） |

    写法 —— `attribute_mods` 内联在各来源**自己的定义**里：

    ```toml
    # definitions/items.toml
    [items."玄铁护腕"]
    attribute_mods = [ { attr = "根骨", flat = 5 } ]                    # 装备：无等级语义，写 per_level 会报错

    # definitions/abilities.toml（被动技能）
    [abilities."龟息功"]
    attribute_mods = [ { attr = "力道", flat = 10, per_level = 2 } ]    # 1 级 +10，每多 1 级再 +2（3 级 = 14）

    # definitions/talents.toml
    [talents."神目"]
    attribute_mods = [ { attr = "福缘", flat = 1, per_level = 1 } ]     # 2 级 = 1 + 1×(2−1) = 2
    ```

    三个必须知道的点：
    - `char.equipment_off`（H 中自动脱下的部位）**不算穿着** → 不提供修正；穿回后自动恢复
      （现算，没有"补挂"这一步，所以不会漂移）。
    - `per_level` 只对**有等级**的来源（被动技能/天赋）有意义，且是**线性追加**：
      `flat(级 n) = flat + per_level×(n−1)`（**1 级就是 `flat` 本身**）；`percent` 同样线性追加，
      且**单位与被缩放的字段本身一致 = 小数**：`percent(级 n) = percent + per_level×(n−1)`，
      `{ percent = 0.1, per_level = 0.05 }` 在 3 级 = `0.2` → `×1.2`（不是"百分点"那种读法）；
      `set` **不随等级缩放**（`{ set = 50, per_level = 5 }` 在 3 级仍是 50，不是 60）；
      只缩放**显式给过**的字段（没给 `percent` 不会因为 `per_level` 凭空产生 `percent`）。
    - 属性必须先在 `attributes.toml` **定义**（闸门以定义为前提），`attribute_mods` 指向**未定义属性** → **加载期报错**
      （`npm run validate` 即可查出；校验在 `src/core/mod-validate.ts` 的 `validateAttributeMods`）。
      ⚠️ 该校验只看**名字写对**的 `attribute_mods` 数组内的条目；字段名本身拼错（写成 `attribute_mod = [...]`）
      **不在**校验范围内 —— 它压根不是 `attribute_mods`，会被静默忽略（修正不生效，也不报错）。
  - ✅ **运行时来源已接线（2026-09-22 计划三）**：`char.attr_mods` —— 实体上的**纯数据字段**
    （缺省 = 空清单，旧存档天然如此；随存档整对象往返，无需迁移步骤）。它与声明式来源**并列**：
    读属性时一起现算、共用上面那一份叠加代数与闸门。**数据里没有人手写这个字段** ——
    写入方是**状态效果**（`attribute_mods`）与**战斗效果**（`modify_attribute` 动作），代码侧入口是
    `registerRuntimeMod`。

    条目形状（`RuntimeAttrMod`）：

    | 字段 | 含义 |
    |---|---|
    | `id` | 来源标识：状态 = `status:<状态ID>`，战斗 = `combat:<效果实例ID>`（前缀是整批撤销的依据） |
    | `attr` | 属性名（mod 自定义字符串；必须在 `attributes.toml` 定义，否则有效值管线不认它 → 修正静默无效） |
    | `flat` / `percent` / `set` | 三条写法（见下表），可同时给，按同一代数叠加 |
    | `expiresAt` | **绝对游戏分钟**；缺省 = 不自动到期（永久，只能由来源显式移除） |
    | `source` | 可读的来源说明（调试/UI 用，不参与计算） |
    | `strength` | D5 顶替判定的强度，**随条目持久化**（存档往返后比较仍成立） |

    **三条写法（各写各的，不互相换算 —— D4）**：

    | 作者写法 | 语义 | 例子 |
    |---|---|---|
    | `set = 3` | **定值**：压过其它修正，值就是 3 | 「破绽打到 3 层」 |
    | `flat = 3` | **加法**：与其它 `flat` 相加 | 「破绽 +3」 |
    | `percent = -0.2` | **倍率**：与其它 `percent` 相加后**只乘一次** | 「中毒 −20%」 |

    四个必须知道的点：
    - **不做「差额」换算**：作者写什么就是什么，引擎**不记录"生效前是几"**（到期撤销修正即可，不需要把值减回去）。
      `percent` 的单位是**小数**且与被缩放的字段一致（`0.1` = +10%；写 `10` 不是 +10% 而是 +1000%）。
      在有 `+20%` 的属性上写「+20」得到 `(base+20)×1.2` —— 百分比本就该作用于它，这是对的。
    - **`expiresAt` 到点即失效**：判定一律 `now >= expiresAt`，**没有"每次跨小时扣 60 分钟"那种递减**
      （睡觉跨天/时间跳跃/非整点行动原先必然算错）。读属性时顺手**剪除**过期条目，因此
      **不需要任何变更通知、不需要注销路径、也不需要为"到期"发事件** —— 到点自动回落。
      时钟由 `mod-loader` 注入（`game.time` 换算成总分钟）；单独使用本模块（单测直调）未注入时钟时，
      条目一律视为**不过期**（当作全过期会静默给出偏小的错值）。`expiresAt` 写成字符串/`NaN` 会
      **按"不自动到期"处理并去重上报**（静默把减益变成永久，符号是反的，不能没有诊断）。
    - ⚠️ **D5 顶替（同 `(id, attr)` 再次施加）**：新强度 **`<` 现有强度 → 什么都不发生** ——
      **不降级，也不刷新时长**（已有破绽 3 层时打「打到 3」/「打到 2」都不改变层数、也不刷新周期）；
      `>=` → 顶上并**重置为该条自己的完整时长**（同强度也刷新：毒再中一次 = 刷新时间，层数不变）。
      强度算式**全项目统一**：`strength = set ?? flat ?? percent ?? 0`（必须有限数字，否则整条拒绝；
      状态侧另有细化：有层数概念的状态取**有效层数** —— 层数就是"这条状态多强"，
      无层数概念的取 `set ?? flat ?? percent`，全缺省 = 1）；
      比较基准是**存活（未过期）条目**，且 `strength` 写在条目上随存档往返 —— 丢了这个字段会让
      "存了破绽3、读档后又打来破绽2"错误顶替；老档条目无此字段 = `-Infinity`（任何新施加都能覆盖它）。
    - 代码入口（mod 脚本/插件用；数据驱动无需调用）：

      ```typescript
      registerRuntimeMod(entity, { id: 'status:中毒', attr: '灵敏', percent: -0.2, expiresAt: t }, 0.2)  // 末参 = 强度
      removeRuntimeMod(entity, 'status:中毒', '灵敏')    // 省略 attr = 移除该 id 的全部条目
      removeRuntimeModsByPrefix(entity, 'combat:')        // 战斗结束整批清理（返回移除条数）
      readRuntimeMods(entity)                             // 读：返回存活条目，顺手剪除过期/畸形条目
      ```

      ⚠️ `readRuntimeMods` 返回的数组与条目就是**实体自己的对象**（不是副本）：就地改 `strength` 会改写
      D5 的比较基准，就地改数值会直接改写生效中的修正，且都绕过缓存失效 —— 要改清单请走上面三个写入口。
      另注意它与 `registerModifier()`（push 栈：`WeakMap`、**不随存档**、不进 `attr_mods`）是**两套**机制：
      要"随存档往返的临时修正"用前者，纯内存的临时叠加用后者。
  - ✅ **状态效果的两种修正（计划三已接线）**：状态定义里多两个可选字段 —— 一个改**角色属性**，
    一个改**别的状态的层数**：

    ```toml
    # definitions/status-effects.toml
    [status-effects."中毒"]
    duration = 360                                            # 分钟；-1 = 永久
    attribute_mods = [ { attr = "灵敏", percent = -0.2 } ]     # 生效期间 灵敏 −20%（只进有效值，基础值分毫不动）

    [status-effects."护体"]
    duration = 4320                                           # 3 天（单位 = 分钟，D6：4320 = 3 天）
    stack_mods = [ { status = "破绽", value = -1 } ]           # 身上破绽**恒 −1 层**（来源在才生效）
    ```

    - `attribute_mods` 与装备/被动/天赋的 `attribute_mods` **同形**（`attr` + `flat?/percent?/set?`，
      可带 `per_level` 的只有被动技能/天赋），区别只在落点：状态的在**生效期间**被 push 进
      `char.attr_mods`（`id = status:<状态ID>`，到期时刻 = 状态到期时刻），状态移除/到期**整批撤销**。
      **基础值全程不动**。状态上写 `per_level` = **加载期报错**（状态没有等级概念，不静默当 1 级）。
      属性必须先在 `attributes.toml` 定义（同一套闸门），否则加载期报错（`npm run validate` 可查）。
    - ⚠️ **同一个状态里同一 `attr` 只能写一条**（两个 `attribute_mods` 对同一属性 = **加载期 error**）。
      运行时的顶替键是 `(id, attr)` 而状态的 id 恒为 `status:<状态ID>`，所以第二条会**静默顶掉**第一条
      （`flat 25` + `percent 0.5` 得到的是 150，不是 187.5；连存活条目的 `strength` 都取自被丢弃那条）。
      注意这与**装备/被动/天赋**的定义**语义相反**：那些来源的同名多条是**累加**的。
      要"既 +25 又 +50%"就**合并成一条**（同一条里 `flat`/`percent`/`set` 可以并存），而不是拆两行。
    - ⚠️ **`duration` 必填且必须是"正有限数字或 `-1`"**（加载期 error，`npm run validate` 可查）：
      判据 `Number.isFinite(duration) && (duration === -1 || duration > 0)`。
      **缺省** → `expiresAt = now + undefined = NaN` → 状态**永不到期**（静默变永久），`remaining` 视图还给不出数字；
      写成**字符串** `"360"` → 字符串拼接 → 同样永不到期；`0` 或 `-1` 之外的负数 → **施加即过期**。
      （非有限 `expiresAt` 仍可能来自手改档：读取侧按"不自动到期"处理并去重上报，
      `remaining_duration` / `getRemaining` 一律返回 **-1**（永久），不会把 `NaN` 漏进 UI/条件/API。）
    - **跨天限时状态今天已接线**：`attribute_mods` + `duration` 随存档序列化，睡一觉越过 `expiresAt`
      就直接失效（不会"少扣/多扣"），到期后属性自动回落 —— **没有还原代码**。
    - `stack_mods` 声明在**来源**状态上、作用于**目标**状态（`status` = 目标状态 ID，`value` = 非零整数）。
      修正挂在目标状态实例上并记 `from`（谁给的）；**来源到期/被移除 → 撤销修正，目标的基础层数分毫不动**
      （这就是"不需要记录生效前是几"的实现方式）；来源刷新时长 = 修正寿命跟着刷新；目标状态**后出现**
      也照样生效（与施加顺序无关，写「恒 −1」不必管谁先来）。
      ⚠️ 同一状态定义里对**同一目标状态**写两条（−1 与 −2）是**后者覆盖前者**（不叠加）——
      要"既 −1 又 −2"请写成一个 −3 或换两个来源状态（加载期不对此告警）。

    **状态实例的真值形状**（`char.status_effects[]` 的元素，纯数据字段、随存档整对象往返）：

    | 字段 | 含义 |
    |---|---|
    | `id` | 状态 ID |
    | `base_stack` | **基础层数**（招式给定，见下面的三层模型） |
    | `expiresAt` | **绝对游戏分钟**；缺省 = 永久（定义里 `duration = -1`） |
    | `stack_mods` | 收到的层数修正 `[{ from, value, expiresAt? }]` |
    | `last_decay_at` | 上次衰减落账时刻（绝对游戏分钟） |
    | `last_tick_game_time` | 上次 tick 时刻（绝对游戏分钟） |

    旧存档**不需要迁移步骤**：条目首触时就地换算（`remaining_duration → expiresAt`，`-1` = 永久；
    `stack → base_stack`），幂等、不丢条目，且时间锚点从"现在"起算（不会一读档就 tick/衰减爆发）。
  - **层数三层模型（D11/D12）**：
    ```
    有效层数 = 基础层数(base_stack) + Σ 层数修正(stack_mods) − 时间衰减      （下限 0）
    ```

    | 层 | 谁改 | 怎么写 |
    |---|---|---|
    | 基础层数 | 招式/技能（施加那一刻） | `effects = [{ type = "apply_status", params = { status = "破绽", stack = 3 } }]`（打到 3）/ `params.stack_add = 3`（+3） |
    | 层数修正 | 别的状态（护体那类） | 状态定义 `stack_mods = [ { status = "破绽", value = -1 } ]` |
    | 时间衰减 | 状态定义自己 | `stack_decay = { every = 60, amount = 1 }`（每 60 分钟 −1 层；到 0 层状态结束） |

    - **「打到 N」与「加 N」是两种运算**（`apply_status` 的 `params`）：**只写一个** ——
      同时给会在运行时 warning 并**忽略 `stack_add`**（`stack` 优先）。

      | 当前有效层数 | 招式 | 结果 |
      |---|---|---|
      | 1 | `stack_add = 3` | 4 |
      | 0 | `stack_add = 5` | 5 |
      | 5 | `stack = 3` | **无操作**（3 顶不掉 5），且**时长也不刷新** |

      即「打到 N」只在 `N > 当前有效层数` 时才顶上并**重置时长为新的完整时长**；`<=` 时**什么都不发生**。
      「加 N」恒生效地加，并重置时长（不受顶替判定约束）。比较基准是**有效层数**（含层数修正与待衰减），
      所以"护体 −1 时打到 3"的有效值是 2（护体到期后回到 3）。不带这两个参数 = 沿用状态定义既有语义
      （`stackable` + `max_stack`：可叠则 +1 封顶，否则只刷新时长）。
    - 战斗效果里**重复施加的合并**沿用战斗效果库既有的 `merge`：`refresh`（只刷时长）/ `stack`（层数累加）/
      `strongest`（取高层数）—— 层数进而决定数值类效果的大小（`growth`）。
    - **两个兼容视图（活的，不入存档）**：状态条目上挂两个**非枚举访问器**，旧写法与条件路径照旧读得到，
      真值唯一（分别在 `base_stack` / `expiresAt`）：

      | 视图 | 读出来是什么 | 写回去落到哪 |
      |---|---|---|
      | `status.stack` | **有效层数**（基础 + 层数修正 − 待衰减，下限 0）——条件 `character.{id}.status.{状态ID}.stack` 看到的就是它 | 写 `base_stack`（旧代码写 `stack` 不会静默失效） |
      | `status.remaining_duration` | **剩余分钟数**；永久状态 = `-1`（条件别名 `remaining` 同此） | 换算成绝对时刻写 `expiresAt` |

      「永不陈旧」的边界：**活对象上**每次读都从唯一真值现算（含待衰减投影）；但**克隆**
      （`JSON.parse(JSON.stringify(char))`、UI store 的结构化克隆）不带访问器 → 克隆体上这两个字段是
      `undefined`。新写的消费方请直接读 `base_stack` / `expiresAt`，或走 API：
      `ctx.api.call('status', 'getStack' | 'getRemaining' | 'hasStatus', 角色ID, 状态ID)`。
    - **⚠️ 状态钩子里改属性：写 `attribute_mods`，不要写 `modify_attribute`**（加载期拦截）：

      | 钩子 | 里面写 effect-system 的 `modify_attribute` | 为什么 |
      |---|---|---|
      | `on_apply_effects` / `on_remove_effects` | **加载期 error**（除非显式写 `params.permanent = true`） | 它写的是**基础值**：临时 buff 会永久沉淀成角色属性（"+10 / −10 减回去"经不起成长与读档） |
      | `tick_effects` | **合法**（不报） | 逐次增量 = **伤害/回复的本义**（中毒每 tick 扣 5 点气血），不是"生效期间的加成" |

      - 生效期间的临时加成 → 写 `attribute_mods`（到期/移除自动消失、基础值分毫不动）。
      - ⚠️ **「打到 N」被拒时 `on_apply_effects` 不会执行**（D5 「什么都不发生」是**字面**语义）：
        `N ≤ 当前有效层数` 时 `apply_status` 直接早退 —— 不顶上、不刷时长、**也不跑 `on_apply_effects`**
        （被拒的「打到 2」不会造成伤害）。所以「命中时造成 5 点伤害」这类"每次施加都该发生"的效果
        **不能**写在这个钩子里：要"每次"就用 `tick_effects`（周期结算）或把增量写进 `apply_status` 的
        `stack_add`（加法恒生效，不受顶替判定约束）。**有层数概念**（可叠 `stackable = true` + `max_stack > 1`，
        或带 `stack_decay`）**且**声明了 `on_apply_effects` 的状态会在**加载期报 warning** 点名这个陷阱
        （`npm run validate` 可见；不是 error —— 施加成功时钩子照跑，只有被拒的那次被吞）。
      - 确实要**一次性永久改变属性**（伤害/成长）→ 在 `params` 上写 `permanent = true` **显式声明意图**：
        `{ type = "modify_attribute", params = { attr = "hp", value = -50, permanent = true } }`，
        或直接走显式永久写入路径（`set_attribute` / 脚本 / 任务奖励）。
      - ⚠️ **命名撞车**：这里的 `modify_attribute` 是 **effect-system 的"一次性加减基础值"效果**，
        与下面战斗效果里的 **`modify_attribute` 战斗动作**（写运行时清单）**不是一回事**。
  - ✅ **战斗效果 `modify_attribute`（计划三已接线）**：库条目（`definitions/battle-effects.toml`）里声明
    "战斗中改属性" —— `action = "modify_attribute"` + `attr`（属性名）+ `value = { flat?/percent?/set? }`：

    ```toml
    [effects."定身"]
    name = "定身"
    delivery = "zone"           # 常驻修正：**不写** settle（zone 条目的相位）
    target = "enemy"
    action = "modify_attribute"
    attr = "speed"              # 必须在 attributes.toml 定义，否则加载期报错
    value = { set = 1 }         # 定值：速度压到 1（与 modify_channel 一样支持覆盖语义）
    duration = "battle"
    ```

    | 要点 | 行为 |
    |---|---|
    | 落点 | 写进**角色的运行时清单** `char.attr_mods`（`id = combat:<效果实例ID>`），**修正本身全程不进 `base`** |
    | 数值 | 受层数缩放（`growth`）：`value × (1 + growth×(层数−1))`；`flat`/`percent`/`set` 三条写法与状态同规矩（不换算） |
    | 同步时机 | 复用既有的 `recalcStats` 全量重算：本场所需修正的签名（实例 id + 属性 + 数值）变化时才写实体清单；签名不变**完全不碰实体**（不白刷缓存版本） |
    | 战斗结束 | 按 `combat:` 前缀**整批清除** → 属性自动回落（无还原代码） |
    | ⚠️ 与 hp/mp 回写的关系 | 入场时 `buildCombatant` 读的是**有效值**（气血−50 的减益必须真的让你以 50 点参战），战斗内 hp/mp 只动战斗副本；结束回写**只结算增量**（`base + (战斗内现值 − 入场快照)`）——**修正绝不沉淀进 `base`**。所以「基础值全程不动」这句只对 `attr` 指向的修正本身成立：hp/mp 上**本次战斗真的造成的伤害/回复**当然要落基础值（死亡照旧持久：击杀时 `c.hp = 0`，带负修正的角色 base 落到"修正期间真的掉掉的那部分"，撤掉修正即回到该值） |
    | ⚠️ 只支持常驻形态 | 写了相位的条目（zone 的 `settle`，如 `settle = "turn_start"`）**不生效**并报一次 warning —— 运行时清单没有"相位"概念，相位修正的落点是战斗本地聚合；要常驻就**删掉 `settle`** |
    | ⚠️ `attr` 必须已定义 | 漏写 `attr` / 引用了 `attributes.toml` 里没有的属性 → **加载期 error**（`combat-base` 的 `validateBattleEffectDefs`）—— 不拦的话条目照挂进效果区但一点属性都不加，没有任何运行时信号 |
    | `value.set` | **允许**（定值设置属性，如「定身」把速度压到 1）。与 `modify_stat` 不同：统计键没有覆盖语义，那里写 `set` 是加载期 error |
  - **今天仍未接线**：内功装配（`equipped_mods` —— 属秘籍/内功系统：装配槽、排他规则、装配指令）、
    **跨实体修正**（甲的状态改乙的属性 —— 本轮修正一律作用于**目标自身**，招式打别人时"目标"就是被打的人）、
    条件手册标注受修正字段、UI 的基础/有效值差异呈现（`120 (+15)`）。
    **今天在数据里写这几类字段不会有任何效果。** 另外修正**没有"条件"字段**：要"条件性生效"就用 `compute`
    派生，或由脚本在条件满足时挂/摘运行时修正。
  - 代码 API 仍是脚本/插件挂临时修正（以及用 `registerDeclarativeSource()` 追加声明式来源）的入口：

    | 机制 | 入口 | 存哪 |
    |---|---|---|
    | 运行时清单（**随存档**，可带到期时刻） | `registerRuntimeMod(entity, entry, strength)` | 实体字段 `char.attr_mods` |
    | push 栈（**不随存档**，纯内存临时叠加） | `registerModifier(entity, id, attr, { flat, percent, set }, opts?)` | 模块内 `WeakMap` |

    同文件另导出 `removeRuntimeMod` / `removeRuntimeModsByPrefix` / `readRuntimeMods`（运行时清单）与
    `removeModifier` / `clearModifiers` / `listModifiers`（push 栈）；同 `(id, attr)` 重复注册 = 覆盖，
    可重复挂载与热重载。
  - ⚠️ **以上只改了「读」**：写路径契约（上一节）不变 —— 声明式修正同样只进有效值，不会被写回 `base`；
    「要写回哪个值就从哪个值出发读」（`applyAttrDelta` / `readRawAttr` / `bindingResolver.getRaw`）照旧。
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
