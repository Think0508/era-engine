# 原生词条速查表（Native Default Entries Catalog）

> 自动生成：`npm run gen:catalog`（`scripts/gen-native-catalog.cjs`）。**勿手改**，改数据/新增词条后重新生成提交。
> 扫描范围：`src/plugins/*/data/default/**/*.toml`（与引擎 mod-loader glob 一致）。**不含 mod 层**。
> 校验：`npm run check:catalog`（`--check`），重复 ID / 悬空引用 → 退出码 1。

## 汇总

| 类目 | 数量 | 说明 |
|---|---|---|
| 天赋 talents | 177 | h-core/data/default/talents.toml · 标签分组见输出；gain 语法糖编译进 gain-rule-system；mod 可 override |
| 关系 relations | types=1 · pairs=7 · groups=1 | h-core/data/default/relations.toml · 关系有向，端对×端；groups 引用未定义 pair/类型 → 校验报错；mod 可覆盖/新增 |
| 能力 abilities | 36 | h-core/data/default/abilities.toml · 带等级的一切（感度/扩张/ABL/刻印/技术）；升级路径另见 ability-upgrades |
| 能力升级表 ability-upgrades | 29 | h-core/data/default/ability-upgrades.toml（生成文件，勿手改）· 仅声明已存在能力的条件升级路径；needs 里 juel→实绩、ability→能力 会被校验 |
| 属性 attributes | 100 | h-core + combat-wuxia 两处 attributes.toml · 定义权威：条件字段 player.{属性}/character.{ID}.{属性} 自动生成；绑定同名 |
| 状态效果 status-effects | 3 | h-core/data/default/status-effects.toml · 条件路径 character.{id}.status.{状态ID} / .stack；v1 不深挖 tick_effects 内部引用 |
| 物品 items | 23 | h-core/items/（药物/玩具/特种）+ h-bondage + hunger-system + confinement-system， 分散多文件、跨文件按 ID 合并 → 跨文件重名会被查重；v1 不展开 effects 内部引用 |
| 束缚类型 bondage | 16 | h-core/data/default/bondage/types.toml · 数组表（[[types]]），完全对齐 erArk Bondage.csv |
| 实绩 juels | 23 | h-core/data/default/juels.toml（生成文件，勿手改）· status_attr 必须指向 attributes.toml 里存在的每日重置属性 → 校验 |
| 装备槽 equipment | 9 | h-core/data/default/equipment.toml · 数组表（[[slots]]） |
| 天赋获得规则 talent-gains | 8 | h-core/data/default/talent-gains.toml（生成文件，勿手改）· [talents."X"] 的 key 必须已定义于 talents.toml； needs 的 ability→能力 / talent→天赋 / juel→实绩 都会被校验 |
| **合计** | **433** | 含关系子表 |

## 天赋 talents

**添加新词条**（复制模板，改后重跑生成）：

```toml
[talents."新天赋"]
name = "新天赋"
max = 1
description = "一句话说明（引擎不消费，仅文档）"
tags = ["性素质"]   # 性素质/身体素质/精神素质/技术素质/其他素质
# 可选：state_adjusts / favorability_adjusts / favorite_position / gain（gain-rule-system 语法糖）
```

> 归属/注意：h-core/data/default/talents.toml ·
标签分组见输出；gain 语法糖编译进 gain-rule-system；mod 可 override

**天赋 talents（177）**

分组小计：`性素质` 63　`精神素质` 42　`身体素质` 44　`其他素质` 6　`技术素质` 22

| ID | 分组 | 关键字段 | 来源 |
|---|---|---|---|
| 厨艺 | 技术素质 | max=1 | h-core/talents.toml |
| 隔空插入 | 技术素质 | max=1 | h-core/talents.toml |
| 隔衣触摸 | 技术素质 | max=1 | h-core/talents.toml |
| 广域时停 | 技术素质 | max=1 · gain | h-core/talents.toml |
| 回复快 | 技术素质 | max=1 | h-core/talents.toml |
| 回复慢 | 技术素质 | max=1 | h-core/talents.toml |
| 集体催眠 | 技术素质 | max=1 | h-core/talents.toml |
| 教官 | 技术素质 | max=1 · state×1 | h-core/talents.toml |
| 精确时停 | 技术素质 | max=1 | h-core/talents.toml |
| 酒量差 | 技术素质 | max=1 | h-core/talents.toml |
| 酒量好 | 技术素质 | max=1 | h-core/talents.toml |
| 灵活舌头 | 技术素质 | max=1 | h-core/talents.toml |
| 灵活手指 | 技术素质 | max=1 | h-core/talents.toml |
| 内衣透视 | 技术素质 | max=1 | h-core/talents.toml |
| 千杯不醉 | 技术素质 | max=1 | h-core/talents.toml |
| 腔内透视 | 技术素质 | max=1 | h-core/talents.toml |
| 生理透视 | 技术素质 | max=1 | h-core/talents.toml |
| 透衣触摸 | 技术素质 | max=1 | h-core/talents.toml |
| 猥亵催眠 | 技术素质 | max=1 | h-core/talents.toml |
| 心体催眠 | 技术素质 | max=1 | h-core/talents.toml |
| 性爱催眠 | 技术素质 | max=1 | h-core/talents.toml |
| 窄域时停 | 技术素质 | max=1 · gain | h-core/talents.toml |
| 爱侣 | 精神素质 | max=1 · favor×1 | h-core/talents.toml |
| 背后位喜好 | 精神素质 | max=1 · 体位偏好#2 | h-core/talents.toml |
| 背面抱位喜好 | 精神素质 | max=1 · 体位偏好#10 | h-core/talents.toml |
| 背面立位喜好 | 精神素质 | max=1 · 体位偏好#8 | h-core/talents.toml |
| 背面骑乘位喜好 | 精神素质 | max=1 · 体位偏好#4 | h-core/talents.toml |
| 背面卧位喜好 | 精神素质 | max=1 · 体位偏好#12 | h-core/talents.toml |
| 背面座位喜好 | 精神素质 | max=1 · 体位偏好#6 | h-core/talents.toml |
| 宠物 | 精神素质 | max=1 · favor×1 | h-core/talents.toml |
| 脆弱 | 精神素质 | max=1 · state×1 | h-core/talents.toml |
| 倒错 | 精神素质 | max=1 | h-core/talents.toml |
| 对面抱位喜好 | 精神素质 | max=1 · 体位偏好#9 | h-core/talents.toml |
| 对面立位喜好 | 精神素质 | max=1 · 体位偏好#7 | h-core/talents.toml |
| 对面骑乘位喜好 | 精神素质 | max=1 · 体位偏好#3 | h-core/talents.toml |
| 对面卧位喜好 | 精神素质 | max=1 · 体位偏好#11 | h-core/talents.toml |
| 对面座位喜好 | 精神素质 | max=1 · 体位偏好#5 | h-core/talents.toml |
| 感情缺乏 | 精神素质 | max=1 · state×1 · favor×1 | h-core/talents.toml |
| 孤僻 | 精神素质 | max=1 · state×1 | h-core/talents.toml |
| 坚强 | 精神素质 | max=1 · state×1 | h-core/talents.toml |
| 开放 | 精神素质 | max=1 · state×1 | h-core/talents.toml |
| 懒散 | 精神素质 | max=1 · state×1 | h-core/talents.toml |
| 恋慕 | 精神素质 | max=1 · favor×1 | h-core/talents.toml |
| 恋人 | 精神素质 | max=1 · favor×1 | h-core/talents.toml |
| 难以越过的底线 | 精神素质 | max=1 | h-core/talents.toml |
| 奴隶 | 精神素质 | max=1 · favor×1 | h-core/talents.toml |
| 勤劳 | 精神素质 | max=1 · state×1 | h-core/talents.toml |
| 屈从 | 精神素质 | max=1 · favor×1 | h-core/talents.toml |
| 热情 | 精神素质 | max=1 · state×1 | h-core/talents.toml |
| 施虐狂 | 精神素质 | max=1 · state×1 | h-core/talents.toml |
| 受虐狂 | 精神素质 | max=1 · state×1 | h-core/talents.toml |
| 思慕 | 精神素质 | max=1 · favor×1 | h-core/talents.toml |
| 讨厌男性 | 精神素质 | max=1 · favor×1 | h-core/talents.toml |
| 讨厌女性 | 精神素质 | max=1 | h-core/talents.toml |
| 献身 | 精神素质 | max=1 · state×1 | h-core/talents.toml |
| 性好奇 | 精神素质 | max=1 | h-core/talents.toml |
| 性冷漠 | 精神素质 | max=1 | h-core/talents.toml |
| 性无知 | 精神素质 | max=1 | h-core/talents.toml |
| 羞耻 | 精神素质 | max=1 · state×1 | h-core/talents.toml |
| 驯服 | 精神素质 | max=1 · favor×1 | h-core/talents.toml |
| 已催眠·极 | 精神素质 | max=1 | h-core/talents.toml |
| 已催眠·浅 | 精神素质 | max=1 | h-core/talents.toml |
| 已催眠·深 | 精神素质 | max=1 | h-core/talents.toml |
| 正常位喜好 | 精神素质 | max=1 · 体位偏好#1 | h-core/talents.toml |
| 被博士持有把柄 | 其他素质 | max=1 | h-core/talents.toml |
| 持有博士把柄 | 其他素质 | max=1 | h-core/talents.toml |
| 戒指 | 其他素质 | max=1 | h-core/talents.toml |
| 女儿 | 其他素质 | max=1 | h-core/talents.toml |
| 项圈 | 其他素质 | max=1 | h-core/talents.toml |
| 信物 | 其他素质 | max=1 | h-core/talents.toml |
| 爆乳 | 身体素质 | max=1 | h-core/talents.toml |
| 翅膀 | 身体素质 | max=1 | h-core/talents.toml |
| 触手 | 身体素质 | max=1 | h-core/talents.toml |
| 大姐姐 | 身体素质 | max=1 | h-core/talents.toml |
| 大胃王 | 身体素质 | max=1 | h-core/talents.toml |
| 带电体质 | 身体素质 | max=1 | h-core/talents.toml |
| 带毒体质 | 身体素质 | max=1 | h-core/talents.toml |
| 低存在感 | 身体素质 | max=1 | h-core/talents.toml |
| 低温体质 | 身体素质 | max=1 | h-core/talents.toml |
| 毒抗性 | 身体素质 | max=1 | h-core/talents.toml |
| 饿得快 | 身体素质 | max=1 | h-core/talents.toml |
| 高温体质 | 身体素质 | max=1 | h-core/talents.toml |
| 光环 | 身体素质 | max=1 | h-core/talents.toml |
| 巨乳 | 身体素质 | max=1 | h-core/talents.toml |
| 巨臀 | 身体素质 | max=1 | h-core/talents.toml |
| 绝壁 | 身体素质 | max=1 | h-core/talents.toml |
| 萝莉 | 身体素质 | max=1 | h-core/talents.toml |
| 猫舌 | 身体素质 | max=1 | h-core/talents.toml |
| 贫乳 | 身体素质 | max=1 | h-core/talents.toml |
| 普乳 | 身体素质 | max=1 | h-core/talents.toml |
| 普臀 | 身体素质 | max=1 | h-core/talents.toml |
| 人格障碍 | 身体素质 | max=1 | h-core/talents.toml |
| 人妻 | 身体素质 | max=1 | h-core/talents.toml |
| 肉腿 | 身体素质 | max=1 | h-core/talents.toml |
| 少女 | 身体素质 | max=1 | h-core/talents.toml |
| 失忆 | 身体素质 | max=1 | h-core/talents.toml |
| 视力障碍 | 身体素质 | max=1 | h-core/talents.toml |
| 嗜睡 | 身体素质 | max=1 | h-core/talents.toml |
| 兽耳 | 身体素质 | max=1 | h-core/talents.toml |
| 兽角 | 身体素质 | max=1 | h-core/talents.toml |
| 兽尾 | 身体素质 | max=1 | h-core/talents.toml |
| 熟女 | 身体素质 | max=1 | h-core/talents.toml |
| 听力障碍 | 身体素质 | max=1 | h-core/talents.toml |
| 细腿 | 身体素质 | max=1 | h-core/talents.toml |
| 小车 | 身体素质 | max=1 | h-core/talents.toml |
| 小臀 | 身体素质 | max=1 | h-core/talents.toml |
| 小足 | 身体素质 | max=1 | h-core/talents.toml |
| 行动不便 | 身体素质 | max=1 | h-core/talents.toml |
| 义肢 | 身体素质 | max=1 | h-core/talents.toml |
| 婴儿 | 身体素质 | max=1 | h-core/talents.toml |
| 幼女 | 身体素质 | max=1 | h-core/talents.toml |
| 长生者 | 身体素质 | max=1 | h-core/talents.toml |
| 长足 | 身体素质 | max=1 | h-core/talents.toml |
| 昼伏夜出 | 身体素质 | max=1 | h-core/talents.toml |
| 本番合意 | 性素质 | max=1 | h-core/talents.toml |
| 避孕中出合意 | 性素质 | max=1 | h-core/talents.toml |
| 不易湿 | 性素质 | max=1 | h-core/talents.toml |
| 产后 | 性素质 | max=1 | h-core/talents.toml |
| 发情期中 | 性素质 | max=1 | h-core/talents.toml |
| 肛门处女 | 性素质 | max=1 | h-core/talents.toml |
| 肛门钝感 | 性素质 | max=1 | h-core/talents.toml |
| 肛门敏感 | 性素质 | max=1 | h-core/talents.toml |
| 肛门性交合意 | 性素质 | max=1 | h-core/talents.toml |
| 肛射中毒 | 性素质 | max=1 | h-core/talents.toml |
| 精爱味觉 | 性素质 | max=1 | h-core/talents.toml |
| 精液膨腹 | 性素质 | max=1 | h-core/talents.toml |
| 精液中毒 | 性素质 | max=1 | h-core/talents.toml |
| 临盆 | 性素质 | max=1 · favor×1 | h-core/talents.toml |
| 漏尿 | 性素质 | max=1 | h-core/talents.toml |
| 泌乳 | 性素质 | max=1 | h-core/talents.toml |
| 尿道处女 | 性素质 | max=1 | h-core/talents.toml |
| 尿道钝感 | 性素质 | max=1 | h-core/talents.toml |
| 尿道敏感 | 性素质 | max=1 | h-core/talents.toml |
| 尿道性交合意 | 性素质 | max=1 | h-core/talents.toml |
| 浓厚精液 | 性素质 | max=1 | h-core/talents.toml |
| 皮肤钝感 | 性素质 | max=1 | h-core/talents.toml |
| 皮肤敏感 | 性素质 | max=1 | h-core/talents.toml |
| 亲吻合意 | 性素质 | max=1 | h-core/talents.toml |
| 妊娠 | 性素质 | max=1 · favor×1 | h-core/talents.toml |
| 妊娠合意 | 性素质 | max=1 | h-core/talents.toml |
| 容易湿 | 性素质 | max=1 | h-core/talents.toml |
| 乳房钝感 | 性素质 | max=1 | h-core/talents.toml |
| 乳房敏感 | 性素质 | max=1 | h-core/talents.toml |
| 受精 | 性素质 | max=1 · favor×1 | h-core/talents.toml |
| 兽部钝感 | 性素质 | max=1 | h-core/talents.toml |
| 兽部敏感 | 性素质 | max=1 | h-core/talents.toml |
| 童贞 | 性素质 | max=1 | h-core/talents.toml |
| 未成年 | 性素质 | max=1 | h-core/talents.toml |
| 未初潮 | 性素质 | max=1 | h-core/talents.toml |
| 无接吻经验 | 性素质 | max=1 | h-core/talents.toml |
| 无意识妊娠 | 性素质 | max=1 | h-core/talents.toml |
| 阴道处女 | 性素质 | max=1 | h-core/talents.toml |
| 阴道钝感 | 性素质 | max=1 | h-core/talents.toml |
| 阴道敏感 | 性素质 | max=1 | h-core/talents.toml |
| 阴蒂钝感 | 性素质 | max=1 | h-core/talents.toml |
| 阴蒂敏感 | 性素质 | max=1 | h-core/talents.toml |
| 阴茎钝感 | 性素质 | max=1 | h-core/talents.toml |
| 阴茎敏感 | 性素质 | max=1 | h-core/talents.toml |
| 淫肛 | 性素质 | max=1 | h-core/talents.toml |
| 淫宫 | 性素质 | max=1 | h-core/talents.toml |
| 淫胱 | 性素质 | max=1 | h-core/talents.toml |
| 淫核 | 性素质 | max=1 | h-core/talents.toml |
| 淫茎 | 性素质 | max=1 | h-core/talents.toml |
| 淫乱 | 性素质 | max=1 | h-core/talents.toml |
| 淫乳 | 性素质 | max=1 | h-core/talents.toml |
| 淫体 | 性素质 | max=1 | h-core/talents.toml |
| 淫膣 | 性素质 | max=1 | h-core/talents.toml |
| 饮精中毒 | 性素质 | max=1 | h-core/talents.toml |
| 育儿 | 性素质 | max=1 | h-core/talents.toml |
| 孕肚 | 性素质 | max=1 | h-core/talents.toml |
| 真·淫魔 | 性素质 | max=1 | h-core/talents.toml |
| 膣射中毒 | 性素质 | max=1 | h-core/talents.toml |
| 周期性发情 | 性素质 | max=1 | h-core/talents.toml |
| 子宫处女 | 性素质 | max=1 | h-core/talents.toml |
| 子宫钝感 | 性素质 | max=1 | h-core/talents.toml |
| 子宫敏感 | 性素质 | max=1 | h-core/talents.toml |
| 自慰中毒 | 性素质 | max=1 | h-core/talents.toml |

## 关系 relations

**添加新词条**（复制模板，改后重跑生成）：

```toml
[types."新关系类型"]
# kind=relation（三档 正/中/负）：
#   对称型："夫妻" = { kind = "relation", pair = "spouse" }
#   端对型："父母子女（为大）" = { kind = "relation", pair = "parent_child", side = "big" }
#   纯类型："仇人" = { kind = "relation", reverse = "被仇" }
# kind=sentiment（数值）：
#   "新好感度" = { kind = "sentiment", min = 0, max = 100, default = 30 }

[pairs.新词表]        # 新增称呼词表（panel 成对名 + address 单方称呼）
panel = { big_male = "X", big_female = "X", small_male = "x", small_female = "x" }

[groups]               # 新增关系组（元素 = 类型名 或 { pair = "词表" }）
"新组" = ["已定义类型", { pair = "parent_child" }]
```

> 归属/注意：h-core/data/default/relations.toml ·
关系有向，端对×端；groups 引用未定义 pair/类型 → 校验报错；mod 可覆盖/新增

### 关系类型 types（1）

| ID | 分组 | 关键字段 | 来源 |
|---|---|---|---|
| 好感度 | — | kind=sentiment · [0,100] · def=30 | h-core/relations.toml |

### 称呼词表 pairs（7）

| ID | 分组 | 关键字段 | 来源 |
|---|---|---|---|
| parent_child | — | panel=4词 · addr=4端 | h-core/relations.toml |
| sibling | — | panel=4词 · addr=4端 | h-core/relations.toml |
| grandparent | — | panel=4词 · addr=4端 | h-core/relations.toml |
| teacher_student | — | panel=师徒 · addr=4端 | h-core/relations.toml |
| master_servant | — | panel=主仆 · addr=4端 | h-core/relations.toml |
| spouse | — | panel=夫妻 · addr=2端 | h-core/relations.toml |
| lover | — | panel=恋人 · addr=2端 | h-core/relations.toml |

### 关系组 groups（1）

| ID | 分组 | 关键字段 | 来源 |
|---|---|---|---|
| 血亲 | — | 成员=3（类型×0 · pair×3） | h-core/relations.toml |


## 能力 abilities

**添加新词条**（复制模板，改后重跑生成）：

```toml
[abilities."新能力"]
name = "新能力"
type = "passive"        # passive/active/...
max_level = 8
tags = ["sensation"]    # 标签决定升级/消费分组
```

> 归属/注意：h-core/data/default/abilities.toml ·
带等级的一切（感度/扩张/ABL/刻印/技术）；升级路径另见 ability-upgrades

**能力 abilities（36）**

分组小计：`sensation` 12　`abl` 8　`h_mark` 7　`technique` 9

| ID | 分组 | 关键字段 | 来源 |
|---|---|---|---|
| 话术技能 | abl | type=passive · max=8 | h-core/abilities.toml |
| 技巧 | abl | type=passive · max=8 | h-core/abilities.toml |
| 露出 | abl | type=passive · max=8 | h-core/abilities.toml |
| 亲密 | abl | type=passive · max=8 | h-core/abilities.toml |
| 施虐 | abl | type=passive · max=8 | h-core/abilities.toml |
| 受虐 | abl | type=passive · max=8 | h-core/abilities.toml |
| 顺从 | abl | type=passive · max=8 | h-core/abilities.toml |
| 欲望 | abl | type=passive · max=8 | h-core/abilities.toml |
| 反发刻印 | h_mark | type=passive · max=3 | h-core/abilities.toml |
| 恐怖刻印 | h_mark | type=passive · max=3 | h-core/abilities.toml |
| 苦痛刻印 | h_mark | type=passive · max=3 | h-core/abilities.toml |
| 快乐刻印 | h_mark | type=passive · max=3 | h-core/abilities.toml |
| 屈服刻印 | h_mark | type=passive · max=3 | h-core/abilities.toml |
| 时姦刻印 | h_mark | type=passive · max=3 | h-core/abilities.toml |
| 无觉刻印 | h_mark | type=passive · max=6 | h-core/abilities.toml |
| 后穴感度 | sensation | type=passive · max=8 | h-core/abilities.toml |
| 后穴扩张 | sensation | type=passive · max=8 | h-core/abilities.toml |
| 口喉感度 | sensation | type=passive · max=8 | h-core/abilities.toml |
| 皮肤感度 | sensation | type=passive · max=8 | h-core/abilities.toml |
| 心理感度 | sensation | type=passive · max=8 | h-core/abilities.toml |
| 胸部感度 | sensation | type=passive · max=8 | h-core/abilities.toml |
| 阴道感度 | sensation | type=passive · max=8 | h-core/abilities.toml |
| 阴道扩张 | sensation | type=passive · max=8 | h-core/abilities.toml |
| 阴蒂感度 | sensation | type=passive · max=8 | h-core/abilities.toml |
| 阴茎感度 | sensation | type=passive · max=8 | h-core/abilities.toml |
| 子宫感度 | sensation | type=passive · max=8 | h-core/abilities.toml |
| 子宫扩张 | sensation | type=passive · max=8 | h-core/abilities.toml |
| 肛技 | technique | type=passive · max=8 | h-core/abilities.toml |
| 舌技 | technique | type=passive · max=8 | h-core/abilities.toml |
| 胸技 | technique | type=passive · max=8 | h-core/abilities.toml |
| 腰技 | technique | type=passive · max=8 | h-core/abilities.toml |
| 隐蔽 | technique | type=passive · max=8 | h-core/abilities.toml |
| 榨精 | technique | type=passive · max=8 | h-core/abilities.toml |
| 指技 | technique | type=passive · max=8 | h-core/abilities.toml |
| 膣技 | technique | type=passive · max=8 | h-core/abilities.toml |
| 足技 | technique | type=passive · max=8 | h-core/abilities.toml |

## 能力升级表 ability-upgrades

**添加新词条**（复制模板，改后重跑生成）：

```toml
[abilities."既有能力名"]
mode = "condition"
sex_need = -1
[[abilities."既有能力名".upgrades]]
needs = [{ type = "juel", id = 0, value = 125 }, { type = "experience", id = 0, value = 5 }]
```

> 归属/注意：h-core/data/default/ability-upgrades.toml（生成文件，勿手改）·
仅声明已存在能力的条件升级路径；needs 里 juel→实绩、ability→能力 会被校验

**能力升级表 ability-upgrades（29）**

分组小计：`condition` 29

| ID | 分组 | 关键字段 | 来源 |
|---|---|---|---|
| 肛技 | condition | mode=condition · 升8级 · sex=1 | h-core/ability-upgrades.toml |
| 后穴感度 | condition | mode=condition · 升8级 · sex=-1 | h-core/ability-upgrades.toml |
| 后穴扩张 | condition | mode=condition · 升8级 · sex=-1 | h-core/ability-upgrades.toml |
| 话术技能 | condition | mode=condition · 升8级 · sex=-1 | h-core/ability-upgrades.toml |
| 技巧 | condition | mode=condition · 升8级 · sex=-1 | h-core/ability-upgrades.toml |
| 口喉感度 | condition | mode=condition · 升8级 · sex=-1 | h-core/ability-upgrades.toml |
| 露出 | condition | mode=condition · 升8级 · sex=-1 | h-core/ability-upgrades.toml |
| 皮肤感度 | condition | mode=condition · 升8级 · sex=-1 | h-core/ability-upgrades.toml |
| 亲密 | condition | mode=condition · 升8级 · sex=-1 | h-core/ability-upgrades.toml |
| 舌技 | condition | mode=condition · 升8级 · sex=-1 | h-core/ability-upgrades.toml |
| 施虐 | condition | mode=condition · 升8级 · sex=-1 | h-core/ability-upgrades.toml |
| 受虐 | condition | mode=condition · 升8级 · sex=-1 | h-core/ability-upgrades.toml |
| 顺从 | condition | mode=condition · 升8级 · sex=-1 | h-core/ability-upgrades.toml |
| 心理感度 | condition | mode=condition · 升8级 · sex=-1 | h-core/ability-upgrades.toml |
| 胸部感度 | condition | mode=condition · 升8级 · sex=-1 | h-core/ability-upgrades.toml |
| 胸技 | condition | mode=condition · 升8级 · sex=1 | h-core/ability-upgrades.toml |
| 腰技 | condition | mode=condition · 升8级 · sex=0 | h-core/ability-upgrades.toml |
| 阴道感度 | condition | mode=condition · 升8级 · sex=1 | h-core/ability-upgrades.toml |
| 阴道扩张 | condition | mode=condition · 升8级 · sex=1 | h-core/ability-upgrades.toml |
| 阴蒂感度 | condition | mode=condition · 升8级 · sex=1 | h-core/ability-upgrades.toml |
| 阴茎感度 | condition | mode=condition · 升8级 · sex=0 | h-core/ability-upgrades.toml |
| 隐蔽 | condition | mode=condition · 升8级 · sex=-1 | h-core/ability-upgrades.toml |
| 欲望 | condition | mode=condition · 升8级 · sex=-1 | h-core/ability-upgrades.toml |
| 榨精 | condition | mode=condition · 升8级 · sex=1 | h-core/ability-upgrades.toml |
| 指技 | condition | mode=condition · 升8级 · sex=-1 | h-core/ability-upgrades.toml |
| 膣技 | condition | mode=condition · 升8级 · sex=1 | h-core/ability-upgrades.toml |
| 子宫感度 | condition | mode=condition · 升8级 · sex=1 | h-core/ability-upgrades.toml |
| 子宫扩张 | condition | mode=condition · 升8级 · sex=1 | h-core/ability-upgrades.toml |
| 足技 | condition | mode=condition · 升8级 · sex=-1 | h-core/ability-upgrades.toml |

## 属性 attributes

**添加新词条**（复制模板，改后重跑生成）：

```toml
"新属性" = { type = "number", default = 0, category = "base", display = true, display_group = "status" }
# category: base/parameter/combat/...；parameter 可加 daily_reset=true
# 绑定系统：插件 required_attributes 用 bindings.toml 映射到本属性
```

> 归属/注意：h-core + combat-wuxia 两处 attributes.toml ·
定义权威：条件字段 player.{属性}/character.{ID}.{属性} 自动生成；绑定同名

**属性 attributes（100）**

分组小计：`base` 32　`combat` 2　`parameter` 24　`economy` 1　`social` 5　`ability` 29　`mark` 7

| ID | 分组 | 关键字段 | 来源 |
|---|---|---|---|
| 肛技 | ability | type=number · def=0 · 显示[性能力] | h-core/attributes.toml |
| 后穴感度 | ability | type=number · def=0 · 显示[感觉] | h-core/attributes.toml |
| 后穴扩张 | ability | type=number · def=0 · 显示[感觉] | h-core/attributes.toml |
| 话术技能 | ability | type=number · def=0 · 显示[性能力] | h-core/attributes.toml |
| 技巧 | ability | type=number · def=0 · 显示[性能力] | h-core/attributes.toml |
| 口喉感度 | ability | type=number · def=0 · 显示[感觉] | h-core/attributes.toml |
| 露出 | ability | type=number · def=0 · 显示[性能力] | h-core/attributes.toml |
| 皮肤感度 | ability | type=number · def=0 · 显示[感觉] | h-core/attributes.toml |
| 亲密 | ability | type=number · def=0 · 显示[性能力] | h-core/attributes.toml |
| 舌技 | ability | type=number · def=0 · 显示[性能力] | h-core/attributes.toml |
| 施虐 | ability | type=number · def=0 · 显示[性能力] | h-core/attributes.toml |
| 受虐 | ability | type=number · def=0 · 显示[性能力] | h-core/attributes.toml |
| 顺从 | ability | type=number · def=0 · 显示[性能力] | h-core/attributes.toml |
| 心理感度 | ability | type=number · def=0 · 显示[感觉] | h-core/attributes.toml |
| 胸部感度 | ability | type=number · def=0 · 显示[感觉] | h-core/attributes.toml |
| 胸技 | ability | type=number · def=0 · 显示[性能力] | h-core/attributes.toml |
| 腰技 | ability | type=number · def=0 · 显示[性能力] | h-core/attributes.toml |
| 阴道感度 | ability | type=number · def=0 · 显示[感觉] | h-core/attributes.toml |
| 阴道扩张 | ability | type=number · def=0 · 显示[感觉] | h-core/attributes.toml |
| 阴蒂感度 | ability | type=number · def=0 · 显示[感觉] | h-core/attributes.toml |
| 阴茎感度 | ability | type=number · def=0 · 显示[感觉] | h-core/attributes.toml |
| 隐蔽 | ability | type=number · def=0 · 显示[性能力] | h-core/attributes.toml |
| 欲望 | ability | type=number · def=0 · 显示[性能力] | h-core/attributes.toml |
| 榨精 | ability | type=number · def=0 · 显示[性能力] | h-core/attributes.toml |
| 指技 | ability | type=number · def=0 · 显示[性能力] | h-core/attributes.toml |
| 膣技 | ability | type=number · def=0 · 显示[性能力] | h-core/attributes.toml |
| 子宫感度 | ability | type=number · def=0 · 显示[感觉] | h-core/attributes.toml |
| 子宫扩张 | ability | type=number · def=0 · 显示[感觉] | h-core/attributes.toml |
| 足技 | ability | type=number · def=0 · 显示[性能力] | h-core/attributes.toml |
| 定力 | base | type=number · def=0 · 显示[combat] | combat-wuxia/attributes.toml |
| 额外精液量 | base | type=number · def=0 · 显示[h] | h-core/attributes.toml |
| 愤怒 | base | type=number · def=0 · 显示[emotion] | h-core/attributes.toml |
| 福缘 | base | type=number · def=0 · 显示[combat] | combat-wuxia/attributes.toml |
| 根骨 | base | type=number · def=0 · 显示[combat] | combat-wuxia/attributes.toml |
| 饥饿值 | base | type=number · def=0 · 显示[status] | h-core/attributes.toml |
| 精力 | base | type=number · def=100 · 显示[status] | h-core/attributes.toml |
| 精力上限 | base | type=number · def=100 · 显示[status] | h-core/attributes.toml |
| 精液量 | base | type=number · def=100 · 显示[h] | h-core/attributes.toml |
| 精液量上限 | base | type=number · def=100 · 显示[h] | h-core/attributes.toml |
| 酒气 | base | type=number · def=0 · 显示[emotion] | h-core/attributes.toml |
| 理性 | base | type=number · def=100 · 显示[emotion] | h-core/attributes.toml |
| 力道 | base | type=number · def=0 · 显示[combat] | combat-wuxia/attributes.toml |
| 灵敏 | base | type=number · def=0 · 显示[combat] | combat-wuxia/attributes.toml |
| 尿意 | base | type=number · def=0 · 显示[status] | h-core/attributes.toml |
| 排卵周期 | base | type=number · def=0 | h-core/attributes.toml |
| 疲劳度 | base | type=number · def=0 · 显示[status] | h-core/attributes.toml |
| 气力 | base | type=number · def=100 · 显示[status] | h-core/attributes.toml |
| 气力上限 | base | type=number · def=2000 · 显示[status] | h-core/attributes.toml |
| 情绪 | base | type=number · def=50 · 显示[emotion] | h-core/attributes.toml |
| 射精欲 | base | type=number · def=0 · 显示[h] | h-core/attributes.toml |
| 射精欲上限 | base | type=number · def=1000 · 显示[h] | h-core/attributes.toml |
| 熟睡值 | base | type=number · def=0 · 显示[status] | h-core/attributes.toml |
| 体力 | base | type=number · def=100 · 显示[status] | h-core/attributes.toml |
| 体力上限 | base | type=number · def=2500 · 显示[status] | h-core/attributes.toml |
| 消化剩余 | base | type=number · def=0 | h-core/attributes.toml |
| 性别 | base | type=number · def=0 | h-core/attributes.toml |
| 阴茎大小 | base | type=number · def=1 · 显示[h] | h-core/attributes.toml |
| 欲望值 | base | type=number · def=0 · 显示[h] | h-core/attributes.toml |
| hp | base | type=number · def=100 · 显示[status] | h-core/attributes.toml |
| mp | base | type=number · def=50 · 显示[status] | h-core/attributes.toml |
| speed | base | type=number · def=5 · 显示[base] | h-core/attributes.toml |
| attack | combat | type=number · def=10 · 显示[combat] | h-core/attributes.toml |
| defense | combat | type=number · def=5 · 显示[combat] | h-core/attributes.toml |
| 金钱 | economy | type=number · def=0 · 显示[economy] | h-core/attributes.toml |
| 反发刻印 | mark | type=number · def=0 · 显示[刻印] | h-core/attributes.toml |
| 恐怖刻印 | mark | type=number · def=0 · 显示[刻印] | h-core/attributes.toml |
| 苦痛刻印 | mark | type=number · def=0 · 显示[刻印] | h-core/attributes.toml |
| 快乐刻印 | mark | type=number · def=0 · 显示[刻印] | h-core/attributes.toml |
| 屈服刻印 | mark | type=number · def=0 · 显示[刻印] | h-core/attributes.toml |
| 时姦刻印 | mark | type=number · def=0 · 显示[刻印] | h-core/attributes.toml |
| 无觉刻印 | mark | type=number · def=0 · 显示[刻印] | h-core/attributes.toml |
| 反感 | parameter | type=number · def=0 · 显示[行为参数] · 每日重置 | h-core/attributes.toml |
| 恭顺 | parameter | type=number · def=0 · 显示[行为参数] · 每日重置 | h-core/attributes.toml |
| 好意 | parameter | type=number · def=0 · 显示[行为参数] · 每日重置 | h-core/attributes.toml |
| 后穴 | parameter | type=number · def=0 · 显示[身体快感] · 每日重置 | h-core/attributes.toml |
| 恐怖 | parameter | type=number · def=0 · 显示[行为参数] · 每日重置 | h-core/attributes.toml |
| 口喉 | parameter | type=number · def=0 · 显示[身体快感] · 每日重置 | h-core/attributes.toml |
| 苦痛 | parameter | type=number · def=0 · 显示[行为参数] · 每日重置 | h-core/attributes.toml |
| 快乐 | parameter | type=number · def=0 · 显示[行为参数] · 每日重置 | h-core/attributes.toml |
| 尿道 | parameter | type=number · def=0 · 每日重置 | h-core/attributes.toml |
| 皮肤 | parameter | type=number · def=0 · 显示[身体快感] · 每日重置 | h-core/attributes.toml |
| 屈服 | parameter | type=number · def=0 · 显示[行为参数] · 每日重置 | h-core/attributes.toml |
| 润滑 | parameter | type=number · def=0 · 显示[行为参数] · 每日重置 | h-core/attributes.toml |
| 习得 | parameter | type=number · def=0 · 显示[行为参数] · 每日重置 | h-core/attributes.toml |
| 先导 | parameter | type=number · def=0 · 显示[行为参数] · 每日重置 | h-core/attributes.toml |
| 心理 | parameter | type=number · def=0 · 显示[身体快感] · 每日重置 | h-core/attributes.toml |
| 胸部 | parameter | type=number · def=0 · 显示[身体快感] · 每日重置 | h-core/attributes.toml |
| 羞耻 | parameter | type=number · def=0 · 显示[行为参数] · 每日重置 | h-core/attributes.toml |
| 抑郁 | parameter | type=number · def=0 · 显示[行为参数] · 每日重置 | h-core/attributes.toml |
| 阴道 | parameter | type=number · def=0 · 显示[身体快感] · 每日重置 | h-core/attributes.toml |
| 阴蒂 | parameter | type=number · def=0 · 显示[身体快感] · 每日重置 | h-core/attributes.toml |
| 阴茎 | parameter | type=number · def=0 · 显示[身体快感] · 每日重置 | h-core/attributes.toml |
| 优越 | parameter | type=number · def=0 · 显示[行为参数] · 每日重置 | h-core/attributes.toml |
| 欲情 | parameter | type=number · def=0 · 显示[行为参数] · 每日重置 | h-core/attributes.toml |
| 子宫 | parameter | type=number · def=0 · 显示[身体快感] · 每日重置 | h-core/attributes.toml |
| 道德感 | social | type=number · def=50 · 显示[人设] | h-core/attributes.toml |
| 好感度 | social | type=number · def=30 · 显示[social] | h-core/attributes.toml |
| 坚强度 | social | type=number · def=50 · 显示[人设] | h-core/attributes.toml |
| 信赖度 | social | type=number · def=0 · 显示[social] | h-core/attributes.toml |
| 贞操观 | social | type=number · def=50 · 显示[人设] | h-core/attributes.toml |

## 状态效果 status-effects

**添加新词条**（复制模板，改后重跑生成）：

```toml
[status-effects."新状态"]
name = "新状态"
description = "…"
category = "buff"          # buff/debuff
duration = 120             # 0 = 永久
stackable = true
max_stack = 3
# 可选 tick_effects = [{ type = "modify_attribute", params = { attr = "hp", value = -5, target = "self" } }]
```

> 归属/注意：h-core/data/default/status-effects.toml ·
条件路径 character.{id}.status.{状态ID} / .stack；v1 不深挖 tick_effects 内部引用

**状态效果 status-effects（3）**

分组小计：`debuff` 1　`buff` 2

| ID | 分组 | 关键字段 | 来源 |
|---|---|---|---|
| 攻击增益 | buff | dur=180 · 不叠加 | h-core/status-effects.toml |
| 醉意 | buff | dur=120 · stack×3 | h-core/status-effects.toml |
| 中毒 | debuff | dur=360 · 不叠加 | h-core/status-effects.toml |

## 物品 items

**添加新词条**（复制模板，改后重跑生成）：

```toml
[items."新物品"]
name = "新物品"
type = "consumable"        # consumable/tool/equipment/...
use = ["h_drug"]            # 或 ["food"] 等
tags = ["drug"]
stackable = true
consume = true
body_slot = -1
effects = [{ type = "apply_xxx", params = { ... } }]   # 效果 type 须已注册
```

> 归属/注意：h-core/items/（药物/玩具/特种）+ h-bondage + hunger-system + confinement-system，
分散多文件、跨文件按 ID 合并 → 跨文件重名会被查重；v1 不展开 effects 内部引用

**物品 items（23）**

分组小计：`tool` 2　`consumable` 10　`equipment` 8　`food` 3

| ID | 分组 | 关键字段 | 来源 |
|---|---|---|---|
| 安眠药 | consumable | type=consumable · 可堆叠 · use[h_drug] | h-core/items/h-drugs.toml |
| 避孕套 | consumable | type=consumable · 可堆叠 · use[h_special] | h-core/items/h-special.toml |
| 灌肠液 | consumable | type=consumable · 可堆叠 · use[h_drug] | h-core/items/h-drugs.toml |
| 利尿剂 | consumable | type=consumable · 可堆叠 · use[h_drug] | h-core/items/h-drugs.toml |
| 媚药 | consumable | type=consumable · 可堆叠 · use[h_drug] | h-core/items/h-drugs.toml |
| 排卵促进药 | consumable | type=consumable · 可堆叠 · use[h_drug] | h-core/items/h-drugs.toml |
| 润滑液 | consumable | type=consumable · 可堆叠 · use[h_drug] | h-core/items/h-drugs.toml |
| 事后避孕药 | consumable | type=consumable · 可堆叠 · use[h_drug] | h-core/items/h-drugs.toml |
| 事前避孕药 | consumable | type=consumable · 可堆叠 · use[h_drug] | h-core/items/h-drugs.toml |
| 跳蛋 | consumable | type=consumable · 可堆叠 · use[h_drug] | h-core/items/h-drugs.toml |
| 肛门拉珠 | equipment | type=equipment · 不堆叠 · use[h_toy] | h-core/items/h-toys.toml |
| 挤奶器 | equipment | type=equipment · 不堆叠 · use[h_toy] | h-core/items/h-toys.toml |
| 口球 | equipment | type=equipment · 不堆叠 · use[h_toy] | h-core/items/h-toys.toml |
| 乳头夹 | equipment | type=equipment · 不堆叠 · use[h_toy] | h-core/items/h-toys.toml |
| 眼罩 | equipment | type=equipment · 不堆叠 · use[h_toy] | h-core/items/h-toys.toml |
| 阴蒂夹 | equipment | type=equipment · 不堆叠 · use[h_toy] | h-core/items/h-toys.toml |
| A震动棒 | equipment | type=equipment · 不堆叠 · use[h_toy] | h-core/items/h-toys.toml |
| V震动棒 | equipment | type=equipment · 不堆叠 · use[h_toy] | h-core/items/h-toys.toml |
| 干粮 | food | type=— · 可堆叠 · 食Q3 · use[food] | hunger-system/items.toml |
| 甜点 | food | type=— · 可堆叠 · 食Q6 · use[food] | hunger-system/items.toml |
| 饮水 | food | type=— · 可堆叠 · 食Q1 · use[food] | hunger-system/items.toml |
| 绳子 | tool | type=tool · 不堆叠 · 不消耗 · use[key] | h-bondage/items.toml |
| 携袋 | tool | type=tool · 可堆叠 · 不消耗 · use[tool] | confinement-system/items/bag.toml |

## 束缚类型 bondage

**添加新词条**（复制模板，改后重跑生成）：

```toml
[[types]]
id = 16                  # 新 id 递增，勿撞已有
name = "新缚"
level = 1                # 影响挣脱难度档
affect_walking = false
need_facility = false
description = "…"
```

> 归属/注意：h-core/data/default/bondage/types.toml ·
数组表（[[types]]），完全对齐 erArk Bondage.csv

**束缚类型 bondage（16）**

分组小计：`Lv0` 1　`Lv1` 3　`Lv2` 7　`Lv3` 5

| ID | 分组 | 关键字段 | 来源 |
|---|---|---|---|
| 0 | Lv0 | affect_walking=false · facility=false | h-core/bondage/types.toml |
| 1 | Lv1 | affect_walking=false · facility=false | h-core/bondage/types.toml |
| 2 | Lv1 | affect_walking=false · facility=false | h-core/bondage/types.toml |
| 3 | Lv1 | affect_walking=false · facility=false | h-core/bondage/types.toml |
| 10 | Lv2 | affect_walking=true · facility=true | h-core/bondage/types.toml |
| 4 | Lv2 | affect_walking=false · facility=false | h-core/bondage/types.toml |
| 5 | Lv2 | affect_walking=false · facility=false | h-core/bondage/types.toml |
| 6 | Lv2 | affect_walking=false · facility=false | h-core/bondage/types.toml |
| 7 | Lv2 | affect_walking=false · facility=false | h-core/bondage/types.toml |
| 8 | Lv2 | affect_walking=true · facility=true | h-core/bondage/types.toml |
| 9 | Lv2 | affect_walking=true · facility=true | h-core/bondage/types.toml |
| 11 | Lv3 | affect_walking=true · facility=true | h-core/bondage/types.toml |
| 12 | Lv3 | affect_walking=true · facility=false | h-core/bondage/types.toml |
| 13 | Lv3 | affect_walking=true · facility=false | h-core/bondage/types.toml |
| 14 | Lv3 | affect_walking=false · facility=false | h-core/bondage/types.toml |
| 15 | Lv3 | affect_walking=true · facility=true | h-core/bondage/types.toml |

## 实绩 juels

**添加新词条**（复制模板，改后重跑生成）：

```toml
[juels."N"]
name = "新律珠"
status_attr = "应引用的 daily_reset 属性名"
```

> 归属/注意：h-core/data/default/juels.toml（生成文件，勿手改）·
status_attr 必须指向 attributes.toml 里存在的每日重置属性 → 校验

**实绩 juels（23）**

分组小计：`—` 23

| ID | 分组 | 关键字段 | 来源 |
|---|---|---|---|
| 0 | — | → 皮肤 | h-core/juels.toml |
| 1 | — | → 胸部 | h-core/juels.toml |
| 10 | — | → 恭顺 | h-core/juels.toml |
| 11 | — | → 好意 | h-core/juels.toml |
| 12 | — | → 欲情 | h-core/juels.toml |
| 13 | — | → 快乐 | h-core/juels.toml |
| 14 | — | → 先导 | h-core/juels.toml |
| 15 | — | → 屈服 | h-core/juels.toml |
| 16 | — | → 羞耻 | h-core/juels.toml |
| 17 | — | → 苦痛 | h-core/juels.toml |
| 18 | — | → 恐怖 | h-core/juels.toml |
| 19 | — | → 抑郁 | h-core/juels.toml |
| 2 | — | → 阴蒂 | h-core/juels.toml |
| 20 | — | → 反感 | h-core/juels.toml |
| 21 | — | → 口喉 | h-core/juels.toml |
| 23 | — | → 心理 | h-core/juels.toml |
| 3 | — | → 阴茎 | h-core/juels.toml |
| 4 | — | → 阴道 | h-core/juels.toml |
| 5 | — | → 后穴 | h-core/juels.toml |
| 6 | — | → 尿道 | h-core/juels.toml |
| 7 | — | → 子宫 | h-core/juels.toml |
| 8 | — | → 润滑 | h-core/juels.toml |
| 9 | — | → 习得 | h-core/juels.toml |

## 装备槽 equipment

**添加新词条**（复制模板，改后重跑生成）：

```toml
[[slots]]
id = "中衣"
name = "中衣"
category = "clothing"    # clothing/underwear/accessory
removable = true
semen_capacity = 4000
```

> 归属/注意：h-core/data/default/equipment.toml · 数组表（[[slots]]）

**装备槽 equipment（9）**

分组小计：`clothing` 5　`underwear` 2　`accessory` 2

| ID | 分组 | 关键字段 | 来源 |
|---|---|---|---|
| accessory | accessory | removable=false · semen=1000 | h-core/equipment.toml |
| hand | accessory | removable=false · semen=1000 | h-core/equipment.toml |
| coat | clothing | removable=true · semen=4000 | h-core/equipment.toml |
| foot | clothing | removable=true · semen=4000 | h-core/equipment.toml |
| head | clothing | removable=true · semen=2000 | h-core/equipment.toml |
| lower | clothing | removable=true · semen=4000 | h-core/equipment.toml |
| upper | clothing | removable=true · semen=4000 | h-core/equipment.toml |
| bra | underwear | removable=true · semen=1000 | h-core/equipment.toml |
| panties | underwear | removable=true · semen=1000 | h-core/equipment.toml |

## 天赋获得规则 talent-gains

**添加新词条**（复制模板，改后重跑生成）：

```toml
[talents."已存在天赋名"]
gain = { gain_type = 3, needs = [
  { type = "ability", id = "亲密", value = 4 },
  { type = "talent", id = "思慕" },
  { type = "trust", value = 100 },
], replace = "思慕" }
```

> 归属/注意：h-core/data/default/talent-gains.toml（生成文件，勿手改）·
[talents."X"] 的 key 必须已定义于 talents.toml；
needs 的 ability→能力 / talent→天赋 / juel→实绩 都会被校验

**天赋获得规则 talent-gains（8）**

分组小计：`type1(手动)` 2　`type3(睡觉)` 4　`type2(指令绑定)` 2

| ID | 分组 | 关键字段 | 来源 |
|---|---|---|---|
| 屈从 | type1(手动) | ability×1 | h-core/talent-gains.toml |
| 思慕 | type1(手动) | ability×1 | h-core/talent-gains.toml |
| 宠物 | type2(指令绑定) | ability×1 · talent×1 · trust×1 · replace=驯服 | h-core/talent-gains.toml |
| 恋人 | type2(指令绑定) | ability×1 · talent×1 · trust×1 · replace=恋慕 | h-core/talent-gains.toml |
| 爱侣 | type3(睡觉) | ability×1 · talent×1 · trust×1 · replace=恋人 | h-core/talent-gains.toml |
| 恋慕 | type3(睡觉) | ability×1 · talent×1 · trust×1 · replace=思慕 | h-core/talent-gains.toml |
| 奴隶 | type3(睡觉) | ability×1 · talent×1 · trust×1 · replace=宠物 | h-core/talent-gains.toml |
| 驯服 | type3(睡觉) | ability×1 · talent×1 · trust×1 · replace=屈从 | h-core/talent-gains.toml |

## 校验报告

✅ **通过**：无解析错误、无重复 ID、无悬空引用。

## 如何新增一类词条

所有类目由 `CATEGORIES` 注册表驱动（`scripts/gen-native-catalog.cjs`）。新增一类"能新加的简单词条"：

```
1) 在 CATEGORIES 数组末尾加一条：
   { id:"新类目", title:"…", match:(f)=>path.basename(f)==="xx.toml",
     containerKey:"xx容器", isArray:false,
     groupBy:(e)=>"…", keyFields:(e)=>"…",
     container:(d)=>d.xx, template:"添加模板TOML", note:"归属/注意" }
   （数组型词条：isArray:true + entryId —— 参考 equipment/bondage）
2) 必要时在"校验"段补 refs 规则（参考 talent-gains / juels）
3) 重跑 npm run gen:catalog，确认新表与计数
```
