# random-event-system — 行为期随机事件系统使用手册

> 复刻 erArk 行为期随机事件（`Script/Design/event.py` + `data/Character_Event.json`）：行为挂钩 + 前提权重候选 + 加权随机 + 子事件选项 + 触发记录。
> erArk 源码对照：`Script/Design/event.py`（候选筛选/加权随机）、`Script/Design/character_behavior.py`（judge_character_status 触发流程）、`Script/UI/Panel/draw_event_text_panel.py` + `event_option_panel.py`（子事件选项）、`Script/Settle/default.py`（系统效果）。

---

## 1. 概念

**事件挂在"行为"上**：每个事件声明一个挂载键（`behavior`），当玩家完成一次指令结算或 NPC 开始一个新行为时，系统从该行为的候选事件池中按**前提权重**加权随机选一个触发：

1. **候选筛选**：行为桶 → adv 分桶（角色专属）→ 触发记录守卫 → 前提权重（0 淘汰，返回值即权重）→ 条件布尔门
2. **触发**：输出事件文本（插值后进叙事日志）→ 执行效果（effect-system）
3. **子事件选项**：父事件可挂起选项条，玩家选择后输出子事件文本 + 结算效果
4. **触发记录**：全时/今日两个集合（效果写入，每日重置，随存档）

世界因此"活着"：你赶路时遇到剑客、等待时有飞鸟掠过、NPC 休息时被你撞见、浴室传来可疑声响你可以选择进不进去。

## 2. 架构分层

```
src/core/random-event.ts               # 纯通用机制（不认识行为/角色/世界观）
src/plugins/random-event-system/
├── plugin.toml                        # 插件声明（condition_fields/事件监听）
├── index.ts                           # onLoad 校验 + onEnable 挂钩/API/存档
├── trigger.ts                         # 触发流程（文本输出/效果结算/选项挂起）
├── system-effects.ts                  # 系统效果注册（noop/记录/中断）
├── types.ts                           # PendingOption 等类型
└── data/default/events/*.toml         # 插件默认层事件（mod 可覆盖/新增）
```

- core 层：事件注册、候选筛选、加权随机、触发记录、文本插值 `{self.X}` —— 事件按任意字符串挂载键分组，`adv` 是任意字符串 id，语义全部由插件层赋予
- 插件层：行为挂钩时机（`game:execution_end` 玩家 / `npc:behavior_started` NPC）、TOML 数据、系统效果、选项条 UI 桥
- 玩家侧 `current_behavior` 镜像（L3 字段，与 npc-ai 共享）由本插件维护（= 刚完成的指令 id）；NPC 侧由 npc-ai-system 写入（行为块 id）

## 3. 数据格式

事件放在 `definitions/events/` 目录（按行为分文件），也可用单个 `events.toml`。插件默认层 `src/plugins/random-event-system/data/default/events/` 提供示例，mod 数据**累积式并入**（同 id 后者覆盖）。

```toml
# mods/武侠/definitions/events/move.toml
[[events]]
id = "move_see_swordsman"          # 唯一 id（英文 kebab）
behavior = "move"                   # 挂载键：玩家指令 id / NPC 行为块 id / move / wait
type = 0                            # 0|1 结算事件（合并语义）；2 = 静默事件
text = "{self.name}在赶路时遇到一位剑客。"   # 文本（{self.name}/{target.name}/{player.name}/{location.name} + talk-common {变量}）
effects = [
  { type = "modify_attribute", params = { attr = "体力", value = -5, target = "self" } }
]

[[events]]
id = "move_washroom_sound"
behavior = "move"
type = 0
text = "浴室传来声响，要进去看看吗？|你推开门，里面空无一人。"   # "选项文本|正文"
effects = [{ type = "open_son_options", params = {} }]          # 挂起子选项

[[events]]
id = "move_washroom_enter"
behavior = "move"
type = 0
text = "进去看看|你悄悄走了进去。"
option_son = true                    # 子事件标记
effects = [{ type = "modify_attribute", params = { attr = "hp", value = -5 } }]
```

**字段表**：

| 字段 | 必填 | 说明 |
|------|------|------|
| `id` | ✅ | 事件唯一 id（英文 kebab） |
| `behavior` | ✅ | 挂载键（玩家指令 id / NPC 行为块 id / move / wait） |
| `type` | ✅ | `0`/`1` 结算事件（合并语义）；`2` 静默事件（无文本时任意地点触发，仅效果） |
| `adv` | | 空=通用；非空=角色专属（角色 id） |
| `side` | | `self`（匹配触发者）/ `target`（匹配交互对象）/ `any` / `both`（erArk sys_1/sys_0 分桶） |
| `text` | | `"选项文本\|正文"`：子事件/父事件用 `\|` 分隔，触发时只显示正文；普通事件全文 |
| `premises` | | 前提 ID 列表（premiseRegistry 权重通道：0 淘汰，返回值即权重） |
| `condition` | | 现有条件表达式（布尔门） |
| `trigger_guard` | | `seen_once`/`unseen_once`/`seen_today`/`unseen_today`（配合记录效果） |
| `option_son` | | `true` = 子事件（父子匹配：子前提 ⊇ 父前提） |
| `effects` | | 效果列表（effectTypeRegistry，含系统效果） |

## 4. 触发时机

| 触发点 | 说明 |
|--------|------|
| **玩家** | 每次指令/移动/等待结算后（`game:execution_end`）——基于**刚完成的指令 id** 选择事件。`move` 指令例外：它只打开地图界面（map 模式）不经 commandExecutor，移动事件由**到达信号** `location:enter {from}` 触发（挂载键 `move`） |
| **NPC** | 每次新行为开始时（`npc:behavior_started`）——基于行为块 id 选择 |

**地点门控**：NPC 的**文本事件**仅当玩家与该 NPC 同地点时触发；**静默事件**（`text` 空）任意地点触发（效果照常结算，如破处标记类状态）。玩家不可见时（NPC 远处静默事件）效果数值结算**不输出**叙事日志（`_silent` + `narrative_output` 过滤，与 npc-ai 行为完成效果同语义）。

**交互对象（interactant）**：玩家事件 = 当前选中角色（`selectedCharacterId`）；NPC 事件 = 同地点玩家（无则 null）。事件效果省略 `target` 时默认作用于 interactant（无 interactant 时作用于触发者自己）。

## 5. 前提与条件

- **premises**：权重通道——复用 `premiseRegistry`（与口上/目标搜索同一体系），前提 handler 返回值即权重，任一返回 ≤0 整事件淘汰；无 premises 时权重 1
- **condition**：布尔门——现有条件引擎（`player.X`/`character.{id}.X`/`selected.X` 等），`selected` = 触发者
- 事件触发时 premise ctx 注入：`selectedCharacterId = sourceId = 触发者`，`targetCharacterId = interactant`

## 6. 子事件选项（option_son）

1. 父事件（效果含 `open_son_options`）触发 → 输出父正文（`text.split('|')[1]`）→ 从同行为收集子事件候选：
   - `option_son = true`、条件/前提/adv/守卫全部通过、且**子前提集合 ⊇ 父前提集合**
2. 候选挂起为**临时选项条**（IDLE 时显示在指令栏上方），选项文本 = `text.split('|')[0]`（已插值）
3. 玩家选择 → 输出子事件正文 + 结算子事件效果；不选直接执行其他指令 → 选项作废（父事件自身效果已结算）
4. 非阻塞：NPC 批量结算不等待玩家选择

## 7. 触发记录

- 两个全局集合：**全时**（`record_event` 效果写入）、**今日**（`record_event_today` 效果写入，`game:new_day` 时清空）
- 守卫（`trigger_guard`）：`seen_once`/`unseen_once`（全时）/`seen_today`/`unseen_today`（今日）——须在/须不在记录中才候选
- 记录随存档（gameState provider `random-event`），读档恢复

## 8. 系统效果

| 效果类型 | 对应 erArk | 说明 |
|----------|-----------|------|
| `noop` | 9999 | 无操作空结算 |
| `record_event` | 10008 | 记全时触发记录（机制保留；erArk 数据零使用） |
| `record_event_today` | 10009 | 记今日触发记录 |
| `open_son_options` | 10001 | 挂起子事件选项条（需同行为存在通过筛选的子事件） |
| `set_interactant` | 10002/10005/10006/10007/10013 | 改写后续效果的交互对象：`mode = "player"`（目标改玩家）/ `"self"`（目标改自己）/ `"player_target_to_me"`（玩家选中改自己——gameContext 立即生效 + 广播 `random-event:select_character` 供 bridge 同步 UI 选中）/ `"masturbator"`（同地点手淫者）/ `"most_desire"`（同地点 `ATTR.DESIRE` 最高者） |
| `interrupt_activity` | 10000 | 中断目标活动（npc-ai setBehavior wait；无规格降级跳过） |

**与 erArk 的有意偏差**（记录在案）：多层事件（CVP_A1_Son/Father 数据零使用）、效果 10008 数据零使用（机制保留）、10010/10011（群交开关）/10012（跳过口上）数据零使用不实现、DIY 指令（CHARA_DIY_INSTRUCT）不在本系统。

## 9. API（namespace `random-event`）

```typescript
ctx.api.call('random-event', 'triggerFor', subjectId, behaviorId, targetId)  // → Promise<void>（手动触发一次事件选择与结算）
ctx.api.call('random-event', 'chooseOption', index)                          // → Promise<boolean>（玩家选择子事件选项）
ctx.api.call('random-event', 'getPending')                                  // → PendingOption | null（{behaviorId, subjectId, targetId, fatherId, options: [{eventId, text}]}）
ctx.api.call('random-event', 'clearPending')                                // → void（作废挂起选项）
```

**UI 事件**（engine-ui-bridge 同步）：
- `random-event:options` `{fatherId, options}` → 显示选项条
- `random-event:options_clear` → 清除选项条（玩家选择/新行动开始/插件主动清空）

## 10. 与其他系统的交互

| 系统 | 关系 |
|------|------|
| npc-ai-system | NPC 事件挂载在行为块 id 上（`npc:behavior_started` 触发）；`interrupt_activity` 调 npc-ai API |
| dialogue-system / talk-common-system | 事件文本插值复用 talk-common 词库（`{变量}`）+ dialogue 风格占位符（`{self.X}`） |
| effect-system | 事件效果走 effect-system 统一执行（含 target 解析）；系统效果注册在 effectTypeRegistry |
| save-system | 触发记录经 gameState provider 随存档（core 提供注册表） |
| UI | 选项条经事件总线 → engine-ui-bridge → ui-store；布局组件渲染 EventOptionBar |

## 11. 验证

- 单元：`src/core/random-event.test.ts`（分桶/权重/守卫/记录/插值）
- 集成：`src/plugins/random-event-system/random-event-system.test.ts`（玩家/NPC 触发、地点门控、静默事件、子事件选项、触发记录、插值、存档接线）
- 全量：`npm run typecheck && npm run test`
