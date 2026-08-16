# ADR-0015: 时停素质门槛 — 彻底无门槛（erArk 分级设计未实装）

## 背景

erArk 定义三级时停素质（Talent.csv）：
- 316 窄域时停（初级）：可开时停，但时停中不能移动
- 317 广域时停（中级）：时停中可自由移动（TIME_STOP_JUDGE_FOR_MOVE 前提）
- 318 精确时停（高级）：描述为"实装中"（未实装）

前提代码（handle_premise_arts.py:934-976）读取 `talent[316/317/318]`。

## 问题

全量检索 erArk 源码与数据表发现：
1. `TalentGain.csv`（素质获得表，gain_type 0 随时/1 手动/2 指令/3 睡觉）**无 316-318 任何条目**
2. 全部源码无 `talent[316/317/318] = 1` 赋值（初始素质/创建流程/升级路径均无）
3. 318 描述自标"实装中"

结论：erArk 的时停分级是**有定义、无获得途径**的未完成设计——严格复刻门槛会使玩家永远无法获得时停素质，整个时停系统实际不可玩。

## 决策

**彻底无门槛**：`PRIMARY_TIME_STOP` / `INTERMEDIATE_TIME_STOP` / `ADVANCED_TIME_STOP` / `TIME_STOP_JUDGE_FOR_MOVE` 前提恒 true（维持现有实现），不读取任何 talent。

## 原因

1. erArk 无获得途径 → 照搬 = 时停不可玩（违背本引擎"可玩优先"目标）
2. 移动限制（窄域不可移动）依赖未实装分级，复杂度收益为负
3. 本引擎分层：talent 是 mod 层内容；武侠 mod 未来如需分级，可在 mod 数据里自行用条件限制指令（premises 机制已支持 mod 自定义前提），无需插件改码

## 代价

- 玩家初始即拥有全部时停能力（开/关/移动/搬运/自由）
- erArk 的"窄域时停不可移动"成长梯度无法表达

---

## 演进记录（2026-08-16）：经验解锁门槛

### 背景

时停系统完整复刻（grill 定案）重审 ADR-0015。原决策的**核心前提**是"erArk 无获得途径 → 照搬 = 不可玩"。但本引擎的素质获得机制（`gain.needs` + `checkTalentGain`，talent-utils）可以**自建获得途径**——把 erArk 的隐藏经验阈值（时姦经验 exp[124] / 无意识绝顶经验 exp[78]，erArk 中本用于 316/317 的技艺面板解锁门槛）映射为 `gain.needs`，经验积累自动解锁素质，不存在"永远无法获得"问题。

### 新决策（修正 ADR-0015）

实装门槛，聚合语义简化为玩家自身经验（erArk 的"全干员经验总和"聚合在武侠世界观无对应，简化）：

| 素质 | 解锁需求（gain.needs，指令执行后自动检查） | 权限 |
|------|------|------|
| 窄域时停 | 玩家时姦经验 `experience['124'] ≥ 50` | `PRIMARY_TIME_STOP`——可开关时停，**时停中不可移动** |
| 广域时停 | `experience['124'] ≥ 200`（审查修正：原含 `experience['78'] ≥ 10`——78 只写給目标/NPC（h-core orgasm.ts:435 跳过玩家），玩家恒 0 → 死门槛，删） | `INTERMEDIATE_TIME_STOP` / `TIME_STOP_JUDGE_FOR_MOVE`——可移动+搬运 |
| 精确时停 | （318 erArk 未实装） | `ADVANCED_TIME_STOP` 恒 false，talent 保留定义无获得途径 |

移动门控：`move` 指令补 `TIME_STOP_JUDGE_FOR_MOVE` 前提（h-time-stop onEnable 补丁，前提走条件引擎）。

### 变化

- `PRIMARY_TIME_STOP` / `INTERMEDIATE_TIME_STOP` / `TIME_STOP_JUDGE_FOR_MOVE` 从恒 true 改为读素质
- 自动时停移动（UI 开关）前置增加广域时停检查
- 门槛实现于插件默认层（h-core talents.toml 的 gain.needs），mod 可覆盖/关闭（删除 gain 即回退无门槛）
- 原"mod 可自行用条件限制指令"的兜底仍保留（premises 机制不变）
