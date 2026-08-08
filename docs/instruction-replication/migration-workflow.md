# 迁移复刻一个指令：从头到尾的标准流程（SOP）

> 本文档是给 **AI 执行者** 的操作手册。逐条照做，不要跳步，不要"觉得合理就改"。
> 每步的"来源"指向 erArk 源码/CSV，必须查证后再写，禁止凭记忆或猜测。
> 铁律：**每个数值必须有 erArk 源码可追溯**（见 `docs/skills/erark-replication.md`）。

---

## 0. 总览：一个指令的生命周期

```
输入                      处理                           输出
─────────────           ─────────────                  ─────────────
erArk InstructConfig.csv ─┐
Behavior_Effect.csv  ─────┤  → 按本文档逐条翻译 →      mods/武侠/definitions/
Behavior_Data.csv    ─────┤                              instructions/{类型}.toml
handle_instruct.py   ─────┘                              + 批次清单文档记录
```

**最终产物**：一条 `[[instructions]]` 记录，写进插件默认层或 mod 的 `instructions/` 目录。
**每条指令必须经过**：查源 → 写 TOML → 自审 → 批末验收。禁止跳过任何一步。

---

## 1. 数据源（查证时用，先记住位置）

| 数据 | 位置 | 用途 |
|------|------|------|
| 指令清单 | `用来复刻的蓝本游戏 erArk 不要commit/data/csv/InstructConfig.csv` | 指令本体：id/名称/类型/前提/行为ID |
| 效果链 | `.../Behavior_Effect.csv` | behavior_id → 效果ID链 |
| 行为耗时 | `.../Behavior_Data.csv` | duration（注意 -1 是特殊信号，见 §5）|
| 实行判定值 | `.../InstructJudge.csv` | judge 名 → 基准值（26 行）|
| 指令处理函数 | `.../Script/System/Instruct_System/handle_instruct.py` | **每条的真正耗时/判定/特殊逻辑都在这里** |
| 前提实现 | `.../Script/Design/handle_premise/*.py` | 前提 handler 的语义来源 |
| 判定公式 | `.../Script/Design/instuct_judege.py` | 实行判定全公式 |
| 中文参考文档 | `恐怖游戏-巫师-H系统专集/06-指令集-攻略期.md` `07-猥亵期` `08-H内` | 人类可读的指令集合 |
| 效果ID速查 | `恐怖游戏-巫师-H系统专集/21-效果ID速查表.md` | 效果 ID 含义 |
| 公式手册 | `恐怖游戏-巫师-H系统专集/00-公式手册.md` | 公式细节 |

> ⚠️ 编码坑：CSV 是 UTF-8，`IN_CAFÉ` 等含特殊字符的条目可能损坏，遇到就标出。

---

## 2. 开工前：确认这条指令"该做"

从 `instruction-master-list.md` 找到该指令，确认状态为 **保留**。

- 状态是 `砍掉`（方舟世界观专属/依赖未实装系统/标"未实装"）→ **不做**，跳过。
- 状态是 `延后` → 记 TODO，跳过。
- 状态是 `保留` → 继续。

---

## 3. 从 InstructConfig.csv 取指令本体

```csv
cid,instruct_id,name,instruct_type,instruct_sub_type,premise_set,behavior_id,...
1005,stroke,身体接触,DAILY,0,HAVE_TARGET|NOT_H|...,STROKE,...
```

| CSV 字段 | 映射到 TOML | 说明 |
|----------|------------|------|
| instruct_id | `id` | 直接用（全部迁移完成后删 erark 字段，见 §9）|
| name | `label` | 中文显示名 |
| instruct_type | `category` | SYSTEM→system, DAILY→daily, PLAY→daily(并入), WORK→(砍掉或并入), ARTS→(归 H 插件), OBSCENITY→obscenity, SEX→sex |
| instruct_sub_type | `sub_category` | sex 子类：foreplay/wait_upon/insert/item/drug/sm/arts |
| premise_set | `premises` | 原样抄入，逐个核对注册状态（见 §4）|
| behavior_id | `erark_behavior` | 过渡字段，供追溯 |
| instruct_id | `erark_id` | 过渡字段，供追溯 |

---

## 4. 前提（premises）处理——三条规则

抄下 `premise_set` 后，**每个前提**做三选一：

| 情况 | 处理 |
|------|------|
| **A. 已在 `premiseRegistry` 注册**（查 `src/plugins/*/premise/*.ts`）| 直接留在 premises |
| **B. 未注册，但语义是"位置"**（`IN_*` / `POSITION_IN_*`）| **从 premises 移除**，改在 TOML 加 `condition = "location.tags.has_xxx == true"`（见 §7 位置tag对照表）|
| **C. 未注册，非位置** | 从 erArk `handle_premise_*.py` 查语义 → 在 h-core 前提文件注册 handler（复制 erArk 逻辑）→ 留在 premises |

**规则**：
- 前提注册的语义**必须**从 erArk 源码读，禁止猜。
- 位置前提**一律**走 location.tags，**禁止**注册 `IN_*` handler（这是既定架构决策）。
- 未注册前提**不能静默跳过**——批次清单里必须标注"已注册/需注册/改tag"，批末验收时确认无遗漏。

### 4.1 自动注入前提展开（2026-08-08 erArk 更新对齐）

erArk 新版 InstructConfig.csv 新增 `h_mode_show_type`（H模式显示类型）与 `tired_type`（疲劳类型）两列，
`handle_instruct.py:134-152` 在运行时按类型**自动注入**前提（CSV premise_set 中已不含这些前提）：

```
h_mode_show_type = 1（非H显示） → 注入 NOT_H + NOT_SHOW_NON_H_IN_HIDDEN_SEX
h_mode_show_type = 2（仅H内显示） → 注入 TARGET_IS_H
tired_type = 1（低疲劳）        → 注入 TIRED_LE_84 + HP_G_1 + DRUNK_LEVEL_NOT_3
tired_type = 2（特定疲劳）       → 注入 TIRED_LE_74 + HP_G_1 + DRUNK_LEVEL_NOT_3
tired_type = 0 / h_mode_show_type = 0 → 不注入
```

**迁移时必须把自动注入的前提显式展开进 TOML premises**（我们引擎无运行时注入，静态数据语义等价）：
- 新 CSV 的 premise_set 只抄显式部分，自动注入部分按上表补写（禁止只抄 premise_set 导致漏前提）
- `h_mode_show_type=1` 同时映射到我们的 modes（默认 exploration）；`=2` 映射到 modes=['h_scene']
  （loader 已按 category=sex 处理）——modes 与 NOT_H/TARGET_IS_H 前提双保险
- 三个新增前提的语义与注册状态见 premise-h.ts：
  - `TIRED_LE_74`：玩家疲劳 ≤118（tired_type=2 用，与 TIRED_LE_84 的 ≤134 区分）
  - `NOT_SHOW_NON_H_IN_HIDDEN_SEX`：隐奸全局开关取反（未实装 → 恒 true = erArk 默认值）
  - `DRUNK_LEVEL_NOT_3`：醉酒等级≠3（醉酒系统未实装 → 恒 true = 语义正确降级）
- 批次清单的"前提依赖状态"表新增一列 `h_mode_show_type / tired_type`，标注自动注入展开

---

## 5. 耗时（time_cost）——-1 是特殊信号，必须查 handler

| 来源 | 取值 |
|------|------|
| `Behavior_Data.csv` 的 duration > 0 | 直接用作 `time_cost` |
| duration ≤ 0（-1）| **禁止照抄**。去 `handle_instruct.py` 查该 behavior 的处理函数里 `duration = N` 的真实值（如 wait→5, wait_1_hour→60）|
| 特殊流程（sleep 跨天、make_food 面板）| 标注 TODO，批内登记"特殊耗时需 handler"，暂不写死 |

> ⚠️ 旧脚本 `scripts/convert-erark-instructions.cjs` 把 -1 照抄进 TOML，是错的（时间不推进），不要学。

---

## 6. 实行判定（judge_base + judge_class）——最关键的决策

### 6.1 三问决策（每条指令必答）

```
Q1: 该指令的 handler 在 handle_instruct.py 里有没有显式 judge 参数？
    （形如：chara_handle_instruct_common_settle(Behavior.XX, judge = _("初级骚扰"))）
    没有 → 无判定。不写 judge_base / judge_class。✅ 完成本节
    有 ↓

Q2: 该判定名在 h-config.toml 的 [judge.adjustments] 表里有条目吗？
    （表 = 有特殊条件修正的判定族：性交/A性交/W性交/U性交/U开发/口交/道具/药物/SM/初级骚扰/严重骚扰/亲吻）
    没有 → 只写 judge_base。✅ 完成本节
    有 ↓

Q3: 写 judge_base + judge_class（= 该判定名）
```

### 6.2 judge_base 怎么定

| 情况 | 取值 |
|------|------|
| 该指令在 eratw 有对应 COMF | 以 eratw 的 V 值为相对难度参照，按 类内锚点比例 换算（见批次清单的"判定四列"）|
| eratw 无对应（催眠/时停等）| 直接用 erArk 判定类基准值 |

**判定类基准值**（erArk 12 类，查 `InstructJudge.csv`）：
```
初级骚扰=200 | 严重骚扰=600 | 亲吻=250 | 性交=500 | A性交=700
W性交=800 | U开发=700 | U性交=900 | 口交=450 | 道具=400 | 药物=600 | SM=700
```

> ⚠️ 判定名对照（handle_instruct.py 的 judge 参数 ↔ CSV，**逐条查证版**）：
> - **初级骚扰(200)** 13个：拥抱/摸头/摸胸/摸臀/摸耳/摸角/摸尾/摸环/摸翅膀/摸触手/摸小车/牵手/膝枕
>   （其中摸角/摸尾/摸环/摸翅膀/摸触手/摸小车 = 已砍的特殊特征指令，仅记录）
> - **严重骚扰(600)** 23个：掀裙/索要胖次/索要袜子/邀浴/索要钥匙/摸阴蒂/摸阴/摸肛/挤奶/远程玩具系列(10+)
> - **亲吻(250)** 2个：亲吻/H中亲吻 | **性交(500)** 14个：12体位+刺激G点+子宫口爱抚
> - **A性交(700)** 14个：12体位肛交+刺激乙状结肠+刺激阴道 | **W性交(800)** 26个：子宫/宫颈各体位
> - **U开发(700)** 3个：尿道指入/尿道棉棒/采尿器 | **U性交(900)** 12个：尿道各体位（均为已砍的尿道指令，仅记录）
> - **口交(450)** 6个：口交/手交口交/乳交/专注口交/清洁口交/六九 | **道具(400)** 6个：乳头夹/阴蒂夹/跳蛋插入/肛跳蛋/拉珠/榨乳机
> - **药物(600)** 5个：媚药/利尿剂×2/安眠药/克罗米芬 | **SM(700)** 6个：深喉/灌肠×2/鞭打/针/安全蜡烛
>
> ⚠️ **部位实现范围**：尿道(U)/兽部(F) **明确不做**（无属性/无感度）。处理方式（已确认，写进 master-list）：
> - **19 条尿道指令直接砍掉**（尿道姦 12 体位/尿道指姦/尿道棉棒/采尿器/命令小便）——标"砍掉（尿道不做）"，数据与判定类均不保留
> - **8 条特殊身体特征指令砍掉**（摸角/摸尾巴/摸光环/摸翅膀/摸触手/摸小车 + 尾交/蹭角/蹭耳，均依赖 TARGET_HAVE_* 特征前提）——标"砍掉（特殊特征不做）"
> - **摸耳朵保留**（无 TARGET_HAVE_EARS 前提，普通指令）
> - **告白（confession）**：依赖恋爱系统（前提 TARGET_LOVE_2 + HAVE_RING），**延后**——标"延后（依赖恋爱系统）"
> - 判定类对照表中的 U开发/U性交 仅为记录参考，**不进入批次**
>
> ⚠️ 注意：手交(HANDJOB)/摸肛等**无 judge 参数**（无判定）；摸阴蒂/摸阴属于**严重骚扰**而非初级骚扰。
> CSV 中另有 8 个判定名**不由 handle_instruct.py 调用**（告白300/约会150/访客留下600/H模式350/戴上项圈300/目击H后被话术支开200/群交600/隐奸550/露出500）——它们是其他系统（H模式/群交/隐奸面板）的判定，**写指令时不用**。

**类内锚点换算**（方案 A：独立值 + eratw 相对难度）：
- 每类选一个代表性指令作锚点（如初级骚扰类锚点=拥抱：eratw V=15 ↔ erArk 200，比例 ≈13.3:1）
- 类内其他指令按 eratw V 值比例换算：`judge_base = 锚点erark值 × (本指令eratwV / 锚点eratwV)`
- 换算结果与 erArk 类值差太多时，清单标注"需人工确认"
- 换算只保"相对难度序正确"，不追求绝对精确——最终值就是我们的值

### 6.3 judge_class 是什么、什么时候写

**定义**：judge_class = 该指令所属的"判定族"（erArk 判定名），是 calcJudge 查 h-config 特殊修正表的 **key**。

- 它不是分类标签（category/sub_category/tags 都是描述性的，供 UI 用）
- 它是**计算输入**：只有"有特殊条件修正需要按族区分"时才需要
- 无判定的指令、判定族不在 adjustments 表里的指令 → **不写**

### 6.4 特殊修正表（h-config.toml `[judge.adjustments]`）

```toml
[judge.adjustments]
"性交" = [
  { condition = "target.阴道处女 == 1", value = -250 },
  { condition = "target.月经周期 == 1", value = -50 },
]
"A性交" = [
  { condition = "target.肛门处女 == 1", value = -350 },
]
# 处女惩罚（erArk instuct_judege.py）：性交-250 / A性交-350 / W性交-400 / U性交-400 / 口交-125
# 月经周期（同上）：安全期-10 / 普通-50 / 危险-200 / 极危-300
# 体位喜欢（同上）：性交/A性交/U性交/W性交 +30（当前体位=喜好体位时）
```

- 表内容从 erArk `instuct_judege.py` 逐行翻译（铁律：公式结构不可简化）
- 条件表达式用现有系统，`target` = 被判定角色（实现时给判定上下文加 target 前缀）
- mod 可覆盖数值；**未实装的修正项**（爱情旅馆/他人存在/助理/体位/监禁睡眠）→ 在表中留 TODO 注释，不写死
- **覆盖语义**：hConfig 走 deepMerge，数组**整表替换**——mod 覆盖某判定族时须重写该族全部条目（或引用插件默认的整条链）

---

## 7. 位置 tag 对照表（location.tags）

**规则**：只有 erArk 指令自带 `IN_*` 位置前提的才需要 tag；**没有位置前提的指令默认全地点可用，不写**（如 rest/chat/stroke——休息在 erArk 里无位置前提）。

批次清单会累积一张总表（`docs/instruction-replication/location-tags.md`）：

```
erArk 位置前提 → 我们的 location tag 名
IN_BATHROOM   → has_bathroom
IN_KITCHEN    → has_kitchen
IN_DORMITORY_OR_HOTEL → has_bedroom
IN_TOILET_MAN → has_toilet
...
```

写指令时：位置前提从 premises 移除 → 加 `condition = "location.tags.has_xxx == true"`。
写地点时（武侠 mod 地图 TOML）：按总表给地点打 tag（`tags = ["has_kitchen", "has_bedroom"]`）。
`PLACE_FURNITURE_GE_N`（家具数）/ `PLACE_DOOR_*`（门）→ 保留地点字段（furniture_count/door），**不** tag 化。

---

## 8. 效果链（effects）——逐条翻译，禁止合并

> ⚠️ **前置认知：erArk 指令执行 = 效果链 + 自动二段结算**
> erArk 每次指令执行后**自动**跑 `check_second_effect`（`second_behavior.py`）：高潮判定 / 刻印结算 / 体位效果 / 初见判定 / 道具效果。
> **我们引擎已实现自动二段结算**（h-core 监听 `game:execution_end`，对 H 中角色自动跑高潮/刻印/体位判定）——
> **复刻时不要在 TOML 手写这些**，它们由引擎自动触发。

从 `Behavior_Effect.csv` 取该 behavior 的效果链（如 `21 - 12 - CVE_A2_E|80_G_1 - 53 - 55 - 501`），**每个效果 ID 单独一行**，翻译：

### 效果 ID 查询路径（两步，必须照走）

```
第 1 步：ID → 常量名
  Script/Core/constant_effect.py 的 BehaviorEffect 类（628 条）
  例：搜 "ADD_SMALL_HIT_POINT" 附近 → ID 0
第 2 步：常量名 → 公式
  Script/Settle/default.py 搜 "@settle_behavior.add_settle_behavior_effect(constant_effect.BehaviorEffect.XX)"
  → 读该装饰器下的函数体（base_value/add_time 等参数）
```

> ⚠️ `21-效果ID速查表.md` 只覆盖 59 个高频 ID（不到 14%），**只能当辅助**，查不到的一律走上面两步。
>
> ⚠️ **已知未覆盖效果 ID（110 个）**：旧转换脚本 `convert-erark-instructions.cjs` 对以下 ID 无映射（旧产物静默丢弃了这些效果）：
> - **200-299 区间 54 个**（经验/工作类，如 210=绝顶经验）——多为 H 经验/计数效果
> - **400-499 区间 22 个**（H 标志类，如 400=破处剧痛修正）——首次性行为相关
> - **300-399 区间 15 个**（作息/状态标记类）
> - 其余零星（24/82/84/88、991-999、1245、1404-1602）
>
> 处理规则：遇到这些 ID **必须**走两步路径翻译（constant_effect.py 查名 → default.py 查公式），**禁止**沿用旧脚本的静默丢弃行为。翻译不了的登记 TODO。

| erArk 效果 | 我们的 effect |
|-----------|--------------|
| 21 好感度 | `{ type = "settle_favorability" }` |
| 22 信赖度 | `{ type = "settle_trust" }` |
| 11/12/1515/1516 体力/气力 | `{ type = "modify_attribute", params = { attr = "体力/气力", value = -30 } }` |
| 51~58 状态值 | `{ type = "settle_state", params = { state = "好意/屈服/润滑...", baseValue = 30 } }` |
| CVE_A{1,2}_E\|{id}\_G\_{n} | `{ type = "h_experience", params = { expId = "{id}", value = 1 }, condition = "{player/target}.experience.{id} >= {n}" }` |
| 1101+ 第一次 | TODO（h-first-time）|
| 未知/未映射 | **不猜**：标注 TODO + erArk 效果 ID，留 `{ type = "nop" }` 占位或跳过并在清单登记 |

**规则**：
- 每个效果 ID 单独一行，**禁止合并/省略**（如 53+55 不能合成一个）
- baseValue 必须查 `default.py` 确认（chat 的 53 好意=30、1515 体力=-30 等）
- **time_cost 参与结算公式**（`base = tc + bv`）——耗时错误会连带数值错误，务必精确（§5）
- CVE 效果（`CVE_A{1,2}_E|{id}_G_{n}`）：映射为条件经验效果，condition 里 `experience.{id}` 是**经验值**（累计次数），不是等级
- 最后补 `{ type = "trigger_dialogue", params = { scene = "{指令id}" } }` 触发口上

---

## 9. 组装 TOML（最终格式）

```toml
# 位置：src/plugins/h-core/data/default/instructions/{daily|obscenity|sex}.toml
#       （武侠 mod 覆盖：mods/武侠/definitions/instructions/{类型}.toml，同 id 覆盖）

[[instructions]]
id = "stroke"                 # = erArk instruct_id
label = "身体接触"
erark_id = "1005"             # 迁移期字段，全部完成验收后统一删除
erark_behavior = "STROKE"     # 同上
category = "daily"            # 驱动 UI 开关行 + modes
sub_category = ""             # sex 子类才填（foreplay/insert/...）
time_cost = 10                # 查 Behavior_Data + handle_instruct.py（-1 必须查！）
priority = 50
judge_base = 200              # 有判定才写（三问决策）
judge_class = "抚摸骚扰"       # 判定族在 adjustments 表里才写
premises = ["HAVE_TARGET", "NOT_H", "T_NORMAL_56_OR_UNCONSCIOUS_FLAG", "TIRED_LE_84", "HP_G_1"]
# 位置前提已移出 premises，改用：
condition = "location.tags.has_bedroom == true"   # 仅该指令有位置前提时
tags = ["kind:h", "part:hand", "system:h-core"]
effects = [
  { type = "settle_favorability" },
  { type = "modify_attribute", params = { attr = "体力", value = -25 } },
  { type = "settle_state", params = { state = "羞耻", baseValue = 30 } },
  { type = "trigger_dialogue", params = { scene = "stroke" } },
]
```

**字段说明补充**：
- `category` / `sub_category` 是规范字段名（spec §3）；`type` / `sub_type` 是旧别名（test-mod 等既有数据在用），loader 两者皆收、规范名优先
- `judge_base > 0` 时 loader **自动**在 effects 置顶注入 `judge_check`（`{ type = "judge_check", params = { base, judge_class } }`），**不要手写** judge_check
- judge_check 的 target 默认 = 指令目标（`selected`，即 UI 选中角色）
- 缺 `time_cost` / 写了 `judge_class` 没写 `judge_base` → loader 会 warning（批末验收时清掉）
- 单条指令注册失败（如 id 重复）→ 报告 + 跳过该条，不拖垮整批

**加载时校验（`game:plugins_loaded` 事件后自动执行，禁止静默失效）**：
- `condition` 引用未注册字段 → error + 注销该指令（字段须在条件手册中，含结构路径：`location.tags.{tag}` / `character.{id}.talents.{talent}` / `first_times` / `relations` 等；`selected.`/`target.` 归一化为 `character.{id}.` 校验）
- `premises` 引用未注册前提 → warning（去重）；批末验收时确认全部前提已注册（SOP §4 规则 C）
- hConfig `[judge.adjustments]` 修正条件引用未注册字段 → error
- 因校验依赖全部插件的 condition_fields/premises 注册完毕，所以延迟到插件全部 onEnable 之后

---

## 10. 自审清单（每条写完必须逐条过）

- [ ] 每个数值/效果 ID 有 erArk 来源（CSV 行或源码行号）
- [ ] 无判定/有判定判断正确（查了 handle_instruct.py 的 judge 参数）
- [ ] judge_base 有来源；judge_class 只在 adjustments 表有该族时写
- [ ] time_cost 不是照抄 -1
- [ ] 位置前提已转 location.tags，且对照表登记了
- [ ] 未注册前提已注册或已标注
- [ ] 效果链无合并/省略；未知效果已登记 TODO
- [ ] 批次清单文档中该条已勾选"已完成"
- [ ] 无中文属性名硬编码在 TS 代码里（TOML 里中文属性名是正常的）

---

## 11. 批末验收（每批做完统一跑）

1. `npm run typecheck` ✅ 无错误
2. `npm run test` ✅ 全通过（含 calcJudge/加载器测试）
3. `npm run dev` 启动无报错
4. 实测：指令出现在指令栏（前提满足时）、点击执行、数值变化正确、口上触发
5. 更新 `docs/master-todo.md` L1.6 进度
6. 更新 `docs/skills/erark-replication.md` 的"已完成 vs TODO"表

---

## 12. 常见坑（踩过的人血教训）

| 坑 | 正确做法 |
|----|---------|
| duration=-1 照抄 | 查 handle_instruct.py 真实值 |
| 位置前提注册 IN_* handler | 一律 location.tags |
| 未知效果 ID 猜一个 effect | TODO 登记 + nop 占位，不猜 |
| 合并 53+55 为一个效果 | 每个效果 ID 单独一行 |
| 判定失败静默 | 清单标注判定列，批末核对 |
| eratw 有对应但归错类 | 核对 COMF 归属（口交归口交类，不是初级骚扰类）|
| 写中文属性名进 TS 代码 | 用 ATTR 常量 + getEntityAttr |
| 手交(HANDJOB) 以为有判定 | 查 Q1：无 judge 参数 → 不写 judge_base |
| 在 TOML 手写高潮/刻印结算 | 引擎自动二段结算，不要手写 |
| 依赖速查表查效果 | 两步路径：constant_effect.py → default.py 装饰器 |

---

## 13. 相关文档索引

- `docs/skills/erark-replication.md` — 复刻铁律（必读）
- `docs/skills/replicating-an-instruction.md` — **逐条复刻完整验证清单（防静默错误，复刻任何指令前必读）**
- `docs/skills/add-instruction.md` — 添加新指令工作流
- `docs/instruction-replication/instruction-master-list.md` — 全量 404 条粗筛清单
- `docs/instruction-replication/location-tags.md` — 位置 tag 对照总表
- `docs/instruction-replication/batch-NN-*.md` — 各批次清单
- `docs/mod-author-guide.md` — mod 作者指南（含指令效果参数协议）
