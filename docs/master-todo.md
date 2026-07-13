# era-engine 汇总 TODO

> 所有 TODO 集中在此。分层结构：
> - **L0 架构层**：影响整个代码库的架构决策，必须先做
> - **L1 系统层**：完整的系统/插件实现
> - **L2 细节层**：系统内的具体功能点
> - **L3 推迟池**：已明确设计但当前不做的

---

## 参考文档索引

| 文档 | 位置 | 阶段 | 说明 |
|------|------|------|------|
| AGENTS.md | 根目录 | — | **最高文档**，所有铁律的源头 |
| 开发检查清单.md | 根目录 | 全部 | 事前约束 + 事后自审 |
| developer-handbook.md | docs/ | 全部 | 开发者交接手册（86行，✅ 存在） |
| mod-author-guide.md | docs/ | 全部 | Mod 作者指南（✅ 已更新，含自定义前提章节） |
| plugin-author-guide.md | docs/ | 全部 | 插件作者指南（✅ 已更新，含完整API速查表） |
| mod-override.md | docs/ | 全部 | Mod override 规范（✅ 已创建） |
| premises.md | docs/ | 全部 | 前提系统文档（✅ 已更新，含架构说明+mod自定义前提） |
| dialogue-format.md | docs/ | 全部 | 口上/叙事格式规范（255行，✅） |
| talk-common-system.md | docs/ | 全部 | 条件文本片断引擎（336行，✅） |
| scene-system.md | docs/ | 全部 | 剧情系统（144行，✅） |
| premises.md | docs/ | 全部 | 前提系统（92行，✅） |
| item-system.md | docs/ | P1 | 道具系统（210行，✅） |
| clothing-system.md | docs/ | P1 | 服装系统（222行，✅） |
| bondage-system.md | docs/ | H子 | 紧缚系统（138行，✅） |
| entity-namespaces.md | docs/ | 全部 | 命名空间映射（200行，✅） |
| erark-replication.md | docs/skills/ | 全部 | erArk复刻铁律（144行，✅） |
| add-instruction.md | docs/skills/ | 全部 | 添加指令工作流（66行，✅） |
| phase-p1-core-era.md | docs/plans/ | P1 | 核心era体验计划（175行，**当前阶段**） |
| phase-11-15-mvp-release.md | docs/plans/ | 11-15 | MVP发布计划（320行，**当前**） |
| 2026-07-04-instruction-replication.md | docs/plans/ | P1 | 指令复刻方案（67行，**当前**） |
| h-hypnosis-design.md | docs/specs/ | H子 | 催眠设计规格（**做催眠时必读**） |
| h-hidden-design.md | docs/specs/ | H子 | 隐奸设计规格（**做隐奸时必读**） |
| h-group-sex-design.md | docs/specs/ | H子 | 群交设计规格（**做群交时必读**） |
| mod-override.md | docs/ | 全部 | **Mod override 规范**，所有系统手册引用此文档 |
| 0003-mod-override-priority-layers.md | docs/adr/ | 全部 | ADR: 三层优先级 ID 匹配 |

---

## L0 — 架构层 ✅（全部完成）

| L0.x | 任务 | 状态 |
|------|------|------|
| L0.1 | 修复跨插件 import（4 处） | ✅ `PremiseRegistry`→core、`commonTextsEngine`→API、`getLevel`→entity-utils、talk-common→core |
| L0.2 | core 层具体玩法引用 | ✅ `registerNoSaveMode` 代替硬编码 `h_scene` |
| L0.3 | API 文档补全 | ✅ `plugin-author-guide.md` 覆盖全部 20+ namespace |
| L0.4 | 系统使用手册 | ✅ 14 个手册全部创建 |
| L0.5 | 硬编码属性名 | ✅ `ATTR` 常量建立，key 文件替换完成 |

---

## L1 — 系统层（完整系统/插件实现）

> 每个 L1 任务是一个完整系统，可独立实施。

### L1.1 渲染层 step3 — `_display` + `[styles]` 注册

**来源**：上会话遗留
**参考**：`docs/dialogue-format.md`（line 格式规范：style/trigger/display/speed 字段）

- 对话系统写 entry 时注入 `_display` 元数据
- `[styles]` 注册表实现
- TypewriterText 组件对接 `display` / `trigger` 字段

### L1.2 纸娃娃兜底地文

**来源**：上会话遗留
**参考**：`docs/talk-common-system.md`

- `triggerScene` 无对口上时自动用 talk-common-system 生成通用描述
- 注册 `behaviorId` → 条件文本池的映射

### L1.3 选项面板（P1.0）

**参考**：`docs/superpowers/plans/phase-p1-core-era.md`

- 显示设置（主题/深色/组标题/字体/字号）
- 侧栏设置（模式 overlay/并排、parameter 开关）
- 指令栏设置（编号/收藏/作弊命令开关）
- 小键盘设置
- 游戏设置（cheat 可见性）
- 存档入口

### L1.4 服装系统扩展（P1.2）

**参考**：`docs/clothing-system.md`

- 14 槽位（头/眼/项链/上身/外套/内衣/手/戒指/下身/内裤/袜/鞋/腰带/其他）
- H 中可脱/穿回
- 精液污染追踪

### L1.5 道具系统扩展（P1.3）

**参考**：`docs/item-system.md`

- consumable/lubricant/condom/toy/drug/material 类型
- `use_item` 指令

### L1.6 指令复刻（Phase A/B/C）

**参考**：`docs/superpowers/plans/2026-07-04-instruction-replication.md` + `docs/skills/erark-replication.md`

- **Phase A**：齐全前提（~80 个），按 A1（身体/体技/体位）→ A2（服装/地点/道具）→ A3（杂项）分批
- **Phase B**：效果补齐，逐条从 erArk `default.py` 读取 base_value
- **Phase C**：指令 TOML 数据（~380 条），分批：DAILY → WORK → PLAY → ARTS → OBSCENITY → SEX

### L1.7 睡眠/昼寝/就寝指令

**来源**：上会话遗留

- TOML + effect 实现
- 时间推进整合

### L1.8 `settle_state` 加 ability_level 参数

**来源**：上会话遗留

### L1.9 `{{input}}` 文本框语法

> 叙事中嵌入输入框，接收玩家开放答案，存到实体属性或临时变量。
> 用于自定义名字、自定义留言、LLM 口上输入等。

**语法**：
```toml
# 存到实体属性
text = "你叫{{input target='player.name'}}？好名字。"

# 存到临时变量（事件内可用）
text = "你给这柄剑起了个名字：{{input var='sword_name'}}。"
```

**设计**：
- `{{input ...}}` 渲染为可编辑输入框，支持默认提示文字
- 玩家输入确认后，输入框**替换为不可再改的文字**（不是 inline 编辑）
- 输入值存两处：`target` 写入实体属性，`var` 写入执行上下文（事件内条件引用）
- 输入确认方式：回车 / 点击日志外区域
- 异常处理：不输入时给默认值

**注意**：独立于 L1.1，不一起实现。

---

## L2 — 细节层（系统内的具体功能）

> 每个 L2 是 L1 系统内的一个独立子任务。

### L2.1 @命令调试工具（Phase 11.1）

```
完成度：已有骨架（native-commands.ts 含 8 个 @ 命令入口），需要完善实际逻辑
```

- [x] `@help` 骨架
- [ ] `@attrs` — 显示选中角色完整属性
- [ ] `@setattr 属性名 值` — 修改属性
- [ ] `@teleport 地点ID` — 移动
- [ ] `@spawn 模板ID 地点ID` — 生成角色
- [ ] `@startquest 任务ID` — 开始任务
- [ ] `@additem 物品ID 数量` — 加物品
- [ ] `@errors` — 查看错误列表
- [ ] 完善骨架 + 接入真实数据

### L2.2 沙箱脚本（Phase 12.1）

```
参考：phase-11-15-mvp-release.md Task 12.1
文件：src/utils/sandbox.ts 已存在骨架
```

- new Function() + 冻结只读 context
- 5 秒超时保护（acorn AST）

### L2.8 Quest/Event 系统未实现功能

```
参考：src/plugins/quest-system/index.ts + docs/scene-system.md
完成度：step 流程控制有，但触发条件 + 字段使用未完全
```

- [ ] mod-loader 加载 quest TOML（当前 `// TODO(task-10.2)`，quest 文件只被扫描但未被完整读取）
- [ ] 前置任务检查（`prerequisites` 字段当前跳过）
- [ ] combat step 的 `on_win` / `on_lose` 分支（当前 `// TODO: 监听 combat:end 判断`）
- [ ] condition step 的条件求值（当前 `// TODO: condition 求值`）
- [ ] spawn step 的角色/物品创建（当前 `// TODO: 创建角色/物品`）
- [ ] `visible` 字段——任务在 UI 中是否可见未被 quest-system 读取
- [ ] `display` 字段——event 的显示模式未被 quest-system 处理
- [ ] `scene.has_character()` 条件函数——当前 condition 系统不支持
- [ ] `"talk_to"` objective 类型监听 `dialogue:end` 已实现，但缺少 `"use_instruction"`、`"character_present"` 等类型
- [ ] 已完成的任务状态持久化（当前 `getQuestStatus` 对已完成任务返回 `'not_started'`）

### L2.12 talk-common 天赋条件迁移

> talk-common 纸娃娃数据中引用了 23 个 erArk 天赋 ID（CVP_A2_T|{id}），
> 当前被静默跳过。必须注册为条件捷径才能精准匹配纸娃娃描述。

**体质类（搬进 talents.toml 插件默认）**：

| ID | 含义 | 条件捷径 |
|----|------|---------|
| 0 | 阴道处女 | `selected.阴道处女 == 1` |
| 1 | 肛门处女 | `selected.肛门处女 == 1` |
| 2 | 尿道处女 | `selected.尿道处女 == 1` |
| 3 | 子宫处女 | `selected.子宫处女 == 1` |
| 6 | 未初潮 | `selected.未初潮 == 1` |
| 20 | 受精 | `selected.受精 == 1` |
| 21 | 妊娠 | `selected.妊娠 == 1` |
| 24 | 育儿 | `selected.育儿 == 1` |
| 102 | 幼女(体型) | `selected.体型 == '幼女'` |
| 103 | 少女(体型) | `selected.体型 == '少女'` |
| 104 | 処女(体型) | `selected.体型 == '処女'` |
| 105 | 成人(体型) | `selected.体型 == '成人'` |
| 106 | 淑女(体型) | `selected.体型 == '淑女'` |
| 107 | 夫人(体型) | `selected.体型 == '夫人'` |
| 121 | 贫乳(胸围) | `selected.胸围 == '贫乳'` |
| 122 | 微乳(胸围) | `selected.胸围 == '微乳'` |
| 123 | 普乳(胸围) | `selected.胸围 == '普乳'` |
| 124 | 巨乳(胸围) | `selected.胸围 == '巨乳'` |
| 125 | 爆乳(胸围) | `selected.胸围 == '爆乳'` |
| 129 | 细腿(腿型) | `selected.腿型 == '细腿'` | A2 |
| 130 | 肉腿(腿型) | `selected.腿型 == '肉腿'` | **A1** |
| 131 | 小足(足型) | `selected.足型 == '小足'` | A2 |
| 132 | 大足(足型) | `selected.足型 == '大足'` | A2 |
| 7 | 未成年 | `selected.未成年 == 1` | A2 |
| 222 | 性无知 | `selected.性无知 == 1` | A2 |

**实现**：
1. 将体质类（体型/胸围/腿型）定义为 `talents.toml` 插件默认，有 `modifier` 影响公式
2. 状态标记类（处女/妊娠/育儿）不作为天赋，而是注册条件捷径到 `premiseRegistry`
3. 两者都注册一个"条件捷径"（shorthand），让 `CVP_A2_T|102_E_1` 等价于对应条件表达式
4. 全部注册完毕后，talk-common 的 `pickEntry` 才能在非 strict 模式下正确匹配

**S（状态）和 A（能力）类 CVP 映射参考**（转换不需要特殊处理，直接写成条件表达式即可）：

| CVP 示例 | 等价条件 |
|----------|---------|
| `CVP_A2_S\|0_GE_5000` | `selected.皮肤 >= 5000` |
| `CVP_A2_S\|4_GE_1000` | `selected.阴道 >= 1000` |
| `CVP_A2_S\|5_GE_90000` | `selected.后穴 >= 90000` |
| `CVP_A2_A\|71_GE_3` | `selected.abilities.舌技.level >= 3` |
| `CVP_A2_A\|75_GE_5` | `selected.abilities.肛技.level >= 5` |

### L2.13 技能系列（erArk ability_type=4）参考

> erArk 的技能系列（话术/指挥/战斗/料理/音乐/学识/医术/农业/制造/绘画）是通用生活技能，
> 但我们的原生通用技能可能与之不同。此条仅做记录，不做实现。

**erArk 技能列表**（ability_type=4, ID 40-49）：
```
40=话术技能, 41=指挥技能, 42=战斗技能, 43=料理技能, 44=音乐技能
45=学识技能, 46=医术技能, 47=农业技能, 48=制造技能, 49=绘画技能
```

### L2.3 角色创建流程（Phase 13.1）

```
文件：src/ui/views/CharacterCreation.vue 已存在
```

- dialogue/choose/input/image 步骤类型
- meta.toml `[creation]` 配置支持

### L2.4 存档迁移链完善（Phase 11.3）

- rename/default/transform 迁移类型
- 内存执行 + 下个存盘写入

### L2.5 插件化闭环验证（Phase 12.2）

- test-mod 跑通完整循环
- 换模组测试

### L2.6 移动端 PWA（Phase 14.1）

- manifest.json + 图标
- 离线运行

### L2.7 最终集成测试 + 发布（Phase 15.1）

### L2.9 Scene/Event 系统缺口

> scene-system.md 设计了完整的 event 机制，但代码中大量未实现。

- [ ] `events/` 目录加载——当前只加载 `quests/main/` 和 `quests/side/`，没有 `events/` 路径
- [ ] `start_scene` effect 类型——不存在
- [ ] scene step 类型——quest-system 不支持 `type = "scene"`（嵌套场景）
- [ ] 触发拦截逻辑——dialogue-system 没有 scene 拦截机制
- [ ] 嵌套场景进度管理——不实现

### L2.10 Combat 系统缺口

- [ ] 队友系统——回合循环中队友行动 stub（`// TODO: 队友系统`）
- [ ] `hit_check` 钩子——base 实现被注释掉
- [ ] 动态指令——按角色能力注册指令 stub
- [ ] 阴阳属性——硬编码为 `1.0`（`// TODO: 查角色内功的阴阳属性`）
- [ ] mod override 系数——硬编码默认值（`// TODO: mod override 机制`）

### L2.11 H-core 结算缺口

- [ ] 状态修正——`calcJudge` 中状态修正占位（`// TODO: 从 ctx.statusLevels`）
- [ ] 陷落修正——占位（`// TODO: getFallLevel × 倍率`）
- [ ] 群交 HP 修正——占位（`// TODO: 群交系统`）
- [ ] 射精衰减——按时间衰减精液量未实现（`// TODO: 按时间衰减精液`）
- [ ] 被发现面板——隐奸系统 UI stub（`// TODO: 打开被发现面板`）

---

## L3 — 推迟池（已明确设计但暂不实施）

### H 子系统

```
已实现：h-core / ejaculation / pregnancy / first-time / exposure / mark / hypnosis / hidden / group-sex / bondage / time-stop
```

**待实施**：
- h-confinement — 监禁调教系统
- h-aromatherapy — 香薰疗愈（8种每日buff）
- 女儿成长→自订角色入口（h-pregnancy 扩展）
- 动态体位切换（15 体位 × 5 部位）
- NPC H AI — H 内自动行动
- 二段行为 — 绝顶/射精后连锁
- 宝珠系统 — 24 种宝珠睡眠结算
- 口上三层加权随机 — 通用/角色/特殊情境

**做以上任一项前必读**：
- `docs/superpowers/specs/` 下对应设计规格文件
- `docs/superpowers/plans/` 下对应实施计划
- `docs/erark-replication.md` 复刻铁律

### 引擎深化

- LLM 口上（流式/上下文/token/降级）
- 天赋/套装钩子式效果（需沙箱）
- combat-wuxia 公式 mod override 完整机制
- 战斗外精确分钟级 tick
- NPC 队友 AI 优化
- inventory-system tags 驱动指令完整实现（当前只 stub）
- scene-system event 完整管线（events/ 目录、start_scene effect、嵌套场景）
- 限时/重复/日常任务
- 日志搜索/过滤
- 自动化脚本/宏（Command ID 链式执行）
- onDisable/onUnload 插件生命周期
- semver 版本校验
- required_attributes 继承
- 标准事件契约完整发出
- getDefaultValue 类型感知默认值
- 地图层级文档自动生成
- 深色模式算法反色优化

### UI 剩余项

- 角色指令栏开关
- 大事志内容填充
- 复杂历法（当前 day%7）
- 多图立绘 variants
- foldStates 存档持久化
- 侧栏三条杠手柄承载更多简要信息
- 目标选择菜单（仙剑式）
- 战斗 UI 美化（仙剑式布局）
- 全体技能/回复/buff
- 战斗中不可选中队友为攻击目标
- HP=0 后角色处理

### 属性面板值域约束（接入升级系统后重新检查）

**背景**：erArk 通过 `AbilityUp.csv` 为每项能力定义 0→1→2→…→7 的升级路径，严格限制了取值范围。
我们当前**没有运行时约束**——`"技巧" = 99999` 会如实显示，不会报错。

**问题点**：
1. 感觉（皮肤感度等）、能力（技巧/顺从等）、刻印、技术、扩张（阴道扩张/后穴扩张/子宫扩张）目前只是原始数字，无 max 限制
2. erArk 的 `AbilityUp.csv` 定义了每级的升级需求（XP/宝珠/经验），我们还没做
3. 接入升级系统后，需要确认：要不要为这些值加 max 约束？约束力度多强（硬限制 vs 约定）？
4. 刻印的合理范围是 0~3 还是 0~5？
5. 感觉值（皮肤感度）的合理范围——erArk 允许 0~7 级，每级一个阈值
6. 如果加约束，是在 `attributes.toml` 加 `max` 字段，还是由升级系统全权管理？

**提醒**：回头检查这里的对话记录（2026-07-13 会话后半段 `属性页签值域` 话题）。

### settle 公式深化

- calcStateChange 追加素质修正/道具修正/extra_adjust
- 素质修正（char.talents 读取 + erArk talent mod 表乘算）
- 道具修正（装备/使用中道具）
- 永久感度（皮肤感度/胸部感度等）随 H 行为增长机制
