# Phase P1: 核心 era 体验 — 日常指令 + H 子系统

> 前置：MVP 完成（230 tests, Tauri exe 可跑）
> 依赖：erArk 参考文档在 `复刻攻略-猥亵-H系统专用/`

---

## 设计决策（基于 grilling）

### 指令结构（两层）
- 第1层（mod 写）：`h-instructions/{daily,obscenity,sex}/**/*.toml`，effects 数组 inline
- 第2层（引擎已有）：effectTypeRegistry 的 type handler
- 无中间映射文件，指令 id 不重复即可

### 指令前提
- 统一在 h-core 的 premiseRegistry 注册
- 指令声明 `premises = ["HAVE_TARGET", "T_NORMAL"]`
- h-core 的 h-instruction-loader 在注册指令时绑定前提求值

### erArk 参考
- 核心公式、状态值体系、数据结构参考 `00-公式手册.md`
- 指令效果数值参考 `06-08-指令集-*.md` 中的效果 ID
- 效果含义查 `21-效果ID速查表.md`
- 世界观术语统一化（源石→通用，信息素→魅力 等）

---

## Task 拆分

### Task P1.0：选项面板

**目标**：实现 SystemPanel 的选项内容，释放所有开关入口。

**文件**：`src/ui/components/SystemPanel.vue`（修改）

**内容**：
- 显示（主题 era/modern、深色模式、组标题开关、字体、字号）
- 侧栏（模式 overlay/并排、侧栏 parameter 显示开关）
- 指令栏（显示编号、收藏、作弊命令开关）
- 小键盘（显示、数字功能、快捷指令）
- 游戏（cheat 可见性）
- 存档（Phase 11 已实现入口）

**样式**：每个分类为折叠项（CollapsibleSection），内为开关/下拉/按钮。

---

### Task P1.1：日常指令系统

**目标**：实现 erArk 风格的日常指令（DAILY + PLAY + WORK 示例）。

**文件**：
- `mods/test-mod/definitions/h-instructions/daily/social.toml`
- `mods/test-mod/definitions/h-instructions/daily/play.toml`
- `mods/test-mod/definitions/h-instructions/daily/work.toml`

**分类与条目**：

| 分类 | 指令 | 属性影响 |
|------|------|---------|
| social | chat | 好感度+5 |
| | give_gift | 好感度+30 |
| | hand_in_hand | 好感度+10，情欲+5 |
| | embrace | 好感度+15，情欲+10 |
| | kiss | 好感度+20，情欲+15，屈服+5 |
| | massage | 好感度+10，疲劳-10 |
| play | play_chess | 好感度+8，记忆+2 |
| | sing | 好感度+5，魅力+2 |
| | swim | 体力-10，好感度+8 |
| work | gather | 获得草药×1-3 |
| | fish | 获得鱼×1-2 |
| | cook | 获得料理×1 |

**每条指令包含**：
- id, label, premises, effects, talk_scene, judge_base, time_cost, modes

**前提**：HAVE_TARGET / T_NORMAL / FALL_LEVEL_GE_1（亲吻以上需要）

---

### Task P1.2：服装系统扩展

**目标**：扩展 equipment 系统支持 H 场景的穿脱/阻挡/污染。

**文件**：
- `mods/test-mod/definitions/equipment.toml`（扩展槽位）
- 修改 inventory-system（equip/unequip 增强）

**扩展内容**：
- 14 槽位（头/眼/项链/上身/外套/内衣/手/戒指/下身/内裤/袜/鞋/腰带/其他）
- 每个槽位: `removable`（H 中可脱）、`semen_capacity`（精液容量）
- 角色 `equipment_off` 字段：H 中临时脱下的服装
- 角色 `equipment_semen` 字段：各槽精液污染量
- 角色 `equipment_visible` 字段：各槽可见性
- H 结束时自动穿回 equipment_off
- 未设衣服=空（不报错），引用不存在物品=warning

**服饰物品**在 `items.toml` 定义，tags 控制类别。

---

### Task P1.3：道具系统

**目标**：实现 erArk 风格的道具（药物/玩具/润滑油/避孕套等）。

**文件**：
- `mods/test-mod/definitions/items.toml`（扩展）
- `mods/test-mod/definitions/h-instructions/daily/item.toml`（道具使用指令）

**道具类型**：
- consumable（回血丹等）
- lubricant（润滑油）
- condom（避孕套）
- toy（震动棒等）
- drug（春药/安眠药等）
- material（草药/鱼/料理等）

**使用**：指令 `use_item` 调 inventory-system 的 `useItem` → 执行物品定义的 effects。

**TODO**：复杂道具（多回合效果、道具组合）后续。

---

### Task P1.4：H 子系统计划

**MVP 已实现**：h-core + h-ejaculation + h-pregnancy + h-first-time + h-exposure + h-mark

**本次 P1 聚焦**：完善现有子系统 + 整合日常/H 的指令连线。

具体内容取决于后续 grilling，先记 TODO：
- 猥亵指令（61 条，P1 做一部分示例，后续全量）
- H 内指令（200+ 条，先做 base + foreplay 示例）
- 催眠/时停/隐奸/群交/监禁/紧缚/香薰（等 grilling 优先级）

---

## 依赖关系

```
P1.0 (选项面板) ─→ 无依赖，先做
P1.1 (日常指令) ─→ 依赖 h-core + premiseRegistry（已有）
P1.2 (服装扩展) ─→ 依赖 inventory-system（已有）
P1.3 (道具系统) ─→ 依赖 inventory-system + effect-system（已有）
P1.4 (H 子系统) ─→ 依赖 P1.1-P1.3（日常指令/服装/道具 影响 H 前提和效果）
```

**推荐顺序**：P1.0 → P1.1 + P1.2 + P1.3（可并行）→ P1.4（grilling 后）

---

## 验收标准

- [ ] 选项面板可开关主题/作弊/字体等
- [ ] 聊天/送礼/牵手/拥抱/亲吻/按摩 可执行，效果正确
- [ ] 采集/钓鱼/烹饪 可执行，获取物品
- [ ] 服装 14 槽可配置，H 中可脱/穿回
- [ ] 道具可使用（回血丹加 HP、润滑油等）
- [ ] `npm run typecheck + test` 全通过
- [ ] `npm run tauri build` exe 可跑新功能
