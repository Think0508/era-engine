# era-baseline 属于核心层（ADR 0013）

2026-08-15 决策。记录"core 不认任何属性名"铁律的准确边界——era-baseline 机制与数据属于核心层，三层分离保护的对象是具体 mod 内容而非 era 通用框架。

## 背景

AGENTS.md 的架构铁律写"引擎 core 层：纯通用机制，零世界观/零内容/零美术，不认任何属性名"。实际代码中 `src/core/` 存在大量类 era 机制：`entity-utils.ts` 的完整属性字典（体力/气力/阴蒂/精液量/射精欲/刻印…）、`realtime-settle.ts`（疲劳/饥饿/尿意/精液/射精欲实时结算）、`juel-settle.ts`（宝珠睡眠转换）、`upgrade-needs.ts`（need 语义）、`character-contract.ts`（h_state/body_items 等运行时键）、`condition-registry.ts` 的 body_parts/body_semen 结构路径、`mod-loader.ts` 的 H 指令/HConfig/body_slot schema。

2026-08-15 架构审查（improve-codebase-architecture 全量审计）将这些标记为层违规候选。逐条 grill 后定案：**这是误读铁律**。

## 决策

### D1 era-baseline = 引擎核心的一部分

"类 era 的底层框架"（属性字典、实时结算、宝珠、need 语义、H 运行时键、H 内容 schema）**是核心**，因为它们对**任意 era-like mod**（武侠同人 ERA、哈利波特、仙侠…）都是同一套要用的引擎框架。第一目标模组（武侠）与后续模组共享的正是这一层。铁律"不认任何属性名"的语义是：

- core **不认具体 mod 内容**（令狐冲/华山剑法/思过崖/某个 mod 独有的属性）；
- core **认 era 通用基线**（体力/射精欲/宝珠/体位等——所有 era-like 世界通用或可通用的机制）。

### D2 三层分离的真实含义

| 层 | 内容 |
|----|------|
| core（含 era-baseline） | 通用机制 + 类 era 框架：属性字典、实时结算、事件总线、条件引擎、存档、模板、mod 加载、era 内容 schema |
| plugins | 具体玩法框架（combat/quest/dialogue/h-core…）+ 插件默认数据（可被 mod override） |
| mods | 具体肉：角色、口上、世界观、专属指令（纯 TOML） |

切换 mod 时 core 层代码不动；plugins 层按 meta.toml 依赖启用；mods 只提供数据。

### D3 本 ADR 之后的有效约束

- core 不得出现**具体 mod 内容**（某 mod 的角色/地点/任务/属性名——除非属 era 通用基线）；
- core 不依赖 plugins/ui（修掉 plugin-manager 对 ui 的类型导入等真违规）；
- plugins 不互相 import（跨插件通信走 API/事件总线）——此约束**不变**；
- 属性常量集中在 `entity-utils.ts`（ATTR 表）作为插件引用属性的唯一途径——插件代码禁止裸写中文属性字符串（B 类清扫继续执行）。

## 影响

- 未来架构审查不再把 D1 列出的文件标为层违规；
- 已记录的 ATTRIBUTE 名称、era 机制模块保持现状（不搬出 core）；
- mod-loader 的 schema 债（2500 行 god file）仍属**代码组织**问题，独立于本 ADR 处理（拆分不移动）。
