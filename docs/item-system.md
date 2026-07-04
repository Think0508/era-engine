# 道具系统手册（P1.3）

## 一、物品数据结构

角色背包：
```
inventory: [{ itemId: string, count: number }]    — 通用背包
```

身体物品槽（H 相关，独立于服装 equipment）：
```
body_items: {
  "0":  { itemId: "乳头夹",   active: true, expiry?: number },  // 玩具
  "1":  { itemId: "阴蒂夹",   active: true },                    // 玩具
  "2":  { itemId: "V震动棒",  active: true },                    // 玩具
  "3":  { itemId: "A震动棒",  active: true },                    // 玩具
  "4":  { itemId: "挤奶器",   active: true },                    // 玩具
  "6":  { itemId: "眼罩",     active: true },                    // 玩具
  "7":  { itemId: "肛门拉珠", active: true },                    // 玩具
  "9":  { itemId: "安眠药",   active: true, expiry: 480 },       // 药物
  "11": { itemId: "事前避孕药",active: true, expiry: 43200 },    // 药物
  "13": { itemId: "避孕套",   active: true },                    // 特殊
  "14": { itemId: "口球",     active: true },                    // 玩具
}
```

槽位编号由 mod 在 `items.toml` 的 `body_slot` 字段定义，引擎不硬编码。

## 二、物品 use 字段

items.toml 的 `use` 字段决定物品在哪用、怎么用：

| use | 场景 | 说明 |
|-----|------|------|
| `self` | 探索→背包 | 对自己用（回血药等） |
| `target` | 探索→目标交互 | 对目标用（改造药/礼物） |
| `h_drug` | H 模式→药物菜单 | H 中药物（润滑/媚药/避孕药等），body_slot=-1 即时生效，>0 占槽位 |
| `h_toy` | H 模式→玩具菜单 | 装备到 body_item 槽（震动棒/乳头夹等） |
| `h_special` | H 模式 | 特殊逻辑（避孕套射精时自动检查） |
| `equip` | 背包→装备 | 穿到服装/武器槽 |
| `gift` | 送礼 | 走好感公式 |
| `key` | 特殊 | 钥匙/任务物品 |

## 三、body_auto_remove

决定 body_item 的生命周期：

| 值 | H 结束时 | 示例 |
|----|---------|------|
| `manual` | 保留 | 乳头夹、震动棒（持久调教用品） |
| `h_end` | 自动清除 | 挤奶器、眼罩、口球、避孕套 |
| `expiry` | 按 duration 到期自动清除 | 安眠药、事前避孕药 |

## 四、全部 erArk 道具（精准复刻）

### 一次性药物（body_slot=-1，即时效果）

| 物品 | 效果 | erArk 精度 |
|------|------|-----------|
| 润滑液 | target.润滑 += 10000 - floor(当前×0.1)，上限 99999 | ✅ 完全一致 |
| 媚药 | target.欲情 += 10000 - floor(当前×0.016)，上限 99999 | ✅ 完全一致 |
| 媚药 | target.屈服 += 10000 - floor(当前×0.016)，上限 99999 | ✅ 完全一致 |
| 媚药 | target.desire_point = 100（满值） | ✅ 完全一致 |
| 跳蛋 | target.{部位} += 50 | ⚠️ 近似值，erArk 无固定公式 |

### 持续性药物（body_slot 8-12，占槽位）

| 槽位 | 物品 | 持续时间 | body_auto_remove |
|------|------|---------|-----------------|
| 9 | 安眠药 | 480 分钟 (8h) | expiry |
| 10 | 排卵促进药 | — | manual |
| 11 | 事前避孕药 | 43200 分钟 (30d) | expiry |
| 12 | 事后避孕药 | — | manual |

### 玩具（body_slot 0-7, 14）

| 槽位 | 物品 | 类型 | body_auto_remove |
|------|------|------|-----------------|
| 0 | 乳头夹 | 持久 | manual |
| 1 | 阴蒂夹 | 持久 | manual |
| 2 | V 震动棒 | 持久 | manual |
| 3 | A 震动棒 | 持久 | manual |
| 4 | 挤奶器 | H-only | h_end |
| 6 | 眼罩 | H-only | h_end |
| 7 | 肛门拉珠 | H-only | h_end |
| 14 | 口球 | H-only | h_end |

### 特殊

| 槽位 | 物品 | body_auto_remove | 说明 |
|------|------|-----------------|------|
| 13 | 避孕套 | h_end | 射精时自动消耗，精液不进入 target 体内 |

## 五、前提速查

### 通用前提（参数：槽位编号）
```toml
premises = ["TARGET_HAS_BODY_ITEM", "HAVE_TARGET"]    # 目标 13 号槽有物品（避孕套）
# 通过 premiseParam 传参？目前槽位前提硬编码了具体槽位
```

### 快捷前提（硬编码槽位）

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
  ├─ autoClothOff（脱胸罩/内裤，跳过饰品）
  └─ body_item 不受影响

H 中
  ├─ 使用药物/玩具 → body_item_equip 效果
  │    1. 从背包扣减物品
  │    2. body_items[slot] = { itemId, active: true }
  │    3. 有 duration → 设 expiry
  ├─ 卸下玩具 → body_item_unequip 效果

射精
  ├─ 检查 body_items[13]（避孕套）
  │    有 → condom_count++，精液不进入 target
  │    无 → 正常精液追踪
  └─ 避孕套消耗：清除 body_items[13]

每次 H 行动后
  └─ 自动触发 body_item_tick
       遍历所有 active 的 body_item
       每个有 tick_part 的物品按公式产生部位快感
       formula: pleasure = tick_base × getAbilityAdjust(ability_lv) × (sex_toy_level × 0.5)

H 结束
  ├─ cloth_wear_all（穿回衣服）
  └─ 遍历 body_items，清除 body_auto_remove=h_end 的项
```

### 震动棒/玩具 tick_part 配置

每件玩具在 `items.toml` 中配置 `tick_part` 和 `tick_base`：

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

## 八、添加新 H 道具

1. 在 `items.toml` 加条目
2. 设 `use` / `body_slot` / `body_auto_remove` / `effects`
3. 如需自定义公式 → 在 `h-core/index.ts` onLoad 注册新 effect type
4. 如需前提 → 在 `premise-body-item.ts` 注册

## 九、TODO

### 礼物系统
gift use 类型尚未实现好感公式管线。需：
1. 实现礼物效果 handler
2. 对接 calcFavorability 公式

### erArk 能力映射补全
当前 test-mod 已定义 `苦痛刻印`、`受虐`。但仍缺少：
```
ability[33] = 欲情/润滑 → 影响润滑自然分泌和欲情增长
ability[34] = 露出     → 露出→羞耻快感转换
ability[35] = 施虐     → 施虐→先导快感转换
```
这些影响状态结算的 extra_feel_settle 逻辑，后续指令复刻时按需补充。

## 九、文件索引

| 文件 | 用途 |
|------|------|
| `mods/test-mod/definitions/items.toml` | 所有物品定义 |
| `src/plugins/h-core/types.ts` | BodyItemSlot 类型 |
| `src/plugins/h-core/index.ts` | 药物/body_item 效果注册 + H 结束清理 |
| `src/plugins/h-core/premise/premise-body-item.ts` | body_item 前提 |
| `src/plugins/h-ejaculation/index.ts` | 避孕套射精检查 |
