# ADR-0018: 行为轨口上整体修饰（style/trigger/display/speed/…）

## 状态

已采纳（2026-08-23）

## 背景

口上输出有两类修饰意图：

1. **行内修饰**：BBCode（`**加粗**`、`{{color:#80FF0000 半透明}}`、`||涂黑||` 等），作用于文本内部局部——行轨与行为轨都生效（所有叙事文本渲染层统一过 `FormattedText` → `bbcode-parser`）。
2. **整体修饰**：`[styles]` 命名样式、`trigger`/`display`/`speed`/`pause`/`color`/`size`/`font` 行级字段——只存在于**行结构**（scene_lines / character_lines / conversation 的 `lines`），经 `resolveLineDisplay`（dialogue-system）解析为叙事日志的 `LogDisplay`（NarrativeLog 渲染逐字/点击/颜色/字体）。

行为轨（talk-common 词条，`behavior/` 目录）的结构只有 `conditions / context / part`——它是 erArk talk CSV 的对应物，被设计为"加权文本池"。dialogue-system 补位为默认口上时构造 `{ line: { scene, text } }` 不带任何展示字段 → `resolveLineDisplay` 恒 undefined → **行为轨口上永远以默认外观输出**。

### 附带发现（同批修复）

`bbcode-parser` 把 `{{color:…}}` 的 8 位 hex **原样**塞给 CSS。引擎色值约定为 `#AARRGGBB`（文档承诺半透明），而 CSS 8 位 hex 是 `#RRGGBBAA`——直接透传把 alpha 塞错位：`#80FF0000` 被浏览器读成**全透明**。游戏与工具预览同受影响。

## 决策

**D1 行为轨整体修饰（本 ADR 主体）**：talk-common 词条条目支持可选展示字段
`style / trigger / display / speed / pause / color / size / font`（类型与枚举对齐行结构）。
`pause` 语义（2026-08-23 恢复原始设计）：本条显示完后**自动暂停毫秒数**（trigger=auto 生效）
——全屏 EXECUTING 流 `FullscreenOutput` 中该条（含 typewriter 播完）显示完自动停顿 N 毫秒
再继续下一条，等待期间点击可跳过（era autopage 惯例）；列表滚动日志无流语义无效。

```toml
[[entries]]
style = "narrator"                  # [styles] 注册表命名样式（mods/[mod]/definitions/talk/styles.toml）
display = "typewriter"              # 或 trigger = "click" / speed = 40 / pause = 500
color = "#80FF0000"
context = "整条口上走整体修饰，行内仍可叠加 BBCode。"
```

1. **数据链路**：`normalizeCommonTextEntry` 白名单透传（未知键仍丢弃）→ 新增 `getTextEntry(variable, target, actor)` 返回 `{ text, display }`；`getText` 保留为纯文本视图（不破坏 sleep-system 等既有调用方与测试）。
2. **dialogue-system 补位**：角色级/场景级默认口上补位改用 `getTextEntry`，把 display 字段展开到合成的 `line` 上 → 既有 `resolveLineDisplay`（含 `[styles]` 注册表查找、行级字段覆盖）无需改动，自然生效。
3. **style 名作用域**：<b>渲染配置属于 mod</b>——style 名解析顺序 = 插件默认层基座（约定由 dialogue-system 的 `data/default/talk/styles.toml` 提供，2026-08-23 实现，`mod-parse.collectPluginDefaultStyles`）+ **当前活跃 mod** 的 `[styles]`（`mods/{mod}/definitions/talk/styles.toml`，同名键整体覆盖默认基座）。默认层词条引用某 style 名时同样按「基座 + 活跃 mod」解析。
4. **组合词条限制**：`parts` 组合词条（body/body_part/action 分段拼接）的 display 只取**被选中的 A 段条目**的字段，其余段忽略（组合是身体描述，节奏参数没有分段语义）。
5. **行为地文（getBehaviorText）不带 display**：纸娃娃地文是画面描述，保持纯文本。

**D2 颜色语义修复（同批）**：新增 `src/ui/utils/color.ts` 的 `toCssColor()`——引擎 8 位 hex `#AARRGGBB` → CSS `rgba()`；`FormattedText.vue`（BBCode 行内色 + props 整体色）与 `NarrativeLog.vue`（typewriter 分支）统一经它转换。3/6 位 hex 与命名色原样。

**D3 工具（talk-common-editor）同步**：校验新增展示字段类型/枚举检查（warning 级）+ style 名注册表解析提示（hint 级）；预览应用整体样式（查 mod `[styles]`）并标注节奏徽标（`逐字40ms` / `点击继续` / `暂停500ms` / `style:xxx?`）。

## 优先级与渲染语义（与行结构一致）

- 行内 BBCode > 整体字段（样式表）> 默认外观；
- `resolveLineDisplay`：`[styles]` 表字段为基底，词条自身字段覆盖之；
- 逐字/点击/暂停等由 NarrativeLog 消费（`LogDisplay`），与行轨口上完全同路径。

## 影响

- API：`talk-common` 新增 `getTextEntry`；`getText` 语义不变（纯文本视图）。
- 数据：行为词条新增 8 个可选字段；存量文件不受影响（缺省 = 原行为）。
- 测试：`talk-common-display.test.ts`（engine 级：归一化透传/幂等、getTextEntry、parts 组合取 A 段）、`color.test.ts`（#AARRGGBB→rgba）；既有 talk-common/dialogue/指令链回归 53 例全绿。
- 文档：`docs/dialogue-format.md` §七、`docs/talk-common-system.md` 字段表/API、`tools/talk-common-editor/README.md`。

## 备选方案（否决）

- **给 getText 改返回结构**：破坏 sleep-h.ts 与多处既有调用/测试；保留 `getText` 做文本视图，新增富查询，二者共用同一内部 `pickEntryMeta`（单次随机，无双选不一致问题）。
- **行为轨增量覆盖样式字段**：维持词条整体替换语义不变（style 字段随词条一起被 mod 覆盖），不引入新的覆盖机制。