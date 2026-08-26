# 关系系统（relation-system v2）

## 做什么

角色之间**有向关系**的建模与查询：种类（什么关系）× 档位（正面/中立/负面）双维度。引擎提供数据模型、三档转换、称呼生成（面板名/口上称呼）、跨种类聚合条件路径、修改 API/effect、变更事件——**行为推导**（帮/害/牺牲判定等）由 mod 指令 condition 用聚合路径实现。

2026-08-10 grill 定稿。权威规范：AGENTS.md §23；契约：`docs/character-schema.md` §3.5；范例：`mods/example-mod/definitions/relations.toml` + roster（段誉两父示范）。

## 关键概念

- **有向**：A→B 与 B→A 独立，**不做自动双向同步**（单方面关系合法——A 视 B 为 X，B 未必回视）
- **双维度**：种类（类型名，方向编码如"父母子女（为小）"）+ 档位（正面/中立/负面 = 1/0/-1）
- **纯三档**：档位只有三档无程度，只影响行为阈值（正面：对方被威胁时 A 愿牺牲）——推导在 mod 层
- **两型并存**：`kind="sentiment"`（数值 0-100，好感度等）/ `kind="relation"`（三档）
- **类型 = 端对 × 端**：`pair`（称呼词表）+ `side`（big 为大 / small 为小；对称类型省略）
- **多关系/多对象**：一角色对另一角色可同时是父亲+仇人+炮友（多关系）；同一类型可对多个对象（段誉两个父亲）
- **reverse**：反向类型，默认"同名换端"自动推导（父母子女（为大）↔ 父母子女（为小）），可显式覆盖

## 数据格式（definitions/relations.toml 三段）

```toml
[types]
# 数值型（kind=sentiment，默认）：
"好感度" = { min = 0, max = 100, default = 30, name = "好感度" }
# 三档型（kind=relation）：端对×端
"父母子女（为大）" = { kind = "relation", pair = "parent_child", side = "big" }
"父母子女（为小）" = { kind = "relation", pair = "parent_child", side = "small" }
# 对称型（无大小端，称呼按自己性别）：不写 side
"夫妻" = { kind = "relation", pair = "spouse" }
# 纯类型（无 pair，称呼=类型名）：reverse 显式声明
"仇人" = { kind = "relation", reverse = "被仇" }
"被仇" = { kind = "relation", reverse = "仇人" }

[pairs]   # 称呼词表——h-core 内置 parent_child/sibling/grandparent/teacher_student/
          # master_servant/spouse/lover；mod 可覆盖/新增
[pairs.parent_child]
panel = { big_male = "父", big_female = "母", small_male = "子", small_female = "女" }
address = { big_male = "父亲", big_female = "母亲", small_male = "儿子", small_female = "女儿" }
[pairs.spouse]
panel = "夫妻"                       # 对称：固定名
address = { male = "丈夫", female = "妻子" }

[groups]  # 关系组——集中定义，一处增删调；元素 = 类型名 或 { pair } 引用
"死对头" = ["仇人", "被仇"]
"血亲" = [{ pair = "parent_child" }, { pair = "sibling" }]   # 内置组（h-core 默认层）
```

## 角色数据写法

```toml
# roster 条目 / named base.toml
relations = {
  段延庆 = { "父母子女（为小）" = "正面" },      # 字符串档位（推荐）
  段正淳 = { "父母子女（为小）" = 1 },           # 或数值 1/0/-1（脚本/事件用）
  岳不群 = { "好感度" = 60 }                    # sentiment 数值原样
}
```

- 字符串 "正面"/"中立"/"负面" 或 1/0/-1 都收，加载统一存 -1/0/1；非法值 → error
- 反向关系（reverse）不对称 → warning（单方面关系合法，仅提示确认；段誉两父需在父侧写"父母子女（为大）"）

## Mod 作者使用

### 条件路径（指令 condition / 口上 condition）

```toml
# 单类型（数值 -1/0/1；负面可直接 == -1——条件引擎支持负数字面量，二元算术仍禁）
condition = "character.胡斐.relations.程灵素.单恋 == 1"
condition = "character.胡斐.relations.程灵素.父母子女（为大） < 0"

# 聚合（跨种类，括号参数 = 类型列表 或 group:组名；无括号 = 全部类型）
condition = "character.A.relations.B.any(恩人,有恩) == true"            # 存在（不看档）
condition = "character.A.relations.B.any_positive(group:血亲) == true"  # 任一正面
condition = "character.A.relations.B.any_negative(仇人,被仇) == true"   # 任一负面
condition = "character.A.relations.B.any_negative == true"              # 全部类型中任一负面
condition = "character.B.relations.A.any_positive == true"              # 对方视我为正面（求牺牲/威胁检查）

# 自由组合（&& || ! 与括号）——行为推导的典型用法：
# 搞仇人直接搞
condition = "selected.relations.player.any_negative(group:死对头) == true"
# 搞亲人要查对方是否视我为正面（不一定是同一组关系）
condition = "character.A.relations.B.any(被绿,绿了) == true && character.B.relations.A.any(group:亲属) == true"
# 乱伦判定
condition = "character.A.relations.B.any(group:血亲) == true"
```

### 修改

```toml
# relation 型：直接设档（value 收 -1/0/1 或 "正面"/"中立"/"负面"）
{ type = "modify_relation", params = { target = "段誉", relation = "父母子女（为小）", value = "正面" } }
# sentiment 型：保持加减
{ type = "modify_relation", params = { target = "岳不群", relation = "好感度", value = 10 } }
# 删除条目 = 解除关系（与设 0=中立 区分）
{ type = "remove_relation", params = { target = "段誉", relation = "父母子女（为小）" } }
```

### 称呼

- **panel**（成对名，关系面板显示）：父子/父女/母子/母女——按双方性别组合
- **address**（单方称呼，口上 `{relation_display}`）：父亲/儿子/母亲/女儿——按端+自己性别
- API 查询：`getRelationPanel(A, B, type)` / `getRelationAddress(A, B, type)`

## API（见 `docs/plugin-author-guide.md`）

```
ctx.api.call('character', 'getRelation', charId, targetId, type)          → number（-1/0/1 或 sentiment 数值）
ctx.api.call('character', 'setRelation', charId, targetId, type, value)   → void（relation 型收 1/0/-1 或 "正面"…）
ctx.api.call('character', 'removeRelation', charId, targetId, type)       → void
ctx.api.call('character', 'getRelationPanel', charId, targetId, type)     → string
ctx.api.call('character', 'getRelationAddress', charId, targetId, type)   → string
```

## 事件

标准事件（`docs/AGENTS.md` §6 事件域表）：

```
relation:added    { character, target, type, sentiment, panel, address }
relation:changed  { character, target, type, sentiment, panel, address }   # 类型级（已存在类型的档位变化）
relation:removed  { character, target, type, panel, address }
```

⚠️ **标记（2026-08-10）**：口上系统暂不监听 relation:* 事件——"B 成为了 A 的 父亲！"类关系变化口上当前无法由事件触发（需 dialogue-system 支持，待补）；quest objective 暂无 relation 类型。

## 校验规则

| 规则 | 等级 |
|------|------|
| kind 取值非法（sentiment/relation 之外） | error（阻止加载） |
| side 取值非法（big/small 之外） | error（阻止加载） |
| pair 引用不存在 | error（阻止加载） |
| reverse 指向不存在 | error（阻止加载） |
| 组内类型/pair 未定义 | error（阻止加载） |
| 三档值非法（如 0.5 / "深仇大恨"） | error（不阻止，值保留） |
| reverse 不对称（A 有 T 对 B、B 无 R） | warning（单方面关系合法，仅提示） |

## 与其他系统的交互

- **条件引擎**：单类型 + 聚合路径（`any/any_positive/any_negative` + 括号参数 + group 展开）——组合靠 `&& || !`
- **effect-system**：`modify_relation`（分类型设档）/ `remove_relation`
- **事件总线**：`relation:*` 三事件（口上/任务/成就可消费——口上待补）
- **存档**：三档存数值 -1/0/1，读档兼容；relationGroups 读档后恢复（聚合条件可用）
- **角色契约**：relations 命名空间 L1（分层表）；关系类型须在 relations.toml 定义（裸类型 warning）

## 参考

- 权威规范：AGENTS.md §23（含事件/条件/校验全文）
- 契约：`docs/character-schema.md` §3.5
- 字段字典：`docs/mod-file-guide.md` §7 / §11
- 范例：`mods/example-mod/definitions/relations.toml`（三段 + 三档写法变体）+ roster（段誉两父/夫妻单边）
- 测试：`src/core/relation-system.test.ts`（转换/组展开/称呼/聚合/API/事件/复杂组合）
