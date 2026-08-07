# era-engine 汇总 TODO

> 所有 TODO 集中在此。分层结构：
> - **L0 架构层**：影响整个代码库的架构决策，必须先做
> - **L1 系统层**：完整的系统/插件实现

## 会话交接摘要（2026-07-14）

> 新会话开始时先读此节。

### 已完成（本会话）
```
L1.6 前置改动（spec §10，B1 开工前一次做完）✅
  - loader 收敛: h-instructions/ 双路径 → 单 instructions/（插件默认层 + mod 层按 id 去重，mod 胜出）
    h-instruction-loader.ts 删除，并入 instruction-loader.ts；h_ 前缀移除
  - HInstruction 接口扩展: erark_id/erark_behavior/judge_base/judge_class/tags/condition
    loader 自动注入 judge_check（有 judge_base 时置顶）
  - judge_check/calcJudge 对接: calcJudge 加 judgeClass 参数 → 查 hConfig [judge.adjustments] 表
    h-config.toml 新增修正表（性交-250/A性交-350/W性交-400/亲吻-125，instuct_judege.py 逐行翻译）
    未实装修正项（月经/体位/旅馆/他人/助理/H打断/监禁/睡眠/激素）留 TODO 注释
  - 位置前提迁移: 8 个 IN_* handler 删除 → location.tags（对照表 docs/instruction-replication/location-tags.md）
  - 引擎耗时机制: timeCost<=0（-1=handler 自定义耗时）不自动推进时间、不进结算公式
  - UI 分类开关: CommandBar 动态收集已存在，补全排序（play/work/arts/system）
  - 清理: mods/_erark_source/ → docs/instruction-replication/archive/_erark_source/
  - 顺带修复: typecheck 基线错误 12 处（未用 import/ExecutionContext.sourceId 等）
  验收: npm run typecheck ✅ / npm run test 266 通过 ✅ / dev 启动无报错 ✅

Code review 修复（2026-08-08 子代理 review）✅
  - loader 兼容 spec schema：category/sub_category 规范名（type/sub_type 旧别名兜底）
  - 单条指令注册失败（id 重复）→ errorReporter + 跳过，不拖垮 h-core（原会 throw 禁用整个插件）
  - 天赋个性修正按 erArk 门控 S 类判定：亲吻(D) 不吃 淫乱/性好奇/性冷漠/性无知（instuct_judege.py 162-178 行）
  - game:execution_end 发 clamp 后耗时（-1 不再外泄给 h-hidden/h-pregnancy）
  - 同层指令 id 重复 → warning；缺 time_cost / 孤儿 judge_class → warning
  - 修正条件解析失败 → errorReporter（原静默吞）
  - 新增 4 测试（S类门控判别/单条失败隔离/executor premises/timeCost -1）→ 270 通过
  验收: npm run typecheck ✅ / npm run test 270 通过 ✅

二次深度审查修复（2026-08-08，静默bug/架构/完整性）✅
  - 条件绕过消除: DailyMenu/ScreenNumpad 原来 evaluateCondition: ()=>true（静默执行风险）
    → 新建共享求值器 src/ui/utils/command-eval.ts，三组件同源；executor fail-safe：
      有 condition/premises 但调用方无求值器 → warning + 跳过（禁止静默放行）
  - 加载时校验（AGENTS §21）: condition 引用未注册字段 → error + 注销该指令；
    premises 未注册 → warning（去重）；hConfig adjustments 修正条件 → error
    - 因插件 condition_fields/premises 在 onEnable 后才注册，新增 game:plugins_loaded
      生命周期事件（plugin-manager 全部 onEnable 后 emit），校验延迟到该事件
  - condition-registry: 新增结构路径 pattern（location.tags.{tag}/talents/abilities/
    factions/status/relations/first_times/experience/body_parts/base/inventory）+
    validateExpression()（selected./target. 归一化校验）
  - judge_check 多目标: 最坏者胜出合并（retreated>partial>success），防静默覆盖
  - condition.ts 根路径只在位置0生效（防深层字段遮蔽，如角色字段名叫 player）
  - h-config adjustments 条件改显式结构路径（target.talents.性无知）
  验收: npm run typecheck ✅ / npm run test 274 通过 ✅ / dev 启动无报错 ✅

三次深度审查修复（2026-08-08，round-3：条件引擎真相对齐）✅
  - selected 根路径修复（重大）：gameContext.getContext() 从未提供 selectedCharacterId →
    bridge 同步选中角色（watch uiStore.selectedCharacterId → gameContext.setSelectedCharacterId）
    （talk/open_selected_panel 的 `selected != null` 之前恒 false——指令永久死亡，现已修复）
  - 条件引擎 null/undefined 右值支持（`selected != null` 存在性检查，不再抛错→恒 false）
  - 能力记录终端解包为等级（AGENTS §36 {level,xp} 数据契约）；对象数组单段 id 匹配（status.醉意 存在性）
  - 字段别名机制：core 条件引擎保持通用，插件注册别名（status-system 注册
    status→status_effects / remaining→remaining_duration，gameContext.setFieldAliases）
  - validateExpression 去掉根白名单：插件自定义根（combat.in_progress）直接精确校验；
    数字/负数字面量不误判
  - judge_check 空目标 fail-closed（retreat+警告）；mergeJudgeResult 提取纯函数+单测；
    settle_hp_mp 补 canApply 门控（与兄弟 settle_* 一致）
  - executor 前提/条件检查包 try/catch（前提 handler 抛错不再逃逸 execute()）；
    command-eval 去掉 player 兜底（与 resolveTarget('selected') 语义一致，防 HAVE_TARGET 假通过）
  - ScreenNumpad ctx 补齐（api/engine/sourceId）；engine-ui-bridge createExecutionContext 换共享求值器
  - effect_block 未知引用 → warning；CommandDef 增加 tags 字段透传（spec §3）
  - game:plugins_loaded 监听器防重复注册
  验收: npm run typecheck ✅ / npm run test 281 通过 ✅ / dev 启动无报错 ✅

四次深度审查修复（2026-08-08，round-4：跑通性验证）✅
  - 真浏览器启动 bug：main.ts 手动重复注册 locations（loadMod 内部已注册）→
    "实体 location:town_square 已存在" 启动即失败页 → 删除重复注册
  - era-engine.config.toml 从未被读取（active_mod 死配置，切模组无效）→ main.ts 读取
    active_mod（?raw 导入 + @iarna/toml，缺省兜底 test-mod）
  - meta.toml starting_location/player_character 死字段（AGENTS §39 文档化但未加载）→
    LoadedMod 加载 + main.ts 使用（起始地点/玩家实体按 mod 声明）
  - 新增 boot 冒烟测试 src/plugins/boot-smoke.test.ts（镜像 main.ts 全量插件加载）：
    插件 onEnable 全部成功（move/talk/do_h/end_h 存在性强断言）、指令注册、校验无误报
  - instruction-loader 幂等保护（onEnable 重跑不再重复注册刷屏）
  验收: npm run typecheck ✅ / npm run test 288 通过 ✅ / dev 启动无报错 ✅

五次深度审查修复（2026-08-08，round-5：测试审查 + 判定链路真 bug）✅
  - 【重大 pre-existing bug】effect-system 每效果新建 handlerCtx 拷贝 → judge_check 写入的
    _judgeResult 后序 settle_* 读不到 → canApply 恒 true → 判定退缩从不阻止结算！
    （judge_check/settle_favorability/trust/state/hp_mp 全链路静默失效）
    修复：handlerCtx = Object.assign(execCtx, ...) 共享同一执行上下文
  - 新增端到端判定测试（effect-system + h-core onLoad + executor 全链路）：
    退缩 → settle_state 跳过（快乐不变）+ 退缩日志；已吻 → 判定成功 → settle_state 生效（40）
  - phase-h 测试自足化：mod 加载测试前置 entitySystem.clear()（消除顺序脆弱依赖）
  - 测试审查发现：setEntityAttr 找不到命名空间时写直接属性（测试角色未按
    applyAttributeDefaults 初始化导致的假失败——测试已镜像真实初始化）
  验收: npm run typecheck ✅ / npm run test 289 通过 ✅

六次深度审查修复（2026-08-08，round-6：链路验证）✅
  - 新增链路冒烟测试 src/plugins/chain-flow.test.ts（真正"点指令"的全链路）：
    rest → 时间+60min/恢复效果/场景口上；do_h → H开始 → end_h 结束（模式栈往返）；
    talk → 占位输出；整批无 error
  - 新增 bridge 叙事链测试（narrativeLog.write → eventBus → bridge → gameStore）
  - 链路验证中发现并修复：
    - 测试 mock 缺 selectCharacter（talk handler 依赖）——真实 uiStore 有，产品无 bug
    - talk-common API 注册在 onEnable（async）——plugin-manager 有 await，产品无 bug
    - rest 无选中目标时 2 条 "target='selected' 无选中" warning——test-mod 数据设计
      （搭档恢复效果），B1 写 rest 时按 target 条件化
  验收: npm run typecheck ✅ / npm run test 294 通过 ✅（32 文件）

七次深度审查修复（2026-08-08，round-7：静默错误排查）✅
  - 【静默 bug】dialogue pickMatchingLine 不求值替换 {id} 占位符 → character.{id}.好感度
    解析为查找角色 '{id}'（恒不存在 → 条件恒 true）：好感度条件失效 + 无条件台词被随机遮蔽
    → substituteId() 替换后求值（premises: 分支同样处理）
  - executor finally 的 checkTalentGain 无防护 → 异常会逃逸 execute()（UI 点击崩）
    → try/catch + errorReporter
  - settle_hp_mp 的 .catch(()=>false) 吞真实错误 → 只忽略"插件未注册"（与 judge_check 一致）
  - 链路测试升级：h-core onEnable 用真实 eventBus（execution_end 二段结算监听器真实注册）
    + 新增"H 中执行指令 → body_item_tick + orgasmJudge 不崩"测试
  - 角色口上分支测试（{id} 判别：好感度 50 → '哦，是你啊'；10 → '你是何人'）
  - 修 flaky：test-mod greet 两行条件互斥（原无条件行 + 随机选 → 断言 flaky）
  验收: npm run typecheck ✅ / npm run test 296 通过 ✅（6 连跑稳定）

已知缺口（本次审查发现，登记 TODO）:
  - resolveValue 不支持 quest.*/inventory.* 根路径（注册表里有、求值恒为 0/false 静默）——
    需 gameContext 暴露 quests/inventory 上下文后接入
  - 可用条件属性手册.md 生成（conditionRegistry.generateManual 已有实现）未接线——
    浏览器端无法写文件系统，需 dev 工具/脚本方案
  - plugin-manager 用 console.warn（铁律要求 errorReporter）——既有代码，随批收敛

下一步: B1 批次清单 docs/instruction-replication/batch-01-daily.md（24 条 daily/work/play）
  → 用户筛选 → 逐条写 TOML 到 src/plugins/h-core/data/default/instructions/（spec §8 每批工作流）
```

### 已完成（此前会话）
```
L2.11 三项缺口全部完成 ✅
  - 群交HP修正: hp-mp.ts 重写 + settle_hp_mp effect注册
  - 精液吸收: calcSemenAbsorb + penis_dirty_dict + H中tick吸收
  - 精液污染追踪: pl_penis_semen_dirty/not 前提注册 + 40处TOML转换

根因修复: condition.ts selected 路径实现 ✅
  - GameContext 加 selectedCharacterId
  - resolveValue selected stub → 真实实体解析
  - 数组数字索引支持 + talk-common parseConditions 双前缀bug修复

jj_0~3 阴茎大小前提 ✅
  - attributes.toml 加 "阴茎大小" + actorId入premiseCtx

饥饿系统: hunger-system 插件 ✅
  - eat_food effect + 自动增长 + 消化CD + NPC口粮 + h-config配置化

L2.9 Scene/Event 系统 ✅
  - events/统一加载 + start_scene effect + scene step(嵌套)
  - dialogue-system 触发拦截 + completedScenes 存档持久化
  - ConversationRef 重构: 4种type(character/global/quest/event) + speaker 解耦
  - 内联 dialogue 支持 (lines 字段)
  - 文档重写至 600+ 行

TODO(依赖其他系统):
  - 爱情旅馆/他人存在/助理/体位/处女/时停 +9999（calcJudge 缺）
  - 目标榨精 ability[77] + 精液存量检查
  - 食物获取方式(商店/烹饪/采集)
```

### 待做优先级

```
1. L2.10 Combat 系统缺口（5项）
2. L2.11 剩余: 被发现面板(UI) + 食物获取方式
3. 地图系统重构（三层分离 + 工具）：
   - 引擎侧: `docs/plans/map-system-rework.md` Phase 1
   - 工具侧: `docs/tools/map-editor-design.md` Phase 2 + 3
4. 移动/离开 effect（`move_to`、`npc_leave`——场景剧情中控制角色位置）
5. L1.7 睡眠/昼寝/就寝指令
5. L1.9 {{input}} 文本框语法
6. L1.6 指令复刻（前置改动 ✅，下一步：B1 批次清单 → 用户筛选 → 逐条 TOML）
7. 侧栏面板：特质页签/个人情报/日志统计/作弊
```

### calcJudge 完整公式（erArk精确复刻）

```
实行值 = 基准需求 + 以下各项修正：

1. 好感修正: 好感度查阈值表[0,100,500,1000,2500,5000,10000,50000,100000]
   → 加值[0,10,25,50,75,100,150,225,300]
   信赖修正: 信赖度查阈值表[0,25,50,75,100,150,200,250,300]
   → 加值[0,25,50,75,100,150,200,300,500]

2. 状态修正(欲情+快乐)×5 + (恭顺+屈服)×10 - (羞耻+抑郁)×5 - (苦痛+恐怖+反感)×10
   等级阈值[0,100,500,1000,2500,6000,12000,30000,50000,75000,100000]

3. 能力修正: 亲密×10 + 欲望×5

4. 刻印修正: 快乐×50 + 屈服×50 + 苦痛×10 + 无觉×25
   - min(恐怖-时姦,0)×50 - 反发×100

5. 心情修正: get_angry_level(愤怒)×20
   愤怒≤5→1, ≤30→0, ≤50→-1, >50→-3

6. 陷落修正: 思慕30+恋慕50+恋人80+爱侣100+屈从30+驯服50+宠物80+奴隶100

7. 天赋个性: 淫乱+50, 性好奇+30, 性冷漠-30, 性无知+100,
   讨厌男性-30, 底线-100, 持有把柄+100, 被持有把柄-100, 女儿+100

★ 待实现（依赖其他系统）:
   爱情旅馆+25/50/100 | 他人存在+露出修正 | 助理助攻+50
   体位喜欢+30 | 处女-250/-350 | 监禁/睡眠/时停+9999
```

### talk-common 转换状态

```
全部CVP码已转换为条件表达式。剩余的CVP:
  CVP_A2_Dirty|B0_G_1 → 40条(精液污染，需精液追踪系统)
  
VAR_MAP已处理:
  博士→{player.name}(1005) | 手机→书本(36) | 罗德岛→移除(3)
  兽耳→耳朵(3) | 电脑→书本(1) | 咖啡→茶(2)
  尾巴→腰身/双腿缠绕/臀部等(50+)
  信息素→荷尔蒙(1)
  
待手动处理: 电视×6处
```

### 插件默认数据体系

```
h-core/data/default/ 提供全套 erArk 标准数据:
  attributes.toml    → 纯数值(体力/好感度/日重置参数)
  abilities.toml     → 带等级的能力(感觉/ABL/刻印/性技术)
  talents.toml       → 176条通用天赋(排除方舟世界观绑定)
  equipment.toml     → 9个基础装备槽
  status-effects.toml → 中毒/醉意等通用状态
  relations.toml     → 好感度关系类型
  bondage/types.toml → 16种捆绑类型
  h-config.toml      → settle_state ability_level 映射表

三层优先级: Layer1(插件默认) → Layer2(mod插件) → Layer3(mod定义)
加载: loadMerged deepMerge + expandCharacterAbilities + initializeTalents
```
> - **L2 细节层**：系统内的具体功能点
> - **L3 推迟池**：已明确设计但当前不做的

---

## 参考文档索引

| 文档 | 位置 | 阶段 | 说明 |
|------|------|------|------|
| AGENTS.md | 根目录 | — | **最高文档**，所有铁律的源头 |
| map-editor-design.md | docs/tools/ | P1 | 可视化地图编辑器完整设计（技术栈、功能、数据格式） |
| 开发检查清单.md | 根目录 | 全部 | 事前约束 + 事后自审 |
| developer-handbook.md | docs/ | 全部 | 开发者交接手册（86行，✅ 存在） |
| mod-author-guide.md | docs/ | 全部 | Mod 作者指南（✅ 已更新，含自定义前提章节） |
| plugin-author-guide.md | docs/ | 全部 | 插件作者指南（✅ 已更新，含完整API速查表） |
| mod-override.md | docs/ | 全部 | Mod override 规范（✅ 已创建） |
| premises.md | docs/ | 全部 | 前提系统文档（✅ 已更新，含架构说明+mod自定义前提） |
| dialogue-format.md | docs/ | 全部 | 口上/叙事格式规范（255行，✅） |
| talk-common-system.md | docs/ | 全部 | 条件文本片断引擎（336行，✅） |
| scene-system.md | docs/ | 全部 | 剧情系统（统一scene管理，318行，✅） |
| premises.md | docs/ | 全部 | 前提系统（92行，✅） |
| item-system.md | docs/ | P1 | 道具系统（210行，✅） |
| clothing-system.md | docs/ | P1 | 服装系统（222行，✅） |
| bondage-system.md | docs/ | H子 | 紧缚系统（138行，✅） |
| entity-namespaces.md | docs/ | 全部 | 命名空间映射（200行，✅） |
| erark-replication.md | docs/skills/ | 全部 | erArk复刻铁律（144行，✅） |
| add-instruction.md | docs/skills/ | 全部 | 添加指令工作流（66行，✅） |
| phase-p1-core-era.md | docs/plans/ | P1 | 核心era体验计划（175行，**当前阶段**） |
| phase-11-15-mvp-release.md | docs/plans/ | 11-15 | MVP发布计划（320行，**当前**） |
| 2026-07-04-instruction-replication.md | docs/plans/ | P1 | 指令复刻方案（67行，已被下述 spec 取代） |
| 2026-08-07-instruction-replication-design.md | docs/superpowers/specs/ | P1 | **指令复刻设计 spec（当前权威，做 L1.6 必读）** |
| migration-workflow.md | docs/instruction-replication/ | P1 | **逐条迁移 SOP（做 L1.6 必读）** |
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

**参考**：`docs/superpowers/specs/2026-08-07-instruction-replication-design.md`（权威 spec）+ `docs/instruction-replication/migration-workflow.md`（逐条 SOP）+ `docs/skills/erark-replication.md`

> **当前进度**：第 0 步粗筛 ✅（228 保留，见 `docs/instruction-replication/instruction-keep-list.md`）→ 前置改动 ✅（spec §10 全部完成）→ **下一步 B1 批次清单**（24 条 daily/work/play，写 `batch-01-daily.md` 等用户筛选）

- **前置改动** ✅（见会话交接摘要）：loader 收敛 / 接口扩展+judge_check 注入 / calcJudge adjustments 表 / IN_* 迁 location.tags / 耗时机制 / UI 分类 / _erark_source 归档
- **Phase A**：齐全前提（~80 个），按 A1（身体/体技/体位）→ A2（服装/地点/道具）→ A3（杂项）分批
- **Phase B**：效果补齐，逐条从 erArk `default.py` 读取 base_value
- **Phase C**：指令 TOML 数据（228 条），分批：B1 daily(24) → B2 obscenity(37) → B3-B6 sex(142，H UI 就绪后) → SYSTEM/ARTS 顺带

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
L2.9 已统一 scene 管理、事件拦截、嵌套、持久化、ConversationRef。
以下为仍待做的具体功能点：
```

- [x] mod-loader 加载 quest/event TOML（L2.9 统一扫描 quests/ + events/）
- [x] 前置任务检查（`prerequisites` 字段——L2.9 completed）
- [x] `display` 字段（current/log/hidden——L2.9 实现）
- [x] 已完成任务状态持久化（completedScenes——L2.9 实现）
- [ ] combat step 的 `on_win` / `on_lose` 分支——需 combat-system 在 `combat:end` 事件附带胜负信息（`result: 'win' | 'lose'`）
- [ ] condition step 的条件求值——需在 `executeStep` 中调 `evaluateCondition`，传入当前 GameContext
- [ ] spawn step 的角色/物品创建——需 spawn-system 或 inventory API
- [ ] `visible` 字段——任务面板 UI 消费，当前 quest-system 已存字段，UI 未读
- [ ] `scene.has_character()` 条件函数——条件系统扩展，需在 `resolveValue` 中注册特殊函数
- [ ] 更多 objective 类型：`"use_instruction"`（监听指令执行）、`"character_present"`（检测角色在场）等

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

- [x] `events/` 目录加载——mod-loader 统一加载 quests/ + events/，scene ID 重复检测 + scene_id 引用校验
- [x] `start_scene` effect + `start_quest` 别名——后台激活 scene（不打断当前）
- [x] scene step 类型——`case 'scene'` + 嵌套场景栈 push/pop
- [x] 触发拦截逻辑——dialogue-system 检查 condition 匹配的 scene 并自动开始
- [x] 嵌套场景进度管理——场景栈实现（子完成→pop 回父），`parent` 字段可选

### L2.10 Combat 系统缺口

- [ ] 队友系统——回合循环中队友行动 stub（`// TODO: 队友系统`）
- [ ] `hit_check` 钩子——base 实现被注释掉
- [ ] 动态指令——按角色能力注册指令 stub
- [ ] 阴阳属性——硬编码为 `1.0`（`// TODO: 查角色内功的阴阳属性`）
- [ ] mod override 系数——硬编码默认值（`// TODO: mod override 机制`）

### L2.11 H-core 结算缺口

- [x] 状态修正——`calcJudge` 中状态修正完成
- [x] 陷落修正——完成
- [x] 群交 HP 修正——`hp-mp.ts` 重写 + `settle_hp_mp` effect
- [x] 射精衰减——`calcSemenAbsorb` + `penis_dirty_dict` + H 中 tick
- [ ] 被发现面板——隐奸系统 UI stub（`// TODO: 打开被发现面板`）
- [x] 精液污染追踪——`pl_penis_semen_dirty` 前提注册 + TOML 转换
- [ ] jj_0/1/2/3 前提——射精后阴茎硬度/状态等级。erArk `jj_0~4`，需在 h-core 或 h-ejaculation 中注册 premise handler，检查 `h_state.just_shoot` 或 `h_state.shoot_semen_amount`
- [x] 饥饿系统——`hunger-system` 插件完整实现：
  - `eat_food` effect: 扣背包→减饥饿→消化CD→回HP/MP
  - `game:hour_changed` 自动增长 (erArk 公式) + 消化衰减
  - `game:new_day` NPC 每日口粮
  - NPC 自动进食（背包有食物时）
  - 配置化：h-config.toml `[hunger]` 段，mod 可 patch
  - 默认食物：干粮/饮水/甜点
  - 条件表达式：`selected.饥饿值 > 190` 等直接可用
- [ ] 食物获取方式（后续）：
  - 商店购买
  - 烹饪/制作
  - 采集/打猎
  - NPC 一起吃饭好感加成
  - 特殊食物效果（加料/毒品/精液等）
- [ ] 目标榨精 ability[77]——`calcSemenAmount` 中因子(6)需目标角色ID和 `abilities.榨精.level`
- [ ] 精液存量检查——`calcSemenAmount` 中因子(7)：射精量不超出 `semen_point + extra_semen_point`
- [ ] 衣物精液追踪（`cloth_semen`）：
  - **涉及**：h-ejaculation（射精时同步追踪衣物精液）、talk-common CVP 检查（`CVP_A2_Dirty|C{槽位ID}_{op}_{val}`）、clothing-system（精液扩散/清洗）
  - **数据结构**：`ch.cloth_semen[slotId] = [0, current_ml, level, total_ml]`，同 `body_semen` 格式
  - **条件表达式**：`selected.cloth_semen.{slotName}.{索引} > N`，需在 `condition.ts` 中注册 `cloth_semen` 路径或提供别名
  - **入口**：射精时按射精部位关联的服装槽位增加精液（如阴道射精→内裤/下身），`update_semen_dirty` 的 erArk 等价函数
  - **前置依赖**：clothing-system 完整实现（14 槽位）、服装精液扩散（`settle_semen_flow`）

  > **背景**：纸娃娃地文口上中有 40 条检查精液污染的 CVP 码（`CVP_A2_Dirty|B0_G_1`），
  > 表示"目标全身皮肤精液量 > 1"。当前无法求值，条件被静默跳过。
  >
> **CVP_Dirty 格式**：`CVP_A2_Dirty|{前缀}{部位ID}_{比较符}_{值}`
> - `B` = 身体部位（B0=全身皮肤，B1-B8 对应各性感带）
> - `C` = 服装槽位（C0-C8 对应各装备槽）
> - talk-common 数据中**只用了 `B0`**（全身皮肤精液污染）
>
> **MVP 设计**：先只做全身污染计数，不在角色上细分到各部位/服装。
> 在角色上加 `semen` 数字字段（0~100），射精时增加，H 结束/洗澡时清零。
> 注册前提 handler 把 `CVP_A2_Dirty|B0_G_1` 映射为 `selected.semen > 1`。
>
> **扩展方向**：如果以后要做更细的精液追踪（精液沾到胸部/腿上等部位的纸娃娃描述），
> 把 `semen` 拆为 `body_semen[部位]` 和 `cloth_semen[槽位]` 两个数组，
> 对齐 erArk 的 B（身体部位）和 C（服装槽位）两套索引。
  >
  > **关联系统**：h-ejaculation（射精时增加）、h-core H 生命周期（结束时清零）。

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
