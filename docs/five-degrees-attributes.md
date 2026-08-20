# 五「度」角色属性 · 设计裁定与研究记录

> **状态：设计研究结论（grill 定稿）。机制层已定死，数值规律/内容层 half-percent——挂 TODO，**
> **等「角色性格系数」前置后才会实际落地数值。本文只是设计依据，不是实现，勿据此直接开工数值实现。**
>
> 前置依赖：**角色性格系数系统（未做）**。
> 相关文档：`docs/attributes-system.md`（属性系统全链路）、`docs/relation-system.md`（关系 v2）、
> `docs/counter-system.md`（计数器 + 半成品范式）、`docs/h-mark.md`（刻印）、`docs/adr/0016-counter-system.md`。
> 登记：`docs/master-todo.md` → L3 推迟池。
> 实施计划：`docs/superpowers/plans/2026-08-21-five-degrees-wiring.md`（机制通电小步，2026-08-21）。

---

## 一、目标（一句）

打赢敌人后，**威胁 / 绑架 / 哄骗** 等指令以 5 个数值角色属性为「前提」与「结算」基础；
这 5 个属性像好感度一样：**角色所有、per-NPC 全局、永久累计、单调不降**。

## 二、五度清单与归属

| 度 | 归属 | 现状 | 语义（裁定） | 条件路径示例 |
|----|------|------|--------------|-------------|
| 好感度 | 复用 `entity.social.好感度`（cap 100000，hConfig 阈值表已有） | ✅ 现成 | NPC 对玩家/世界的亲近 | `character.{id}.好感度 >= N` |
| 信赖度 | 复用 `entity.social.信赖度`（cap 300） | ✅ 现成 | NPC 对玩家的信赖 | `character.{id}.信赖度 >= N` |
| 屈服度 | **新增** social 属性 | ❌ 无 | 被胁迫/调教累积的顺从（**镜像总账**，见 §五） | `character.{id}.屈服度 >= N` |
| 软弱度 | **新增** social 属性 | ❌ 无 | 被击败/被威胁/负面累积的软弱 | `character.{id}.软弱度 >= N` |
| 欲望度 | **新增** social 属性 | ❌ 无 | 性格/习惯层面的好色倾向（与 欲望值/欲望/欲情 切割） | `character.{id}.欲望度 >= N` |

> ⚠️ **切割声明**（防近义键混乱）：引擎已有三个「欲望」——`欲望值`（base 当前欲求池，绝顶会扣）、
> `欲望`（ABL 永久等级，影响欲情系数）、`欲情`（params 每日重置）。**欲望度是第 4 个新概念**，
> 只表达"性格倾向"，与三者互不干扰。

## 三、机制裁定（已定死的锚点）

| # | 决策点 | 裁定 |
|---|--------|------|
| 1 | 载体 | **属性**：`category = "social"`，每 NPC 一个全局值 |
| 2 | 方向 | 面向玩家的全局值；**不走 relations 定向**（排除 A→B 拆分） |
| 3 | 单调性 | 一律**单调不降、永久累计**；与「欲望值（会被绝顶消耗的池）」明确切割 |
| 4 | 耦合 | **独立平行轴**：语义互不推导；「一条指令同时改多度」仅是内容层 effects 行为，不是机制耦合 |
| 5 | 屈服度口径 | 屈服刻印**一行不动**（仍读每日 `params.屈服+恭顺+羞耻/5`）；「度」= 同族发射流的**镜像永久总账**（换算系数槽 = 预留 pending） |
| 6 | 公式需求 | 常规加值用 `modify_attribute` **固定数**；复杂/带性格系数 → **专属 effect（公式在代码里）**；不立项 effect 数值表达式 DSL |
| 7 | 权威治理 | 指令条件只读 social 好感/信赖（canonical）；`relations.{target}.好感度`（sentiment）仅作**关系面板/称呼显示** |
| 8 | 落地节奏 | 机制定形、数值规律 half-percent + TODO；等「角色性格系数」前置 |

## 四、两个原始问题的答复

### Q1 怕重复造轮子？

不会。两个现成载体都已核实：

- **属性**（`src/plugins/h-core/data/default/attributes.toml` + `src/core/entity-utils.ts`）：social 永久数值、
  参与结算公式、条件路径 `character.{id}.xxx >= N`、`getLevel` 派生等级、`level_thresholds` —— "像好感度的度"就是它。
- **counter-system**（`docs/counter-system.md`）：声明式 number 计数器 + 视图 + ADR-0016「不双写、存量靠视图暴露」。
  其 `pending = true` 半成品范式可直接当「度管线 TODO」模板。

要新建的不是引擎机制，而是 **5 个属性定义 + 新指令内容 + 一座发射桥**。

### Q2 屈服刻印的形成流程里有没有发射点？有

```
指令 effects → settle_state(屈服/恭顺/羞耻) → params.{...}（每日）
   ↓ game:execution_end / game:new_day
h-mark checkOne：getCheckValue = 当前(屈服+恭顺+羞耻/5) vs 阈值 [30000,50000,100000]
   → abilities.屈服刻印.level++（并抬 顺从 ABL 下限）
```

发射点 = `src/plugins/h-core/settle/state-settle.ts` 的 `settleOneState`/`applyStateChange`
（所有 +状态 指令的必经点）。在此"顺便换算输出一份给屈服度"即本设计的镜像方案（§五）。

- **软弱度候选发射点**：`combat:end`（打赢判定）+ 负面 params（恐怖/苦痛/抑郁/反感）流。
- **欲望度候选发射点**：H/绝顶/性经历流——counter-system 现有 `orgasm_total` 视图读 `experience.20` 可作临时账。

## 五、屈服度 ↔ 刻印 的模型（镜像总账）

```
params.屈服/恭顺/羞耻    ← 照旧（h-mark 该读啥读啥，刻印升级逻辑一行不动）
     │ （同一发射点：settle_state 的那一行；以及未来 威胁/胁迫 指令的 effects）
     ▼
 屈服度 += 换算(本次发射值)   ← 换算系数 = 预留系数槽（待「角色性格」前置）
```

- **度 = 这族发射流的永久镜像总账；刻印 = 每日窗口的等级读数。同源、互不冲突。**
- "已有 LV3 屈服刻印 + 屈服度 0" 从机制上不可能出现（度累积的就是形成刻印的那条流）。

## 六、桥契约（现在定，数值后补）

一座统一的「度累加通道」，杜绝作者散写：

1. **发射源声明**（每度一项）：流镜像（如 settle_state 的 屈服/恭顺/羞耻）/ 事件（如 `combat:end`）/ 指令 effects 显式 add。
2. **统一累加通道**：建议一个 effect（如 `accumulate_degrees` / `modify_degree`）或事件，作者不散写。
3. **换算系数槽**：每度一个 `conversion`（pending）；公式进专属 effect 或性格系统。
4. **pending 通电姿势**：`attributes.toml` 先声明 5 属性 `default = 0, display = false`
   （schema/条件字典立即就位），管线标 pending——沿用 counter-system `pending = true` 语义：
   已声明但未接线，条件路径不注册 / warning 一次；事件实现后去掉 pending 即激活。

> ✅ **本步已通电（2026-08-21，机制通电小步）**：3 个新属性已声明
> （`src/plugins/h-core/data/default/attributes.toml`，social/默认0/display=false，条件路径即注册）；
> `accumulate_degrees` 效果（h-core 注册）+ `settle/degree.ts` 统一累加通道已实现（单调不降、
> 换算系数槽恒 1）；h-core API `accumulateDegree` 作为跨插件唯一累加入口。
> 数值规律 / settle 镜像挂钩 / 内容层指令集仍挂 TODO（等性格系数前置）。

## 七、治理规则（future ADR 候选）

1. **social 权威**：好感/信赖的「度判断」只读 `entity.social`；`relations` sentiment 仅服务关系面板/称呼。
2. **单调不降**：永久累计、只增不减。
3. **独立平行**：各度语义互不推导；联改仅是内容层行为。
4. **不双写**：每度单一 canonical 存储；既有存储（刻印 level / params）不搬家，度 = 镜像或新轴。

## 八、TODO / 后置清单（本设计明确不实现）

> 已登记 `docs/master-todo.md` L3「五度属性」条目，编号 T1–T5（未做）/ T0（已完成）：
> **T0 机制通电已完成（2026-08-21，含属性声明 + `accumulate_degrees` 通道）。**

1. **T1 角色性格系数系统**（最大前置，决定全部数值落地；目前 0 设计）。
2. **T2 各度换算系数 / 数值规律 / 阈值表**（落地点：`settle/degree.ts` 的 `DEGREE_CONVERSIONS` 槽）。
3. **T3 settle 镜像挂钩**（屈服度 = 发射流镜像总账，发射点在 `settle/state-settle.ts` / `game:execution_end`）。
4. **T4 `combat:end` 软弱度挂钩**（打赢判定喂 软弱度）。
5. **T5 内容层**：打赢后的 **威胁 / 绑架 / 哄骗** 指令集（前提 / 结算 / 后果 / 失败路径）。

## 九、附：已核实引用（实现依据）

| 机制 | 位置 |
|------|------|
| 好感度/信赖度/欲望值/欲情/欲望 属性定义 | `src/plugins/h-core/data/default/attributes.toml`（好感度 L77、信赖度 L78、欲望值 L24、欲情 L62、欲望 L99） |
| 好感/信赖 cap | `src/core/entity-utils.ts` L171-172 |
| 屈服刻印阈值（30000/50000/100000）与升级触发 | `src/plugins/h-mark/index.ts` L29-37、L142-167、L174-194（屈服 = 屈服+恭顺+羞耻/5，L182） |
| 状态结算管线（+屈服 必经点） | `src/plugins/h-core/settle/state-settle.ts` `settleOneState` L166-255 / `applyStateChange` L147-154 |
| 好感/信赖公式 | `src/plugins/h-core/settle/favorability.ts`（calcFavorability L38-59、getFavorabilityLevel L66-73、getTrustLevel L76-83） |
| modify_attribute/set_attribute value 只收数字 | `src/plugins/effect-system/index.ts` L29-70（条件引擎亦禁算术：`src/core/condition-engine.ts`） |
| 计数器半成品范式（pending=true）+ 不双写哲学 | `docs/counter-system.md` §六 / `docs/adr/0016-counter-system.md`（L23「不做成表达式语言」） |
| 关系 v2 好感度（sentiment）与 social 并存 | `docs/relation-system.md` L14、L23-25；`src/plugins/h-core/premise/premise-h.ts` L146-160（NPC→玩家读 npc 自身 value） |
