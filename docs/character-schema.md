# 标准角色契约（Character Schema）

> **权威文档**：角色数据契约（标准角色契约 spec §10.1，2026-08-09 定稿）。
> 面向：mod 作者（写角色数据）+ 引擎开发者（读/写角色字段）。
> 配套：`docs/instruction-replication/erark-attr-ledger.md`（迁移期对账表）、`scripts/erark-name-map.json`（改名映射）、
> `scripts/scan-attr-refs.cjs`（第1层扫描）、`scripts/scan-erark-defs.cjs`（第3层对账）。
>
> **核心铁律**：
> - `definitions/attributes.toml` 是属性定义权威——代码/数据引用未定义属性 = 契约违规（扫描即报）
> - **角色数据禁止裸字段**：任何新属性必须先经 attributes.toml（或 abilities/talents/status-effects 定义文件）定义
> - 缺失值语义：`getEntityAttr` 找不到返回 0/false（永不抛异常）；加载/存档时按 attributes default 补齐 + warning
> - 校验失败一律 warning+建议，不阻止加载

---

## 1. 角色实体结构总览（命名空间树）

角色实体（`entity`）是动态键值容器，字段完全由模组定义决定。引擎只提供存取方法，不预设字段名。以下为当前引擎全部消费者认可的结构：

```
entity
├── id: string                        # 角色 ID（同类型内唯一）
├── name: string                      # 显示名
├── base: { 属性名: number }          # attributes.toml category=base/economy/social 的属性
│                                     #   （体力/气力/好感度/金钱/射精欲/…）
├── params: { 状态名: number }        # attributes.toml category=parameter（皮肤/胸部/恭顺/…，daily_reset）
├── marks: { 刻印名: number }         # attributes.toml category=mark（快乐刻印/…）
├── abilities: { 能力名: {level, xp} }# attributes.toml category=ability + abilities.toml 定义
├── talents: { 天赋名: 0|1|n }        # talents.toml 定义
├── experience: { 数值id: number }    # erArk 经验 ID 直通（0-7 部位/10-17 绝顶/20-27/78/141-152/155…）
├── sp_flag: { … }                    # 特殊 flag（见 §4.2）
├── h_state: H_STATE                  # H 会话状态（见 §4.1，H 结束重置/重建）
├── body_items: { 槽位string: BodyItemSlot }  # 身体道具（见 §4.3）
├── first_times: { virgin_*: boolean } # 初次标记（h-first-time）
├── first_records: { key: {time, …} } # 初次详情记录
├── dirty: { … }                      # 污浊（body_semen/cloth_semen/penis_dirty_dict/…）
├── pregnancy: { … }                  # 怀孕（fertilization_rate/reproduction_period/milk/…）
├── hypnosis: { … }                   # 催眠（hypnosis_degree/increase_body_sensitivity/…）
├── action_info: { … }                # 行动记录（talk_count/talk_time/day_first_shoot_semen/…）
├── relations: { 对方ID: { 关系类型: 档位 } }  # 关系（relations.toml 定义类型；三档 -1/0/1 或 sentiment 数值，见 §3.5）
├── inventory: [{ itemId: string, count: number }]  # 背包（数组格式；对象写法 { 物品ID: count } 加载时自动转换）
├── equipment: { 槽位: 物品ID }       # 装备/服装（h-core 换装 + inventory-system）
├── assets: { portrait: string, … }  # 立绘/素材引用（可选）
├── achievement: { … }                # 成就（h-hidden/h-group-sex 记录）
├── behavior: { … }                   # 行为状态（移动/等待）
├── current_location: string          # 运行时位置（存档权威）
└── dead: boolean                     # 死亡（undefined=存活）
```
> 注：`cloth` 是早期文档中的过时命名空间，实际实现为 `equipment`（2026-08-09 分层审查修正）。

**写字段的合法路径**（引擎 API）：
- 属性：`ctx.api.call('engine', 'bindings.get/set', …)` 或 `ATTR` 常量 + `getEntityAttr/setEntityAttr`（禁止裸写中文属性名）
- 结构字段：`set_field` effect 或直接经插件自身数据层（插件代码按命名空间语义读写）

---

## 2. 属性定义契约（attributes.toml 每字段）

> 默认值语义：mod 不写属性时角色按 default 初始化；读档缺字段按 default 补齐 + warning。
> 读取方 = 消费该属性的系统；缺失影响 = 该属性缺失时会发生什么（多数因默认 0 而静默失效）。
> **h-core 默认层提供 erArk 标准角色卡全集**（base/params/ABL/刻印/感度/扩张/性技，2026-08-09 审查补全）——
> 任何 mod 不写 attributes.toml 也能拿到完整角色卡；mod 只写差异（deepMerge 覆盖/新增）。

### 2.1 base —— 基础数值属性（entity.base）

| 属性 | 默认 | 读取方 | 缺失影响 | 可删性 |
|------|------|--------|----------|--------|
| 体力 | 100 | settle_hp_mp/战斗/移动/H 内指令 | 消耗/恢复静默失效；死亡判定失效 | 不可删 |
| 气力 | 100 | settle_hp_mp/战斗/H 内指令 | 同上 | 不可删 |
| 精力 | 100 | （闲置属性，erArk 理智名义映射） | 无直接影响 | 可删 |
| 疲劳度 | 0 | 前提 TIRED_LE_74/84、群交 SCENE_ALL_NOT_TIRED | 前提恒满足（不疲劳） | 可删（前提降级） |
| 饥饿值 | 0 | hunger-system、h-ejaculation 精液吸收 | 饥饿不增长；吸收系数按 0 | 可删（关饥饿） |
| 消化剩余 | 0 | hunger-system 消化 CD | 消化即时完成 | 可删 |
| 熟睡值 | 0 | 睡眠结算积累（上限 100，I6 修正 2026-08-11：erArk 源码无 tired_adjust——浅睡 +1.5/分、深睡 rand(-0.3~0.6)/分） | 睡眠逻辑失效 | 可删 |
| 尿意 | 0 | 实时结算增长（上限 **300**，G6：erArk 代码为准）+ 解手指令 | 解手前提失效 | 可删 |
| 体力上限 | 2500 | H 结束奖励/战斗 HP 计算 | 上限恒 2500 | 不可删（战斗/H） |
| 气力上限 | 2000 | 同上 | 上限恒 2000 | 不可删（战斗/H） |
| 欲望值 | 0 | H 模式判定/群交结束扣减/新增天 | 欲望不涨（判定部分失效） | 不可删（H 核心） |
| 射精欲 | 0 | h-ejaculation（orgasmJudge/eja_add） | 永不射精 | 不可删（射精链） |
| 射精欲上限 | 1000 | 射精判定 | 上限恒 1000 | 不可删 |
| 精液量 | 100 | 射精量计算 | 射精量恒 0 | 不可删 |
| 精液量上限 | 100 | 射精量计算/群交奖励 | 上限恒 100 | 不可删 |
| 额外精液量 | 0 | 射精量计算（临时加成） | 无加成 | 可删 |
| 愤怒 | 0 | calcJudge 心情修正 | 无愤怒修正 | 可删 |
| 酒气 | 0 | 前提 DRUNK_LEVEL_NOT_3（醉酒未实装→恒 true） | 无影响（醉酒系统未实装） | 可删 |
| 情绪 | 50 | UI 展示 | 显示默认 | 可删（展示） |
| 理性 | 100 | UI 展示 | 显示默认 | 可删（展示） |
| 性别 | 0 | sex 过滤（attributes.sex 字段） | 属性不按性别过滤 | 可删 |
| 阴茎大小 | 1 | 前提 jj_0~3 | 恒普通 | 可删 |
| 排卵周期 | 0 | h-pregnancy（7 日周期 0011232） | 周期恒 0（安全期） | 可删（关妊娠） |
| 精神 | 100 | h-hypnosis 精神力（钳制 0-100） | 精神恒满 | 可删（关催眠消耗） |

### 2.2 params —— 行为参数（entity.params，daily_reset）

| 属性 | 默认 | 读取方 | 缺失影响 | 可删性 |
|------|------|--------|----------|--------|
| 皮肤/胸部/阴蒂/阴茎/阴道/后穴/尿道/子宫/口喉/心理 | 0 | settle_state/tech_adjust/绝顶判定（10 级制） | 部位快感恒 0：绝顶/感度全失效 | 不可删（部位核心） |
| 润滑/习得/恭顺/好意/欲情/快乐/先导/屈服/羞耻/苦痛/恐怖/抑郁/反感/优越 | 0 | settle_state + hConfig [state_ability] 能力系数 | 状态不结算：好感链/刻印链静默失效 | 不可删（结算核心） |

### 2.3 marks —— 刻印（entity.marks，永久）

| 属性 | 默认 | 读取方 | 缺失影响 | 可删性 |
|------|------|--------|----------|--------|
| 快乐刻印/屈服刻印/苦痛刻印/恐怖刻印/反发刻印/时姦刻印/无觉刻印 | 0 | calcJudge 刻印修正/h-mark 升级/mark_debuff 系数 | 刻印修正失效、升级失效 | 不可删（H 核心） |

> **存储语义（2026-08-09 契约审查定稿）**：刻印的 **canonical 存储 = `entity.abilities.{刻印名}`（{level, xp}）**——
> h-mark 升级写入、calcJudge/settle_state/favorability/trust 全部读取方都走 abilities。
> `entity.marks` 仅是 attributes.toml category=mark 的默认落位 + 条件字典注册镜像（**零写入方/零读取方**）。
> 引擎 `SEARCH_ORDER` 中 marks 排在 abilities **之后**（防止 marks 恒 0 遮蔽 abilities 真实刻印等级——
> 第 4 轮审查消除的静默失效地雷）。**禁止对 marks 命名空间写入**。

### 2.4 abilities —— 能力（entity.abilities.{名} = {level, xp}）

| 属性 | 默认 | 读取方 | 缺失影响 | 可删性 |
|------|------|--------|----------|--------|
| 皮肤感度/胸部感度/阴蒂感度/阴茎感度/阴道感度/后穴感度/子宫感度/口喉感度/心理感度 | 0 | settle_state/tech_adjust（PART_ABILITY 系数 sqrt） | 感度等级恒 0（无系数） | 不可删（结算核心） |
| 阴道扩张/后穴扩张/子宫扩张 | 0 | pain_by_part/扩张经验 | 扩张恒 0 | 不可删（pain 链） |
| 技巧/顺从/亲密/欲望/露出/施虐/受虐 | 0 | calcJudge/state_ability 系数 | 判定/状态系数恒 0 | 不可删（判定核心） |
| 话术技能 | 0 | talk_add_adjust（501） | 话术加成恒 0 | 可删（关话术加成） |
| 隐蔽 | 0 | h-hidden 隐奸发现度 | 隐奸无隐蔽加成 | 可删（关隐奸加成） |
| 指技/舌技/足技/胸技/膣技/肛技/腰技/榨精 | 0 | pl_p_adjust/pain/射精量 | 技巧系数恒 0 | 不可删（性技结算） |

### 2.5 其他 category 属性

| 属性 | 默认 | 读取方 | 缺失影响 | 可删性 |
|------|------|--------|----------|--------|
| 金钱 | 0 | 经济系统 | 无金钱 | 可删 |
| 好感度 | 30 | settle_favorability/calcFavorability/calcJudge | 好感恒 0（判定+结算全失效） | 不可删（社交核心） |
| 信赖度 | 0 | settle_trust/calcTrust/calcJudge | 信赖恒 0 | 不可删（社交核心） |
| hp/mp/attack/defense/speed | 100/50/10/5/5 | 战斗绑定系统 | 战斗数值按默认 | 可删（关战斗） |
| 力道/根骨/定力/灵敏/福缘 | 0 | combat-wuxia 六维面板 | 六维恒 0 | 可删（关武侠战斗） |
| 气血/内力 | 100/50 | test-mod 示范（mod 自定义属性） | — | mod 自由 |

---

## 3. 能力/天赋/状态/经验契约

### 3.1 能力（abilities.toml + 角色 abilities 字段）
- 定义：`definitions/abilities.toml`（id/name/type/max_level/tags/effects/…）
- 角色存储：`abilities: { 能力名: { level: number, xp: number|null } }`；roster 简写 `abilities = { 华山剑法 = 3 }` 加载时展开
- `max_level = 0` 表示无等级能力（存 `{level:1, xp:null}`）
- 引用能力等级：`entity.abilities[名].level`（**禁止读数字键**——历史教训：数字键死键）
- 条件路径：`character.{id}.abilities.{能力}.level` / `player.abilities.{能力}.level`

### 3.2 天赋（talents.toml + 角色 talents 字段）
- 定义：`definitions/talents.toml`（name/max/description/tags/modifiers/…）
- 角色存储：`talents: { 天赋名: 0|1|等级 }`，加载时按定义表初始化 0
- 引用未定义天赋 → 加载报错（validateTalents）
- 条件路径：`character.{id}.talents.{天赋}`（数值）— 对象数组/存在性检查自动处理

### 3.3 状态效果（status-effects.toml + 角色 status_effects 数组）
- 定义：`definitions/status-effects.toml`（duration/tick_interval/stackable/…）
- 角色存储：`status_effects: [{ id, remaining_duration, stack, last_tick_game_time }]`
- 条件路径：`character.{id}.status.{状态ID}`（存在性）/ `.status.{id}.stack` / `.status.{id}.remaining`
- 运行时别名（status-system 注册）：`status → status_effects`、`remaining → remaining_duration`

### 3.4 经验（experience 数值字典）
- 存储：`experience: { 数值id: 次数 }` —— **与 erArk Experience.csv 数值 id 直通**（0-7 部位经验/10-17 绝顶/20 绝顶总/78 无意识绝顶/141-152 体位/155 心理/156 口喉绝顶/158 心理绝顶…）
- 写入：`h_experience` effect / 引擎二段结算自动写（绝顶经验、体位经验等）
- 条件路径：`character.{id}.experience.{数值id}` / `player.experience.{id}`——是**经验值（累计次数）**不是等级
- 禁改：经验键名禁止改动（引擎结算硬编码数值 id，对账表 A 骨架保证一致）

### 3.5 关系（关系系统 v2，2026-08-10 定稿）

> 权威：AGENTS.md §23 关系数据格式。三段定义（types/pairs/groups）+ 有向 + 双维度（种类×档位）。

- **有向**：A→B 与 B→A 独立，不自动双向（单方面关系合法）
- **两型**：`kind="sentiment"`（数值，好感度）/ `kind="relation"`（三档：正面/中立/负面 = 1/0/-1）
- **类型 = 端对×端**：`pair`（称呼词表）+ `side`（big/small；对称省略）；`reverse` 默认"同名换端"自动推导
- **称呼两层**：panel 成对名（父子/父女/母子/母女）/ address 单方称呼（父亲/儿子…）——`{relation_display}` 口上插值
- **groups 集中定义**：元素 = 类型名 或 `{ pair }`（展开为引用该 pair 的全部已定义类型）
- **条件路径**：单类型 `character.{A}.relations.{B}.{类型}`（-1/0/1）；聚合
  `...any(列表/group:组)` / `...any_positive(列表)` / `...any_negative(列表)`（无括号=全部）
- **修改**：`modify_relation`（relation 型=直接设档）/ `remove_relation`（删除条目=解除关系）
- **事件**：`relation:added` / `relation:changed`（类型级）/ `relation:removed`，
  payload `{character, target, type, sentiment, panel, address}`
- **角色数据**：字符串档位（"正面"）或 1/0/-1 都收，加载统一存 -1/0/1；非法值 → error

---

## 4. 实体结构契约（字段表）

### 4.1 h_state（H 会话状态，H 结束由引擎重置）

| 字段 | 类型 | 默认 | 语义 |
|------|------|------|------|
| target_character_id | string? | — | H 交互对象 |
| insert_position | number | -1 | -1 未插入 0=V 1=A 2=U 3=W 4=M |
| current_sex_position | number | -1 | 体位 -1 无 / 1-12 |
| current_womb_sex_position | number | 0 | 0 未插入 1 子宫口 2 子宫奸 |
| orgasm_count | Record<partId, number[]> | {} | [本次累计, 总累计] |
| orgasm_level | Record<partId, number> | {} | 0 small/1 normal/2 strong |
| orgasm_edge | number | 0 | 0 无 1 寸止中 2 解放 3 强制定 |
| endure_not_shoot_count | number | 0 | 忍耐射精次数 |
| shoot_semen_amount | number | 0 | 本次 H 射精总量 ml |
| just_shoot | number | 0 | 0 未 1 刚射 2 已清理 |
| used_semen_energy_agent | boolean | false | 精力剂标记（首次 ×2） |
| thick_semen | boolean | false | 浓厚精液标记（×2） |
| bondage_type | number | 0 | 紧缚类型 |
| condom_count | [number, number] | [0,0] | [使用个数, 总精液 ml] |
| sex_toy_level | number | 0 | 震动棒档位 0-3 |
| is_h | boolean | true(createHState) | 是否在 H 中 |
| turn_count | number | 0 | H 内行为次数 |
| extra_orgasm_feel / extra_orgasm_count | Record/number | {} / 0 | 10 级后额外高潮 |
| orgasm_edge_count | Record<partId, number> | {} | 寸止累计 |
| time_stop_orgasm_count | Record<partId, number> | {} | 时停绝顶累计 |
| plural_orgasm_set | number[] | [] | 本次同时绝顶部位 |
| shoot_position_body | number | -1 | 射精体内部位（2 口 15 胃） |
| pending_orgasm_feel | Record<partId, number> | {} | 指令待结算快感（二段结算消耗） |

> **注意**：`h_state` 相关引擎字段（时停/解放/寸止）语义对齐 erArk h_state；mod 作者**不要手动写** h_state——由 h-core 的 effect（start_h/end_h/二段结算）管理。

### 4.2 sp_flag（特殊 flag，字段名与 erArk 一致）

| 字段 | 类型 | 语义 | 读取方 |
|------|------|------|--------|
| unconscious_h | number | 无意识 H：0 否 1 睡眠 2 醉酒 3 时停 4 平然 5 空气 6 体控 7 心控 | settle-gate（时停门控）/T5 无意识口上 |
| hidden_sex_mode | number | 隐奸模式 0-4 | h-hidden |
| exhibitionism_sex_mode | number | 露出模式 0-4 | h-hidden |
| is_follow | number | 跟随 0-4 | 移动系统 |
| go_to_join_group_sex | boolean | 前往群交 | h-group-sex |
| masturebate | number | 自慰状态 | 前提 |
| abnormal_flags | object | 异常状态位掩码 | 前提 |
| sleeping | boolean | 正在睡眠（2026-08-11 睡眠系统：玩家睡觉指令/NPC 睡眠行为期间） | T_ACTION_SLEEP 前提/sleep-system |
| unnormal_flag | number | 位掩码：bit5=0x10 意识模糊/弱交互、bit6=0x20 完全意识不清醒（睡眠中置位；11-睡眠与无意识H.md §6） | sleep-system/h-npc-ai |
| sleep_h_awake | boolean | 睡奸中醒来标记（醒来后装睡/结束判定） | 睡奸指令前提/h-npc-ai |
| pajamas | boolean | 穿着睡衣（睡觉效果链 634 设置） | 服装系统 |
| shower_state | number | 淋浴状态（睡觉效果链 301 清零） | 前提 |
| tired | boolean | 疲劳标记（体力≤1 时置位；睡觉效果链 31 NOT_TIRED 清除） | follow-system/h-npc-ai |
| masturebate_before_sleep | boolean | 睡前自慰标记（睡觉效果链 457 清零） | 前提 |
| （其余见 erArk SPECIAL_FLAG，未实装字段留空即可） | | | |

### 4.3 body_items（身体道具）

```
body_items: { 槽位string: { itemId: string, active: boolean, expiry?: number } }
```
- 槽位编号：0 乳头夹 / 1 阴蒂夹 / 2 V 震动棒 / 3 A 震动棒 / 4 榨乳机 / 5 采尿器(砍) / 6 眼罩 / 7 肛门拉珠 / 8 利尿剂 / 9 安眠药 / 10 排卵促进药 / 11 事前避孕药 / 12 事后避孕药 / 13 避孕套 / 14 口球
- 读取方：body_item_tick（H 中 tick）、前提 TARGET_NOW_SEX_TOY_*、眼罩/口球修正
- **H 中手动写 body_items 无效**——经 body_item_apply/remove effect（h-core）

### 4.4 dirty / pregnancy / hypnosis / action_info / first_times

| 命名空间 | 字段（与 erArk 同名） | 维护方 |
|----------|----------------------|--------|
| dirty.body_semen | `{部位id: [名, 当前ml, 等级, 总ml]}` | h-ejaculation |
| dirty.cloth_semen | 同上（服装槽） | h-ejaculation |
| dirty.penis_dirty_dict | `{semen, blood}` | h-ejaculation |
| dirty.absorbed_total_semen | number | h-ejaculation（精液吸收） |
| dirty.a_clean / enema_capacity / semen_flow | 灌肠相关 | h-core（B3 灌肠指令） |
| pregnancy.fertilization_rate / reproduction_period / milk / milk_max / lactation_flag / … | 妊娠/涨奶 | h-pregnancy |
| hypnosis.hypnosis_degree / increase_body_sensitivity / force_ovulation / blockhead / active_h / pain_as_pleasure / roleplay | 催眠 | h-hypnosis |
| action_info.talk_count / talk_time | 聊天计数/时间 | h-core（decayTalkCount） |
| action_info.day_first_shoot_semen | 每日首射标记（睡眠结算无条件重置 true，醒来第一发翻倍） | h-ejaculation / sleep-system |
| action_info.wake_time | 醒来时间（睡眠结算记录，erArk RECORD_WAKE_TIME） | sleep-system |
| action_info.h_interrupt | H 被撞破标记（睡眠结算清零，erArk sleep_settle.py:82） | h-core / sleep-system |
| h_state.pretend_sleep | 装睡（睡奸中醒来但继续无意识H，2026-08-11） | h-npc-ai |
| first_times.virgin_V/A/U/W/M/OTHER/KISS | true=已破处/已初吻 | h-first-time |
| first_records.{key}.time / .place / … | 初次详情 | h-first-time |

> **预置缺口（2026-08-09 分层审计）**：mod 预置 `first_times.virgin_V = true`（非处女设定）后，
> h-first-time 的 `setFirstTime` 会跳过（已破），**不会自动生成 first_records 详情记录**。
> 若需 `getRecord` 类条件（FIRST_SEX_IN_TODAY 等）命中，须自行写 first_records（含 time/place/position 结构）。

### 4.5 经验键位速查（写入方对照）
- 部位经验 0-7（皮肤…子宫）：h_experience effect 按指令写
- 绝顶经验 10-17 + 口喉 156 + 心理 158：引擎二段结算自动写
- 绝顶总 20 / 射精 21 / 喷乳 22 / 饮精 25 / 膣射 26 / 肛射 27：引擎二段结算
- 无意识绝顶 78：二段结算（时停/无意识解放）
- 体位经验 141-152：转换脚本附加（B3 指令化）
- 心理经验 155：extra_feel_settle 自动写

---

## 5. 最小必需集（缺失必须显式处理）

> 校验落地（mod-loader/save-system）按此表执行：缺失 → warning + 建议（不阻止加载）。
> 分两档：
> - **异常级**：缺失会直接破坏核心玩法链路（结算/判定/战斗），缺失时必须显式补齐或声明
> - **静默失效级**：缺失导致某条支线静默失效（不报错但功能消失）

### 5.1 异常级（角色必须有）
```
base: 体力 / 气力 / 体力上限 / 气力上限 / 好感度 / 信赖度 / 欲望值
      射精欲 / 射精欲上限 / 精液量 / 精液量上限
params: 皮肤 / 胸部 / 阴蒂 / 阴茎 / 阴道 / 后穴 / 子宫 / 口喉 / 心理（部位快感）
        润滑 / 习得 / 恭顺 / 好意 / 欲情 / 快乐 / 先导 / 屈服 / 羞耻 / 苦痛 / 恐怖 / 抑郁 / 反感
marks: 快乐刻印 / 屈服刻印 / 苦痛刻印 / 恐怖刻印 / 反发刻印（时姦/无觉 可选）
abilities: 技巧 / 顺从 / 亲密 / 欲望 / 露出 / 施虐 / 受虐（calcJudge 必需）
```

### 5.2 静默失效级（缺失 = 对应功能静默关闭）
```
base: 疲劳度（前提失效）/ 饥饿值（饥饿系统）/ 尿意 / 熟睡值 / 排卵周期（妊娠周期）/ 精神（催眠消耗）
      额外精液量 / 愤怒 / 酒气 / 阴茎大小 / 消化剩余
abilities: 皮肤感度~心理感度（感度系数）/ 阴道扩张~子宫扩张（pain 链）/ 话术技能 / 隐蔽 / 指技~榨精
sp_flag: unconscious_h（时停门控）/ hidden_sex_mode / exhibitionism_sex_mode
dirty: body_semen / penis_dirty_dict / absorbed_total_semen
action_info: talk_count / talk_time / day_first_shoot_semen
first_times: virgin_V / virgin_A / virgin_KISS
pregnancy: milk / milk_max
h_state: 全部（H 会话内由引擎创建）
```

---

## 6. 字段字典（按命名空间：必填/可选(默认)/可扩展/禁止）

| 命名空间 | 必填 | 可选（默认） | 可扩展 | 禁止 |
|----------|------|--------------|--------|------|
| base | §5.1 异常级列表 | 其余 attributes.toml 定义属性 | **必须**先在 attributes.toml 定义后写入 | 裸键（未定义键 → 加载 warning） |
| params | §5.1 | 全部 parameter 属性 | 经 attributes.toml（category=parameter） | 裸键 |
| marks | 快乐/屈服/苦痛/恐怖/反发 | 时姦/无觉 | 经 attributes.toml（category=mark） | 裸键 |
| abilities | 技巧/顺从/亲密/欲望/露出/施虐/受虐 | 感度组/扩张组/话术/隐蔽/性技 | 经 abilities.toml + attributes.toml | 数字键（历史死键教训）；未定义能力 |
| talents | 无 | 任意 talents.toml 定义 | 经 talents.toml | 未定义天赋（加载报错） |
| experience | 无 | 数值 id（引擎写入） | 引擎结算写入 | 改键名 |
| sp_flag | 无 | unconscious_h 等 | 插件定义 | mod 自定义 flag 需插件声明 |
| h_state | 无（引擎创建） | — | 引擎管理 | mod 手动写 |
| body_items | 无 | — | 经 effect | mod 手动写 |
| first_times/first_records | 无 | — | h-first-time | — |
| dirty/pregnancy/hypnosis/action_info | 无 | — | 各子系统 | — |
| relations | 无 | — | 经 relations.toml 类型 | 未定义关系类型 |
| 顶层 | id/name | current_location | 引擎注册的命名空间 | 与引擎命名空间冲突的键 |

---

## 7. 场景索引（删了某个字段影响什么）

| 场景 | 依赖字段 | 删除后果 |
|------|----------|----------|
| 实行判定（calcJudge） | 好感度/信赖度 + params(欲情/快乐/恭顺/屈服/羞耻/苦痛/恐怖/反感/抑郁) + abilities(亲密/欲望) + marks + 愤怒 + talents(思慕~奴隶/淫乱/性无知…) | 判定值按 0 计算 → 指令行为失真 |
| 状态结算（settle_state） | params 全组 + hConfig [state_ability] 能力 | 数值不涨 → 刻印/好感链断 |
| 绝顶/二段结算 | 部位快感 params + experience + h_state | 绝顶永不触发 |
| 射精链 | 射精欲/精液量/额外精液量 + dirty + h_state(just_shoot…) | 射精静默失败 |
| 战斗 | 体力/气力/上限 + 力道组 | 战斗数值失真 |
| 好感/信赖 | 好感度/信赖度 | 社交全失效 |
| 隐奸/露出 | sp_flag.hidden_sex_mode + abilities.隐蔽 + params(羞耻/心理) | 隐奸无快感/发现度失真 |
| 时停 | sp_flag.unconscious_h | 时停门控失效（H 中继续结算） |
| 妊娠 | 排卵周期 + pregnancy | 妊娠永不发生 |
| 口上展示 | params 数值 + experience | 口上条件恒 false |
| 聊天衰减 | action_info.talk_count/talk_time | chat 永不过热 |
| 每日重置 | params（daily_reset=true 属性） | 快感/状态不归零 |

---

## 8. mod 扩展规则

1. **新属性必须经 `definitions/attributes.toml` 定义**（type/default/category），角色数据禁止裸字段
   - `category=base` → entity.base / `parameter` → entity.params / `mark` → entity.marks / `ability` → entity.abilities
   - 未定义键出现在角色数据 → 加载 warning（`角色 'X' 使用了未定义的属性 'Y'`）
2. **新能力**：abilities.toml 定义 + attributes.toml（category=ability）登记条件字典
3. **新天赋**：talents.toml 定义（未定义天赋 → 加载报错）
4. **覆盖语义**：mod 层定义覆盖插件默认层（同 key deepMerge）；数组整表替换
5. **禁止改引擎已硬编码的字段**（h_state/sp_flag/experience 数值 id/§5.1 最小集）——改这些请先走对账表 + spec §11 归档流程
6. **写条件只能用条件手册已有字段**（含结构路径）；引用未注册字段 → 加载 error + 注销该指令

---

## 9. 校验规则（引擎落地）

> **实时结算机制**（2026-08-09 G1-G6 定稿，`src/core/realtime-settle.ts`，每次指令执行后自动触发）：
> erArk 原生（非指令）时间机制全部在此对齐：
> - 疲劳增长 +max(1,t/6) 上限 160（休息/睡眠不涨）；睡眠减疲劳 2×(t/6)
> - 饥饿增长（**行动级唯一源**，G1：hunger-system 小时级增长已删——双轨=双倍）：
>   `floor(t×rand(0.8~1.2)×(2-hp/max)×(2-mp/max))` 上限 240
> - 尿意增长 上限 **300**（G6：erArk 代码 min(...,300)，注释 240 以代码为准）
> - 熟睡积累（I6 修正 2026-08-11）：浅睡 +1.5/分、深睡 rand(-0.3~0.6)/分（下界钳 0）——
>   erArk realtime_settle.py:362-367 源码无 tired_adjust 系数（G6 旧决策引用的行号对应不存在的系数，已修正）
> - 精液恢复 +1/20分；射精欲自然消退（G3）：仅玩家、非 H、距上次射精 >30 分 → -10/分
> - 睡眠结算：快感清零（G4：daily_reset 标记属性归零——该标记首次有消费方）+ 愤怒重置
>   （G5：rand(1,35)，erArk sleep_settle.py:80）+ 熟睡/减疲劳/精液逻辑（sleep 指令 L1.7 时自动生效）
> - 新角色愤怒初始化（G5：finalizeCharacterData rand(1,35)，erArk character.py:99）
> - 欲望每日增长（G2：newday-settle 修复，**仅 NPC**，erArk past_day_settle.py:76）

| 落点 | 校验 | 等级 | 行为 |
|------|------|------|------|
| mod-loader 角色加载（roster/named/pendingSpawns） | §5.1 异常级字段缺失 | warning | 不阻止加载；提示用 attributes default |
| mod-loader 角色加载 | 裸字段（未定义属性键） | warning | 列出未定义键 + 建议定义位置 |
| 插件 onLoad 后（h-core revalidateCharacterContract） | 必需集校验器补跑 | warning | main.ts 顺序 = loadMod 先 → 首次加载校验器未注册；h-core onLoad 注册后补跑（两种启动顺序都覆盖，2026-08-09 链路修复） |
| 运行时生成（npc.toml 路人 / pendingSpawns 激活） | 契约最终化（finalizeCharacterData：默认值+abilities 展开+talents 初始化） | 自动 | 2026-08-09 审查修复：此前路人 NPC abilities 是裸数字（.level 恒 undefined→系数静默 0） |
| 读档恢复（restoreFromSave） | 缺字段 → fillMissingAttributes 补齐 | warning | 按 attributes default 补齐（全命名空间查重，兼容契约前 base 存档） |
| `modify_attribute`/`set_attribute` 对 ability 类属性（技巧/刻印/感度/性技等） | 操作 `abilities[name].level`（保持 {level,xp} 结构） | 自动 | 2026-08-09 第5轮修复：原整键替换 → abilities[name] 变数字 → 直接读 .level 的读取方恒 0（静默失效） |
| mod-loader 天赋 | talents 未定义 | error | 阻止加载（既有 validateTalents） |
| mod-loader 指令 | condition 引用未注册字段 | error | 注销该指令 |
| mod-loader 指令 | premises 未注册 | warning | 去重提示 |
| 扫描脚本 | scan-attr-refs.cjs | 退出码 1 | 第1层 0 违规（CI 可接） |
| 扫描脚本 | scan-erark-defs.cjs | 报告 | 第3层对账（迁移期） |

> **命名空间注意**（2026-08-09 boot-smoke 抓到的真 bug）：校验器按 attributes.toml `category` 动态解析命名空间——
> 好感度/信赖度是 `social` 类 → 落在 `entity.social`（不是 base！）。硬编码 base 查会误报"缺必需"。

**warning 语义**：一律 `errorReporter.report({severity:'warning', suggestion: …})`，带文件名+建议，绝不静默。

---

## 10. 改名记录（erArk ↔ 我们）

> 机器可读版：`scripts/erark-name-map.json`（扫描输入，正反向）。此处为人类速查。

| erArk 原名 | 我们的名 | 类型 | 说明 |
|-----------|----------|------|------|
| 肛肠 / 肛肠感度 / 肛肠扩张 / 肛 | 后穴 / 后穴感度 / 后穴扩张 / 后穴 | 状态/能力 | 部位改名（转换脚本+代码统一） |
| 心理快感 | 心理 | 状态 | 死键教训：正确键是 心理 |
| 射精槽 / 射精槽上限 | 射精欲 / 射精欲上限 | base | eja_point 系 |
| 精液槽 / 精液槽上限 | 精液量 / 精液量上限 | base | semen_point 系 |
| 临时最大精液槽 | 额外精液量 | base | tem_extra_semen_point |
| 疲劳值 | 疲劳度 | base | tired_point |
| 醉酒度 | 酒气 | base | drunk_point |
| 理智 | 精力 | base | sanity_point 语义近似（精力为闲置属性） |
| 好感度字典（favorability[charId]） | 好感度（单值属性） | 结构 | 替代处理 |
| status_data / ability / experience / talent 字典 | params / abilities / experience / talents 命名空间 | 结构 | 替代处理 |
| 处女天赋（阴道处女/肛门处女/尿道处女/子宫处女/无接吻经验） | first_times.virgin_V/A/U/W/KISS | 结构 | 替代处理（true=已破，语义取反）。**双源标注（2026-08-09 分层审查）**：talents.toml 中的处女天赋定义仍存在（talk-common 口上条件大量引用 `talents.肛门处女 == 0`），h-first-time 破处时已同步删除对应天赋（V→阴道处女、A→肛门处女、U→尿道处女、W→子宫处女、初吻→无接吻经验）——有天赋 = 仍处，与 first_times 保持联动 |
| 尿道感度 / 尿道扩张 / 尿道经验系 | （无） | 删减 | 尿道方案A（ADR-0004）：指令全砍，仅保留尿道 status 属性 display=false |
| 兽部 / 兽部感度 / 兽部经验系 | （无） | 删减 | 兽部全砍（tech_adjust/settle_state 遇兽部 warning+跳过） |
| 博士信息素 304-306 | （无） | 删减 | 方舟激素系统砍掉（激素教训：禁止补回） |
| 指挥/战斗/料理/音乐/学识/医术/农业/制造/绘画技能 | （无） | 删减 | 技能系列 L2.13 记录不做实现（B 扫描确认无保留指令引用） |
| 源石病感染者/体表源石结晶/水分身/生育模组/一杯就倒 | （无） | 删减 | 方舟世界观/未实装 |
| 透视/触觉系能力（307-312） | （无） | 删减 | 方舟能力未实装 |

---

## 11. 字段分层表（作者写入层，ADR-0007）

> **2026-08-09 定稿（ADR-0007）**。与 §2 属性类别（决定存储位置/显示）正交的第二个维度：
> **mod 作者写角色/模板时"哪个字段该写、哪个别碰"**。判据：引擎会**重置/接管**（写了无意义）→ L3；
> 引擎只**累加/尊重初值** → L1；其余按平凡度分 L1/L2。
> 校验落地：mod-loader 加载角色时按本表检查，L3/L2 命中 → warning+建议（不阻止加载）。

### 11.1 L1 —— 角色层直接写（初始值有意义，引擎累加/不覆盖）

| 顶层字段 | 说明 |
|----------|------|
| `id` / `name` | 角色 ID/显示名 |
| `base` | 属性卡（体力/气力/好感度/自定义属性…），键须在 attributes.toml 定义 |
| `abilities` | 能力等级（简写 `{ 华山剑法 = 3 }` 或 `{level, xp}`），**刻印也写这里**（`快乐刻印 = 2`） |
| `marks` | 刻印的直观写法，**加载时自动归一化到 abilities**（ADR-0007；两者都写则 abilities 优先） |
| `talents` / `experience`（仅 erArk 已知 id） | 天赋；经验数值初始（键名禁改是文档约定） |
| `first_times.virgin_*` | 非处女设定（预置 true 后引擎尊重；详见 §4.4 预置缺口） |
| `status_effects`（初始）/ `relations` / `inventory` / `equipment` / `assets` | 初始状态/关系/背包/装备/立绘 |
| `behavior` / `current_location`（初始，运行时权威）/ `dead` | 行为/初始位置/死亡 |
| `pregnancy.*`（初始） | 孕妇设定有意义（审计确认：h-pregnancy 不重置初始值，只累加） |

### 11.2 L2 —— 非平凡字段（可写但罕见，写了给提示）

| 顶层字段 | 原因 | 正确做法 |
|----------|------|----------|
| `params` | 全部 daily_reset（每日清零），初始值仅首日意义 | 正常不写；改初始值经 definitions/attributes.toml 的 default |
| `sp_flag` | 自定义 flag 需插件声明 | 经插件声明后写 |
| 未知顶层键 | 不在契约字段字典 | 插件声明自定义命名空间；否则检查拼写 |

### 11.3 L3 —— 引擎独占（系统运行时管理，写了无效，禁止）

```
h_state / body_items / first_records / dirty / hypnosis / action_info
achievement / equipment_off / equipment_visible / equipment_blood
```

- 这些命名空间由对应系统（h-core/h-ejaculation/h-pregnancy/h-hypnosis/h-first-time…）运行时管理
- 写了 → 加载 warning「引擎独占字段，写入无效」，删除即可
- 例外说明：`first_records` 在预置 `first_times.virgin_* = true` 且需要详情记录时可自行写（见 §4.4）

### 11.4 与既有机制的关系

- **不改 §2 属性类别**：category 决定命名空间落位与显示；分层只决定"角色数据里能不能写"
- **不改 §5 最小必需集**：缺失补齐逻辑不变；分层 warning 与缺字段 warning 并存
- **marks 归一化**：§2.3「禁止写 marks」约束引擎/插件运行时；mod 角色数据入口经 finalize 归一化（ADR-0007）
- 校验器：`src/core/character-contract.ts`（`ENGINE_OWNED_TOP_KEYS` / `NONTRIVIAL_TOP_KEYS` / `AUTHOR_WRITABLE_TOP_KEYS`），mod-loader `validateCharacterContract` 调用
