# counter-system（计数器系统）使用手册

> 独立插件 `src/plugins/counter-system/`。架构决策见 **ADR-0016**；指令复刻时对照见
> `docs/skills/replicating-an-instruction.md` 的"计数器对照"章节。
>
> 核心原则（ADR-0016）：**存量机制不搬家**（experience/body_semen/first_records/h_state/各
> H 内 record 保持散装），本系统只管"纯统计/记录"；存量通过**视图**统一暴露，不双写。

## 一、快速上手

新增一个计数器 = 在 `definitions/counters.toml`（mod 层；插件默认层在
`src/plugins/counter-system/data/default/counters.toml`）写一条声明。改机制（存储/查询/
事件）不动声明，加计数器不改代码。

```toml
# 数值计数器：每次 h:shoot，目标角色该计数 +payload.amount
[[counters]]
id = "total_semen"
label = "累计受精量"
scope = "character"
type = "number"
unit = "ml"
event = "h:shoot"
add = "payload.amount"
```

条件路径（counters 代理域）：`counters.{角色id}.total_semen > 500`
实体直读也可：`character.{角色id}.counters.total_semen > 500`

## 二、计数器类型

| type | 存储 | 说明 |
|------|------|------|
| `number` | `counters[id]: number` | 数值累计。**不支持 initial**（见 §五） |
| `list` | `counters[id]: { initial, named[], list[] }` | 去重名单：`initial`=数字初始快照、`named`=具名初始（初始就"算"的人，游戏内再出现不进新增名单）、`list`=游戏内新增 |
| `group_table` | `counters[id]: { __meta, dim1 → dim2 → {字段} }` | 嵌套分组表，见 §四 |

### 通用字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` / `label` | string | 唯一 id / 显示名 |
| `scope` | `player` / `character` / `global` | 计数目标分类。**同 id 可分别声明 player/character 两版**（方向不同，如玩家与女角色各自的 h_partners）——defs 键为 `scope:id`。`global` 未实现 |
| `type` | number/list/group_table | 见上 |
| `event` / `add` | string | 驱动事件 / 增量（`payload.xxx` 或常量）。number/list 在顶层声明；group_table 在字段级声明 |
| `target_from` | string | 计数目标角色：payload 字段（默认 `payload.target`）。player scope 自动定位玩家实体，忽略此字段 |
| `filter_gender` | `male` / `female` | list 专用：加名单前查名单项 `base.性别`（1=男 2=女） |

## 三、视图（views）——不双写

视图是**只读计算**，消费方（条件/API/UI）经 `counters.{角色id}.{viewId}` 读取，不产生存储。

```toml
[[views]]                       # 1. 只读映射——直接读实体字段（可减初始）
id = "orgasm_total"
label = "总绝顶次数"
source = { path = "experience.20" }

[[views]]                       # 2. 枚举映射——维度值 → 实体字段段
id = "orgasm_count"             #    部位 cid → experience 绝顶 id
label = "部位绝顶次数"
map = { path = "experience", table = { "6" = "14", "8" = "15", "7" = "17" } }

[[views]]                       # 3. 派生聚合——求和/计数 over 分组表
id = "semen_total"
label = "部位精液总量"
aggregate = { counter = "male_stats", field = "semen", keep_dims = ["part"], op = "sum" }

[[views]]                       # 4. 关系查询——读关系系统（恋人/妻子/奴隶等）
id = "lovers"
label = "恋人"
relation = { type = "恋人" }
```

**source/aggregate/relation/map 四选一**（校验报错）。`relation` 视图统计 `type` 匹配且
正面（值 > 0）的对象数量；名单走 API `relationList(charId, type)`。

条件路径：
- `counters.李秋水.semen_total.6 > 500`（阴道精液总量，含初始）
- `counters.李秋水.orgasm_count.6 > 10`（阴道绝顶次数）
- `counters.李秋水.lovers > 0`（有恋人）

## 四、分组表（group_table）——按男角色分条的精液/插入等

```toml
[[counters]]
id = "male_stats"
label = "精液与射精统计"
scope = "character"
type = "group_table"
initial_from = "base.初始被插入男人数"          # 初始数字（无名背景男）
initial_named_from = "base.初始被插入男人"       # 初始具名（真实个体 id 数组，去重）
initial_fields = { semen = "base.初始体内精液量" } # 字段初始值
dims = [
  { id = "part", from = "payload.position" },       # 维度1：被射部位（body part cid）
  { id = "character", from = "payload.character" }, # 维度2：射精者 id
]
fields = [
  { id = "semen",  label = "精液量",   unit = "ml", event = "h:shoot", add = "payload.amount" },
  { id = "shoots", label = "射精次数", unit = "次", event = "h:shoot", add = 1 },
]
```

存储形状：

```ts
character.counters.male_stats = {
  __meta: {                       // 保留键：初始值快照（创建时固化，与角色字段脱钩）
    "6": { count: 10, named: ["guojing"], field_init: { semen: 30 } },
  },
  "6": {                          // dim1 = 部位（阴道）
    "guojing": { semen: 20, shoots: 1 },   // dim2 = 男角色；字段累计
    "player":  { semen: 30, shoots: 2 },
  },
  "8": { ... },                   // 另一部位
}
```

### ⚠️ 初始值规则（复杂，务必理解——这是"真实值"的语义核心）

角色可选字段可以是：
- **纯数字**（荡妇背景："初始有 10 个男人插过"）→ `initial_from` 快照为 `meta.count`
- **具名名单**（黄蓉背景："初始只有郭靖"——郭靖是**真实游戏个体**，之后可能继续 H）→ `initial_named_from` 快照为 `meta.named`
- **字段初始**（"体内已有 30ml"）→ `initial_fields` 快照为 `meta.field_init`

**两个读数**（条件路径加 `.real` 段 = 真实值）：

| 读数 | 男人数公式 | 荡妇例 | 黄蓉例 |
|---|---|---|---|
| **总数**（默认，含初始） | `meta.count + meta.named.length + \|实际条目 ∖ named\|` | 10 + 0 + 1 = **11** | 0 + 1 + 1 = **2** |
| **真实值**（`.real` 段） | `\|实际条目 ∖ named\|` | 1 | 1 |
| 数值字段总数 | `meta.field_init + Σ条目字段` | 30 + 20 = 50 | — |
| 数值字段真实值 | `Σ条目字段` | 20 | — |

**关键语义**：
- **具名初始（named）去重**：郭靖在 `meta.named` 里，游戏内又与她 H → 条目照建、数值照累计（精液记到他头上），但"男人数"统计里**不重复计**（不算新增）。list 型同理：named 算总数，但游戏内再出现不进新增名单。
- **数字与具名是正交的两部分，相加**：`总数 = count + named 数 + 新增`。**数字里的 N 个不包含具名那几个人**——`count=3 + named=[郭靖]` = 共 4 人（3 无名 + 郭靖），不是 3。想表达"总共 3 人含郭靖"就写 `count=2 + named=[郭靖]`。作者负责保证数字与具名不重叠。
- **快照而非实时读**：首次创建条目时从角色字段快照进 `__meta`，之后与角色字段脱钩——防其它系统误改角色字段导致统计漂移。
- **未建档回退（重要）**：初始值是**惰性快照**（首次建条目才写 `__meta`）——因此**"只设了初始、从未被计数"的角色**，视图（male_count/semen_total）与 list（count）会**回退实时读角色初始字段**（初始字段语义恒定=背景，回退与快照等价），**不会从 0 起**（否则初始值"凭空消失"）。首次被计数后以快照为准。
- `__meta` 是**保留键**（约定角色 id / 部位 id 永不用此名）；`count(character.{id}.counters.male_stats.6)` 数 dim2 条目不含它（天然正确）。

### 给角色写计数器初始值（作者视角，三处配合）

> 原则：**初始值不写在 counters 里，写在角色的 `base` 可选字段**，计数器首次给该角色建条目时
> 自动快照进 `__meta`。写"初始有 3 个男人"**不会产生 3 个假条目**（名单只存游戏内新增）。

以"某女角色初始被 3 个男人插过（其中一个郭靖是真实个体）、体内已有 30ml 精液"为例：

```toml
# ① 你（mod 作者）的 attributes.toml：定义初始字段——
#    字段名可自己定（不挂靠任何"原生字段"），只要与 ③ 的 initial_from 对上。
#    按项目铁律（character-contract）角色数据禁止裸字段，所以必须在这里定义。
"初始被插入男人数" = { type = "number", default = 0, category = "base", display = false }
"初始被插入男人"   = { type = "array",  default = [], category = "base", display = false }
"初始体内精液量"   = { type = "number", default = 0, category = "base", display = false }

# ② 角色数据里写值（named/base.toml 或 roster.toml 的 base 段）：
base = {
  "初始被插入男人数" = 3,
  "初始被插入男人"   = ["郭靖"],   # 具名（真实角色 id；游戏内郭靖继续 H 不重复计入"男人数"）
  "初始体内精液量"   = 30,
}

# ③ counters.toml：让计数器引用这些字段（male_stats 会快照 count/named/field_init）：
#    如果字段名与你定的一致，插件的默认声明已经写好引用，无需再写；
#    想换字段名 → 在 mod 的 counters.toml 里 override male_stats/h_partners，改 initial_from/…：
initial_from = "base.初始被插入男人数"
initial_named_from = "base.初始被插入男人"
initial_fields = { semen = "base.初始体内精液量" }
```

**针对不同类型**：

| 计数器 | 初始怎么写 | 效果 |
|---|---|---|
| `list`（h_partners：H 过的男人） | `initial_from`（数字）+ `initial_named_from`（具名数组） | 总数 = 数字 + 具名数 + 新增；`real` = 新增 |
| `group_table`（male_stats） | `initial_from` / `initial_named_from`（男人数）+ `initial_fields`（各字段初始） | 部位男人数 / 部位精液总量含初始，`real` 减初始 |
| `number` | **不支持** initial（validate 会 warning） | 数值计数器无"初始读数"概念 |

**两个提醒**：
1. **默认字段名是约定**：插件默认层 male_stats/h_partners 已声明引用
   `"初始被插入男人数"`/`"初始被插入男人"`/`"初始体内精液量"`/`"初始射精次数"`。用默认名 = 零配置；
   自定义名 = override 声明（见 ③）。混用会静默 0（字段读不到），别一半默认一半自定义。
2. **字段没在 attributes 定义就写进角色数据 → character-contract 会 warning"使用了未定义的属性"**——
   这是防裸字段铁律，不是 bug；照 ① 定义即可。

### 分组表增删字段

- **加一个字段**（如未来插入系统）→ 在 `fields` 加一行：
  `{ id = "inserts", label = "插入次数", event = "h:insert", add = 1 }`
  存储/存档/查询全兼容（惰性字段）。`h:insert` 事件实现后一启用即生效（见 §六 半成品）。
- **加一个维度**（如"场景"）→ `dims` 加一项 + 一条存档迁移（老树少一层）。避免频繁加维度——维度是语义结构，不是标签。

## 五、条件路径全集

`counters.{角色id}.{key}` 后接：

| 目标 | 路径 | 返回 |
|------|------|------|
| number | `counters.李秋水.xxx` | 当前值 |
| list | `counters.李秋水.h_partners.count` | 总数（initial + list.length） |
| list | `counters.李秋水.h_partners.list` | 名单数组 |
| list | `counters.李秋水.h_partners.real` / `.added` | 真实值（新增数） |
| 分组表 | `counters.李秋水.male_stats.6.player.semen` | 单条目字段值 |
| 分组表 | `count(counters.李秋水.male_stats.6) > 3` | dim2 条目数（不含 __meta） |
| 任意 | `… .real.…`（key 后立即） | 真实值模式（减初始、具名去重） |
| 视图 | `counters.李秋水.semen_total.6` | 视图求值 |

**⚠️ 三个易踩的语义点**（防静默）：

1. **count() 分组表一定要带 dim1**：`count(counters.李秋水.male_stats.6)`（数部位条目）是正确的；
   `count(counters.李秋水.male_stats)`（不带部位）会数到顶层的 `__meta` 保留键——**永远不要这样写**，
   要"按部位男人数"用 `male_count` 视图（`counters.李秋水.male_count.6`），它正确处理初始值。
2. **list 顶层返回的是 `{ initial, list }` 对象**——条件里请用 `.count`/`.list`/`.real` 子段，
   不要把对象直接与数字比较。
3. **number 无 real 段**（不支持初始值，存储即总值）；分组表/视图才有"总数 vs 真实值"两种读数。

**实体直读**（不经代理，condition-engine 原生导航）：`character.{id}.counters.male_stats.6.player.semen`、
`selected.counters.xxx`——同样遵守上面三条。

**role id 约束**：角色 id 用作路径段，**约定不含 `.`**（与场景 id 同约束）。ASCII/中文混用均可。

## 六、半成品机制（pending）

依赖尚未实现事件的字段，声明 `pending = true`：

```toml
{ id = "inserts", label = "插入次数", event = "h:insert", add = 1, pending = true }
```

效果：加载 warning 一次、**条件路径不注册**、监听跳过（值恒不存在）。事件实现后去掉 `pending`
即激活（条件路径自动注册——registerConditionFields 增量注册）。插入次数/严格"插过"的肉棒数
因此留半成品（插入动作本身待 SEX 指令批次 B2+）。

当前已知的待补事件（h-core emit 点有 `// TODO(counter-system)` 标记）：
- `h:insert`（新事件，插入结算处）
- `h:orgasm` 补 `sourceId`（谁让她绝顶——按男角色分条绝顶统计需要）
- `h:end` 补 `participants`（群交/被轮/一男多女计数需要，群交整体重写时扩展）

## 七、公共 API

命名空间 `counter-system`（插件/脚本经 `ctx.api.call('counter-system', …)`）：

| 方法 | 说明 |
|------|------|
| `get(charId, key, ...rest)` | 任意计数/视图读数（总数） |
| `real(charId, key, ...rest)` | 真实值读数 |
| `list(charId, counterId)` | 名单 `{ initial, list }` |
| `listGroup(charId, counterId, dim1?)` | 分组表节点（条目键+字段），UI 渲染用 |
| `relationList(charId, type)` | 关系视图名单（对象 id 列表） |
| `resolvePath(segments, ctx)` | 代理域转发入口（条件引擎用） |

效果：`counter_add`（`params: { counterId, value?, dims?, field?, item? }`）——事件表达不了的特殊语义显式计数。计数目标 = effect 的 `_targetIds`。
- **number**：`value`（数值增量，缺省 +1；非数字 → warning 跳过）
- **group_table**：`dims`（维度值数组，**必填否则 warning 跳过**）+ `field`（**必填**）+ `value`
- **list**：**只认 `item`**（要加入名单的角色 id）——`value` 会被忽略并 warning（避免数字被当名单项）。

## 八、扩展指南（加计数器/加维度/接事件）

1. **加简单计数器**：`counters.toml` 写一条 `[[counters]]`（scope/type/event/add/初始）。
2. **加分组表字段**：`fields` 加一行——事件已存在则立即生效；未实现则 `pending = true`。
3. **加新事件绑定**：确认事件名 + payload 字段；在 `counters.toml` 里引用；若事件不存在，先补 emit（按 §六 TODO 对照指令复刻批次）或 `pending`。
4. **存量数据显示**：注册 `[[views]]`（source/map 映射 experience/body_semen 等），不搬家、不双写。
5. **清半成品**：事件实现后删除字段上的 `pending`（条件路径自动注册）。

### 存档与新计数器（游玩后加计数器的行为）

已有存档游玩一段时间后新加计数器，行为分三类（有测试锚定）：

| 新计数器类型 | 对旧存档的行为 | 说明 |
|---|---|---|
| **事件驱动存储型**（number/list/group_table） | **从 0/空 惰性起**（未触发过 = 缺省） | 新统计从"启用时刻"起算——事件不会重放，历史无法自动回填 |
| **只读视图**（source/map/relation） | **实时映射数据源 → 立即反映历史值** | 读 experience/relations/body_semen 等机制字段，数据源有内容即有值，**不是 0**（最常见用法：新设计 = 包装已有数据的视图，天然零迁移） |
| **aggregate 视图** | 跟随其读的存储型计数器的历史 | 读 male_stats 等 → 该计数器有历史即聚合出历史 |

**需要"按逻辑算出起始值"的存储型计数器**（事件驱动但希望含历史）：两条路——② 用视图包装数据源（推荐，零迁移）；或迁移脚本设起始值：`rename` 搬旧字段 / `default = { field = "counters.xxx", value = N }` 设常量起始（`applyDefault` 支持任意字段路径含 `counters.`）。**`transform`（脚本按逻辑计算回填）未实现**（沙箱 phase-12.1），依赖它的迁移需等沙箱落地或改用视图。

## 九、引用语义与加载时序（mod 扩展边界）——为什么 mod 新字段可以被计数器自由引用

**加载时序**：`counters.toml`（插件默认层 `data/default/` **+ mod `definitions/`**）与 mod 的
attributes/abilities 等内容**全部在同一次 `loadMod` 里解析合并**（mod-parse 统一处理，同 id mod 胜出）。
**不存在"计数器先加载、mod 后加载"——它们本来就在同一批**。

**引用语义**：计数器对外部字段的引用是**运行时读取**，**不做加载期存在性校验**：

| 引用 | 例子 | 加载期行为 |
|------|------|-----------|
| `initial_from` / `initial_named_from` / `initial_fields` | `initial_from = "base.武功"` | 不校验，运行时快照 |
| 视图 `source.path` | `source = { path = "experience.20" }` | 不校验，运行时读 |
| 视图 `map.table` | `map = { path = "experience", ... }` | 不校验，运行时读 |
| 视图 `relation.type` | `relation = { type = "恋人" }` | 不校验，运行时查关系 |

mod 定义了该字段 → 正常运行取值；**mod 没定义 → 缺省（0/空/无），绝不报错卡加载**。
这正是"mod 引入原生态没有的新内容（如'武功'），计数器即可引用"的保证——你不需要等原生
"预留"任何东西。建议（非强制）：新字段进 mod 的 `attributes.toml`（与 character-contract
铁律一致），这样角色数据有据可查、`initial_from` 拼写也有可读性。

**强校验范围（仅 counter 自身声明，与 mod 内容字段无关）**：type/scope 合法、分组表有
dims+fields、number/list 有 event+add、视图四选一、同 id 双 scope type 一致、`sum(list)` 前置
拦截、`aggregate.field` 在分组表 fields 中。**这些检查全部发生在 counter 声明内部**——只要
你的计数器声明本身合法，引用什么样的 mod 字段都不会被它挡住。

**代价（明确告知）**：正因为引用不做存在性校验，**拼错的 `initial_from`/`source.path` 不会报错**
（运行时得缺省值）——这是"mod 自由引用"与"加载期抓拼写"的取舍，本项目选择前者（后者会把
mod 新字段卡死在原生校验里，正是你担心的反面）。兜底：字段进 attributes.toml 后可读性自查，
未来如需可加"`base.` 前缀引用存在于 attributes 的 warning 校验"（在 mod 声明层启用，不影响
插件默认层通用性）。

## 十、测试覆盖

`src/plugins/counter-system/counter-system.test.ts`（27 例）覆盖：声明加载、惰性创建、事件驱动
（h:start 双侧 h_partners / h:shoot 分组表）、初始值（list + 分组表 __meta：荡妇 10+1=11 /
黄蓉具名去重 / 正交组合）、视图求值（sum/map/source/relation/count）、条件路径（代理域 +
`count()` + `.real`）、pending 半成品、**扩展便利性实测（加字段/加计数器纯 TOML）**、
**gain-rule 成就规则引用 counters 的端到端闭环**、**mod 新字段（非原生"武功"）计数器引用不
报错**、**旧存档兼容（视图反射历史 / 新计数器 0 起）**、**真实链路（见下）**。改机制/加计数器
时应同步补用例。

### 事件发射点契约与接线保障（2026-08-17 审计沉淀）

**计数正确性的源头在发射端**——counter 只是"监听到事件后按声明记账"，它无法知道你记的
"射精"是不是全部射精。这份保障须靠**单一发射点原则 + 真实链路测试**：

**已审计的发射点清单**（生产代码唯一发射点，新增时保持"每类事实只有一处 emit"）：
- `h:start` → `h-core/index.ts startHScene`（`{ ally, target }`；H 开始唯一入口，NPC 主动/睡奸同走）
- `h:shoot` → `h-ejaculation` 的 `eja_climax`（套套/非套套两分支）与 `eja_shoot` 三个点（`{ character, target, amount, position, condom }`）
- **教训（真 bug）**：`eja_shoot` 曾漏 emit `h:shoot` → 走该路径的射精计数器/妊娠全部漏计；
  已修复（补 emit + async await 保证派发完整），并有真实链路测试锚定

**新增事件绑定/事件的硬性要求**：
1. 发射点唯一且带全 payload（对照上面清单；任何新发射路径必须 emit 同一事件、同一 payload 形状）
2. **测试必须走真实触发**（调真实 effect/startHScene，而非手动 `eventBus.emit`）——这是唯一能抓
   出"上游漏 emit"的手段；手动 emit 测试只能证明"收到事件后会记"，证明不了"事件会被发出"

## 十·一、喜欢的体位/部位学习源（2026-08-25）

- `male_stats` 新增 `count` 字段：女角被使用某女体部位的次数（事件 `h:part_use`）。
- 新增 `female_stats`：男角对女体部位使用统计（dims `[part, partner]`，字段 `count`）。
- 新增 `position_stats`：双方体位使用统计（dims `[position, partner]`，字段 `count`）。
- 发射点：
  - `h:part_use` → `h-core/index.ts handleExecutionEnd`（payload 含 `target/character/partner/part/position`）
  - `h:position_use` → `h-core/index.ts handleExecutionEnd`（payload 含 `target/partner/position`）
- 这些计数器是“喜欢的体位/部位”的**统计源/面板数据**；偏好本身存 `favorite` 命名空间（见 character-schema）。

## 十一、与指令复刻批次的对接

指令复刻（docs/skills/replicating-an-instruction.md §5.7）对照本系统补事件：h:insert（插入）、
h:orgasm 补 sourceId、h:end 补参与者列表——补完去掉对应字段 `pending` 即激活。群交系统重写后
验证 h:shoot/h:start 在新路径的覆盖。
