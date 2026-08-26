---
name: replicating-instruction-batches
description: Use when continuing erArk instruction replication across batches — batch filtering + user-in-the-loop per-instruction flow, quick-reference table maintenance, condition engine migration, and generic 口上 (talk) skeleton policy. One instruction at a time; never batch-write instructions.
---

# 继续复刻 erArk 指令（批次工作流 + 口上骨架 + 条件引擎迁移）

> 沉淀自 chat(1004) 试点与 stroke(1005) 完整复刻。配套必读：
> `docs/skills/replicating-an-instruction.md`（单条数值/静默错误清单）
> `docs/instruction-replication/migration-workflow.md`（SOP）
> `docs/instruction-replication/filter-quick-reference.md`（筛选速查表）
> `docs/instruction-replication/completed-instructions.md`（完成速查表）

## 1. 核心原则

1. **逐条、用户下令、用户检查**：绝不批量写指令。每次只复刻用户点名的一条；交付后等用户反复检查、确认，再等下一个命令。
2. **筛选与执行分离**：批次候选池先由用户手动筛选；AI 只做“明显非通用原生”预筛并给理由，最终筛选权在用户。
3. **每个数值必须有 erArk 源码可追溯**（CSV 行或源码行号），禁止猜测/简化/合并。
4. **条件必须改写为我们条件引擎的形式**，禁止照抄 erArk 前提串（`IN_*`、`CVP_*`、`sys_0&...` 等原语法不得直接进 TOML）。
5. **通用口上不做“原文搬运”**：AI 生成的长文本/同前提多条重复文本不保留，改用「示例 + 占位符」骨架，并注释前提含义。
6. **复刻前依赖检查（硬性门槛）**：动手写任何一条指令前，必须检查该指令在**当前引擎中是否真的能用**——前提是否已注册且真语义、效果/API/属性依赖是否已实装、正常游玩是否有触发路径（不是“能显示”的空壳）。任一缺失 → 停下来让用户确认是否先做前置，禁止用硬注册/恒 true/简化近似绕过。

## 2. 批次工作流

```
批次候选池（master-list / keep-list）
  → ① AI 预筛（只剔除“很明显不适合通用原生”的面板/派生子系统，给理由）
  → ② 用户手动筛选（暂不想要/低优先级/非原生/派生子系统/依赖其他系统/不需要）
  → ③ 更新筛选速查表（保留/延后/剔除/已完成 + 原因）
  → ④ 用户逐条下令：只说“复刻 xxx”才动那条
  → ⑤ 依赖检查（前提/效果/可玩性；前置缺失 → 停下问用户是否先做前置）
  → ⑥ 单条复刻，交付四件产物
  → ⑦ 用户反复检查 → 确认后更新完成速查表
  → ⑧ 用户下令下一条 → 批末验收后进入下一批候选池
```

**筛选口径（用户明确）**：
- 只有**方舟世界观专属**才算“剔除”。
- 因对应系统未实装而暂时不能做的，一律归“**延后**”，不是剔除。
- 通用但依赖未来地点的（如 exercise 依赖 `has_gym`）→ 延后。
- 口上文本中的方舟世界观内容：chat 用占位符、stroke 直接移除；**不用原文**。具体按该批用户决策执行。

## 3. 双速查表（状态唯一来源）

### 筛选速查表 `filter-quick-reference.md`
- 每批筛选后更新。
- 列：批次 | 分类 | 所属系统 | cid | id | 名称 | 筛选结论 | 剔除/延后原因。
- 表尾统计：原 N → 已完成 X → 保留 Y → 延后 Z → 剔除 K。

### 完成速查表 `completed-instructions.md`
- 每条经用户确认后**立即追加一行**。
- 列：批次 | 分类/子类 | cid | id | 名称 | 所属系统 | 通用口上 | 测试 | 特殊处理 | 状态。
- 表前统计看板随批次更新。

## 4. 单条复刻产物（依赖检查 + 四件）

0. **依赖检查结论表**：该指令要显示/可用的前提（premise/condition）是否已注册且真语义；效果/API/属性依赖是否已实装；正常游玩是否有触发路径。任一缺失 → 停下问用户是否先做前置，不进入后续产物。
1. **数值取证表**：InstructConfig 原行（含 h_mode_show_type/tired_type）、Behavior_Data duration（-1 必须查 handle_instruct.py）、Behavior_Effect 全链逐 ID、judge 三问结论、default.py/constant_effect.py 公式行号。
2. **条件迁移表**：原 premise_set → 我们引擎最终形式；每个前提的注册状态/语义来源/自己 or 目标维度；未实装子系统 TODO；自动注入展开（h_mode_show_type / tired_type）。
3. **TOML + 通用口上**：指令落 `native-instructions/data/default/instructions/`（通用日常）或所属系统插件；口上落 `talk-common-system/data/default/talk-common/behavior/{daily|work|play}/{id}.toml`。
4. **测试 + 速查表**：测试参照 `instruction-chat.test.ts` / `instruction-stroke.test.ts`；用户确认后更新完成表。

## 5. 条件迁移铁律（严格按我们条件引擎）

- 输出只允许三种形式：
  - `premises = ["已注册前提ID", ...]`（等价 `premise(X) && ...`）；
  - `condition = "表达式"`（字段必须存在于条件手册）；
  - `modes`（表达 H 模式显示：h_mode_show_type=1 → exploration；=2 → ['h_scene']）。
- 位置前提（`IN_*`/`POSITION_IN_*`）→ `location.tags.has_xxx == true`，禁止注册 `IN_*` handler。
- `T_` 前缀查目标，无前缀查自己；对照 handler 函数体确认语义对象。
- 复杂判断（分支/计数/算术）→ 注册专用 effect handler（chat_settle 先例），不在 TOML 写算术。
- 自动注入前提静态展开：`h_mode_show_type=1` → `NOT_H` + `NOT_SHOW_NON_H_IN_HIDDEN_SEX`；`tired_type=1/2` → `TIRED_LE_84/74` + `HP_G_1` + `DRUNK_LEVEL_NOT_3`。
- 口上条件同理：`premise(high_1)`、`premise(favorability_ge_3)`、`premise(TARGET_NOT_FALLEN)` 等。

## 6. 通用口上骨架规范（stroke 沉淀）

1. **不搬运 erArk 原文**：同前提多条、语义重复的长文本（尤其“博士”长文）判断为 AI 生成 → 不保留；只保留简短、通用、可作示例的句子。
2. **每组 1 示例 + 1 占位符**：每个前提组最多保留 1 条示例 + 1 条占位符。两条而非一条，是为了提醒后续编辑者“这里可以写多条，让随机/权重生效”。
3. **占位符格式**：「{中文指令名}指令通用口上 N」，N 连续编号。
4. **每组必须注释**：
   - erArk 原前提名与含义（如 `sys_1&sys_4` = NPC 主动对玩家身体接触）；
   - 我们条件引擎的写法（如 `premise(NPC_INITIATED) && premise(TARGET_IS_PLAYER)`）；
   - 若原条目带 CVP 等复杂条件，说明等价映射（如 `CVP_A2_G_E_n` → `FALL_LEVEL_E_n`）。
5. **可读前提名优先**：新口上 TOML 用 `NPC_INITIATED` / `TARGET_IS_PLAYER` / `TARGET_NOT_FALLEN`，erArk 原名（`sys_1`/`sys_4`/`not_fall`）只在注释里说明。遇到新语义前提时，注册可读别名并在口上里使用。
6. **世界观内容不保留**：方舟名词（源石/博士/罗德岛/哥伦比亚等）直接移除或按用户决策占位，不写入默认层。

## 7. 测试与验收

- 单条测试必须含：效果链全 ID 数值断言（最终值）、前提矩阵、口上触发、无世界观残留、无 error。
- 口上文件必须通过 `talk-common-data.test.ts` 全量校验（解析/前提注册/表达式校验）。
- 批末（用户宣布）：`npm run typecheck` + `npm run test` 全绿；`npm run check:catalog` 通过；更新 master-todo L1.6 与 `docs/skills/erark-replication.md` 进度。

## 8. 常见坑

| 坑 | 正确做法 |
|---|---|
| 批量写多条指令 | 等用户逐条下令，一次一条 |
| 把“系统未实装”标成剔除 | 归延后；只有方舟世界观专属才剔除 |
| 照抄 erArk premise_set / CVP | 按条件引擎改写 |
| 搬运 AI 长文本口上 | 骨架化：1 示例 + 1 占位 + 注释 |
| 口上条件用 `sys_1` 这类原名 | 用可读别名，原名写注释 |
| 世界观口上升级为占位符或保留 | 按用户对该批的决策（chat 占位 / stroke 移除） |
| 前置缺失仍硬注册/恒 true/简化近似 | 停下问用户是否先做前置；完整前置系统实装后再复刻该指令 |
| 忘了更新速查表 | 筛选后更新 filter 表，确认后更新 completed 表 |

## 9. 相关文档索引

- `docs/skills/replicating-an-instruction.md` — 单条复刻完整验证清单
- `docs/instruction-replication/migration-workflow.md` — SOP
- `docs/instruction-replication/filter-quick-reference.md` / `completed-instructions.md` — 双速查表
- `docs/instruction-replication/instruction-master-list.md` / `instruction-keep-list.md` — 批次数据源
- `docs/instruction-replication/location-tags.md` — 位置 tag 总表