# ADR-0017: 口上行为地文（纸娃娃）双轨定位 — 混合共存 + 空池兜底

## 背景

指令执行后触发口上，引擎有三层（同池权重竞争）：场景旁白（`scene-dialogue.toml`）、角色通用
（`character-dialogue.toml`）、角色专属（`characters/dialogue/{id}/dialogue.toml`）。之外，talk-common-system
提供**行为地文**（纸娃娃，`getBehaviorText`：H 行为 A+B+C 组合自动生成的身体/动作描述）。

对账 erArk（`Script/Design/talk.py`，`choice_talk_from_talk_data` :226-261）：

- erArk 的纸娃娃地文**不是独立的第四层，而是同一输出槽位的两种角色**：
  1. **概率共存替换（混合率）**：有口上被选中且（非角色专属 或 weight<100）时，按
     `draw_setting[13]×10%`（默认 30%）把选中的口上**替换**成 `{行为id}` 纸娃娃地文（:244-254）。
  2. **空池兜底**：无任何口上命中且行为在通用文本表时，直接输出 `{行为id}` 纸娃娃地文（:256-260）。
  3. **总开关** `draw_setting[2]`：0 时**连通用口上（adv_id=0）带纸娃娃**（混合+兜底）全禁（:152/:249/:258）。

本引擎 T3 已复刻"混合率 + 空池兜底"（`src/plugins/dialogue-system/index.ts`），但存在两个缺口：
①缺总开关（`common_mix_rate=0` 只关混合，兜底无条件触发）；②保护范围比 erArk 保守（凡 weight≥100
全保护，含通用高权重行）。

## 问题

1. **纸娃娃地文的定位**：是"最后的 fallback"还是"与通用口上并存"？——两个不是二选一，erArk 同时承担，
   本次要确认并把边界固化。
2. **作者控制权缺失**：没有一个开关能"彻底不要纸娃娃"（`common_mix_rate=0` 仍会空池兜底）。
3. **旁白层归属**：erArk 池中无旁白层；我们有三层，场景旁白被选中时是否该被纸娃娃替换？语义上旁白是
   环境叙述，被换成角色身体地文是断裂的。
4. **保护语义**：erArk 只保"角色专属 + 高权重"；我们通用层是 mod 世界观内容层（非 erArk 可弃的
   adv_id=0 填充），保护范围是否要照搬？

## 决策

**行为地文 = 双轨**（混合率共存 + 空池兜底），旋钮正交，默认对齐 erArk：

1. **D1 主模型**：双轨。低权重角色口上按概率被行为地文替换；候选池空时兜底出行为地文。
2. **D2 总开关（新增）**：`hConfig.talk.behavior_text_enabled`，默认 `true`；`false` = 混合 + 空池兜底
   两条纸娃娃路径全关，池空静默无输出（对齐 erArk `draw_setting[2]=0` 的纸娃娃一侧）。
3. **D3 混合率（已有）**：`hConfig.talk.common_mix_rate`，默认 `30`；`0` = 只关混合、留兜底（即 erArk
   `draw_setting[13]=0` 档位），不新增第三个开关。
4. **D4 保护规则（维持现状，有意偏离 erArk）**：任何来源（场景/通用/专属）`weight ≥ 100` 一律不参与
   混合替换。理由：我们通用层 = mod 作者按世界观写的自定义内容层，与专属层同权当"重要信号"保护；
   erArk 的通用（adv_id=0）是可弃填充，与其不同，故不照搬其"通用不保护"规则。
5. **D5 旁白排除（新增守卫）**：场景旁白行**永不参与混合替换**（只有角色来源行：通用/专属/原生默认词条
   是混合候选）。旁白=环境叙述，换成角色身体地文语义断裂；空池兜底照旧覆盖无角色口上的场景。
6. **D6 旋钮层级（MVP）**：两个旋钮均为 **mod 作者级**（hConfig TOML），不做玩家运行时开关；玩家级
   开关（erArk 系统设置里的 draw_setting）留给 L1.3 选项面板，属后续，不在本次范围。
7. **D7 反静默（钳制 + 告警）**：`readTalkBehaviorConfig` 对两个旋钮做防御性解析——
   `common_mix_rate` 越界/非数值 → 钳制回 [0,100]（非数值回默认 30）+ 去重 warning；
   `behavior_text_enabled` 非布尔（如 TOML 字符串 `"false"`）→ 按 true 处理 + 去重 warning。
   目的：把"作者写错配置静默怪行为"变成"一次显式报错 + 可预期的降级"，符合项目反静默失效原则。
8. **D8 口上 effects 语义（审计修复）**：
   - **场景旁白行 effects 修复执行**——原实现按 `outputIsChar` 门控 effects，场景旁白
     （source='scene'）`outputIsChar=false` → 场景口上带 `start_conversation`/`start_quest` 等
     effects 静默从不执行（文档承诺的死功能）。改为：**任何来源的命中行，只要未被行为地文替换
     且带 effects，都执行**。
   - **带 effects 的行不参与混合替换**——角色行若带 effects，明确排除出混合池（ersiArk 无行级
     effects，无对应语义；我们的行级 effects 是内容功能，不应被机械地文静默吞掉）。被混合替换的
     行（无 effects，才会被换）不执行 effects = 语义与 erArk 置空 talk_id 一致。
   - 回归覆盖：`chain-flow.test.ts`（真实 effect-system `narrative_output` 端到端：场景旁白 effects
     真实触发）+ `talk-common-behavior.test.ts`（带 effects 行不参与混合 / 场景 effects 执行）；
     文档显式示例见 `docs/instruction-to-narrative.md`「口上/对话节点带 effects」。

### 四态矩阵

| behavior_text_enabled | common_mix_rate | 效果 | 对应 erArk |
|---|---|---|---|
| true | 30（默认） | 混合 + 兜底（双轨默认） | draw_setting[2]=1, [13]=3 |
| true | 0 | 只关混合、留兜底（作者优先+填空） | [13]=0 |
| false | 任意 | 全关纸娃娃（纯口上；池空静默） | [2]=0 |

### 作用域边界（明确不改）

- **原生默认词条**（talk-common `behavior/` 目录经 `getText` 补位 character-generic 轨的那一层）**不在
  总开关作用域内**——它是"口上"不是"纸娃娃地文"，D2 只守 `getBehaviorText` 两条路径。
- H 行为文本仍走 `getBehaviorText`；`behavior/` 只放非 H 行为默认口上（不变）。
- `scene↔行为 id` key 惯例不变（trigger_dialogue 的 scene 名 = 行为 id，混合/兜底用同名查
  `action_A_<behavior>` 数据；对无地文数据的行为 `getBehaviorText` 返回 null = 自然空转，等价 erArk
  "行为 ∈ 通用文本表"判定）。

## 原因

1. **双轨而非二选一**：H 行为组合上千，作者不可能全覆盖口上；混合率让"作者声音 + 机械变化"交织防
   重复，空池兜底防叙事空洞——这是 erArk 这个长线运营实机调出的默认（30%），且已在本引擎 T3 实现。
2. **总开关**：双轨默认下，作者若想要"纯写过内容的掌控感"，`common_mix_rate=0` 只够关混合，兜底仍
   会顶出机械文；需要一个能"全关纸娃娃"的出口，直接对应 D6 里作者对内容的所有权。
3. **只关混合留兜底 = 既有档位**：erArk `draw_setting[2]=1,[13]=0` 原生支持，无需新旋钮，一个
   `common_mix_rate=0` 表达，文档讲清即可，旋钮数保持 2 个（正交）。
4. **保护与旁白**：保护规则对准"mod 内容层不可被随机机械文稀释"的作者价值（D4）；旁白排除是三层
   结构下自有的语义决策（D5）——erArk 无旁白层，无对应物可对齐，按语义自定。
5. **偏离显式化**：三处与 erArk 的有意偏离（D4 保护范围、D5 旁白、D2 总开关作用域收窄到纸娃娃）记为
   ADR，避免后续复刻时被误"对齐"回去。

## 参考

- erArk：`Script/Design/talk.py`（`choice_talk_from_talk_data` :226-261、`handle_talk_sub` :151-153、
  `draw_setting[2]/[13]/[14]`）
- 本引擎：`src/plugins/dialogue-system/index.ts`（triggerSceneInternal，T3 混合率 + 兜底守卫）、
  `src/plugins/talk-common-system/engine.ts`（getBehaviorText / replaceAll）、
  `src/core/mod-types.ts`（HConfigTalk：common_mix_rate / behavior_text_enabled / situations）
- 文档：`docs/dialogue-format.md` §七、`docs/talk-common-system.md`（给 Mod 作者的指南）
- 测试：`src/plugins/talk-common-behavior.test.ts`（T3 混合 + 总开关/rate=0/旁白排除 4 例）
- 既有复刻 spec：`docs/superpowers/specs/2026-08-08-talk-system-replication-design.md`（T3）
