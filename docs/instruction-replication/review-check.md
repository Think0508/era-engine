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

## 复核备注（设计/映射说明，不属于复刻偏差）

1. **bondage（6503）**：erArk 原为 BONDAGE 面板选择 15 种紧缚；当前实现默认 `bondageId=1（双手缚）`，面板 UI 未做，留 `TODO(panel)`——这是 UI 缺失，不是数据偏差。
2. **wait_upon 侍奉位**：erArk 本身就用同一个 `insert_position` 表示阴茎位置（发/脸/口/胸/腋/手/腿/足/深喉等）。我们只是沿用了引擎已有的“0-4=性器位”的编号，为其补上 5-12 的映射（表示层不同，语义同 erArk）。`countable=false` 是**有意设计**：按你此前定的计数器口径，“插入次数”只统计性器进入（V/A/W），侍奉接触不计入，避免污染 `male_stats.inserts`；侍奉行动的“部位使用次数”由 `h:part_use`/`count` 统计。
3. **item 消耗模型修正**：复核后发现 erArk 中 **`H_Machine/SM` 装备与玩具都不消耗**（乳头夹/阴蒂夹/震动棒/拉珠/口球/跳蛋/电动按摩棒/绳子等），只有 `Consumables`（润滑液/媚药/避孕套等）和 H_Drug 消耗。已修正：`h-toys.toml` 全部装备类 `consume=false`，`h-drugs.toml` 的跳蛋/电动按摩棒 `consume=false`，`body_item_equip/toy_equip` 只对消耗品扣减、装备仅校验拥有；`body_item_unequip/toy_unequip/endHScene` 统一**不归还**（装备类本就在背包、消耗类已消耗）；`useItem` 传入 `_fromUseItem` 防止 `body_item_equip` 双重扣减。
4. **露出邀请 cid**：核对中修正为 erArk 实际 cid **5207**（原文档 5054 错误），且 tired_type=1 前提已修正。
5. **能力提升/背包**：SYSTEM 核对见 `docs/instruction-replication/system-check.md`，与 95 条指令复核无关。

## 变更

- `completed-instructions.md`：95 行 🟡 已实现（待复核）→ ✅ 已确认；B4-B7 看板 ✅ 128 / 🟡 0 / 📝 14。
- `filter-quick-reference.md`：B4-B7 insert/wait_upon/item/sm 行“已完成（待复核）”→“已完成”，统计同步。