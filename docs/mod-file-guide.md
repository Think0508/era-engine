# Mod 文件字段字典（mod-file-guide）

> 面向：不写代码的 mod 作者。**逐文件查字段**：能写什么、以什么形式写、区间、默认、不写会怎样。
> 配套：
> - **照猫画虎范例**：`mods/example-mod/`（每个文件真实可跑 + 教学注释，复制改 id 即用）
> - **手把手流程**：`docs/mod-workflow.md`（从 0 到 500 角色的开发路径）
> - **角色字段分层**：`docs/character-schema.md` §11（L1 能写 / L2 罕见 / L3 别碰）
> - **数据层级**：低→高 = 插件默认层 → mod 定义层 → 角色模板 → 具体角色 → 存档（合并规则：同 key 覆盖 / 对象深合并 / **数组整表替换** / `= null` 删除）

## 怎么用

1. 复制 `mods/example-mod/` → `mods/你的mod名/`
2. 改 `meta.toml` 的 id/name/title，其余文件照抄结构、改数值
3. 想查"某个字段能不能写、默认多少" → 翻本文件对应节
4. 写完跑 `npm run validate` 校验（0 error 即数据结构合法）

**example-mod 的 definitions 已示范全部可写类型**（每个都有真实示例 + 教学注释）：

| definitions 文件 | 示例演示了什么 |
|------------------|----------------|
| attributes.toml | 改默认值、新增自定义属性（气血/内力） |
| abilities.toml | 新增能力、技能树 unlocks（吐纳术→龟息功） |
| talents.toml | 新增天赋（天生神力） |
| relations.toml | 新增关系类型（师徒值） |
| status-effects.toml | 新增状态（振奋）含 tick_effects |
| items.toml | 新增物品（回气丹/布衣/长裤） |
| equipment.toml | **整表替换**：默认 9 槽 + 新增披风槽 |
| h-config.toml | 改 hunger 配置、数组整表替换写全 judge.adjustments |
| calendar.toml | 文化月份/星期名 |
| scene-dialogue.toml | 场景通用口上（旁白） |
| character-dialogue.toml | 角色通用口上（500 人 fallback） |
| sets.toml | 套装（布衣+长裤 组合加成） |
| talk/styles.toml | 口上样式 |
| instructions/*.toml | 自定义指令（打坐：属性/状态/时间/叙事闭环） |

---

## 1. meta.toml —— 模组元信息（必写）

| 字段 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `id` | string | ✅ | — | 模组唯一 ID（文件名无关） |
| `name` | string | ✅ | — | 显示名 |
| `version` | string | ✅ | — | semver（1.0.0） |
| `title` | string | — | — | 标题界面文字 |
| `description` | string | — | — | 模组简介 |
| `player_character` | string | — | — | 玩家实体 ID（须在 roster.toml 定义） |
| `starting_location` | string | — | — | 新游戏起始地点 ID（须在 maps/locations/ 存在） |
| `dependencies` | 数组 | — | — | 插件依赖 `{ plugin, version }`（semver 约束） |
| `[creation].steps` | 数组 | — | — | 角色创建流程（input/choose） |

不写会怎样：缺 id/name/version → 加载报错；其余缺 → 用默认行为。

## 2. bindings.toml —— 属性绑定（重命名映射）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `[bindings.插件ID]` | 表 | ✅ | 插件声明的 required_attributes 才有意义 |
| `通用名 = "属性名"` | string | ✅ | 插件要的 hp → 你的「气血」 |

不写会怎样：mod 未启用声明了必绑属性的插件 → 无影响；启用了 → 缺绑定加载报错。
注意：只能映射**插件声明**的属性；h-core 代码硬编码的属性名不能靠它改名。

## 3. theme.toml —— 主题变量（必写最小集 26 个）

| 字段 | 类型 | 说明 |
|------|------|------|
| `[colors]` primary/secondary/background/surface/text/text_secondary/border/success/danger/warning | string | 颜色（hex） |
| `[typography]` font_body/font_title/font_size_base | string | 字体/字号 |
| `[spacing]` radius_button/radius_panel/gap_small/gap_medium/gap_large | string | 圆角/间距 |

不写会怎样：缺变量 → UI 按引擎兜底值（建议写全）。模组可加自定义变量。

## 4. definitions/attributes.toml —— 属性定义（h-core 已提供全套，这里只写差异）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| 属性名（key） | — | ✅ | 中文加引号 `"体力"`；定义后角色数据才能写它 |
| `type` | string | ✅ | `number`（目前仅此一种） |
| `default` | number | — | 默认值；角色不写 → 用此值（读档缺字段自动补齐 + warning） |
| `category` | string | ✅ | 存储命名空间：`base`/`parameter`/`mark`/`ability`/`social`/`economy`/… |
| `display` | boolean | — | 属性面板显示 |
| `display_group` | string | — | 面板分组名 |
| `daily_reset` | boolean | — | 每天睡眠结算归零（parameter 快感/状态用） |
| `sex` | string | — | `female`/`male` 性别过滤 |
| `level_thresholds` | number[] | — | 10 级制阈值（parameter 快感用） |

**常用属性速查**（区间为逻辑钳制，非数据约束；默认/读取方完整表见 character-schema §2）：

| 属性 | 默认 | 区间（逻辑钳制） | 命名空间 |
|------|------|------------------|----------|
| 体力 / 气力 | 100 / 100 | 0 ~ 体力上限(2500) / 气力上限(2000) | base |
| 精力 | 100 | 0-100 | base |
| 疲劳度 | 0 | 0-160（realtime-settle 增长钳制） | base |
| 饥饿值 | 0 | 0-240 | base |
| 尿意 | 0 | 0-300 | base |
| 欲望值 / 射精欲 | 0 / 0 | 0 ~ 射精欲上限(1000) | base |
| 精液量 | 100 | 0 ~ 精液量上限(100) | base |
| 好感度 / 信赖度 | 30 / 0 | 0-100（结算钳制） | social |
| 情绪 / 理性 | 50 / 100 | 0-100 | base |
| 快感 10 部位（皮肤~心理） | 0 | 10 级制（level_thresholds 末值 100000） | parameter |
| 行为参数 15 种（润滑~优越） | 0 | 每日清零 | parameter |
| 刻印 7 种 | 0 | 0-5 级（abilities 存储） | mark → abilities |
| 感度/扩张/性技/技巧系 | 0 | 0-10 级 | ability |
| 精神 | 100 | 0-100（h-hypnosis 钳制） | base |

不写会怎样：不写本文件 = 全用 h-core 默认。角色数据写了未定义属性 → 加载 warning「裸字段」。

## 5. definitions/abilities.toml —— 能力定义（新增）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| 能力名（key） | — | ✅ | 角色数据 `abilities = { "吐纳术" = 3 }` 前必须定义 |
| `name` / `description` | string | — | 显示名/说明 |
| `type` | string | — | `active`（主动）/ `passive`（被动） |
| `max_level` | number | — | 0 = 无等级能力；>0 = 升级能力（存 {level, xp}） |
| `tags` | string[] | — | 自由标签（插件按标签查询，如 combat_active/sword） |
| `xp_curve` / `xp_per_level` | string/number | — | 升级曲线（linear/exponential/custom） |
| `[[unlocks]]` | 数组 | — | 技能树 `{ at_level, ability?, talent? }`（引用的能力/天赋须已定义） |
| `time_cost` / `condition` | — | — | active 能力使用耗时/使用条件 |

## 6. definitions/talents.toml —— 天赋定义（新增）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | ✅ | 天赋名（key 即 id） |
| `max` | number | — | 1 = 有/无型；n = 等级型 |
| `description` / `tags` | — | — | 说明/自由标签 |

角色数据写未定义天赋 → **加载报错**（error，阻止加载）。

## 7. definitions/relations.toml —— 关系定义（关系系统 v2）

三段：`[types]`（关系类型）/ `[pairs]`（称呼词表）/ `[groups]`（关系组）。

**types 字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| 关系名（key） | — | 角色数据 `relations = { 对方 = { "师徒值" = 50 } }` 前必须定义；中文加引号 |
| `kind` | string | `sentiment`（数值型，默认——好感度 0-100）/ `relation`（三档：正面/中立/负面） |
| `min` / `max` / `default` | number | sentiment 型的数值区间/默认（现有写法） |
| `pair` | string | relation 型：端对（称呼词表，`[pairs]` 段定义——h-core 已内置 parent_child/sibling/spouse 等） |
| `side` | string | relation 型：`big`（为大）/ `small`（为小）；对称类型（夫妻）省略 |
| `reverse` | string | 反向类型；默认"同名换端"自动推导（"父母子女（为大）"↔"父母子女（为小）"），可显式覆盖 |

**pairs 词表**（mod 可覆盖/新增）：`panel`（成对名：面板显示，big词+small词按性别组合 →
父子/父女/母子/母女；对称类型固定名"夫妻"）+ `address`（单方称呼：口上 `{relation_display}` → 父亲/儿子…）。

**groups 组**（集中定义）：元素 = 类型名 或 `{ pair = "xxx" }`（展开为引用该 pair 的全部已定义类型）；
内置 血亲 组（h-core）；乱伦判定等用 `any(group:血亲)`。

**角色数据**：`relations = { 段延庆 = { "父母子女（为小）" = "正面" } }`（字符串或 1/0/-1 都收）。
关系有向、可多关系多对象（段誉两个父亲）。完整语义见 AGENTS.md §23 / character-schema §3.5。

## 8. definitions/status-effects.toml —— 状态效果定义（新增）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` / `description` | string | — | 显示名/说明 |
| `category` | string | — | `debuff`/`buff`/`neutral` |
| `duration` | number | ✅ | 持续分钟数；-1 = 永久 |
| `tick_interval` | number | — | 每 N 分钟触发 tick_effects；0 = 不触发 |
| `stackable` / `max_stack` | boolean/number | — | 叠加规则（重新施加 = 刷新时长 + 叠加，上限 max_stack） |
| `tick_effects` / `on_apply_effects` / `on_remove_effects` | 数组 | — | 效果列表（数值类 tick 效果自动 × 层数） |

## 9. definitions/equipment.toml / items.toml

**equipment.toml**（槽位）：h-core 已提供 9 槽，一般不写。自定义槽位：`[[slots]]` `{ id, name, category, removable, auto_off }`。
**items.toml**（物品）：h-core 不含物品，mod 内容需自写。字段：

| 字段 | 说明 |
|------|------|
| `id` / `name` / `description` | 标识/显示/说明 |
| `type` | consumable/weapon/armor/clothing/material/… |
| `stackable` | 可堆叠 |
| `use` | self（使用）/ equip（装备）/ h_drug… |
| `effects` | 使用效果（同 effect 系统） |
| `attack_bonus` / `defense_bonus` | 装备加成 |

## 10. templates/character/*.toml —— 角色模板（第③层，可复用初始卡）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | ✅ | 模板 ID（roster 的 template 引用它） |
| `name` | string | — | 显示名 |
| `extends` | string | — | 父模板 ID（最多一层；循环继承检测报错） |
| 其余实体字段 | — | — | 同 roster 条目（base/abilities/talents/relations/equipment/behavior…） |

**差分规则**（文件头注释已写）：子模板只写与父模板的差异；对象深合并；**数组整表替换**；`= null` 删除。
模板相对属性默认值也是差分：没写的属性自动用 attributes.toml 的 default。

## 11. characters/roster.toml —— 具体角色（第④层，批量清单）

每个 `[[roster]]` 条目一个角色：

| 字段 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `id` / `name` | string | ✅ | — | 角色 ID（同类型内唯一）/ 显示名 |
| `template` | string | — | 无模板 | 继承的模板 ID |
| `base` | 内联表 | — | 属性默认 | 基础属性（键 = attributes.toml 定义） |
| `abilities` | 内联表 | — | 能力默认 0 | 简写数字=等级（展开为 {level,xp}） |
| `talents` | 内联表 | — | 0 | 天赋（未定义 → 报错） |
| `marks` | 内联表 | — | 0 | 刻印（自动归一化到 abilities） |
| `experience` | 内联表 | — | — | erArk 数值 id 直通（键名禁改） |
| `status_effects` | 数组 | — | — | 初始状态 `{ id, remaining_duration, stack }` |
| `relations` | 内联表 | — | — | `{ 对方ID = { 类型 = 档位 } }`——三档写 "正面"/"中立"/"负面"（或 1/0/-1）；数值型（好感度）写数字；有向/多关系/多对象 |
| `inventory` | 数组 | — | — | `[{ itemId = "回气丹", count = 3 }]`（对象写法 `{ 物品ID = 数量 }` 加载时自动转换） |
| `equipment` | 内联表 | — | — | `{ 槽位 = 物品ID }` |
| `assets` | 内联表 | — | — | `{ portrait = "路径" }`（立绘，文件不存在不报错） |
| `behavior` | 内联表 | — | — | `{ activity = 0-1, home_locations = { 地点ID = 权重 } }` |
| `current_location` | string | — | — | 初始位置（运行时引擎接管） |
| `dead` | boolean | — | 存活 | 死亡标记 |
| `pregnancy` | 内联表 | — | — | 孕妇初始设定（h-pregnancy 尊重初值） |
| `first_times` | 内联表 | — | — | `{ virgin_V = true }` 非处女设定 |
| `spawn_condition` | string | — | — | 条件满足才创建该角色 |

**分层**：上表全为 **L1**（角色层直接写）。**L2** 罕见（params/sp_flag，写了 warning）。**L3** 别写（h_state/body_items/first_records/dirty/hypnosis/action_info/achievement/equipment_off/equipment_visible/equipment_blood——引擎独占，写了无效）。
**差分**：相对 template 只写差异；不写 template 则全部自己写。

## 12. characters/named/{角色ID}/ —— 重要角色文件夹

- `base.toml`：与 roster 条目同构（同字段表）；**named 覆盖同名 roster 条目**（升级路径）
- `dialogue.toml`：反应式口上（见下）
- `conversations/*.toml`：交互式对话树（见下）
- `behavior.toml` / `assets/`：可选

## 13. dialogue.toml / conversations/*.toml —— 口上与对话

**dialogue.toml**（反应式口上）：

| 字段 | 必填 | 说明 |
|------|------|------|
| `scene` | ✅ | 场景（greet/hurt/farewell…） |
| `condition` | — | 条件（字段用「可用条件属性手册」） |
| `text` | ✅ | 台词 |

多条同 scene 且条件满足 → 随机选一条。通用 fallback：`definitions/character-dialogue.toml`。

**conversations/*.toml**（对话树）：

| 字段 | 必填 | 说明 |
|------|------|------|
| `id` | ✅ | 对话树 ID（全局唯一） |
| `condition` | — | 自动选择该对话的条件 |
| `[[nodes]].id` | ✅ | 节点 ID（choices.next 引用） |
| `lines` | ✅ | 文本数组 |
| `choices` | — | `{ text, next, condition? }` |
| `effects` | — | 到达节点执行的效果 |
| `next` | — | 无 choices 时的自动跳转 |

无 choices 且无 next = 终端节点（对话结束）。完整格式见 docs/dialogue-format.md。

## 14. characters/npc.toml —— 路人生成规则

| 字段 | 必填 | 说明 |
|------|------|------|
| `template` | ✅ | 模板 ID（templates/character/） |
| `at_locations` | ✅ | 生成地点（首次进入时生成） |
| `count` | ✅ | `{ min, max }` 随机数量 |
| `names` | — | 随机姓名池 |
| `overrides` | — | 覆盖模板的具体值 |

生成后角色存存档（存档权威，模板改动不影响已生成角色）。

## 15. maps/locations/*.toml —— 地点（平铺 + parent）

| 字段 | 必填 | 说明 |
|------|------|------|
| `id` / `name` | ✅ | 地点 ID（同类型内唯一）/ 显示名 |
| `parent` | — | 父地点 ID（省略 = 顶级） |
| `type` | — | 自由字符串（region/city/room…，UI 过滤用） |
| `tags` | — | 功能标签（has_shop 显示交易按钮等；条件 `location.tags.xx == true`） |
| `exits` | — | `{ target（须存在）, name, time_cost }` |

不可达警告：无任何边指向、也无 parent 的顶级地点 → warning。

## 16. maps/graph/*.toml —— 移动图

`[[edges]]` `{ from, to, time_cost }`——from/to 必须存在；顶级地点至少被一条边指向。

## 17. quests/main|side/*.toml —— 任务

| 字段 | 必填 | 说明 |
|------|------|------|
| `id` / `title` / `description` / `type` | ✅ | type = main/side（仅分类标签） |
| `prerequisites` | — | 前置任务 ID |
| `auto_start_condition` | — | 条件满足自动开始 |
| `[[steps]]` | ✅ | 见下 |

步骤类型（7 种）：`dialogue`（character/conversation 引用须存在）/ `combat`（enemies/on_win/on_lose）/ `objective`（objective 子格式，事件驱动）/ `reward`（effects）/ `spawn` / `condition`（condition + next/else）/ `goto`（target）。
objective 子格式：`{ type = reach_location|kill_count|collect_items|talk_to, target, count?, item? }`。

## 18. 其他（简表）

| 文件 | 用途 | 参考 |
|------|------|------|
| `definitions/h-config.toml` | H 公式系数（改 hunger/体位表/判定修正） | docs/h-core.md + example-mod 示例 |
| `definitions/calendar.toml` | 日历显示 | example-mod 示例 |
| `definitions/instructions/*.toml` | 指令定义（mod 自定义玩法指令——见 example-mod 的「打坐」示例；复刻 erArk 指令另见 erark-replication） | docs/skills/erark-replication.md |
| `definitions/sets.toml` | 套装 | docs/set-system.md + example-mod 示例 |
| `definitions/talk/styles.toml` | 口上样式 | docs/talk-common-system.md + example-mod 示例 |
| `definitions/scene-dialogue.toml` / `character-dialogue.toml` | 场景旁白 / 角色通用口上 | docs/mod-workflow.md 第 1 步 + example-mod 示例 |
| `definitions/bondage/types.toml` | 紧缚类型（⚠️ **整表替换**：写了须完整复制 `src/plugins/h-core/data/default/bondage/types.toml` 的 15 种再改） | docs/bondage-system.md |
| `migrations/*.toml` | 存档版本迁移 | AGENTS.md §12 |
| `theme.css` | 自定义样式 | — |
| `scripts/` | mod 专属 JS（沙箱） | AGENTS.md 安全节 |

> **未实现**：`definitions/factions.toml`（势力定义）在 AGENTS 目录结构中存在，但引擎尚无加载器——写了不会被加载，等实现后再写。

---

## 附录：常见错误速查

| 症状 | 原因 | 修法 |
|------|------|------|
| 加载 warning「未定义的属性 X」 | 角色数据写了 attributes.toml 未定义的键（裸字段） | 先定义，或删除该键 |
| 加载 error「使用了未定义的天赋」 | talents 未定义 | 在 talents.toml 定义 |
| warning「引擎独占字段」 | 写了 h_state/body_items 等 L3 字段 | 删除 |
| warning「params 行为参数」 | 写了 params（daily_reset 仅首日意义） | 删除或改默认值 |
| 加载 error「exit 目标不存在」 | exits.target 拼错/未定义 | 检查地点 ID |
| warning「不可达」 | 顶级地点无任何边指向 | 加 graph 边 |
| 复制 example-mod 后 validate 报错 | id 冲突/引用未改 | 按报错行号逐个修 |
