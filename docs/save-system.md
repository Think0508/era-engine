# 存档系统使用手册

> 对齐 erArk `save_handle.py` + `see_save_info_panel.py`（神经连接柜）完整复刻（2026-08-14）。
> 涉及文件：`src/core/save-system.ts`、`src/core/ui-text.ts`、`src/ui/components/SavePanel.vue`、`src/ui/components/ConfirmDialog.vue`。

## 概念

- **槽位模型**：`0..maxSave-1` 数字槽（缺省 100，`era-engine.config.toml [save]` 可配）+ 专用 `auto` 槽（自动存档）+ `99` 槽（崩溃存档）。
- **双表分离**：IndexedDB（Dexie）两张表——`save_heads`（头部：版本/游戏时间/角色名/存档时间，列表只读）与 `save_data`（全量 SaveData，读档才读）。对齐 erArk 每槽"头部文件 0 + 数据文件 1"。
- **存档权威模型**：读档时角色从存档完整恢复，模板不覆盖存档数据；缺字段按 `attributes.toml` default 补齐 + warning。
- **存档内容**：全量角色实体（含运行时字段 current_location/ai_behavior/status_effects 等）+ `gameState`（completedScenes + 插件注册的 gameState provider 段）+ `uiState`（foldStates，由 UI 层在读档路径恢复）。
- **存档界面记忆**：`lastSavePage`/`lastSaveId`（" (新!)"标记）存 localStorage `era-engine:save-memory:{modId}`（对齐 erArk save/save_info.json）。

## 配置（era-engine.config.toml）

```toml
active_mod = "武侠"

[save]            # 可选——缺省 100/10
max_save = 100
save_page = 10
```

## 存档数据格式（SaveData）

```typescript
interface SaveData {
  modId: string
  modVersion: string
  gameTime: { minute, hour, day, month, year }
  characters: EntityData[]        // 全量角色（含运行时状态）
  gameState: {
    completedScenes: string[]
    [providerId: string]: any     // 插件注册的 gameState provider 段
  }
  uiState: { foldStates: Record<string, boolean> }
}
```

## 触发时机

| 时机 | 行为 |
|------|------|
| 游戏内 SAVE/LOAD 指令 | 打开存档面板（读写合一，erArk 神经连接柜） |
| 睡醒（sleep-system） | `game:autosave_requested` → autoSave → `auto` 槽 |
| 退出到标题 / 标题"退出" | autoSave → 回标题 / 尝试关页 |
| 页面隐藏（pagehide） | 尽力 autoSave（原子写，失败静默） |
| 全局错误/未处理 Promise 拒绝 | 状态存入 `99` 槽 + 红警告 |

**不可存档模式**：插件 `registerNoSaveMode('h_scene')`（h-core）——H 中存档抛错；autoSave 静默跳过。

## 存档面板交互（SavePanel）

- auto 槽置顶：存在时可点（读/写模式均可）→ 读取/删除（**永不可覆盖**，对齐 erArk auto 槽 write_save 恒 0）；空则纯文本
- 槽位行：`No.{id} {版本} 游戏时间:{年}年{季节|月}月{日}日{时}点{分}分 存档时间:{YYYY-MM-DD HH:MM} {角色名}{后缀} (新!)`
  - 季节：3/6/9/12 月 → 春/夏/秋/冬（其余显示数字月）
  - 角色名后缀与面板标题等文案经 `[ui_text]` mod 可配（见下）
- 空数字槽点击 → 直接存档（无确认，erArk 语义）
- 已存在槽 → 操作菜单：读取/覆盖（写模式、auto 槽无）/删除/导出（auto 槽无）/返回——读取/覆盖/删除均二次确认
- 分页 + 页码记忆（重开面板恢复上次页码）
- 导入：选择 JSON 文件 → 校验 modId 匹配当前模组 → 分配空数字槽（避开 99）；导出：下载 `erark-save-{slotId}-{日期}.json`

**读模式（writeSave=false）**：标题画面"继续冒险"使用——无覆盖、空数字槽不可点；auto 槽存在时仍可点（读取/删除）。

## 世界观文案（meta.toml `[ui_text]`）

引擎提供通用中文默认值，mod 按 key 覆盖（示例来自 test-mod）：

```toml
[ui_text]
"save.panel_title" = "神经连接柜"      # 默认 "存档"
"save.label.character" = "博士"        # 默认 ""（空后缀）
```

全部 key 表（缺省值见 `src/core/ui-text.ts` `DEFAULT_UI_TEXTS`）：
`save.panel_title / save.empty_slot / save.action.load|overwrite|delete|back / save.confirm.load|overwrite|delete / save.label.game_time|save_time|character|is_new|auto / save.page_prev|page_next / save.import|export / title.new_game|continue|settings|switch_mod|exit`

## 迁移（读档时执行）

- **结构差异补齐**：读档缺属性 → `fillMissingAttributes` 按 attributes default 补齐 + warning（读档后输出汇总行"补齐 N 个缺失字段"）
- **声明式迁移链**：`mods/{mod}/migrations/*.toml` 平铺 steps 按序执行（rename/default），幂等、无版本门控（对齐 erArk 结构补丁语义，audit-f 已废弃版本比较）。`transform` 依赖沙箱（phase-12.1），当前 warning + 跳过
- 迁移在内存中执行，下次存盘写入新格式；读档时输出"存档迁移：…"汇总行

## 与插件系统的交互

- **gameState provider**：插件 `registerGameStateProvider({ id, serialize, restore })`（core 导出）——序列化段随存档，读档按 id 分发（单段失败隔离）。已注册：random-event-system（`random-event`）、quest-system（`quest-system`，进行中任务进度）、h-time-stop（`h-time-stop`，时停开关+冻结时刻）
- **`game:load` 标准事件**：restoreFromSave 完成后广播——插件清理/重建瞬态（随机事件挂起选项、combat currentCombat、dialogue currentConversation、h-* 瞬态、set-system 套装账本重建、h-time-stop 一致性校验）
- **no-save 模式注册**：`registerNoSaveMode(mode)`——插件 onEnable 中调用

## 核心 API

| 函数 | 说明 |
|------|------|
| `saveGame(slotId, uiState, label?)` | 保存（no-save 模式抛错） |
| `autoSave(uiState, label?)` | 自动存 `auto` 槽（no-save 模式静默跳过，无节流） |
| `loadGame(slotId)` | 读数据表 → SaveData \| null |
| `loadAndRestoreSave(slotId)` | 完整读档流程（读档 → 迁移 → restore），返回 SaveData（UI 读档路径统一入口） |
| `restoreFromSave(data)` | 恢复实体/时间/地点/玩家/完成场景/providers + 广播 `game:load` |
| `getSaveSlots(modId?)` / `getSaveHead(slotId)` | 头部查询（列表只读） |
| `deleteSave(slotId)` | 删除 |
| `exportSave(slotId)` / `importSave(json)` | 导出 JSON / 导入分配空槽 |
| `getSaveMemory/setSaveMemory` | 界面记忆 |
| `registerGameStateProvider` / `registerNoSaveMode` | 插件扩展点 |
| `getUIText(key)` | 文案查询（engine API `uiText.get`） |

## 测试

`src/core/save-system.test.ts`（fake-indexeddb 提供 Dexie 环境）：双表读写、auto/99 槽、分页配置、save-memory、导入校验与空槽分配、去节流、迁移 summary、provider 分发。`src/core/ui-text.test.ts`：默认文案与 mod 覆盖。
