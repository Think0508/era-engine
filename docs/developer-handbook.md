# 开发者交接手册

> 给继续开发引擎的 AI 或人类工程师。简洁，只讲核心。

## 引擎现状

| Phase | 状态 | 内容 |
|-------|------|------|
| 1 | ✅ | 项目初始化（Vite+Vue3+TS+Tailwind+Vitest） |
| 2 | ✅ | 核心数据层（mod-loader/template/entity-system/binding-resolver） |
| 3 | ✅ | 条件+事件（condition-registry/event-bus/game-context） |
| 4 | ✅ | API+插件（api/plugin-manager） |
| 5 | ✅ | UI 框架（布局/主题/stores/组件/指令栏/叙事日志） |
| 6-7 | ✅ | 地图+角色+对话插件（map-system/character-system/dialogue-system） |
| 8-10 | ✅ | 状态/能力/背包/效果/套装/战斗/任务插件 |
| H | ✅ | H 系统（h-core/射精/妊娠/第一次/露出/刻印）|
| 11-15 | ✅ | MVP→发布（@命令/存档/沙箱/角色创建/PWA）|

## 核心架构

```
core/     引擎内核——纯通用机制，禁止任何具体玩法
plugins/  通用玩法插件——多套可并存，mod 按需启用
ui/       UI层——Vue3+Tailwind，全走CSS变量
mods/     内容模组——TOML数据，一次只启用一个
```

**铁律**：
1. 三层绝对分离：core 不认识任何属性名/字段名/分类名
2. 插件之间禁止直接 import——只能走 `ctx.api.call()` 或事件总线
3. 属性名禁止硬编码——走绑定系统或 entity-utils.ts 常量
4. 每个插件必须有完整的 API 文档（`docs/plugin-author-guide.md`）
5. 每个插件系统必须有独立的使用手册（`docs/` 下对应 .md）

详见 AGENTS.md「API 文档铁律」「使用手册铁律」「架构合规铁律」「唯一数据/通信路径铁律」。

## 已实现模块速查

| 模块 | 路径 | 职责 |
|------|------|------|
| mod-loader | core/mod-loader.ts | 加载 mod TOML → 实体注册 |
| template | core/template.ts | 模板深合并（多级继承） |
| entity-system | core/entity-system.ts | 按 type+id 存取实体 |
| binding-resolver | core/binding-resolver.ts | 插件通用名 ↔ mod 属性名映射 |
| event-bus | core/event-bus.ts | async 串行/优先级/通配符/循环检测 |
| game-context | core/game-context.ts | 全局状态（时间/地点/模式栈/执行状态/moveTo） |
| condition | core/condition.ts | 条件表达式解析（6运算符+数组包含） |
| condition-registry | core/condition-registry.ts | 条件字段动态收集+手册生成 |
| api | core/api.ts | 公共API系统（register/call） |
| plugin-manager | core/plugin-manager.ts | 插件发现/生命周期/extends/data_dependencies |
| command-registry | core/command-registry.ts | 指令 single source of truth |
| command-executor | core/command-executor.ts | 指令执行（包裹EXECUTING） |
| narrative-log | core/narrative-log.ts | 叙事日志存储+淘汰 |
| error-reporter | core/error-reporter.ts | 统一错误上报 |
| data-dependencies | core/data-dependencies.ts | 插件数据依赖topo-sort |

## 已实现插件速查

| 插件 | provides | API namespace | 职责 |
|------|----------|---------------|------|
| map-system | map:loaded | map | 移动/地图API/MapView渲染 |
| character-system | characters:initialized | character | 角色位置初始化/AI移动/NPC生成/属性读写 |
| dialogue-system | dialogue:ready | dialogue | 口上演出(triggerScene)/交互对话(startConversation) |
| effect-system | effects:ready | effect-system | 10核心effect类型/execute/target解析/depends_on/错误隔离 |
| status-system | status:ready | status | apply/remove/tick/stack缩放/duration/condition字段 |
| ability-progression | abilities:ready | abilities | gain_xp/升级/unlocks/getByTag/hasTag |
| inventory-system | inventory:ready | inventory | addItem/removeItem/useItem/equip/unequip/item事件 |
| set-system | sets:ready | set | 广义套装检测/动态给予移除/effects注入 |
| combat-base | combat:ready | combat | 回合循环/钩子系统/队友接口/标准事件 |
| combat-wuxia | combat-wuxia:ready | combat-wuxia | extends combat-base/六维公式/阴阳/暴击/闪避 |
| quest-system | quests:ready | quest | 7step类型/objective事件驱动/auto_start |
| h-core | h:ready | h-core | H指令管道/前提系统/15公式/实行判定/h_state/绝顶 |
| h-ejaculation | ejaculation:ready | h-ejaculation | 射精积累/射精量/精液追踪 |
| h-pregnancy | pregnancy:ready | h-pregnancy | 受孕判定/7阶段孕期/泌乳 |
| h-first-time | first-time:ready | h-first-time | 处女/初次标记/剧痛惩罚 |
| h-exposure | exposure:ready | h-exposure | 4级露出/被发现处理 |
| h-mark | mark:ready | h-mark | 7刻印升级/降级/修正查询 |

## 开发流程

1. 改代码后跑 `npm run typecheck && npm run test`
2. 每阶段完成后对照 `开发检查清单.md` 自审
3. 代码中 TODO 用 `// TODO(phase-x):` 标记
4. 关键交接位置写简洁注释
5. 不加无关注释（AGENTS.md 规则），但 TODO 和交接注释允许破例

## 下一步

**当前阶段**：Phase P1（核心 era 体验）+ 架构修复

**TODO 全文**：`docs/master-todo.md`（分层管理：L0 架构层 → L1 系统层 → L2 细节层 → L3 推迟池）

**优先级排序**：
1. **L0 架构修复**（跨插件 import、core 层具体引用、API 文档补全、使用手册补全）——必须先做
2. **L1 系统实现**（渲染层 step3、纸娃娃兜底、选项面板、指令复刻、服装/道具扩展）
3. **L2 细节功能**（@命令、沙箱、创建流程、PWA）
4. **L3 推迟池**（LLM 口上、H 子系统、引擎深化）
