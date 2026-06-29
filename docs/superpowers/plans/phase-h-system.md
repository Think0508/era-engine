# Phase H: H 系统 — 详细实施计划

> 状态：**待实施**（生成于 2026-06-30，基于 grilling G80-G98）
> 前置：Phase 1-10 完成（core 16 模块 + 11 插件 + UI + 208 测试）
> 验收：能进 H、状态值结算、绝顶/射精判定、刻印影响、露出模式、第一次系统、受孕判定

---

## 设计决策汇总（G80-G98）

### 分层
- **H 核心**：h-core（指令管道/前提/结算公式/实行判定/h_state/绝顶判定）
- **H 专属**：h-ejaculation（射精）、h-pregnancy（受孕+孕期，女儿 TODO）、h-first-time（处女等）
- **跨场景独立**：h-mark（刻印）、h-exposure（露出）
- **TODO 子系统**：h-hypnosis/h-time-stop/h-hidden/h-group/h-confinement/h-bondage/h-aromatherapy
- 复用现有：服装→equipment.toml+inventory-system、状态值→attributes.toml+status-system、口上→dialogue-system、指令→CommandRegistry、效果→effect-system

### 服装系统融合（G81-84）
- 单套槽位（equipment.toml 定义，mod 自定义数量），不分日常/战斗/H
- 衣服物品在 items.toml 定义，tags 控制 daily/combat/h 行为
- 字段：equipment（穿着）+ equipment_off（H 中临时脱下）+ equipment_visible（可见性）+ equipment_semen（精液污染）
- 全可选：不设 equipment = 不穿（不报错）；引用不存在物品 = warning + 视为空
- template 继承默认穿着（base-human 模板设默认布衣长裤），roster/named/npc 都靠继承

### 通用立绘（G86）
- assets.portrait（独立）> assets.portrait_type（通用，约定式路径 assets/portraits/{type}.png）> 无图不显示
- template 可设默认 portrait_type

### 状态值体系（G85/G95）
- Parameter（attribute）= 状态值（10 级制，daily_reset），日常/H 通用
- h_state（角色字段）= 只在 H 会话内有意义（插入位置/体位/绝顶计数/射精量等），H 结束重置
- eja_point = attribute（daily_reset=false，H 结束不重置但日常衰减）
- level_thresholds 在 attribute definition 声明，引擎提供 getLevel(attdrId, value) 查表

### H 模式（G93）
- 猥亵指令 = exploration 模式下的普通指令（不切模式）
- 真正进 H 才 pushMode('h_scene')
- H 结束 popMode 回 exploration

### 指令管道（G89 修正）
- H 指令走 command-executor 统一管道：下指令→前提检查→effect 执行（=结算）→口上
- 不需要特殊"实时结算"步骤——effects 就是结算
- hour_changed 只管按时间变的东西（疲劳/精液恢复等）

### 指令集组织（G88/G90）
- mod 在 definitions/h-instructions/ 分文件声明指令
- 分类：daily.toml / obscenity.toml / sex/base.toml / sex/foreplay.toml / sex/insert.toml 等
- 每条指令有：premises（前提列表）/ effects（效果数组）/ talk_scene（口上引用）/ judge_base（判定阈值）

### 公式/机制复用（G92）
- h-core 注册 API 暴露所有核心公式（calcFavorability/calcTrust/calcJudge/stateChange/getAbilityAdjust 等）
- 子系统通过 ctx.api.call('h-core', 'xxx', ...) 调用，不重复实现
- h-core 的 effect types 内部直接调本插件函数

### 子系统自包含扩展（G91）
- 每个子系统插件自包含：自己注册 effect types / premise handlers / commands / condition fields
- h-core 提供 premiseRegistry.register(id, handler) 供子系统注册
- 不修改 h-core 或其他插件

### 术语通用化（G87）
- 引擎代码/默认配置不出现任何具体世界观用词
- "源石技艺"→mod 定义的能力类型、"信息素"→魅力/体香等
- 文档加泛化标注

### 系数可配（G97）
- h-config.toml 声明系数表（ability_lv_adjust/status_level_thresholds/favorability_thresholds 等）
- 公式结构写死在 h-core 代码，系数值来自 TOML
- 简洁注释

### MVP 范围（G98）
- 实现：h-core + h-ejaculation + h-pregnancy(受孕+孕期) + h-exposure + h-mark + h-first-time
- TODO：h-hypnosis/h-time-stop/h-hidden/h-group/h-confinement/h-bondage/h-aromatherapy/女儿成长

---

## Task 拆分

### Task H.0：mod-loader 扩展 + test-mod 数据

**目标**：加载 h-config.toml / h-instructions/ / 正文系统字段扩展

**Files:**
- Modify: `src/core/mod-loader.ts`（加载 h-config.toml + h-instructions/*.toml）
- Modify: `mods/test-mod/definitions/equipment.toml`（扩展槽位）
- Create: `mods/test-mod/h-config.toml`（系数表）
- Create: `mods/test-mod/definitions/h-instructions/daily.toml`（聊天/送礼/按摩等）
- Create: `mods/test-mod/definitions/h-instructions/obscenity.toml`（摸头/接吻等）
- Create: `mods/test-mod/definitions/h-instructions/sex/base.toml`（等待/结束H）
- Create: `mods/test-mod/definitions/h-instructions/sex/foreplay.toml`（爱抚/接吻H）
- Create: `mods/test-mod/definitions/h-instructions/sex/insert.toml`（正常位等）
- Modify: `mods/test-mod/definitions/attributes.toml`（加 H 状态值属性 + level_thresholds）
- Modify: `mods/test-mod/definitions/status-effects.toml`（加刻印状态）

**Steps:**
- [ ] mod-loader 加载 h-config.toml → mod.hConfig
- [ ] mod-loader 扫描 h-instructions/ 目录 → mod.hInstructions
- [ ] equipment.toml 扩展（加 removable/semen_capacity）
- [ ] attributes.toml 加 H 状态值（快C/快V/润滑/恭顺/欲情/羞耻/苦痛/恐怖/屈服/反感…）含 level_thresholds
- [ ] h-config.toml 系数表（ability_lv_adjust/status_level_thresholds/favorability_thresholds）
- [ ] h-instructions TOML（日常5-10条 + 猥亵3-5条 + H内基础10-15条）
- [ ] status-effects.toml 加 7 刻印
- [ ] 测试 + typecheck

### Task H.1：h-core 插件核心

**目标**：指令管道/前提系统/结算公式/实行判定/h_state/绝顶判定

**Files:**
- Create: `src/plugins/h-core/plugin.toml`
- Create: `src/plugins/h-core/index.ts`
- Create: `src/plugins/h-core/premise/premise-registry.ts`
- Create: `src/plugins/h-core/premise/premise-h.ts`
- Create: `src/plugins/h-core/premise/premise-target.ts`
- Create: `src/plugins/h-core/premise/premise-fall.ts`
- Create: `src/plugins/h-core/premise/premise-clothing.ts`
- Create: `src/plugins/h-core/settle/favorability.ts`
- Create: `src/plugins/h-core/settle/trust.ts`
- Create: `src/plugins/h-core/settle/judge.ts`
- Create: `src/plugins/h-core/settle/state.ts`
- Create: `src/plugins/h-core/settle/orgasm.ts`
- Create: `src/plugins/h-core/settle/experience.ts`
- Create: `src/plugins/h-core/settle/hp-mp.ts`
- Create: `src/plugins/h-core/types.ts`
- Create: `src/plugins/h-core/h-instruction-loader.ts`
- Create: `src/plugins/h-core/h-core.test.ts`

**Steps:**
- [ ] plugin.toml: depends_on effect-system/status-system/dialogue-system/character-system
- [ ] types.ts: H_STATE 接口 / HInstruction 接口
- [ ] premise-registry: register(id, handler)/evaluate(premises, ctx)
- [ ] premise-*.ts: 注册基础前提 handler（NOT_H/IS_H/HAVE_TARGET/T_NORMAL/FALL_LEVEL_GE_1/CLOTH_OFF 等）
- [ ] settle/*.ts: 15 公式函数（好感/信赖/判定/状态值/绝顶/经验/HP-MP）
- [ ] h-config 加载系数表 + getAbilityAdjust(level)/getLevel(attdrId, value)
- [ ] onLoad: 注册 h-core effect types（h_state_change/h_favorability/h_judge/h_orgasm_check/h_experience/h_hp_mp_change/h_start_h/h_end_h/h_realtime）
- [ ] onEnable: 注册 h-core API（全部公式函数 + evaluatePremises + registerPremise）
- [ ] h-instruction-loader: 加载 h-instructions TOML → 注册到 CommandRegistry
- [ ] startH/endH: h_state 初始化/重置 + pushMode/popMode
- [ ] 绝顶判定: 部位快感累积 >= 阈值 → 触发绝顶 → 调 h-ejaculation（P 部位）
- [ ] 测试: 前提求值/公式/h_state 生命周期/绝顶判定

### Task H.2：h-ejaculation 插件

**Files:**
- Create: `src/plugins/h-ejaculation/plugin.toml`
- Create: `src/plugins/h-ejaculation/index.ts`
- Create: `src/plugins/h-ejaculation/h-ejaculation.test.ts`

**Steps:**
- [ ] onLoad: 注册 eja_add/eja_climax/eja_shoot effect types
- [ ] onEnable: 注册 eja API（getEja/setEja/climax/shoot）+ 精液追踪 API
- [ ] 射精积累: 每次P部位行为 eja += 100 + int(eja × 0.4)
- [ ] 射精量计算: base × random(0.8,1.2) × 叠加倍率（第一发/药物/积攒等）
- [ ] 精液追踪: body_semen/cloth_semen 位置+量+等级
- [ ] 精液吸收: 按时间衰减
- [ ] 测试

### Task H.3：h-pregnancy 插件

**Files:**
- Create: `src/plugins/h-pregnancy/plugin.toml`
- Create: `src/plugins/h-pregnancy/index.ts`

**Steps:**
- [ ] onLoad: 注册 pregnancy_check effect type
- [ ] onEnable: 注册 pregnancy API + 监听 game:new_day 推进孕期
- [ ] 受孕判定: 精液在体内 + 非避孕时间 → 判定
- [ ] 7 阶段孕期: 每天 game:new_day 推进
- [ ] 泌乳: 孕期某阶段触发
- [ ] // TODO(phase-11+): 女儿成长完成后作为自订角色入口
- [ ] 测试

### Task H.4：h-first-time 插件

**Files:**
- Create: `src/plugins/h-first-time/plugin.toml`
- Create: `src/plugins/h-first-time/index.ts`

**Steps:**
- [ ] onLoad: 注册 first_time_check effect type
- [ ] onEnable: 注册 first-time API (isVirgin/getFirstTimeFlag/setFirstTime)
- [ ] 处女6种: 判定 + 实行惩罚 + 首次剧痛公式
- [ ] 初吻等: 标记 + 口上触发
- [ ] 测试

### Task H.5：h-exposure 插件

**Files:**
- Create: `src/plugins/h-exposure/plugin.toml`
- Create: `src/plugins/h-exposure/index.ts`

**Steps:**
- [ ] onLoad: 注册 exposure effect types + premise handlers
- [ ] onEnable: 注册 exposure API + 指令
- [ ] 4 级露出模式: 动态切换
- [ ] 被发现处理: NPC 目睹暴露 → 事件
- [ ] 露出中羞耻/快感生成效率
- [ ] 测试

### Task H.6：h-mark 插件

**Files:**
- Create: `src/plugins/h-mark/plugin.toml`
- Create: `src/plugins/h-mark/index.ts`

**Steps:**
- [ ] onLoad: 无（刻印作为 ability type 2 存在）
- [ ] onEnable: 注册 mark API（getMarkLevel/checkMarkUp/markDown）+ 监听睡眠结算
- [ ] 7 种刻印: 升级条件检查（绝顶次数/状态值累积等）
- [ ] 刻印修正: 供 h-core 公式查询（好感/实行修正）
- [ ] 降级: 满足条件时降级消耗
- [ ] 测试

### Task H.7：集成测试 + 文档更新

**Steps:**
- [ ] 集成测试: H 全流程（猥亵→邀请H→H内→绝顶→射精→结束H→睡眠结算→刻印获得）
- [ ] 更新 developer-handbook / mod-author-guide / plugin-author-guide
- [ ] 更新 CONTEXT.md（H 相关术语）
- [ ] npm run test + typecheck + dev 目视

---

## 依赖关系

```
H.0 (mod-loader+数据) ─┐
                        ├─→ H.1 (h-core) ─┬─→ H.2 (h-ejaculation) ─┐
                        │                 ├─→ H.3 (h-pregnancy)    ─┤
                        │                 ├─→ H.4 (h-first-time)   ─┤
                        │                 ├─→ H.5 (h-exposure)     ─┤
                        │                 └─→ H.6 (h-mark)         ─┤
                        │                                            └─→ H.7 (集成+文档)
```

**实施顺序**：
1. H.0（基础数据 + mod-loader）
2. H.1（h-core 核心）
3. H.2-H.6（子系统，可并行）
4. H.7（集成测试 + 文档）

---

## Deferred / 备忘

| # | 项目 | 后续 | 备忘 |
|---|------|------|------|
| 1 | h-hypnosis（催眠） | 后续 | 日常偷窃/H 催眠 |
| 2 | h-time-stop（时停） | 后续 | 绝顶累积/理智消耗/搬运 |
| 3 | h-hidden（隐奸） | 后续 | 4级隐匿/发现度 |
| 4 | h-group（群交） | 后续 | 模板/NPC AI/多人修正 |
| 5 | h-confinement（监禁调教） | 后续 | 监禁/逃脱/调教助手 |
| 6 | h-bondage（紧缚） | 后续 | 3级紧缚 |
| 7 | h-aromatherapy（香薰疗愈） | 后续 | 8种每日buff |
| 8 | 女儿成长→自订角色入口 | Phase 11+ | h-pregnancy 扩展 |
| 9 | 动态体位切换指令 | 后续 | 15 体位 × 5 部位 |
| 10 | NPC H AI（H 内自动行动） | 后续 | handle_npc_ai_in_h |
| 11 | 二段行为（绝顶/射精后连锁） | 后续 | SecondBehavior |
| 12 | 宝珠系统（睡眠结算转换） | 后续 | 24 种宝珠 |
| 13 | 口上三层匹配加权随机 | 后续 | 通用/角色/特殊情境 |
| 14 | 纸娃娃地文（占位符替换） | 后续 | {vagina} 等模板替换 |

---

## 验收标准

- [ ] h-core: 指令管道/前提求值/15 公式/实行判定/h_state 生命周期/绝顶判定
- [ ] h-ejaculation: 射精积累/射精量/精液追踪/吸收
- [ ] h-pregnancy: 受孕判定/孕期推进
- [ ] h-first-time: 处女判定/首次惩罚
- [ ] h-exposure: 4 级露出/被发现
- [ ] h-mark: 7 刻印升级/降级/修正查询
- [ ] 服装: equipment.toml 扩展/穿脱/引用不存在 warning
- [ ] 状态值: level_thresholds/getLevel 正确
- [ ] H 模式: pushMode('h_scene')/popMode
- [ ] 插件隔离: 禁用任一子系统不影响 h-core
- [ ] `npm run typecheck` + `npm run test` 全通过
- [ ] 文档更新 + TODO 注释