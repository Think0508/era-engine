# 身材系统 body-shape-system（2026-08 定稿）

女/男角色身材「**cm 数值 ↔ 身材档**」的双向一致化机制。为未来的「胸臀/阴茎随情况变化」机制（丰胸/缩胸/成长/魔法等）提供唯一写入口。

## 四个维度

| 维度 | 存储字段 | 档名 | 性别闸 | 是否写天赋 |
|------|----------|------|--------|-----------|
| 胸围 chest | `body_shape.胸围` | 绝壁/贫乳/普乳/巨乳/爆乳（erArk 原版 5 档） | 女 | ✅ 互斥写天赋 |
| 臀围 hip | `body_shape.臀围` | 小臀/普臀/巨臀（erArk 原版 3 档） | 女 | ✅ 互斥写天赋 |
| 身高 height | `body_shape.身高` | 小车/标准/大车（*身高档标签*） | 女 | ❌ 纯派生 |
| 阴茎长度 penis | `body_shape.阴茎长度` | 短小/普通/粗大/巨根（erArk 官方 4 档） | **男** | ❌ 纯派生 + 镜像 |

> ⚠️ 身高档的「小车/标准/大车」是**身高档位标签**（0-160 / 160-175 / 175-999，min 闭 max 开），
> 与天赋「小车」（汽车迷因，摸小车指令前提用）**完全无关**。身高档只算标签，不写进 `talents`。

### 阴茎长度：派生镜像（关键兼容设计）

- 真理 = `body_shape.阴茎长度`(cm)，档 = 短小/普通/粗大/巨根；
- **`base.阴茎大小`(0-3) 降级为派生镜像**：reconcile / set 时由系统同步为当前档 rank →
  h-ejaculation 的 `jj_0~3` 前提、h-core pain-adjust 苦痛/快感结算、属性面板**零改动**继续工作，
  talk-common 上千条 jj_* 文案零迁移。
- 首触无数据 → 按分布 **5%/55%/30%/10%** 掷档，再在档内均匀取 cm。
  ⚠️ 这**修复了一个潜伏 BUG**：attributes.toml 给 `阴茎大小` 定义了 default=1，加载时 `applyAttributeDefaults`
  先给全员填 1 → 旧的注册时掷档（2026-08 架构复盘已**删除**，双写者收敛）见"已有值"直接跳过 → 真实游戏里全角色恒为普通档，
  分布只在单测生效。cm 模型存入 `body_shape` 负载（无属性默认值干涉）→ 掷档真正生效。
  现在 `base.阴茎大小` 唯一写者 = body-shape-system；h-ejaculation 只读镜像（jj_0~3 前提 + pain-adjust）。
- 显式写了 `阴茎大小 = 0/2/3`（非默认值）的角色 → 按该档区间**均匀随机**落 cm（尊重作者意图）；
  `= 1` 与自动默认值不可区分，仍走掷档（文档化取舍）。
- 边界（min 闭 max 开）：`8→普通 / 12→粗大 / 16→巨根`（0-8 短小，16-999 巨根）。

### 与身材系统（胸/臀）三情形的对照

| 情形 | 胸/臀（写天赋） | 阴茎（写 base.阴茎大小 镜像） |
|------|----------------|------------------------------|
| 有档无数值 | 落该档**最小值**（绝壁→70） | `阴茎大小=0/2/3` → **档内均匀随机**；`=1/无` → 分布重掷 |
| 有数值无档 | 按表自动重算 | 同样：按 cm 重算档 + 同步镜像（每次读/写都重算） |
| 都没有 | 落默认档最小值（普乳→80） | 按分布 **5%/55%/30%/10%** 掷档→档内均匀取 cm |

> ⚠️ 「短小/普通/粗大/巨根」**不是天赋**（与身高档同性质）：penis 维度永不写 `talents`，
> 档的持久化形态只有 `base.阴茎大小`(0-3) 镜像。所以不存在"男角色有短小天赋"这种数据；
> 类 似场景就是"有 `阴茎大小=0` 无长度"。档内随机是有意选择（短小=0cm 的最低落法失真）。

## 模型（grill 拍板）

- **档位天赋层保持 erArk 原版不动**（胸 5 档 / 臀 3 档）：更细的「趣味」靠 cm 数值细分，**不新增天赋档**
  （新增档会破坏 talk-common 绝顶描述全覆盖与 h-pregnancy 乳汁上限映射，这些文件无兜底分支）。
- **数值为唯一真相**：已有 cm → 按表落档；胸/臀互斥重算并写天赋；身高/阴茎确认档名（阴茎同步镜像）。
  只有档没数值（胸/臀）→ 落该档 min；两者皆无 → 落默认档 min（阴茎走掷档，见上）。
- **懒物化**：一切只在该维**首次被读/写**时落地；未消费不写任何字段。
- **性别闸（维度级）**：胸/臀/身高仅 `base.性别 == 2`（女）参与；阴茎仅 `== 1`（男）；
  其它情况一律跳过（读 API 返回 `null`、零写入）。
- **档位互斥**（胸/臀）：同一维度只允许一个档天赋 =1；数据残留多档 → warning + 保留 min 最小档。
- **无关天赋不碰**：只管理 5 胸/3 臀这 8 个档名；`幼女`等其它天赋原样保留；身高/阴茎档永不写天赋。

## 不做什么（明确排除）

- ❌ 不设「小车/大车」**天赋**——erArk 的「小车」是"小汽车"迷因天赋（未来「摸小车」指令前提用），保留原样。
- ❌ 不改 4 档分层与档名（短小/普通/粗大/巨根 = erArk Premise.csv 官方；jj_0~3 前提语义不变）——本轮只在其上加了 **cm 数值层**，`jj-premise.test.ts` 3/3 PASS 保持。
- ❌ 不进 `attributes.toml`（原因见「存储」）。

## 数据（mod 可覆盖）

```toml
# src/plugins/body-shape-system/data/default/body-shape.toml（默认层）
[body_shape]
sex_to_apply = "female"

[body_shape.chest]
default = "普乳"
[body_shape.chest.tiers]
"绝壁" = { min = 70,  max = 75 }
"贫乳" = { min = 75,  max = 80 }
"普乳" = { min = 80,  max = 90 }
"巨乳" = { min = 90,  max = 100 }
"爆乳" = { min = 100, max = 999 }

[body_shape.hip]
default = "普臀"
[body_shape.hip.tiers]
"小臀" = { min = 70, max = 80 }
"普臀" = { min = 80, max = 90 }
"巨臀" = { min = 90, max = 999 }

[body_shape.height]
default = "标准"
[body_shape.height.tiers]
"小车" = { min = 0,   max = 160 }
"标准" = { min = 160, max = 175 }
"大车" = { min = 175, max = 999 }

[body_shape.penis]
sex = "male"
default = "普通"
[body_shape.penis.tiers]
"短小" = { min = 0,  max = 8 }
"普通" = { min = 8,  max = 12 }
"粗大" = { min = 12, max = 16 }
"巨根" = { min = 16, max = 999 }
```

- `min` 闭 / `max` 开；低于首档收边为首档、高于末档收边为末档。
- 胸/臀档名必须与现有天赋名逐一对应；身高/阴茎档名任意（标签）。
- 维度级 `sex`：缺省用根 `sex_to_apply`（女）；阴茎显式 `sex = "male"`。
- 加载：`mod.bodyShape`（`src/core/mod-parse.ts` `loadBodyShape()`，维度循环 chest/hip/height/penis）插件默认层 + mod `definitions/body-shape.toml` 字段级 deepMerge（**mod 胜出**，顺序：插件默认层先塞、mod 层后塞）。结构错误 → error（文件名+行号）；默认档缺失/区间不单调/区间空隙 → warning（运行时按 min 排序兜底）。⚠️ 合并是**增改不删**：mod 可覆盖 min/max/default/sex、可新增档，但**无法删除**插件默认档（已有合并契约测试：`body-shape-merge.test.ts`）。
- ⚠️ 边界数字是**占位调参值**（用户待定）：直接改本表或 mod 覆盖即可，代码零改动。

## 存储（为什么不在 base？）

cm 存在 **`char.body_shape = { 胸围, 臀围, 身高, 阴茎长度 }`**（L3 引擎独占承载，随存档持久；与 `pregnancy`/`dirty`/`h_state`/`body_items` 同策略）。

> ⚠️ 为什么**不**放 `base.胸围`：`attributes.toml` 会对 base 每个属性自动落默认值。若定义 `胸围=80`，
> 加载时全员 base.胸围=80，首读 reconcile 见数值 80 → 推得普乳 → 把作者手写的 [巨乳] 天赋覆盖掉（数据丢失）。
> 放 `body_shape` 负载则彻底懒物化、零覆盖风险（阴茎的 阴茎大小 镜像保留在 base 是**有意为之**：给
> jj_0~3 前提 / pain-adjust / 属性面板的零改动兼容契约，由本系统负责保持新鲜）。
>
> 因此 `胸围/臀围/身高/阴茎长度` 也不作为普通属性进条件字典，而是走**代理域**（见下）。

## 条件接入（代理域 body_shape.*）

普通属性路径做不到：`selected.胸围` 是内置根，代理域只在**根段**拦截；塞 base 又会被默认值覆盖。
所以按 counter-system 先例（2026-08-17）注册代理域：

- `registerProxyDomain('body_shape', 'body-shape', 'resolvePath')`（index.ts onEnable）
- `resolvePath(segments, ctx)`：`[角色, 维度]`，`角色` 可 `'selected'` 或角色 ID；**读时先 reconcile（懒物化正确）**。

**条件写法**：
```
body_shape.selected.胸围 >= 90        # 目标（selected）胸围
body_shape.npc_7.臀围 < 80           # 指定角色臀围
body_shape.selected.身高 < 170       # 指定角色身高
body_shape.npc_7.阴茎长度 >= 12      # 指定角色阴茎长度（男用）
```
* 已注册 `plugin.toml [condition_fields]`：`body_shape.{id}.胸围/.臀围/.身高/.阴茎长度`（number）→ 进条件手册、过指令加载校验。
* ⚠️ **禁止写 `selected.body_shape.胸围`**：那是实体直读、不触发 reconcile，未消费的档会读成 0。校验层就会拒绝它（非注册路径）。

### 前提：hgt_0..N（身高档分支，复刻 jj_0~3）

口上/指令要按体型分支时用前提（`conditionEngine.registerPremise` 注册，幂等）：
```
premise(hgt_0)   # 小车
premise(hgt_1)   # 标准
premise(hgt_2)   # 大车
```
- 语义：查 **actor（sourceId）** 的身高档 rank（rank = 身高档表按 min 升序序号）；非目标性别 → false。
- 注册量为 onEnable 时身高档数；若 mod 改多档位，超量档位仍可用 `body_shape.*.身高` 数值条件，只是没有对应 hgt_N 前提。
- 阴茎档的分支走 **jj_0~3 前提**（h-ejaculation 注册，读 base.阴茎大小 镜像——本系统保持新鲜），不重复注册。

## API（`ctx.api.call('body-shape', ...)`）

| 方法 | 说明 |
|------|------|
| `getBust` / `getHip` / `getHeight` / `getPenisLength` `(charId)` | cm 值（懒物化后）；性别不符/未配置 → `null` |
| `setBust` / `setHip` / `setHeight` / `setPenisLength` `(charId, cm)` | 写 cm → 重算对应档（胸/臀写天赋；阴茎同步镜像）+ 发 `character:changed`；返回新 cm |
| `getChestTalent` / `getHipTalent` `(charId)` | 当前档天赋名（如 巨乳/普臀） |
| `getHeightTier(charId)` | 当前身高档标签（小车/标准/大车） |
| `getPenisTier(charId)` | 当前阴茎档（短小/普通/粗大/巨根） |
| `adjust(charId, dim, delta)` | 长大/缩小原语（`dim` ∈ bust/hip/height/penis；钳制 ≥0；发双事件） |
| `resolvePath(segments, ctx)` | 代理域转发目标（条件引擎用；也可直接调） |

**未来变化机制**只用 `setBust/setHip/setHeight/setPenisLength` 作为唯一写入口：数值变了，档自动跟随（升/降同逻辑）。

## 长大/缩小机制（adjust 原语）

唯一的"增量写"通道。未来一切驱动器（吸收精液量→胸/臀长大、男角色类似→阴茎等）**只调这里**，
不允许直接改 `body_shape` 负载（裸写虽会被下次 reconcile 自愈，但绕过事件/钳制）。

```
ctx.api.call('body-shape', 'adjust', charId, 'bust'|'hip'|'height'|'penis', delta)
# delta 正=长大 负=缩小；结果钳制 ≥ 0（硬下限，2026 grill 拍板）
# 流程：懒物化 → 钳制 → setValue（重算档、同步阴茎镜像、发 character:changed）→
#       发 body-shape:adjusted 专用事件 → 返回新 cm（性别不符/非法 dim → null）
```

**事件契约**（给未来驱动器/UI 的观察点）：
```ts
eventBus.on('body-shape:adjusted', ({ id, dim, delta, old, value, tier }) => { ... })
// delta = 实际生效增量（钳制后）；tier = 新档名；与 character:changed 并发生出
```

**驱动器挂点（TODO，留文档不做）**：
- 「女角色某部位按**吸收精液量**成长尺寸」：h-ejaculation absorbSemen / H 结束结算点
  （`h-core/settle/hpmp-growth.ts` 先例）算精液量 → `adjust(charId, 'bust'/'hip', n)`；
- 「男角色类似」→ `adjust(charId, 'penis', n)`；成长率/阈值曲线在驱动器里定，不进引擎。

## 与未来指令/裸写的兼容性（FAQ）

- **「身体测定」类指令**（erArk 有"身高体重 身体检查"成就，待移植）：直接填尺寸走
  `setBust/setHeight/…`（绝对值）或 `adjust`（增量）→ 档重算/镜像/事件全自动。
- **绕过 API 的裸写** `char.body_shape.胸围 = 95`：下次任何读/写自动自愈（数值权威重算档），
  不产生永久错误状态；但仍不推荐（无事件、无钳制）。
- **读路径副作用（设计内，知晓即可）**：代理域/API 读会触发懒物化 reconcile——条件求值
  （NPC AI 目标搜索、随机事件等）可能静默写 payload 或清理冲突天赋，且**不发 character:changed**
  （事件只由 set/adjust 发）。冲突修复罕见；UI 由下一次正常事件同步。
- **档位区间连续**：loader 对"档区间空隙"（相邻档不连续）与"非严格递增"会发 warning——
  空隙内数值会静默收边到末档，作者应保持区间连续。
- **与其他系统的边界**：`body_shape` 已登记为 L3 引擎独占顶层键（ADR-0007）——作者在角色 TOML
  直接写它会收到"引擎独占字段，写入无效"的精确 warning（而不是含糊的"未知顶层键"）。
  gain-rule-system 的 grant/remove_talent 或套装 bonus 若误配了身材档天赋（普乳/巨乳等）——
  数值权威会在下一次读取时覆盖回去，且**不会乒乓**（reconcile 不发 character:changed）；
  身材档天赋的授受一律经 body-shape API（set*/adjust）。
- **天赋更替**：改尺寸后「旧天赋丧失、新天赋获得」由 `applyTier` 互斥写保证
  （普乳→巨乳 = 普乳 delete、巨乳=1；反向同理；跨多档直接落最终档）；talk-common 描述与
  h-pregnancy 乳汁上限在下次读取时跟随新天赋。天赋更替本身静默（无叙事/专有事件）——
  是否播报由未来内容（如身体测定指令）自己决定。

## 测试

`src/plugins/body-shape-system/body-shape-system.test.ts`（31 例）覆盖：三情形、数值权威、互斥修复、
非身材天赋保留、性别闸（含维度级阴茎男闸）、双向 set + `character:changed`、档位边界、身高/阴茎懒物化、
hgt_N 前提、jj_0~3 镜像联动（h-ejaculation 实装前提读镜像）、阴茎分布覆盖与作者显式档、代理域
`body_shape.selected.{id}.胸围/臀围/身高/阴茎长度` 读时 reconcile + 性别闸、adjust 原语
（跨档长大/缩小+天赋互斥跟随、硬 0 下限钳制、性别闸/非法 dim、阴茎镜像+jj 联动、事件载荷、懒物化后再改）。

## 后续衔接（延后项，非本轮）

- h-pregnancy `calcMilkMax`（erArk `milk_max=150+(talent_id-121)*40`）可后续改为 `f(胸围)` 与身材表统一——本轮**不动**。
- 更细粒度的身高档 / 胸臀档位扩展：只改 `body-shape.toml`（或 mod 覆盖）。
