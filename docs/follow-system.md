# 跟随系统（follow-system）使用手册

> 版本：1.0.0（2026-08-10 建立）｜复刻蓝本：erArk `sp_flag.is_follow`（game_type.py:768）
> API 速查见 `docs/plugin-author-guide.md` 的 `follow` 命名空间

---

## 一、概念

跟随系统（同行）复刻 erArk 的 is_follow 语义：NPC 跟随玩家同行。核心场景 = 邀请同行 / 结束同行
（指令 1019/1020，见 `docs/instruction-replication/batch-01-daily.md`，指令数据在复刻批次落地）。

**模式语义**（int，与 erArk 一致）：

| 值 | 含义 | 行为 |
|----|------|------|
| 0 | 不跟随 | 默认态 |
| 1 | 智能跟随 | 玩家移动时，**同位置**的跟随者瞬移同步（同时到达，零耗时）；普通 AI 不接管（等价 erArk 取消工作/娱乐） |
| 2 | 强制跟随 | 每游戏小时强制移动到玩家当前位置（从任何位置） |
| 3 | 前往博士办公室 | **已移除**（方舟世界观专属）；setMode(3) 报错 |
| 4 | 召唤（前往玩家当前位置） | **TODO**：setMode(4) 存储 + warning，AI 未实现；前提 `IS_FOLLOW_4` 已注册作提醒位 |

**核心规则**：
- 跟随是**每个 NPC 独立状态**，无人数上限（erArk `follow_count` 是死字段，不实现）
- 与玩家同位置的跟随者才会随玩家移动（erArk `judge_same_position_npc_follow` 忠实行为）——分开了的跟随者不会自己过来，需要玩家回去找他（或未来用模式 4 召唤）
- 跟随者到达新地点**不打招呼**（口上抑制）；未实装的送别/移动口上场景建立后同样需排除跟随者
- **死亡/时停/离线角色不跟随**（不瞬移、不疲劳解除、不强制移动）
- 跟随者**照常参与**实时结算（疲劳/饥饿/尿意随玩家行动增长）与每日结算——体力不随玩家休息自动恢复
  （rest/sleep 的恢复效果 target=selected），长期同行需玩家照顾（休息时选中她/给药）——否则体力打空自动解除

## 二、数据格式

### 2.1 运行时状态（随实体存档自动持久化）

```json
{
  "sp_flag": { "is_follow": 1 },
  "following": true,
  "follow_mode": 1
}
```

- `sp_flag.is_follow`：**erArk 规范字段**（int 0-4）——h-hidden 等系统按 erArk 语义读写
- `following` / `follow_mode`：**条件镜像字段**（实体顶层）——条件引擎只解析直接键，走不到 sp_flag 嵌套；
  由 follow-system 在唯一写入点 `setFollowMode` 同步维护。**禁止外部直接写这两个字段**
- mod 作者**不要**在角色 TOML 里写这些字段（sp_flag 属 L2 非平凡字段，会有提示）

### 2.2 可选绑定（plugin.toml `[optional_attributes]`）

```toml
[optional_attributes]
hp = { type = "number", description = "疲劳解除判定用体力（≤1 时自动解除跟随）" }
```

mod 在 `bindings.toml` 绑定后疲劳自动解除生效；**未绑定 → warning + 跳过**（不阻塞加载）：

```toml
[bindings.follow-system]
hp = "体力"
```

> ⚠️ follow-system 只读**自己的**绑定映射（`bindingResolver.getForPlugin`）——跨插件同名键
> （如 combat-base 也绑 `hp`）不会互相干扰。前提 `NO_TARGET_OR_TARGET_CAN_COOPERATE` 的 hp 门
> 同样优先读本绑定，未绑定时回退 erArk 的 体力（h-core 默认层提供，default=100）。

## 三、API

```typescript
ctx.api.call('follow', 'isFollowing', charId)      // → boolean
ctx.api.call('follow', 'getMode', charId)          // → number 0-4
ctx.api.call('follow', 'setMode', charId, mode)    // → boolean（0/1/2/4）
ctx.api.call('follow', 'invite', charId)           // → boolean（= setMode(1)）
ctx.api.call('follow', 'end', charId, reason?)     // → boolean（reason: instruction/fatigue/offline）
ctx.api.call('follow', 'getFollowers')             // → string[]
ctx.api.call('follow', 'isControlled', charId)     // → boolean（仅模式 1/2 被接管——mode 4 TODO 不冻结 NPC）
```

- `setMode(3)` → 报错（已移除）；`setMode(4)` → 存储 + warning（召唤 TODO）
- 事件规则：0→非0 发 `follow:started {character, mode}`；非0→0 发 `follow:ended {character, reason}`；
  1↔2↔4 之间切换只发 `character:changed`

## 四、自动解除途径

| 途径 | 触发 | reason |
|------|------|--------|
| 指令 end_follow | 玩家主动（复刻批次） | `instruction` |
| 疲劳 | `game:hour_changed` 轮询，绑定 hp ≤1 | `fatigue`（输出"太累了"提示 + `follow_tired` 口上场景，mod 可写反应式口上） |
| 角色离线 | `character:offline` 事件 | `offline` |
| 隐奸开始 | h-hidden 调 follow API（`end(charId, 'hidden_sex')`） | `hidden_sex` |

- 困倦度（erArk 困倦≥2）依赖睡眠系统——TODO（睡眠系统落地后接入）
- 时停冻结：`unconscious_h ≥ 1` 的角色跳过跟随 AI（不瞬移/不疲劳/不强制），含玩家被冻结时

## 五、口上抑制

dialogue-system 提供通用钩子 `registerSceneCharFilter(scene, (charId) => boolean)`（返回注销函数）。
follow-system 注册 `greet` 过滤器：**跟随者到达不打招呼**（erArk talk.py:56 `NOT_FOLLOW`）。
过滤器命中 = 整段跳过（口上 + talk-common 兜底），quest 场景级触发不受影响。

## 六、条件字段与前提

**条件字段**（`condition_fields` 注册，手册自动生成）：
- `character.{id}.following` → boolean
- `character.{id}.follow_mode` → number 0-4

**前提**（供指令 premises / 口上 condition `premises:` 用）：
- `TARGET_IS_FOLLOW` / `TARGET_NOT_FOLLOW`（查 selected 目标）
- `IS_FOLLOW` / `NOT_FOLLOW`（查自己=发起者）
- `IS_FOLLOW_4`（召唤判定，模式 4 专用——TODO 提醒位）
- `NO_TARGET_OR_TARGET_CAN_COOPERATE`：无目标 OR 目标可协同。协同 = 身体状态检查（erArk
  handle_premise/__init__.py:811 忠实复刻）：目标 体力>1 且 疲劳≤134 且 未睡眠 且 状态2/6/7 正常
  （状态2/7 未实装恒正常 TODO；状态6 用 `unconscious_h===3` 同步代理；离线角色不可协同）

## 七、与其他系统的交互

| 系统 | 交互方式 |
|------|---------|
| character-system | 离线生命周期（`setOffline/setOnline` + `character:offline/online` 事件）——follow 监听离线解除跟随；follow 通过 `isControlled` 让普通 AI 跳过跟随者（可选依赖，未启用降级 false） |
| dialogue-system | `registerSceneCharFilter` greet 抑制 + `triggerScene('follow_tired', ...)` 疲劳提示 |
| h-hidden | 隐奸开始调 follow API 解除跟随（曾直写 sp_flag，已重构） |
| h-time-stop | 时停（unconscious_h=3）冻结跟随 AI（直接读 sp_flag，先例同 h-core） |
| map-system | 移动消费 `location:enter` payload 的 `from` 字段（2026-08-10 新增） |
| quest/口上 | 通过条件字段/事件集成：`follow:started/ended` 可驱动任务或口上 |

**事件**（自定义域，带插件前缀）：`follow:started` / `follow:ended`，payload 见 §三。

## 八、TODO 清单

- [ ] 模式 4（召唤）：角色移动至玩家当前位置的 AI（`IS_FOLLOW_4` 前提已注册）
- [ ] 困倦度疲劳解除（睡眠系统落地后，erArk 困倦≥2）
- [ ] 指令 follow/end_follow 复刻（native-instructions 插件，见 batch-01-daily.md）
- [ ] 送别/移动口上场景建立后注册对应过滤器（机制已通用化）
- [ ] follow_wait_time / 私密场所阻挡（我们引擎无此概念，未来如有需要再对齐）
- [ ] 结伴倾向 follow_bias（阶段14，NPC 因关系自主跟随——走 follow API，独立功能）

## 九、文件索引

- 插件：`src/plugins/follow-system/`（index.ts + premise/follow.ts + plugin.toml）
- 测试：`src/plugins/follow-system.test.ts`（全插件加载集成）、`src/plugins/character-system/character-system.test.ts`（离线生命周期）
- 指令家：`src/plugins/native-instructions/`（系统级原生指令唯一数据家，本次仅骨架）
- 相关：`docs/plugin-author-guide.md`（follow/dialogue/character API 速查）、`docs/character-schema.md`（sp_flag 字段）
