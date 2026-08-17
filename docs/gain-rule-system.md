# 条件获得规则系统 — gain-rule-system

> 通用「满足条件后获得xx」统一规则管线（2026-08-16 建，grill 定稿）。
> 复刻 erArk 的 TalentGain.csv / 硬编码条件获得函数 / 成就系统——统一为单一管线，
> 避免 erArk 的分散写法（表 + 8 个硬编码函数 + 38 处硬编码赋值）。

---

## 一、概念

**规则（Rule）** = 条件 + 效果 + 触发时机 + 作用实体。条件满足 → 执行效果。
统一支撑：天赋自动获得、物品/关系/属性奖励、事件触发奖励、成就达成。

**为什么统一**：天赋 gain、成就、条件奖励本质是同一件事（条件→效果），
erArk 分散在 CSV 表 + 硬编码函数 + 散落赋值；本系统收拢为一份数据格式 + 一个调度点。

**三条消费路径**：
1. 规则管线（本插件）——自动/事件/手动触发
2. 指令 effects（effect-system）——`grant_talent` / `remove_talent` 效果可直接写在任何指令/任务里
3. 任务 reward 步骤（quest-system）——effects 数组里写 `grant_talent` 等

---

## 二、数据格式

### 2.1 规则（`definitions/gain-rules.toml`）

```toml
[[rules]]
id = "npc_思慕_条件获得"        # 必填：唯一 ID（同文件内重复 → 加载期 error）
scope = "all"                  # player | all（逐角色扫描）| 固定角色 ID
when = "auto"                  # auto | event:{事件名} | manual
condition = "{self}.好感度 >= 100"   # 条件表达式（scope=all 时 {self} = 当前角色）
# needs = [{ type = "experience", id = 124, value = 50 }]  # 或语义化需求（与 condition 任一满足即过）
once = true                    # 达成后不再检查（缺省 true）
effects = [{ type = "grant_talent", params = { talent = "思慕" } }]
```

**触发时机（when）**：

| 值 | 说明 | 检查时机 |
|----|------|---------|
| `auto`（缺省） | 自动检查 | 玩家指令执行后（player + selected）、NPC 行为结算后（该 NPC）、睡觉时（全员） |
| `event:{事件名}` | 事件触发 | 事件发出时（如 `h:orgasm`、`relation:changed`） |
| `manual` | 手动确认 | UI 候选列表（`queryManualCandidates`），点确认后获得 |

**auto 检查是增量模型**（grill 定稿）：只有发生行为的角色才检查——
玩家指令后查 player（+selected）、NPC 行为结算时查该 NPC、睡觉时全量扫。
对齐 erArk `character_behavior.gain_talent(type=0)` + `sleep_settle.gain_talent(type=3)`。

**作用实体（scope）**：

| 值 | 含义 |
|----|------|
| `player`（缺省） | 玩家 |
| `all` | 所有角色（条件里 `{self}` 占位符在求值前替换为 selected 并同步当前角色；`selected.xxx` 同理） |
| 固定角色 ID | 直接作用于该角色 |

- **once 状态**：达成记录按 scope 存——player/角色存 `char.rule_state[规则ID]`，global 存存档全局表（L3 引擎独占字段，存档持久）。**效果执行成功后才标记**（失败可重试，不静默丢弃）
- **`once = false` 的规则**持续检查（配合 lose_condition 实现"可失去"语义）
- ⚠️ **once=true 与 lose_condition 互斥**：达成后规则被跳过，失去条件永不检查（加载期 warning 校验）——可失去的规则必须 `once = false`
- **premise(X) 前提可用**：求值上下文注入 `sourceId` = 当前检查角色（auto）或 role_mapping 映射的 source（事件）——前提 handler 按 AGENTS §8 读触发者
- **scope 校验**：scope 必须是 player/all/global/已定义角色 ID，否则加载期 warning（永不触发）

### 2.2 失去（lose_condition）

```toml
[[rules]]
id = "酒量天赋"
scope = "player"
when = "auto"
condition = "player.experience.94 >= 30"      # 获得：饮酒经验达标
lose_condition = "player.experience.94 < 30"  # 失去：饮酒经验低于阈值
once = false
effects = [{ type = "grant_talent", params = { talent = "酒量好" } }]
lose_effects = [{ type = "remove_talent", params = { talent = "酒量好" } }]
```

获得条件不满足 + 失去条件满足 → 执行 `lose_effects`（通常为 `remove_talent`）。
复刻 erArk 可失去素质（精液膨腹 <6000ml 失去、罩杯链跨阈值增减等）。

### 2.3 事件规则（event + event 根域 + role_mapping）

```toml
[[rules]]
id = "射精成就_第一次"
scope = "player"
when = "event:h:shoot"
condition = "event.character == 'player'"     # event 根域直接引用 payload
role_mapping = { source = "event.character" } # payload → 执行上下文角色
effects = [{ type = "record_achievement", params = { id = "first_ejaculation" } }]
```

- **event 根域**：条件引擎新增根域，payload 字段直接可引用（`event.character`、`event.partId`、`event.count`）
- **role_mapping**：把 payload 字段映射为执行目标——`source`（sourceId）/ `target`（selected 作用对象；条件里 `selected.xxx` 也指向该角色）
- 事件规则默认对玩家判定；`role_mapping.target` 指定动态角色（如绝顶者）
- ⚠️ **事件规则约束**（加载期校验）：必须声明 `condition`（否则永不执行）；**禁用 `{self}`**（事件规则只认 event 根域 + role_mapping）；不支持 needs

### 2.4 成就（`definitions/achievements.toml`）

成就是**带元数据的规则**（编译为规则 + `record_achievement` 效果），不建独立机制：

```toml
[[achievements]]
id = "初得绝学"
name = "初得绝学"
description = "首次获得顶级武学"
difficulty = 2            # 难度分级 1-6（显示元数据）
hidden = false            # 隐藏成就：达成前面板不显示（UI 层消费）
pre_id = "入门弟子"        # 前置成就（显示链用；真正的前置校验写 condition）
scope = "player"          # player | 固定角色ID | global
when = "auto"             # auto | event:xxx
condition = "count(player.abilities.tags.legendary) >= 1"
effects = []              # 可选：达成时附带奖励
```

**三态 scope**（grill 定稿——覆盖"玩家达成 vs 角色达成 vs 全局"）：

| scope | 记录位置 | 说明 |
|-------|---------|------|
| `player`（缺省） | `player.achievements[ID]` | 玩家成就 |
| 固定角色 ID | `char.achievements[ID]` | 角色级成就（每角色独立账） |
| `global` | 存档全局（gameStateProviders） | 存档级唯一池（erArk cache.achievement 同义） |

**条件路径**：`player.achievements.{id}` / `character.{id}.achievements.{ach}`（boolean）。

**里程碑/聚合型成就**：用 `count(path)` 聚合查询（条件引擎通用扩展）：
```toml
condition = "count(player.records.h_partners) >= 10"   # 与超过10人H过
```
`count()` 支持数组长度 / 对象键数；缺失返回 0。复杂聚合用 `condition_script`。

### 2.5 天赋 gain 语法糖（兼容保留）

`talents.toml` 内嵌 `gain` 字段**保留为语法糖**，加载期自动编译为规则
（零数据改动，现有 170+ 天赋不受影响）：

```toml
[talents."窄域时停"]
max = 1
gain = { needs = [{ type = "experience", id = 124, value = 50 }] }  # 编译为 auto 规则
```

编译语义（erArk gain_type）：
- `gain_type = 0`（缺省）→ auto（指令后 + NPC 结算）
- `gain_type = 3` → auto（只在睡觉时检查）
- `gain_type = 1` → manual（手动候选）
- `gain_type = 2` → 不实现（erArk 自身死代码，指令绑定由指令 effects 直接写）

编译产物：`id = "talent:{天赋ID}"`，scope = all，once = true，effects = [grant_talent]。

---

## 三、效果类型

本插件注册（可在任何指令/任务/规则 effects 中使用）：

| 类型 | 说明 |
|------|------|
| `grant_talent` | 让目标获得天赋（等级+1，写日志，处理 `replace` 升级链）——`params.talent` |
| `remove_talent` | 让目标失去天赋（删除条目 + 日志）——`params.talent` |
| `record_achievement` | 记录成就达成（按成就定义 scope 记入）——`params.id` |

与 effect-system 核心效果（set_field/add_item/modify_relation 等）自由组合。

---

## 四、公共 API（namespace: `gain-rule-system`）

| 方法 | 签名 | 说明 |
|------|------|------|
| `checkAuto` | `(charId, context: 'execution'\|'npc-settle'\|'sleep')` | 检查单角色 auto 规则（npc-ai 结算通道 / 睡觉 / 调试） |
| `checkAll` | `(context?: 'sleep')` | 全量检查所有角色 |
| `queryManualCandidates` | `(charId) => CompiledRule[]` | 手动候选（UI 待用户设计时接线） |
| `confirmManual` | `(charId, ruleId) => boolean` | 手动确认（跳过条件直接执行） |
| `listRules` | `() => CompiledRule[]` | 编译后规则列表（调试/校验） |
| `isAchievementUnlocked` | `(achId, targetId?) => boolean` | 成就达成查询（UI 面板用） |
| `getGlobalAchievements` | `() => Record<string, boolean>` | 全局成就表 |

---

## 五、与其他系统的交互

- **effect-system**：效果执行走 `ctx.api.call('effect-system', 'execute', ...)`（唯一效果执行器）
- **npc-ai-system**：`settleOne` 每角色结算后调 `checkAuto(charId, 'npc-settle')`
- **sleep-system**：`updateSleepAll` NPC 分支调 `checkAuto(c.id, 'sleep')`
- **command-executor**：移除原 checkTalentGain 调用——本插件监听 `game:execution_end` 检查 player + selected
- **save-system**：global 成就经 `registerGameStateProvider('gain-rule-system:achievements')` 存档持久化
- **条件引擎**：新增 `event` 根域 + `count()` 聚合查询（core 通用扩展，任何 mod 条件可用）

---

## 六、三层 override

| 层 | 来源 | 说明 |
|----|------|------|
| 1 | `src/plugins/*/data/default/gain-rules.toml` / `achievements.toml` | 插件默认规则/成就 |
| 3 | `mods/[mod]/definitions/gain-rules.toml` / `achievements.toml` | mod 定义（同名 id 覆盖插件默认） |

跨层同名 id → mod 覆盖插件默认；同文件内重复 id → 加载期 error。

---

## 七、校验

- 规则/成就 id 缺失或同文件重复 → 加载期 error（含文件名）
- `condition` / `lose_condition` 引用未知字段 → warning（conditionRegistry 校验，不阻止加载）
- `event.*` 字段动态不静态校验（payload 结构由事件方定义）
- 成就 `pre_id` 仅显示元数据，无强制链校验（条件表达真正前置）
