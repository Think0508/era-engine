# H 核心系统（h-core）

## 做什么

H 系统的总控。提供前提注册（Premise）——指令可见性的判定单元；结算公式（好感度/信赖/判断/状态/绝顶）；H 场景的进入和退出管理。所有 H 子系统（射精/妊娠/刻印等）注册自己的前提至此系统。

## 关键概念

- **前提注册**：每个 H 指令通过前提组合控制可见性。前提 handler 签名 `(evalCtx) => boolean | number`。子系统可在自己的 onEnable 中注册新前提。
- **结算公式**：`calcJudge(judgeBase, favorability, trust) → JudgeResult`，综合好感度、信赖、当前状态、绝顶值判定成功/失败程度
- **H 状态（h_state）**：角色运行时字段，含 h_mode、体位（position）、绝顶值、体势（posture），由 h-core 统一管理

## Mod 作者使用

用前提（Premise）控制 H 指令的条件，用效果（effect）触发 H 场景。自定义前提通过 `registerPremise` 注册。

## API（见 `docs/plugin-author-guide.md`）

```
ctx.api.call('h-core', 'evaluatePremises', premises, evalCtx)     → boolean
ctx.api.call('h-core', 'startHScene', ...)                        → void
ctx.api.call('h-core', 'endHScene', ...)                          → void
ctx.api.call('h-core', 'getLevel')                                → number（见 entity-utils.ts）
ctx.api.call('h-core', 'calcFavorability', charId, baseValue)     → number
ctx.api.call('h-core', 'calcTrust', durationMinutes, favorability) → number
ctx.api.call('h-core', 'calcJudge', judgeBase, fav, trust)        → JudgeResult
ctx.api.call('h-core', 'getFavorabilityLevel', charId)            → number
ctx.api.call('h-core', 'getTrustLevel', charId)                   → number
ctx.api.call('h-core', 'registerPremise', id, handler)            → void
```

## Override 规则

前提 handler 运行时后注册覆盖前注册（`docs/mod-override.md` §运行时 override）。子系统覆盖基础前提、mod 专属插件覆盖子系统前提。
