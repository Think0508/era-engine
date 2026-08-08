# 口上系统完整复刻设计（erArk 对齐）

> 2026-08-08 定稿。目标：完整复刻 erArk 口上系统全部 7 项机制（用户确认全要）。
> 配套：`docs/instruction-replication/migration-workflow.md`（指令 SOP）、`docs/dialogue-format.md`（口上格式规范）。

## 1. 目标机制清单

| # | 机制 | erArk 实现 | 我们的实现方案 | 依赖 |
|---|------|-----------|---------------|------|
| 1 | 权重选择 | 权重区间随机（random.choices）| 同池竞争 + 权重区间随机 | 无 |
| 2 | high_N 权重前提 | high_1/2/5/10/999 = 权重值 | premiseRegistry.getWeight 支持 | 无 |
| 3 | CVP 综合数值前提 | 运行时解析 18 类型 | **静态转换已实现**（convertCVPPremise），T2 补缺口 | 无 |
| 4 | 纸娃娃行为地文 + 混合率 | {行为id} → A/B1/B2/C1/C2 拼接；draw_setting[13] 混合 | 行为多段组合 + hConfig 混合率 + weight≥100 保护 | 数据已迁移 ✓ |
| 5 | 无意识/口球屏蔽 | 无意识只放 unconscious 前提口上；口球禁口上 | 时停部分现在做；睡眠/口球随 L1.7/B3 | L1.7/B3 |
| 6 | 版本化口上 | 文件名 `_N` 后缀 + character_text_version | version 字段 + 实体字段 | 无 |
| 7 | 特殊情境加权 ×5 | 硬编码 9 类 | **数据化**（hConfig 情境前提表），默认对齐 9 类 | 各 H 系统 |

## 2. 现状盘点（查证 2026-08-08）

**已迁移**（scripts/convert-erark-talk-common.cjs）：
- action_A/B1/B2/C1/C2（penis_in_13部位 + v_orgasm）、body/（14 部位）、body_part/（13 部位 + common_s）
- 格式：TOML variable + entries（conditions="premises:xxx" / 表达式）+ parts（body_part 用）
- CVP 静态转换：T/S/A → 表达式（ID→名字映射表）、G → premises:FALL_LEVEL_{cmp}_{val}；零残留
- 引擎已有：variable 查找、parts 拼接、replaceAll 循环展开、mod 覆盖

**缺口**：
1. 行为 ID → 多段组合索引缺失（{penis_in_vagina} 无法展开）
2. 混合率未接入 triggerScene；**weight≥100 不替换保护缺失**（erArk talk.py:246）
3. FALL_LEVEL 前提只注册 GE_1~4；getFallLevel 死键（数字键查按名存储的 talents）
4. 转换脚本缺 NE 运算符（当前数据零 NE，仅未来生效）
5. 无意识/口球屏蔽、版本化、特殊情境加权未做
6. high_1/high_999 前提当前当布尔用（权重语义未实现）
7. 口上选择模型：目前通用+专属都输出；erArk 是同池竞争（专属×10）

## 3. 分阶段计划

### T1 权重系统（无依赖）
- premiseRegistry.getWeight(premises, ctx)：high_N → N，其余满足 +1（erArk weight_all_to_1 语义）
- 口上行 schema：scene_lines/character_lines 加 `weight = N`（静态权重，等价 CVP_Weight 固定）
- triggerScene 重构为**同池竞争**：scene_lines + character_lines 合并候选池 → 条件筛选 → 权重计算（前提权重 + 静态 weight）→ 角色专属 ×10 → 权重区间随机选一
- 修复 high_1~high_999 注册（权重值，非布尔）
- 测试：权重分布统计（high_999 几乎必选/2:1 分布/专属×10）

### T2 CVP 静态转换补全（无依赖，不重跑数据）
- premise-fall.ts 重构：getFallLevel 按名查（思慕→爱侣 1-4 / 屈从→奴隶 -1~-4，erArk minus_flag）；注册通用 FALL_LEVEL_{cmp}_{val}（G/L/E/GE/LE × 任意值）
- 转换脚本补 NE → !=（仅未来生效）
- 全量数据校验测试：扫描 talk-common 全部 conditions → premises: 前提可解析 + 表达式 validateExpression

### T3 纸娃娃行为地文 + 混合率（数据已迁移）
- engine 加行为多段组合：行为 ID → [action_A, action_B1, action_B2, action_C1, action_C2] 按 erArk 顺序拼接（动作段间换行），短词池合并 common_s（erArk talk_common_judge 语义）
- triggerScene 混合率：有口上时按 hConfig talk.common_mix_rate（默认 30，对齐 draw_setting[13]×10%）随机替换为行为地文；**weight ≥100 不替换**（erArk :246 保护）
- 无口上时直接出行为地文（替换现有兜底）
- 测试：组合顺序/短词池/混合率统计/≥100 保护

### T4 版本化口上（无依赖）
- scene_lines/character_lines 加 `version = N`；实体字段 character_text_version（默认 1，0=不启用）
- 运行时：通用（v1）+ 角色当前版本组合；测试：版本选择

### T5 无意识/口球屏蔽（时停部分现在做）
- triggerScene：目标无意识（unconscious_h===3）→ 只输出带 unconscious 前提的口上；talk_common 部位类跳过（erArk :683-687）
- 睡眠（L1.7）/口球（B3）落地后补全

### T6 特殊情境加权（可判部分现在做）
- 机制数据化：hConfig `[talk.situation_weights]`（情境前提集合 → 倍率），默认对齐 erArk 9 类
- 现在注册：逆推（npc_active_h）/浴室 H（h_in_bathroom）/爱情旅馆（h_in_love_hotel）；其余随系统
- 测试：加权生效 + 默认配置对齐

## 4. 架构决策（用户确认）

| 决策 | 结论 |
|------|------|
| 权重表达 | 完整复刻（high_N 前提权重 + 固定权重），静态 weight 字段作语法糖 |
| CVP 对接 | 尊重既有静态转换方案，T2 只补缺口（不造运行时解析器） |
| 数据迁移 | 纸娃娃地文已迁移不重跑（零 NE/零残留）；角色口上不迁（机制全迁） |
| 口上选择模型 | 改为 erArk 同池竞争（通用+专属合并候选池，专属×10） |
| 特殊情境 | 数据化配置（优于 erArk 硬编码） |
| 混合率保护 | weight≥100 不替换（对齐 erArk talk.py:246） |
| 手改防护 | 地文手改放 mod 覆盖层；转换脚本不重跑 |

## 5. 测试策略

- 权重类：统计断言（多次抽样分布）+ 可复现
- 数据校验：全量扫描（前提可解析 + 表达式可校验）——把静默失效变成加载即报错
- 每 phase：单元 + 集成（triggerScene 端到端）
