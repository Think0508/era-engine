# Phase 8-10: 状态+能力+背包+效果+套装+战斗+任务 — 详细实施计划

> 状态：**待实施**（生成于 2026-06-29，基于 grilling G63-G79）
> 前置：Phase 1-7 完成（core 15 模块 + 3 插件 + UI + 198 测试）
> 验收：战斗可打、状态可叠加、能力可升级、物品可使用、任务可推进

---

## 设计决策汇总（G63-G79）

### effect-system
- 普通插件，provides="effects:ready"，几乎所有插件 depends_on 它
- EffectTypeRegistry 在 core（通用机制），effect-system 插件填充类型实现
- execute 流程：遍历 effects → 查 registry → 调 handler → depends_on 检查（前置成功才执行）→ 未知 type warning+跳过 → handler 抛错继续执行（错误隔离）
- target 解析：effect-system 统一解析为 targetIds（self/selected/player/all_enemies/all_allies/target），战斗上下文调 combat API
- 10 核心类型：set_attribute/modify_attribute/set_field/add_item/remove_item/modify_relation/advance_time/narrative_output/enter_mode/exit_mode
- set_attribute/modify_attribute 走 binding；set_field 直接改实体字段
- add_item/remove_item 调 inventory API（未注册时 warning+跳过）

### status-system
- 监听 game:hour_changed → 遍历角色 status_effects → tick_interval 检查 → tick_effects → duration 扣减 → 到期 on_remove_effects
- 战斗外用 hour_changed（MVP 不精确分钟级），战斗内由 combat-base 自己管 tick
- stack 缩放：数值类（params.value 为 number）× stack，非数值类重复 stack 次。缩放前深拷贝
- condition 字段：character.{id}.status.{statusId}（boolean）/ .stack（number）/ .remaining（number）
- apply_status/remove_status effect type 注册
- 叠加规则：刷新 duration + stack 递增到 max_stack

### ability-progression
- mod-loader 加载时展开 abilities 简写（数字→{level, xp:0}），不查 max_level
- gain_ability_xp effect：加 xp → 达标升级（xp 归零+level+1）→ 检查 unlocks → 自动给予 → emit character:ability_up
- 无等级能力（max_level=0）：gain_ability_xp 静默跳过
- xp_curve：linear（每级固定 xp_per_level）/ exponential / custom（数组）

### inventory-system
- 角色背包 = 角色实体 inventory 字段（[{itemId, count, attrs?}]）
- 物品定义 mod-loader 加载（definitions/items.toml）
- addItem/removeItem/useItem API + item:added/removed/used 事件
- 装备穿脱：穿=从背包 remove + set equipment 字段；脱=反向
- useItem 执行物品定义的 effects（调 effect-system）

### set-system
- 独立插件——套装涵盖装备/武功/天赋三种来源
- mod 在 definitions/sets.toml 定义套装（members = abilities/items/talents + bonuses 按 required_count 分档）
- 动态检测：角色获得/失去 ability/item/talent 时检查套装
- 凑齐给天赋/效果，失去件时动态移除
- Phase 8 MVP：只支持 effects 注入式加成，钩子式效果（先手/反击等）TODO Phase 11

### combat-base
- CombatRuntime：participants/enemies/allies/currentTurn/currentActorIndex/target
- 流程：start_combat → enterMode('combat') → 按 speed 排序 → 轮流行动 → 玩家/队友回 IDLE 选指令 → NPC 自动行动 → emit combat:turn → 一方全倒 → emit combat:end → exitMode
- 队友系统：轮到队友时也回 IDLE 等玩家选指令（留接口）
- 钩子系统：registerHook('turn_start'/'before_damage'/'after_damage'/'on_hit'/'damage_calc'/'hit_check'/'turn_end')
- damage_calc/hit_check 钩子=覆盖（子插件独占），其他钩子=链式（多个 handler 依次执行）
- combat-base 注册通用战斗指令（攻击/逃跑），combat-wuxia 注册武侠特有指令
- NPC AI：MVP 简单随机选 combat_active 能力
- 战斗中 dialogue 打断：dialogue push 到栈顶，结束 pop 回 combat，不破坏战斗状态

### combat-wuxia
- extends combat-base，覆盖 damage_calc/hit_check 钩子
- 六维→面板换算（ATK=力道×1.5+武器+内功，DEF=根骨×0.8+定力×0.6+防具等），系数 mod 可 override
- 武功伤害公式：(ATK × 武器系数(1+coeff/100) × 武功倍率(1+power/200) - DEF×2 + 天赋加成) × 阴阳克制(1.15) × 暴击(1.5) × 浮动(0.9-1.1) - 闪避判定
- optional_ability_tags：sword/internal/movement，mod 没有则降级
- 动态指令生成：查角色 combat_active 能力，按 tag 分组注册
- 天赋/套装钩子式效果 TODO Phase 11（需沙箱），Phase 8-10 只支持 effects 注入

### quest-system
- 监听 location:enter/combat:end/item:added/dialogue:end → 遍历 active quest → 更新 objective progress → 达标 auto-advance
- 7 种 step 类型：dialogue/combat/objective/reward/spawn/condition/goto
- auto_start_condition：监听事件时顺便检查
- 任务状态存 game-state 实体（activeQuests + objectiveProgress）
- 事件：quest:started/updated/completed

---

## Task 拆分

### Task 8.0：mod-loader 扩展 + test-mod 数据

**Files:**
- Modify: `src/core/mod-loader.ts`（加载 items.toml/sets.toml，abilities 展开）
- Create: `mods/test-mod/definitions/items.toml`（药水/武器/防具）
- Create: `mods/test-mod/definitions/sets.toml`（1 个测试套装）
- Create: `mods/test-mod/definitions/status-effects.toml`（中毒/醉意/buff）
- Modify: `mods/test-mod/definitions/abilities.toml`（武功定义+tags+max_level+xp_curve）

**Steps:**
- [ ] mod-loader 加载 items.toml → mod.items
- [ ] mod-loader 加载 sets.toml → mod.sets
- [ ] mod-loader 加载 status-effects.toml → mod.statusEffects
- [ ] mod-loader 加载 abilities.toml（已有，扩展字段）
- [ ] mod-loader 加载 roster 时展开 abilities 简写（数字→{level, xp:0}）
- [ ] test-mod items.toml：回血丹/武器/防具
- [ ] test-mod sets.toml：1 个测试套装
- [ ] test-mod status-effects.toml：中毒/醉意
- [ ] test-mod abilities.toml：华山剑法（sword tag）/混元功（internal tag）
- [ ] 测试 + typecheck

### Task 8.1：effect-system 插件

**Files:**
- Create: `src/core/effect-type-registry.ts`（core 层 registry）
- Create: `src/plugins/effect-system/plugin.toml`
- Create: `src/plugins/effect-system/index.ts`
- Create: `src/plugins/effect-system/effect-system.test.ts`

**Steps:**
- [ ] EffectTypeRegistry（core）：register(type, handler)/getHandler(type)/clear
- [ ] effect-system onLoad：注册 10 核心类型 handler
- [ ] execute(effects, ctx)：遍历→查 registry→调 handler→depends_on 检查→错误隔离
- [ ] target 解析：self/selected/player/all_enemies/all_allies/target → targetIds
- [ ] 战斗上下文：调 ctx.api.call('combat', 'getCombatContext')，未注册时跳过+warning
- [ ] 测试：10 类型各测 + depends_on + 未知 type + 错误隔离 + target 解析

### Task 8.2：status-system 插件

**Files:**
- Create: `src/plugins/status-system/plugin.toml`
- Create: `src/plugins/status-system/index.ts`
- Create: `src/plugins/status-system/status-system.test.ts`

**Steps:**
- [ ] onLoad：注册 apply_status/remove_status effect type
- [ ] onEnable：注册 status API + 监听 game:hour_changed + 注册 condition 字段
- [ ] apply_status handler：查定义→叠加规则（刷新 duration+stack 递增）→on_apply_effects→emit
- [ ] remove_status handler：on_remove_effects→移除
- [ ] hour_changed handler：遍历角色→tick_interval 检查→tick_effects（stack 缩放+深拷贝）→duration 扣减→到期移除
- [ ] condition 字段：character.{id}.status.{statusId}/.stack/.remaining
- [ ] 测试：叠加/tick/到期移除/stack 缩放

### Task 8.3：ability-progression 插件

**Files:**
- Create: `src/plugins/ability-progression/plugin.toml`
- Create: `src/plugins/ability-progression/index.ts`
- Create: `src/plugins/ability-progression/ability-progression.test.ts`

**Steps:**
- [ ] onLoad：注册 gain_ability_xp effect type
- [ ] onEnable：注册 ability API（getByTag/hasTag/getLevel/gainXp）
- [ ] gain_ability_xp handler：加 xp→检查达标→升级（xp 归零+level+1）→检查 unlocks→自动给予→emit character:ability_up
- [ ] 无等级能力（max_level=0）静默跳过
- [ ] xp_curve：linear/exponential/custom
- [ ] 测试：升级/unlocks/无等级跳过

### Task 8.4：inventory-system 插件

**Files:**
- Create: `src/plugins/inventory-system/plugin.toml`
- Create: `src/plugins/inventory-system/index.ts`
- Create: `src/plugins/inventory-system/inventory-system.test.ts`

**Steps:**
- [ ] onEnable：注册 inventory API（addItem/removeItem/useItem/getInventory）+ 注册 item effect types
- [ ] addItem/removeItem：操作角色 inventory 字段 + emit item:added/removed
- [ ] useItem：执行物品 effects（调 effect-system）+ emit item:used
- [ ] 装备穿脱：穿=remove+set equipment；脱=反向
- [ ] tags 驱动指令注册（has_shop → 交易，has_gather → 采集）
- [ ] 测试：增删/使用/装备穿脱

### Task 8.5：set-system 插件

**Files:**
- Create: `src/plugins/set-system/plugin.toml`
- Create: `src/plugins/set-system/index.ts`
- Create: `src/plugins/set-system/set-system.test.ts`

**Steps:**
- [ ] onEnable：注册 set API（checkSets/getActiveSets）+ 监听 character:changed
- [ ] 套装检测：角色获得/失去 ability/item/talent 时检查套装成员
- [ ] 凑齐给天赋/效果（effects 注入），失去件时动态移除
- [ ] TODO Phase 11：钩子式效果（先手/反击/反伤等）
- [ ] 测试：凑齐/失去/效果给予/移除

### Task 8.6：Phase 8 集成测试 + 文档更新

**Steps:**
- [ ] 集成测试：effect-system 执行 status/ability/inventory/set 各插件 effect
- [ ] 更新 developer-handbook / plugin-author-guide / mod-author-guide
- [ ] npm run test + typecheck

### Task 9.1：combat-base 插件

**Files:**
- Create: `src/plugins/combat-base/plugin.toml`
- Create: `src/plugins/combat-base/index.ts`
- Create: `src/plugins/combat-base/combat-base.test.ts`

**Steps:**
- [ ] plugin.toml：depends_on status-system + ability-progression + effect-system
- [ ] CombatRuntime：participants/enemies/allies/currentTurn/currentActorIndex/target
- [ ] start_combat effect → 创建 runtime → enterMode('combat') → emit combat:start
- [ ] 回合循环：按 speed 排序 → 轮流行动 → 玩家/队友回 IDLE → NPC 自动 → emit combat:turn → 结束 emit combat:end → exitMode
- [ ] 钩子系统：registerHook（7 个钩子点），damage_calc/hit_check 覆盖，其他链式
- [ ] 战斗指令：攻击/逃跑（通用）
- [ ] 战斗内 tick：combat-base 自己管 status tick（不靠 hour_changed）
- [ ] 战斗上下文 API：getCombatContext（供 effect-system target 解析）
- [ ] 队友接口：轮到队友回 IDLE
- [ ] 测试：回合循环/钩子/事件/队友

### Task 9.2：combat-wuxia 插件

**Files:**
- Create: `src/plugins/combat-wuxia/plugin.toml`
- Create: `src/plugins/combat-wuxia/index.ts`
- Create: `src/plugins/combat-wuxia/combat-wuxia.test.ts`

**Steps:**
- [ ] plugin.toml：extends combat-base，optional_ability_tags（sword/internal/movement）
- [ ] 覆盖 damage_calc 钩子：武功伤害公式（武器系数×武功倍率→减防御→天赋加成→阴阳克制→暴击→浮动→闪避）
- [ ] 覆盖 hit_check 钩子：命中率 = skill.accuracy + 灵敏/2 - 敌方灵敏/3
- [ ] 六维→面板换算（ATK/DEF/HP/MP/闪避/暴击），系数 mod 可 override
- [ ] 动态指令生成：查角色 combat_active 能力按 tag 分组注册
- [ ] 阴阳克制：内功阴阳属性不同时 ×1.15
- [ ] 暴击判定：crit_rate = skill.crit_rate + 福缘/5
- [ ] 结算效果：调 effect-system 执行眩晕/中毒/破防等
- [ ] TODO Phase 11：天赋/套装钩子式效果
- [ ] 测试：伤害公式/阴阳/暴击/闪避/动态指令

### Task 10.1：quest-system 插件

**Files:**
- Create: `src/plugins/quest-system/plugin.toml`
- Create: `src/plugins/quest-system/index.ts`
- Create: `src/plugins/quest-system/quest-system.test.ts`

**Steps:**
- [ ] onEnable：注册 quest API（startQuest/getActiveQuests/advanceStep）+ 监听 location:enter/combat:end/item:added/dialogue:end
- [ ] 7 种 step 类型：dialogue（委托 dialogue-system）/combat（委托 combat-system）/objective（事件驱动）/reward（执行 effects）/spawn（创建角色物品）/condition（分支）/goto（跳转）
- [ ] objective 事件驱动：reach_location/kill_count/collect_items/talk_to
- [ ] auto_start_condition：监听事件时检查
- [ ] 任务状态存 game-state 实体
- [ ] 事件：quest:started/updated/completed
- [ ] 测试：各 step 类型/objective 推进/auto_start

### Task 10.2：test-mod 数据补全 + 集成测试 + 文档

**Steps:**
- [ ] test-mod quest：1 个主线任务（dialogue→objective→combat→reward）
- [ ] test-mod combat：test_enemy 角色
- [ ] 集成测试：战斗全流程 + 任务全流程
- [ ] 更新 developer-handbook / plugin-author-guide / mod-author-guide
- [ ] npm run test + typecheck + dev 目视

---

## 依赖关系

```
8.0 (mod-loader) ─┐
8.1 (effect-system) ─┼─→ 8.2 (status) ─┐
                       ─→ 8.3 (ability) ─┤
                       ─→ 8.4 (inventory)─┤
                       ─→ 8.5 (set)      ─┤
                                          └─→ 8.6 (集成测试)
                                                │
                                                ↓
                                          9.1 (combat-base) ─→ 9.2 (combat-wuxia) ─→ 10.1 (quest) ─→ 10.2 (集成+文档)
```

**实施顺序**：
1. 8.0 + 8.1（基础，先做）
2. 8.2 + 8.3 + 8.4 + 8.5（可并行，都只依赖 effect-system）
3. 8.6（集成测试）
4. 9.1 + 9.2（战斗，串行）
5. 10.1 + 10.2（任务，串行）

---

## Deferred / 备忘

| # | 项目 | 后续 | 备忘 |
|---|------|------|------|
| 1 | 战斗外精确分钟级 tick | 后续 | MVP 用 hour_changed |
| 2 | 天赋/套装钩子式效果（先手/反击/反伤/连击/叠伤） | Phase 11 | 需沙箱 JS handler |
| 3 | 天赋/套装效果的非战斗判定（H指令/对话） | Phase 11+ | 纯阳之体等 |
| 4 | 套装钩子式效果 | Phase 11 | effects 注入 MVP 够用 |
| 5 | NPC 战斗 AI 优化 | 后续 | MVP 简单随机 |
| 6 | combat-wuxia 公式系数 mod override 机制 | 后续 | 默认值+override config |
| 7 | 限时/重复/日常任务 | 后续 | AGENTS.md 标记不支持 MVP |

---

## 验收标准

- [ ] effect-system：10 核心类型执行正确，depends_on/错误隔离/未知 type 跳过
- [ ] status-system：apply/remove/tick/stack 缩放/duration 到期
- [ ] ability-progression：gain_xp/升级/unlocks/无等级跳过
- [ ] inventory-system：增删/使用/装备穿脱/item 事件
- [ ] set-system：凑齐/失去/动态给予移除效果
- [ ] combat-base：回合循环/钩子/队友/标准事件/战斗内 tick
- [ ] combat-wuxia：伤害公式/阴阳/暴击/闪避/动态指令
- [ ] quest-system：7 step 类型/objective 推进/auto_start/任务事件
- [ ] 插件隔离：禁用任一插件不影响其他
- [ ] `npm run typecheck` + `npm run test` 全通过
- [ ] 文档更新（developer/mod/plugin guide）
