# Skill: era-engine-erark-replication

> 精确复刻 erArk 的机制、公式、数值到 era-engine。
> 禁止简化、禁止猜测数值、禁止"差不多就行"。

---

## 核心原则

1. **每个数值必须有 erArk 源码可追溯**——不猜测、不取中间值
2. **每个效果 ID 必须逐条映射**——不合并、不省略
3. **架构清晰、易维护、可扩展**——不因"精确"而写出意大利面条代码

## 复刻工作流

### 第 1 步：查 erArk 参考文档

| 要查什么 | 看哪里 |
|---------|--------|
| 指令的效果 ID 列表 | `06-指令集-攻略期.md` / `07-指令集-猥亵期.md` / `08-指令集-H内.md` |
| 效果 ID 的含义 | `21-效果ID速查表.md` |
| 公式细节 | `00-公式手册.md` |
| 效果 base_value / 能力 ID | `src/Settle/default.py`（对应效果函数的参数）|
| 数据结构 | `src/Core/game_type.py` |
| 核心流程 | `01-核心H流程.md` |

### 第 2 步：逐条映射效果 ID

```
erArk 效果 ID → 我们的 effect type
21(好感度)    → settle_favorability
22(信赖度)    → settle_trust
11/1515(体力) → settle_state(体力, negate=true, baseValue=30/50)
12/1516(气力) → settle_state(气力, negate=true, baseValue=30/50)
53~81(状态值) → settle_state(状态名, baseValue=见下表)
1101+         → TODO(first kiss等，h-first-time 插件)
CVE_*         → TODO(经验系统)
501~502+      → TODO(未知，查 default.py)
```

### 第 3 步：确定 base_value

从 `default.py` 找到对应效果函数的 `base_value` 参数：

```python
# default.py 中：
base_chara_state_common_settle(charId, add_time, state_id, base_value=30, ability_level=...)
```

| erArk 效果 | state | base_value | 说明 |
|-----------|-------|-----------|------|
| 53(好意) | 好意 | 30 | 行为参数默认 |
| 55(屈服) | 屈服 | 30 | 同上 |
| 58(润滑) | 润滑 | 30 | 同上 |
| 1515/1516 | 体力/气力 | 50 | 快感类扣减 |
| 皮肤/胸部/等 | 对应部位 | 50 | 快感部位 |

### 第 4 步：组装指令 TOML

```toml
[[instructions]]
id = "chat"
label = "聊天"
type = "daily"
time_cost = 10       # 对齐 erArk 的 add_time
premises = ["HAVE_TARGET", "T_NORMAL"]  # 逐个加前提 handler
effects = [
  { type = "settle_favorability" },
  { type = "settle_state", params = { state = "气力", baseValue = 30, negate = true } },  # 效果 12
  { type = "settle_state", params = { state = "好意", baseValue = 30 } },                    # 效果 53
  { type = "settle_state", params = { state = "屈服", baseValue = 30 } },                    # 效果 55
]
# CVE_A2_E|80_G_1, CVE_A1_E|80_G_1, 501 → TODO: 经验系统后补
```

### 第 5 步：校验对照表

```
erArk 效果ID: 21   12   CVE_A2  CVE_A1  53  55  501
              ↓    ↓     ↓       ↓      ↓   ↓   ↓
我们的:       fav  气力   TODO    TODO   好意 屈服 TODO
```

## iron 规则

### 禁止做的事
- ❌ 猜测数值（如"small=10"取中间值）
- ❌ 合并多个效果为一个（如把 53+55 合并成一个 settle_state）
- ❌ 省略效果（如 chat 省略 12 气力消耗）
- ❌ 编造不存在的 base_value

### 必须做的事
- ✅ 每个效果 ID 单独一行
- ✅ 查过 default.py 确认 base_value
- ✅ TODO 标注未实现的效果（含 erArk 效果 ID 和引用文件）
- ✅ 测试：改完后 `npm run typecheck && npm run test`

## 公式映射表

| erArk 函数 | 我们的函数 | 文件 |
|-----------|-----------|------|
| `calculation_favorability()` | `calcFavorability(charId, baseValue)` | `settle/favorability.ts` |
| `get_favorability_level(value)` | `getFavorabilityLevel(value)` | 同上 |
| `get_trust_level(value)` | `getTrustLevel(value)` | 同上 |
| `base_chara_state_common_settle()` | `calcStateChange(base, abilityLevel, abilityTable)` | `settle/state.ts` |
| `calculation_instuct_judege()` | `calcJudge(judgeBase, favorability, trust)` | `settle/judge.ts` |

## 已完成 vs TODO

| 效果范围 | 状态 | 说明 |
|---------|------|------|
| 21(好感度) | ✅ | settle_favorability |
| 22(信赖度) | ✅ | settle_trust |
| 11/12/1515/1516(HP/MP) | ✅ | 映射到体力/气力，negate |
| 51~58(状态值) | ✅ | settle_state |
| 62~81(苦痛/习得) | ✅ | settle_state |
| 1101~1109(第一次) | 📝 TODO | h-first-time 插件 |
| CVE_*(经验) | 📝 TODO | 经验系统 |
| 501~599(H/其他) | 📝 TODO | 查 default.py |
