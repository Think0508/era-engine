# L1.6 指令复刻设计文档

> 精确复刻 erArk 全部可用指令到 era-engine。本文档整合全部设计决策（含多次 grilling 结论），是实施阶段的权威依据。
> 配套文档：`docs/instruction-replication/migration-workflow.md`（逐条迁移 SOP，实施时必读）

---

## 1. 概述

将 erArk 的 ~404 条指令（InstructConfig.csv）经**粗筛**后复刻为 era-engine 的 TOML 指令数据。核心目标：

- **精确**：每个数值有 erArk 源码可追溯，禁止简化/合并/省略
- **细腻**：每条指令独立实行判定值（以 eratw 相对难度为参照，避免 erArk 的 12 类粗化）
- **可维护**：三层存储 + tag 分类 + SOP 文档化，mod 可覆盖

**依赖**：二段结算（orgasm/eja/涨奶链路）已完成 ✅、h-core 前提系统、effect-system、map-system（location.tags）。

---

## 2. 存储分层（三层架构内）

```
Layer 1 权威副本（插件默认层）: src/plugins/h-core/data/default/instructions/
  daily.toml / obscenity.toml / sex.toml / ...
  → 复刻全集，与 attributes/abilities/talents 同层

Layer 3 mod 覆盖:            mods/武侠/definitions/instructions/
  → 同 id 覆盖差异 + 新增武侠专属指令
```

**引擎改动**：mod-loader 支持从插件默认层加载 `instructions/` + 指令按 id 去重（mod 胜出）。

---

## 3. 指令 schema（HInstruction 扩展）

```toml
[[instructions]]
id = "stroke"                 # = erArk instruct_id
label = "身体接触"
erark_id = "1005"             # 迁移期字段（全部完成后删除）
erark_behavior = "STROKE"     # 迁移期字段（全部完成后删除）
category = "daily"            # 驱动 UI 开关行 + modes
sub_category = ""             # sex 子类才填（foreplay/insert/...）
time_cost = 10                # 查 Behavior_Data + handle_instruct.py（-1 必须查！）
priority = 50
judge_base = 200              # 有判定才写（三问决策）
judge_class = "初级骚扰"       # 判定族在 adjustments 表里才写
premises = ["HAVE_TARGET", "NOT_H", ...]
condition = "location.tags.has_bedroom == true"   # 仅该指令有位置前提时
tags = ["kind:h", "part:hand", "system:h-core"]
effects = [ ... ]
```

### 新增字段说明

| 字段 | 用途 | 生命周期 |
|------|------|---------|
| `erark_id` / `erark_behavior` | 迁移期追溯锚点（对应 06/07/08 文档 + CSV）| 全部批次验收后**统一删除** |
| `judge_base` | 每条指令独立实行判定值 | 永久 |
| `judge_class` | 判定族名（驱动 hConfig adjustments 表特殊修正）| 永久 |
| `tags` | 多标签（system:/kind:/part:）| 永久 |

---

## 4. 分类体系

```
category（UI 开关行，量大才独立）：daily（含原 play/work 通用）/ obscenity / sex / system / custom
tags（细分类，任意组合）：
  kind:play、kind:work、kind:h（foreplay/wait_upon/insert/item/drug/sm）
  system:h-core、system:hypnosis、system:time_stop、system:hidden、system:group_sex、system:bondage
  part:mouth、part:hand、part:genital...
```

**三机制分工**（核心架构决策）：

```
category/tag        → 静态分类：UI 分组、批量管理、插件启停过滤
premises/condition  → 动态显隐：好感度、时间、H状态（"现在能不能用"）
location.tags       → 位置适配：地点声明支持哪些活动（"这个地点支不支持"）
```

**排序**：分类开关行 → H 内按 sub_category 流程分组（前戏→侍奉→插入→道具→药物→SM）→ 组内 priority + 配置顺序。

**分类修正**（grilling 结论）：work/arts 不作为独立分类——WORK 只留通用几条（训练/治疗/授课/维修/种植/调酒/野外委托）并入 daily，ARTS 23 条全部归对应 H 插件 tag（催眠/时停）。

---

## 5. 实行判定方案（方案 A：独立值 + eratw 相对难度 + erArk 骨架）

### 5.1 公式

保留 erArk `calcJudge` 八项修正骨架（**已修复**：ATTR 常量/阈值表从 hConfig/二元判定/补接线处女/月经/催眠修正）。

### 5.2 judge_base 取值（每批清单"判定四列"）

```
第 1 步：判定类基准值不变（查 InstructJudge.csv）——实际使用 10 个（尿道类不用）：
  初级骚扰=200 | 严重骚扰=600 | 亲吻=250 | 性交=500 | A性交=700
  W性交=800 | 口交=450 | 道具=400 | 药物=600 | SM=700
  （U开发=700 / U性交=900 仅 erArk 记录，尿道不做，不进入批次）
第 2 步：类内按 eratw 相对难度序差异化（类内锚点比例换算，只取相对序）
第 3 步：eratw 无对应的指令 → 直接用类基准值
```

> ⚠️ 判定名对照（handle_instruct.py judge 参数 ↔ CSV，**逐条查证版**）见 `migration-workflow.md` §6。
> ⚠️ **部位实现范围**：尿道(U)/兽部(F) **明确不做**（无属性/无感度）。处理方式（已确认）：
> - **19 条尿道指令直接砍掉**（尿道姦 12 体位/尿道指姦/尿道棉棒/采尿器/命令小便）——master-list 标"砍掉（尿道不做）"，数据与判定类均不保留
> - **8 条特殊身体特征指令砍掉**（摸角/摸尾巴/摸光环/摸翅膀/摸触手/摸小车 + 尾交/蹭角/蹭耳，均依赖 TARGET_HAVE_* 特征前提：兽人角尾翅/光环/触手/坐骑）——master-list 标"砍掉（特殊特征不做）"
> - **摸耳朵保留**（无 TARGET_HAVE_EARS 前提，普通指令）
> - **告白（confession）**：依赖恋爱系统（前提 TARGET_LOVE_2 + HAVE_RING），**延后**——master-list 标"延后（依赖恋爱系统）"
> - 判定类对照表中的 U开发/U性交 仅为记录参考，**不进入批次**
> 另有 8 个判定名（告白/约会/访客留下/H模式/戴上项圈/目击H后被话术支开/群交/隐奸/露出）**不由 handle_instruct.py 调用**，写指令不用。

### 5.3 judge_class 与特殊修正

**三问决策**（每条指令必答）：

```
Q1: handler 有显式 judge 参数？否 → 不写 judge_base/judge_class
Q2: 判定族在 hConfig [judge.adjustments] 表有条目？否 → 只写 judge_base
Q3: 写 judge_base + judge_class（= 判定名）
```

**h-config.toml 新增**（数据化，mod 可覆盖；条件表达式复用现有系统，`target`=被判定角色）：

```toml
[judge.adjustments]
"性交" = [
  { condition = "target.阴道处女 == 1", value = -250 },
  { condition = "target.月经周期 == 1", value = -50 },
]
"A性交" = [ { condition = "target.肛门处女 == 1", value = -350 } ]
# 处女惩罚：性交-250 / A性交-350 / W性交-400 / U性交-400 / 口交-125（erArk instuct_judege.py）
# 月经周期：安全期-10 / 普通-50 / 危险-200 / 极危-300
# 体位喜欢：性交/A性交/U性交/W性交 +30（当前体位=喜好体位时）
```

**未实装依赖的修正项**（爱情旅馆/他人存在/助理/监禁睡眠）→ 表中留 TODO 注释，不写死。

---

## 6. 前提处理（按需并入每批）

| 情况 | 处理 |
|------|------|
| 已在 premiseRegistry 注册 | 直接留在 premises |
| 未注册且是位置（IN_*/POSITION_IN_*）| **从 premises 移除** → `condition = "location.tags.has_xxx == true"` |
| 未注册非位置 | 从 erArk handle_premise_*.py 查语义 → 注册 handler |

**规则**：
- 位置前提一律 location.tags，**禁止**注册 IN_* handler
- 现有 8 个 IN_* handler（location.type 判断）迁移为 tags 检查
- PLACE_FURNITURE_GE_N / PLACE_DOOR_* → 保留地点字段（furniture_count/door），不 tag 化

---

## 7. 位置 tag 对照表

**规则**：只有 erArk 指令自带 `IN_*` 位置前提的才需要 tag；**没有位置前提的指令默认全地点可用，不写**（如 rest/chat/stroke）。

批次清单累积总表 → `docs/instruction-replication/location-tags.md`：

```
erArk 位置前提 → 我们的 location tag 名
IN_BATHROOM   → has_bathroom
IN_KITCHEN    → has_kitchen
IN_DORMITORY_OR_HOTEL → has_bedroom
...
```

写地点时（武侠 mod 地图 TOML）：按总表打 tag。现有 8 个 IN_* handler 迁移为 tags 检查。

---

## 8. 分批计划

### 第 0 步：粗筛（最先做）

产出 `docs/instruction-replication/instruction-master-list.md`：**全量 404 条清单**（id/名称/类型/建议 保留|砍掉|延后 + 理由）。用户审一遍标注决定。粗筛维度：

- 方舟世界观专属（干员招聘/基建/外交/PRTS/载具等）
- 依赖未实装系统（监狱/育儿/香薰/膨胀/透视）
- 标"未实装"的（collcet_panty/ask_date/drink_alcohol 等）
- 编码损坏（IN_CAFÉ 等）
- **尿道不做**（19 条：尿道姦 12 体位/尿道指姦/尿道棉棒/采尿器/命令小便）
- **特殊身体特征不做**（8 条：摸角/摸尾/摸环/摸翅/摸触手/摸小车 + 尾交/蹭角/蹭耳）
- **恋爱系统延后**（告白，前提 TARGET_LOVE_2 + HAVE_RING）

预计砍 ~180 条（含尿道 19 + 特征 8），剩 ~220 条进入批次。**此清单为批次规划权威依据**。

### 批次（基于粗筛结果）

| 批次 | 范围 | 说明 |
|------|------|------|
| B1 | daily 保留项 ~30 | 含 play 通用几条（唱歌/读书/下棋/品酒等）|
| B2 | obscenity 保留项 ~50 | |
| B3-B6 | sex 子类 | **延后**至 H 场景 UI 就绪（200 条按 8 子类拆分：base/foreplay/wait_upon/insert/item/drug/sm/arts）|
| 顺带 | work 通用几条 | 训练/授课/种植/调酒/野外委托，随批次归入 |

### 每批工作流

```
1. 我出批次清单 docs/instruction-replication/batch-NN-{cat}.md
   （判定四列/前提依赖状态/效果ID映射/time_cost核对/位置tag对照表，参照 SOP）
2. 你筛选（基于 master-list 的保留项）
3. 逐条引入：我写 TOML + 按需注册前提，你审核数值与依赖
4. 批末验收：npm run typecheck && npm run test + dev 实测
5. 累积位置 tag 对照表
```

---

## 9. 效果链翻译

**两步路径**（必须照走，速查表只覆盖 59/428 个 ID，仅辅助）：

```
第 1 步：ID → 常量名（Script/Core/constant_effect.py BehaviorEffect 类）
第 2 步：常量名 → 公式（Script/Settle/default.py @settle_behavior.add_settle_behavior_effect 装饰器）
```

**规则**：
- 每个效果 ID 单独一行，禁止合并/省略
- baseValue 必须查 default.py 确认
- time_cost 参与结算公式（base = tc + bv），务必精确
- CVE 效果 → h_experience + condition（experience.{id} 是经验值非等级）
- 未知/未映射 → TODO 登记 + nop 占位，不猜
- **已知 110 个旧脚本未覆盖 ID**（200-299 经验类 54 个/400-499 H标志 22 个等）→ 必须走两步路径翻译，禁止沿用旧脚本的静默丢弃

**二段结算**：引擎自动（已完成），**不要在 TOML 手写**高潮/刻印结算。

---

## 10. 前置改动清单（B1 开工前一次做完）

1. **loader 收敛**：`h-instructions/` + `instructions/` 合并为 `instructions/` 单路径；支持插件默认层；按 id 去重（mod 胜出）；`h_` 前缀理顺
2. **引擎耗时机制**：time_cost 支持特殊耗时（wait=5、sleep=跨天跳转，查 handle_instruct.py）
3. **HInstruction 接口扩展**：erark_id/erark_behavior/judge_base/judge_class/tags；加载器自动注入 judge_check
4. **judge_check/calcJudge 对接**：judge_class 查 hConfig adjustments 表（calcJudge 签名含 judgeClass）
5. **位置前提迁移**：现有 8 个 IN_* handler → location.tags 检查
6. **UI 分类开关**：CommandBar availableCategories 动态收集（daily/play/obscenity/sex/system）
7. **清理**：归档 `mods/_erark_source/`（367 条旧产物：缺 judge_base、有 _unknown 效果、前提未注册）

---

## 10.1 标准角色契约（B1 剩余迁移前必做，2026-08-08 定稿）

> 前置背景：chat 试点复刻全程暴露 6+ 次"属性/字段契约不明确"导致的静默错误（'心理快感' 死键、
> '皮肤感度' 映射、mark_13 数字键、'orgasm_total' 无人写等）。B1 剩余 23 条 + B2 37 条迁移前
> 必须先固化角色数据契约——消除静默错误 + 让 mod 作者明确字段的可删/必填/可加/可改边界与默认值。
> 执行顺序：**契约先行（本计划）→ 迁移指令（§8 批次）**，串行。

### 10.1.1 目标与产物

- **目标**：① "代码引用 ≠ 数据定义"从排查半天变为扫描即报；② mod 作者角色字段字典
  （必填/可选(默认值)/可扩展/禁止 + 删了会怎样 + 不写默认是多少）；③ 迁移零撞墙的**属性对账表**
  （以我们迁移的属性字段为权威——erArk 用到的字段我们可能改名了或用别的方式处理了，
  迁移时查表即知"这个 erArk 字段我们怎么处理的"）
- **产物**：
  - `docs/character-schema.md`（权威契约，10 节，见 10.1.4）
  - `docs/instruction-replication/erark-attr-ledger.md`（对账表，见 10.1.7）
  - `docs/mod-author-guide.md` 增加"角色字段速查"节（交叉引用）
  - 扫描脚本 ×2：`scripts/scan-attr-refs.cjs`（TS 引用）/ `scripts/scan-erark-defs.cjs`（引用对账）
  - `scripts/erark-name-map.json`（改名映射表，扫描输入）
  - `attributes.toml` / `abilities.toml` 补键（对账确认"遗漏"且需要补的）
  - 引擎校验落地：mod-loader 加载校验 + save-system 存档补齐 + test-helpers 契约化

### 10.1.2 设计决策（grilling 定稿，全部确认）

| # | 决策 | 结论 |
|---|------|------|
| 1 | 契约范围 | **文档 + 引擎校验落地**（非纯文档） |
| 2 | 校验方式 | **双向**：attributes.toml 为定义权威 + 引擎引用扫描比对（引用未定义属性 = 契约违规） |
| 3 | 扫描三层 | ① TS 代码引用（现在全量）② 迁移增量校验（进 SOP，每条指令迁移时核对属性存在）③ **erArk 引用对账（以我们迁移的属性字段为权威，方向修正 2026-08-08）**——erArk 字段我们可能改名/替代处理/有意删减，对账发现"遗漏"（erArk 引用而我们无对应） |
| 4 | 产物两分 | 定义契约（属性/能力/状态/经验）+ 实体结构契约（h_state/sp_flag/body_items/equipment/experience/action_info/dirty） |
| 5 | 最小必需集 | **严格档**（异常级+静默失效级结构性字段，缺失必须显式处理）用于校验；**全量**（49 属性 default）用于角色创建/存档补齐初始化 |
| 6 | mod 作者视角 | 字段字典（命名空间分组：必填/可选(默认)/可扩展/禁止）+ 场景索引（删了影响结算/条件/展示/无）；**默认值必须标注** |
| 7 | mod 扩展规则 | 新属性必须经 `definitions/attributes.toml` 定义；**角色数据禁止裸字段**（未定义键 → warning） |
| 8 | 文档形态 | 单文件 `docs/character-schema.md` + mod-author-guide 交叉引用；表格列 = 字段/类型/默认值/必填性/读取方/缺失影响 |
| 9 | 对账判定 | **四类**：已对齐（含改名映射）/ 替代处理（结构差异或换机制表达）/ 有意删减（已筛掉，理由）/ **遗漏**（迁移会撞墙——扫描自动标记"引用无对应"，**归入哪类由人工确认**，脚本判定不了设计决策） |
| 10 | 改名映射 | erArk 原名 → 我们名（肛肠→后穴、心理快感→心理、胸→胸部…），正反向记录，作扫描输入 + 文档"改名记录"节 |
| 11 | 校验落点 | a. mod-loader 角色加载（结构性必需缺失/裸字段 → warning+建议，不阻止加载）b. save-system 读档缺必需 → attributes default 补齐 + warning c. test-helpers 基座按契约补全 + 一致性校验测试 |
| 12 | 调试命令 | `@schema` 运行时查字段字典 → **延后**（非必做） |
| 13 | 对账表生命周期 | 与 `erark_id` 字段同生命周期：迁移期全程保留，**spec §11 收尾（批量删 erark_id）时一并归档**——对账表是过程性知识，schema 是结果性权威；未来 erArk 更新走"diff CSV → 对照 schema"承接，不需要历史对账表 |

### 10.1.3 实施步骤（7 步，验收后回到 §8 批次）

```
Step 1  名称映射表：erArk 名 ↔ 我们名（正反向），产出 erark-name-map.json + 文档改名记录节
Step 2  第 1 层扫描：TS 中文属性字面量 + ATTR.XXX 展开 vs attributes.toml → 违规清单 → 修复 → 重扫至 0
Step 3  第 3 层引用对账：erArk 定义全集为骨架 + 228 保留指令效果链引用为遗漏抓取源
        （B 为主 A 为骨架）→ 产出 erark-attr-ledger.md（四类判定，遗漏行人工确认归类）
        → 确认"遗漏且需要补"的补定义（含 erArk 默认值）；已删减的标注理由（防误补）
Step 4  文档 docs/character-schema.md（10 节）+ mod-author-guide 速查节 + erark-attr-ledger.md 对账表
Step 5  校验落地：mod-loader 加载校验 + save-system 存档补齐 + test-helpers 契约化
Step 6  测试：加载校验（裸字段/缺必需 warning）/存档补齐/基座一致性/扫描脚本自测
Step 7  验收：typecheck + 全量测试全过；扫描 0 违规；对账表四类齐备、遗漏 0 或全部人工确认；
        test-mod 按契约写示范角色（验证 mod 作者流程）
```

### 10.1.4 character-schema.md 结构（10 节）

1. 角色实体结构总览（命名空间树）
2. 属性定义契约（每字段：类型/默认值/分类/读取方/缺失影响/可删性）
3. 能力/天赋/状态/经验契约
4. 实体结构契约（h_state/sp_flag/body_items/equipment/experience/action_info/dirty 字段表）
5. 最小必需集（异常级 + 静默失效级，缺失必须显式处理）
6. 字段字典（按命名空间：必填/可选(默认)/可扩展/禁止）
7. 场景索引（删了影响：结算/条件/展示/无）
8. mod 扩展规则（新属性经 attributes.toml；禁止裸字段）
9. 校验规则（加载/存档/测试基座）
10. 改名记录（erArk ↔ 我们）

### 10.1.5 验收标准

- 第 1/3 层扫描报告 0 违规
- character-schema.md 覆盖全部属性（含默认值/读取方/缺失影响/可删性）
- erark-attr-ledger.md 对账表四类齐备（已对齐/替代处理/有意删减/遗漏），遗漏 0 或全部人工确认
- mod-loader 校验测试（裸字段 warning/缺必需 warning）、save-system 补齐测试、test-helpers 一致性测试
- test-mod 示范角色走通加载/校验/结算（验证 mod 作者流程流畅性，不混入武侠内容创作决策）

### 10.1.7 erark-attr-ledger.md 对账表结构

> 迁移期对照字典（生命周期 = 迁移期，§11 收尾与 erark_id 一并归档）。
> 以我们迁移的属性字段为权威；erArk 字段可能改名/替代处理/有意删减，对账发现遗漏。

```
表格列：erArk 字段 | 来源（CharacterState/Experience/Ability/CharacterTalent） | 处理方式 | 归类 | 说明
归类四类：
  已对齐   — 直接对应（含改名映射，指向映射表）
  替代处理 — 结构差异或换机制表达（如 好感度 字典→单值；某状态→条件路径/前提），指向实现位置
  有意删减 — 手动过滤掉的（世界观/系统未实装/简化），标注理由（防误补——激素教训）
  遗漏     — erArk 引用而我们无对应（扫描自动标记，人工确认归类；需补的进 attributes/abilities）
骨架 = erArk 定义全集（A）；遗漏抓取源 = 228 保留指令效果链引用（B，经映射表归一）
```

### 10.1.6 风险与依赖

- 映射表完整性：漏映射 → 误判"遗漏" → Step 1 人工核对一遍 erArk 名 vs 我们名
- Step 3 工作量：脚本化为主 + 人工抽查关键效果链（43 条 orgasm 链已有同类提取先例）；
  对账表"遗漏"行的归类判定是设计决策，必须人工过（脚本只负责标记）
- 校验落地副作用：test-mod 既有角色可能裸字段 → warning → 顺带清理（暴露既有问题，符合契约目的）
- 范围外（登记不做）：`@schema` 调试命令延后；武侠 mod 内容起步在 B1 之后

---

## 11. 收尾（B 系列完成后）

- 移除 `erark_id`/`erark_behavior` 字段（批量）
- 更新 add-instruction.md、erark-replication.md、master-todo L1.6 ✅
- 更新 `docs/instruction-replication/location-tags.md` 总表

---

## 12. 已完成的依赖（本次会话）

| 项 | 状态 |
|----|------|
| 二段结算（orgasm_judge/orgasm_settle/寸止/解放/extra/B绝顶/饮精）| ✅ 完成，263 测试通过 |
| 射精链路（eja_climax 忍耐判定/7乘数/被射者精液/shoot_position_body/扣减/重置插入）| ✅ 完成 |
| 涨奶（pregnancy.milk + 泌乳天赋生命周期）| ✅ 完成 |
| 睡眠额外精液 + 每日首射标记 + 浓厚精液天赋 | ✅ 完成 |
| 属性对齐（射精欲/额外精液量；移除虚构 eja_decay）| ✅ 完成 |
| orgasm_edge_on/off effect | ✅ 完成 |

---

## 13. 关键决策记录（grilling 结论）

| # | 决策 | 结论 |
|---|------|------|
| 1 | judge_base 体系 | 方案 A：独立值 + eratw 相对难度序 + erArk 骨架 |
| 2 | calcJudge | 保留 erArk 八项修正；阈值表从 hConfig；二元判定（无 partial）|
| 3 | sex 批次 | 延后至 H 场景 UI 就绪 |
| 4 | time_cost -1 | 先做引擎耗时机制（handler 自定义耗时）|
| 5 | 前提 | 按批清点；位置前提→location.tags |
| 6 | work/arts | 砍分类，通用几条并入 daily+tag |
| 7 | 粗筛 | 先出全量 404 条 master-list |
| 8 | 排序 | 分类+子类流程+配置顺序 |
| 9 | 锚点字段 | 迁移期字段，完成后删除 |
| 10 | 存储 | h-core/data/default/instructions + mod 覆盖 |
| 11 | 二段结算 | 引擎自动（先做完避免依赖地狱）|
| 12 | 判定弹窗/射精面板 UI | 延后（依赖 UI 机制）|
| 13 | 尿道/兽部 | 明确不做：尿道 19 条砍掉、特殊特征 8 条砍掉、摸耳朵保留、告白延后（恋爱系统）|
| 14 | 成就/人力发电 | 明确不做 |
