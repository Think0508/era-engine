# 行为期随机事件系统：core 机制 + 插件挂钩，统一行为 ID 挂载

2026-08-10 决策。复刻 erArk 行为期随机事件（`Script/Design/event.py`），此前在 npc-ai-system 中被标记"后续独立规划"。本文记录 grill 定稿的架构决策（16 项）。

## 背景

erArk 的随机事件 = 行为期事件：事件挂在行为 id 上，行为结算时按前提权重加权随机触发，支持子事件选项、触发记录、DIY 指令。我们引擎无此系统，但"前提权重 + 加权随机"模式已在 talk-common-system（口上）和 npc-ai-system（目标搜索）落地——本系统复用同一体系。玩家侧此前**没有行为概念**（只有 mode 与指令 id），需要先解决挂载点。

## 决策

### D1 范围
完整复刻核心机制：行为挂钩 + 候选筛选 + 加权随机 + 文本插值 + 效果结算 + 子事件选项 + 触发记录。排除：多层事件（CVP_A1_Son/Father 在 erArk 数据中**零使用**，死代码）、效果 10008/10010/10011/10012（数据零使用）、DIY 指令（CHARA_DIY_INSTRUCT，与指令系统深度耦合）、H 内 NPC AI（独立规划）。

### D2 统一行为 ID 挂载
事件挂载键 = 任意字符串行为 id。玩家侧：实体镜像字段 `current_behavior`（L3，与 npc-ai 共享）由事件插件维护 = 刚完成的指令 id（`game:execution_end {commandId}`），移动/等待 = `move`/`wait`。NPC 侧：行为块 id（npc-ai 已写）。引擎不预设任何挂载键。

### D3 分层
- **core/random-event.ts**（通用机制）：事件注册/候选筛选/加权随机/触发记录/`{self.X}` 插值。不认识"行为/角色/adv"语义——挂载键与 adv 都是任意字符串。
- **plugins/random-event-system/**（行为挂钩）：触发时机监听、TOML 数据层、系统效果、选项条 UI 桥、存档 provider、数据校验。

### D4 触发时机
玩家：每次指令结算后（`game:execution_end`）。NPC：新行为开始时（`npc:behavior_started` 同点）——与 erArk 的 NPC 判定频率等价（blankly/move 决策周期）。

### D5 前提双通道
`premises`（premiseRegistry 权重通道，0 淘汰，返回值即权重）+ `condition`（布尔门）——与 ai-targets.toml 一致。特殊守卫（`trigger_guard` 四种）内置系统处理，不走前提注册表。

### D6 玩家接入插件自治
事件插件自己监听 `game:execution_end` 写玩家 `current_behavior` 并触发，core 零改动。

### D7 文本插值
先 talk-common 词库引用替换（`{变量}`，走 API，未就绪降级原样），再 `{self.X}/{target.X}/{player.X}/{location.X}` 实体替换（core 通用插值）。

### D8 选项 UI：非阻塞挂起
父事件触发即输出文本 + 挂起选项条（IDLE 时指令栏上方），settle-pass 不等待；玩家选择 → 子事件文本 + 效果；不选而执行新指令 → 选项作废（父事件自身效果已结算）。临时选项条不进 dialogue mode、不碰对话树。

### D9 触发记录效果驱动
全时 + 今日两个集合（今日 `game:new_day` 清空），写入由效果驱动（`record_event`/`record_event_today`），守卫由 `trigger_guard` 声明；记录经 save-system 的 gameState provider 注册表随存档。

### D10 交互目标：事件上下文 interactant
不引入 NPC 持久 `target_character_id` 字段。事件触发时计算 interactant（玩家事件 = selectedCharacterId；NPC 事件 = 同地点玩家），效果 target 解析到 interactant；`set_interactant` 在事件结算内改写后续效果的目标（mode: player/self/player_target_to_me/masturbator/most_desire）。

### D11 type 语义
数据保留 `type` 字段（0/1/2 兼容 erArk），实现上 0/1 合并（同一触发点）；`type=2` 保留静默语义（无文本时任意地点触发，效果照常结算）。skip_instruct_talk（10012）数据零使用，不做。

### D12 地点门控
NPC 文本事件需玩家同地点（系统级强制，mod 不必每个事件写位置前提）；静默事件任意地点。

### D13 数据布局
`definitions/events/` 按行为分文件（`move.toml`/`wait.toml`/...），插件默认层 `data/default/events/`，累积式并入（同 id 后者覆盖），core 加载只做通用数据桶 + 缺 id/behavior 报错。

### D14 存档扩展
core save-system 新增**通用** gameState provider 注册表（`registerGameStateProvider({id, serialize, restore})`）——事件插件的触发记录经此随存档；core 不认"事件记录"语义。

### D15 效果目标默认值
事件效果省略 `target` 时默认作用于 interactant（erArk 事件效果默认作用于触发者；interactant 缺省回退触发者自己）——经 effect-system 的 selected 通道解析（execCtx.uiStore.selectedCharacterId = interactant ?? subject）。

### D16 系统效果映射
noop(9999)/record_event(10008, 机制保留)/record_event_today(10009)/open_son_options(10001)/set_interactant(10002/05/06/07/13 统一入口)/interrupt_activity(10000, 调 npc-ai setBehavior wait)。

## 与 erArk 的有意偏差表

| 项 | erArk | 本引擎 | 理由 |
|----|-------|--------|------|
| 多层事件（Father/CVP_A1_Son） | 代码有机制 | 不实现 | 数据零使用（死代码惯例） |
| 全时记录效果 10008 | 存在 | 机制保留、数据零使用 | 同上 |
| 群交开关 10010/10011 | 事件效果 | 不实现 | 数据零使用；群交由 h-group-sex 管理 |
| 跳过口上 10012 | type2 事件抑制口上 | 不实现 | 数据零使用；指令口上管线未全建 |
| DIY 指令（CHARA_DIY_INSTRUCT） | 事件驱动自定义指令 | 排除 | 与指令系统深度耦合，独立规划 |
| 远处 NPC 事件效果 | 效果照常结算 | 静默事件照常；文本事件需同地点 | 叙事一致性 + mod 免写位置前提 |
| 选项阻塞 | 选项面板阻塞结算循环 | 非阻塞挂起 | settle-pass 批量结算不可阻塞 |
| 事件文本顺序 | 事件文本先于指令结算输出 | 指令结算后输出 | 触发点固定在 execution_end |

## 影响

- `src/core/`：新增 `random-event.ts`（通用机制）、save-system 加 gameState provider 注册表、mod-loader 加 events 数据桶
- `src/plugins/random-event-system/`：新插件（触发挂钩/数据/系统效果/UI 桥）
- `src/ui/`：ui-store 加 eventOptions、bridge 监听两个事件、EventOptionBar.vue 挂载到探索/现代布局
- 文档：`docs/random-event-system.md`（手册）、plugin-author-guide 加 API 表、master-todo 移除后置项
