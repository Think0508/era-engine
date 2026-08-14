# 监禁系统：逃脱结算形式与追捕委托（ADR 0012）

2026-08-14 决策。记录逃脱结算与追捕委托的实现形式、决策考虑与演进预留——自研 mod 时会针对性地改这个框架，需要知道当时为什么这么定。

## 背景

erArk 的逃脱机制（`confinement_and_training.py`）：每日结算 `settle_prisoners`——每囚犯累积逃脱概率 → 判定（无监狱长 >30 直接逃；有监狱长 50+设施效果且对抗值胜出）→ 成功则 `escaping` + 位7 离线 + 生成追捕委托（3人/3天/需求=囚犯战斗×4，完成抽象送回）。我们引擎没有外勤/派干员系统，且 quest 的 enemies 是静态 TOML 数据（动态逃犯 id 写不进去）。

## 决策

### D1 逃脱公式原样复刻
累积/系数/单次上限/阈值/对抗值全部对齐 erArk（细节见 docs/confinement-system.md §五）。参数集中在 `escape.ts` 顶部，改动前先读手册「设计注记」。

### D2 战斗/学识技能来源 = tag 聚合（暂用）
`getSkillTotal` 经 `engine.abilities.getByTag` 取角色带 `combat`/`knowledge` tag 的能力等级之和。⚠️ 这是 erArk 迁移近似（erArk 是 ability[42]/[45] 单能力位）——**非通用**，自研 mod 时按我们的公式与技能改（可能换 tag/换权重）。代码标 TODO。

### D3 设施效率 = 接口预留
`getFacilityEfficiency()` 恒 1，公式留变量；provider 留 `facilityLevels` 字段。接入设施系统后按等级查效果表（erArk Facility_effect.csv：升级降逃脱阈值至 99）。不为此引入通用设施系统（过度设计）。

### D4 追捕委托 = 藏匿点 + 动态 scene
- 逃脱成功 → 随机**藏匿点**（非监狱/非关押区地点，排除玩家所在地）→ 逃犯 setOnline 到藏匿点
- 动态 scene：`quest.startDynamicScene`（quest-system 新增 API，运行时构造 Quest 对象解决动态敌人）
  `objective(reach_location) → combat(enemies=[逃犯]) → reward(重囚)`
- 战斗胜利 → `confinement_recapture` effect → 需**空牢房** → 重囚；无空牢房 → 提示不归还
- **3 游戏日**未抓回 → 脱逃成功（永久自由）

### D5 追捕与 erArk 的差异（刻意）
| 维度 | erArk | 本引擎 |
|------|-------|--------|
| 追捕方式 | 外勤委托（派 3 干员 3 天） | 玩家亲自追（藏匿点 + 战斗） |
| 逃犯位置 | 抽象（委托完成即送回） | 藏匿点上线（escaping 拦截 AI） |
| 难度 | 需求=囚犯战斗×4 | 战斗硬实力对抗 |
| 超时 | 委托失败消失 | 3 日脱逃成功 |

### D6 逃犯状态表示
`sp_flag.escaping` + `setOffline`（阶段A逃脱瞬间）+ 藏匿点 `setOnline`（escaping 保留）。npc-ai 跳过集注册 `escaping` 规则（藏匿点上线但 AI 不决策，行为冻结）。

## 备选方案

1. 抽象委托（quest 静态模板 + 占位敌人）——动态敌人写不进 TOML，否决
2. 追捕不走 quest（confinement 自管列表 + 自定义指令）——与 quest 体系割裂（任务面板不可见），否决
3. 逃犯会移动（每日本换藏匿点）——第一版不做，留作加强项

## 影响

- quest-system 新增 3 个 API：`startDynamicScene`/`registerDynamicScene`/`unregisterDynamicScene`（动态 scene 表，注册方负责存档 restore 后重建）
- fugitives 记录在 confinement provider（随存档）
- 自研 mod 调整逃脱平衡 = 改 `escape.ts` 参数区 + training.toml
