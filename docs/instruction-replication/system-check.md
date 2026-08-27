# SYSTEM 8 项核对表（引擎等价能力）

> 2026-08-26 核对。SYSTEM 指令不按 TOML 复刻，只核对引擎是否已有等价能力。
> 状态：✅ 已有等价 · ⚠️ 部分等价/有缺口 · ❌ 缺失

| cid | id | 名称 | 引擎等价能力 | 证据 | 状态 |
|-----|-----|------|--------------|------|------|
| 1 | move | 移动 | map-system `move` 指令（地图模式 + 文本移动） | `src/plugins/map-system/index.ts:277-308` | ✅ |
| 2 | see_attr | 查看属性 | UI 属性面板：`open_player_panel` / `open_selected_panel` + CharacterPanel | `src/ui/native-commands.ts:12-40`、`src/ui/components/CharacterPanel.vue` | ✅ |
| 3 | item | 道具 | inventory-system add/remove/useItem API + **“背包”指令/UI 面板**（2026-08-26 补） | `src/plugins/inventory-system/index.ts:20-66`、`src/ui/components/BackpackPanel.vue`、`src/ui/native-commands.ts`（id=`item` label=背包） | ✅ |
| 5 | target_to_self | 对自己交互 | 无“对自己交互”入口（UI 选址只支持 NPC，玩家自身动作靠 self target） | 全仓库无 `target_to_self` 实现 | ❌ |
| 8 | save | 读写存档 | native `save`/`load` 命令 + SavePanel + save-system（含自动存档） | `src/ui/native-commands.ts:69-95`、`src/core/save-system.ts` | ✅ |
| 9 | abl_up | 提升能力 | ability-progression `checkUpgrade` 自动结算（睡眠/H 结束）；**手动能力提升面板未实现** | `src/plugins/ability-progression/index.ts:31-66` | ⚠️ 缺手动面板 |
| 10 | owner_abl_up | 提升自身能力 | 同上（玩家 N/PC 都走同一自动 checkUpgrade） | 同上 | ⚠️ 缺手动面板 |
| 11 | system_setting | 系统设置 | native `options` 命令 + OptionsPanel | `src/ui/native-commands.ts:133-143`、`src/ui/components/OptionsPanel.vue` | ✅ |

## 结论

- **5 条已有等价**：move / see_attr / item（背包指令已补）/ save / system_setting。
- **1 条用户决策不做**：target_to_self（2026-08-26 用户：先不做“对自己交互”入口）。
- **2 条部分等价**：
  - `abl_up` / `owner_abl_up`：后端 `checkUpgrade` 已包含宝珠需求判定与扣减，但没有“单能力手动提升”的公开 API；手动提升面板（UI）未实现。

## 能力提升后端与未来资源消耗（架构注记）

- 当前 `ability-progression.checkUpgrade` 已实现：遍历 `mode=condition` 能力 → 按每级 `upgrades.needs` 判定 → 满足则 **扣宝珠（juel）并升级**。这是“宝珠→提升”的后端，但没有面向 UI 的单能力手动入口；将来做手动面板时需把 `checkUpgrade` 的循环体抽成 `tryUpgradeAbility(charId, abilityId)` 公共 API（后端已具备判定/扣减素材，小重构即可）。
- 未来“消耗某经验/金钱/物品等资源提升秘籍层数”：`evaluateUpgradeNeeds` 已支持 `juel / experience / ability / ability_sum` 多种 `needs.type`，扩展新资源类型时：
  1. `core/upgrade-needs.ts` 增加求值分支（如 `item` / `currency`）；
  2. `checkUpgrade`/`tryUpgradeAbility` 增加对应扣减逻辑；
  3. 结构上不需要改能力定义格式（`needs` 数组天然可容纳新类型）。
  本次不实现，仅确认架构可扩展。