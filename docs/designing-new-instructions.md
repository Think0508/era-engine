# 设计新指令手册（含实行判定链管线）

> 适用：在 era-engine 中新增一条玩家/NPC 可执行指令（TOML 数据），尤其是带“目标是否接受/退缩”的 H/猥亵/社交类指令。
> 关联：`docs/mod-author-guide.md` · `docs/superpowers/plans/2026-08-25-favorite-position-part-system.md`
> 经验来源：chat/stroke/rest/take_shower 复刻 + 喜欢体位/部位 + 判定链文本。

---

## 一、先判断：这条指令要不要走“实行判定管线”

你自己设计新指令时，先回答一个问题：

> **这条指令是否应该有“目标可能退缩/拒绝”的语义？**

- 不需要：如 `休息`、`淋浴`、`查看状态`、`移动` —— 不写 `judge_base`，不会走判定链。
- 需要：如 `摸胸`、`邀请H`、`性交`、`亲吻` —— 写 `judge_base`，引擎自动注入 `judge_check` 并输出判定链。

判定链不是你想不想显示的问题：**只要写了 `judge_base > 0`，就会自动进入管线。**

---

## 二、新指令的最小字段清单

```toml
[[instructions]]
id = "my_instruction"
label = "我的新指令"
category = "obscenity"          # daily/obscenity/sex/arts/...
time_cost = 10                  # 分钟
priority = 50
premises = ["HAVE_TARGET", "NOT_H"]
# 位置前提 → condition，不要写 IN_*：
condition = ""                  # 如 location.tags.has_bathroom == true
tags = ["kind:play"]

effects = [
  # 如果你的指令要影响目标是否接受，就写 judge_base：
  # judge_base = 200 会在加载时自动在 effects 最前面注入 judge_check，
  # 不需要手动写 { type = "judge_check" }
  { type = "settle_favorability" },
]
```

---

## 三、实行判定：你需要提供的三样东西

### 1. `judge_base`（必填，如果你要判定）

```toml
judge_base = 200
```
这是 erArk 的“需要实行值至少为 X”。加载器自动：
- 在效果链最前面注入 `judge_check`；
- 判定失败（退缩）时，后面的 `settle_*` 全部跳过。

### 2. `judge_class`（可选，但建议）

```toml
judge_base = 500
judge_class = "性交"
```
用途：
- 决定判定链头部是“需要性爱实行值”还是“需要基础实行值”；
- 查 `hConfig [judge.adjustments]` 里的特殊修正。

如果你是新指令，没有现成判定族：
- 可以在 `hConfig [judge.adjustments]` 新增一个族；
- 或直接只写 `judge_base`，不写 `judge_class`（走基础判定，不吃特殊修正表）。

### 3. 部位标签 `part:`（可选，只有部位型指令需要）

```toml
tags = ["part:vagina"]
```
作用：
- 让“喜欢的部位”判定加成生效；
- 让判定链显示 `+喜欢小穴(10)`；
- 后续 AI/口上也能按部位筛选。

已知 `part:` 词表（可扩展）：`breast / clit / mouth / vagina / anus / womb / foot / butt / mental` 等，需与 `favorite.ts` 的 `PART_TAG_TO_KEY` 对应。

---

## 四、判定链会自动包含什么

只要走了 `judge_check`，判定链会自动生成：

```
需要性爱实行值至少为500
当前值为：好感修正(0)+信赖修正(0)+…+喜欢背后位(30)+喜欢小穴(10) = 320
```

自动包含：
- 门槛值（来自 `judge_base`）；
- 好感/信赖修正；
- 状态/能力/刻印/心情/陷落/天赋修正；
- 他人在场修正；
- 喜欢的体位/部位（如果命中）；
- `hConfig [judge.adjustments]` 特殊修正。

你不需要自己写任何文字拼接；所有段都在 `calcJudge()` 里统一管理。

---

## 五、如果你要新增“判定族特殊修正”

在 `hConfig [judge.adjustments]` 加：

```toml
[judge.adjustments]
"我的判定族" = [
  { condition = "target.talents.某天赋 == 1", value = -50, label = "某天赋" },
]
```

要点：
- `condition` 必须是条件引擎表达式；
- `value` 可为正/负；
- `label` 只写**名称**，不要写 `(-50)`；符号和括号由判定链自动加：
  - 正数 → `+某天赋(50)`
  - 负数 → `-某天赋(50)`
- 缺省 label 时用 `{判定族}修正`，但建议显式写 label。

---

## 六、如果你要新增“喜欢的部位/体位”显示名

默认显示名在 `src/plugins/h-core/settle/favorite.ts`：
- 体位：读 `hConfig.sex_positions[name]`；
- 部位：`PART_DISPLAY_NAMES` 表 + fallback `部位{id}`。

新增自定义部位时：
1. 在 `PART_TAG_TO_KEY` 加标签→键映射；
2. 在 `PART_DISPLAY_NAMES` 加显示名；
3. 如需 mod 自定义，可后续把表迁到 hConfig。

---

## 七、测试新指令时必查

1. **判定结果**：`success/partial/retreated` 是否符合预期；
2. **判定链文本**：`calcJudge(...).reasonText` 或 `judge_check` 输出的日志里，是否出现你期望的段；
3. **负数格式**：减值应显示 `-某修正(50)`，不是 `+某修正(-50)`；
4. **口上顺序**：判定链先出，效果与口上后出；
5. **未实装项**：不要期待醉酒/爱情旅馆/激素等未实现修正出现在链里。

示例断言风格：

```ts
const r = calcJudge(500, 0, 0, 'npc_1', '性交', 'vagina')
expect(r.reasonText).toContain('需要性爱实行值至少为500')
expect(r.reasonText).toContain('+喜欢小穴(10)')
expect(r.reasonText).toMatch(/ = \d+\n$/)
```

---

## 八、经验总结（沉淀）

1. **判定链是“算出来”的，不是“写出来”的**：新指令只需给 `judge_base` / `judge_class` / `part:`，文字自动生成。
2. **数值和文字同一来源**：`calcJudge()` 同时算结果和 reason，不会出现文本与数值脱节。
3. **不要手写 `judge_check`**：加载器自动注入；手写会导致重复判定。
4. **不要手写 `IN_*` 前提**：位置用 `condition = "location.tags.xxx == true"`。
5. **不要往判定链塞未实装修正**：等对应系统实装后再补。
6. **新判定族记得给 label**：否则会显示 `{判定族}修正` 这种通用名，不算错但不够可读。