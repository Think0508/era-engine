# B4-B7 待复核指令 · 复核清单（2026-08-26）

> 范围：此前标记“🟡 已实现（待复核）”的 **95 条** SEX 指令。
> 复核方式：代码/数据级核对 + 测试矩阵 + 自动化一致性检查（id/erark_id/口上文件存在性）。
> 结论：全部通过，状态更新为 ✅。

## 自动化核对结果

- 指令 id 全局唯一：✅（无重复）
- erark_id 数量与指令数量一致：✅（insert 58 / wait_upon 15 / item 19 / sm 3）
- 口上文件存在性：95/95 ✅
- talk-common 全量数据校验：✅（解析/前提注册/表达式校验）
- 全量测试：✅（123 files / 1452 tests / 5 skipped）

## 分族核对

| 族 | 条数 | TOML | 测试文件 | 测试例数 | 结果 |
|-----|------|------|----------|----------|------|
| insert V 链 | 16 | `sex-insert-v.toml` | `instruction-insert-a.test.ts` | 17 | ✅ |
| insert A 链 | 16 | `sex-insert-a.toml` | `instruction-insert-b.test.ts` | 17 | ✅ |
| insert 宫颈/子宫 | 26 | `sex-insert-cervix.toml` / `sex-insert-womb.toml` | `instruction-insert-c.test.ts` | 27 | ✅ |
| wait_upon | 15 | `sex-wait-upon.toml` | `instruction-wait-upon.test.ts` | 19 | ✅ |
| item | 19 | `sex-item.toml` | `instruction-item.test.ts` | 10 | ✅ |
| sm | 3 | `sex-sm.toml` | `instruction-sm.test.ts` | 4 | ✅ |

## item/sm 前提核对（2026-08-26）

- 从 `sex-item.toml` / `sex-sm.toml` 提取 **35 个唯一前提**，全部在 `src/**` 有 `registerPremise` 注册（0 缺失）。
- 语义对象核对：
  - `HAVE_*`（无前缀）= 自己背包；`TARGET_*` = 选中目标；`NOW_*` = 自己状态。
  - `PENIS_NOT_IN_TARGET_*` / `TARGET_ANUS_EMPTY` / `TARGET_NOW_*` 读 `h_state.insert_position` / `body_items` / `sex_toy_level`，已与“装备不消耗”模型统一。
  - `NOW_CONDOM` / `NOW_NOT_CONDOM` 读 `body_items['13']`（并兼容 `h_state.condom` 镜像），与 h-ejaculation 判定一致。
- 可玩性：所有 item 指令均有真实触发路径（有对应物品 + H 场景/状态），`instruction-item.test.ts` 与 `instruction-sm.test.ts` 全部执行通过。

## 复核备注（设计/映射说明，不属于复刻偏差）

1. **bondage（6503）**：erArk 原为 BONDAGE 面板选择 15 种紧缚；当前实现默认 `bondageId=1（双手缚）`，面板 UI 未做，留 `TODO(panel)`——这是 UI 缺失，不是数据偏差。
2. **wait_upon 侍奉位**：erArk 本身就用同一个 `insert_position` 表示阴茎位置（发/脸/口/胸/腋/手/腿/足/深喉等）。我们只是沿用了引擎已有的“0-4=性器位”的编号，为其补上 5-12 的映射（表示层不同，语义同 erArk）。`countable=false` 是**有意设计**：按你此前定的计数器口径，“插入次数”只统计性器进入（V/A/W），侍奉接触不计入，避免污染 `male_stats.inserts`；侍奉行动的“部位使用次数”由 `h:part_use`/`count` 统计。
3. **item 消耗模型修正**：复核后发现 erArk 中 **`H_Machine/SM` 装备与玩具都不消耗**（乳头夹/阴蒂夹/震动棒/拉珠/口球/跳蛋/电动按摩棒/绳子等），只有 `Consumables`（润滑液/媚药/避孕套等）和 H_Drug 消耗。已修正：`h-toys.toml` 全部装备类 `consume=false`，`h-drugs.toml` 的跳蛋/电动按摩棒 `consume=false`，`body_item_equip/toy_equip` 只对消耗品扣减、装备仅校验拥有；`body_item_unequip/toy_unequip/endHScene` 统一**不归还**（装备类本就在背包、消耗类已消耗）；`useItem` 传入 `_fromUseItem` 防止 `body_item_equip` 双重扣减；避孕套状态统一到 `body_items['13']`（h-ejaculation 实际判定位），`NOW_CONDOM` 同时兼容旧 `h_state.condom` 镜像。
4. **露出邀请 cid**：核对中修正为 erArk 实际 cid **5207**（原文档 5054 错误），且 tired_type=1 前提已修正。
5. **能力提升/背包**：SYSTEM 核对见 `docs/instruction-replication/system-check.md`，与 95 条指令复核无关。

## 复核补丁（2026-08-26 加审：代码/CSV/Python 级复核对账）

> 本次加审以 erArk 权威源（`InstructConfig.csv` / `Behavior_Effect.csv` / `Behavior_Data.csv` /
> `InstructJudge.csv` / `handle_instruct.py` / `constant_effect.py` / `default.py`）逐条比对，发现并修正：

### 硬伤（静默错误）
1. **womb_os_caress 漏 `pl_p_adjust`**（erArk 145 VAGINA_TECH_ADD_PL_P_ADJUST）→ 已补 `{ type="pl_p_adjust", target="self", params={ skill="膣技" } }`；补测试断言玩家射精欲。
2. **7 条指令缺 judge_base**：`nipple_clamp_on` / `clit_clamp_on` / `vibrator_insertion` / `vibrator_insertion_anal` / `anal_beads`（道具 400）、`remote_toy_on_in_h` / `remote_toy_level_up_in_h`（严重骚扰 600）→ 已补 `judge_base`；并给 body-item/toy/first-time 效果补“退缩门控”，保证退缩时装备/档位/破处均不落账。
3. **恐怖 baseValue 30 → 10**（erArk TARGET_ADD_SMALL_TERROR base=10）：`gag_on` / `gag_off` / `deep_throat` → 已改；测试断言 11/23/20。

### 翻译偏差
4. **FEEL 系列(41-48) 原被统一写成 `tech_adjust`**（多乘技巧且额外加欲情）。新增 `tech_adjust params.flat=true` 直译 erArk FEEL（只乘目标感度、不加欲情），13 条指令的 FEEL 位已改 `flat=true`；TECH_*_ADJUST(110-120) 仍用默认非 flat。
5. **口交 -125 复核后移除**：曾按 SOP 备注增 `"口交" = [ 口处女 -125 ]`；对照 erArk `instuct_judege.py` 确认口交只有询问文案、无数值修正，已移除该 h-config 条目（严格按源码铁律）。当前口交族与道具/严重骚扰/药物/SM 一样：只有 `judge_base` + 通用判定公式，无额外族修正。

### 较小记录
6. `IN_HUMILIATION_ROOM_OR_DR_ROOM` 在 gag_on/off 以前提形式保留（handler 读 location.tags），功能可用；与“位置前提一律转 condition”的既定风格不一致，本次未改数据，仅记录。
7. `keep-list` / `master-list` 的“已完成（待复核）”已同步为“✅ 已确认（复核补丁）”。

## 复核补丁二（非 95 集剩余指令 + 95 集交叉发现）

> 同一套 CSV/Python 级核验扩展到 B1-B4 其他已复刻指令（daily/obscenity/sex.toml 等 54 条非 95 集），
> 并交叉发现 95 集一处死属性。已修复：

1. **11 条指令补 judge_base**（obscenity.toml）：embrace / hand_in_hand / lap_pillow / touch_head /
   touch_breast / touch_buttocks（初级骚扰 200）、raise_skirt / touch_anus / touch_clitoris /
   touch_vagina（严重骚扰 600）、kiss（亲吻 250 + judge_class="亲吻"）。
2. **stroke 移除多余 settle_trust**：erArk 链不含 22 ADD_SMALL_TRUST；同步更新测试。
3. **external_womb_massage 习得改 target=self**：erArk 81 ADD_SMALL_LEARN 加给自己；测试改用 getEntityAttr 断言。
4. **95 集 `尊重` → `恭顺` 死属性**：`尊重` 不在 attributes.toml，凭空写 base['尊重'] 永远不被引擎读取；
   sex-insert-v/a/cervix/womb + sex-wait-upon 共 21 处状态值改为 `恭顺`，insert-a/b/c 测试同步。
5. 交叉确认：make_masturebate 的 `settle_state 皮肤` 是 FEEL 正确直译；恐怖 baseValue 已全 10。
6. **pull_out_penis 补 `TARGET_IS_H`**（erArk h_mode=2 自动注入前提缺失，之前可能脱离 H 场景显示）；并补 `erark_h_mode_show_type/tired_type` 元数据。

## 变更

- `completed-instructions.md`：95 行 🟡 已实现（待复核）→ ✅ 已确认；B4-B7 看板 ✅ 128 / 🟡 0 / 📝 14。
- `filter-quick-reference.md`：B4-B7 insert/wait_upon/item/sm 行“已完成（待复核）”→“已完成”，统计同步。