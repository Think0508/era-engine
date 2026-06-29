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
| 8-10 | TODO | 状态/能力/背包/效果/战斗/任务插件 |
| 11-15 | TODO | 存档/沙箱/LLM口上/角色创建/发布 |

## 核心架构

```
core/     引擎内核——纯通用机制，禁止任何具体玩法
plugins/  通用玩法插件——多套可并存，mod 按需启用
ui/       UI层——Vue3+Tailwind，全走CSS变量
mods/     内容模组——TOML数据，一次只启用一个
```

**铁律**：下层绝不依赖上层。core 不认识任何属性名/字段名/分类名。插件之间禁止直接 import，走事件总线 + 公共 API。

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

## 开发流程

1. 改代码后跑 `npm run typecheck && npm run test`
2. 每阶段完成后对照 `开发检查清单.md` 自审
3. 代码中 TODO 用 `// TODO(phase-x):` 标记
4. 关键交接位置写简洁注释
5. 不加无关注释（AGENTS.md 规则），但 TODO 和交接注释允许破例

## 下一步（Phase 8-10）

按 `docs/superpowers/plans/2026-06-27-era-engine-full-implementation.md` 的概要：
- **status-system**：状态效果（apply_status/remove_status effect，tick，stack叠加）
- **ability-progression**：能力升级（gain_ability_xp effect，xp_curve，unlocks）
- **inventory-system**：背包物品（add_item/remove_item effect）
- **effect-system**：统一效果执行器（10个核心effect类型 + 插件注册扩展）
- **combat-base + combat-wuxia**：回合制战斗（标准事件契约，extends继承）
- **quest-system**：任务剧情（7种step类型，objective事件驱动）

每个插件遵循同样模式：plugin.toml + index.ts(onLoad/onEnable) + 注册API + 注册指令 + 监听事件。
