# talk-common-system — 条件文本片断生成插件

## 概述

talk-common-system 是从 erark `talk_common` 系统精确复刻的条件文本片断生成引擎。它管理一组 **变量→条件文本池** 的映射，在运行时根据角色状态和游戏上下文，为每个变量从符合条件的文本池中随机选取一条输出。

该系统有两个核心用途：

1. **身体部位/动作/绝顶描述** —— 如 `{vagina_s}` 生成"温热的阴道"、`{penis}` 生成"粗大火热的肉棒"
2. **口上/地文的兜底文本** —— 当某个行为没有角色专属口上时，用 `{behaviorId}` 生成一段通用描述

## 架构

```
┌─────────────────────────────────────────────────┐
│                dialogue-system                   │
│  interpolateText() → {player.name} 替换          │
│         ↓ import + 先调用                          │
│  replaceCommonTexts() → {vagina_s} 替换          │
└────────────────────┬────────────────────────────┘
                     │ import
┌────────────────────▼────────────────────────────┐
│            talk-common-system                    │
│                                                  │
│  ┌──────────┐   ┌──────────────┐                 │
│  │ 加载器    │ → │ 运行时索引     │ → getText(var)  │
│  │ (TOML)   │   │ (variable→   │   → 条件筛选     │
│  │          │   │  entries)    │   → 随机选     │
│  └──────────┘   └──────┬───────┘                 │
│                        │ import                  │
│                 ┌──────▼───────┐                 │
│                 │ condition-   │                 │
│                 │ engine       │                 │
│                 │ evaluate()   │                 │
│                 └──────────────┘                 │
└─────────────────────────────────────────────────┘
```

### 依赖关系

| 插件 | 依赖类型 | 说明 |
|------|---------|------|
| `h-core` | 编译时 import | premise 判定——评估 `high_1`、`CVP_A2_T\|102_E_1` 等条件 |
| `dialogue-system` | 被依赖 | 在 `interpolateText` 前调用 `replaceCommonTexts` |

### 数据加载链

```
插件自带默认数据
  src/plugins/talk-common-system/data/default/talk-common/
  ├── body/vagina.toml          ← 所有部位的基础描述
  ├── body_part/vagina_s.toml   ← 部位短词（形容词+名词）
  ├── action_A/penis_in_vagina.toml
  └── ...

模组 override（同名文件覆盖）
  mods/武侠/definitions/talk-common/
  ├── body/vagina.toml          ← 覆盖默认
  └── body_part/vagina_s.toml   ← 覆盖默认
```

加载时以默认数据为基础，用模组目录下的同路径文件逐层覆盖（深合并）。模组只写要改的文件，其余继承默认。

## TOML 数据格式

### 单段变量（body/ 类型）

```toml
# definitions/talk-common/body/vagina.toml
variable = "vagina"
description = "阴道——一段完整的描述文本"

[[entries]]
context = "粉嫩紧致湿润温暖，触感细腻敏感的{vagina_s}"
conditions = "premise(high_1)"

[[entries]]
context = "湿滑温热内壁有褶皱，吸附力极强的{vagina_s}"
conditions = "premise(high_1)"
```

字段说明：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `variable` | string | 是 | 变量名（不含花括号），口上里用 `{vagina}` 引用 |
| `description` | string | 否 | 变量说明，用于自动生成条件手册 |
| `[[entries]]` | array | 是 | 所有可选的文本条目 |
| `[[entries]].context` | string | 是 | 输出的文本片断。可嵌套其他 talk_common 变量（如 `{vagina_s}`） |
| `[[entries]].conditions` | string | 否 | 条件表达式。前提用 `premise(X)` 内联引用（见下文） |

运行时从所有 `conditions` 满足的 entries 中随机选一条。

#### conditions 格式

条件 = **完整表达式**（2026-08-13 起前提与表达式引擎合并为单一语法）：

**1. 前提引用**（`premise(X)` 内联——X 为插件注册的前提 ID）：
```toml
conditions = "premise(high_1) && premise(sys_0)"
```
多个前提用 `&&` 连接。前提 ID 大小写不敏感（如 `premise(HIGH_1)` 等价）。

**2. 数据条件表达式**（无需前提注册）：
```toml
conditions = "selected.talents.幼女 == 1"
```
直接使用 `player.*`、`location.*`、`game.time.*`、`selected.*`、`character.{ID}.*` 等路径和标准运算符。

**混合使用**（前提 + 表达式混写）：
```toml
conditions = "premise(high_1) && selected.body_semen.阴道.1 > 0"
```

**前提权重值比较**（erArk get_weight_from_premise_dict 语义）：
```toml
conditions = "premise(FOO) == 2"
```
前提返回值与数值比较（`== >= <= > <` 均可，表达式引擎原生支持）。

**可用路径**：

| 路径 | 例子 | 说明 |
|------|------|------|
| `player.{属性}` | `player.体力 > 0` | 玩家属性 |
| `location.{字段}` | `location.id == 'tavern'` | 当前地点 |
| `game.time.{单位}` | `game.time.hour >= 18` | 游戏时间 |
| `character.{ID}.{属性}` | `character.令狐冲.好感度 >= 60` | 指定角色 |
| `selected.{属性}` | `selected.talents.幼女 == 1` | 当前选中的角色（交互目标） |
| `selected.body_semen.{部位}.{索引}` | `selected.body_semen.阴道.1 > 0` | 目标身上精液量（见 mod-author-guide） |

**前提 ID 引用**：

用 `premise(X)` 内联引用已注册的前提：
```toml
conditions = "premise(HAVE_TARGET) && premise(NOT_H)"
```

前提 ID 由各插件在 `onEnable` 时注册（engine API `premises.register`）。可用前提列表可通过 `@premises` 调试命令查看。旧 `premises:` 前缀语法已移除（2026-08-13 数据全量迁移），禁止使用。

### 多段变量（body_part/ 类型）

body_part 是 A+B 拼接型，形容词 + 名词合成一段：

```toml
# definitions/talk-common/body_part/vagina_s.toml
variable = "vagina_s"
description = "阴道短词——形容词(A)+名词(B)拼接输出"
parts = ["A", "B"]

[[entries]]
part = "A"
context = "温热"
conditions = "premise(high_1)"

[[entries]]
part = "B"
context = "阴道"
conditions = "premise(high_1)"

[[entries]]
part = "A"
context = "幼小"
conditions = "premise(CVP_A2_T|102_E_1)"

[[entries]]
part = "B"
context = "小穴"
conditions = "premise(CVP_A2_T|102_E_1)"
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `parts` | string[] | 是 | 拼接顺序。输出时按此顺序逐个 part 选一条拼接 |
| `[[entries]].part` | string | 是 | 属于哪个 part。值必须是 `parts` 中的一员 |

运行时逻辑：

```
找到 variable=vagina_s 的所有 entries
按 part 分组 → {A: [条目...], B: [条目...]}
对每个 part:
  筛选 conditions 满足的条目
  随机选一条
按 parts 顺序拼接 → "温热的阴道"
```

### 动作变量（action_X/ 类型）

动作描述和单段 body 格式一致，但 conditions 使用体位前提（`dr_position_normal`、`dr_position_back` 等）：

```toml
# definitions/talk-common/action_A/penis_in_vagina.toml
variable = "action_penis_in_vagina_A"
description = "正常位·阴茎插入阴道——A段动作描述"

[[entries]]
context = "{Name}俯身压在{TargetName}身上，{penis}在{vagina}内快速抽插"
conditions = "premise(dr_position_normal)"

[[entries]]
context = "{Name}双手紧握{TargetName}的腰肢，{penis}从后方深深地插入{vagina}"
conditions = "premise(dr_position_back)"
```

## 变量映射表（erark → 本系统）

### talk_common 变量（由本插件处理）

erark CSV 目录 → 本系统 TOML 路径 → 变量名：

| erark 数据 | TOML 路径 | 变量名 | 类型 |
|-----------|-----------|--------|------|
| `body/vagina.csv` | `body/vagina.toml` | `{vagina}` | 单段 |
| `body/penis.csv` | `body/penis.toml` | `{penis}` | 单段 |
| `body/anal.csv` | `body/anal.toml` | `{anal}` | 单段 |
| `body/breast.csv` | `body/breast.toml` | `{breast}` | 单段 |
| `body/mouth.csv` | `body/mouth.toml` | `{mouth}` | 单段 |
| `body_part/vagina_s.csv` | `body_part/vagina_s.toml` | `{vagina_s}` | 多段 A+B |
| `body_part/penis_s.csv` | `body_part/penis_s.toml` | `{penis_s}` | 多段 A+B |
| `body_part/common_s_A.csv` | `body_part/common_s.toml` | 多段 A 共用形容词池 |
| `action_A/penis_in_body/penis_in_vagina_A.csv` | `action_A/penis_in_vagina.toml` | `{action_penis_in_vagina_A}` | 单段 |
| `action_A/orgasm/v_orgasm_small_A.csv` | `action_A/v_orgasm_small.toml` | `{action_v_orgasm_small_A}` | 单段 |

完整对照表见 talk-common-system 默认数据目录（`src/plugins/talk-common-system/data/default/talk-common/`，按 `action_A/`、`body/`、`body_part/` 等子目录组织——无 `_index.toml`，以目录 + `variable` 字段为准）。

### `str.format()` 变量（由 dialogue-system 插值器处理）

这些变量不在 talk_common 中，由 `dialogue-system.interpolateText()` 负责替换：

| erark 变量 | 本系统变量 | 说明 |
|-----------|-----------|------|
| `{Name}` | `{character.name}` | 当前说话/行动者名称 |
| `{PlayerName}` | `{player.name}` | 玩家名称 |
| `{TargetName}` | `{target.name}` | 说话者的交互对象名称 |
| `{PlayerNickName}` | `{player.nickname}` | 角色对玩家的称呼 |
| `{TargetNickNameToPl}` | `{target.nickname}` | 交互对象对玩家的称呼（别名） |
| `{NickNameToPl}` | `{character.nickname}` | 说话者对玩家的称呼（别名） |
| `{NickName}` | `{character.name}` | 映射回本名 |
| `{TargetNickName}` | `{target.name}` | 映射回本名 |
| `{PlayerTargetName}` | `{player.targetName}` | 玩家当前交互对象名称 |
| `{SceneName}` | `{location.name}` | 当前地点名 |
| `{TargetUpClothName}` | `{target.wearUpper}` | 交互对象上身衣物名 |
| `{TargetDownClothName}` | `{target.wearLower}` | 交互对象下身衣物名 |
| `{TargetPanName}` | `{target.wearPanties}` | 交互对象内裤名 |
| `{TargetSkiName}` | `{target.wearSkirt}` | 交互对象裙子名 |
| `{TargetSocName}` | `{target.wearSocks}` | 交互对象袜子名 |
| `{TargetBraName}` | `{target.wearBra}` | 交互对象胸罩名 |
| `{FoodName}` | 上下文 | 当前行为关联的食物名 |
| `{BookName}` | 上下文 | 当前行为关联的书名 |
| `{MakeFoodTime}` | 上下文 | 烹饪时间 |
| `{SceneOneCharaName}` | `{scene.randomCharaName}` | 当前场景随机角色名 |
| `{TargetSceneName}` | `{targetLocation.name}` | 移动目标地点名 |
| `{SrcSceneName}` | `{sourceLocation.name}` | 移动来源地点名 |

## API 参考

### `replaceCommonTexts(text: string, targetId: string): string`

扫描文本中的 `{variableName}` 模式，对 talk_common 注册的变量执行替换。

```typescript
import { replaceCommonTexts } from '../talk-common-system'

// 输入含 talk_common 变量
const raw = "{Name}的{penis}插入{TargetName}的{vagina}"
// 先过 talk_common
const step1 = replaceCommonTexts(raw, targetNpcId)
// → "{Name}的粗大火热的肉棒插入{TargetName}的粉嫩紧致的{vagina_s}"
// 再过 dialogue-system 插值
const step2 = interpolateText(step1, { player, character, target, location, time })
// → "博士的粗大火热的肉棒插入铃兰的粉嫩紧致的{vagina_s}"
```

注意：talk_common 的替换结果中可能仍包含未被替换的嵌套变量（如 `{vagina}` → 结果中还有 `{vagina_s}`），因为这些嵌套变量不是 talk_common 当前遍历到的 key，会在后续的 `interpolateText` 保持原样。如果需要多轮替换，调用方应循环调用 `replaceCommonTexts` 直到文本不再变化。

### `getAvailableVariables(): string[]`

返回当前已加载的所有 talk_common 变量名列表，用于条件手册生成和校验。

## 插值上下文（dialogue-system 传入）

```typescript
interface InterpolationContext {
  player: {
    name: string
    nickname: string        // 角色对玩家的称呼
    targetName: string      // 玩家当前交互对象名
  }
  character: {
    name: string            // 当前说话/行动者
    nickname: string        // 当前角色对玩家的称呼
    wearUpper: string       // 上身衣物名
    wearLower: string       // 下身衣物名
  }
  target: {
    name: string            // 说话者的交互对象
    nickname: string        // 交互对象对玩家的称呼
    wearUpper: string
    wearLower: string
    wearBra: string
    wearPanties: string
    wearSkirt: string
    wearSocks: string
  }
  location: {
    name: string
    randomCharaName: string
  }
  sourceLocation?: {
    name: string
  }
  targetLocation?: {
    name: string
  }
  time: {
    hour: number
    day: number
    month: number
  }
}
```

## 给 Mod 作者的指南

> **行为地文的开关（hConfig `[talk]`）**：行为地文的**混合率替换**（低权重角色口上按概率被
> 行为地文取代）与**空池兜底**由 `talk.common_mix_rate`（默认 30；0 = 只关混合、留兜底）和
> `talk.behavior_text_enabled`（默认 true；false = 混合 + 兜底全关）两个旋钮控制；场景旁白不参与
> 混合替换。完整语义见 `docs/dialogue-format.md` §七 + `docs/adr/0017-talk-behavior-text-dual-role.md`。

### 覆盖默认数据

在模组的 `definitions/talk-common/` 下创建同名同路径 TOML 文件即可覆盖默认值：

> **数据加载与重载（2026-08-15）**：插件 `onEnable` 时加载默认层（168 文件 / 73MB，解析结果
> 缓存——重复启用不重解析）并合并当前 mod 的 `definitions/talk-common/` 覆盖。运行期再次
> `loadMod`（`game:mod_loaded` 事件，本插件监听）会重载当前 mod 的口上数据；dev 下改 mod
> 口上 TOML 后重新 loadMod 即可生效。切换模组仍走页面刷新（ModSelect → reload），无需依赖该机制。

```toml
# mods/武侠/definitions/talk-common/body_part/vagina_s.toml
variable = "vagina_s"
parts = ["A", "B"]

[[entries]]
part = "A"
context = "紧致"
conditions = "premise(high_1)"

# 只写要改的 entries，其余继承默认
# 但注意：整个文件覆盖同 variable 的全部 entries，不是增量
```

### 新增自定义变量

在 `definitions/talk-common/` 下创建新的 TOML 文件，写 `variable` 和 `[[entries]]`，然后在口上 TOML 里用 `{你的变量名}` 引用即可。

### 引用其他 talk_common 变量

`context` 字段中可以嵌套引用其他 talk_common 变量：

```toml
# body/vagina.toml
[[entries]]
context = "粉嫩紧致湿润温暖，触感细腻敏感的{vagina_s}"
```

`{vagina_s}` 在此处会被二级替换。

## 迁移说明

### 从 erark CSV 迁移

转换脚本 `scripts/convert-erark-talk-common.cjs`（待实现）将 `data/talk_common/` 下的 CSV 批量转换为 TOML 格式：

- `body_part/vagina_s_A.csv` + `body_part/vagina_s_B.csv` → `body_part/vagina_s.toml`（合并 A+B）
- `body/vagina.csv` → `body/vagina.toml`
- `action_A/penis_in_body/penis_in_vagina_A.csv` → `action_A/penis_in_vagina.toml`

### 导入 erArk 新增地文模块（2026-08-08 流程确认）

> erArk 侧会持续新增地文模块（如子宫高潮等新 orgasm 类型）。导入流程：

1. **确认新增内容**：从 erArk 更新 `data/talk_common/` 下的新文件（通常是新目录/新动作类型，如
   `action_A/orgasm/v_orgasm_womb_A.csv`——模块化新增，不涉及已迁移文件）
2. **重跑转换脚本（增量）**：`node scripts/convert-erark-talk-common.cjs --incremental`
   - `--incremental` 跳过**已存在**的输出 TOML（保护已迁移/手改文件）——只生成新文件
   - 已知目录（body/body_part/action_X/penis_in_body/orgasm）按既有规则命名
   - 未知目录走 fallback（`variable = 文件路径推导`）——转换后**检查生成的 variable 命名**，
     如需规范命名，在脚本 deriveVariable 加对应分支
   - **注意**：新文件在增量模式下生成后，下次重跑会因"已存在"被跳过——如需修正已生成的新文件，
     删除对应 TOML 再重跑（**只删新文件，勿动已跟踪文件**）
   - erArk 更新已有文件的内容（如 v_orgasm 条目扩展）→ 增量会跳过——如确认要采纳更新，
     git diff 审计后**删除对应已跟踪 TOML 再重跑**（或人工核对后保留）
3. **验证（自动安全网）**：`npm run test` 的 `talk-common-data.test.ts` 全量校验
   - 新增地文引用的前提若未注册 → 测试失败 → 按 T2 模式补齐（可判的注册语义、
     依赖未实装系统的恒 false + TODO）
   - 新 CVP 的 T/S/A ID 若不在映射表 → 保留 premise(CVP_...) → 校验报出 → **补脚本映射表**
     （TALENT_MAP/STATUS_MAP/ABILITY_MAP，查 Talent.csv/CharacterState.csv 确认名字）→ 删新文件重转
   - 新增表达式的字段路径未注册 → 测试失败 → condition-registry 补结构路径
4. **重启 dev server**：新 TOML 加入 glob 后需重启 vite 才被收录
5. **已迁移文件被 erArk 更新**（如 v_orgasm 175→457 条）：git diff 可审计变化
   （条目扩展/变量修正 {Name}→{target.name} 等）——按需决定保留或 git checkout 回滚

### 转义规则

erark CSV 中的 `\` 转义序列转换规则：

| erark 原文 | TOML 输出 | 说明 |
|-----------|-----------|------|
| `\n` | `\n` | 换行符（TOML 原生支持） |
| `\\` | `\\` | 字面反斜杠 |
| `\X`（其余所有） | `\\X` | 转义为 TOML 安全序列 |

## 测试

- 单元测试：`src/plugins/talk-common-system/` 下各模块独立测试
- 集成测试：`src/plugins/phase-talk-common.test.ts`（需先有测试模组）
- 校验用 `npm run validate` 检查所有 talk-common TOML 文件的 `conditions` 字段引用的是否在 premise registry 中注册
