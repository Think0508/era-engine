# Phase 11-15: MVP 到发布 — 详细实施计划

> 状态：**待实施**
> 前置：Phase 1-H 完成（16 core + 17 插件 + UI + 217 测试）
> 目标：补齐 MVP 缺失功能 → 可发布

---

## MVP 缺失项清单

| # | 功能 | Phase | 说明 |
|---|------|-------|------|
| 1 | @命令调试工具 | 11 | GM 指令入口 |
| 2 | 存档系统 | 11 | Dexie.js + IndexedDB |
| 3 | 沙箱脚本 | 12 | new Function + 超时保护 |
| 4 | 角色创建流程 | 13 | mod 定义的创建步骤 |
| 5 | 移动端 PWA | 14 | 响应式 + 离线 |
| 6 | 插件化闭环验证 | 12 | 示例模组跑通完整循环 |
| 7 | 存档迁移 | 11 | 版本兼容迁移链 |

LLM 口上、更多 H 子系统等**非 MVP 项**押后到旧 TODO 文档。

---

## Task 拆分

### Task 11.1：@命令调试工具

**目标**：`@` 前缀命令输出到叙事日志。

**Files:**
- Create: `src/ui/components/DebugConsole.vue`
- Modify: `src/ui/native-commands.ts`（加 @ 命令）
- Modify: `src/core/command-registry.ts`（加 @ 前缀过滤）

**指令列表：**
- `@attrs` — 显示选中角色属性
- `@setattr 属性名 值` — 修改属性
- `@teleport 地点ID` — 移动
- `@spawn 模板ID 地点ID` — 生成角色
- `@startquest 任务ID` — 开始任务
- `@additem 物品ID 数量` — 加物品
- `@errors` — 查看错误
- `@help` — 帮助

**实现要点：**
- @ 命令作为 main_menu 指令注册，modes=["exploration","daily_menu"]
- 仅在 cheat 选项可见时显示（ui-store.commandPopoverMode 控制）
- handler 调对应插件 API
- `// TODO: 完整 @ 指令集后续扩展`

### Task 11.2：存档系统

**目标**：Dexie.js + IndexedDB，多命名空间隔离，手动+自动存档。

**Files:**
- Create: `src/core/save-system.ts`
- Create: `src/core/save-system.test.ts`
- Modify: `src/main.ts`（接入存档）
- Modify: `src/ui/views/TitleScreen.vue`（继续游戏→存档列表）
- Modify: `src/ui/components/SystemPanel.vue`（存档管理面板）

**核心机制：**
- Dexie.js 数据库：`era-engine`
- 每个存档 = `saves/{modId}/{slotId}`
- 保存内容：characters + quests + game_state + uiStore.foldStates
- 不保存：locations + definitions（从 TOML 重新加载）
- 自动存档：进入新地点/战斗前/状态变更后——仅 IDLE
- 读档：存档权威模型（角色从存档恢复，模板不覆盖）
- 存档迁移：按版本号顺序执行迁移脚本（mod 的 migrations/）

**API：**
```typescript
ctx.api.register('engine', {
  saveGame: (slot: string) => Promise<void>,
  loadGame: (slot: string) => Promise<void>,
  getSaveSlots: () => Promise<SaveSlot[]>,
  deleteSave: (slot: string) => Promise<void>,
  exportSave: (slot: string) => string,  // JSON 导出
  importSave: (json: string) => Promise<void>,
})
```

### Task 11.3：存档迁移

**目标**：mod 版本变更时存档数据自动迁移。

**Files:**
- Modify: `src/core/save-system.ts`（迁移逻辑）
- Create: `mods/test-mod/migrations/1.0_to_2.0.toml`（测试用迁移）

**机制：**
- 存档存 mod 版本号
- 读档时比较存档版本与当前 mod 版本
- 按 versions 顺序执行迁移脚本
- 迁移类型：rename（字段改名）/ default（设默认值）/ transform（JS 脚本）
- `// TODO(phase-12): transform 脚本需沙箱执行`

### Task 12.1：沙箱脚本

**目标**：JS 钩子执行环境，5 秒超时保护。

**Files:**
- Create: `src/utils/sandbox.ts`
- Create: `src/utils/sandbox.test.ts`

**机制：**
- `new Function()` + 冻结只读 context
- context 暴露：player/location/time/getEntity/getBinding
- 禁止：DOM/全局对象/文件系统/import
- 超时：acorn AST 插入时间检查语句到循环体
- 脚本报错仅影响自身，不崩全局
- `// TODO(phase-15): 用 acorn 做更完整的 AST 静态分析`

### Task 12.2：插件化闭环验证

**目标**：test-mod 跑通完整循环。

**Files:**
- Modify: `mods/test-mod/`（补全角色/地点/任务/战斗数据）
- Create: `src/plugins/phase-12-integration.test.ts`

**验证流程：**
- 移动→对话→接任务→战斗→交任务→获得奖励
- 3 级角色模板（base-human→test-hero→player）
- ≥3 可交互角色、≥5 地点、基础物品、≥1 主线任务
- 换模组测试（最小 2 角色+1 地点的 mod）
- 插件禁用/启用隔离测试

### Task 13.1：角色创建流程

**目标**：mod 定义的创建步骤，新游戏时执行。

**Files:**
- Create: `src/ui/views/CharacterCreation.vue`
- Modify: `src/main.ts`（新游戏→角色创建→每日菜单）
- Modify: `mods/test-mod/meta.toml`（加 creation_config）

**创建步骤类型：**
- `dialogue` — 对话（委托 dialogue-system）
- `choose` — 选择（选项→设置角色字段）
- `input` — 输入（玩家名字等）
- `image` — 显示图片
- 插件可注册自定义步骤类型

**meta.toml 配置：**
```toml
[creation]
steps = [
  { type = "input", field = "name", prompt = "你叫什么名字？" },
  { type = "choose", field = "背景", choices = ["平民", "贵族", "江湖人"] },
  { type = "image", src = "assets/creation_bg.png" },
]
```

### Task 13.2：迁移完善 + 存档 UI

**目标**：TitleScreen 的"继续冒险"功能、存档管理面板、迁移实际测试。

**Files:**
- Modify: `src/ui/views/TitleScreen.vue`（继续→存档列表→读档）
- Modify: `src/ui/components/SystemPanel.vue`（存档标签页）
- Create: `src/ui/components/SaveSlotList.vue`

### Task 14.1：移动端 PWA

**目标**：可添加到桌面、离线运行。

**Files:**
- Create: `public/manifest.json`
- Create: `public/icons/`（启动图标）
- Modify: `index.html`（PWA meta 标签）
- Create: `src/sw.ts`（Service Worker）
- Modify: `vite.config.ts`（PWA 插件）

**要点：**
- Vite PWA 插件或手动 Service Worker
- 缓存策略：TOML/JS/CSS 优先缓存，图片按需缓存
- 离线运行核心功能（无网络也能玩）
- 刘海屏安全区适配
- `viewport` 不缩放

### Task 15.1：最终集成测试 + 发布

**目标**：全量集成测试 + typecheck + dev 目视。

**Files:**
- Create: `src/phase-final-integration.test.ts`
- Update: 所有文档

**验证清单：**
- 完整游戏流程：标题→新游戏→角色创建→每日菜单→探索→对话→战斗→任务→H→存档→读档
- 模组切换正常
- 插件禁用/启用隔离
- 移动端布局正确
- PWA 可添加桌面
- 所有 TODO 注释完整
- 文档更新（developer/mod/plugin guide + CONTEXT.md）

---

## 依赖关系

```
11.1 (@命令) ─────────────────────────────────────────────┐
11.2 (存档系统) ─→ 11.3 (迁移) ─→ 13.2 (存档UI) ─────────┤
12.1 (沙箱) ─→ 12.2 (闭环验证) ──────────────────────────┤
13.1 (角色创建) ──────────────────────────────────────────┤
14.1 (PWA) ──────────────────────────────────────────────┤
                                                           └─→ 15.1 (最终集成+发布)
```

**实施顺序：**
1. 11.1 + 11.2（@命令 + 存档系统，可并行）
2. 11.3 + 12.1（迁移 + 沙箱，可并行）
3. 12.2 + 13.1（闭环验证 + 角色创建，可并行）
4. 13.2（存档 UI）
5. 14.1（PWA）
6. 15.1（最终集成 + 发布）

---

## Deferred / 备忘

| # | 项目 | 后续 | 备忘 |
|---|------|------|------|
| 1 | LLM 口上 | 后续 | 流式/上下文/token/降级 |
| 2 | H 子系统（催眠/时停/隐奸/群交/监禁/紧缚/香薰） | 后续 | 编好指引 |
| 3 | 女儿成长→自订角色 | 后续 | h-pregnancy 扩展 |
| 4 | 限时/重复/日常任务 | 后续 | quest-system 扩展 |
| 5 | NPC H AI | 后续 | handle_npc_ai_in_h |
| 6 | 二段行为 | 后续 | 绝顶/射精后连锁 |
| 7 | 宝珠系统 | 后续 | 24 种宝珠睡眠结算 |
| 8 | 口上三层加权随机 | 后续 | 通用/角色/特殊情境 |
| 9 | 纸娃娃地文 | 后续 | 占位符替换 |
| 10 | NPC 队友 AI 优化 | 后续 | 战斗中队友行动 |
| 11 | 天赋/套装钩子式效果 | 后续 | 需沙箱 |
| 12 | 动态体位切换 | 后续 | 15 体位 × 5 部位 |
| 13 | combat-wuxia 公式 mod override 机制 | 后续 | 默认值+override config |
| 14 | 战斗外精确分钟级 tick | 后续 | MVP 用 hour_changed |
| 15 | NPC AI 优化 | 后续 | MVP 简单随机 |
| 16 | 集成测试加载所有插件 | 后续 | TODO 完整端到端 |
| 17 | 深色模式算法反色 fallback 优化 | 后续 | 当前简单反色够用 |
| 18 | 自动化脚本/宏 | 后续 | Command ID 已稳定 |
| 19 | 日志搜索/过滤 | 后续 | Phase 5 只做滚动 |
| 20 | 角色指令栏开关 | 后续 | CommandPopover 已实现 |
| 21 | 大事志内容填充 | 后续 | Phase 5 只做占位 |
| 22 | 选项面板后期加选项、重排版 | 后续 | 当前分类够用 |
| 23 | 复杂历法 | 后续 | Phase 5 用 day%7 |
| 24 | 多图立绘 variants | 后续 | assets.variants 字段预留 |
| 25 | foldStates 存档持久化 | Phase 11 | toSaveData/fromSaveData 已就绪 |
| 26 | 地图层级文档自动生成 | 后续 | 当前手动维护 |
| 27 | onDisable/onUnload 生命周期 | 后续 | deferred from Phase 4 |
| 28 | semver 版本校验 | 后续 | deferred from Phase 4 |
| 29 | required_attributes 继承 | 后续 | deferred from Phase 4 |
| 30 | UI 清理 | 后续 | deferred from Phase 4 |
| 31 | 标准事件契约完整发出 | 后续 | deferred from Phase 4 |
| 32 | getDefaultValue 类型感知默认值 | 后续 | deferred from Phase 4 |

---

## 验收标准

- [ ] @命令调试可用
- [ ] 存档/读档正常
- [ ] 存档迁移链正确
- [ ] 沙箱脚本超时保护
- [ ] test-mod 跑通完整循环
- [ ] 角色创建流程
- [ ] PWA 可添加桌面 + 离线运行
- [ ] 移动端布局正确
- [ ] `npm run typecheck` + `npm run test` 全通过
- [ ] 文档全部更新