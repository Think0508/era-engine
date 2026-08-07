# Skill: era-engine-erark-replication

> 精确复刻 erArk 的机制、公式、数值到 era-engine。
> 禁止简化、禁止猜测数值、禁止"差不多就行"。

---

## 核心原则

1. **每个数值必须有 erArk 源码可追溯**——不猜测、不取中间值
2. **每个效果 ID 必须逐条映射**——不合并、不省略
3. **架构清晰、易维护、可扩展**——不因"精确"而写出意大利面条代码
4. **⛔ 禁止私自简化公式**——erArk 的完整公式必须完整实现。如因缺少依赖字段（能力/状态/数据结构）而无法实现完整公式，必须：
   - 在代码注释中用 `// 注释：erArk 完整公式：` 写明完整公式和依赖
   - 在 TODO 中登记缺失依赖
   - **不准**擅自用简化值替代然后不告诉用户
   - 例外：仅当用户明确说"这个公式可以简化"时才可简化

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

## 自评清单（每次复刻后必须逐条回答）

实施后对照以下问题诚实自评，有一项"否"就不能算完成：

1. □ 每个数值/效果 ID 的来源可追溯到 erArk 参考文件（文件名+行号）
2. □ 没有简化/合并/省略 erArk 中的任何效果
3. □ 所有前提 handler 已注册，对齐 erArk 的前提列表
4. □ 实行判定值（judge_base）已设定
5. □ 指令 TOML 中每个 effect 的 baseValue 与 erArk default.py 一致
6. □ 服装/道具等影响的 premise handler 已注册
7. □ `npm run typecheck` + `npm run test` 通过
8. □ 改动记录在 skill 的"已完成 vs TODO"表中

### 服装系统（P1.2）
- ✅ 9 槽位 equipment.toml（头/上身/外套/胸罩/手/内裤/下身/脚/饰品）
- ✅ 角色字段：equipment（穿着）, equipment_off（H 脱下）, equipment_visible（可见性）
- ✅ H 开始自动脱 auto_off 槽位（胸罩/内裤）
- ✅ H 结束自动穿回 equipment_off → equipment
- ✅ 指令 effect：cloth_remove, cloth_wear, cloth_remove_all, cloth_wear_all, cloth_set_visible
- ✅ 服装前提：CLOTH_OFF, NOT_WEAR_BRA, NOT_WEAR_PAN, BRA_VISIBLE, PANTIES_VISIBLE, CLOTH_WEAR
- 📝 TODO：衣柜系统（cloth_locker）、CONF 自动脱衣开关、服装标签(tag)、精液污染追踪

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

### 指令复刻（L1.6）已完成 vs TODO

| 项 | 状态 | 说明 |
|----|------|------|
| 第 0 步粗筛（404 → 228 保留） | ✅ | `docs/instruction-replication/instruction-master-list.md` + keep-list |
| 前置改动（spec §10 全部） | ✅ | loader 收敛 / judge_check 注入 / calcJudge adjustments 表 / IN_* → location.tags / 耗时机制 / UI 分类 / _erark_source 归档 |
| 判定链路（judge_check → settle_* 门控） | ✅ | 共享执行上下文修复 + 端到端测试 |
| 条件引擎（selected/target/别名/校验） | ✅ | condition-registry.validateExpression + fieldAliases + {id} 占位替换 |
| B1 批次（daily 24 条） | 📝 TODO | 批次清单 → 用户筛选 → TOML（下一步） |
| B2-B6（obscenity/sex） | 📝 TODO | sex 延后至 H UI 就绪 |
| 尿道/特殊特征/恋爱依赖项 | ⛔ 不做 | 尿道 19 条 / 特殊特征 8 条砍掉，告白延后 |
