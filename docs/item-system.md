# 道具系统手册（P1.3）

> 2026-08-12 重写（物品系统复刻计划 Task 7）：schema 定稿、目录化数据组织、消耗语义
> （占用/归还）、use 注册与校验、礼物基础版。复刻目标：erArk 道具系统（Item ID 100-108）。

## 一、分层与数据组织

物品数据两级落位，加载时 deepMerge（mod 覆盖插件默认，同 id 合法；mod 文件间重复 error）：

| 层 | 位置 | 内容 |
|----|------|------|
| 插件默认层 | `src/plugins/h-core/data/default/items/*.toml` | H 原生物品（药物/玩具/避孕套）——"原生通用"，mod 可 override |
| mod 定义层 | `mods/[模组]/definitions/items/*.toml` | 按类别分文件（武器/服装/材料…），推荐目录拆分 |
| 单文件兼容 | `mods/[模组]/definitions/items.toml` | 旧式单文件写法，与目录拆分并存，加载时合并 |

加载器（`mod-loader.ts` `loadItemDefs`）：

- 插件默认层 + mod 层各自遍历：`{路径}/items.toml`、`{路径}/definitions/items/*.toml`、`{路径}/data/default/items/*.toml`
- 插件默认先合并（同 id 覆盖合法），mod 层再合并（文件间同 id 重复 → **error**，文件名+行号）
- 字段校验只对 mod 层生效（插件默认数据假设自检合格）

## 二、物品 schema 全字段表

```toml
[items."V震动棒"]
id = "V震动棒"            # 中文 id，全局唯一（跨文件重复 → 加载 error）
name = "V震动棒"          # 显示名（省略时用 id）
type = "equipment"        # 五枚举：consumable|equipment|tool|material|key
use = ["h_toy"]           # 数组（兼容字符串单值写法）；注册方式见 §三
tags = ["toy", "h_toy"]   # 自由字符串数组，引擎不校验不消费（分类用）
stackable = false         # 是否可堆叠
consume = true            # 使用后是否扣数量，默认 true（见 §四）
effects = [...]           # 使用/装备时执行的效果组（effect-system）
description = "..."       # 可选：描述文本
price = 10                # 可选：商店价格（数字；商店系统未实现，仅为字段预留）
level = 1                 # 可选：需求等级（数字；暂无消费方）
time_cost = 10            # 可选：使用耗时（分钟；暂无消费方）

# H 专属（body_slot ≥ 0 时 body_auto_remove 必填）
body_slot = 2             # 身体物品槽位号；-1 = 即时药（不占槽）
body_auto_remove = "manual"  # manual|h_end|expiry（body_slot≥0 必填）
duration = 120            # 可选：持续分钟（body_auto_remove=expiry 时用，装槽时写 expiry 时间戳）
tick_base = 20            # 可选：tick 基础快感值（body_item_tick 用）
tick_part = { ability = "V感觉", params = ["阴道"] }  # 可选：tick 部位能力

# 装备加值（顶层数字，引擎不识别语义——由消费方插件按需读取）
attack_bonus = 5          # 可选：攻击加值
defense_bonus = 3         # 可选：防御加值
```

### type 五枚举

| type | 语义 | 示例 |
|------|------|------|
| `consumable` | 消耗品（药物/礼物） | 回血丹、媚药、玉佩 |
| `equipment` | 可装备/占槽（服装、玩具） | 布衣、V震动棒 |
| `tool` | 工具（无标准使用流） | 绳子 |
| `material` | 材料（无 use） | 草药 |
| `key` | 钥匙/任务物品（无标准使用流） | 山门钥匙 |

## 三、use 注册方式

`use` 决定物品在哪用、怎么用。**内置 5 类 + 插件注册扩展**：

| use | 注册者 | 场景 | 说明 |
|-----|--------|------|------|
| `self` | 内置 | 探索→背包 | 对自己用（回血药等） |
| `target` | 内置 | 探索→目标交互 | 对目标用（改造药/礼物） |
| `equip` | 内置 | 背包→装备 | 穿到服装/武器槽 |
| `gift` | 内置 | 送礼 | 走 give_gift 礼物效果（见 §八） |
| `key` | 内置 | 特殊 | 钥匙/任务物品 |
| `h_drug` | h-core onLoad 注册 | H 模式→药物菜单 | H 中药物（润滑/媚药/避孕药），body_slot=-1 即时生效，>0 占槽位 |
| `h_toy` | h-core onLoad 注册 | H 模式→玩具菜单 | 装备到 body_item 槽（震动棒/乳头夹等） |
| `h_special` | h-core onLoad 注册 | H 模式 | 特殊逻辑（避孕套射精时自动检查） |

插件注册自定义 use：`onLoad` 中 `useRegistry.register('你的use名')`（core 通用机制，`src/core/use-registry.ts`，内置 BUILTIN_USE_TYPES = self/target/equip/gift/key）。**未注册的 use 值 → 加载 warning**（无默认 UI 入口，需指令或插件处理）。

## 四、消耗语义表（grill 定案）

| 场景 | 背包变化 | 语义 |
|------|---------|------|
| `useItem`（consume 默认 true） | -1 | 使用即扣 1；数量不足 → 拦截（不执行 effects，返回 false） |
| `useItem`（consume=false） | 0 | 使用不扣数量（可重复使用的物品） |
| 装槽（body_item_equip） | -1 | 占用：物品从背包进 body_items[slot] |
| 手动卸下（body_item_unequip） | +1 | 归还背包 |
| H 结束清理（body_auto_remove=h_end） | +1 | 归还背包 |
| 到期（body_auto_remove=expiry） | 0 | **不归还**（已消耗） |
| 避孕套射精消耗 | 0 | **不归还**（已消耗，h-ejaculation 清槽） |
| 事后避孕药（槽12） | 0 | 受孕判定时失效清槽（h-pregnancy，一次有效） |
| 排卵促进药（槽10） | 0 | 受孕判定时消耗清槽（h-pregnancy，×5 后消耗） |
| 即时药（body_slot=-1） | 已扣 | **不归还**（一次性效果） |

> ✅ expiry 到期清槽已接线（2026-08-12 第二轮审计）：`h-core` 监听 `game:hour_changed`，
> 遍历角色 `body_items`，`expiry <= 当前分钟` 的槽位自动清除（不归还背包——药已消耗）。
> 对应 erArk realtime_settle.py:270-283。安眠药 480 分钟 / 事前避孕药 30 天到点自动失效。

### 目标解析约定（2026-08-12 第四轮审计）

**物品 effects 的执行目标由调用方 `_targetIds` 决定，不要在物品 effects 里写 `params.target`**：

- `useItem(charId, itemId, targetId?)`：目标 = `targetId ?? charId`（给目标用药/送礼传 targetId）
- 指令 effects：目标 = effect 顶层 `target` 字段（`{type = "x", target = "selected", params = {...}}`）或调用方注入的目标
- 引擎所有 handler（modify_attribute/apply_lubricant/body_item_equip/...）统一读 `ctx._targetIds`——`params.target` 是死参数（曾写在数据里误导，已清理）
- 例外：`give_gift` 支持 handler 级 `params.target`（'selected'/'player'/角色 id 直传）——多目标效果的特例

## 五、body_item 槽位与前提

身体物品槽（H 相关，独立于服装 equipment），槽位编号由 mod 在 `body_slot` 字段定义，**引擎不硬编码**（机制绑定槽位，不绑定物品名）。运行时状态存角色实体：

```
body_items: {
  "0":  { itemId: "乳头夹",   active: true, expiry?: number },
  ...
}
```

### 槽位惯例（erArk 同构，h-core 默认数据）

| 槽位 | 物品 | type | body_auto_remove |
|------|------|------|-----------------|
| 0 | 乳头夹 | 持久 | manual |
| 1 | 阴蒂夹 | 持久 | manual |
| 2 | V 震动棒 | 持久 | manual |
| 3 | A 震动棒 | 持久 | manual |
| 4 | 挤奶器 | H-only | h_end |
| 6 | 眼罩 | H-only | h_end |
| 7 | 肛门拉珠 | H-only | h_end |
| 9 | 安眠药 | 药物（480 分钟） | expiry |
| 10 | 排卵促进药 | 药物 | manual |
| 11 | 事前避孕药 | 药物（43200 分钟 = 30 天） | expiry |
| 12 | 事后避孕药 | 药物 | manual |
| 13 | 避孕套 | 特殊 | h_end（射精时自动消耗，精液不进入 target 体内） |
| 14 | 口球 | H-only | h_end |

> 槽位 5/8 当前未占用——**自由扩展**：mod 可用任意数字槽位号（如 15+），只需在物品的
> `body_slot` 声明。槽位与物品名解耦，改物品不改机制。

### 快捷前提（硬编码槽位）

通用前提走 `premiseParam` 传槽位号（如 `TARGET_HAS_BODY_ITEM`）；以下快捷前提**硬编码了具体槽位**，mod 想换槽位需自行注册新前提：

| 前提 | 槽位 | 说明 |
|------|------|------|
| `TARGET_HAS_VIBRATOR` | 2 | 目标阴道有震动棒 |
| `TARGET_HAS_ANAL_BEADS` | 7 | 目标肛门有拉珠 |
| `TARGET_HAS_CONDOM` | 13 | 目标戴着避孕套 |
| `TARGET_HAS_GAG` | 14 | 目标戴着口球 |
| `TARGET_HAS_NIPPLE_CLAMP` | 0 | 目标乳头有夹 |
| `TARGET_HAS_MILKER` | 4 | 目标戴着挤奶器 |
| `TARGET_HAS_BLINDFOLD` | 6 | 目标戴着眼罩 |
| `TARGET_HAS_SLEEPING_PILL` | 9 | 目标吃了安眠药 |
| `TARGET_HAS_CONTRACEPTIVE` | 11/12 | 目标吃了避孕药 |
| `VIBRATOR_LEVEL_GE_1/2/3` | — | 目标震动棒档位 ≥1/2/3 |
| `VIBRATOR_LEVEL_0` | — | 目标震动棒关闭 |
| `SELF_VIBRATOR_LEVEL_GE_1` | — | 自己震动棒档位 ≥1 |
| `HAS_BODY_ITEM` | — | 自己某槽有物品（参数化） |
| `NOT_BODY_ITEM` | — | 自己某槽无物品 |

## 六、H 生命周期与 body_item

```
H 开始
  ├─ autoClothOff（脱胸罩/内裤，跳过饰品 cloth_tag=6）
  └─ body_item 不受影响

H 中
  ├─ 使用药物/玩具 → body_item_equip 效果
  │    1. 从背包扣减物品（consume 语义）
  │    2. body_items[slot] = { itemId, active: true }
  │    3. 有 duration → 设 expiry
  ├─ 卸下玩具 → body_item_unequip（归还背包 +1）

射精
  ├─ 检查 body_items[13]（避孕套）
  │    有 → condom_count++，精液不进入 target
  │    无 → 正常精液追踪
  └─ 避孕套消耗：清除 body_items[13]（不归还背包）

每次 H 行动后（execution_end 二段结算）
  └─ body_item_tick：遍历所有 active 的 body_item
       每个有 tick_part 的物品按公式产生部位快感

H 结束（endHScene）
  ├─ 释放寸止累计 → 上限成长 → 穿回衣服（equipment_off → equipment）
  └─ 遍历 body_items，清除 body_auto_remove=h_end 的项（归还背包 +1）
```

### 震动棒/玩具 tick 配置

```toml
[items."V震动棒"]
tick_base = 20
tick_part = { ability = "V感觉", params = ["阴道"] }
```

| 玩具 | tick_part.ability | tick_part.params |
|------|------------------|-----------------|
| 乳头夹 | B感觉 | [胸部] |
| 阴蒂夹 | C感觉 | [阴蒂] |
| V 震动棒 | V感觉 | [阴道] |
| A 震动棒 | A感觉 | [后穴] |
| 挤奶器 | B感觉 | [胸部] |

tick 公式（erArk SecondEffect）：

```
toy_adjust = sex_toy_level × 0.5        # 0→0, 1→0.5, 2→1.0, 3→1.5
ability_adjust = getAbilityAdjust(ability_lv)  # [0:1.0, 5:1.8, 10:4.0]
pleasure = tick_base × ability_adjust × toy_adjust
```

`sex_toy_level`（0-3）存在 h_state 中，通过 `vibrator_up`/`vibrator_down`/`vibrator_set` effect 控制。

## 七、校验规则表

| 规则 | 级别 | 说明 |
|------|------|------|
| mod 文件间同 id 重复 | **error** | 物品 id 必须整个模组内唯一（文件名+行号） |
| `body_slot ≥ 0` 且缺 `body_auto_remove` | **error** | 占槽物品必须声明 manual/h_end/expiry |
| `use` 值未注册 | **warning** | 无默认 UI 入口，需指令或插件处理（useRegistry 检查） |
| `consume` 非 boolean | **warning** | 必须 true/false |
| `price`/`level`/`time_cost` 非 number | **warning** | 必须数字 |
| `tags` 内容 | 不校验 | 自由字符串，引擎不消费 |
| `attack_bonus`/`defense_bonus` | 不校验 | 顶层数字，引擎不认识语义 |
| body_slot 槽位冲突 | 不校验 | 槽位号自由扩展，mod 自行规划 |
| 角色 equipment 引用不存在的物品 | **error** | roster/named 穿未定义物品 → 精准报错（第三轮审计，2026-08-12） |
| 引用未定义物品（指令/状态/任务） | 运行时 warning | 各消费方处理 |

## 八、礼物基础版（give_gift）

h-core 注册 `give_gift` effect（erArk 22-礼物与咖啡系统.md §1）。mode 四选：

| mode | 语义 |
|------|------|
| `favor` | 好感 += calcFavorability(target, floor(favor_base × talk_multiplier))；话术能力修正（hConfig `gift_talk_ability_id`，默认"话术技能"，乘 ability_lv_adjust 表）；`trust_base > 0` → 信赖 += calcTrust |
| `apology` | 愤怒 = 0 + 好感 +10 + 好意 +10（erArk 道歉礼物 171） |
| `drug` | 不处理——药物效果由物品 effects 链直接表达 |
| `mold` | **TODO 未实装**（倒模礼物，erArk Gift_Items type 13，见 §九） |

```toml
effects = [{ type = "give_gift", params = { mode = "favor", favor_base = 30, talk_multiplier = 2, target = "selected" } }]
effects = [{ type = "give_gift", params = { mode = "apology", target = "selected" } }]
```

测试物品：test-mod `玉佩`（favor）/ `道歉信`（apology）。

## 九、TODO

- ~~**expiry 到期自动清槽**~~（2026-08-12 已接线——见 §四 ✅ 说明；h-core `game:hour_changed` 监听）
- **mold 倒模礼物**：give_gift mode=mold 未实装（依赖自定义物品生成）
- **商店**：`price` 字段已预留，商店系统未实现
- **采集/交易**：inventory tags 驱动指令半成品（仅 gather 占位，无交易指令）
- **咖啡加料**：erArk 礼物与咖啡系统的咖啡部分未实现
- **灌肠液/利尿剂**：效果待 h-core 注册 apply_enema/apply_diuretic 后补充（当前 effects 为空）
- **erArk 能力映射补全**：ability[33] 欲情/润滑、ability[34] 露出、ability[35] 施虐——extra_feel_settle 结算逻辑，后续指令复刻时按需补充

## 十、文件索引

| 文件 | 用途 |
|------|------|
| `src/plugins/h-core/data/default/items/h-drugs.toml` | H 原生药物（润滑液/媚药/跳蛋/灌肠液/利尿剂/安眠药/排卵促进药/避孕药） |
| `src/plugins/h-core/data/default/items/h-toys.toml` | H 原生玩具（乳头夹/阴蒂夹/V震动棒/A震动棒/挤奶器/眼罩/肛门拉珠/口球） |
| `src/plugins/h-core/data/default/items/h-special.toml` | H 原生特殊（避孕套） |
| `mods/test-mod/definitions/items.toml` | 测试物品：回血丹/绳子/服装 8 件/玉佩/道歉信 |
| `src/core/use-registry.ts` | use 注册表（BUILTIN_USE_TYPES + 插件注册） |
| `src/core/mod-loader.ts` | loadItemDefs：目录拆分加载 + 重复校验 + 字段校验 |
| `src/plugins/inventory-system/index.ts` | useItem/removeItem/addItem（消耗语义） |
| `src/plugins/h-core/index.ts` | body_item_equip/unequip/clear_all/tick + give_gift + H 结束清理 |
| `src/plugins/h-core/types.ts` | BodyItemSlot 类型 |
| `src/plugins/h-ejaculation/index.ts` | 避孕套射精检查 |
| `src/plugins/h-core/premise/premise-body-item.ts` | body_item 前提 |
