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

## 已识别的已知偏差/备注（不影响“已确认”）

1. **bondage（6503）**：erArk 原为 BONDAGE 面板选择 15 种紧缚；当前实现默认 `bondageId=1（双手缚）`，面板 UI 未做，留 `TODO(panel)`。
2. **wait_upon 侍奉位**：为了表示手/口/胸/足/发/腋/腿/脸/深喉等位置，扩展了 `insert_position` 编码 5-12；`sex_insert` 用 `countable=false`，不进入“插入次数”计数器。
3. **item 卸载前提**：erArk 的 `HAVE_*` 在取下类指令中仍要求身上留有该物品，因此“装上→取下”的连续流程测试使用了 2 个物品（装 1 个、留 1 个）。这是 erArk 原语义，不是实现偏差。
4. **露出邀请 cid**：核对中修正为 erArk 实际 cid **5207**（原文档 5054 错误），且 tired_type=1 前提已修正。
5. **能力提升/背包**：SYSTEM 核对见 `docs/instruction-replication/system-check.md`，与 95 条指令复核无关。

## 变更

- `completed-instructions.md`：95 行 🟡 已实现（待复核）→ ✅ 已确认；B4-B7 看板 ✅ 128 / 🟡 0 / 📝 14。
- `filter-quick-reference.md`：B4-B7 insert/wait_upon/item/sm 行“已完成（待复核）”→“已完成”，统计同步。