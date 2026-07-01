# Phase H 实现指引

> 给实施模型的简明步骤。每个 Task 一个文件，按顺序执行。
> 原则：架构清晰、易维护、mod 可扩展。

## Task 顺序

1. `task-h1-h-core.md` — h-core 插件（前提/结算/绝顶/h_state/指令加载）
2. `task-h2-ejaculation.md` — 射精插件
3. `task-h3-pregnancy.md` — 妊娠插件
4. `task-h4-first-time.md` — 第一次系统
5. `task-h5-exposure.md` — 露出系统
6. `task-h6-mark.md` — 刻印系统
7. `task-h7-integration.md` — 集成测试 + 文档

## 通用规则

- 每个插件走相同模式：`plugin.toml` + `index.ts` + `onLoad`/`onEnable`
- onLoad 注册 effect types → EffectTypeRegistry
- onEnable 注册 API + 注册指令 + 监听事件
- 不重复造公式，调 h-core API
- 测试：`npm run typecheck && npm run test`
- 注释：关键交接位置写简洁注释，TODO 标 phase
