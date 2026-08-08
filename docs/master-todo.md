# era-engine 汇总 TODO

> 所有 TODO 集中在此。分层结构：
> - **L0 架构层**：影响整个代码库的架构决策，必须先做
> - **L1 系统层**：完整的系统/插件实现

## 会话交接摘要（2026-07-14）

> 新会话开始时先读此节。

### 已完成（本会话）
```
L1.6 前置改动（spec §10，B1 开工前一次做完）✅
  - loader 收敛: h-instructions/ 双路径 → 单 instructions/（插件默认层 + mod 层按 id 去重，mod 胜出）
    h-instruction-loader.ts 删除，并入 instruction-loader.ts；h_ 前缀移除
  - HInstruction 接口扩展: erark_id/erark_behavior/judge_base/judge_class/tags/condition
    loader 自动注入 judge_check（有 judge_base 时置顶）
  - judge_check/calcJudge 对接: calcJudge 加 judgeClass 参数 → 查 hConfig [judge.adjustments] 表
    h-config.toml 新增修正表（性交-250/A性交-350/W性交-400/亲吻-125，instuct_judege.py 逐行翻译）
    未实装修正项（月经/体位/旅馆/他人/助理/H打断/监禁/睡眠/激素）留 TODO 注释
  - 位置前提迁移: 8 个 IN_* handler 删除 → location.tags（对照表 docs/instruction-replication/location-tags.md）
  - 引擎耗时机制: timeCost<=0（-1=handler 自定义耗时）不自动推进时间、不进结算公式
  - UI 分类开关: CommandBar 动态收集已存在，补全排序（play/work/arts/system）
  - 清理: mods/_erark_source/ → docs/instruction-replication/archive/_erark_source/
  - 顺带修复: typecheck 基线错误 12 处（未用 import/ExecutionContext.sourceId 等）
  验收: npm run typecheck ✅ / npm run test 266 通过 ✅ / dev 启动无报错 ✅

Code review 修复（2026-08-08 子代理 review）✅
  - loader 兼容 spec schema：category/sub_category 规范名（type/sub_type 旧别名兜底）
  - 单条指令注册失败（id 重复）→ errorReporter + 跳过，不拖垮 h-core（原会 throw 禁用整个插件）
  - 天赋个性修正按 erArk 门控 S 类判定：亲吻(D) 不吃 淫乱/性好奇/性冷漠/性无知（instuct_judege.py 162-178 行）
  - game:execution_end 发 clamp 后耗时（-1 不再外泄给 h-hidden/h-pregnancy）
  - 同层指令 id 重复 → warning；缺 time_cost / 孤儿 judge_class → warning
  - 修正条件解析失败 → errorReporter（原静默吞）
  - 新增 4 测试（S类门控判别/单条失败隔离/executor premises/timeCost -1）→ 270 通过
  验收: npm run typecheck ✅ / npm run test 270 通过 ✅

二次深度审查修复（2026-08-08，静默bug/架构/完整性）✅
  - 条件绕过消除: DailyMenu/ScreenNumpad 原来 evaluateCondition: ()=>true（静默执行风险）
    → 新建共享求值器 src/ui/utils/command-eval.ts，三组件同源；executor fail-safe：
      有 condition/premises 但调用方无求值器 → warning + 跳过（禁止静默放行）
  - 加载时校验（AGENTS §21）: condition 引用未注册字段 → error + 注销该指令；
    premises 未注册 → warning（去重）；hConfig adjustments 修正条件 → error
    - 因插件 condition_fields/premises 在 onEnable 后才注册，新增 game:plugins_loaded
      生命周期事件（plugin-manager 全部 onEnable 后 emit），校验延迟到该事件
  - condition-registry: 新增结构路径 pattern（location.tags.{tag}/talents/abilities/
    factions/status/relations/first_times/experience/body_parts/base/inventory）+
    validateExpression()（selected./target. 归一化校验）
  - judge_check 多目标: 最坏者胜出合并（retreated>partial>success），防静默覆盖
  - condition.ts 根路径只在位置0生效（防深层字段遮蔽，如角色字段名叫 player）
  - h-config adjustments 条件改显式结构路径（target.talents.性无知）
  验收: npm run typecheck ✅ / npm run test 274 通过 ✅ / dev 启动无报错 ✅

三次深度审查修复（2026-08-08，round-3：条件引擎真相对齐）✅
  - selected 根路径修复（重大）：gameContext.getContext() 从未提供 selectedCharacterId →
    bridge 同步选中角色（watch uiStore.selectedCharacterId → gameContext.setSelectedCharacterId）
    （talk/open_selected_panel 的 `selected != null` 之前恒 false——指令永久死亡，现已修复）
  - 条件引擎 null/undefined 右值支持（`selected != null` 存在性检查，不再抛错→恒 false）
  - 能力记录终端解包为等级（AGENTS §36 {level,xp} 数据契约）；对象数组单段 id 匹配（status.醉意 存在性）
  - 字段别名机制：core 条件引擎保持通用，插件注册别名（status-system 注册
    status→status_effects / remaining→remaining_duration，gameContext.setFieldAliases）
  - validateExpression 去掉根白名单：插件自定义根（combat.in_progress）直接精确校验；
    数字/负数字面量不误判
  - judge_check 空目标 fail-closed（retreat+警告）；mergeJudgeResult 提取纯函数+单测；
    settle_hp_mp 补 canApply 门控（与兄弟 settle_* 一致）
  - executor 前提/条件检查包 try/catch（前提 handler 抛错不再逃逸 execute()）；
    command-eval 去掉 player 兜底（与 resolveTarget('selected') 语义一致，防 HAVE_TARGET 假通过）
  - ScreenNumpad ctx 补齐（api/engine/sourceId）；engine-ui-bridge createExecutionContext 换共享求值器
  - effect_block 未知引用 → warning；CommandDef 增加 tags 字段透传（spec §3）
  - game:plugins_loaded 监听器防重复注册
  验收: npm run typecheck ✅ / npm run test 281 通过 ✅ / dev 启动无报错 ✅

四次深度审查修复（2026-08-08，round-4：跑通性验证）✅
  - 真浏览器启动 bug：main.ts 手动重复注册 locations（loadMod 内部已注册）→
    "实体 location:town_square 已存在" 启动即失败页 → 删除重复注册
  - era-engine.config.toml 从未被读取（active_mod 死配置，切模组无效）→ main.ts 读取
    active_mod（?raw 导入 + @iarna/toml，缺省兜底 test-mod）
  - meta.toml starting_location/player_character 死字段（AGENTS §39 文档化但未加载）→
    LoadedMod 加载 + main.ts 使用（起始地点/玩家实体按 mod 声明）
  - 新增 boot 冒烟测试 src/plugins/boot-smoke.test.ts（镜像 main.ts 全量插件加载）：
    插件 onEnable 全部成功（move/talk/do_h/end_h 存在性强断言）、指令注册、校验无误报
  - instruction-loader 幂等保护（onEnable 重跑不再重复注册刷屏）
  验收: npm run typecheck ✅ / npm run test 288 通过 ✅ / dev 启动无报错 ✅

五次深度审查修复（2026-08-08，round-5：测试审查 + 判定链路真 bug）✅
  - 【重大 pre-existing bug】effect-system 每效果新建 handlerCtx 拷贝 → judge_check 写入的
    _judgeResult 后序 settle_* 读不到 → canApply 恒 true → 判定退缩从不阻止结算！
    （judge_check/settle_favorability/trust/state/hp_mp 全链路静默失效）
    修复：handlerCtx = Object.assign(execCtx, ...) 共享同一执行上下文
  - 新增端到端判定测试（effect-system + h-core onLoad + executor 全链路）：
    退缩 → settle_state 跳过（快乐不变）+ 退缩日志；已吻 → 判定成功 → settle_state 生效（40）
  - phase-h 测试自足化：mod 加载测试前置 entitySystem.clear()（消除顺序脆弱依赖）
  - 测试审查发现：setEntityAttr 找不到命名空间时写直接属性（测试角色未按
    applyAttributeDefaults 初始化导致的假失败——测试已镜像真实初始化）
  验收: npm run typecheck ✅ / npm run test 289 通过 ✅

六次深度审查修复（2026-08-08，round-6：链路验证）✅
  - 新增链路冒烟测试 src/plugins/chain-flow.test.ts（真正"点指令"的全链路）：
    rest → 时间+60min/恢复效果/场景口上；do_h → H开始 → end_h 结束（模式栈往返）；
    talk → 占位输出；整批无 error
  - 新增 bridge 叙事链测试（narrativeLog.write → eventBus → bridge → gameStore）
  - 链路验证中发现并修复：
    - 测试 mock 缺 selectCharacter（talk handler 依赖）——真实 uiStore 有，产品无 bug
    - talk-common API 注册在 onEnable（async）——plugin-manager 有 await，产品无 bug
    - rest 无选中目标时 2 条 "target='selected' 无选中" warning——test-mod 数据设计
      （搭档恢复效果），B1 写 rest 时按 target 条件化
  验收: npm run typecheck ✅ / npm run test 294 通过 ✅（32 文件）

七次深度审查修复（2026-08-08，round-7：静默错误排查）✅
  - 【静默 bug】dialogue pickMatchingLine 不求值替换 {id} 占位符 → character.{id}.好感度
    解析为查找角色 '{id}'（恒不存在 → 条件恒 true）：好感度条件失效 + 无条件台词被随机遮蔽
    → substituteId() 替换后求值（premises: 分支同样处理）
  - executor finally 的 checkTalentGain 无防护 → 异常会逃逸 execute()（UI 点击崩）
    → try/catch + errorReporter
  - settle_hp_mp 的 .catch(()=>false) 吞真实错误 → 只忽略"插件未注册"（与 judge_check 一致）
  - 链路测试升级：h-core onEnable 用真实 eventBus（execution_end 二段结算监听器真实注册）
    + 新增"H 中执行指令 → body_item_tick + orgasmJudge 不崩"测试
  - 角色口上分支测试（{id} 判别：好感度 50 → '哦，是你啊'；10 → '你是何人'）
  - 修 flaky：test-mod greet 两行条件互斥（原无条件行 + 随机选 → 断言 flaky）
  验收: npm run typecheck ✅ / npm run test 296 通过 ✅（6 连跑稳定）

B1 试点：chat（1004）完整复刻（2026-08-08，用户要求最小化验证，先单条后整批）✅
  - 批次清单 docs/instruction-replication/batch-01-daily.md：24 条总览 + chat 深度分析
    （判定四列=无判定（handle_chat 无 judge）/ 前提 4 已注册+1 新注册 / 效果链 7 ID 两步路径逐条 /
     time_cost=5（Behavior_Data.csv 非 -1）/ 无位置前提）
  - chat TOML → src/plugins/h-core/data/default/instructions/daily.toml（插件默认层，mod 可覆盖）
    失败链/成功链用 [effect_blocks]（TOML 内联表不能跨行，块名引用）
  - 新增引擎效果（h-core）：
    - chat_settle：复刻 handle_chat（talk_count 衰减/分支/递增，settle_behavior.py:560-581）
    - talk_add_adjust：复刻 501 TALK_ADD_ADJUST（default.py:5813，话术加成 + talk_time 记录）
  - 新增前提 NO_TARGET_OR_TARGET_CAN_COOPERATE_OR_IMPRISONMENT_1
    （语义 handle_premise/__init__.py:834；未实装子系统留 TODO：监禁/睡眠/外勤等）
  - 修静默 bug：calcFavorability 亲密项用数字键 33（abilities 按名存 → 恒 0）→ 改按名 '亲密'
  - 补 话术技能（erArk ability 40）到 h-core 默认 abilities.toml
  - 新增 6 测试 src/plugins/instruction-chat.test.ts（成功链全 7 ID 数值/失败链/同日衰减/跨天归零/话术门槛/无 error）
  验收: npm run typecheck ✅ / npm run test 302 通过 ✅（33 文件）

L1.6 结算保真补全（2026-08-08，tenths_add/连续减值/无意识门控三件套）✅
  - tenths_add（common_default.py:233-240）：settle_state 全局生效——追加 min(3×基础值, 当前值/10)；
    当前值 0 时无影响（chat 既有测试数值不变）
  - 连续重复指令减值（common_default.py:210-231/569-589）：引擎新增执行历史
    behaviorHistory（command-executor 记录，上限 8 条）+ getContinuousAdjust（第 3 次 0.7 → 5 次触底 0.4）
    → settle_state（非负面/非自己）/ settle_favorability / settle_trust（仅正收益）全部生效；
    基础指令 wait/move/rest 不衰减（erArk instruct 0/1/2）
  - 无意识门控（common_default.py:196-208/551-557）：时停部分（sp_flag.unconscious_h===3）——
    settle_state 心智状态/心理快感跳过、favorability/trust 不结算、settle_hp_mp 不结算；
    睡眠/无意识留 TODO（L1.7）
  - 系统难度/信物修正 → 留 TODO（依赖系统未实装，同 spec §5.3）
  - 新增 15 测试 src/core/settle-fidelity.test.ts；chat 测试加 beforeEach 历史隔离
  验收: npm run typecheck ✅ / npm run test 317 通过 ✅（34 文件）

结算保真审查（2026-08-08，三件套架构核查）✅
  - 接入架构确认：三件套全部在 settle_* effect 类型内 → 所有指令 TOML 引用这些类型即自动生效
    （chat 已受益；B2-B6 按 SOP 映射同样自动获得），无逐指令接线负担
  - 【审查发现·已修】settle_state 无意识门控只查 ids[0]——多目标（群交/战斗 all_enemies）时
    其他目标门控静默失效 → 改 per-id（新增多目标测试，直接调 handler）
  - 【审查发现·已修】tech_adjust 三件套缺失 + 两处公式偏差（B3-B6 大量依赖，必须前置）：
    ① 欲情误用 sqrt(部位感度×欲情)——erArk state 12 非快感分支 = base×ability表[目标.部位感度]
    ② 部位感度查 abilities[part]（'皮肤'）——能力实际按名存 '皮肤感度'，恒 undefined → 感度等级
       从未生效（静默）→ 新增 PART_ABILITY 映射
    ③ 补 tenths_add/连续减值/无意识心理门控
  - 【已修】tenths 当前值改 getEntityAttr 跨命名空间读取
  - 登记 TODO：tech_adjust 的素质/调香/催眠敏感/体位/信物/难度修正（依赖未实装系统，同 spec §5.3）；
    body_item_tick/二段结算在时停下的行为（B3 前核对 second_behavior.py）
  验收: npm run typecheck ✅ / npm run test 322 通过 ✅（34 文件）

第二批结算保真：素质修正数据化 + 催眠敏感（2026-08-08）✅
  - 数据化设计（用户确认架构）：修正写入 talents.toml 天赋定义字段，TS 查定义表动态应用——
    加新天赋 = 改 TOML 一行，零 TS 改动（talents.toml 解析为 mod.talentDefs，TalentDef 接口补字段）
  - state_adjusts（状态系数加法，erArk common_default.py:379-422）：13 天赋
    勤劳/懒散/教官（习得先导±）、脆弱/坚强/献身（恭顺屈服）、热情/孤僻（好意快乐）、
    羞耻/开放（欲情羞耻）、施虐狂（先导）、受虐狂（苦痛）、感情缺乏（states=["*"] 全部 -0.4）
  - favorability_adjusts（好感系数，erArk :717-748）：爱情隶属系 8 个（love1-4 组二选一累计）、
    受精/妊娠/临盆（preg 组）、感情缺乏/讨厌男性（无组）、博士信息素 3 个（pheromone 组取最高，新增定义）
  - calcFavorability 重构：乘法混合链 → erArk 全加法 fix 链（int(fix×base)）；死键 getFallTalentLevel 删除
  - 催眠敏感：settle_state（欲情/快感 +2 系数）+ tech_adjust（快感 sqrt 内 +2、欲情 +2），
    数据 ch.hypnosis.increase_body_sensitivity（h-hypnosis 既有字段，实体数据共享合规）
  - 调香（aromatherapy）→ 不做（香薰系统粗筛已砍）；calcTrust 为 MVP 简化版，天赋修正随其完整复刻登记 TODO；
    体位修正（Sex_Position 系数/喜欢体位/子宫奸/怀孕灌肠加成）→ B3 批次清单时一并做
  - 新增 10 测试（素质修正 4/催眠敏感 2/好感素质 4）
  验收: npm run typecheck ✅ / npm run test 332 通过 ✅（34 文件）

calcTrust 完整复刻（2026-08-08，用户纠正：禁止擅自简化）✅
  - 原 trust.ts 为 MVP 简化（duration/60 × 好感系数）——擅自简化，已废弃
  - 完整复刻 erArk calculation_trust（common_default.py:752-813）：fix 全加法链
    （亲密/快乐刻印/屈服刻印 +0.2/级，苦痛/恐怖刻印 -0.3/级，反发 -1.0/级 + 素质修正数据化）
    trust = add_time/60 × fix（float，erArk 同）；>0 乘连续减值；封顶 300 进 SettlementContext 统一钳制
  - 测试更新（phase-h-integration calcTrust：10/60→0.167、60→1、思慕→1.25）
  验收: npm run typecheck ✅ / npm run test 332 通过 ✅（34 文件）

快感附加修正 + 死键修复（2026-08-08，用户纠正：漏报的简化项）✅
  - settle_state/tech_adjust 补 chara_feel_state_adjust:300-347 全部位修正：
    眼罩 +0.2（body_item slot 6）/ 无意识时无觉刻印 +(adj-1)×2 / 群交 +0.02×人数(cap10)
    / V/W 怀孕 inflation +1、灌肠 enema_capacity×0.2
  - settle_state 补 base 分支群交 +0.05×人数（:444-450）；tech_adjust 欲情补素质修正+群交
  - 苦痛转化（:242-245）：pain_as_pleasure → 心理快感 ×施虐系数（tenths_add=False），settle_state 实现
  - 死键修复：newday-settle abilities[33]→'欲望'、前提 TECHNIQUE_GE_3 abilities[30]→'技巧'
  - 空气催眠置零（好感/信赖 fix=0，unconscious_h==5 + 空气催眠位置）→ TODO：h-hypnosis
    空气模式存在但 air_hypnosis_position 字段未实现（h-hypnosis:230 门锁 TODO），依赖缺口非擅自简化
  - 体位系数（Sex_Position pleasure_coefficient/喜欢体位/子宫奸体位）→ B3 批次清单时做（已确认）
  - 新增 5 测试（眼罩/无觉/怀孕灌肠/苦痛转化/欲情素质）
  验收: npm run typecheck ✅ / npm run test 337 通过 ✅（34 文件）

第 5/7 项二次审查（2026-08-08，用户要求"完整准确"逐项核对）✅
  - 【审查发现·已补】extra_feel_settle（common_default.py:484-515）完全未实现：
    恭顺(顺从≥5)/先导(施虐≥5)/羞耻(露出≥5)/苦痛(受虐≥5) → 心理快感 max(10,final/20)×内层系数 + 心理经验(155)
  - 【审查发现·已补】攻略进度素质（:455-477）：正面状态 +fall×0.05 / 负面 -fall×0.2（fall=爱情/隶属系最高级，
    attr_calculation.py:891 get_character_fall_level）
  - 【审查发现·已补】系数 max(0) 钳制（:353/:479）——此前缺失
  - 【审查发现·已修】苦痛转化内层公式：原 tbl[施虐] 单系数 → sqrt(心理感度×受虐) + feel 附加修正
    + 内层连续减值 + 无意识门控（:242-245，ability=36 受虐非施虐）
  - 【审查发现·已修】settle_state 快感状态 abilityKey 死键：'皮肤' → PART_ABILITY 映射 '皮肤感度'
    （51~58 效果的 stateAbility 映射逐条核对全部正确：习得→技巧/恭顺→顺从/好意→亲密/欲情→欲望/快乐→快乐刻印）
  - 浮点误差行为与 erArk 一致（1-4×0.2 → floor=6，Python int() 同值）
  - 新增 5 测试（fall 修正 2/extra_feel 2/快感能力映射 1）
  验收: npm run typecheck ✅ / npm run test 342 通过 ✅（34 文件）

第 5/7 项三次审查（2026-08-08，settle_state 与 common_default.py:154-515 逐行并排）✅
  - 【审查发现·已修】连续减值的"基础指令跳过"是误读——erArk `last_instr in [0,1,2]` 为死代码
    （behavior_id 是字符串恒不匹配，character_behavior.py:127 + Behavior.py 全字符串）→
    一切指令（wait/move/rest）都参与衰减；删除 BASE_INSTRUCTIONS；HISTORY_MAX 8→10（erArk 10 条）
  - 【审查发现·已补】刻印状态专用系数表 get_mark_debuff_adjust（:374-378 + attr_calculation.py:581-598）：
    快乐/屈服/苦痛/恐怖/反感 5 状态 0→1 / 1→1.5 / 2→3 / ≥3→5（不是 ability_lv_adjust！）
  - 【审查发现·已补】dead 门控（:180-181/:548）——settle_state/settle_favorability/settle_trust 死亡不结算
  - 【审查发现·已补】数值上限：好感度 100000（character_handle.py:395/:403）、通用状态 99999（:249）
    进 SettlementContext.clampValue（信赖 300 已有）
  - 新增 4 测试（mark_debuff 3/dead 1；连续减值测试改为"一切指令衰减"）
  验收: npm run typecheck ✅ / npm run test 346 通过 ✅（34 文件）

第 5 轮审查（2026-08-08，实现代码/链路/静默错误角度）✅
  - 【审查发现·已修】激素维度错误：博士信息素（304-306）是**发起者**天赋（erArk calculation_favorability:737-741
    character_data.talent），此前在目标身上查 → 玩家激素修正静默失效 → favorability_adjusts 加 on="initiator"
    （数据化），calcFavorability/calcTrust 加 initiatorId 参数，settle_favorability/talk_add_adjust/settle_trust 传入 sourceId
  - 【审查发现·已修】h_experience 缺 canApply 门控：退缩时经验仍结算（与其他 settle_* 不一致）→ 补
  - 【链路确认】apiSystem 未注册错误消息含 namespace 名 → 群交查询 catch 条件正确（可选能力静默）
  - 【登记 TODO】退缩替代行为链（erArk handle_instruct.py:334-349：判定失败 → LOW/HIGH_OBSCENITY_ANUS/KISS_FAIL/
    DO_H_FAIL 替代行为，非中止）——当前"跳过全部效果"为近似；extra_feel 的经验 155 不计入 settlement 日志
  - 新增 3 测试（激素发起者 2/trust 门控 2）
  验收: npm run typecheck ✅ / npm run test 349 通过 ✅（34 文件）

chat 端到端审查（2026-08-08，用户要求以 chat 为例查完整性/链路/静默错误）✅
  - 【已修】talk_count 衰减挂载位置：erArk 挂整个行动循环（character_behavior.py:413），原实现只在
    chat_settle 内衰减（做别的行动不衰减）→ 抽 decayTalkCount（settle/talk.ts）挂 game:execution_start
    监听（h-core，读 gameContext.selectedCharacterId——bridge 同步链路）；chat_settle 只留分支+递增
  - 【已修】talk_add_adjust（501）缺 dead/时停门控：时停中 chat 时 21 被挡但 501 好感仍结算 → 补
    （与 settle_favorability 门控一致，时停中 chat 整体冻结：好感/好意/快乐/气力不变，仅经验+talk_count）
  - 【已修·测试盲区】测试 stub 的 engine.emit 为 no-op → execution_start/end 被吞（衰减/二段结算
    测不到）→ 三个测试文件改转发真实 eventBus（产品路径：bridge → gameContext.emit → eventBus 已确认）
  - 【审查发现·已修·真静默 bug】executeEffects 共享 execCtx：handlerCtx 的 Object.assign 会把上一个
    效果的 _targetIds 写进共享对象（嵌套链 target='self' 后）→ 后续无 target 效果读污染值结算到错误目标；
    且 execution_end 的 body_item_tick 调用传 _targetIds 但 resolveTarget 默认 'selected' → ids 恒空
    （H 中震动棒持续快感从未生效）→ 循环外缓存 initialTargetIds，无 target 效果优先用调用方初始值
  - 新增 2 测试（非聊天行动衰减 / 时停中 chat 冻结）；chat 测试 8 条 + chain-flow 真实事件路径
  验收: npm run typecheck ✅ / npm run test 349 通过 ✅（34 文件）

chat 边界审查（2026-08-08，第 6 轮：边界/盲区/测试隔离）✅
  - 新增 5 测试：失败链 talk_time 不更新（引用比较）/ 话术 1 门槛边界 / 连续 chat 联动
    （talk_time 更新后同小时不衰减）/ 衰减日回退安全 / 前提行为矩阵（无目标/体力1/疲劳200/时停/正常）
  - 【审查发现·测试隔离 bug】instruction-chat 的 resetChars 未重置 sp_flag——「时停 chat」测试设的
    unconscious_h=3 污染其后所有测试（成功链全挂，产品代码无 bug）→ resetChars 补全字段
    （sp_flag/dead/talents/hypnosis/body_items/h_state，对齐 settle-fidelity 的 resetNpc）
  - 期间多轮 debug 定位（事件 stub→门控→canApply→handler→loop 逐层排除），最终确认产品链路无 bug
  验收: npm run typecheck ✅ / npm run test 354 通过 ✅（34 文件，chat 13 条）

静默门控可观测化 + 测试公共基座（2026-08-08，用户担忧：门控 continue 静默跳过难排查）✅
  - 新增 src/utils/settle-gate.ts：isSettleGated(ch, context)——dead/时停统一门控，被跳过时
    console.debug(`[settle-gate] ...`)——门控不再黑箱，浏览器 console debug 级直接可见；
    settle_favorability/trust/talk_add_adjust/settle_state(dead) 全部接入（语义统一防遗漏/不一致）
  - 新增 src/utils/test-helpers.ts：共享测试基座——makeTestExecCtx（engine.emit 转发真实 eventBus）
    + resetCharacterEntity（全字段重置：base/abilities/talents/hypnosis/sp_flag/dead/body_items/
    h_state/experience/action_info）+ DEFAULT_NPC_BASE/DEFAULT_PLAYER_BASE；
    instruction-chat/settle-fidelity 已迁移，新指令测试直接复用（防"各写各的 reset 漏字段"复发）
  验收: npm run typecheck ✅ / npm run test 354 通过 ✅（34 文件）
  补：chain-flow 也迁移到基座；门控 debug 实测输出（时停 chat → [settle-gate] settle_favorability/talk_add_adjust 可见）；
  dev 冒烟干净（Vite ready，无 stderr）

前提"自己/目标"维度修复（2026-08-08，用户质疑：注册≠真实落实——审查盲区命中）✅
  - 【重大发现·已修】erArk 前提分"自己/目标"：无 T_ 前缀查自己（character_data = cache[character_id]），
    T_/TARGET_ 前缀查目标。原 handler 把玩家条件查到了目标上：
    NOT_H/IS_H（玩家**或**目标，handle_premise_other.py:1376/:1392）、TIRED_LE_84（玩家，:444）、
    HP_G_1（玩家，handle_self_not_tired）、TECHNIQUE_GE_3（自己，ability.py:1017）→ 全部修正为玩家维度
    （getPlayerChar helper：引擎指令仅玩家发起，自己=玩家；NPC 发起需扩展 ctx.sourceId）
  - 修复后 chat 前提完整语义：玩家（有目标/不在H/疲劳≤134/体力>1）+ 目标（可协同或监禁）
  - 新增前提维度测试（玩家在H/疲劳/体力 与目标同字段对比）
  - 【登记 TODO·B2 开工前】其余前提语义系统核对：FINGER/WAIST_TECHNIQUE（应自己）、HAVE_*物品
    （应自己）、NOW_CONDOM（应自己）、VIBRATOR_LEVEL_*（应自己）、high_*/HIGH_1（erArk HIGH_1
    恒 true 是权重前提，我们实现成参数等级=偏离）、premise-fall 数字键死键
  验收: npm run typecheck ✅ / npm run test 355 通过 ✅（34 文件）

复刻 skill 沉淀（2026-08-08，用户要求：把 chat 全部教训固化为稳定流程）✅
  - 新增 docs/skills/replicating-an-instruction.md：完整复刻一条指令的 6 阶段检查清单
    （取证/判定/前提语义对象/效果翻译/防静默验证/文档），含常见静默错误速查表
  - RED 基线 = chat 复刻全程真实失败记录（注册≠语义对/执行≠效果对/测试 stub 盲区/
    reset 漏字段/浮点误差/被砍内容补回）
  - 已注册到 AGENTS.md 必读清单 + migration-workflow §13 索引
  - GREEN 验证：下一指令 stroke 按此 skill 试运行（验证是否避免同类错误）

口上系统完整复刻（2026-08-08，spec: docs/superpowers/specs/2026-08-08-talk-system-replication-design.md）✅
  - T1 权重系统：premiseRegistry.getWeight（high_N→N + 满足前提数 + 淘汰 + 空集1）；口上 weight 字段
    （固定权重优先）；triggerScene 同池竞争（scene+character 合并，专属×10，权重区间随机）；high_N 前提
    修复（原误用"参数等级≥N"）
  - T2 CVP 静态转换补全：premiseRegistry **大小写不敏感**（重大修复——迁移数据小写前提 vs 注册大写
    导致 talk-common 条件静默失效）；getFallLevel 死键修复（数字键→按名查思慕→奴隶）；FALL_LEVEL
    全组合注册（cmp×-4..4）；NE 运算符补丁；47 个未注册前提补齐（12 可判 + 35 恒 false + TODO）；
    condition-registry 补 player.abilities.level/player.talents/body_semen 路径；尿道属性补定义；
    全量数据校验测试（可解析/前提全注册/表达式可校验——静默失效变可检测）
  - T3 行为地文：getBehaviorText（A + B1∪B2 + C1∪C2 三段组合、动作段换行，erArk part 分组确认）；
    混合率（hConfig talk.common_mix_rate 默认30）+ **weight≥100 不替换保护**（erArk talk.py:246）；
    无口上时行为地文兜底
  - T4 版本化口上：行 version + 实体 character_text_version（0=不启用）
  - T5 无意识屏蔽：时停目标只出 unconscious 前提口上（场景通用无条件也淘汰，erArk :224-237）
  - T6 特殊情境加权：hConfig [[talk.situations]] 数据化（9 类默认 ×5，mod 可覆盖）
  - 新增测试 12 个（权重 4/竞争 4/行为地文 4/版本 1/无意识 1/情境 1）
  验收: npm run typecheck ✅ / npm run test 373 通过 ✅（37 文件）/ dev 冒烟干净

口上系统第 7 轮审查（2026-08-08，T1-T6 实现逐项核对 erArk）✅
  - 【已修·真 bug】hConfig 情境配置拼写错误：self_time_stop_orgasm_relaese（多 e）——
    erArk 值实际为 relase（SELF_TIME_STOP_ORGASM_RELAESE = "self_time_stop_orgasm_relase"）→
    时停解放情境的 self 前提永不匹配（静默）→ 已改
  - 【已修】getWeight 的 high_ 判断用原串——大写输入（HIGH_5）时权重语义丢失 → 改 lower 判断
  - 【已修·真简化】talk-common 地文条目均匀随机（pickEntry/getBehaviorText）——erArk 是
    get_weight_from_premise_dict 权重区间随机（high_N 生效）→ weightedCandidates 加权随机
  - 【核对通过】情境加权顺序（基础→专属×10→情境×5，固定权重也乘）；erArk 9 类集合照抄
    （含 SELF_NOT_PLAYER_DAUGHTER 等原版成员）；版本过滤仅角色层；无意识子串检查为近似（登记）
  - 偶发 vitest 4 skipped（pool 调度，DEPRECATED poolOptions 警告）——重跑稳定，登记观察
  验收: npm run typecheck ✅ / npm run test 373 通过 ✅（37 文件）

口上系统第 8 轮审查（2026-08-08，按计划逐项核对 + 查漏/重复/静默）✅
  - 【计划交付点·漏项已补】T3"短词池合并 common_s"（erArk talk.py:662-665）：_s 短词且非
    penis/hair → A 段候选并入 common_s 的 A 段——此前未实现
  - 【计划交付点·漏项已补】T5"talk_common 无意识处理"（erArk :683-687）：动作类地文在目标
    无意识（unconscious_h>=1）且条件无 unconscious 前提时淘汰；部位类跳过无意识检查——此前未实现
  - 【重复实现已消除】权重区间随机两处重复（dialogue pickWeightedLine / talk-common pickEntry+
    getBehaviorText）→ 抽 src/utils/weighted-random.ts 共用
  - 【核对通过】各 phase 与计划一致；无跨层违规；无其他重复造轮子；try/catch 无吞错
  - 新增测试 2 个（common_s 合并 / 无意识过滤——测试环境补注册 high_1/FALL_LEVEL 前提）
  验收: npm run typecheck ✅ / npm run test 375 通过 ✅（37 文件）

📌 待办登记（2026-08-08，口上系统相关）：
  - 【TODO·B3】口球屏蔽：triggerScene 目标口球时屏蔽口上（除口球相关行为）——
    erArk get_weight_from_premise_dict:239-244（self_now_gag/target_now_gag 且行为不在 GAG 集）
    → 依赖 B3 口球系统（body_item slot 14 = gag 已有）落地时补
  - 【TODO·提醒导入】erArk 新增地文模块（子宫高潮等）：用户从 erArk 更新 talk_common 后，
    按 docs/talk-common-system.md「导入 erArk 新增地文模块」流程导入（重跑转换脚本 →
    校验测试全量验证 → 未注册前提按 T2 模式补齐 → 重启 dev）。新模块不涉及去重（纯新增）

erArk 新地文增量导入（2026-08-08，62 个新模块文件）✅
  - 新增：a/b/c/m_orgasm（肛/胸/阴蒂/口绝顶 4 档）×A/B2/C2 + w_orgasm（子宫 3 档）+
    v_orgasm_super + body/clitoris + body_part/clitoris_s；eat 按用户已砍排除
  - 脚本加 --incremental（跳过已存在输出文件）；补 STATUS_MAP（阴蒂/阴茎）+ TALENT_MAP
    （泌乳/小臀/普臀/巨臀/羞耻）——修复新 CVP 的静态转换
  - 【注意·用户需知晓】v_orgasm_normal/small/strong（9 个已跟踪文件）被 erArk 源更新：
    条目 175→457、{Name}→{target.name} 变量修正——本次已重转为新版（git diff 可审计），
    如需回滚：git checkout -- <文件>
  - vitest.config 补 hookTimeout 60s（数据量翻倍致加载超默认 10s → 测试文件整体 skipped）
  - 校验测试全绿 + 新模块验证测试（w_orgasm 组合/clitoris 部位短词）
  验收: npm run typecheck ✅ / npm run test 376 通过 ✅（37 文件）/ dev 冒烟干净

chat/口上系统专项验证 + 全部修复（2026-08-08，用户要求验证两部分的 bug/静默错误与架构）✅
  基线：typecheck ✅ / test 376 通过（37 文件）——架构三层分离 ✅ / 无跨插件 import ✅ / 测试数值断言扎实
  【已修·真 bug】混合率路径行为地文未插值：dialogue-system 混合率命中时 {penis}/{target.name}
    原样输出叙事日志（fallback 路径有 interpolateLine，混合率路径漏了）→ 补插值 + 测试断言无占位符
  【已修·真 bug】TARGET_NOW_SEX_TOY_* 语义错误（premise-instruct.ts）：WEAK 误为 1-3（应 ==1）、
    STRONG 误为 >=4（vibrator_set 上限 3 → 恒 false 死键，应 ==3）、MIDDLE 缺失（应 ==2）
    ——对照 handle_premise_H.py:3206/3229/3241；新增 premise-instruct.test.ts 行为矩阵
  【已修·真 bug】射精/精液前提恒 false：PL_EJA_POINT_*/PL_SEMEN_*/PL_PENIS_* 原注册恒 false →
    penis 短词池（240 条）全部不可达，行为地文 {penis} 永远原样显示（静默失效）→ 按 erArk
    handle_premise_H.py:1448-1664 补真实语义（射精欲阈值 ≤600/>600、精液量+额外精液量阈值）；
    h-ejaculation pl_penis_semen_dirty/not 硬编码角色 '0'（引擎玩家 id 实际为 'player'）→ 改
    gameContext player id
  【已修·架构不一致】刻印能力双轨分裂：h-mark 写 mark_{id} 数字键，settle_state/calcJudge/
    h-bondage/h-hypnosis 读按名键（'快乐刻印'）→ 刻印升级对判定修正/状态系数静默失效 → 统一按名键
    （h-mark 写按名 + calcFavorability/calcTrust 改按名读）；新增 h-mark.test.ts（4 测试）
  【已修·违反铁律简化】talk_add_adjust（501）只算 floor((tc+30)×adjust)——erArk 走完整
    base_chara_state_common_settle/favorability_common_settle（tenths_add/连续减值/素质/攻略）→
    提取 settleOneState 共用管线 + 501 补全（ability_level = 发起者话术，快乐用 mark_debuff_adjust）；
    顺带修正催眠敏感范围（仅快感+欲情 +2，原全状态 +2 与 erArk 不符）；
    chat 测试断言更新：话术0 好意/快乐 70→73、话术5 好意 98→101
  【已修·注释误导】501 "仅玩家→NPC" 是误读——erArk 是"任一方为玩家即结算"（NPC→玩家也结算）→
    h-core 注释 + batch-01-daily §1.5/§1.6 + mod-author-guide 参数协议同步修正
  验收：npm run typecheck ✅ / npm run test 382 通过 ✅（39 文件：新增 premise-instruct + h-mark）
  📌 待办登记：旧存档 mark_{id} 键成为孤儿（pre-release 可接受，随存档迁移机制处理）；
    chat_settle 嵌套 execute 的 ctx 传播契约建议固化到 mod-author-guide（已记录语义，参数表待补）

erArk 高潮结算更新对齐（2026-08-08，用户提示 erArk 三处改进：orgasm_settle 独立文件/同部位只显示最高程度/退出 H 释放寸止）✅
  - 【无需改】orgasm_settle 独立文件——纯 erArk 内部重构（延迟导入解循环依赖），我们已是独立 settle/orgasm.ts
  - 【已改·roll_count 压缩】解放状态（orgasm_edge==2/3 或 time_stop_release）climax>=3 → 0 次普通 roll + 1 次超强绝顶；
    1-2 → 1 次；非解放 → 每次一条（原解放时按 climaxCount 条输出——静默多输出）
  - 【已改·releaseOrgasmEdge】新增（对齐 erArk release_orgasm_edge_now，orgasm_settle.py:333-355）：
    endHScene 清 h_state 前对所有 is_h 角色释放寸止累计（orgasm_edge_count → 真实高潮结算 + 事件 + 日志），
    原实现直接清 h_state 静默丢弃；单人/群交退出全覆盖
  - 【已改·releaseTimeStopOrgasm】新增（对齐 TIME_STOP_ORGASM_RELEASE，default.py:6764-6800）：
    h-time-stop time_stop_off 原只输出日志无数值（时停累计静默丢弃）→ 经 effect 通道
    （release_time_stop_orgasm effect，跨插件禁直接 import）转成真实结算
  - 【已改·judgeOrgasmEdgeSuccess】失败率 0.2→0.15 + 补多部位幂修正 success^max(1,k/2)（orgasm_settle.py:423-426）
  - 【已改·寸止计数归属】判定/累计用被结算角色自己的 orgasm_edge_count（原误用玩家——erArk candidate =
    自己累计 + 本次全部部位高潮数，crossed = 本次高潮部位数）
  - 【已改·口上聚合】handleOrgasmResults 日志按部位取最高程度显示一条（erArk orgasm_settle_flag 去重），
    h:orgasm 事件逐条保留（数值消费方）
  - 【发现并修复·既有 bug】eventBus.emit 防重入保护（emitting 集合）→ handleOrgasmResults 同步连发 3 次
    h:orgasm 只发 1 条（h-hidden 发现度/h-time-stop 累计静默少算）→ 改 async 逐条 await
   - 新增 12 测试 src/plugins/orgasm-release.test.ts（roll_count 压缩 5/释放 3/时停释放 2/幂修正 1/聚合 1）
  - phase-h 寸止失败测试同步修正（计数归属自己 + 0.15 边界）
  验收: npm run typecheck ✅ / npm run test 394 通过 ✅（40 文件，连跑 2 次稳定）/ dev 冒烟干净
  📌 待办登记：寸止行为口上（{part}_orgasm_edge）与 extra_orgasm 口上尚未接入（B3 H UI）；
    orgasm_edge_off 仍是旧语义置 0（erArk 新增 ORGASM_EDGE_RELEASE 为独立 effect，B3 指令化时接）

高潮结算对齐二次审查（2026-08-08，用户要求审查准确性/完整性/对接）✅
  - 【已修·寸止判定快照】判定移主循环前一次（erArk 结构）——原逐部位判定：后续部位 candidate 含前部位
    刚写入计数，与 erArk 快照语义不一致（超限边界的失败概率偏差）
  - 【已修·失败重结算】只传累计寸止+本次 un_count（原把本次 normal 也传入 → orgasm_level 多计；
    erArk 失败时本次 normal 丢弃，下次结算补算等级差）；结算后清空计数（原残留 →
    退出 H 时 releaseOrgasmEdge 二次释放 = 双倍结算）
  - 【已修·技巧等级读法】寸止判定技巧等级原用 getEntityAttr（返回 abilities 的 {level,xp} 对象 →
    恒 0，判定静默偏差）→ 改按名读 .level
  - 【已修·既有缺口】h_state.orgasm_count 从无写入 → h-mark 快乐刻印升级条件与 h-group-sex
    结束奖励（体力上限+2/次等）静默失效 → settleOrgasm 每次真实高潮 [0]/[1] +1（B绝顶喷乳不计入，
    erArk 独立行为 b_orgasm_to_milk）
  - 新增 3 测试（寸止成功快照/orgasm_count 写入/喷乳不计数）；phase-h 寸止失败测试加强
    （orgasms 1 条 degree 2 + 计数清 0 + orgasm_level 不更新）
  验收: npm run typecheck ✅ / npm run test 397 通过 ✅（40 文件，连跑 2 次稳定）/ dev 冒烟干净
  📌 待办登记：单人退出 H 的绝顶奖励（erArk H_END 体力上限+2/气力上限+3/精液上限，default.py:6819-6855）
    未实现（h-group-sex 仅有群交版 group_sex_end_add_hpmp_max；orgasm_count 数据源已修复，B3 指令化时接）；
    时停解放的 settle_unconscious_semen_and_cloth（精液/衣服结算）未对接（依赖 h-ejaculation 扩展）

高潮结算第三轮审查（2026-08-08，数值语义/生命周期/静默错误）✅
  - 【核对通过】judgeOrgasmDegree 概率表 3 档 [0.98,0.02,0] 与 erArk 逐行一致；getStatusLevel 阈值数组
    与 Character_State_Level.csv（level 0-10 → max 0/100/500/1000/2500/6000/12000/30000/50000/75000/100000）
    一致（含 2500 → level 4 的边界语义）；extra 阈值 20000×0.9^n 一致
  - 【已修·静默偏差】extra 分支：preData>=10 且 extraAdd=0 时，原实现回落"当前等级-记录等级"
    → 10 级后快感续涨但未到 extra 阈值时错误触发普通高潮；erArk normal = extra_add（无条件覆盖）
    → 改 else 分支（extra 分支独占）
  - 【已修·生命周期残留】time_stop_release 置 true 后永不重置 → 时停解除后 H 内后续所有高潮全走
    解放路径（roll 压缩/超强，静默偏差）→ h-core execution_start 监听对 H 中角色重置 false
    （对齐 erArk handle_npc_ai_in_h.py:99"NPC 每次行动开始重置"；时停解除指令同一次行动内先
    release 后结算的顺序不受影响）
  -   新增 4 测试（extra=0 无高潮/extra 达阈值 1 条/time_stop_release 行动重置/寸止成功快照计数）
  验收: npm run typecheck ✅ / npm run test 400 通过 ✅（40 文件，连跑 2 次稳定）
  📌 待办登记：时停中退出 H 的边缘（releaseOrgasmEdge 时停分支会把寸止计数并入 time_stop_orgasm_count，
    随后 h_state 清理丢失——erArk 时停中不判定寸止故无此路径，B3 时停指令化时一并核对）；
    玩家射精的 p_orgasm 绝顶行为（erArk orgasm_judge 射精分支 p_orgasm_small/normal/strong，
    eja_climax 已有忍耐判定，绝顶计数未接入）

高潮结算第四轮审查（2026-08-08，经验链/刻印升级/射精判定——orgasm_count 激活后的消费方）✅
  - 【已修·静默失效】绝顶经验从无写入（erArk ADD_1_XClimax_EXPERIENCE：部位累计 10-17/156/158 +
    总累计 20；无意识/时停解放（非玩家）时 type2 额外转 78）→ settleOrgasm recordOrgasmCount 补写
    ——h-mark 无觉刻印（exp78）与 talk-common 绝顶经验条件（experience.N）此前恒 0
  - 【已修·静默失效】h-mark getCumulativeValue 读 experience['orgasm_total']/['unconscious_orgasm']
    （无人写入 → 恒 0）：快乐刻印累计分支改读 orgasm_count[state][1] 合计（erArk all_happy_count）；
    无觉刻印累计改读 experience['78']（erArk all = exp 78）；无觉单次分支删除恒 0 的 TODO 实现
    （改用 orgasm_count[0] 合计，erArk 同）；无觉升级补无意识门（erArk mark_effect 整个无觉块被
    handle_unconscious_flag_ge_1 包裹）
  - 【已修·静默偏差】玩家射精判定缺"无精液高潮"分支：精液量+额外 ≤ 2ml → erArk p_no_semen_climax
    （绝顶不射精：射精欲归零 + 忍耐计数清零）→ 原实现直接 shouldEjaculate（精液 0 也走射精链路）
  - 【核对通过】h-mark 刻印升级数值 vs Mark_Up.csv：屈服 30000/50000/100000、苦痛与恐怖 20000/40000/80000、
    反发 10000/30000/80000 全部一致；快乐/无觉硬编码条件（2/5、8/20、16/50、100、200、500）与
    mark_effect 逐行一致；经验映射（0-7→10-17、21→156、23→158）与 Second_effect 一致
  - 新增 6 测试（h-mark 快乐累计/无觉 exp78/无意识门/无觉单次 + phase-h 无精液高潮 + 原射精测试补精液量）
  验收: npm run typecheck ✅ / npm run test 404 通过 ✅（40 文件，连跑 2 次稳定）
  📌 待办登记：无精液高潮的行为口上（p_no_semen_climax）与射精绝顶 p_orgasm 口上/计数（B3 H UI）

erArk 指令前提自动化更新对齐（2026-08-08，InstructConfig.csv 新增 h_mode_show_type/tired_type 两列）✅
  - 【机制理解】erArk handle_instruct.py:134-152 按类型运行时自动注入前提：
    h_mode_show_type=1（非H显示）→ NOT_H + NOT_SHOW_NON_H_IN_HIDDEN_SEX；=2（仅H内）→ TARGET_IS_H；
    tired_type=1（低疲劳）→ TIRED_LE_84 + HP_G_1 + DRUNK_LEVEL_NOT_3；=2（特定疲劳）→ TIRED_LE_74 +
    HP_G_1 + DRUNK_LEVEL_NOT_3。新 CSV premise_set 已精简（chat 仅剩 2 个显式前提）
  - 【对齐决策】不学运行时注入（我们 TOML 显式 premises 更透明、mod 可覆盖）→ 迁移时静态展开：
    SOP §4 新增 4.1「自动注入前提展开」规则；批次清单 §2 更新展开映射
  - 【已注册 3 新前提（premise-h.ts）】TIRED_LE_74（疲劳≤118，erArk :405）、
    NOT_SHOW_NON_H_IN_HIDDEN_SEX（隐奸全局开关取反，未实装 → 恒 true = erArk 默认值 + TODO）、
    DRUNK_LEVEL_NOT_3（醉酒等级≠3，醉酒系统未实装 → 恒 true = 语义正确降级 + TODO）
  - 【已更新】chat(1004) TOML premises 补 NOT_SHOW_NON_H_IN_HIDDEN_SEX + DRUNK_LEVEL_NOT_3
    （h_mode_show_type=1 + tired_type=1 展开）；batch-01-daily §1.3/§2 同步
  - 【登记待批次】TARGET_IS_H 未注册（h_mode_show_type=2 的 H 内指令迁移时注册）
  - 新增 1 测试（TIRED_LE_74 边界 118/119 + 新前提恒 true）
  验收: npm run typecheck ✅ / npm run test 405 通过 ✅（40 文件，连跑 2 次稳定）

erArk 前提自动化承接机制（2026-08-08，架构决策：不学运行时注入，显式展开 + 追溯字段 + 完整性校验）✅
  - 【决策】erArk"类型字段→运行时注入前提"（handle_instruct.py:134-152）不学——TOML 显式 premises
    更透明（可审计/可测试/mod 可覆盖）；静态展开语义等价
  - 【已加·追溯字段】HInstruction 扩展 erark_h_mode_show_type/erark_tired_type（迁移期字段，
    与 erark_id 同生命周期，全部批次完成后删除）——chat 已填；未来 diff CSV 可精确定位类型值变化
  - 【已加·完整性校验】validateInstructionData 新增 validateAutoInjectedPremises：带迁移字段的指令
    按 AUTO_INJECTED_PREMISES 映射（SOP §4.1）核对 premises 是否包含应展开前提，缺漏 → warning
    （防止 erArk 更新注入集合后已迁移指令漏补——chat 曾漏 NOT_SHOW/DRUNK）
  - 新增 1 测试（缺展开前提 → warning；chat 齐全无 warning）
  验收: npm run typecheck ✅ / npm run test 406 通过 ✅（40 文件）

绝顶附加状态实现（2026-08-08，erArk 二段行为效果——统一通用结算对齐）✅
  - 【背景】erArk 更新"二段结算状态效果统一调 base_chara_state_common_settle"——我们无单独数值
    结算代码（纯 erArk 内部重构，零直接影响）；但暴露既有缺口：43 个绝顶行为（8 部位×4 程度+射精）
    的效果链我们只实现了经验/计数（210），润滑/体力/气力/欲情/快乐/苦痛反感减完全缺失
  - 【架构重构】settleOneState 及辅助（PART_ABILITY/getFeelExtraAdjust/getFallLevel/mark_debuff/
    settleInnerMind/extra_feel）从 h-core/index.ts 闭包抽到独立模块 settle/state-settle.ts——
    settle_state/talk_add_adjust/绝顶附加状态三处共用同一管线（禁止重复实现）；
    settleOneState 新增 tenthsAdd 参数（erArk 绝顶附加 middle 档 True、small/large False）+
    settlement 可选（无结算记录时直接改 base，clamp 0-99999）
  - 【已实现】settleOrgasmSideEffects：按程度档映射（ORGASM_SIDE_EFFECTS）结算
    润滑 300/300/900/3000（无能力系数）、体力 10分/20分deg1、气力 20分/25分deg1/30分deg2、
    欲情 20(tF)/100(tT)/100(tT)/1000(tF)（能力=欲望）、快乐同构（能力=快乐刻印）、
    苦痛/反感递减（-50-cur/10、-500-cur/5、-2000-cur/3，能力=苦痛/反发刻印）
  - 【作用对象】部位绝顶附加作用于绝顶者自己（erArk 同）；p_orgasm 射精的 TARGET_润滑/
    射精位置重置/CVE 精液经验 → B3 射精链路 TODO
  - 【不做】隐奸暴露（h:orgasm 事件已等价接入 h-hidden）、蓄能（人力发电已砍）
  - 【登记 TODO】群交系数（isGroupSex 需异步查，settleOrgasm 同步——B3 群交核对）；
    附加状态无 settlement 时直接改 base（结算显示 B3 接入）
  - 新增 5 测试（small/normal/super 档数值 + middle tenths + 润滑无系数/欲情吃等级）
  验收: npm run typecheck ✅ / npm run test 411 通过 ✅（40 文件，连跑 2 次稳定）

隐奸/露出持续快感 + 他人存在判定修正（2026-08-08，erArk realtime_settle + instuct_judege 完整对齐）✅
  - 【架构】settleOneState 新增 extraAdjust 参数（erArk extra_adjust 系数，加法进 final_adjust）；
    h-core API 暴露 settleState（其他插件经 API 调统一管线——遵守"插件间禁止直接 import"铁律）
  - 【已修·静默失效】h-hidden applyHiddenSexTick 重写（统一管线）：
    ① '心理快感' 死键（正确键 '心理'——心理快感从不上涨到可读键）
    ② 补外层条件：场景人数>2 且 周围有清醒未睡他人（unconscious_h===0 近似）
    ③ 补露出块（exhibitionism_sex_mode ≥1 → 羞耻/心理 ×3 × min(他人×0.1,2)）——原完全缺失
    ④ 补素质/fall/连续减值/max(0) 钳制（原直接改 base 缺全部）
    ⑤ 修正误解注释（sqrt(ability[16])——state 16 羞耻走 base 分支无 sqrt，ability_level=露出34）
  - 【已修·监听器门槛】execution_end 监听原 `if (mode < 1) continue` 跳过露出角色 → 露出块永不触发
  - 【已实现·他人存在判定修正】judge.ts calcJudge 第 8 项（instuct_judege.py:247-260）：
    场景>2 且目标意识正常 → 群交/隐奸 60+60n、S 类 40+40n、其余 25+25n × (ability_lv_adjust[露出]-1.6)；
    V 类（访客）外层条件恒满足（访客系统已砍）
  - 【数值核对】50×4.1 = 204.999... → floor/int 204——JS/Python 同为 IEEE 754，与 erArk int() 一致
  - 新增 9 测试（隐奸 3 档 + 露出 + 人数条件 + 他人修正 4 项）
  验收: npm run typecheck ✅ / npm run test 420 通过 ✅（40 文件，连跑 2 次稳定）/ dev 冒烟干净
  📌 待办登记：realtime_settle 其余块（群交/内衣/女儿/灌肠/捆绑/初H 持续快感）随各自系统落地；
    周围清醒他人检查的完整状态语义（睡眠/催眠）随 L1.7 细化

隐奸暴露对象修正 + 审查（2026-08-08，暴露值/成就挂玩家——erArk character_id=0 语义）✅
  - 【已修】h:orgasm 监听：暴露值/发现度结算对象从绝顶者改为玩家（隐奸发起方）——
    触发条件保持"绝顶者 mode≥1"（玩家发起隐奸中等价），多人隐奸/NPC 发起场景语义正确
  - 【已修·连带】成就记录对象：hidden_sex_record[4]（绝顶）/[3]（射精）原记绝顶者（NPC）→
    成就 912/913"隐藏方绝顶≥3"永不满足（静默）→ 改挂玩家
  - 【文档】plugin-author-guide.md h-core API 表补 settleState（铁律：新增 API 同步文档）
  - 【测试】新增隐奸绝顶暴露测试（暴露值/成就挂玩家 + NPC 不受影响）
  验收: npm run typecheck ✅ / npm run test 421 通过 ✅（40 文件）

隐奸/露出最终审查（2026-08-08，跨地点计数/静默路径/稳定性）✅
  - 【已修·跨地点多算】settleHiddenValue 的他人计数原 getAll().length（全角色含其他地点）
    → 改同地点过滤（erArk get_chara_now_scene_all_chara_id_list 同场景语义）
  - 【已修·跨地点目标】settleDiscovered 找隐奸目标原未过滤地点 → 改同地点
    （erArk get_hidden_sex_targets 同场景）
  - 【已修·静默路径】settleState API 无效 charId 原静默 return → 加 errorReporter warning
    （铁律：禁止静默失败）
  - 【核对通过】applyHiddenSexTick 连续减值语义（NPC 吃 continuous、玩家不吃）、
    hasConsciousOthers 含玩家、他人存在修正 S 类判断顺序/露出负修正边界、
    settleOneState extraAdjust 默认 0 不影响既有调用、h:shoot 成就对象（玩家）
  验收: npm run typecheck ✅ / npm run test 421 通过 ✅（40 文件，连跑 2 次稳定）/ dev 冒烟干净

erArk 新地文导入补漏（2026-08-08，T9）✅
  - 【发现·修复】action_B1_penis_in_hair.toml 全文件损坏（340 条 context 含 U+FFFD）——
    旧转换的历史编码问题（CSV 源现已干净）→ 重转修复（parse OK、0 U+FFFD）
  - 【升级】talk-common-data 校验测试：轻量解析（只提取 conditions 行）→ **完整 parseTOML**
    ——description/context 损坏的文件不再静默通过（loadTomlDir 的 catch 静默跳过变可检测）
  - 【处理】重转引入 1 个 Dirty CVP（CVP_A2_Dirty|B0_G_1，精液污染，hair 地文）→ 恒 false + TODO
    （依赖 h-ejaculation 精液系统）；eat 反复生成 → 脚本跳过 eat 文件名
  - 【vitest.config】poolOptions 为 vitest 4 已移除 API（DEPRECATED 警告，运行时兼容）——
    LSP 报错但不影响 typecheck（vue-tsc 不检查该文件），登记观察
  - 【数据规模实测】talk-common 全量：165 文件 / 202,181 条 / 完整 parse ~1.7s（Node）；
    游戏启动同 erArk 全量加载（无超时概念，dev 下 165 个 ?raw 请求是主要延迟 ~2-5s，
    生产打包后快）。【可选优化·登记】若 dev 首屏慢 → 懒解析（parse 延后到首次访问
    variable）+ dev 请求聚合；先保持现状（与 erArk 一致）
  验收: npm run typecheck ✅ / npm run test 376 通过 ✅（37 文件，连续 3 次稳定）
  - 【TODO·L1.7】睡眠完整语义（无意识口上屏蔽的 sleep 分支、T_UNCONSCIOUS_FLAG_1 等前提）
  - 【TODO·随系统】35 个恒 false 前提（隐奸/露出/群交/监禁/助手/女儿/首次/时停解放/精液）补语义；
    行为地文 daily 数据（erArk 侧新增未构建）

激素/信息素纠正（2026-08-08，用户指出——擅自加入了被砍的世界观内容）✅
  - 【用户发现·已撤销】博士信息素（304-306）属**信息素系统**（方舟世界观专属），粗筛明确砍掉
    （master-list:543"含原砍掉的 46 条：…激素…"；4111/4112 hormone_on/off 延后）——
    第 2 批时我见 talents.toml 缺失就擅自补了 3 个定义+修正，第 5 轮又在错误基础上深化（on="initiator"）
  - 已全部撤销：talents.toml 删 3 定义；talent-adjust.ts 删 on 机制；calcFavorability/calcTrust 恢复单参数；
    调用点恢复；删 2 个激素测试。talents.toml 现仅含给既有天赋的修正字段，零新增定义
  - 教训登记：粗筛 master-list 是"砍掉/延后"的权威依据，补任何 erArk 数据前必须先查 master-list
  验收: npm run typecheck ✅ / npm run test 347 通过 ✅（34 文件）

已知缺口（登记 TODO，批末一并处理）:
  - settle_state/settle_favorability 缺 erArk 的 tenths_add、连续指令减值、无意识门控、系统难度/信物修正（引擎既有近似）
  - resolveValue 不支持 quest.*/inventory.* 根路径（注册表里有、求值恒为 0/false 静默）——
    需 gameContext 暴露 quests/inventory 上下文后接入
  - 可用条件属性手册.md 生成（conditionRegistry.generateManual 已有实现）未接线——
    浏览器端无法写文件系统，需 dev 工具/脚本方案
  - plugin-manager 用 console.warn（铁律要求 errorReporter）——既有代码，随批收敛

下一步: B1 剩余 23 条（用户筛选 → 逐条复刻，SOP 每批工作流）
  → 每条约 30 分钟分析+实现；sleep 特殊耗时（跨天跳转）L1.7 处理
```

### 已完成（此前会话）
```
L2.11 三项缺口全部完成 ✅
  - 群交HP修正: hp-mp.ts 重写 + settle_hp_mp effect注册
  - 精液吸收: calcSemenAbsorb + penis_dirty_dict + H中tick吸收
  - 精液污染追踪: pl_penis_semen_dirty/not 前提注册 + 40处TOML转换

根因修复: condition.ts selected 路径实现 ✅
  - GameContext 加 selectedCharacterId
  - resolveValue selected stub → 真实实体解析
  - 数组数字索引支持 + talk-common parseConditions 双前缀bug修复

jj_0~3 阴茎大小前提 ✅
  - attributes.toml 加 "阴茎大小" + actorId入premiseCtx

饥饿系统: hunger-system 插件 ✅
  - eat_food effect + 自动增长 + 消化CD + NPC口粮 + h-config配置化

L2.9 Scene/Event 系统 ✅
  - events/统一加载 + start_scene effect + scene step(嵌套)
  - dialogue-system 触发拦截 + completedScenes 存档持久化
  - ConversationRef 重构: 4种type(character/global/quest/event) + speaker 解耦
  - 内联 dialogue 支持 (lines 字段)
  - 文档重写至 600+ 行

TODO(依赖其他系统):
  - 爱情旅馆/他人存在/助理/体位/处女/时停 +9999（calcJudge 缺）
  - 目标榨精 ability[77] + 精液存量检查
  - 食物获取方式(商店/烹饪/采集)
```

### 待做优先级

```
1. L2.10 Combat 系统缺口（5项）
2. L2.11 剩余: 被发现面板(UI) + 食物获取方式
3. 地图系统重构（三层分离 + 工具）：
   - 引擎侧: `docs/plans/map-system-rework.md` Phase 1
   - 工具侧: `docs/tools/map-editor-design.md` Phase 2 + 3
4. 移动/离开 effect（`move_to`、`npc_leave`——场景剧情中控制角色位置）
5. L1.7 睡眠/昼寝/就寝指令
5. L1.9 {{input}} 文本框语法
6. L1.6 指令复刻（前置改动 ✅，下一步：B1 批次清单 → 用户筛选 → 逐条 TOML）
7. 侧栏面板：特质页签/个人情报/日志统计/作弊
```

### calcJudge 完整公式（erArk精确复刻）

```
实行值 = 基准需求 + 以下各项修正：

1. 好感修正: 好感度查阈值表[0,100,500,1000,2500,5000,10000,50000,100000]
   → 加值[0,10,25,50,75,100,150,225,300]
   信赖修正: 信赖度查阈值表[0,25,50,75,100,150,200,250,300]
   → 加值[0,25,50,75,100,150,200,300,500]

2. 状态修正(欲情+快乐)×5 + (恭顺+屈服)×10 - (羞耻+抑郁)×5 - (苦痛+恐怖+反感)×10
   等级阈值[0,100,500,1000,2500,6000,12000,30000,50000,75000,100000]

3. 能力修正: 亲密×10 + 欲望×5

4. 刻印修正: 快乐×50 + 屈服×50 + 苦痛×10 + 无觉×25
   - min(恐怖-时姦,0)×50 - 反发×100

5. 心情修正: get_angry_level(愤怒)×20
   愤怒≤5→1, ≤30→0, ≤50→-1, >50→-3

6. 陷落修正: 思慕30+恋慕50+恋人80+爱侣100+屈从30+驯服50+宠物80+奴隶100

7. 天赋个性: 淫乱+50, 性好奇+30, 性冷漠-30, 性无知+100,
   讨厌男性-30, 底线-100, 持有把柄+100, 被持有把柄-100, 女儿+100

★ 待实现（依赖其他系统）:
   爱情旅馆+25/50/100 | 他人存在+露出修正 | 助理助攻+50
   体位喜欢+30 | 处女-250/-350 | 监禁/睡眠/时停+9999
```

### talk-common 转换状态

```
全部CVP码已转换为条件表达式。剩余的CVP:
  CVP_A2_Dirty|B0_G_1 → 40条(精液污染，需精液追踪系统)
  
VAR_MAP已处理:
  博士→{player.name}(1005) | 手机→书本(36) | 罗德岛→移除(3)
  兽耳→耳朵(3) | 电脑→书本(1) | 咖啡→茶(2)
  尾巴→腰身/双腿缠绕/臀部等(50+)
  信息素→荷尔蒙(1)
  
待手动处理: 电视×6处
```

### 插件默认数据体系

```
h-core/data/default/ 提供全套 erArk 标准数据:
  attributes.toml    → 纯数值(体力/好感度/日重置参数)
  abilities.toml     → 带等级的能力(感觉/ABL/刻印/性技术)
  talents.toml       → 176条通用天赋(排除方舟世界观绑定)
  equipment.toml     → 9个基础装备槽
  status-effects.toml → 中毒/醉意等通用状态
  relations.toml     → 好感度关系类型
  bondage/types.toml → 16种捆绑类型
  h-config.toml      → settle_state ability_level 映射表

三层优先级: Layer1(插件默认) → Layer2(mod插件) → Layer3(mod定义)
加载: loadMerged deepMerge + expandCharacterAbilities + initializeTalents
```
> - **L2 细节层**：系统内的具体功能点
> - **L3 推迟池**：已明确设计但当前不做的

---

## 参考文档索引

| 文档 | 位置 | 阶段 | 说明 |
|------|------|------|------|
| AGENTS.md | 根目录 | — | **最高文档**，所有铁律的源头 |
| map-editor-design.md | docs/tools/ | P1 | 可视化地图编辑器完整设计（技术栈、功能、数据格式） |
| 开发检查清单.md | 根目录 | 全部 | 事前约束 + 事后自审 |
| developer-handbook.md | docs/ | 全部 | 开发者交接手册（86行，✅ 存在） |
| mod-author-guide.md | docs/ | 全部 | Mod 作者指南（✅ 已更新，含自定义前提章节） |
| plugin-author-guide.md | docs/ | 全部 | 插件作者指南（✅ 已更新，含完整API速查表） |
| mod-override.md | docs/ | 全部 | Mod override 规范（✅ 已创建） |
| premises.md | docs/ | 全部 | 前提系统文档（✅ 已更新，含架构说明+mod自定义前提） |
| dialogue-format.md | docs/ | 全部 | 口上/叙事格式规范（255行，✅） |
| talk-common-system.md | docs/ | 全部 | 条件文本片断引擎（336行，✅） |
| scene-system.md | docs/ | 全部 | 剧情系统（统一scene管理，318行，✅） |
| premises.md | docs/ | 全部 | 前提系统（92行，✅） |
| item-system.md | docs/ | P1 | 道具系统（210行，✅） |
| clothing-system.md | docs/ | P1 | 服装系统（222行，✅） |
| bondage-system.md | docs/ | H子 | 紧缚系统（138行，✅） |
| entity-namespaces.md | docs/ | 全部 | 命名空间映射（200行，✅） |
| erark-replication.md | docs/skills/ | 全部 | erArk复刻铁律（144行，✅） |
| add-instruction.md | docs/skills/ | 全部 | 添加指令工作流（66行，✅） |
| phase-p1-core-era.md | docs/plans/ | P1 | 核心era体验计划（175行，**当前阶段**） |
| phase-11-15-mvp-release.md | docs/plans/ | 11-15 | MVP发布计划（320行，**当前**） |
| 2026-07-04-instruction-replication.md | docs/plans/ | P1 | 指令复刻方案（67行，已被下述 spec 取代） |
| 2026-08-07-instruction-replication-design.md | docs/superpowers/specs/ | P1 | **指令复刻设计 spec（当前权威，做 L1.6 必读）** |
| migration-workflow.md | docs/instruction-replication/ | P1 | **逐条迁移 SOP（做 L1.6 必读）** |
| h-hypnosis-design.md | docs/specs/ | H子 | 催眠设计规格（**做催眠时必读**） |
| h-hidden-design.md | docs/specs/ | H子 | 隐奸设计规格（**做隐奸时必读**） |
| h-group-sex-design.md | docs/specs/ | H子 | 群交设计规格（**做群交时必读**） |
| mod-override.md | docs/ | 全部 | **Mod override 规范**，所有系统手册引用此文档 |
| 0003-mod-override-priority-layers.md | docs/adr/ | 全部 | ADR: 三层优先级 ID 匹配 |

---

## L0 — 架构层 ✅（全部完成）

| L0.x | 任务 | 状态 |
|------|------|------|
| L0.1 | 修复跨插件 import（4 处） | ✅ `PremiseRegistry`→core、`commonTextsEngine`→API、`getLevel`→entity-utils、talk-common→core |
| L0.2 | core 层具体玩法引用 | ✅ `registerNoSaveMode` 代替硬编码 `h_scene` |
| L0.3 | API 文档补全 | ✅ `plugin-author-guide.md` 覆盖全部 20+ namespace |
| L0.4 | 系统使用手册 | ✅ 14 个手册全部创建 |
| L0.5 | 硬编码属性名 | ✅ `ATTR` 常量建立，key 文件替换完成 |

---

## L1 — 系统层（完整系统/插件实现）

> 每个 L1 任务是一个完整系统，可独立实施。

### L1.1 渲染层 step3 — `_display` + `[styles]` 注册

**来源**：上会话遗留
**参考**：`docs/dialogue-format.md`（line 格式规范：style/trigger/display/speed 字段）

- 对话系统写 entry 时注入 `_display` 元数据
- `[styles]` 注册表实现
- TypewriterText 组件对接 `display` / `trigger` 字段

### L1.2 纸娃娃兜底地文

**来源**：上会话遗留
**参考**：`docs/talk-common-system.md`

- `triggerScene` 无对口上时自动用 talk-common-system 生成通用描述
- 注册 `behaviorId` → 条件文本池的映射

### L1.3 选项面板（P1.0）

**参考**：`docs/superpowers/plans/phase-p1-core-era.md`

- 显示设置（主题/深色/组标题/字体/字号）
- 侧栏设置（模式 overlay/并排、parameter 开关）
- 指令栏设置（编号/收藏/作弊命令开关）
- 小键盘设置
- 游戏设置（cheat 可见性）
- 存档入口

### L1.4 服装系统扩展（P1.2）

**参考**：`docs/clothing-system.md`

- 14 槽位（头/眼/项链/上身/外套/内衣/手/戒指/下身/内裤/袜/鞋/腰带/其他）
- H 中可脱/穿回
- 精液污染追踪

### L1.5 道具系统扩展（P1.3）

**参考**：`docs/item-system.md`

- consumable/lubricant/condom/toy/drug/material 类型
- `use_item` 指令

### L1.6 指令复刻（Phase A/B/C）

**参考**：`docs/superpowers/specs/2026-08-07-instruction-replication-design.md`（权威 spec）+ `docs/instruction-replication/migration-workflow.md`（逐条 SOP）+ `docs/skills/erark-replication.md`

> **当前进度**：第 0 步粗筛 ✅（228 保留，见 `docs/instruction-replication/instruction-keep-list.md`）→ 前置改动 ✅（spec §10 全部完成）→ **B1 试点 chat 已复刻 ✅（6 测试）→ 剩余 23 条待用户筛选**（批次清单 `batch-01-daily.md`）

- **前置改动** ✅（见会话交接摘要）：loader 收敛 / 接口扩展+judge_check 注入 / calcJudge adjustments 表 / IN_* 迁 location.tags / 耗时机制 / UI 分类 / _erark_source 归档
- **Phase A**：齐全前提（~80 个），按 A1（身体/体技/体位）→ A2（服装/地点/道具）→ A3（杂项）分批
- **Phase B**：效果补齐，逐条从 erArk `default.py` 读取 base_value
- **Phase C**：指令 TOML 数据（228 条），分批：B1 daily(24) → B2 obscenity(37) → B3-B6 sex(142，H UI 就绪后) → SYSTEM/ARTS 顺带

### L1.7 睡眠/昼寝/就寝指令

**来源**：上会话遗留

- TOML + effect 实现
- 时间推进整合

### L1.8 `settle_state` 加 ability_level 参数

**来源**：上会话遗留

### L1.9 `{{input}}` 文本框语法

> 叙事中嵌入输入框，接收玩家开放答案，存到实体属性或临时变量。
> 用于自定义名字、自定义留言、LLM 口上输入等。

**语法**：
```toml
# 存到实体属性
text = "你叫{{input target='player.name'}}？好名字。"

# 存到临时变量（事件内可用）
text = "你给这柄剑起了个名字：{{input var='sword_name'}}。"
```

**设计**：
- `{{input ...}}` 渲染为可编辑输入框，支持默认提示文字
- 玩家输入确认后，输入框**替换为不可再改的文字**（不是 inline 编辑）
- 输入值存两处：`target` 写入实体属性，`var` 写入执行上下文（事件内条件引用）
- 输入确认方式：回车 / 点击日志外区域
- 异常处理：不输入时给默认值

**注意**：独立于 L1.1，不一起实现。

---

## L2 — 细节层（系统内的具体功能）

> 每个 L2 是 L1 系统内的一个独立子任务。

### L2.1 @命令调试工具（Phase 11.1）

```
完成度：已有骨架（native-commands.ts 含 8 个 @ 命令入口），需要完善实际逻辑
```

- [x] `@help` 骨架
- [ ] `@attrs` — 显示选中角色完整属性
- [ ] `@setattr 属性名 值` — 修改属性
- [ ] `@teleport 地点ID` — 移动
- [ ] `@spawn 模板ID 地点ID` — 生成角色
- [ ] `@startquest 任务ID` — 开始任务
- [ ] `@additem 物品ID 数量` — 加物品
- [ ] `@errors` — 查看错误列表
- [ ] 完善骨架 + 接入真实数据

### L2.2 沙箱脚本（Phase 12.1）

```
参考：phase-11-15-mvp-release.md Task 12.1
文件：src/utils/sandbox.ts 已存在骨架
```

- new Function() + 冻结只读 context
- 5 秒超时保护（acorn AST）

### L2.8 Quest/Event 系统未实现功能

```
参考：src/plugins/quest-system/index.ts + docs/scene-system.md
L2.9 已统一 scene 管理、事件拦截、嵌套、持久化、ConversationRef。
以下为仍待做的具体功能点：
```

- [x] mod-loader 加载 quest/event TOML（L2.9 统一扫描 quests/ + events/）
- [x] 前置任务检查（`prerequisites` 字段——L2.9 completed）
- [x] `display` 字段（current/log/hidden——L2.9 实现）
- [x] 已完成任务状态持久化（completedScenes——L2.9 实现）
- [ ] combat step 的 `on_win` / `on_lose` 分支——需 combat-system 在 `combat:end` 事件附带胜负信息（`result: 'win' | 'lose'`）
- [ ] condition step 的条件求值——需在 `executeStep` 中调 `evaluateCondition`，传入当前 GameContext
- [ ] spawn step 的角色/物品创建——需 spawn-system 或 inventory API
- [ ] `visible` 字段——任务面板 UI 消费，当前 quest-system 已存字段，UI 未读
- [ ] `scene.has_character()` 条件函数——条件系统扩展，需在 `resolveValue` 中注册特殊函数
- [ ] 更多 objective 类型：`"use_instruction"`（监听指令执行）、`"character_present"`（检测角色在场）等

### L2.12 talk-common 天赋条件迁移

> talk-common 纸娃娃数据中引用了 23 个 erArk 天赋 ID（CVP_A2_T|{id}），
> 当前被静默跳过。必须注册为条件捷径才能精准匹配纸娃娃描述。

**体质类（搬进 talents.toml 插件默认）**：

| ID | 含义 | 条件捷径 |
|----|------|---------|
| 0 | 阴道处女 | `selected.阴道处女 == 1` |
| 1 | 肛门处女 | `selected.肛门处女 == 1` |
| 2 | 尿道处女 | `selected.尿道处女 == 1` |
| 3 | 子宫处女 | `selected.子宫处女 == 1` |
| 6 | 未初潮 | `selected.未初潮 == 1` |
| 20 | 受精 | `selected.受精 == 1` |
| 21 | 妊娠 | `selected.妊娠 == 1` |
| 24 | 育儿 | `selected.育儿 == 1` |
| 102 | 幼女(体型) | `selected.体型 == '幼女'` |
| 103 | 少女(体型) | `selected.体型 == '少女'` |
| 104 | 処女(体型) | `selected.体型 == '処女'` |
| 105 | 成人(体型) | `selected.体型 == '成人'` |
| 106 | 淑女(体型) | `selected.体型 == '淑女'` |
| 107 | 夫人(体型) | `selected.体型 == '夫人'` |
| 121 | 贫乳(胸围) | `selected.胸围 == '贫乳'` |
| 122 | 微乳(胸围) | `selected.胸围 == '微乳'` |
| 123 | 普乳(胸围) | `selected.胸围 == '普乳'` |
| 124 | 巨乳(胸围) | `selected.胸围 == '巨乳'` |
| 125 | 爆乳(胸围) | `selected.胸围 == '爆乳'` |
| 129 | 细腿(腿型) | `selected.腿型 == '细腿'` | A2 |
| 130 | 肉腿(腿型) | `selected.腿型 == '肉腿'` | **A1** |
| 131 | 小足(足型) | `selected.足型 == '小足'` | A2 |
| 132 | 大足(足型) | `selected.足型 == '大足'` | A2 |
| 7 | 未成年 | `selected.未成年 == 1` | A2 |
| 222 | 性无知 | `selected.性无知 == 1` | A2 |

**实现**：
1. 将体质类（体型/胸围/腿型）定义为 `talents.toml` 插件默认，有 `modifier` 影响公式
2. 状态标记类（处女/妊娠/育儿）不作为天赋，而是注册条件捷径到 `premiseRegistry`
3. 两者都注册一个"条件捷径"（shorthand），让 `CVP_A2_T|102_E_1` 等价于对应条件表达式
4. 全部注册完毕后，talk-common 的 `pickEntry` 才能在非 strict 模式下正确匹配

**S（状态）和 A（能力）类 CVP 映射参考**（转换不需要特殊处理，直接写成条件表达式即可）：

| CVP 示例 | 等价条件 |
|----------|---------|
| `CVP_A2_S\|0_GE_5000` | `selected.皮肤 >= 5000` |
| `CVP_A2_S\|4_GE_1000` | `selected.阴道 >= 1000` |
| `CVP_A2_S\|5_GE_90000` | `selected.后穴 >= 90000` |
| `CVP_A2_A\|71_GE_3` | `selected.abilities.舌技.level >= 3` |
| `CVP_A2_A\|75_GE_5` | `selected.abilities.肛技.level >= 5` |

### L2.13 技能系列（erArk ability_type=4）参考

> erArk 的技能系列（话术/指挥/战斗/料理/音乐/学识/医术/农业/制造/绘画）是通用生活技能，
> 但我们的原生通用技能可能与之不同。此条仅做记录，不做实现。

**erArk 技能列表**（ability_type=4, ID 40-49）：
```
40=话术技能, 41=指挥技能, 42=战斗技能, 43=料理技能, 44=音乐技能
45=学识技能, 46=医术技能, 47=农业技能, 48=制造技能, 49=绘画技能
```

### L2.3 角色创建流程（Phase 13.1）

```
文件：src/ui/views/CharacterCreation.vue 已存在
```

- dialogue/choose/input/image 步骤类型
- meta.toml `[creation]` 配置支持

### L2.4 存档迁移链完善（Phase 11.3）

- rename/default/transform 迁移类型
- 内存执行 + 下个存盘写入

### L2.5 插件化闭环验证（Phase 12.2）

- test-mod 跑通完整循环
- 换模组测试

### L2.6 移动端 PWA（Phase 14.1）

- manifest.json + 图标
- 离线运行

### L2.7 最终集成测试 + 发布（Phase 15.1）

### L2.9 Scene/Event 系统缺口

> scene-system.md 设计了完整的 event 机制，但代码中大量未实现。

- [x] `events/` 目录加载——mod-loader 统一加载 quests/ + events/，scene ID 重复检测 + scene_id 引用校验
- [x] `start_scene` effect + `start_quest` 别名——后台激活 scene（不打断当前）
- [x] scene step 类型——`case 'scene'` + 嵌套场景栈 push/pop
- [x] 触发拦截逻辑——dialogue-system 检查 condition 匹配的 scene 并自动开始
- [x] 嵌套场景进度管理——场景栈实现（子完成→pop 回父），`parent` 字段可选

### L2.10 Combat 系统缺口

- [ ] 队友系统——回合循环中队友行动 stub（`// TODO: 队友系统`）
- [ ] `hit_check` 钩子——base 实现被注释掉
- [ ] 动态指令——按角色能力注册指令 stub
- [ ] 阴阳属性——硬编码为 `1.0`（`// TODO: 查角色内功的阴阳属性`）
- [ ] mod override 系数——硬编码默认值（`// TODO: mod override 机制`）

### L2.11 H-core 结算缺口

- [x] 状态修正——`calcJudge` 中状态修正完成
- [x] 陷落修正——完成
- [x] 群交 HP 修正——`hp-mp.ts` 重写 + `settle_hp_mp` effect
- [x] 射精衰减——`calcSemenAbsorb` + `penis_dirty_dict` + H 中 tick
- [ ] 被发现面板——隐奸系统 UI stub（`// TODO: 打开被发现面板`）
- [x] 精液污染追踪——`pl_penis_semen_dirty` 前提注册 + TOML 转换
- [ ] jj_0/1/2/3 前提——射精后阴茎硬度/状态等级。erArk `jj_0~4`，需在 h-core 或 h-ejaculation 中注册 premise handler，检查 `h_state.just_shoot` 或 `h_state.shoot_semen_amount`
- [x] 饥饿系统——`hunger-system` 插件完整实现：
  - `eat_food` effect: 扣背包→减饥饿→消化CD→回HP/MP
  - `game:hour_changed` 自动增长 (erArk 公式) + 消化衰减
  - `game:new_day` NPC 每日口粮
  - NPC 自动进食（背包有食物时）
  - 配置化：h-config.toml `[hunger]` 段，mod 可 patch
  - 默认食物：干粮/饮水/甜点
  - 条件表达式：`selected.饥饿值 > 190` 等直接可用
- [ ] 食物获取方式（后续）：
  - 商店购买
  - 烹饪/制作
  - 采集/打猎
  - NPC 一起吃饭好感加成
  - 特殊食物效果（加料/毒品/精液等）
- [ ] 目标榨精 ability[77]——`calcSemenAmount` 中因子(6)需目标角色ID和 `abilities.榨精.level`
- [ ] 精液存量检查——`calcSemenAmount` 中因子(7)：射精量不超出 `semen_point + extra_semen_point`
- [ ] 衣物精液追踪（`cloth_semen`）：
  - **涉及**：h-ejaculation（射精时同步追踪衣物精液）、talk-common CVP 检查（`CVP_A2_Dirty|C{槽位ID}_{op}_{val}`）、clothing-system（精液扩散/清洗）
  - **数据结构**：`ch.cloth_semen[slotId] = [0, current_ml, level, total_ml]`，同 `body_semen` 格式
  - **条件表达式**：`selected.cloth_semen.{slotName}.{索引} > N`，需在 `condition.ts` 中注册 `cloth_semen` 路径或提供别名
  - **入口**：射精时按射精部位关联的服装槽位增加精液（如阴道射精→内裤/下身），`update_semen_dirty` 的 erArk 等价函数
  - **前置依赖**：clothing-system 完整实现（14 槽位）、服装精液扩散（`settle_semen_flow`）

  > **背景**：纸娃娃地文口上中有 40 条检查精液污染的 CVP 码（`CVP_A2_Dirty|B0_G_1`），
  > 表示"目标全身皮肤精液量 > 1"。当前无法求值，条件被静默跳过。
  >
> **CVP_Dirty 格式**：`CVP_A2_Dirty|{前缀}{部位ID}_{比较符}_{值}`
> - `B` = 身体部位（B0=全身皮肤，B1-B8 对应各性感带）
> - `C` = 服装槽位（C0-C8 对应各装备槽）
> - talk-common 数据中**只用了 `B0`**（全身皮肤精液污染）
>
> **MVP 设计**：先只做全身污染计数，不在角色上细分到各部位/服装。
> 在角色上加 `semen` 数字字段（0~100），射精时增加，H 结束/洗澡时清零。
> 注册前提 handler 把 `CVP_A2_Dirty|B0_G_1` 映射为 `selected.semen > 1`。
>
> **扩展方向**：如果以后要做更细的精液追踪（精液沾到胸部/腿上等部位的纸娃娃描述），
> 把 `semen` 拆为 `body_semen[部位]` 和 `cloth_semen[槽位]` 两个数组，
> 对齐 erArk 的 B（身体部位）和 C（服装槽位）两套索引。
  >
  > **关联系统**：h-ejaculation（射精时增加）、h-core H 生命周期（结束时清零）。

---

## L3 — 推迟池（已明确设计但暂不实施）

### H 子系统

```
已实现：h-core / ejaculation / pregnancy / first-time / exposure / mark / hypnosis / hidden / group-sex / bondage / time-stop
```

**待实施**：
- h-confinement — 监禁调教系统
- h-aromatherapy — 香薰疗愈（8种每日buff）
- 女儿成长→自订角色入口（h-pregnancy 扩展）
- 动态体位切换（15 体位 × 5 部位）
- NPC H AI — H 内自动行动
- 二段行为 — 绝顶/射精后连锁
- 宝珠系统 — 24 种宝珠睡眠结算
- 口上三层加权随机 — 通用/角色/特殊情境

**做以上任一项前必读**：
- `docs/superpowers/specs/` 下对应设计规格文件
- `docs/superpowers/plans/` 下对应实施计划
- `docs/erark-replication.md` 复刻铁律

### 引擎深化

- LLM 口上（流式/上下文/token/降级）
- 天赋/套装钩子式效果（需沙箱）
- combat-wuxia 公式 mod override 完整机制
- 战斗外精确分钟级 tick
- NPC 队友 AI 优化
- inventory-system tags 驱动指令完整实现（当前只 stub）
- scene-system event 完整管线（events/ 目录、start_scene effect、嵌套场景）
- 限时/重复/日常任务
- 日志搜索/过滤
- 自动化脚本/宏（Command ID 链式执行）
- onDisable/onUnload 插件生命周期
- semver 版本校验
- required_attributes 继承
- 标准事件契约完整发出
- getDefaultValue 类型感知默认值
- 地图层级文档自动生成
- 深色模式算法反色优化

### UI 剩余项

- 角色指令栏开关
- 大事志内容填充
- 复杂历法（当前 day%7）
- 多图立绘 variants
- foldStates 存档持久化
- 侧栏三条杠手柄承载更多简要信息
- 目标选择菜单（仙剑式）
- 战斗 UI 美化（仙剑式布局）
- 全体技能/回复/buff
- 战斗中不可选中队友为攻击目标
- HP=0 后角色处理

### 属性面板值域约束（接入升级系统后重新检查）

**背景**：erArk 通过 `AbilityUp.csv` 为每项能力定义 0→1→2→…→7 的升级路径，严格限制了取值范围。
我们当前**没有运行时约束**——`"技巧" = 99999` 会如实显示，不会报错。

**问题点**：
1. 感觉（皮肤感度等）、能力（技巧/顺从等）、刻印、技术、扩张（阴道扩张/后穴扩张/子宫扩张）目前只是原始数字，无 max 限制
2. erArk 的 `AbilityUp.csv` 定义了每级的升级需求（XP/宝珠/经验），我们还没做
3. 接入升级系统后，需要确认：要不要为这些值加 max 约束？约束力度多强（硬限制 vs 约定）？
4. 刻印的合理范围是 0~3 还是 0~5？
5. 感觉值（皮肤感度）的合理范围——erArk 允许 0~7 级，每级一个阈值
6. 如果加约束，是在 `attributes.toml` 加 `max` 字段，还是由升级系统全权管理？

**提醒**：回头检查这里的对话记录（2026-07-13 会话后半段 `属性页签值域` 话题）。

### settle 公式深化

- calcStateChange 追加素质修正/道具修正/extra_adjust
- 素质修正（char.talents 读取 + erArk talent mod 表乘算）
- 道具修正（装备/使用中道具）
- 永久感度（皮肤感度/胸部感度等）随 H 行为增长机制
