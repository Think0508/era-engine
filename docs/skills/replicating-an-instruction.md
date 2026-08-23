---
name: replicating-an-instruction
description: Use when replicating an erArk instruction (TOML data + effects + premises) into era-engine, one instruction at a time — check for silent errors where "registered"≠"semantically correct" and "executed"≠"effects applied"
---

# 完整准确复刻一条 erArk 指令

> 沉淀自 chat(1004) 复刻全程（8 轮审查、20+ 静默问题）。chat 证明：**注册了 ≠ 语义对；执行了 ≠ 效果对**。
> 配套：`docs/instruction-replication/migration-workflow.md`（SOP，逐条操作）+ `batch-01-daily.md`（批次清单格式）。

> 批次工作流（筛选→逐条下令→完成表）与通用口上骨架规范见 `docs/skills/replicating-instruction-batches.md`；本文件专注单条指令的数值/静默错误检查。
## 核心原则

1. **每个数值必须有 erArk 源码可追溯**（CSV 行/源码行号），禁止凭记忆/猜测/简化/合并
2. **加任何 erArk 数据前先查 master-list**——被砍的世界观内容（方舟专属/未实装系统）**不许补回**
   （教训：擅自补回"博士信息素"3 个天赋定义，用户发现后才撤销）
3. **前提"自己/目标"维度**：erArk 无 `T_`/`TARGET_` 前缀的前提查**自己**（发起者），有前缀查目标
   （教训：NOT_H/TIRED_LE_84/HP_G_1 原实现查目标，玩家在 H/濒死/疲劳爆表时指令错误显示）
4. **"执行了"要验证到数值**：测试必须断言效果后的具体数值，不满足"测试全绿"标准

## 阶段 1：取证（数据源）

| 数据 | 来源 | 特别注意 |
|------|------|---------|
| 指令本体 | InstructConfig.csv 原行 | premise_set 原样抄入 |
| 耗时 | Behavior_Data.csv duration | **-1 必须查 handle_instruct.py 真实值**（wait→5、sleep→跨天） |
| 效果链 | Behavior_Effect.csv | 逐 ID，禁止合并省略 |
| handler 特殊逻辑 | handle_instruct.py | 分支/talk_count/特殊耗时/judge 参数 |
| 前提语义 | handle_premise/*.py | **核对"自己/目标"维度**（看函数体 `cache.character_data[character_id]`=自己 vs `target_character_id`=目标） |
| 效果公式 | constant_effect.py（ID→常量名）→ default.py/common_default.py（装饰器→公式） | baseValue 必须查默认值（settle_state 默认 30） |

## 阶段 2：判定四列（SOP §6 三问）

- Q1 handler 有显式 judge 参数？否 → 不写 judge_base/judge_class
- Q2 判定族在 hConfig `[judge.adjustments]` 表？否 → 只写 judge_base
- Q3 写 judge_base + judge_class

## 阶段 3：前提三规则 + 语义对象核对

1. 已注册 → 留（**并核对 handler 语义对象**：查自己还是目标）
2. 位置（IN_*/POSITION_IN_*）→ 移除 premises，改 `condition = "location.tags.has_xxx == true"`
3. 未注册非位置 → 查 erArk 语义 → 注册 handler（未实装子系统留 TODO 注释，不假装实现）

**被砍世界观内容清单**（master-list:543 提及）：监禁/爱情旅馆/乱伦/服从值/透视/激素/香薰/收藏/监狱/育儿/载具/外交/人力发电——这些系统的数据一律不补。

## 阶段 4：效果翻译（两步路径）

- 每个效果 ID 单独一行；`CVE_A{1,2}_E|{id}_G_{n}` 的 `n` 是**增量**不是阈值
- 复合效果（如 501 TALK_ADD_ADJUST）→ 注册精确复刻效果（talk_add_adjust 模式），不拆近似
- 分支/算术（如 `talk_count > 话术+1`）→ 条件引擎不支持算术 → 注册分支效果（chat_settle 模式），链作为 effect_blocks 参数传入（TOML 内联表不能跨行）
- 判定退缩时**所有**效果跳过（含 h_experience——canApply 门控）；**不手写** judge_check/高潮/刻印（引擎自动）

## 阶段 5：验证（防静默错误——chat 最大教训）

### 5.1 数值断言
每个效果在测试里断言**具体数值**（含能力/天赋/状态修正后的最终值），并对照 erArk 浮点行为（Python `int()` ≈ JS `Math.floor()`，`1-4×0.2` → 6 而非 7）。

### 5.2 门控可观测
效果"执行了但数值没变"→ 查 `[settle-gate]` console.debug（dead/时停门控输出）；不是门控 → 查 `_targetIds` 是否被污染（嵌套链里 target='self' 效果会 Object.assign 覆盖共享 execCtx——无 target 效果必须读 initialTargetIds）。

### 5.3 事件链路真实
测试 stub 的 `engine.emit` **必须转发真实 eventBus**（产品路径 bridge→gameContext.emit→eventBus），否则 execution_start/end 被吞——衰减监听器/二段结算测不到（chat 曾因 stub no-op 产生测试盲区）。

### 5.4 测试隔离
实体重置用共享基座 `src/utils/test-helpers.ts` 的 `resetCharacterEntity`（**全字段**：base/abilities/talents/hypnosis/sp_flag/dead/body_items/h_state/experience/action_info）——漏 sp_flag 会让时停测试污染后续全部（chat 血泪）。

### 5.5 前提真实求值
UI 求值路径 = `createCommandEvaluators`（command-eval.ts）→ conditionEngine 真实 handler。测试直接调 conditionEngine.evaluate 断言前提行为矩阵（含玩家/目标同字段对比）。

### 5.6 时间语义
advanceTime 先于 effects 执行；行动开始时刻 = execution_start 时的 gameContext.time（未推进）；衰减/计数读开始时刻。

### 5.7 计数器对照（counter-system 接线点）
复刻每条指令时，检查其结算链是否触发**需要计数的事件**、payload 是否够——这是 counter-system
（ADR-0016）事件扩展与指令复刻批次的对照点：

1. **结算链 → 事件**：这条指令的 effects 是否走 `eja_climax`/`orgasmJudge`（→ `h:shoot`/`h:orgasm`）、
   H 会话管理（→ `h:start`/`h:end`）？走则事件自动发出，counter-system 自动累计，**无需写计数 effect**。
2. **payload 核对**：事件 payload 是否含 counter-system 需要的字段（`character`/`target`/`position`/
   `amount`……）？缺 → 在 h-core emit 点补字段并更新其 `// TODO(counter-system)` 标记（当前缺口：
   `h:orgasm` 缺 `sourceId`、`h:end` 缺参与者列表、插入动作未实现 `h:insert`）。
3. **半成品激活**：补好事件后，把 `data/default/counters.toml` 里对应字段的 `pending = true`
   去掉（如插入系统的 `inserts` 字段）——条件路径自动注册，无需改代码。
4. **语义对照**：erArk 指令的效果链（如 ADD_SMALL_P_FEEL/二段绝顶）是否产生"应被计数"
   的语义（射精/插入/绝顶/露出场景人数……）——对照 `experience`/`body_semen` 既有累计与
   counter-system 视图，避免重复计数（同一语义只在一处累计：机制内的散装 + 新统计走 counter）。

## 常见静默错误速查

| 症状 | 根因 | 排查 |
|------|------|------|
| 效果执行但数值没变 | 门控 continue（dead/时停/退缩） | `[settle-gate]` debug；_judgeResult |
| 结算到错误目标 | handlerCtx 污染 _targetIds | 无 target 效果读 initialTargetIds |
| 前提"注册了"但行为不对 | 自己/目标查错对象 | 核对 T_ 前缀 + 函数体 |
| 测试全绿但链路没测 | engine.emit stub no-op | 转发 eventBus |
| 换测试后成功链全挂 | reset 漏字段 | 共享基座全字段重置 |
| 效果永不触发 | 被砍内容补回/死键（数字键查按名存的 abilities/talents） | 查 master-list；按名查 |
| 浮点差 1 | JS floor vs 预期 | 对照 erArk int() 行为 |

## 阶段 6：文档（AGENTS 铁律）

- 新效果类型 → `docs/mod-author-guide.md`「指令效果参数协议」登记参数语义
- 批次清单勾选「已完成」+ master-todo / erark-replication 更新
- 收尾验证：`npm run typecheck && npm run test` + dev 冒烟
