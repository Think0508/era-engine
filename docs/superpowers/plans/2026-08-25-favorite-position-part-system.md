# 实施计划：喜欢的体位 + 喜欢的部位（2026-08-25）

> **目标**：实现两个相互关联的偏好系统——**喜欢的体位**（多选、每角色一份）与**喜欢的部位**（多选、每角色一份、默认女体锚定），接入快感、实行判定与角色面板。
> **不含**：口上/AI 行为权重、动态“最喜欢 Top N”之外的推荐逻辑、男体部位偏好建模（引擎默认女体侧，mod 可全局覆盖）。
> 设计依据：本文件 §一（grill 定稿）；登记：`docs/master-todo.md` L1.6 后续 / h-core。

---

## 一、决策输入（grill 定稿，实现时不再改动）

| 维度 | 裁定 |
|------|------|
| 存储 | 每角色一份 `favorite.positions` 与 `favorite.parts`，均为 **score map**（部位/体位 ID → 分数），随存档持久化 |
| 数量 | 可多个；**分数 ≥ 阈值** 即视为“喜欢”，不设上限 |
| 阈值 | 体位 **100**；部位 **1000**；mod 可通过 `h-config [favorite]` 覆盖 |
| 学习 | 每次使用该体位/部位 +1 分；同时写入统计计数器 |
| 快感归属 | **谁有该喜好，谁自己的快感结算加成**；双方都有则双方各自加 |
| 判定归属 | **只看客体/被判定方**的喜欢列表；发起方喜欢不参与判定 |
| 体位命中 | 自己快感系数 **+0.5**；客体判定 **+30** |
| 部位命中 | 自己快感系数 **+0.2**；客体判定 **+10** |
| 额外经验 | **不加**（erArk 无“因为喜欢而额外给经验”的机制） |
| 身体侧 | 引擎原生默认 **女体锚定**（男角=喜欢对女体做的部位，女角=喜欢自己女体被对待的部位）；`h-config [favorite].body_side` 提供 mod **全局默认**覆盖 |
| 默认部位集 | 口(2)、胸(3)、阴蒂(4)、阴道(6)、子宫(7)、后穴(8)、脚(9)、臀部(13) + **心理（虚拟部位）**；mod 可扩展 |
| 旧字段 | 废弃旧单一 `favorite_position` 字段/天赋，**全量迁移**到 `favorite.positions` |
| 统计计数器 | 女角扩展 `male_stats` 加 `count`；男角新增对称 `female_stats`；双方新增 `position_stats` |

### 快感/判定语义（防实现错位）

- **快感**：当前体位/部位命中某角色的喜欢列表时，只在该角色自己的结算通道加系数。
  - 例：A 喜欢“女上位”、B 喜欢“背后位”，当前“女上位” → 只有 A 的快感 +0.5，B 不加。
- **判定**：实行判定是“客体/被判定方是否接受”。
  - 例：玩家（男）对女角发起“背后位”，只看女角是否喜欢“背后位”，不看玩家喜不喜欢。
- **逆推场景**：玩家（男）喜欢“女上位”+“小穴”，被女角女上位用小穴逆推时，玩家自己的快感加成命中（体位=女上位、女体小穴在场）。

---

## 二、验收标准（成功证据）

1. 每角色 `favorite.positions` / `favorite.parts` 为 score map；分数 ≥ 阈值时被识别为“喜欢”。
2. 体位/部位分数能通过“每次使用 +1”增长；达到阈值后进入喜欢列表。
3. 快感结算：
   - 角色 A 喜欢当前体位 → A 自己的快感系数 +0.5；
   - 角色 B 喜欢当前部位 → B 自己的快感系数 +0.2；
   - 双方各自独立，不互相影响。
4. 实行判定：
   - 客体喜欢当前体位 → 判定 +30；
   - 客体喜欢当前部位 → 判定 +10；
   - 发起方喜欢不影响判定。
5. 女角 `male_stats` 出现 `count` 字段；男角新增 `female_stats`；双方 `position_stats` 正常累计。
6. 旧 `favorite_position` 天赋/字段迁移到 `favorite.positions`（旧存档不丢）。
7. 角色面板/API 可读喜欢列表（按分数排序）。
8. 全量 `npm run typecheck` + `npm run test` 通过；`npm run check:catalog` 通过。

---

## 三、改动分组

### G1 数据声明

#### `src/plugins/h-core/data/default/h-config.toml` 新增 `[favorite]`
```toml
[favorite]
position_threshold = 100
part_threshold = 1000
position_feel_bonus = 0.5
position_judge_bonus = 30
part_feel_bonus = 0.2
part_judge_bonus = 10
body_side = "female"   # mod 可全局覆盖：own / partner / female / male
```

#### 默认部位定义
- 在 h-core 或 favorite 模块维护“默认部位集”常量（口/胸/阴蒂/阴道/子宫/后穴/脚/臀 + 心理虚拟 ID）。
- `心理` 作为虚拟部位 ID（如 `"mental"`），不进入 `BODY_PART_CID`，单独映射到“心理/精神类行为”。

#### 实体字段
- 新增 `favorite` 命名空间：
  ```ts
  favorite: {
    positions: Record<string, number>  // positionId -> score
    parts: Record<string, number>      // partId -> score；心理用 "mental"
  }
  ```
- 更新 `src/core/character-contract.ts` 命名空间清单与 `test-helpers.resetCharacterEntity` 重置。

### G2 计数器声明

#### `src/plugins/counter-system/data/default/counters.toml`：

- **女角扩展** `male_stats`：新增字段
  ```toml
  { id = "count", label = "部位使用次数", event = "h:part_use", add = 1 }
  ```
- **男角新增** `female_stats`（对称）：
  ```toml
  [[counters]]
  id = "female_stats"
  label = "男角对女体部位使用统计"
  scope = "character"
  type = "group_table"
  dims = [
    { id = "part", from = "payload.part" },
    { id = "partner", from = "payload.partner" },
  ]
  fields = [
    { id = "count", label = "部位使用次数", event = "h:part_use", add = 1 },
    # 预留：semen / shoots 等后续统计
  ]
  ```
- **双方新增** `position_stats`：
  ```toml
  [[counters]]
  id = "position_stats"
  label = "体位使用统计"
  scope = "character"
  type = "group_table"
  dims = [
    { id = "position", from = "payload.position" },
    { id = "partner", from = "payload.partner" },
  ]
  fields = [
    { id = "count", label = "体位使用次数", event = "h:position_use", add = 1 },
  ]
  ```

### G3 事件发射（h-core）

- 新增两个 H 动作事件（由 h-core 在 H 行动结算点发出）：
  - `h:position_use`：payload `{ character, partner, position }`
  - `h:part_use`：payload `{ character, partner, part }`
- 发射时机：
  - 有明确体位的 H 行动（插入/体位相关）→ 发 `h:position_use`；
  - 有明确部位的动作 → 发 `h:part_use`；
  - 同一行动可同时发两个事件。
- 事件同时驱动计数器与 `favorite` 分数（见 G4）。

### G4 偏好模块（h-core）

新建 `src/plugins/h-core/settle/favorite.ts`：

- `getFavoritePositions(ch, hc): number[]` —— 返回分数 ≥ 阈值的体位 ID 列表。
- `getFavoriteParts(ch, hc): string[]` —— 返回分数 ≥ 阈值的部位 ID 列表（含 `"mental"`）。
- `isFavoritePosition(ch, positionId, hc)` / `isFavoritePart(ch, partId, hc)`。
- `favoritePartApplies(ch, partId, hc)` —— 按 `body_side` 判断部位是否命中：
  - 默认 `female`：男角的喜欢部位命中 = 女体部位在场；女角的喜欢部位命中 = 自己的部位被处理。
  - mod 可全局改为 `own` / `partner` / `male`。
- `addFavoriteScore(char, 'positions'|'parts', key, hc)` —— 分数 +1。
- 迁移函数 `migrateLegacyFavoritePosition(ch, mod)` —— 旧 `favorite_position` 天赋 / 旧经验 141-152 写入 `favorite.positions`（分数 = 阈值），并移除旧字段。

### G5 快感接入

#### 体位快感（替换现有单一喜欢逻辑）
- `src/plugins/h-core/settle/state-settle.ts` 目前：
  ```ts
  if (getFavoritePosition(ch, mod) === pos) extra += 0.5
  ```
  改为：
  ```ts
  if (isFavoritePosition(ch, pos, hc)) extra += hc.favorite.position_feel_bonus
  ```
- 仅对“该角色自己的快感结算”生效；不因对方喜欢给自己加。

#### 部位快感
- 在 `state-settle.ts` / `tech_adjust` 中，结算某角色快感时传入当前部位 `partId`：
  - 若 `isFavoritePart(ch, partId, hc)` 且 `favoritePartApplies(ch, partId, hc)` → 该角色自己的系数 + `part_feel_bonus`。
- “心理”虚拟部位：精神/心控类快感结算时用 `"mental"` 命中判断。

### G6 判定接入

- `src/plugins/h-core/settle/judge.ts` 在“判定族特殊修正”前后增加：
  - 体位：`judgeClass ∈ {性交, A性交, W性交}` 且 `isFavoritePosition(target, currentPosition, hc)` → `total += position_judge_bonus`。
  - 部位：动作可解析出部位 `partId`，且 `isFavoritePart(target, partId, hc)` → `total += part_judge_bonus`。
- **只取客体**（`target` / 被判定方）；发起方喜欢不参与。
- 部位解析 helper：
  - 优先从指令 TOML / effect params 显式部位（如 `tech_adjust.part`）；
  - 无显式部位时从 `h_state.current_sex_position` 对应的插入部位映射；
  - 解析不出部位 → 不应用部位判定（不报警，因为很多指令无部位）。

### G7 面板/API

- h-core API 增加：
  ```ts
  getFavoriteList(charId, kind: 'positions' | 'parts') => { id, score }[]
  ```
- 按分数降序返回；分数 < 阈值不返回。
- 角色面板后续接入（本计划只保证 API/数据可读）。

### G8 迁移

- 旧数据：
  - `talents.toml` 中带 `favorite_position` 的定义：从默认数据移除该字段，改为普通天赋或删除；
  - 角色已有旧天赋：启动/读档时 `migrateLegacyFavoritePosition` 写入 `favorite.positions`，然后清除旧字段。
- 旧 `experience` 141-152 中 ≥100 的项：作为初始分数灌入 `favorite.positions`（不丢历史）。
- `character-contract` / `save-system` 对旧存档自动补 `favorite` 空对象。

### G9 测试

- `src/plugins/h-core/favorite.test.ts`：
  1. 阈值判定（体位 100 / 部位 1000）；
  2. 分数增长；
  3. 快感归属：A 喜欢当前体位 → 仅 A +0.5；
  4. 判定归属：客体喜欢 → +30/+10；发起方喜欢不影响；
  5. 逆推场景：男角喜欢女上位+小穴，被女角逆推时男角快感命中；
  6. 部位默认集 + 心理虚拟部位；
  7. 迁移：旧 favorite_position 天赋 → favorite.positions；
  8. `body_side` mod 覆盖。
- `src/plugins/counter-system/counter-system.test.ts` 补 `female_stats` / `position_stats` / `male_stats.count` 断言。
- `src/plugins/instruction-*.test.ts` / `settle-fidelity.test.ts` 补充新判定/快感回归。

---

## 四、边界（明确不做）

- ❌ 口上 / AI 行为权重：本轮不做“喜欢部位/体位影响 NPC 主动选择或口上权重”，留后续。
- ❌ Top N / “最喜欢”推荐：只做“分数 ≥ 阈值即喜欢”，不做只保留前几名。
- ❌ 男体部位偏好建模：引擎默认女体锚定；mod 可通过 `body_side` 改，但默认不建男体部位体系。
- ❌ 额外经验加成：不新增“因为喜欢所以经验 +1”。
- ❌ 历史 `male_stats` 旧字段结构不破坏：只新增 `count` 字段，不动既有 semen/shoots 语义。
- ❌ 不改 erArk 已确认的“女性计数器为主”的存量统计模型；男角 `female_stats` 只是对称新增，不反向聚合。

> **后续检查项（2026-08-25 审计登记）**：潜在重复计数——若同一条指令既走 `tech_adjust` 显式部位、
> 又通过 `execution_end` 的插入位置记录同一部位，该部位可能被计 2 次。当前指令数据未观察到同行动
> 双路径；接入大批 H 指令时需在 effect 层去重或验证。

---

## 五、风险与缓解

| 风险 | 缓解 |
|------|------|
| `favorite` 新命名空间影响存档/契约 | 加入 character-contract 命名空间清单；save restore 自动补空；reset helper 同步；全量回归 |
| 事件 `h:position_use` / `h:part_use` 与现有 H 结算时序冲突 | 在 h-core `execution_end` 现有点位发事件；先发计数/偏好事件，再做二段结算；文档记录事件顺序 |
| 部位解析不完整导致判定漏加 | 先支持显式部位 + 插入位置映射；解析不出不报警（指令无部位是常态）；后续可扩展 |
| 旧 favorite_position 天赋兼容 | 迁移函数幂等；在迁移完成前不删除旧读取路径（但标记 deprecated） |
| 快感归属被误写成“对方喜欢给自己加” | 单元测试专门锁“A 喜欢 → 仅 A 加”与“逆推场景”，防止回归 |

---

## 六、产出物清单（实现后勾选）

> ✅ **全部完成（2026-08-25）**：typecheck / 全量 1239 用例 / check:catalog 全绿（见下方验证行）。

- [x] `src/plugins/h-core/data/default/h-config.toml` 新增 `[favorite]`
- [x] `src/plugins/h-core/settle/favorite.ts`
- [x] `src/plugins/h-core/settle/state-settle.ts` / `tech_adjust` 快感接入（经 getFeelExtraAdjust 统一）
- [x] `src/plugins/h-core/settle/judge.ts` 判定接入 + judge_check part 透传
- [x] `src/plugins/h-core/index.ts` API（getFavoriteList）+ 事件发射（h:position_use / h:part_use）
- [x] `src/plugins/counter-system/data/default/counters.toml` 新计数器/字段
- [x] `src/core/character-contract.ts` / `src/utils/test-helpers.ts` 命名空间与重置
- [x] `src/plugins/h-core/favorite.test.ts`
- [x] `counter-system.test.ts` / `settle-fidelity.test.ts` 补充
- [x] 迁移逻辑（旧 favorite_position / experience 141-152）
- [x] `docs/mod-author-guide.md` / `docs/counter-system.md` / `docs/character-schema.md` 文档同步
- [x] typecheck + 全量测试 + check:catalog 全绿

---

## 七、二阶段：判定链文本 + 显示名映射（2026-08-25）

> ✅ 已完成：`calcJudge` 生成 erArk 风格 `reasonText`；`judge_check` 每次判定输出叙事日志；`getFavoriteList` 带 `name`；`describeFavorites` 面板文本。

- [x] `judge.ts`：`JudgeResult.reason/reasonText` 全段构建（好感/信赖恒显示、其余生效才显示、未实装不显示）
- [x] `h-config.toml [judge.adjustments]` 条目补 `label`
- [x] `favorite.ts`：`PART_DISPLAY_NAMES` + `getPositionDisplayName/getPartDisplayName` + `describeFavorites`
- [x] `h-core/index.ts`：`getFavoriteList` 返回 `name` + `describeFavorites` API
- [x] `settle-effects.ts`：`judge_check` 输出 `【{角色} 实行判定】{reasonText}` 到叙事日志（成功也显示）
- [x] 测试：favorite.test 13 例（含判定链/显示名/fallback）
- [x] 文档：mod-author-guide / character-schema 同步
- [x] typecheck + 全量 1245 用例 + validate + check:catalog 全绿