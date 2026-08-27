# ADR-0016: 计数器系统（counter-system）— 独立插件 + 混合边界 + 声明式事件驱动

## 背景

成就系统、各种统计、内容脚本都需要计数器。对账 erArk（Python 版 era 游戏）发现：**erArk 没有独立的计数器系统**——计数散落在五处（`character.experience` 数组 / `dirty.body_semen[part][3]` 累计 / `h_state.orgasm_count` H 会话计数 / 全局 `cache.achievement` 结构体 / `first_record` 初次记录）。其中 `body_semen[part] = [名, 当前量, 等级, 总量]` 的"总量"与 `experience` 各索引（部位绝顶 10-17、射精 21 等）是跨 H 持久累计；`h_state.orgasm_count[part] = [当次, 本次H累计]` **每次 H 结束清零**。此外，erArk 免责声明明确"不会出现 NTR"——用户需求的 NTR/夫目前/轮/按男角色分条等**无蓝本**，属自设计。

本引擎此前已复刻了 experience / body_semen / first_records / H 内 record（achievement.*_record）等散装计数；成就判定由 gain-rule-system（条件驱动）承担。

## 问题

1. erArk 的计数无统一系统：成就条件要引用互不相干的路径（`experience.14`、`body_semen.6.3`、`achievement.hidden_sex_record.4`……），无统一视图；每加一个计数器 = 新系统手写存储 + 事件监听 + 条件注册 + UI，不可扩展。
2. 用户需求（H 过的人名单、按男角色分条精液/插入/绝顶、NTR 等）超出 erArk 现有能力——需要新数据模型（分条/名单/初始值）。
3. 已有散装机制**不是纯计数器**：experience 驱动成长与口上前提、body_semen[当前量] 驱动等级与吸收、h_state 是 H 状态机一部分——强行收编会破坏内聚与 erArk 对齐可追溯性。

## 决策

**新建独立插件 `src/plugins/counter-system/`，混合边界**：

1. **混合**：存量机制（experience/body_semen/first_records/h_state/各 H 内 record）保持散装不动；纯统计/记录进新系统。分界原则："机制内嵌且参与游戏逻辑的保持散装；纯统计、供成就/UI/内容查询的进统一系统"。
2. **视图/别名机制**：存量数据不搬家、只注册只读视图（`source` / `map`）统一暴露——杜绝双写（双写必然不同步，本项目反复踩过的坑）。
3. **三种计数器类型**：`number`（数值）/ `list`（去重名单 + 初始数字）/ `group_table`（嵌套分组表：dim1 → dim2 → 字段；**存储不限深度，维度由声明 dims 定义**）。
4. **声明式**：`counters.toml`（插件默认层 `data/default/` + mod `definitions/`，按 id 去重，mod 胜出）；`[[counters]]` 声明计数器、`[[views]]` 声明视图；未注册路径在条件里报错（与 attributes.toml/condition-registry 同构）。
5. **事件驱动为主**：监听现有标准事件（h:shoot/h:start/relation:*），旧指令零改动；`counter_add` effect 补充特殊语义。声明 DSL 边界（防膨胀）：计数目标 = payload.target（可 target_from 覆盖）、add/dims = payload 字段直取或常量、复杂判定（性别过滤）走内置参数——**不做成表达式语言**。
6. **分组表初始值**：角色可选字段 → 创建条目时**快照**进保留键 `__meta`（`{ count, named[], field_init{} }`，置于分组表根部与条目隔离）。读数两个：**总数**（含初始）/ **真实值**（路径加 `.real` 段，减初始且具名去重）。具名初始（named）是真实个体 id，游戏内再出现不重复计数；纯数字初始与具名可组合，作者约定不重叠。
7. **惰性创建**：角色实体无 counters 字段不预建（500 NPC 零开销）；分组表条目首次命中才建。
8. **条件接入**：core condition-engine 加通用**代理域注册表**（`registerProxyDomain`）——quest 域"core 特判 + apiSystem 转发"先例的通用化；counter-system 注册 `counters` 根域，路径 `counters.{charId}.{counterOrView}.{dims...} / .real.{dims...}`。core 不认知域内具体内容，只做路由。
9. **半成品机制**：字段声明 `pending = true`（依赖未实现事件）→ 加载 warning + 条件路径不注册 + 监听跳过。曾用 `male_stats.inserts`（h:insert）作 pending 示例；2026-08-26 SEX/insert 批次已实现 `h:insert` 并激活该字段。
10. **事件扩展**：`h:orgasm` 补 sourceId、新增 `h:insert` 事件——已在 2026-08-26 insert 批次补齐（h-core emit 点 `// TODO(counter-system)` 标记相应移除）；`h:end` 补 participants 仍延后至群交重写。群交路径整体重写后再验证覆盖（机制不改）。

## 原因

1. **混合边界**：存量机制内聚且与 erArk 对齐（代码大量引用 erArk 行号），收编 = 破坏可追溯性 + 存档迁移风险；用户明确"不要影响代码架构"。新计数器全部进统一系统，未来扩展只改 TOML。
2. **声明式 + 视图**：符合本项目"加载期校验、反静默失效、UI 可自动渲染"三条价值观；聚合逻辑集中在声明（改口径只改一处）。
3. **事件驱动**：结算层 emit（eja_climax/orgasmJudge），覆盖面 = 结算链（与指令数量无关）；效果驱动需改每个指令 effects 且易漏写。
4. **代理域**：与 quest 域先例一致（core 特判 + API 转发），core 不认知具体计数器名，符合三层铁律。
5. **惰性 + 快照**：性能（500 NPC）与一致性（防角色字段误改导致统计漂移）双保证。

## 参考

- `src/plugins/counter-system/`（实现）、`docs/counter-system.md`（声明语法/初始值规则）
- `docs/skills/replicating-an-instruction.md`（指令复刻批次对照计数器需要的检查清单）
- erArk：`Script/Core/game_type.py`（DIRTY/ACHIEVEMENT/BODY_H_STATE）、`Script/UI/Panel/achievement_panel.py`、`data/csv/Experience.csv`
