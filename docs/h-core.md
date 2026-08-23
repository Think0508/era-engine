# H 核心系统（h-core）

## 做什么

H 系统的总控。提供 H 指令的结算公式（判断/好感/信赖/状态值/绝顶判定/体力气力）、H 场景的进入和退出管理、口上聊天结算。所有 H 子系统（射精/妊娠/刻印等）经 h-core 注册的 effect 类型与 API 协作。

前提（Premise）系统已并入条件引擎统一管理（2026-08-13 合并）——前提注册/求值走 `engine.premises.*`（见 `docs/premises.md`），本插件不再暴露 `registerPremise`/`evaluatePremises`。

## 关键概念

- **结算公式**：`calcJudge(judgeBase, favorability, trust, charId?, judgeClass?) → JudgeResult`——综合好感度、信赖、当前状态、绝顶值判定成功/失败程度；`judge_class` 查 hConfig `[judge.adjustments]` 表叠加修正
- **H 状态（h_state）**：角色运行时字段，含 h_mode、体位（position）、绝顶值、体势（posture），由 h-core 统一管理
- **effect 类型**：h-core 在 onLoad 注册全部 H 结算 effect（judge_check / settle_favorability / settle_trust / settle_state / settle_hp_mp / tech_adjust / pain_* / feel_by_sex / pl_p_adjust / h_start_h / h_end_h / h_orgasm_check / orgasm_edge_on/off / cloth_* / body_item_* / vibrator_* / apply_lubricant / apply_aphrodisiac / apply_instant_toy / give_gift / chat_settle / talk_add_adjust / h_experience / release_time_stop_orgasm 等）——注册集中在 `src/plugins/h-core/effects/` 各域模块（2026-08-15 E2 拆分）
- **射精欲读写**：h-core 不直接碰 `base['射精欲']`，读写全部走 h-ejaculation 公共 API（注册于其 `src/plugins/h-ejaculation/index.ts` 的 `getEja / setEja / addEja`，未启用时静默降级）——见 `docs/h-ejaculation.md`

## Mod 作者使用

用前提（`engine.premises`）控制 H 指令的条件，用 effect（如 `h_start_h`/`settle_state`）驱动 H 结算。自定义结算走 mod 专属插件注册新 effect 类型。

## API（见 `docs/plugin-author-guide.md`）

```
ctx.api.call('h-core', 'startHScene', allyId, targetId)             → void
ctx.api.call('h-core', 'endHScene', allyId)                          → void
ctx.api.call('h-core', 'getLevel', value, thresholds?)              → number（getLevel 语义见 entity-utils.ts）
ctx.api.call('h-core', 'calcFavorability', charId, baseValue)       → number（好感结算，读角色状态/素质修正）
ctx.api.call('h-core', 'calcTrust', charId, durationMinutes)        → number（信赖结算，读角色状态/素质修正）
ctx.api.call('h-core', 'calcJudge', judgeBase, fav, trust, charId?, judgeClass?) → JudgeResult
ctx.api.call('h-core', 'getFavorabilityLevel', value)               → { level, judgeAdd }
ctx.api.call('h-core', 'getTrustLevel', value)                      → { level, judgeAdd }
ctx.api.call('h-core', 'settleState', charId, state, baseValue, timeCost, opts?) → 状态值结算（settleOneState 管线）
```

前提注册/求值：`ctx.api.call('engine', 'premises.register/evaluate', ...)`（`docs/premises.md`）。

## Override 规则

effect 类型注册后注册覆盖前注册（`docs/mod-override.md` §运行时 override）。mod 专属插件可覆盖 h-core 的 effect 类型；前提 handler 经 `engine.premises` 后注册覆盖前注册。
