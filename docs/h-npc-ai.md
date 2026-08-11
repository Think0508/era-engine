# h-npc-ai —— H 内 NPC AI 系统

> 复刻 erArk `handle_npc_ai_in_h.py`（711 行）+ `handle_npc_ai.py` 的 H 分支。
> 本次交付（2026-08-11 grill 定案）：① 每时间片 H 状态判定 + 完整疲劳/HP 退出；
> ⑤ 逆推 AI（NPC 主动 H）；⑥⑦ 群交 AI；**②④③ 无意识组**（2026-08-11 随睡眠系统 L1.7 落地）。后置项见文末。

## 1. 概念与定位

H 场景中玩家执行 H 指令时，NPC 不是木偶——它们被"锁定"在 H 中（不跑日常 AI），
且在特定机制下**主动行动**：逆推（NPC 主导选行为让玩家执行）、群交补位/自慰/抢占。

| 能力 | erArk 对照 | 本引擎机制 |
|------|-----------|-----------|
| ① 每时间片 H 状态判定 | `judge_character_h_obscenity_unconscious` | 挂 `game:time_advanced`，锁死确认/不同地点结束 H/群交 AI 触发 |
| 疲劳/HP 退出 | `handle_npc_ai.py:38-134` | 三路分流：NPC 普通 H / NPC 群交 / 玩家；无意识目标只查 HP（睡奸不被疲劳中断） |
| ⑤ 逆推 AI | `npc_active_h` + `evaluate_npc_body_part_prefs` | 部位喜好加权 → 指令过滤链 → 随机选赋给玩家执行 |
| ⑥⑦ 群交 AI | `npc_ai_in_group_sex` + `_type_3` | type 1 自慰 / 2 补位 / 3 抢占 |
| ② 睡奸实时结算 | `realtime_settle.settle_sleep_h` | `settleSleepH`（per-tick 玩家分支：熟睡值 -= 3t，WAIT/安眠药规避吵醒） |
| ④ 醒来判定 | `judge_weak_up_in_sleep_h` | `judgeWeakUpInSleepH`（weak_rate 公式 + randint(1,100)） |
| ③ 恢复流程 | `recover_from_unconscious_h` + `handle_npc_instruct_condition` + `settle_unconscious_semen_and_cloth` | `recoverFromUnconsciousH`（装睡继续/结束 + 二段结算 + 时间推进 5 分钟） |

**核心模型（grill Q4 定案）**：H 中 NPC 的行为状态复用 npc-ai-system 的
`ai_behavior` 行为块，注册 `h_*` 类型：

- `h:start` → 参与角色行为块置 `h_wait`（12h duration）——npc-ai-system 跳过集
  （`in_h`）冻结不结算，日常 AI 与 H 完全隔离
- `h:end` → 所有 `h_*` 行为块置 `h_end`（duration=0 立即过期）→ 下次 settle-pass
  自动完成结算 + 重新决策——**日常 AI 衔接零胶水**

## 2. 架构分层

```
src/plugins/h-npc-ai/
├── plugin.toml            # 依赖 h-core/h-group-sex/npc-ai-system；监听 4 事件
├── index.ts               # onLoad（4 效果类型）+ onEnable（前提/事件/API/tag 校验）
├── state.ts               # 行为块管理（h_wait/h_end）+ H 状态工具
├── per-tick.ts            # ① 每时间片判定 + 疲劳/HP 退出
├── active-h.ts            # ⑤ 逆推执行器 + 部位喜好 + 夺回判定
├── group-sex-ai.ts        # ⑥⑦ 群交 AI
├── filter.ts              # 指令过滤链 + tag 词表校验
└── data/default/instructions/
    ├── h-npc-ai.toml      # 逆推 3 指令（正式）
    └── h-npc-ai-test.toml # 【测试指令】仅验证机制，非正式内容
```

**依赖方向**（全部经 API/事件，无直接 import）：

```
npc-ai-system ──setBehavior 语义被复用（直接写 ai_behavior 实体字段）──┐
h-core ──endHScene/calcJudge/premise──┐                                 │
                                       ▼                                 ▼
h-npc-ai ◀── group_sex:template_execute 事件 ── h-group-sex（只发事件，单向）
```

## 3. 数据格式：指令 tag 词表（契约）

逆推/群交 AI 靠指令 tag 选择行为。词表（h-npc-ai 启动校验，未知值 warning）：

```
part:breast|clit|vagina|anus|urethra|womb   # 逆推部位（erArk N/B/C/V/A/U/W）
part:mouth|hand|penis|worship               # 群交槽位
flag:first-time                             # 破处类（逆推对处女跳过）
flag:no-active                              # 非逆推类（逆推排除）
flag:control                                # 控制类（keep_enjoy 等——NPC 过滤链排除，防自循环）
```

- 道具/药物/SM 排除用现有 `sub_category`（item/drug/sm），不新增 tag
- 破处键映射：part:vagina→virgin_V / anus→virgin_A / urethra→virgin_U / womb→virgin_W
  （h-first-time 插件的 `char.first_times`）

**过滤链**（`filter.ts`，对齐 erArk npc_active_h:479-537）：
`source=instructions` → `category==sex` → 排除 `sub_category∈{item,drug,sm}` →
排除 `flag:control`（控制类指令，防逆推自循环）→ 排除 `flag:no-active` → 破处跳过 →
部位 tag 匹配 → 前提评估（非严格）→ **条件表达式评估**（与 command-executor 运行时
同上下文——condition 不满足的指令选中后也不执行，提前排除保证"选中必执行"一致性，
防逆推经验空加）→ 均匀随机

## 4. 功能详解

### ① 每时间片判定（per-tick.ts）

`game:time_advanced` 触发 `judgeCharacterHStateTick(minutes)`：

| 检查 | 行为 |
|------|------|
| 玩家体力 ≤1 | 结束 H（群交中连带关模式） |
| 玩家 flag 归零（erArk :48-81） | just_shoot 递减（1→2→0）、手/口/胸类清体位数据、口交后清阴茎污浊、子宫性交位置清零 |
| NPC 不在玩家场景且 is_h | 结束 H（防御性，群交中按剩余人数分流） |
| NPC is_h 或木头人 | 时停 NPC 跳过；群交中 type 1/2 触发群交 AI |
| NPC H 中窗口结算 | 疲劳/尿意/饥饿积累（erArk WAIT 行为——跳过集冻结了 npc-ai 窗口结算，此处补齐，H 不会无限持续） |
| NPC 体力 ≤1 **或** 疲劳等级 ≥2（疲劳度 >134.4） | 普通 H → endHScene；群交 → 移出模板 → 剩 1 转单人 / 剩 0 结束 |

绝顶判定/道具 tick 等二段结算由 h-core `game:execution_end` 负责（不重复）。

### ⑤ 逆推 AI（active-h.ts）

**部位喜好**（`evaluateBodyPartPrefs`，erArk :390-458）：部位 0-7
（0 乳/1 胸/2 阴蒂/4 阴道/5 肛门/6 尿道/7 子宫，3 阴茎强制排除），
权重 = 1 + 部位经验（`experience[partId]` 权重 1）+ 性技能力等级×10
（乳/胸←胸技、阴蒂/尿道←指技、阴道/子宫←膣技、肛门←肛技——能力映射为近似，
erArk config_ability 表未随提取目录提供，见文档附录）。

**执行器**（`npcActiveH`，erArk :460-553）：检查 `npc_active_h`/`hypnosis.active_h` →
部位加权随机 → 过滤链 → 均匀随机选指令 → **赋给玩家执行**（方向不变，玩家→NPC，
前提仍玩家视角——`T_NPC_NOT_ACTIVE_H` 在逆推中因目标=NPC 是 active 而失败，普通指令
自然隐藏，erArk 同款自洽）。执行后结算逆推经验（erArk settle_behavior.py:675-680）：
NPC 经验 36（逆推）+1、玩家经验 37（被逆推）+1。

**3 条配套指令**（data/default/instructions/h-npc-ai.toml）：

| 指令 | 前提 | 效果 |
|------|------|------|
| `change_top_and_bottom` 交给对方 | T_NPC_NOT_ACTIVE_H + TARGET_IS_H | `npc_active_h_on`（目标开启逆推） |
| `keep_enjoy` 继续享受 | T_NPC_ACTIVE_H + TARGET_IS_H | `npc_active_h_act`（触发执行器） |
| `try_pl_active_h` 尝试掌握主动权 | T_NPC_ACTIVE_H + TARGET_IS_H | 复用实行判定（judge_class=掌握主动权，base 默认 150） |

`try_pl_active_h` 成功 → 关闭逆推 + 叙事；失败 → 继续逆推 + 纯叙事（无惩罚，
erArk 数据完全无记录，本引擎设计，grill Q8 定案）。
**判定类说明**（2026-08-11 链路审查）：专用 judge_class `掌握主动权`（S 类，
h-core judge.ts 注册）——吃天赋个性修正（淫乱/性无知等），但不套用
`[judge.adjustments]` 的处女惩罚（"性交"类 -250 语义是拒绝性交，套在交还主导权上
错位：处女逆推反而不可夺回）。base=150：心情修正愤怒保底 +20，base=100 恒成功
（失败路径死代码）；150 需好感/信赖/状态/陷落支撑才能夺回。

**逆推循环**（erArk 同款）：玩家选 keep_enjoy → NPC 选行为 → 玩家被动执行 10 分钟
（指令 time_cost）→ 回指令面板（此时因前提过滤只剩逆推专属指令 + wait 类）→ 再选。
挂机 = 无限等待（回合制无超时）。逆推中 `end_h` 因 `T_NPC_NOT_ACTIVE_H` 隐藏——
无法正常结束 H（erArk 同，退出只能夺回主动权或 H 中断）。

### ⑥⑦ 群交 AI（group-sex-ai.ts）

模板数据在 h-group-sex（`getTemplate` 返回可变引用，经 API 通道改槽位）。
槽位行为标识 = **指令 id（string）**（grill Q10 定案，取代 erArk 数字 behaviorId）。

| type | 触发 | 行为 |
|:----:|------|------|
| 0 | — | 什么都不做 |
| 1 | 每时间片 | 自慰（行为块 h_masturebate + 叙事） |
| 2 | 每时间片 | 空槽随机选 + 槽位部位 tag 过滤指令随机选 → 写模板；无空槽自慰 |
| 3 | 模板执行时 | 抢空槽（随机角色）→ 50% 替换已占槽（worship 追加+踢首位）→ 剩余自慰 |

type 3 由 h-group-sex 发 `group_sex:template_execute` 事件触发（h-group-sex 只发事件，
单向依赖保持）。事件由 `run_group_sex_template` 指令（h-group-sex 注册，2026-08-11
接线：执行一次模板 = 槽位指令 effects 结算 + 推进 10 分钟）发出——链路：
`run_group_sex_template → executeGroupSexTemplate → 事件 → type 3 抢占 → 槽位结算`。
被绳缚 NPC 不参与群交 AI（erArk handle_self_now_bondage）。

## 5. API（namespace `h-npc-ai`）

| 方法 | 签名 | 说明 |
|------|------|------|
| `isActiveH` | `(charId) => boolean` | 查询 NPC 逆推状态（含催眠 active_h） |
| `setActiveH` | `(charId, on) => void` | 手动开关逆推 |
| `triggerActiveH` | `(npcId) => Promise<boolean>` | 触发一次逆推执行器 |
| `tryActiveH` | `(npcId, judgeBase?) => Promise<boolean>` | 尝试夺回主动权 |

**效果类型**（onLoad 注册，指令/脚本可调用）：`npc_active_h_on` / `npc_active_h_off`
（开关目标逆推）、`npc_active_h_act`（触发执行器）、`try_pl_active_h`（夺回判定，
`params.base` 可选默认 100）。

**前提**（注册在 h-core premise-instruct.ts——2026-08-11 从恒 false 占位升级真语义）：
`T_NPC_ACTIVE_H` / `T_NPC_NOT_ACTIVE_H` / `NPC_ACTIVE_H`（读 `h_state.npc_active_h`
+ `hypnosis.active_h`）；h-core premise-h.ts 补 `TARGET_IS_H` / `TARGET_NOT_IS_H`。

**事件**：

| 事件 | 方向 | 说明 |
|------|------|------|
| `game:time_advanced` | 监听 | ① 判定主挂点 |
| `h:start` / `h:end` | 监听 | 行为块 h_wait / h_end |
| `group_sex:template_execute` | 监听 | type 3 抢占（h-group-sex 发出） |
| `npc:behavior_started` | 消费 | H 结束后的日常行为宣告（npc-ai-system 发） |

## 6. 与其他系统交互

| 系统 | 交互 |
|------|------|
| npc-ai-system | 行为块 h_* 类型冻结/衔接；跳过集 `in_h` 保证不双算 |
| h-core | endHScene（H 归零）、calcJudge（夺回判定）、前提注册、h:start/h:end |
| h-group-sex | 模板读写（getTemplate 引用）、group_sex_mode 开关效果、模板执行事件 |
| h-first-time | 破处过滤（first_times virgin_* 键） |
| h-time-stop | 时停 NPC（unconscious_h=3）跳过锁死判定 |
| UI | CommandBar h_scene 前提过滤（最小版，见 §7） |

## 7. UI（最小版）

CommandBar 在 `h_scene` 模式下对指令做**前提实时过滤**（满足才显示，erArk 隐藏制）。
逆推中普通指令因 `T_NPC_NOT_ACTIVE_H` 失败隐藏，只剩逆推专属指令。

⚠️ **最小版标注（2026-08-11）**：仅为前提过滤，完整版（部位/子类分组渲染、
逆推面板完整呈现等）由用户后续立即扩展——见 master-todo L1.10-6。

## 8. 测试

`src/plugins/h-npc-ai/h-npc-ai.test.ts`（20 条，全插件加载）：
前提注册/过滤链/破处/部位喜好/逆推执行/keep_enjoy 链/① 判定/行为块衔接/疲劳退出
三路/群交 AI 三型/槽位指令 id 映射。测试指令见 §3 数据文件（标注【测试指令】）。

## 9. 已知偏差（与 erArk 对照）

| 项 | erArk | 本引擎 | 说明 |
|----|-------|--------|------|
| change_top_and_bottom 前提 | 含 T_NORMAL_5_6/TARGET_NOT_BONDAGE/GROUP_SEX_MODE_OFF | 省略 | T_NORMAL_5_6 随 L1.7、TARGET_NOT_BONDAGE 随绳艺、GROUP_SEX_MODE_OFF 随群交大改（TODO） |
| try_pl_active_h | 数据完全无记录 | 复用实行判定（专用类'掌握主动权'，base 默认 150，2026-08-11 调整） | 本引擎设计（grill Q8）；处女惩罚不套用（语义错位） |
| 逆推部位能力映射 | ability_id 直映射 | 性技近似映射 | erArk config_ability 表缺失 |
| 群交 AI 叙事 | debug print | 简短叙事 | 群交玩法即将大改，文本从简 |
| 群交模板 | 数字 behaviorId | 指令 id string | 引擎指令体系一统（grill Q10） |
| 群交加入流程 | 邀请/拒绝/前往 | 后置 | h-group-sex join 指令 TODO |
| 无意识分支 | 完整 | 后置 | 依赖 L1.7 睡眠系统 |

## 10. 后置项（master-todo L1.10）

1. ~~无意识组 ②④③（睡奸恢复/醒来/继续 H 判定 + 无意识二段结算）~~ **已完成（2026-08-11，随 L1.7 睡眠系统）**——
   继续H判定简化（陷落系统未实装 → 恒装睡继续，TODO 接真实判定）；无意识二段行为（second-behavior 未实装 → 数据清零 + TODO）
2. 性爱助手 sex_assist——依赖监禁调教系统 + 缺失源码
3. 催眠体控-逆推自动触发 H（效果 1228）——归 h-hypnosis
4. 群交玩法大改 + 模板编辑器 UI + 加入流程 + run_group_sex_template 指令
5. SEX 指令数据批次落地（B3-B6 补 tag）——逆推/群交 AI 的正式数据基础
6. h_scene UI 完整版
7. 逆推前提补全（T_NORMAL_5_6 等）
