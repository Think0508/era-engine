# era-engine 汇总 TODO

> 所有 TODO 集中在此。分层结构：
> - **L0 架构层**：影响整个代码库的架构决策，必须先做
> - **L1 系统层**：完整的系统/插件实现

## 参考文档索引（使用手册铁律——新系统手册在此登记）

| 系统 | 手册 | 插件/核心 |
|------|------|-----------|
| NPC 行为系统 | `docs/npc-ai-system.md` | src/plugins/npc-ai-system/ |
| 跟随/同行 | `docs/follow-system.md` | src/plugins/follow-system/ |
| 关系系统 | `docs/relation-system.md` | src/core/relation-* + character-system |
| 地图系统 | `docs/map-system.md` | src/plugins/map-system/ |
| 对话/口上 | `docs/dialogue-format.md` | src/plugins/dialogue-system/ + talk-common-system |
| 地文/条件文本 | `docs/talk-common-system.md` | src/plugins/talk-common-system/ |
| 战斗 | `docs/combat-system.md` | src/plugins/combat-base/ + combat-wuxia/ |
| 状态效果 | `docs/status-system.md` | src/plugins/status-system/ |
| 任务 | `docs/quest-system.md` | src/plugins/quest-system/ |
| 能力升级 | `docs/ability-progression.md` | src/plugins/ability-progression/ |
| 效果系统 | `docs/effect-system.md` | src/plugins/effect-system/ |
| 道具/背包 | `docs/item-system.md` / `docs/inventory-system.md` | src/plugins/inventory-system/ |
| 装备/服装 | `docs/clothing-system.md` | src/plugins/inventory-system/（equipment 槽） |
| 随机事件 | `docs/random-event-system.md` | src/plugins/random-event-system/ |
| 套装 | `docs/set-system.md` | src/plugins/set-system/ |
| 监禁调教 | `docs/confinement-system.md` | src/plugins/confinement-system/ |
| H 核心 | `docs/h-core.md` + h-*.md（h-pregnancy/h-mark/h-hypnosis/h-hidden/h-bondage/h-ejaculation…） | src/plugins/h-*/ |
| H 内 NPC AI | `docs/h-npc-ai.md` | src/plugins/h-npc-ai/ |
| 睡眠系统 | `docs/sleep-system.md` | src/plugins/sleep-system/ |
| 饥饿系统 | `docs/hunger-system.md` | src/plugins/hunger-system/ |
| 存档系统 | `docs/save-system.md` | src/core/save-system.ts + src/ui/components/SavePanel.vue |
| 属性系统 | `docs/attributes-system.md` / `docs/bindings.md` / `docs/character-schema.md` / `docs/entity-namespaces.md` | src/core/entity-utils.ts + binding-resolver.ts |
| 天赋系统 | `docs/talent-system.md` | core talent-utils + mod 数据 |
| 场景/口上触发 | `docs/scene-system.md` | src/plugins/dialogue-system/ |
| 前提 | `docs/premises.md` | src/core/condition-engine.ts |
| 指令复刻检查清单 | `docs/skills/replicating-an-instruction.md` | scripts/ 复刻流程 |

## 会话交接摘要（2026-07-14）

> 新会话开始时先读此节。

### 已完成（本会话）
```
标准角色契约（spec §10.1�?026-08-09，B1 剩余迁移前必做）�?
  - Step 1 名称映射表：scripts/erark-name-map.json（erarkToOurs/oursToErark/dropped/structuralSubstitutions�?
    改名：肛肠→后穴/心理快感→心�?射精槽→射精�?精液槽→精液�?疲劳值→疲劳�?醉酒度→酒气/理智→精�?胸→胸部
  - Step 2 �?层扫描：scripts/scan-attr-refs.cjs（TS 中文属性字面量 + ATTR.XXX 展开 vs 定义集）
    �?修复 4 处死键：h-ejaculation '饥饿�?�?饥饿�?×2、h-group-sex '心理快感'�?心理'/
    '精液上限'�?精液量上�?+'欲望'�?欲望�?（base 死键，erArk desire_point 确认�?'疲劳'�?疲劳�?
    �?补定义：隐蔽(ability 90,h-hidden)、排卵周�?pregnancy 周期)、精�?hypnosis 精神�?�?
    饿得�?talent)、TSP/tsp_max(h-time-stop 插件默认)、力�?根骨/定力/灵敏/福缘(combat-wuxia 插件默认)�?
    气血/内力(test-mod 示范 mod 自定义属�?、华山剑�?混元�?基础攻击/采药(test-mod abilities)
    �?扫描 0 违规（exit 0�?
  - Step 3 �?层对账：scripts/scan-erark-defs.cjs（A 骨架=erArk 4 CSV+Character 结构�?48 字段�?
    B 遗漏抓取�?228 保留指令效果链，behavior_id 大小写归一 + effect �?' - ' 拆分 +
    转换脚本全写法抽取：EFFECT_MAP/clothMap/expMap/if-numId 平衡花括号）
    �?docs/instruction-replication/erark-attr-ledger.md 四类：已对齐 364 / 替代处理 15 / 有意删减 45 / 遗漏 0
    �?技能系�?41-49 �?有意删减"（L2.13 记录不做实现，B 扫描确认零引用；话术技�?40 例外已定义）
    �?附：90 个未映射 effect id（保留指令链用到，转换脚本跳�?�?迁移时两步路径翻译，SOP §8�?
  - Step 4 文档：docs/character-schema.md�?0 节：结构�?属性表含默认�?读取�?缺失影响+可删�?
    能力天赋状态经�?实体结构 h_state+sp_flag+body_items+dirty+first_times/最小必需�?异常�?静默失效�?/
    字段字典/场景索引/mod 扩展规则/校验规则/改名记录）；mod-author-guide 新增"角色字段速查"�?
  - Step 5 校验落地：src/core/character-contract.ts（校验器注册表，纯机制无属性名——三层铁律）�?
    mod-loader validateCharacterContract（裸字段/未定义状态效�?关系类型 warning +
    插件校验器调用，校验异常 warning 化不拖垮加载）；fillMissingAttributes 导出（全命名空间查重—�?
    契约前存�?base 写法不重复补，补�?warning）；save-system restoreFromSave 接线；h-core 注册
    §5.1 必需集校验器（具体字段名在插件层）；test-helpers 契约化（DEFAULT_NPC_BASE/PLAYER_BASE 补全
    最小必需�?+ reset �?marks 重置�?
  - Step 6 测试：src/core/character-contract.test.ts 13 条（裸字�?缺必需/校验器异常隔�?
    存档补齐/契约前存档兼�?基座一致�?扫描脚本自测 exit 0�?
  - Step 7 验收：typecheck �?/ test 458 通过�?2 文件，基�?421+37�? dev 冒烟干净 /
    扫描 0 违规 / 对账表四类齐备遗�?0 / test-mod 新增契约示范角色 contract_demo（全命名空间写法示范�?
  - 顺带清理：test-mod 射精�?射精槽上�?旧名 �?射精�?射精欲上限；tsconfig.app.json types �?node
  - 登记：attr-scan-report.md �?UNMATCHED 1287 条为人工三审备查（UI/日志文本，无真实属性引用）
  审查修复�?026-08-09 用户要求复查）✅�?
  - 【真缺口】h-core 默认 attributes.toml �?erArk 标准角色卡（ABL/刻印/感度/扩张/性技只存在于
    test-mod）→ �?attributes.toml �?mod（武侠）会触发必需集校验器全角色警�?+ 条件字典不注�?
    player.技�?player.快乐刻印 + 属性面板不显示 �?�?35 键进 h-core 默认�?
  - 【扫描误报】scan-erark-defs 未覆盖转换脚本区间映射（122-125/131-134/141-146/1055-1062 �?
    range �?+ partMap/skillMap 字符�?map）→ 未映�?effect id 90 虚高 �?真实 2 个（1723/1724）；
    B 列新增部位引用抓取（pain/pl_p 链）
  - 【查证记录�?723/1724（carry_target/stop_carry_target）：default.py:2707/:2730 语义写入对账表附�?
    （action_info.carry_chara_id 写入——需专用 handler，set_field 只写 _targetIds 无法表达"玩家写自�?�?
    B2+ ARTS 批次用）
  - 【死键】test-mod test_spawn �?`ability`（单数）命名空间——基础攻击从未被读取（expandCharacterAbilities
    只读 abilities 复数）→ �?abilities
  - 【铁律】character-contract.ts 重复注册 console.warn �?errorReporter
  复查验收: typecheck �?/ test 458 通过 �?/ 扫描 0 违规 + 未映�?2（已查证�? dev 冒烟干净
  二次审查修复�?026-08-09，用户要求再复查）✅�?
  - 【真缺口·静默】运行时生成路径未契约化：npc.toml 路人（character-system handleNpcSpawns）直�?
    浅拷贝模板注册——abilities 是裸数字�?level �?undefined �?结算系数静默 0）、marks/params/talents
    缺默认（面板不显示）；pendingSpawns 也只在加载时 applyAttributeDefaults（abilities 简写未展开�?
    talents 未初始化）→ 新增 finalizeCharacterData（mod-loader 导出：默认�?abilities 展开+talents
    初始化，幂等），三处接入：parseModData roster/named/pendingSpawns + handleNpcSpawns（含命名空间
    克隆防模板污染——浅拷贝�?applyAttributeDefaults 会改共享模板�? processPendingSpawns 兜底
  - 【测试盲区】h-core 必需集校验器常量未导出（真实校验器永不进测试）→ 导出 CONTRACT_REQUIRED_*
    + 一致性测试（必需�?�?h-core attributes.toml 定义）；restoreFromSave 全路径（真实 mod 加载 �?
    读档缺字段补�?+ warning 不静默）测试；npc 路人生成契约化集成测试（全插件加载镜�?boot-smoke）；
    finalizeCharacterData 单元测试（简写展开/默认�?talents 初始�?最�?mod 幂等�?
  - 【深挖确认】全部角色注册点枚举（mod-loader/save-system/spawn-system/character-system）已覆盖�?
    UNMATCHED 1252 条深筛（上下文含 base[/params[/abilities[/getEntity 等模式）= 0 条漏网；
    中文属性常量（HUNGER_ATTR/DIGESTION_ATTR）值均定义 ✓；bindings.get/set 无中文属性调�?�?
  二次复查验收: typecheck �?/ test 463 通过 ✅（42 文件�?5�? 扫描 0 违规 / dev 冒烟干净
  三次审查�?026-08-09，链路打通验证—�?启动顺序"链）✅：
  - 【真断点·已修】main.ts 顺序 = loadMod（第2步）�?�?插件 onLoad（第8步）�?�?h-core 必需�?
    校验器在首次加载时未注册�?*生产环境永不执行**（指令校验有 game:plugins_loaded 延迟，角色契约没有）
    �?mod-loader 导出 revalidateCharacterContract()，h-core onLoad 注册校验器后立即补跑
    （两种启动顺序都覆盖：mod 先行=补跑生效；插件先�?parseModData 时已注册；幂等无害）
  - 【真 bug·已修·boot-smoke 抓到的】h-core 必需集校验器硬编码查 base �?好感�?信赖�?
    category=social 落在 entity.social �?首次真实补跑即对 test-mod 全角色误�?缺必需"
    �?校验器按 attributes.toml category 动态解析命名空间（nsMap + 默认 base�?
  - 【链路测试·新增】revalidate 补跑链（fake 校验�?+ 删定义的 bad mod �?补跑抓到缺必需）；
    条件注册链（h-core 默认属�?�?conditionRegistry 可校�?player.技�?player.快乐刻印—�?
    补全前任�?mod 条件校验失败）；必需集落位链（加载后每个必需�?getEntityAttr 可读—�?
    定义→默认落位→读取方可�?整链验证，含 social 命名空间具体断言�?
  - 【稳定性�?66 全量连跑 2 次稳定；测试隔离修复（落位链测试�?entitySystem.clear�?
  三次审查验收: typecheck �?/ test 466 通过 ✅（42 文件，连�?2 次）/ boot-smoke 7/7（真实补�?0 误报�?
  扫描 0 违规 / dev 冒烟干净
  四次审查�?026-08-09，bug/静默错误扫尾）✅�?
  - 【真 bug·数据丢失·已修】fillMissingAttributes.hasAnywhere 硬编码命名空间清单漏�?social/
    economy/combat �?契约后存档（好感度在 entity.social）读档时被默认�?30 覆盖（玩家真实�?
    丢失�? 虚假 warning �?动态扫描角色全部对象命名空间（先写失败测试再修�?
  - 【静默地雷·已修】SEARCH_ORDER �?marks �?abilities 前：h-mark 升级�?abilities（按名键），
    attributes category=mark 默认落位 entity.marks �?0 �?任何 getEntityAttr/setEntityAttr 读刻�?
    会命�?marks 死存储（静默遮蔽真实刻印等级）→ marks 移到 abilities 之后（core 纯机制改动，
    穷举确认：calcJudge/settle_state/favorability/trust/h-mark 全走 abilities，UI 不读刻印，零依赖�?
    �?刻印 canonical 存储 = abilities 定稿写入 schema §2.3；新增刻印读取链测试
  - 【排查确认】ParameterSection 只遍�?daily_reset 属性（刻印不进面板，无展示 bug）；
    setEntityAttr 整键替换语义对能力键是既有非法用法（产品代码无此调用，不扩大范围�?
  四次审查验收: typecheck �?/ test 468 通过 ✅（42 文件，连�?2 次）/ 扫描 0 违规 / dev 冒烟干净
  实时结算机制对齐�?026-08-09，grill G1-G6 逐项定稿后落地）�?
  - 【背景】用户指�?写入方缺�?需区分：指令迁移可�?vs erArk 原生机制必须补—�?
    复查发现 realtime-settle.ts 已实现大部分原生机制（先�?无写入方"结论�?grep 盲区），
    真正缺口 = newday-settle 参数 bug（静默死代码�? 饥饿双轨 + 射精欲消退缺失�?
  - G1 饥饿双轨收敛【方�?a】：hunger-system hour_changed 增长删除（与行动级重�?双倍）�?
    增长唯一�?= realtimeSettle.settleHunger（补 erArk 系数 2-hp/max × 2-mp/max）；h-config
    [hunger] �?growth_per_min/growth_random；消�?NPC 进食/每日口粮保留
  - G2 欲望每日增长【方�?a】：newday-settle 修参�?bug（getEntityAttr(char.id)→char，传字符�?
    恒失效）+ 范围对齐 erArk �?NPC（玩家欲望由 H/自慰/药物链置 79/0/100，B3 带）
  - G3 射精欲自然消退【方�?a】：h-ejaculation 射精时写 action_info.last_eaj_add_time
    （gameTimeToTotalMinutes �?helper�? realtimeSettle 玩家分支：非 H 且距上次射精 >30 �?�?-10/�?
  - G4 快感清零【方�?a】：realtimeSettle isSleep 分支�?attributes.toml daily_reset=true 标记归零
    （该标记首次有消费方；erArk sleep_settle.py:124-128 转珠部分因宝珠系统砍掉只留清零；
    L1.7 sleep 指令化时自动生效�?
  - G5 愤怒【方�?a】：finalizeCharacterData 新角色初始化 rand(1,35)（erArk character.py:99�?
    有键保留/幂等�? isSleep 睡眠醒来重置 rand(1,35)（sleep_settle.py:80）；
    MOOD_TO_*/判定失败�?±值随 B 批次
  - G6 数值对齐【方�?a】：尿意上限 240�?00（erArk 代码 min(...,300) vs 注释 240 以代码为准，
    clampValue+settleUrine 同步）；熟睡两分支补 tired_adjust=1+疲劳/160、深睡区�?rand(-0.3~0.6)
    （下界钳 0 防御�?
  - 新增测试 23 个（G1 饥饿系数/封顶 1、G2 欲望 NPC/玩家/上限/同日 4、G3 消退 6、G4 清零 3�?
    G5 愤�?5、G6 尿意/熟睡 4）——新文件 realtime-settle.test.ts + newday-settle.test.ts
  - 待办登记：醉酒消退（系统未实装延后）、休�?HP/MP 恢复公式（B1 rest 迁移时对�?settle_rest�?
    max×0.003+10）、MOOD_TO_* 等指令链效果（B 批次）、深�?浅睡阈�?60 细节（L1.7 睡眠系统时核�?
    Sleep_Level.csv）、vitest pool 偶发 skip（已登记既有现象，重跑稳定）
  G1-G6 落地后审查（2026-08-09，bug/静默错误/链路）✅
  - 【静默失效点·已修】eja_shoot（直接射�?effect，B3 指令将用）缺射精结算：不扣精液�?
    不写 just_shoot/day_first_shoot_semen/last_eaj_add_time（与 eja_climax 不一致）�?
    未来 B3 用上时射精不扣精�?+ G3 射精欲消退永不触发（静默）�?对齐补齐 + 链路测试
  - 【过度修复·已撤销】newDaySettle reset：临时加�?读档回拨 reset"经测试证明有�?
    （读档当天重复结算）；lastSettledDay != 比较已正确处理回拨日�?�?撤销 + 测试改为确认正确行为
  - 【链路确认】G1 饥饿行动级唯一�?✓（command-executor �?realtimeSettle 玩家+全角色）�?
    G2 每行动调用同日幂�?✓；G3 eja_climax 二段结算路径已写 last_eaj ✓；G4/G5 睡眠部分
    入口 = sleep 指令（B1 剩余 1014，未迁移 �?isSleep �?false 机制休眠，迁移后自动生效——预期）�?
    G6 尿意 240 零残�?✓；rest 恢复�?recover_permil（数值对�?settle_rest �?B1 待办）✓
  - 【稳定性】新测试文件（realtime-settle/newday-settle/phase-h�? 连跑全稳�?48/48�?
    全量 494 ×3 全绿（偶�?1 error �?vitest pool 既有登记现象，重跑稳定）
   验收: typecheck �?/ test 494 通过 ✅（44 文件�? 扫描 0 违规 / dev 冒烟干净
   验收: typecheck �?/ test 492 通过 ✅（44 文件，连�?2 次稳定）/ 扫描 0 违规 / dev 冒烟干净
   验收: npm run typecheck �?/ npm run test 458 通过 ✅（42 文件�? 扫描 exit 0 / dev 冒烟干净
   字段分层审查�?026-08-09，用�?grill 定稿）✅：ADR-0007 角色字段作者分�?
   - 【设计】新增第四维度「作者写入层」（正交�?category）：L1 角色层直接写（初始值有意义�?
     引擎累加/不覆盖）/ L2 非平凡（需插件声明或动全局默认�? L3 引擎独占（运行时管理、写无效�?
   - 【审计结论】pregnancy 初始值不�?h-pregnancy 重置（L1 成立，只�?累加）；预置
     virgin_V=true 不自动生�?first_records（文档说明，schema §4.4）；experience 数�?L1
     （键名禁改是文档约定——无定义文件可校验）；first_records L3；cloth �?equipment 过时命名
     修正 + assets 补入契约 §1
   - 【双源漂移·已修】h-first-time 破处不删处女天赋（阴道处�?肛门处女/尿道处女/子宫处女/
     无接吻经验）�?talk-common 口上条件 talents.肛门处女 == 0 永久失效 �?first_time_check/
     first_kiss_check 同步删对应天赋（VIRGIN_TALENT_MAP�? 5 条测�?
   - 【marks 归一化·已修】刻�?canonical = abilities；角色数据写 marks（�?0）finalize 时拷�?
     �?abilities.level（两者都�?abilities 优先，marks 只补缺）——mod 直觉写法也生�?
   - 【分层校验·已落地】character-contract.ts 导出三层表（AUTHOR_WRITABLE/NONTRIVIAL/
     ENGINE_OWNED_TOP_KEYS�? validateTopLevelLayers；mod-loader validateCharacterContract
     接线：L3 命中 warning「引擎独占写入无效�? L2 命中 warning「非平凡字段」（params �?
     值≠default 时提示，�?applyAttributeDefaults 自动填充误报；extends 模板元数据入白名单）
   - 【文档】schema §11 字段分层表（L1/L2/L3 + 与既有机制关系）；mod-author-guide 速查�?
     分层视角；master-todo 索引�?character-schema + ADR-0007
   - 【测试】h-first-time 5 条（新文件）+ character-contract +3（归一化�?/分层×3�?
     boot-smoke 排除教学 warning（contract_demo params 教学展示�?
   - 【教学展示】contract_demo 保留 params 字段——加载时展示 L2 warning（示�?罕见写法"�?
   字段分层验收: typecheck �?/ test 全量通过 �?/ 扫描 0 违规 / dev 冒烟干净
   字段分层复查�?026-08-09，改后自检�?2 个静默缺口）✅：
   - 【静默缺口·已修】setFirstTime 公共 API 只写 first_times 不删处女天赋（与 first_time_check
     不一致）�?双源漂移仍可�?API 路径发生 �?同步 removeVirginTalent + 测试
   - 【静默缺口·已修】restoreFromSave 不跑 marks 归一�?�?本改动前保存的旧存档（marks 有值�?
     abilities 刻印�?0）读档后刻印值静默丢�?�?normalizeMarksToAbilities 导出 + 恢复路径接线
     + 测试（�?0 拷贝、已有真实等级不覆盖�?
   - 【确认无碍】talents 删除后条件求值走 getDefaultValue 数值默�?0（talk-common 口上翻转正确）；
     处女天赋 TS 读取方仅 h-first-time 自身；分层检查不跑运行时生成 NPC（只查加�?entities）；
     revalidate 重复 warning 为既有行�?
   复查验收: typecheck �?/ test 506 通过 ✅（+2�? 扫描 0 违规
   mod 范例与引导体系（2026-08-09，用户需求「照猫画虎」）✅：
   - 【交付物 ①】mods/example-mod/ 教学范例模组——每个文件真实可�?+ 教学注释�?
     meta.toml 头注释画全项目数据层级图（插件默认层→mod 定义层→模板→角色→存档 + 合并规则）；
     definitions（改默认�?新增属�?能力/天赋/关系/状�?物品示范）；templates 两级继承
     （base-human + 山贼 extends 差分示范）；roster 分区（必写前�?可选后�?L3 末段只注释不写）�?
     named/角色示例 完整分区照猫画虎；npc/maps(山村+集市+graph 防不可达)/quests(objective+reward)
   - 【交付物 ②】docs/mod-file-guide.md 逐文件字段字典（18 �?+ 常见错误速查）：
     每文件统一表（字段/类型/必填/默认/区间/说明 + 不写会怎样）；区间列人工维护（逻辑钳制标注�?
   - 【交付物 ③】npm run validate 接线：toml-validator.ts 实为空文�?�?改为 vitest 入口
     src/core/mod-validate.test.ts（复�?parseModData 全链路校验零重复实现 + example-mod 加载冒烟）；
     package.json �?validate script
   - 【交付物 ④】文档修正（改后自检发现 3 处文�?代码漂移）：mod-override.md 数组规则改「整表替换�?
     （原声称 ID 匹配/追加去重，代码只�?deepMerge 整表替换）；ADR-0003 同步；ADR-0001 标注
     template_append 语法未实现（勿教作者使用）
   - 【设计确认】差分语�?= 推荐写法非强制（写了即最终值；写全量脱离继承）�?
     「引擎原生」实�?h-core 插件默认层；bindings 不能�?h-core 硬编码属性名
   - 【验证】npm run validate 4/4（test-mod �?1 条教�?warning；example-mod 0 warning�?
   范例体系验收: typecheck �?/ test 全量通过 �?/ validate 4/4 �?/ 扫描 0 违规
   example-mod 端到端验证（2026-08-09，用户担忧「写了录不进游戏」）✅：
   - 【新增】src/plugins/example-mod-integration.test.ts�?0 条）——镜�?boot-smoke 启动�?
     （loadMod example-mod �?bindings/condition �?全插件加载），逐字段断言真实落位�?
     玩家（改默认 1200/自定义属�?气血/内力/getEntityAttr 可读）、山贼_张三（三层模板链
     base-human→山贼→角色 差分覆盖）、小师妹（abilities 简�?talents/关系/刻印归一�?
     experience/状�?背包/装备/位置/first_times 全落位）、角色示例（pregnancy/dead/marks=2）�?
     条件字典（自定义属�?关系路径/location.tags）、对话树/任务注册、移动链路（山村↔集�?
     graph 边）、路人生成契约化、存档闭环（保存→读档全保留含归一化）
   - 【扫描器误判·已修】scan-attr-refs 把结构命名空间索引当属性引用（talents['天生神力']/
     relations['player']['师徒�?]/inventory['回气�?]/home_locations['山村']）→ 新增
     STRUCTURAL_NS 链首识别（indexChainRoot�? 条件路径 relations.{对方}.{类型} 段跳过—�?
     与属性承载命名空间（base/params/social/abilities）明确区分，不吞真实违规
   - 【结果�?0/10 全通过——示例全部字段真实录进游戏，无静默错误（首轮仅测试自�?
     路径写法�?1 处：关系条件应为 character.{id}.relations.{对方}.{类型}�?
   端到端验�? typecheck �?/ test 520 通过 ✅（47 文件�? validate 4/4 / 扫描 0 违规
   definitions 示例补全�?026-08-09，用户反馈「示例要完整，mod 作者不知道还能做什么」）✅：
   - 【补�?7 文件】calendar（文化月�?星期�? scene-dialogue（场景旁白——修�?
     mod-workflow �?{location.description} 错误变量，地点无该字段）/ character-dialogue
     （角色通用口上 500 �?fallback�? sets（粗布套：布�?长裤→气血+20�? talk/styles
     �? 样式�? equipment�?*整表替换教学**：完�?9 �?+ 新增披风槽——loadMerged
     skipDeepMerge 语义�? h-config（改 hunger.daily_ration_id 引用 mod 物品 +
     judge.adjustments **数组整表替换**写全示例：默认处女惩�?+ 自定义条�?
     target.abilities.吐纳�?level >= 3�?
   - 【明确不写】factions.toml 引擎无加载器（指南标�?未实�?防误导）；bondage/types.toml
     整表替换 + 129 行默认表复制太重（指南给指引：完整复制默�?15 种再改）
   - 【教学点】equipment.toml �?judge.adjustments 数组都是「写了就整表替换」—�?
     示例注释与指南都强调"要么不写、要么写�?
   - 【验证】集成测�?+1（definitions 全类型加载断言：口�?日历/套装/样式/10 槽含 cape/
     hConfig 覆盖/修正条件过插件校验）；example-mod �?0 warning
   definitions 补全验收: typecheck �?/ test 523 通过 �?/ validate 4/4 / 扫描 0 违规
   执行链路验证�?026-08-09，用户追问「能跑通、无静默错误」——挖�?7 个真问题）✅�?
   - 【真 bug·已修】inventory 双格式：运行�?API 用数�?[{itemId,count}]、mod 数据/文档写对�?
     {物品ID:count} �?加载不转�?�?addItem/removeItem/hunger/set-system 对对�?.find/.some
     TypeError 崩溃�?+ 条件路径 inventory.{item}.count �?false �?finalizeCharacterData �?
     normalizeInventoryToArray（对象→数组，幂等）；condition.ts 数组对象匹配兼容 itemId�?
     example-mod/schema/mod-file-guide 统一数组格式（旧对象写法自动转换�?
   - 【真 bug·已修】condition.ts 单引号字符串右值抛错（"cannot be parsed as a number"）—�?
     文档/示例惯用 'active'/'山村' 等单引号 �?所有含字符串比较的条件求值崩�?
     （quest auto_start 静默失败、口上条件崩）→ 右值解析支持单引号
   - 【真 bug·已修】条件引擎无 inventory 根（AGENTS §8 路径 inventory.{物品ID}.count
     求值恒 0）→ 加根�? 玩家背包数组�?
   - 【死代码·已修】quest-system checkAutoStart �?TODO（auto_start_condition 从不求值，
     任务永不自动开始）�?真实 evaluateCondition 求�?
   - 【竞态·已修】set-system applySetBonus �?apiSystem.call �?await（fire-and-forget—�?
     套装效果与断言竞态，时序不稳）→ async �?await
   - 【死代码·已修】status-system getCurrentGameMinutes 恒返�?0（tick_interval 检查永假，
     所�?tick_effects 静默死代码）�?�?gameTimeToTotalMinutes 真实时间
   - 【示�?bug·已修】任�?reward �?add_item 参数�?item→itemId（物品静默加不进）；
     打坐指令 effects �?advance_time �?time_cost 重复推进（时间双倍，8:00�?:00）；
     任务�?auto_start_condition（此前无法启动）
   - 【新增】执行链路测�?7 条（useItem/打坐指令/tick/任务 auto_start→objective→reward/
     套装幂等/条件路径）——全部真实生效断言；存档测试改显式构造数据（不依赖运行状态，
     执行链路中初始状态会自然到期�?
   - 【教训】vitest 测试间状态共享（�?beforeAll 实体系统）——套装测试先被移�?路人生成
     流程触发�?20 已生效）�?幂等断言；存 before 值须在副作用前（对象引用原地修改�?
   执行链路验收: typecheck �?/ test 529 通过 ✅（47 文件，连�?2 次）/ validate 4/4 / 扫描 0 违规
   系统完整性审计（2026-08-09，用户「问题可能源于系统没�?没建好」）✅：
   - 【已确认建好】unlocks 技能树（ability-progression:83）、NPC 初始位置（character-system
     home_locations 最高权重）、NPC AI 移动（activity/time_rules/加权随机）、quest 步骤
     dialogue/combat/objective/reward/condition/goto/scene、save 自动存档（autoSave 已实现）
   - 【标记·勿局部修补（2026-08-09 用户指示：系统由用户系统性补齐，测试遇不全不�?正常）�?
     - 套装系统：定�?激�?加成已有，但失去件精确移除未实现（脱装备加成残留=已知缺口）�?
       钩子式效果未做（TODO Phase 11）——set-system 已标�?⚠️ 标记
     - 地图系统：平�?parent+graph+移动 ✓，�?exits 字段仅校验未启用（语义未定，
       待地图系统设计）——example-mod 地图文件已标�?
     - quest objective：kill_count/collect_items 匹配�?true（半成品，事件到达即推进�?
       ——quest-system 已标�?⚠️ 标记
     - quest spawn 步骤空实现（�?next）；kill_count 依赖 combat payload 扩展�?
       sandbox 超时（phase-15）；H 系统 TODO 群（睡眠/无意�?群交面板/监狱/宝珠等）
   - 【回退记录】上轮曾局部补全三处（collect_items 累计/exits 接入可达�?套装反向移除），
     按用户指示回退为标记状态——相关测试断言同步删除（quest-objective.test.ts 移除�?
     集成测试 exits/套装移除断言移除�?
   完整性审计验�? typecheck �?/ test 529 通过 ✅（47 文件�? validate 4/4 / 扫描 0 违规
   再度复检�?026-08-09，用户「不通时看是否仅是对应系统没做完」）✅：
   - 【确认已建好】start_scene/start_quest effect（quest 启动方式）、quest scene �?
     （嵌�?scene pop 回父）、dialogue startConversation（进�?渲染+node effects 执行）�?
     narrativeLog 查询
   - 【新增测试】对话树执行链路：startConversation �?dialogue 模式 + start 节点 lines 渲染
     + choices 交互条目�? 选项）——示例对话树"能进"已验�?
   - 【新增标记·勿局部修补】：
     - dialogue selectChoice 已导出但未注�?API/事件通道（插件禁直接 import �?UI 无法调用�?
       对话分支推进不可达）——dialogue-system ⚠️ 标记
     - inventory tags 驱动指令半成品（�?gather 占位：无交易指令、herb 硬编码未校验）—�?
       inventory-system ⚠️ 标记
     - NPC spawn 记录未做（每次进入地点重复生成路人，数量膨胀）——character-system ⚠️ 标记
     - name_generator JS 脚本未支持（character-system TODO�?
   - 【复检结论】示例全链路可用部分（加�?字段/指令/物品/状态tick/任务auto_start→reward/
     套装激�?条件路径/对话进入/存档）全部真实生效；不可达部分均为已标记的系统半成品
   复检验收: typecheck �?/ test 530 通过 ✅（47 文件�? validate 4/4 / 扫描 0 违规
   example-mod 注释字段字典增强�?026-08-09，用户以 fresh 作者视�?grill 注释）✅�?
   - 【问题】注释只�?能写"不讲"能填什�?怎么�?来自哪或自由�?在哪消费/与哪挂钩"
     ——如 talents.tags 用户疑惑"只能 1 个？体质哪定义的？随便填？在哪消费？"
   - 【查证答案】talents.tags=自由数组无引擎消费（分类用）；talents 生效字段 =
     state_adjusts/favorability_adjusts/favorite_position（h-core 消费�? 条件引用�?
     abilities.tags �?combat-wuxia/ability-progression 按标签查询（未启用则无人消费）；
     abilities.effects（被动生效）/max_level=0/xp_per_level 数组；attributes type �?
     number/string/boolean、category 可自定义（落 entity.{category}）；experience 80
     不在已知键位（示�?80�?=皮肤经验�?0=皮肤绝顶经验）；first_times 键预定义
     V/A/U/W/M/OTHER/KISS；marks 定义�?attributes category=mark；指令新字段 category
     （旧 type 兼容�? premises 来源=h-core 注册前提；scene 自由命名+触发方同名匹配；
     items type/use/attack_bonus 字段；meta dependencies 真实示例补上
   - 【产出】example-mod 10 个文件注释升级为"字段字典"式（每字段：取�?来源/消费�?
     自由或枚举），关键位置带 ⚠️ 提示；集成测�?experience 键位断言同步�?0�?�?
   - 【教训】PowerShell 5.1 Set-Content �?UTF-8 文件会乱码（两次损坏 TS 文件）—�?
     文件写入必须�?write 工具，勿�?PowerShell 重写含中文的文件
   注释增强验收: typecheck �?/ test 530 通过 �?/ validate 4/4 / 扫描 0 违规
   example-mod 写法变体扩展�?026-08-09，用户「单个示例让人以为只能这么写」）✅：
   - 【目的】每类字段给 2+ 种有区别的写法，侧面提示"还可以这么写"——x 种写法都合法
   - 【真实新增条目】货郎（�?template 全量写——不继承也合法）、猎户（abilities 完整
     {level,xp} 对象含初�?xp + inventory 对象写法自动转数组）、酒量（等级型天�?max=3）�?
     情义值（第二关系类型）、力竭（debuff + on_apply_effects + �?tick）、铁�?草药
     （weapon attack_bonus / material �?use）、饮酒指令（effect_blocks 字符串引用写法）�?
     打探消息支线（talk_to objective 链路）、集�?spawn（overrides 变体�?
   - 【注释变体】attributes（string/boolean/自定�?category）、abilities（max_level=0
     无等�?+ xp_per_level 数组 custom）、talents（生效字�?A/B/C/D 四写法）、items
     （type/加成字段）、status-effects（tick 有无/stackable/duration=-1）、roster
     （对�?vs 数组 vs 简�?vs 完整）、地图（单文件多地点 vs 多文件）、对话树
     （分�?自动跳转/终端三形态）、npc（names vs overrides�?
   - 【测试背书】集成测�?+2：变体断言（货�?猎户 xp 保留/对象转数�?effect_blocks 指令/
     支线注册/新增定义�? 支线 talk_to 链路（dialogue:end �?reward 好感�?10�?
   - 【教训】测试断言避免 mod.xxx['中文'] 索引（扫描器当属性引用误报）—�?
     �?Object.keys + toContain
   写法变体验收: typecheck �?/ test 532 通过 ✅（47 文件�? validate 4/4 / 扫描 0 违规
   关系系统 v2�?026-08-10 grill 定稿 + 实施）✅�?
   - 【设计】有向关系（不自动双向）+ 双维度（种类×档位�? 三档（正�?中立/负面=1/0/-1�?
     纯三档无程度——只影响行为阈值，推导做在武侠 mod�? 两型（sentiment 数�?+ relation 三档�?
     类型=端对×端（pair+side，对称省略）/ reverse 默认同名换端 / groups 集中定义（含 {pair} 引用�?
     称呼两层（panel 成对�?+ address 单方称呼，按性别运行时生成）
   - 【引擎】mod-loader（RelationTypeDef/PairDef/GroupDef + 三段加载 + 三档转换（字符串�?1/0/1�?
     非法�?error�? validateRelations throw + reverse 不对�?warning + 组展开）；
     core/relation-display.ts（称呼生成纯算法）；condition.ts 聚合路径
     （any/any_positive/any_negative + 括号参数 + group: 展开 + 聚合括号保护）；
     condition-registry（聚合模板注�?+ 参数校验 setRelationData + extractFieldPaths 参数保护）；
     character-system（setRelation 字符串档�?removeRelation/getRelationPanel/Address +
     relation:added/changed/removed 事件）；effect-system（modify_relation 分类型设�?+
     remove_relation）；h-core 默认 relations.toml（内�?7 pair 词表 + 血亲组�?pair 引用）；
     gameContext/GameContext 注入 relationGroups；restoreFromSave 恢复�?
   - 【测试】relation-system.test.ts 15 条（转换/非法/组展开/pair 校验/reverse warning+自动推导/
     称呼 panel+address/聚合求�?参数校验/API+事件）；集成测试 +1（段誉两父示�?聚合条件/
     称呼/事件 payload�?
   - 【示例】example-mod relations.toml 三段示范（sentiment+三档端对+对称+纯类�?reverse+
     自定�?pair sworn + 自定义组死对头）+ 角色数据段誉两父模式（角色示�?�?山贼_张三/猎户
     父母子女（为小）+ 对方反向�? 夫妻单边
   - 【文档】AGENTS §23 关系数据格式重写 + §6 事件域表�?relation；character-schema §3.5 关系节；
     mod-file-guide §7/§11；plugin-author-guide character API �?
   - 【修复过程】TOML 中文裸键（血�?须加引号）；kind 默认 sentiment（未声明不转换）�?
     parseModData 顺序（relations 加载�?characters �?�?补全转换遍历）；
     evaluateCondition 聚合括号保护（否则被当逻辑分组）；扫描�?STRUCTURAL_NS �?mod 关系命名空间
   关系系统验收: typecheck �?/ test 548 通过 ✅（48 文件�? validate 4/4 / 扫描 0 违规
   关系系统自查�?026-08-10，用户「检�?bug/静默错误」）✅：
   - 【静默错误·已修】类型名恰叫 any/any_positive/any_negative 时被聚合处理抢先吞掉
     （单类型查询 `relations.b.any == 1` 返回 false）→ resolveValue 对象分支顺序调换�?
     `part in current`（类型名）优先，未命中才尝试聚合 + 测试（关键字冲突用例�?
   - 【缺陷·已修】normalizeRelations 非法�?error 无文件名（错误铁律：精准报文件名）→
     �?file 参数（parseModData 补全遍历�?mods/{mod}/characters/；运行时生成无源留空�?
   - 【确认无碍】聚合括号保护（evaluateCondition 不被当逻辑分组）；负数字面量限�?
     �?= -1 触发算术检查——既有行为，负面查询�?< 0，AGENTS §23 已注明）�?
     组空展开（mod 无类型引�?pair �?组空 �?聚合�?false，数据问题非 bug）；
     聚合段误用于�?relations 对象 �?返回默认 false；无括号聚合在类型名存在时让�?
     （part in current 优先）；存档/restore 三档数值兼�?+ relationGroups 恢复�?
     sentiment 型（kind 未声明）不转换；reverse 检查仅 kind=relation
   关系自查验收: typecheck �?/ test 549 通过 ✅（48 文件�? validate 4/4 / 扫描 0 违规
   关系链路复检�?026-08-10，用户「链路通不通、加改删�?bug、半成品依赖标记」）✅：
   - 【链路测试·新增】集成测�?+2�?
     �?关系链路：modify_relation（relation 型设档，字符�?负面"/数�?1）→ �?+ relation:added/
       changed 事件；remove_relation �?条目删除 + relation:removed
     �?寻仇指令（example-mod 新增示范：聚合条�?any_negative(group:死对�? 的完整指令链路）�?
       未结�?condition 拦路不执�?�?结仇后执�?�?选中角色体力 -10
     存档三档保留 + restore 后聚合条件仍可用（relationGroups 恢复）并入存档闭环测�?
   - 【测试发现·非 bug】selected 双通道：condition 求值读 gameContext.selectedCharacterId�?
     effect target=selected �?execCtx.uiStore.selectedCharacterId（产品路径由 bridge 同步一致；
     测试需两处都设——已在测试注明）
   - 【半成品依赖·标记不修】口上系统（dialogue-system）不监听 relation:* 事件—�?
     "B 成为�?A �?父亲�?类关系变化口上当前无法由事件触发；quest objective �?relation
     类型。依�?dialogue/quest 系统补齐（勿局部修补）
   关系链路验收: typecheck �?/ test 551 通过 ✅（48 文件�? validate 4/4 / 扫描 0 违规
   复杂条件组合复检�?026-08-10，用户「组�?组组�?与或非是否走通」）✅：
   - 【新增测试】复杂组�?6 条：两侧组合（A 负面�?&& B 血亲组）、括号分组内嵌聚合�?
     非运算、聚�?普通属性混合、组+类型混合参数、两层括号嵌套——relation-system.test.ts
   - 【真 bug·已修 1】括号嵌套聚合：占位符表在分组递归中丢失（递归层还原把 \u0001n\u0001
     替换成空，括号内嵌聚合的条件静默损坏）→ evaluateCondition 重构为闭包共享占位符�?
     （evalExpr 递归共享 aggPlaceholders�?
   - 【真 bug·已修 2】`(true && true) == true` 左值字面量：分组递归把子表达式替换成
     'true'/'false' 后，evalSimple 把左�?'true' 当字段路径解析（resolveValue 返回 0 �?
     比较静默错误）→ evalSimple 左值字面量直接取值（既有缺陷，复杂组合暴露）
   - 【确认无碍】①-�?组合（无括号嵌套）重构前已正确；�?两层括号修复后通过�?
     既有 condition/condition-registry 测试零回�?
   复杂组合验收: typecheck �?/ test 552 通过 ✅（48 文件�? validate 4/4 / 扫描 0 违规
   复杂组合二次复检�?026-08-10，修复后边界验证）✅�?
   - 【新增测试】边�?6 条：三层括号嵌套 / !作用于聚�?/ 单层 (x)==true 字面�?/
     与或优先级（||外层&&内层�? != 聚合结果 / 内层 false 字面量组�?+
     condition-registry 复杂表达式校验（含未定义�?�?ok:false）——全部一次通过
   - 【确认无碍】占位符闭包共享（evalExpr 递归）覆盖：多层嵌套聚合同一表达式�?
     ! 前缀（还原先�?evalSimple �?! 递归）�?true/!false 替换顺序、evalSimple 左�?
     字面量（true/false 比较、与数值混合不崩）
   二次复检验收: typecheck �?/ test 553 通过 ✅（48 文件�? validate 4/4 / 扫描 0 违规
   关系系统手册�?026-08-10，使用手册铁律）✅：
   - 【新增】docs/relation-system.md 独立使用手册（按系统手册统一结构）：
     做什�?关键概念（有�?双维�?纯三�?端对/多关系）/ relations.toml 三段数据格式/
     角色数据写法（字符串档位/段誉两父/反向 warning�? Mod 作者使用（条件路径含行为推�?
     典型用法/修改 effect/称呼�? API/事件（含 relation:* 口上待补标记�? 校验规则�?
     与其他系统交互（条件引擎/effect/事件/存档/契约�? 参考索�?
    - 【索引】master-todo 顶部参考索引注�?relation-system.md
    手册验收: typecheck �?/ test 553 通过 �?/ validate 4/4 / 扫描 0 违规
    跟随系统�?026-08-10，grill 定稿复刻 erArk is_follow）✅�?
    - 【新增】src/plugins/follow-system/（plugin.toml + index.ts + premise/follow.ts）：
      API follow（isFollowing/getMode/setMode/invite/end/getFollowers/isControlled）�?
      事件 follow:started/ended（reason: instruction/fatigue/offline）�?
      条件字段 character.{id}.following/follow_mode（实体顶层镜像字段，�?sp_flag.is_follow 单点同步）�?
      效果 set_follow（等�?erArk 363/365）、前�?6 个（TARGET_IS_FOLLOW �?+ NO_TARGET_OR_TARGET_CAN_COOPERATE
      身体状态检查忠实复刻）、瞬移同步（location:enter payload 新增 from，priority -100 先于对话 greet）�?
      疲劳解除（可选绑�?hp �?）、强制跟随（mode 2 每小时）、离线归零、时停冻结、greet 口上抑制
    - 【新增】character-system 离线生命周期（前置）：setOffline/setOnline/isOffline +
      character:offline/online 事件 + AI 跳过 offline + init 读档不重�?+ follow isControlled 跳过
      （character-system 通过 API 查询，可选依赖降�?false）；h-core/hidden/status offline 清理�?TODO 钩子
    - 【新增】dialogue-system registerSceneCharFilter（通用场景角色过滤钩子，follow 注册 greet�?
    - 【重构】h-hidden 隐奸开始改�?follow API（曾直写 sp_flag.is_follow，绕过事件与镜像字段�?
    - 【新增】src/plugins/native-instructions/ 骨架（系统级原生指令唯一数据家；follow/end_follow
      指令复刻批次落地于此，chat/rest 届时�?h-core 迁入�?
    - 【新增】docs/follow-system.md 使用手册 + plugin-author-guide API 速查（follow 命名空间 +
      dialogue registerSceneCharFilter + character 离线三方法）
    - 【核心修复】plugin-manager createContext events.on 转发 priority 第三参（types 已声明此前丢失）
    - 【测试】follow-system.test.ts 16 条（全插件加载集成：状态机/事件/瞬移/疲劳/强制/冻结/离线/
      前提矩阵/set_follow/口上抑制/payload from/条件字段�? character-system.test.ts 4 条（离线生命周期）；
      test-mod 新增 test_girl 专属口上（greet 抑制测试用）
    - 【范围外】mode 3 砍掉（方舟专属）/ mode 4 TODO（召唤，IS_FOLLOW_4 前提注册提醒�? 困倦度
      （睡眠系统后�? 助理睡醒跟随（方舟概念）/ follow_count 上限（erArk 死字段）/ follow_bias（阶�?4�?
    跟随系统验收: typecheck �?/ test 573 通过 ✅（50 文件�? dev 冒烟
     NPC 行为系统�?026-08-10，grill 定稿复刻 erArk NPC AI）✅�?
    - 【新增】src/plugins/npc-ai-system/：行为块时间模型（behavior{id,type,start_time,duration}�?
      erArk character_behavior�? 前提权重目标搜索（searchTarget：getWeightSum 求和语义 + layer 分层 +
      轮内缓存 + get_first_only + 无候选延后重试）/ 行为状态机�? 种日常处理器注册表：
      wait/stay/move/rest/sleep/work/entertainment/socialize/wander；缝切方案——固定常量进 TOML�?
      状态依赖计算进处理器）/ 工作娱乐排班（time_rules �?工作 auto_ai �?娱乐三时段，erArk 顺序�?
      前置门控（tired 标记/监禁禁移�?跟随接管，可插拔注册表）/ 带耗时移动（map findPath dijkstra�?
      行为完成结算（on_complete_effects 数据驱动 + move 到达 npc:arrived�? 窗口自动结算
      （erArk get_true_add_time：行为窗口∩玩家窗口；疲�?饥饿/尿意/休息恢复/睡眠积累�?
      wait_flag pin（交互中不结算）/ 同地叙事 / 每日欲望结算（core newday-settle 归位�?
    - 【core 前置】game:time_advanced 事件（advanceTime 窗口末尾发）/ conditionEngine（getPremiseValue
      + premiseWeight 求和语义，与口上 weightAllToOne 区分�? skip-registry（通用跳过谓词注册表：
      npc-ai 注册 dead/offline/unconscious，combat-base 注册 in_combat�? realtime-settle 导出
      settleTired/settleUrine/settleHunger + sleepPassSettle（睡眠逐段结算�? sleepSettle 提取共享
    - 【重构归位】character-system 瘦身（AI 移动 + NPC spawns 移出，保�?API/生命周期/关系）；
      NPC spawns �?npc-ai spawns.ts；core newday-settle.ts 删除（欲望增�?�?npc-ai dailySettle）；
      command-executor NPC 实时结算循环删除（npc-ai time_advanced 统一�?
    - 【数据】插件默认层 data/default/（ai-behaviors.toml 9 规格 + ai-targets.toml 4 目标�?
      mod definitions/（ai-targets 累积�?/ ai-behaviors/ai-work/ai-entertainment 字段�?deepMerge）；
      test-mod 演示：站岗工�?+ 喝酒娱乐 + guard 排班数据
    - 【API】npc-ai 命名空间：getBehavior/getState/setBehavior/isSkipped/registerBehaviorHandler/
      registerPreCheck；事�?npc:behavior_started / npc:arrived；条件字�?character.{id}.state /
      current_behavior（实体顶层镜像，L3 引擎独占�?
    - 【文档】docs/npc-ai-system.md 使用手册 + plugin-author-guide（npc-ai + map findPath�?
      master-todo 顶部参考索�?+ AGENTS §13（性能模型修订：全量同�?阈值分帧，否决追算�?
      §23（角�?地点关联扩展�?
    - 【测试】target-search.test.ts 8 条（权重/分层/缓存/延后/get_first_only/未知前提�? 
      npc-ai-system.test.ts 11 条（初始决策/窗口结算/排班/连锁移动到达/门控/战斗冻结/pin/
      每日结算/500 NPC 性能冒烟�?
    - 【范围外/后置】H �?NPC AI（handle_npc_ai_in_h，依�?H 成熟度）/ NPC 自然�?wake 侧（daily_reset/愤怒，erArk 仅玩家睡眠时
      update_sleep 全员执行——待 L1.7 睡眠系统�? 助理问安（目标前提数据实现，无机制位�?
      follow_bias（关系前提目�?= mod 内容�? 监禁送宿舍（原地等待简化）
    NPC 行为系统验收: typecheck �?/ test 597 通过 ✅（51 文件�?1 �?npc-ai 集成 + 8 条目标搜索）/
      三层合规扫描（无跨插�?import、core 零玩法逻辑�?
    �?行为期随机事件系统（2026-08-10，复�?erArk event.py——grill 16 项决�?+ 计划
      docs/superpowers/plans/2026-08-10-random-event-system.md）：
    - core/random-event.ts 通用引擎（行为桶/adv 分桶/前提权重候�?加权随机/trigger_guard/
      全时+今日触发记录/{self.X} 插值）+ mod-loader events 数据桶（definitions/events/*.toml
      按行为分文件，累积式�? save-system gameState provider 注册表（插件段随存档�?
    - plugins/random-event-system：玩�?execution_end / NPC behavior_started 挂钩（玩�?
      current_behavior 镜像自维护）、地点门控（文本需同地�?静默全地点）、子事件选项
      （open_son_options 非阻塞挂�?+ EventOptionBar 选项�?UI + bridge 同步）、系统效�?
      （noop/record_event/record_event_today/set_interactant 五种/interrupt_activity）�?
      文本插值（talk-common 词库 + 实体占位符）、每日记录重置、存�?provider
    - 文档：docs/random-event-system.md 手册 + ADR-0008 + plugin-author-guide random-event �?
    - 测试：core 14 条（分桶/权重/守卫/记录/插值）+ 集成 7 条（玩家/NPC 触发/门控/静默/
      选项�?记录/插�?存档接线）——全�?637 通过 �?
    - �?erArk 有意偏差（ADR-0008）：多层事件/10008 效果/群交开�?跳过口上 = 数据零使�?
      死代码不实现；DIY 指令独立规划；远�?NPC 文本事件需同地点（mod 免写位置前提�?
    随机事件系统排查修复�?026-08-10，用户「检查是否有 bug 或静默错误」）✅：
    - 【修复·静默·高】validateEventData �?onLoad 执行——初始化顺序（插�?onLoad �?mod 加载
      �?插件 onEnable）下 getMod() �?null，挂载键校验永不生效 �?移至 onEnable + 挂载键改�?
      commandRegistry 查询（native 指令�?commandRegistry 而非 mod.instructions，原校验会误�?chat�?
    - 【修复·静默·高】远�?NPC 静默事件的效果数值文本泄漏到叙事日志（玩家看不到 NPC 却看�?
      "体力 -2"）——npc-ai 行为完成效果�?_silent:!sameLocation + narrative_output 过滤�?
      事件效果缺同样处�?�?playerSees + 过滤 + _silent
    - 【修复·中】registerSystemEffects 重复注册�?throw（effectTypeRegistry 拒绝重复）→
      HMR/测试重载场景插件被禁 �?has 检查幂�?
    - 【修复·低】玩�?current_behavior 写入后补 character:changed（其他系统监听刷新）
    随机事件系统链路/架构审查�?026-08-10，用户「检查链路不通、架构不合理」）✅：
    - 【修复·链路·高】玩家移动事件断点——move 指令只打开地图界面（map 模式）不�?
      commandExecutor，实际移动走 gameContext.moveTo �?�?execution_end 挂钩永收不到
      移动完成信号 �?移动事件改由 location:enter {from} 触发（到达信号）+ execution_end
      跳过 move（防"打开地图就触发移动事�?�? location:enter 挂钩�?clearPendingOptions
      （防 map 模式连续移动遗留过期选项�?
    - 【修复·链路·中】player_target_to_me �?UI 同步断点——bridge �?selectedCharacterId
      watch 单向（uiStore→gameContext），效果只改 gameContext �?UI 选中不更�?�?
      效果广播 random-event:select_character，bridge 监听 �?uiStore.selectCharacter
    - 【修复·架构·中】most_desire 硬编码中文属性名 '欲望�?（违反属性名铁律）→ ATTR.DESIRE
      常量（entity-utils）；顺手�?npc-ai dailySettle 同款硬编�?
    随机事件系统第三轮排查（2026-08-10，用户「再检查一次」）✅：
    - 【修复·静默·高】NPC 选项在玩家指令结算中挂起（advanceTime �?settle-pass）→
      execution_end 挂钩无条�?clearPendingOptions �?玩家从未见到选项就被丢弃 �?
      清挂起移�?execution_start（玩家主动行�?= 放弃，Q15 语义�? NPC 选项保留�?IDLE
    - 【修复·静默·高】游戏内读档后挂起选项残留（pending + 选项�?UI 不清）——旧选项�?
      恢复后的游戏状态执行语义错�?�?restoreFromSave 广播标准事件 game:load（AGENTS 标准
      事件表补实现），插件�?pending + bridge 清选项�?UI
    随机事件系统第四轮排查（2026-08-10，用户「再审查检查一遍」）✅：
    - 【修复·静默·高】事�?condition 运行时抛错中断整个事件系统——事件的 condition 无加载时
      校验（ai-targets/指令才有）→ collect �?try/catch 单事件跳�?+ validateEventData �?
      condition 字段合法性校验（引用未注册字�?�?warning�?
    - 【修复·静默·中】事件前�?strict=false 静默放行未知前提（拼错前�?id = 少一个条件，
      �?npc-ai target-search strict=true 不一致）�?strict=true 淘汰（数据错误显式暴露为
      "事件不触�?�?
    - 【修复·静默·低】NaN 权重静默选中最后候选（weightedRandom total=NaN fallback）→
      Number.isFinite 过滤；restore(undefined) 抛错 �?默认参数
    - 【修复·低】saveGame �?provider serialize 单段失败会中断存�?�?try/catch 隔离
    - 【修复·低】校验扩展：type/side/trigger_guard/adv 非法�?�?warning（加载时显式暴露�?
    随机事件系统第五轮排查（2026-08-10，用户「再检查一次吧」）✅：
    - 【修复·静默·中】未知前�?strict 淘汰是静默的（事件不触发�?mod 作者不知道为什么）
      �?补全局去重上报（npc-ai target-search reportOnce 同款），注册表快照每 collect 一�?
    - 确认无问题：game:load 无其他监听者（新增 emit 无副作用）；'event' 日志类型 UI 正常
      渲染；插�?onEnable 顺序（data_dependencies 拓扑 + 字母序）保证 native 指令先注册；
      前提缓存对事件系统价值低（每�?pick 单一行为桶，前提不跨事件共享）——与 target-search
      （多目标共享前提）不同，不引�?
    NPC 行为系统排查修复�?026-08-10，用户「检查是否有 bug 或静默错误」）✅：
    - 【修复·静默】nearbyLocations apiSystem.call 恒返�?Promise—�?玩家所�?相邻优先当轮"
      永不生效（相邻永不加入）�?await �?
    - 【修复·静默】AI 目标 condition 用全局上下文——selected.* 解析�?UI 选中/undefined�?
      mod �?`selected.current_location == 'X'` 目标静默淘汰 �?AI 上下文注�?
      selectedCharacterId=被决�?NPC（self 引用语义，文�?测试�?
    - 【修复·静默】move 寻路失败（不可达地点）→ 等待 30 分钟且不报错（静默失败）�?
      去重上报（同 NPC+目的地只报一次，上限 200 条）
    - 【修复·逻辑】排班时段闭区间 [start,end] 与娱�?工作半开不一致—�?2:00 仍算"在班"�?
      班末+1 小时 �?统一半开 [start, end)（schedule/workHandler/AI_WORK_TIME/文档+边界测试�?
    - 【修复·逻辑】minutesUntilHourSafe �? 兜底�?班末 1 分钟"�?24 小时（静默超长工作）�?�?
    - 【修复·逻辑】stayHandler �?<5 分钟顺延�?下一小时"——[20,23] 规则 23:58 越界到次�?
      01:00 �?改为待满 5 分钟
    - 【修复·逻辑】sleepHandler 最�?60 �?30�?:30 �?30 分钟小睡被拉长）
    - 【修复·逻辑】AI_WORK_TIME 前提闭区间（与排班不一致）�?半开
    - 【补漏】H �?NPC（sp_flag.is_h）缺跳过谓词——日�?AI 会与 H 会话竞争 �?注册 in_h 谓词
    - 【防御】resolveDuration 下限 1 分钟（duration=0 �?无限连锁�?
    - 【清理】followGate 死代�?API 调用（apiSystem.call �?Promise，同步分支永不执行）/
      freshStart 死变�?/ skip-registry �?if / index/schedule 防告�?export hack / 死导�?
      behaviorEndTime/getBehaviorData
    - 【测试�?5 条边界回归（12:00 不在�?/ workHandler 半开 / stayHandler 5 分钟 /
      sleepHandler 30 分钟 / selected.* self 引用�?
    排查修复验收: typecheck �?/ test 602 通过 ✅（51 文件�? validate 4/4
    第二轮排查（2026-08-10，用户「再检查：bug/静默错误/链路错误/不合理」）✅：
    - 【修复·静默·重要】AI 前提注册在模块顶层副作用 + registerAiPremises 空壳——测试隔�?
      模组重载�?conditionEngine.clear() 之后前提永久丢失，前提目标（go_home_night 等）
      静默失效（链路测试当场暴露：searchTarget 结果 wander 而非 go_home）→ 全部注册
      移入 registerAiPromises()（onLoad 调用�? 回归测试（clear 后重载前提存在）
    - 【修复·链路】玩家不在场�?NPC 行为完成效果里的 narrative_output 泄漏到叙事日�?
      （_silent 只挡结算摘要）→ 不在场过�?narrative_output
    - 【修复·链路】门控接管（监禁/跟随等待）不宣告行为变更——NPC 状态陈�?�?announceBehavior
    - 【补缺·设计】默认夜间睡眠无"先回�?——NPC 在酒馆原地睡，home_locations 形同虚设 �?
      新增 go_home 处理�?+ go_home_night 目标（层 39�? AI_NOT_AT_HOME 前提（erArk 睡宿舍语义）
    - 【清理】minutesUntilHourInRange 死包装导出；"8 �?注释过时�?10 �?
    - 【文档】手�?§3.1 完成效果三条注意（narrative_output 过滤/condition �?selected.*
      �?UI 选中/�?advance_time 重入）；§9 前提�?+ 默认目标�?
    第二轮排查验�? typecheck �?/ test 604 通过 ✅（51 文件�? validate 4/4
    第三轮排查（2026-08-10，用户「再审查：bug 与静默错误」）✅：
    - 【修复·静默·重要】AI 目标引用未注册前�?拼错条件字段路径——strict 规则/条件默认�?
      把它�?*静默淘汰**（目标永不触发且零痕迹）�?运行时去重校验：未知前提 �?上报一次；
      条件字段路径 validateExpression 校验 �?上报一次；条件表达式抛�?�?去重上报
      （此前每 NPC �?pass 刷屏�?
    - 【补注册】condition_fields 增加 character.{id}.current_location——手册推荐的
      selected.current_location 写法此前不在条件字典（会误报/校验失败�?
    - 【测试�?3 条（未知前提去重上报/拼错字段上报/合法字段不误报）+ resetSearchReports
      测试隔离导出（修复去重集合跨测试泄漏——同 id 目标第二次校验被跳过�?
    第三轮排查验�? typecheck �?/ test 607 通过 ✅（51 文件�? validate 4/4
    第四轮排查（2026-08-10，用户「再看看」）✅：
    - 【修复·链路】pendingQueue 合并 bug——持续超预算时未入队 NPC 永不结算（行为静�?
      过期）→ �?pass 合并 上轮遗留 + 本轮全员（对象引用去重）
    - 【清理】behavior-block �?export（EntityData�? 文档"9 �?过时�?10 �?
    第四轮排查验�? typecheck �?/ test 608 通过 ✅（51 文件�? validate 4/4
    第五轮排查（2026-08-10，用户「再检查一遍」）✅：
    - 【修复·真 bug】in_h 跳过谓词�?sp_flag.is_h（按 erArk 字段名猜）——本引擎 H 标志
      实际�?h_state.is_h（h-core 写入）→ 谓词永不触发，H �?NPC 照常跑日�?AI �?
      �?h_state.is_h + 集成回归测试（H 中冻�?解除恢复�?
    - 【修复·静默误报】tiredGate 对无"体力"属性的角色（getEntityAttr 缺失返回 0）恒�?
      HP�? �?sp_flag.tired 永远 true �?�?hasAttr 存在性检�?
    - 【补校验·静默失效】validateAiData 新增：角�?work_type/娱乐类型引用存在性�?
      time_rules 时段格式（[start,end) 0-23）与目标地点存在性、工种时段格式—�?
      非法/缺失引用此前静默不生�?
    第五轮排查验�? typecheck �?/ test 608 通过 ✅（51 文件�? validate 4/4
    第六轮排查（2026-08-10，用户「确认无 bug 与静默错误、链路错误」）✅：
    - 【修复·静默刷屏】前�?handler 抛错上报未去重（坏前�?× 500 NPC × �?pass = 刷屏�?
      �?reportOnce 去重（与未知前提/条件抛错一致）
    - 【验证·端到端】新增昼夜循环链路测试（两段真实节奏 pass�?3:00 go_home→sleep �?
      6:00 起床 �?8:00 上班 �?11:00 在班；断言位置/行为类型/疲劳削减/饥饿积累/时间线连续）
      ——验证过程确认：�?pass 内连锁决策用 pass 时刻上下文是 erArk 固有语义
      （cache.game_time 固定），非缺陷；测试场景必须拆真实节�?pass，手册已注明
    第六轮排查验�? typecheck �?/ test 609 通过 ✅（51 文件�? validate 4/4
    偶发失败排查�?026-08-10，用户「跑一下测试」）✅：
    - 【观察】全量测试偶�?1 �?"1 error"�?98 tests）与 1 �?"1 failed"�?08）—�?
      连续 4 次复跑全�?51 文件 / 609 测试通过；singleFork 串行 + 高负载下
      重集成文件（全插件加载，单文�?40-50s）接�?60s 超时边缘
    - 【修复·负载敏感断言】npc-ai 500 NPC 性能冒烟 `elapsed < 3000` 放宽�?8000
      （唯一�?npc-ai 引入的负载敏感断言；预�?100ms/�?+ 后续轮兜底，上限只验证不失控�?
    - 【结论】无代码级失败；偶发为单 fork 串行 + 负载波动（既有测试基础设施特性）
    偶发排查验收: typecheck �?/ test 609 通过 ✅（51 文件）连�?4 �?
   dev 控制台噪音清理（2026-08-10，用户「npm run 报很多错」）✅：
   - 【噪音·已修】premise-registry 重复注册 console.warn 删除——同名覆盖是设计特�?
     （mod 插件覆盖通用插件前提，mod-override 运行�?override�? 插件重复加载（HMR/测试�?
     是既有场景——警告纯噪音；语义保�?后者覆�?
   - 【噪音·已修】test-mod contract_demo �?params 字段删除（L2 教学 warning）—�?
     test-mod 是测试模组应保持 0 warning，L2 教学已在 example-mod 注释说明
   - 【噪音·已修】test-mod 顶级地点 town_square"不可�?warning——maps/graph 加反向边
     （tavern→town_square）；mod-loader.test.ts 图断言同步�? 条边�?
   - 【结果】validate 两个 mod �?0 warning；dev 控制台干净
   噪音清理验收: typecheck �?/ test 553 通过 �?/ validate 4/4 / 扫描 0 违规
   加载画面（方�?B�?026-08-10，用户「加载空白十几秒」）✅：
   - 【背景】main.ts 在引擎初始化完成后才 mount Vue——loadMod+插件加载期间 #app 空白
   - 【占位】index.html 内联 #loading-screen（闪�?加载中�?文字，CSS animation）—�?
     Vue mount 替换 #app 自动消失；纯静态零 JS 侵入
   - 【mod 可配】meta.toml 新增可选字�?loading_image（图�?GIF�? loading_video（视频优先）�?
     路径相对 mod 根（素材�?mods/{mod}/assets/）；mod-loader 透传�?LoadedMod�?
     main.ts loadMod 后把素材插进 #loading-screen（video autoplay muted loop playsinline�?
   - 【fallback】未声明素材 �?保持闪烁文字占位（不报错）；素材缺失�?04）→ 仅视�?图片
     不显示、文字层仍在（DOM 结构保留文字�?
   - 【文档】AGENTS §39 meta 字段�?+ example-mod meta.toml 注释示例 + index.html 注释
   加载画面验收: typecheck �?/ validate 4/4 / dev 冒烟正常
   物品系统复刻�?026-08-12�? 任务计划 docs/superpowers/plans/2026-08-12-item-system-replication.md）✅�?
   - 【Task 1】mod-loader loadItemDefs：目录拆分（definitions/items/*.toml + data/default/items/*.toml�? 单文�?items.toml 兼容 + mod 文件间同 id 重复 �?error（文件名+行号）；插件默认层与 mod 覆盖合法（deepMerge mod 优先�?
   - 【Task 2】inventory useItem 消耗语义：consume 默认 true 先扣 1（数量不足拦截不执行 effects 返回 false）、consume=false 只执�?effects、targetId 参数（_targetIds 优先）；removeItem 返回 boolean（h-core body_item_equip 半成品注记依赖）
   - 【Task 3】body_item 归还语义（grill Q4）：装槽=占用（背�?1）、manual/h_end 卸下归还�?1）、expiry/射精/即时药不归还
   - 【Task 4】H 原生物品�?h-core 默认层（data/default/items/{h-drugs,h-toys,h-special}.toml，润滑液/媚药/跳蛋/安眠�?避孕�?玩具/避孕套）；test-mod �?4 个武侠失误物品（healing_potion/iron_sword/leather_armor/herb），服装/绳子保留
   - 【Task 5】use 注册表（src/core/use-registry.ts：BUILTIN_USE_TYPES self/target/equip/gift/key + 插件注册）；校验：body_slot�? �?body_auto_remove �?error；use 未注�?consume �?boolean/price/level/time_cost �?number �?warning
   - 【Task 6】礼物基础�?give_gift effect（h-core）：favor（calcFavorability+calcTrust 管线+话术修正�?apology（愤怒清�?好感+10+好意+10�?drug（effects 链表达）/mold �?TODO；test-mod 玉佩/道歉�?
   - 【Task 7】文档收尾：docs/item-system.md 重写（schema 全字段表/分层/消耗语义表/校验规则�?礼物/文件索引�? inventory-system.md API 更新（useItem/removeItem 签名�? mod-author-guide 物品字段协议 + give_gift 登记 + AGENTS.md items 目录拆分�?
   - 【已接线】expiry 到期自动清槽（第二轮审计，h-core hour_changed 监听）；【范围外】商�?采集交易/倒模（mold�?咖啡加料——TODO 登记 item-system.md §�?
   物品系统验收: typecheck �?/ test 全量通过 �?/ validate 全绿 / 扫描 0 违规
```

### 下一步（2026-08-09 定稿，串行顺序）:
```
1. 【B1 剩余 23 条】用户筛�?�?逐条复刻（SOP 每批工作�?+ 自动前提展开 §4.1 + 属性存在性核对—�?
   迁移时查 docs/instruction-replication/erark-attr-ledger.md"这个 erArk 字段我们怎么处理�?�?
   �?每条�?30 分钟分析+实现；sleep 特殊耗时（跨天跳转）L1.7 处理�?
   �?未映�?effect id 90 个（对账表附录）遇之必走两步路径翻译（constant_effect.py �?default.py�?
2. B2 obscenity 37 条（前提/判定已就绪）
3. B3-B6 sex 142 条（延后�?H 场景 UI 就绪，spec §8�?
```
```
tech_adjust 结算保真补全�?026-08-08，grilling 定稿后执行）�?
  - 体位修正（chara_feel_state_adjust:314-325）：h-config [sex_positions] 12 体位系数（蓝�?Sex_Position.csv�?
    + getFeelExtraAdjust 扩展（V/A/U/W 有体�?+系数 / 喜欢体位 +0.5 / 子宫�?+2，玩�?current_womb_sex_position==2�?
    + 12 体位喜好天赋（favorite_position 字段，talents.toml 已有定义补字段）+ settle/position.ts
    （经�?141-152 �?00 �?h_scene execution_end 懒授�?叙事，G2 决策）；types.ts current_womb_sex_position +
    current_sex_position 默认�?-1（对�?erArk game_type.py:463 无体位语义）
  - pain 系列独立 effect（settle/pain-adjust.ts，erArk default.py:8255-8680）：
    pain_by_lubrication(121) / pain_by_part(122-125，U base=1000/W base=100/W子宫奸�?) /
    feel_by_sex(131-134，A欲情只用 size—�?8552 源码原样) / pain_to_h(135)；移�?get_pain_adjust
    （attr_calculation.py:635-678）；全走 settleOneState 管线（settleOneState 新增 externalAbilityLevel
    参数支持快感 sqrt(目标感度×外部等级)�?
  - PL_P 系列（pl_p_adjust�?20 纯技�?/ 141-146 技巧�?+指技舌技足技胸技膣技肛技，default.py:8239-8252/8683-8725�?
  - 射精欲重构（ADR-0006）：删除 tech_adjust/settle_state 内联 (tc+50)×技�?P�?8（来源不明、行号失效）
    �?orgasmJudge 二段结算�?pending_orgasm_feel[3] �?射精�?+= 100+int(射精欲�?.4)（Second_effect.py:657-679�?
    per-character 泛化）；h-core �?h-ejaculation API（getEja/addEja，settle/eja.ts）写入，h-core 不再直接碰字�?
  - 尿道方案A（ADR-0004）：ORGASM_PART_ATTR/PART_PREFIX/ORGASM_PART_SENSITIVITY/PART_EXP_ID �?partId 6�?
    attributes 尿道 display=false；默认不定义尿道感度/扩张；指令保持砍掉（master-list 标注更新�?
  - 兽部全砍：tech_adjust/settle_state �?part/state=兽部 �?warning+跳过（防静默写死属性）；转换脚本不产出
  - 口喉欲情用自身感度（ADR-0005，不复制 erArk ability[7] 上游 bug，default.py:8178/8210�?
  - 转换脚本修正（scripts/convert-erark-instructions.cjs，Behavior_Effect.csv 453 ID 全链核实）：
    70→eja_add（原误映射恐怖）/ 44→eja_add_target / 41-48 base 30�?0�?4 非快感！�? 120/141-146→pl_p_adjust
    target=self / 121-135→pain 新类�?/ 115 等肛肠→后穴（引擎属性名�? 119 兽部不产�?/ 111→胸�?112→阴�?
    （原 111 皮肤/112 胸部 错位）；重新生成 archive（OUT_DIR 环境变量�? 效果合并脚本保留手工策展 premises
  - 新增 23 测试（体�?7 含懒授予/pain 6/PL_P 3/eja 3/尿道绝顶 1/兽部 2/未知部位 1�?
  - 复查修复�?026-08-08 第二轮）：position.ts 懒授予死循环 bug（经验≥100 时天赋永不授予——getFavoritePosition
    推导值误判为"已授�?）✅；execution_end 二段结算监听器提�?handleExecutionEnd + 只注册一次守�?
    （plugin-manager loadPlugins 无幂等守卫，重复 onEnable 会双�?eja/绝顶）✅；eja_add/eja_add_target 补退缩门�?
    （judge_check retreated 时效果链应整体跳过）✅；转换脚本 70 �?target='self' 并重新生成合�?archive ✅；
    兽部 warning �?'兽部快感' 别名 �?
  - 合规审计�?026-08-08 第三轮，逐项对照 erArk 源码）：
    【发现·已修】tech_adjust 欲情分支漏攻略进度修正（chara_base_state_adjust:455-458 正面状�?+fall×0.05�?
    settle_state 路径�?fallAdj 但手写公式漏）→ �?getFallLevel(target)×0.05 + 测试
    【核实一致】体�?12 系数�?Sex_Position.csv 逐一相同；tech_adjust 快感全成分（sqrt/催眠/眼罩/无觉/
    群交/怀孕灌�?体位/喜欢体位/子宫�?max(0)/tenths/连续减值）；pain 四效果逐条；PL_P 两式；eja 三公式；
    getPainAdjust 表；尿道绝顶链与其他部位一致（只差经验 ID 216�?6，已核实�?
    【记录·非本次引入】连续减值条�?所有非自己目标（erArk 仅玩家交互对象，群交有差异，预先存在）；
    时停�?eja/射精无时停抑制（既有）；转换 866-868 insert_position 13/14/15 与引�?0-4 错位（预先存在，
    808-817 部分碰巧正确）；orgasm �?411 隐奸暴露/415 储电/997 未实现（既有范围）；体位经验 141-152 �?
    erArk 无写入点（未接线功能，引擎机制为超集�?
    【TODO·待指令批次】体位经验链路接通（用户决策：等 B2-B6 指令批次时定）：
      erArk 死功能确认——体位经�?141-152 全库无写入点（所�?base_chara_experience_common_settle 调用�?
      指令效果链、事件数据、AI 逻辑均无），settle_favorite_sex_position �?经验�?00 自动授予"分支永不触发�?
      喜好天赋 250-261 无其他授予点 �?erArk 正常游玩"喜欢体位+0.5"恒不生效�?
      引擎机制已全部就绪（h_experience 任意 expId / grantFavoritePositionIfDue 懒授�?/ getFeelExtraAdjust
      +0.5，均有测试），仅差数据链路。接通方案（引擎自定义规则，erArk 无依据）�?
      - 给经验对象：被使用�?NPC（settle_favorite_sex_position 读被结算角色经验的意图）
      - 哪些指令：性交类（V/A/U/W 性交 12 体位 + 换体位指令），体�?N �?exp 140+N，每次行�?+1
      - 实现位置：转换脚本自动附�?h_experience（从 set_field current_sex_position 推导�?
  验收: npm run typecheck ✅（仅遗�?main.ts App.vue 预先错误�? npm run test 445 通过 ✅（41 文件�?
  TODO 遗留（依赖未实装系统，同 spec §5.3）：信物/系统难度修正、调香（明确不做）、u_orgasm 漏尿
  （排尿系统）、体位经验自动授予的叙事文案�?narrativeLog（对�?erArk 文案�?
```
L1.6 前置改动（spec §10，B1 开工前一次做完）�?
  - loader 收敛: h-instructions/ 双路�?�?�?instructions/（插件默认层 + mod 层按 id 去重，mod 胜出�?
    h-instruction-loader.ts 删除，并�?instruction-loader.ts；h_ 前缀移除
  - HInstruction 接口扩展: erark_id/erark_behavior/judge_base/judge_class/tags/condition
    loader 自动注入 judge_check（有 judge_base 时置顶）
  - judge_check/calcJudge 对接: calcJudge �?judgeClass 参数 �?�?hConfig [judge.adjustments] �?
    h-config.toml 新增修正表（性交-250/A性交-350/W性交-400/亲吻-125，instuct_judege.py 逐行翻译�?
    未实装修正项（月�?体位/旅馆/他人/助理/H打断/监禁/睡眠/激素）�?TODO 注释
  - 位置前提迁移: 8 �?IN_* handler 删除 �?location.tags（对照表 docs/instruction-replication/location-tags.md�?
  - 引擎耗时机制: timeCost<=0�?1=handler 自定义耗时）不自动推进时间、不进结算公�?
  - UI 分类开�? CommandBar 动态收集已存在，补全排序（play/work/arts/system�?
  - 清理: mods/_erark_source/ �?docs/instruction-replication/archive/_erark_source/
  - 顺带修复: typecheck 基线错误 12 处（未用 import/ExecutionContext.sourceId 等）
  验收: npm run typecheck �?/ npm run test 266 通过 �?/ dev 启动无报�?�?

Code review 修复�?026-08-08 子代�?review）✅
  - loader 兼容 spec schema：category/sub_category 规范名（type/sub_type 旧别名兜底）
  - 单条指令注册失败（id 重复）→ errorReporter + 跳过，不拖垮 h-core（原�?throw 禁用整个插件�?
  - 天赋个性修正按 erArk 门控 S 类判定：亲吻(D) 不吃 淫乱/性好�?性冷�?性无知（instuct_judege.py 162-178 行）
  - game:execution_end �?clamp 后耗时�?1 不再外泄�?h-hidden/h-pregnancy�?
  - 同层指令 id 重复 �?warning；缺 time_cost / 孤儿 judge_class �?warning
  - 修正条件解析失败 �?errorReporter（原静默吞）
  - 新增 4 测试（S类门控判�?单条失败隔离/executor premises/timeCost -1）→ 270 通过
  验收: npm run typecheck �?/ npm run test 270 通过 �?

二次深度审查修复�?026-08-08，静默bug/架构/完整性）�?
  - 条件绕过消除: DailyMenu/ScreenNumpad 原来 evaluateCondition: ()=>true（静默执行风险）
    �?新建共享求值器 src/ui/utils/command-eval.ts，三组件同源；executor fail-safe�?
      �?condition/premises 但调用方无求值器 �?warning + 跳过（禁止静默放行）
  - 加载时校验（AGENTS §21�? condition 引用未注册字�?�?error + 注销该指令；
    premises 未注�?�?warning（去重）；hConfig adjustments 修正条件 �?error
    - 因插�?condition_fields/premises �?onEnable 后才注册，新�?game:plugins_loaded
      生命周期事件（plugin-manager 全部 onEnable �?emit），校验延迟到该事件
  - condition-registry: 新增结构路径 pattern（location.tags.{tag}/talents/abilities/
    factions/status/relations/first_times/experience/body_parts/base/inventory�?
    validateExpression()（selected./target. 归一化校验）
  - judge_check 多目�? 最坏者胜出合并（retreated>partial>success），防静默覆�?
  - condition.ts 根路径只在位�?生效（防深层字段遮蔽，如角色字段名叫 player�?
  - h-config adjustments 条件改显式结构路径（target.talents.性无知）
  验收: npm run typecheck �?/ npm run test 274 通过 �?/ dev 启动无报�?�?

三次深度审查修复�?026-08-08，round-3：条件引擎真相对齐）�?
  - selected 根路径修复（重大）：gameContext.getContext() 从未提供 selectedCharacterId �?
    bridge 同步选中角色（watch uiStore.selectedCharacterId �?gameContext.setSelectedCharacterId�?
    （talk/open_selected_panel �?`selected != null` 之前�?false——指令永久死亡，现已修复�?
  - 条件引擎 null/undefined 右值支持（`selected != null` 存在性检查，不再抛错→恒 false�?
  - 能力记录终端解包为等级（AGENTS §36 {level,xp} 数据契约）；对象数组单段 id 匹配（status.醉意 存在性）
  - 字段别名机制：core 条件引擎保持通用，插件注册别名（status-system 注册
    status→status_effects / remaining→remaining_duration，gameContext.setFieldAliases�?
  - validateExpression 去掉根白名单：插件自定义根（combat.in_progress）直接精确校验；
    数字/负数字面量不误判
  - judge_check 空目�?fail-closed（retreat+警告）；mergeJudgeResult 提取纯函�?单测�?
    settle_hp_mp �?canApply 门控（与兄弟 settle_* 一致）
  - executor 前提/条件检查包 try/catch（前�?handler 抛错不再逃�?execute()）；
    command-eval 去掉 player 兜底（与 resolveTarget('selected') 语义一致，�?HAVE_TARGET 假通过�?
  - ScreenNumpad ctx 补齐（api/engine/sourceId）；engine-ui-bridge createExecutionContext 换共享求值器
  - effect_block 未知引用 �?warning；CommandDef 增加 tags 字段透传（spec §3�?
  - game:plugins_loaded 监听器防重复注册
  验收: npm run typecheck �?/ npm run test 281 通过 �?/ dev 启动无报�?�?

四次深度审查修复�?026-08-08，round-4：跑通性验证）�?
  - 真浏览器启动 bug：main.ts 手动重复注册 locations（loadMod 内部已注册）�?
    "实体 location:town_square 已存�? 启动即失败页 �?删除重复注册
  - era-engine.config.toml 从未被读取（active_mod 死配置，切模组无效）�?main.ts 读取
    active_mod�?raw 导入 + @iarna/toml，缺省兜�?test-mod�?
  - meta.toml starting_location/player_character 死字段（AGENTS §39 文档化但未加载）�?
    LoadedMod 加载 + main.ts 使用（起始地�?玩家实体�?mod 声明�?
  - 新增 boot 冒烟测试 src/plugins/boot-smoke.test.ts（镜�?main.ts 全量插件加载）：
    插件 onEnable 全部成功（move/talk/do_h/end_h 存在性强断言）、指令注册、校验无误报
  - instruction-loader 幂等保护（onEnable 重跑不再重复注册刷屏�?
  验收: npm run typecheck �?/ npm run test 288 通过 �?/ dev 启动无报�?�?

五次深度审查修复�?026-08-08，round-5：测试审�?+ 判定链路�?bug）✅
  - 【重�?pre-existing bug】effect-system 每效果新�?handlerCtx 拷贝 �?judge_check 写入�?
    _judgeResult 后序 settle_* 读不�?�?canApply �?true �?判定退缩从不阻止结算！
    （judge_check/settle_favorability/trust/state/hp_mp 全链路静默失效）
    修复：handlerCtx = Object.assign(execCtx, ...) 共享同一执行上下�?
  - 新增端到端判定测试（effect-system + h-core onLoad + executor 全链路）�?
    退�?�?settle_state 跳过（快乐不变）+ 退缩日志；已吻 �?判定成功 �?settle_state 生效�?0�?
  - phase-h 测试自足化：mod 加载测试前置 entitySystem.clear()（消除顺序脆弱依赖）
  - 测试审查发现：setEntityAttr 找不到命名空间时写直接属性（测试角色未按
    applyAttributeDefaults 初始化导致的假失败——测试已镜像真实初始化）
  验收: npm run typecheck �?/ npm run test 289 通过 �?

六次深度审查修复�?026-08-08，round-6：链路验证）�?
  - 新增链路冒烟测试 src/plugins/chain-flow.test.ts（真�?点指�?的全链路）：
    rest �?时间+60min/恢复效果/场景口上；do_h �?H开�?�?end_h 结束（模式栈往返）�?
    talk �?占位输出；整批无 error
  - 新增 bridge 叙事链测试（narrativeLog.write �?eventBus �?bridge �?gameStore�?
  - 链路验证中发现并修复�?
    - 测试 mock �?selectCharacter（talk handler 依赖）——真�?uiStore 有，产品�?bug
    - talk-common API 注册�?onEnable（async）——plugin-manager �?await，产品无 bug
    - rest 无选中目标�?2 �?"target='selected' 无选中" warning——test-mod 数据设计
      （搭档恢复效果），B1 �?rest 时按 target 条件�?
  验收: npm run typecheck �?/ npm run test 294 通过 ✅（32 文件�?

七次深度审查修复�?026-08-08，round-7：静默错误排查）�?
  - 【静�?bug】dialogue pickMatchingLine 不求值替�?{id} 占位�?�?character.{id}.好感�?
    解析为查找角�?'{id}'（恒不存�?�?条件�?true）：好感度条件失�?+ 无条件台词被随机遮蔽
    �?substituteId() 替换后求值（premise( 分支同样处理�?
  - executor finally �?checkTalentGain 无防�?�?异常会逃�?execute()（UI 点击崩）
    �?try/catch + errorReporter
  - settle_hp_mp �?.catch(()=>false) 吞真实错�?�?只忽�?插件未注�?（与 judge_check 一致）
  - 链路测试升级：h-core onEnable 用真�?eventBus（execution_end 二段结算监听器真实注册）
    + 新增"H 中执行指�?�?body_item_tick + orgasmJudge 不崩"测试
  - 角色口上分支测试（{id} 判别：好感度 50 �?'哦，是你�?�?0 �?'你是何人'�?
  - �?flaky：test-mod greet 两行条件互斥（原无条件行 + 随机�?�?断言 flaky�?
  验收: npm run typecheck �?/ npm run test 296 通过 ✅（6 连跑稳定�?

B1 试点：chat�?004）完整复刻（2026-08-08，用户要求最小化验证，先单条后整批）�?
  - 批次清单 docs/instruction-replication/batch-01-daily.md�?4 条总览 + chat 深度分析
    （判定四�?无判定（handle_chat �?judge�? 前提 4 已注�?1 新注�?/ 效果�?7 ID 两步路径逐条 /
     time_cost=5（Behavior_Data.csv �?-1�? 无位置前提）
  - chat TOML �?src/plugins/h-core/data/default/instructions/daily.toml（插件默认层，mod 可覆盖）
    失败�?成功链用 [effect_blocks]（TOML 内联表不能跨行，块名引用�?
  - 新增引擎效果（h-core）：
    - chat_settle：复�?handle_chat（talk_count 衰减/分支/递增，settle_behavior.py:560-581�?
    - talk_add_adjust：复�?501 TALK_ADD_ADJUST（default.py:5813，话术加�?+ talk_time 记录�?
  - 新增前提 NO_TARGET_OR_TARGET_CAN_COOPERATE_OR_IMPRISONMENT_1
    （语�?handle_premise/__init__.py:834；未实装子系统留 TODO：监�?睡眠/外勤等）
  - 修静�?bug：calcFavorability 亲密项用数字�?33（abilities 按名�?�?�?0）→ 改按�?'亲密'
  - �?话术技能（erArk ability 40）到 h-core 默认 abilities.toml
  - 新增 6 测试 src/plugins/instruction-chat.test.ts（成功链�?7 ID 数�?失败�?同日衰减/跨天归零/话术门槛/�?error�?
  验收: npm run typecheck �?/ npm run test 302 通过 ✅（33 文件�?

L1.6 结算保真补全�?026-08-08，tenths_add/连续减�?无意识门控三件套）✅
  - tenths_add（common_default.py:233-240）：settle_state 全局生效——追�?min(3×基础�? 当前�?10)�?
    当前�?0 时无影响（chat 既有测试数值不变）
  - 连续重复指令减值（common_default.py:210-231/569-589）：引擎新增执行历史
    behaviorHistory（command-executor 记录，上�?8 条）+ getContinuousAdjust（第 3 �?0.7 �?5 次触�?0.4�?
    �?settle_state（非负面/非自己）/ settle_favorability / settle_trust（仅正收益）全部生效�?
    基础指令 wait/move/rest 不衰减（erArk instruct 0/1/2�?
  - 无意识门控（common_default.py:196-208/551-557）：时停部分（sp_flag.unconscious_h===3）—�?
    settle_state 心智状�?心理快感跳过、favorability/trust 不结算、settle_hp_mp 不结算；
    睡眠/无意识留 TODO（L1.7�?
  - 系统难度/信物修正 �?�?TODO（依赖系统未实装，同 spec §5.3�?
  - 新增 15 测试 src/core/settle-fidelity.test.ts；chat 测试�?beforeEach 历史隔离
  验收: npm run typecheck �?/ npm run test 317 通过 ✅（34 文件�?

结算保真审查�?026-08-08，三件套架构核查）✅
  - 接入架构确认：三件套全部�?settle_* effect 类型�?�?所有指�?TOML 引用这些类型即自动生�?
    （chat 已受益；B2-B6 �?SOP 映射同样自动获得），无逐指令接线负�?
  - 【审查发现·已修】settle_state 无意识门控只�?ids[0]——多目标（群�?战斗 all_enemies）时
    其他目标门控静默失效 �?�?per-id（新增多目标测试，直接调 handler�?
  - 【审查发现·已修】tech_adjust 三件套缺�?+ 两处公式偏差（B3-B6 大量依赖，必须前置）�?
    �?欲情误用 sqrt(部位感度×欲情)——erArk state 12 非快感分�?= base×ability表[目标.部位感度]
    �?部位感度�?abilities[part]�?皮肤'）——能力实际按名存 '皮肤感度'，恒 undefined �?感度等级
       从未生效（静默）�?新增 PART_ABILITY 映射
    �?�?tenths_add/连续减�?无意识心理门�?
  - 【已修】tenths 当前值改 getEntityAttr 跨命名空间读�?
  - 登记 TODO：tech_adjust 的素�?调香/催眠敏感/体位/信物/难度修正（依赖未实装系统，同 spec §5.3）；
    body_item_tick/二段结算在时停下的行为（B3 前核�?second_behavior.py�?
  验收: npm run typecheck �?/ npm run test 322 通过 ✅（34 文件�?

第二批结算保真：素质修正数据�?+ 催眠敏感�?026-08-08）✅
  - 数据化设计（用户确认架构）：修正写入 talents.toml 天赋定义字段，TS 查定义表动态应用—�?
    加新天赋 = �?TOML 一行，�?TS 改动（talents.toml 解析�?mod.talentDefs，TalentDef 接口补字段）
  - state_adjusts（状态系数加法，erArk common_default.py:379-422）：13 天赋
    勤劳/懒散/教官（习得先导±）、脆�?坚强/献身（恭顺屈服）、热�?孤僻（好意快乐）�?
    羞�?开放（欲情羞耻）、施虐狂（先导）、受虐狂（苦痛）、感情缺乏（states=["*"] 全部 -0.4�?
  - favorability_adjusts（好感系数，erArk :717-748）：爱情隶属�?8 个（love1-4 组二选一累计）�?
    受精/妊娠/临盆（preg 组）、感情缺�?讨厌男性（无组）、博士信息素 3 个（pheromone 组取最高，新增定义�?
  - calcFavorability 重构：乘法混合链 �?erArk 全加�?fix 链（int(fix×base)）；死键 getFallTalentLevel 删除
  - 催眠敏感：settle_state（欲�?快感 +2 系数�? tech_adjust（快�?sqrt �?+2、欲�?+2），
    数据 ch.hypnosis.increase_body_sensitivity（h-hypnosis 既有字段，实体数据共享合规）
  - 调香（aromatherapy）→ 不做（香薰系统粗筛已砍）；calcTrust �?MVP 简化版，天赋修正随其完整复刻登�?TODO�?
    体位修正（Sex_Position 系数/喜欢体位/子宫�?怀孕灌肠加成）�?B3 批次清单时一并做
  - 新增 10 测试（素质修�?4/催眠敏感 2/好感素质 4�?
  验收: npm run typecheck �?/ npm run test 332 通过 ✅（34 文件�?

calcTrust 完整复刻�?026-08-08，用户纠正：禁止擅自简化）�?
  - �?trust.ts �?MVP 简化（duration/60 × 好感系数）——擅自简化，已废�?
  - 完整复刻 erArk calculation_trust（common_default.py:752-813）：fix 全加法链
    （亲�?快乐刻印/屈服刻印 +0.2/级，苦痛/恐怖刻�?-0.3/级，反发 -1.0/�?+ 素质修正数据化）
    trust = add_time/60 × fix（float，erArk 同）�?0 乘连续减值；封顶 300 �?SettlementContext 统一钳制
  - 测试更新（phase-h-integration calcTrust�?0/60�?.167�?0�?、思慕�?.25�?
  验收: npm run typecheck �?/ npm run test 332 通过 ✅（34 文件�?

快感附加修正 + 死键修复�?026-08-08，用户纠正：漏报的简化项）✅
  - settle_state/tech_adjust �?chara_feel_state_adjust:300-347 全部位修正：
    眼罩 +0.2（body_item slot 6�? 无意识时无觉刻印 +(adj-1)×2 / 群交 +0.02×人数(cap10)
    / V/W 怀�?inflation +1、灌�?enema_capacity×0.2
  - settle_state �?base 分支群交 +0.05×人数�?444-450）；tech_adjust 欲情补素质修�?群交
  - 苦痛转化�?242-245）：pain_as_pleasure �?心理快感 ×施虐系数（tenths_add=False），settle_state 实现
  - 死键修复：newday-settle abilities[33]�?欲望'、前�?TECHNIQUE_GE_3 abilities[30]�?技�?
  - 空气催眠置零（好�?信赖 fix=0，unconscious_h==5 + 空气催眠位置）→ TODO：h-hypnosis
    空气模式存在�?air_hypnosis_position 字段未实现（h-hypnosis:230 门锁 TODO），依赖缺口非擅自简�?
  - 体位系数（Sex_Position pleasure_coefficient/喜欢体位/子宫奸体位）�?B3 批次清单时做（已确认�?
  - 新增 5 测试（眼�?无觉/怀孕灌�?苦痛转化/欲情素质�?
  验收: npm run typecheck �?/ npm run test 337 通过 ✅（34 文件�?

�?5/7 项二次审查（2026-08-08，用户要�?完整准确"逐项核对）✅
  - 【审查发现·已补】extra_feel_settle（common_default.py:484-515）完全未实现�?
    恭顺(顺从�?)/先导(施虐�?)/羞�?露出�?)/苦痛(受虐�?) �?心理快感 max(10,final/20)×内层系数 + 心理经验(155)
  - 【审查发现·已补】攻略进度素质（:455-477）：正面状�?+fall×0.05 / 负面 -fall×0.2（fall=爱情/隶属系最高级�?
    attr_calculation.py:891 get_character_fall_level�?
  - 【审查发现·已补】系�?max(0) 钳制�?353/:479）——此前缺�?
  - 【审查发现·已修】苦痛转化内层公式：�?tbl[施虐] 单系�?�?sqrt(心理感度×受虐) + feel 附加修正
    + 内层连续减�?+ 无意识门控（:242-245，ability=36 受虐非施虐）
  - 【审查发现·已修】settle_state 快感状�?abilityKey 死键�?皮肤' �?PART_ABILITY 映射 '皮肤感度'
    �?1~58 效果�?stateAbility 映射逐条核对全部正确：习得→技�?恭顺→顺�?好意→亲�?欲情→欲�?快乐→快乐刻印）
  - 浮点误差行为�?erArk 一致（1-4×0.2 �?floor=6，Python int() 同值）
  - 新增 5 测试（fall 修正 2/extra_feel 2/快感能力映射 1�?
  验收: npm run typecheck �?/ npm run test 342 通过 ✅（34 文件�?

�?5/7 项三次审查（2026-08-08，settle_state �?common_default.py:154-515 逐行并排）✅
  - 【审查发现·已修】连续减值的"基础指令跳过"是误读——erArk `last_instr in [0,1,2]` 为死代码
    （behavior_id 是字符串恒不匹配，character_behavior.py:127 + Behavior.py 全字符串）→
    一切指令（wait/move/rest）都参与衰减；删�?BASE_INSTRUCTIONS；HISTORY_MAX 8�?0（erArk 10 条）
  - 【审查发现·已补】刻印状态专用系数表 get_mark_debuff_adjust�?374-378 + attr_calculation.py:581-598）：
    快乐/屈服/苦痛/恐�?反感 5 状�?0�? / 1�?.5 / 2�? / �?�?（不�?ability_lv_adjust！）
  - 【审查发现·已补】dead 门控�?180-181/:548）——settle_state/settle_favorability/settle_trust 死亡不结�?
  - 【审查发现·已补】数值上限：好感�?100000（character_handle.py:395/:403）、通用状�?99999�?249�?
    �?SettlementContext.clampValue（信�?300 已有�?
  - 新增 4 测试（mark_debuff 3/dead 1；连续减值测试改�?一切指令衰�?�?
  验收: npm run typecheck �?/ npm run test 346 通过 ✅（34 文件�?

�?5 轮审查（2026-08-08，实现代�?链路/静默错误角度）✅
  - 【审查发现·已修】激素维度错误：博士信息素（304-306）是**发起�?*天赋（erArk calculation_favorability:737-741
    character_data.talent），此前在目标身上查 �?玩家激素修正静默失�?�?favorability_adjusts �?on="initiator"
    （数据化），calcFavorability/calcTrust �?initiatorId 参数，settle_favorability/talk_add_adjust/settle_trust 传入 sourceId
  - 【审查发现·已修】h_experience �?canApply 门控：退缩时经验仍结算（与其�?settle_* 不一致）�?�?
  - 【链路确认】apiSystem 未注册错误消息含 namespace �?�?群交查询 catch 条件正确（可选能力静默）
  - 【登�?TODO】退缩替代行为链（erArk handle_instruct.py:334-349：判定失�?�?LOW/HIGH_OBSCENITY_ANUS/KISS_FAIL/
    DO_H_FAIL 替代行为，非中止）——当�?跳过全部效果"为近似；extra_feel 的经�?155 不计�?settlement 日志
  - 新增 3 测试（激素发起�?2/trust 门控 2�?
  验收: npm run typecheck �?/ npm run test 349 通过 ✅（34 文件�?

chat 端到端审查（2026-08-08，用户要求以 chat 为例查完整�?链路/静默错误）✅
  - 【已修】talk_count 衰减挂载位置：erArk 挂整个行动循环（character_behavior.py:413），原实现只�?
    chat_settle 内衰减（做别的行动不衰减）→ �?decayTalkCount（settle/talk.ts）挂 game:execution_start
    监听（h-core，读 gameContext.selectedCharacterId——bridge 同步链路）；chat_settle 只留分支+递增
  - 【已修】talk_add_adjust�?01）缺 dead/时停门控：时停中 chat �?21 被挡�?501 好感仍结�?�?�?
    （与 settle_favorability 门控一致，时停�?chat 整体冻结：好�?好意/快乐/气力不变，仅经验+talk_count�?
  - 【已修·测试盲区】测�?stub �?engine.emit �?no-op �?execution_start/end 被吞（衰�?二段结算
    测不到）�?三个测试文件改转发真�?eventBus（产品路径：bridge �?gameContext.emit �?eventBus 已确认）
  - 【审查发现·已修·真静默 bug】executeEffects 共享 execCtx：handlerCtx �?Object.assign 会把上一�?
    效果�?_targetIds 写进共享对象（嵌套链 target='self' 后）�?后续�?target 效果读污染值结算到错误目标�?
    �?execution_end �?body_item_tick 调用�?_targetIds �?resolveTarget 默认 'selected' �?ids 恒空
    （H 中震动棒持续快感从未生效）→ 循环外缓�?initialTargetIds，无 target 效果优先用调用方初始�?
  - 新增 2 测试（非聊天行动衰减 / 时停�?chat 冻结）；chat 测试 8 �?+ chain-flow 真实事件路径
  验收: npm run typecheck �?/ npm run test 349 通过 ✅（34 文件�?

chat 边界审查�?026-08-08，第 6 轮：边界/盲区/测试隔离）✅
  - 新增 5 测试：失败链 talk_time 不更新（引用比较�? 话术 1 门槛边界 / 连续 chat 联动
    （talk_time 更新后同小时不衰减）/ 衰减日回退安全 / 前提行为矩阵（无目标/体力1/疲劳200/时停/正常�?
  - 【审查发现·测试隔�?bug】instruction-chat �?resetChars 未重�?sp_flag——「时�?chat」测试设�?
    unconscious_h=3 污染其后所有测试（成功链全挂，产品代码�?bug）→ resetChars 补全字段
    （sp_flag/dead/talents/hypnosis/body_items/h_state，对�?settle-fidelity �?resetNpc�?
  - 期间多轮 debug 定位（事�?stub→门控→canApply→handler→loop 逐层排除），最终确认产品链路无 bug
  验收: npm run typecheck �?/ npm run test 354 通过 ✅（34 文件，chat 13 条）

静默门控可观测化 + 测试公共基座�?026-08-08，用户担忧：门控 continue 静默跳过难排查）�?
  - 新增 src/utils/settle-gate.ts：isSettleGated(ch, context)——dead/时停统一门控，被跳过�?
    console.debug(`[settle-gate] ...`)——门控不再黑箱，浏览�?console debug 级直接可见；
    settle_favorability/trust/talk_add_adjust/settle_state(dead) 全部接入（语义统一防遗�?不一致）
  - 新增 src/utils/test-helpers.ts：共享测试基座——makeTestExecCtx（engine.emit 转发真实 eventBus�?
    + resetCharacterEntity（全字段重置：base/abilities/talents/hypnosis/sp_flag/dead/body_items/
    h_state/experience/action_info�? DEFAULT_NPC_BASE/DEFAULT_PLAYER_BASE�?
    instruction-chat/settle-fidelity 已迁移，新指令测试直接复用（�?各写各的 reset 漏字�?复发�?
  验收: npm run typecheck �?/ npm run test 354 通过 ✅（34 文件�?
  补：chain-flow 也迁移到基座；门�?debug 实测输出（时�?chat �?[settle-gate] settle_favorability/talk_add_adjust 可见）；
  dev 冒烟干净（Vite ready，无 stderr�?

前提"自己/目标"维度修复�?026-08-08，用户质疑：注册≠真实落实——审查盲区命中）�?
  - 【重大发现·已修】erArk 前提�?自己/目标"：无 T_ 前缀查自己（character_data = cache[character_id]），
    T_/TARGET_ 前缀查目标。原 handler 把玩家条件查到了目标上：
    NOT_H/IS_H（玩�?*�?*目标，handle_premise_other.py:1376/:1392）、TIRED_LE_84（玩家，:444）�?
    HP_G_1（玩家，handle_self_not_tired）、TECHNIQUE_GE_3（自己，ability.py:1017）→ 全部修正为玩家维�?
    （getPlayerChar helper：引擎指令仅玩家发起，自�?玩家；NPC 发起需扩展 ctx.sourceId�?
  - 修复�?chat 前提完整语义：玩家（有目�?不在H/疲劳�?34/体力>1�? 目标（可协同或监禁）
  - 新增前提维度测试（玩家在H/疲劳/体力 与目标同字段对比�?
  - 【登�?TODO·B2 开工前】其余前提语义系统核对：FINGER/WAIST_TECHNIQUE（应自己）、HAVE_*物品
    （应自己）、NOW_CONDOM（应自己）、VIBRATOR_LEVEL_*（应自己）、high_*/HIGH_1（erArk HIGH_1
    �?true 是权重前提，我们实现成参数等�?偏离）、premise-fall 数字键死�?
  验收: npm run typecheck �?/ npm run test 355 通过 ✅（34 文件�?

复刻 skill 沉淀�?026-08-08，用户要求：�?chat 全部教训固化为稳定流程）�?
  - 新增 docs/skills/replicating-an-instruction.md：完整复刻一条指令的 6 阶段检查清�?
    （取�?判定/前提语义对象/效果翻译/防静默验�?文档），含常见静默错误速查�?
  - RED 基线 = chat 复刻全程真实失败记录（注册≠语义�?执行≠效果对/测试 stub 盲区/
    reset 漏字�?浮点误差/被砍内容补回�?
  - 已注册到 AGENTS.md 必读清单 + migration-workflow §13 索引
  - GREEN 验证：下一指令 stroke 按此 skill 试运行（验证是否避免同类错误�?

口上系统完整复刻�?026-08-08，spec: docs/superpowers/specs/2026-08-08-talk-system-replication-design.md）✅
  - T1 权重系统：conditionEngine.getWeight（high_N→N + 满足前提�?+ 淘汰 + 空集1）；口上 weight 字段
    （固定权重优先）；triggerScene 同池竞争（scene+character 合并，专属�?0，权重区间随机）；high_N 前提
    修复（原误用"参数等级≥N"�?
  - T2 CVP 静态转换补全：conditionEngine **大小写不敏感**（重大修复——迁移数据小写前�?vs 注册大写
    导致 talk-common 条件静默失效）；getFallLevel 死键修复（数字键→按名查思慕→奴隶）；FALL_LEVEL
    全组合注册（cmp×-4..4）；NE 运算符补丁；47 个未注册前提补齐�?2 可判 + 35 �?false + TODO）；
    condition-registry �?player.abilities.level/player.talents/body_semen 路径；尿道属性补定义�?
    全量数据校验测试（可解析/前提全注�?表达式可校验——静默失效变可检测）
  - T3 行为地文：getBehaviorText（A + B1∪B2 + C1∪C2 三段组合、动作段换行，erArk part 分组确认）；
    混合率（hConfig talk.common_mix_rate 默认30�? **weight�?00 不替换保�?*（erArk talk.py:246）；
    无口上时行为地文兜底
  - T4 版本化口上：�?version + 实体 character_text_version�?=不启用）
  - T5 无意识屏蔽：时停目标只出 unconscious 前提口上（场景通用无条件也淘汰，erArk :224-237�?
  - T6 特殊情境加权：hConfig [[talk.situations]] 数据化（9 类默�?×5，mod 可覆盖）
  - 新增测试 12 个（权重 4/竞争 4/行为地文 4/版本 1/无意�?1/情境 1�?
  验收: npm run typecheck �?/ npm run test 373 通过 ✅（37 文件�? dev 冒烟干净

口上系统�?7 轮审查（2026-08-08，T1-T6 实现逐项核对 erArk）✅
  - 【已修·真 bug】hConfig 情境配置拼写错误：self_time_stop_orgasm_relaese（多 e）—�?
    erArk 值实际为 relase（SELF_TIME_STOP_ORGASM_RELAESE = "self_time_stop_orgasm_relase"）→
    时停解放情境�?self 前提永不匹配（静默）�?已改
  - 【已修】getWeight �?high_ 判断用原串——大写输入（HIGH_5）时权重语义丢失 �?�?lower 判断
  - 【已修·真简化】talk-common 地文条目均匀随机（pickEntry/getBehaviorText）——erArk �?
    get_weight_from_premise_dict 权重区间随机（high_N 生效）→ weightedCandidates 加权随机
  - 【核对通过】情境加权顺序（基础→专属�?0→情境�?，固定权重也乘）；erArk 9 类集合照�?
    （含 SELF_NOT_PLAYER_DAUGHTER 等原版成员）；版本过滤仅角色层；无意识子串检查为近似（登记）
  - 偶发 vitest 4 skipped（pool 调度，DEPRECATED poolOptions 警告）——重跑稳定，登记观察
  验收: npm run typecheck �?/ npm run test 373 通过 ✅（37 文件�?

口上系统�?8 轮审查（2026-08-08，按计划逐项核对 + 查漏/重复/静默）✅
  - 【计划交付点·漏项已补】T3"短词池合�?common_s"（erArk talk.py:662-665）：_s 短词且非
    penis/hair �?A 段候选并�?common_s �?A 段——此前未实现
  - 【计划交付点·漏项已补】T5"talk_common 无意识处�?（erArk :683-687）：动作类地文在目标
    无意识（unconscious_h>=1）且条件�?unconscious 前提时淘汰；部位类跳过无意识检查——此前未实现
  - 【重复实现已消除】权重区间随机两处重复（dialogue pickWeightedLine / talk-common pickEntry+
    getBehaviorText）→ �?src/utils/weighted-random.ts 共用
  - 【核对通过】各 phase 与计划一致；无跨层违规；无其他重复造轮子；try/catch 无吞�?
  - 新增测试 2 个（common_s 合并 / 无意识过滤——测试环境补注册 high_1/FALL_LEVEL 前提�?
  验收: npm run typecheck �?/ npm run test 375 通过 ✅（37 文件�?

📌 待办登记�?026-08-08，口上系统相关）�?
  - 【TODO·B3】口球屏蔽：triggerScene 目标口球时屏蔽口上（除口球相关行为）—�?
    erArk get_weight_from_premise_dict:239-244（self_now_gag/target_now_gag 且行为不�?GAG 集）
    �?依赖 B3 口球系统（body_item slot 14 = gag 已有）落地时�?
  - 【已办�?026-08-14】erArk 新增地文模块（子宫高潮）：w_orgasm_super×A/B2/C2 已按流程导入
    （见下方 2026-08-14 增量导入记录）；eat 模块用户已砍不导�?

erArk 新地文增量导入（2026-08-14，v0.66 子宫超强高潮）✅
  - 新增：w_orgasm_super（子宫超强高潮）×A/B2/C2（各 300 条，纯新增模块）
  - 流程：convert-erark-talk-common.cjs --incremental（仅生成 3 个新文件）→
    migrate-premises-prefix.cjs --write�?30+120 �?文件：premises: �?premise() 新语法）
  - 【脚本修复】migrate-premises-prefix.cjs 早退条件补单段前提分支（�?`�?&` �?return�?
    单段 `premises:X` 不转换——本�?120 �?文件因此漏转，已修：�?premises: 也进入转换）
  - 前提集与现有 orgasm 模块一致（73 个唯一前提，无新增未注册）�?未改任何前提注册
  - 校验：talk-common-data.test.ts 4 �?+ talk-common-behavior.test.ts 全绿�?1 通过�?
  - 现有文件零改动（git status �?3 个新�?TOML�?
  验收: npm run typecheck �?/ talk-common 校验测试 11 通过 �?

erArk 新地文增量导入（2026-08-08�?2 个新模块文件）✅
  - 新增：a/b/c/m_orgasm（肛/�?阴蒂/口绝�?4 档）×A/B2/C2 + w_orgasm（子�?3 档）+
    v_orgasm_super + body/clitoris + body_part/clitoris_s；eat 按用户已砍排�?
  - 脚本�?--incremental（跳过已存在输出文件）；�?STATUS_MAP（阴�?阴茎�? TALENT_MAP
    （泌�?小臀/普臀/巨臀/羞耻）——修复新 CVP 的静态转�?
  - 【注意·用户需知晓】v_orgasm_normal/small/strong�? 个已跟踪文件）被 erArk 源更新：
    条目 175�?57、{Name}→{target.name} 变量修正——本次已重转为新版（git diff 可审计）�?
    如需回滚：git checkout -- <文件>
  - vitest.config �?hookTimeout 60s（数据量翻倍致加载超默�?10s �?测试文件整体 skipped�?
  - 校验测试全绿 + 新模块验证测试（w_orgasm 组合/clitoris 部位短词�?
  验收: npm run typecheck �?/ npm run test 376 通过 ✅（37 文件�? dev 冒烟干净

chat/口上系统专项验证 + 全部修复�?026-08-08，用户要求验证两部分�?bug/静默错误与架构）�?
  基线：typecheck �?/ test 376 通过�?7 文件）——架构三层分�?�?/ 无跨插件 import �?/ 测试数值断言扎实
  【已修·真 bug】混合率路径行为地文未插值：dialogue-system 混合率命中时 {penis}/{target.name}
    原样输出叙事日志（fallback 路径�?interpolateLine，混合率路径漏了）→ 补插�?+ 测试断言无占位符
  【已修·真 bug】TARGET_NOW_SEX_TOY_* 语义错误（premise-instruct.ts）：WEAK 误为 1-3（应 ==1）�?
    STRONG 误为 >=4（vibrator_set 上限 3 �?�?false 死键，应 ==3）、MIDDLE 缺失（应 ==2�?
    ——对�?handle_premise_H.py:3206/3229/3241；新�?premise-instruct.test.ts 行为矩阵
  【已修·真 bug】射�?精液前提�?false：PL_EJA_POINT_*/PL_SEMEN_*/PL_PENIS_* 原注册恒 false �?
    penis 短词池（240 条）全部不可达，行为地文 {penis} 永远原样显示（静默失效）�?�?erArk
    handle_premise_H.py:1448-1664 补真实语义（射精欲阈�?�?00/>600、精液量+额外精液量阈值）�?
    h-ejaculation pl_penis_semen_dirty/not 硬编码角�?'0'（引擎玩�?id 实际�?'player'）→ �?
    gameContext player id
  【已修·架构不一致】刻印能力双轨分裂：h-mark �?mark_{id} 数字键，settle_state/calcJudge/
    h-bondage/h-hypnosis 读按名键�?快乐刻印'）→ 刻印升级对判定修�?状态系数静默失�?�?统一按名�?
    （h-mark 写按�?+ calcFavorability/calcTrust 改按名读）；新增 h-mark.test.ts�? 测试�?
  【已修·违反铁律简化】talk_add_adjust�?01）只�?floor((tc+30)×adjust)——erArk 走完�?
    base_chara_state_common_settle/favorability_common_settle（tenths_add/连续减�?素质/攻略）→
    提取 settleOneState 共用管线 + 501 补全（ability_level = 发起者话术，快乐�?mark_debuff_adjust）；
    顺带修正催眠敏感范围（仅快感+欲情 +2，原全状�?+2 �?erArk 不符）；
    chat 测试断言更新：话�? 好意/快乐 70�?3、话�? 好意 98�?01
  【已修·注释误导�?01 "仅玩家→NPC" 是误读——erArk �?任一方为玩家即结�?（NPC→玩家也结算）→
    h-core 注释 + batch-01-daily §1.5/§1.6 + mod-author-guide 参数协议同步修正
  验收：npm run typecheck �?/ npm run test 382 通过 ✅（39 文件：新�?premise-instruct + h-mark�?
  📌 待办登记：旧存档 mark_{id} 键成为孤儿（pre-release 可接受，随存档迁移机制处理）�?
    chat_settle 嵌套 execute �?ctx 传播契约建议固化�?mod-author-guide（已记录语义，参数表待补�?

erArk 高潮结算更新对齐�?026-08-08，用户提�?erArk 三处改进：orgasm_settle 独立文件/同部位只显示最高程�?退�?H 释放寸止）✅
  - 【无需改】orgasm_settle 独立文件——纯 erArk 内部重构（延迟导入解循环依赖），我们已是独立 settle/orgasm.ts
  - 【已改·roll_count 压缩】解放状态（orgasm_edge==2/3 �?time_stop_release）climax>=3 �?0 次普�?roll + 1 次超强绝顶；
    1-2 �?1 次；非解�?�?每次一条（原解放时�?climaxCount 条输出——静默多输出�?
  - 【已改·releaseOrgasmEdge】新增（对齐 erArk release_orgasm_edge_now，orgasm_settle.py:333-355）：
    endHScene �?h_state 前对所�?is_h 角色释放寸止累计（orgasm_edge_count �?真实高潮结算 + 事件 + 日志），
    原实现直接清 h_state 静默丢弃；单�?群交退出全覆盖
  - 【已改·releaseTimeStopOrgasm】新增（对齐 TIME_STOP_ORGASM_RELEASE，default.py:6764-6800）：
    h-time-stop time_stop_off 原只输出日志无数值（时停累计静默丢弃）→ �?effect 通道
    （release_time_stop_orgasm effect，跨插件禁直�?import）转成真实结�?
  - 【已改·judgeOrgasmEdgeSuccess】失败率 0.2�?.15 + 补多部位幂修�?success^max(1,k/2)（orgasm_settle.py:423-426�?
  - 【已改·寸止计数归属】判�?累计用被结算角色自己�?orgasm_edge_count（原误用玩家——erArk candidate =
    自己累计 + 本次全部部位高潮数，crossed = 本次高潮部位数）
  - 【已改·口上聚合】handleOrgasmResults 日志按部位取最高程度显示一条（erArk orgasm_settle_flag 去重），
    h:orgasm 事件逐条保留（数值消费方�?
  - 【发现并修复·既有 bug】eventBus.emit 防重入保护（emitting 集合）→ handleOrgasmResults 同步连发 3 �?
    h:orgasm 只发 1 条（h-hidden 发现�?h-time-stop 累计静默少算）→ �?async 逐条 await
   - 新增 12 测试 src/plugins/orgasm-release.test.ts（roll_count 压缩 5/释放 3/时停释放 2/幂修�?1/聚合 1�?
  - phase-h 寸止失败测试同步修正（计数归属自�?+ 0.15 边界�?
  验收: npm run typecheck �?/ npm run test 394 通过 ✅（40 文件，连�?2 次稳定）/ dev 冒烟干净
  📌 待办登记：寸止行为口上（{part}_orgasm_edge）与 extra_orgasm 口上尚未接入（B3 H UI）；
    orgasm_edge_off 仍是旧语义置 0（erArk 新增 ORGASM_EDGE_RELEASE 为独�?effect，B3 指令化时接）

高潮结算对齐二次审查�?026-08-08，用户要求审查准确�?完整�?对接）✅
  - 【已修·寸止判定快照】判定移主循环前一次（erArk 结构）——原逐部位判定：后续部位 candidate 含前部位
    刚写入计数，�?erArk 快照语义不一致（超限边界的失败概率偏差）
  - 【已修·失败重结算】只传累计寸�?本次 un_count（原把本�?normal 也传�?�?orgasm_level 多计�?
    erArk 失败时本�?normal 丢弃，下次结算补算等级差）；结算后清空计数（原残�?�?
    退�?H �?releaseOrgasmEdge 二次释放 = 双倍结算）
  - 【已修·技巧等级读法】寸止判定技巧等级原�?getEntityAttr（返�?abilities �?{level,xp} 对象 �?
    �?0，判定静默偏差）�?改按名读 .level
  - 【已修·既有缺口】h_state.orgasm_count 从无写入 �?h-mark 快乐刻印升级条件�?h-group-sex
    结束奖励（体力上�?2/次等）静默失�?�?settleOrgasm 每次真实高潮 [0]/[1] +1（B绝顶喷乳不计入，
    erArk 独立行为 b_orgasm_to_milk�?
  - 新增 3 测试（寸止成功快�?orgasm_count 写入/喷乳不计数）；phase-h 寸止失败测试加强
    （orgasms 1 �?degree 2 + 计数�?0 + orgasm_level 不更新）
  验收: npm run typecheck �?/ npm run test 397 通过 ✅（40 文件，连�?2 次稳定）/ dev 冒烟干净
  📌 待办登记：单人退�?H 的绝顶奖励（erArk H_END 体力上限+2/气力上限+3/精液上限，default.py:6819-6855�?
    未实现（h-group-sex 仅有群交�?group_sex_end_add_hpmp_max；orgasm_count 数据源已修复，B3 指令化时接）�?
    时停解放�?settle_unconscious_semen_and_cloth（精�?衣服结算）未对接（依�?h-ejaculation 扩展�?

高潮结算第三轮审查（2026-08-08，数值语�?生命周期/静默错误）✅
  - 【核对通过】judgeOrgasmDegree 概率�?3 �?[0.98,0.02,0] �?erArk 逐行一致；getStatusLevel 阈值数�?
    �?Character_State_Level.csv（level 0-10 �?max 0/100/500/1000/2500/6000/12000/30000/50000/75000/100000�?
    一致（�?2500 �?level 4 的边界语义）；extra 阈�?20000×0.9^n 一�?
  - 【已修·静默偏差】extra 分支：preData>=10 �?extraAdd=0 时，原实现回�?当前等级-记录等级"
    �?10 级后快感续涨但未�?extra 阈值时错误触发普通高潮；erArk normal = extra_add（无条件覆盖�?
    �?�?else 分支（extra 分支独占�?
  - 【已修·生命周期残留】time_stop_release �?true 后永不重�?�?时停解除�?H 内后续所有高潮全�?
    解放路径（roll 压缩/超强，静默偏差）�?h-core execution_start 监听�?H 中角色重�?false
    （对�?erArk handle_npc_ai_in_h.py:99"NPC 每次行动开始重�?；时停解除指令同一次行动内�?
    release 后结算的顺序不受影响�?
  -   新增 4 测试（extra=0 无高�?extra 达阈�?1 �?time_stop_release 行动重置/寸止成功快照计数�?
  验收: npm run typecheck �?/ npm run test 400 通过 ✅（40 文件，连�?2 次稳定）
  📌 待办登记：时停中退�?H 的边缘（releaseOrgasmEdge 时停分支会把寸止计数并入 time_stop_orgasm_count�?
    随后 h_state 清理丢失——erArk 时停中不判定寸止故无此路径，B3 时停指令化时一并核对）�?
    玩家射精�?p_orgasm 绝顶行为（erArk orgasm_judge 射精分支 p_orgasm_small/normal/strong�?
    eja_climax 已有忍耐判定，绝顶计数未接入）

高潮结算第四轮审查（2026-08-08，经验链/刻印升级/射精判定——orgasm_count 激活后的消费方）✅
  - 【已修·静默失效】绝顶经验从无写入（erArk ADD_1_XClimax_EXPERIENCE：部位累�?10-17/156/158 +
    总累�?20；无意识/时停解放（非玩家）时 type2 额外�?78）→ settleOrgasm recordOrgasmCount 补写
    ——h-mark 无觉刻印（exp78）与 talk-common 绝顶经验条件（experience.N）此前恒 0
  - 【已修·静默失效】h-mark getCumulativeValue �?experience['orgasm_total']/['unconscious_orgasm']
    （无人写�?�?�?0）：快乐刻印累计分支改读 orgasm_count[state][1] 合计（erArk all_happy_count）；
    无觉刻印累计改读 experience['78']（erArk all = exp 78）；无觉单次分支删除�?0 �?TODO 实现
    （改�?orgasm_count[0] 合计，erArk 同）；无觉升级补无意识门（erArk mark_effect 整个无觉块被
    handle_unconscious_flag_ge_1 包裹�?
  - 【已修·静默偏差】玩家射精判定缺"无精液高�?分支：精液量+额外 �?2ml �?erArk p_no_semen_climax
    （绝顶不射精：射精欲归零 + 忍耐计数清零）�?原实现直�?shouldEjaculate（精�?0 也走射精链路�?
  - 【核对通过】h-mark 刻印升级数�?vs Mark_Up.csv：屈�?30000/50000/100000、苦痛与恐�?20000/40000/80000�?
    反发 10000/30000/80000 全部一致；快乐/无觉硬编码条件（2/5�?/20�?6/50�?00�?00�?00）与
    mark_effect 逐行一致；经验映射�?-7�?0-17�?1�?56�?3�?58）与 Second_effect 一�?
  - 新增 6 测试（h-mark 快乐累计/无觉 exp78/无意识门/无觉单次 + phase-h 无精液高�?+ 原射精测试补精液量）
  验收: npm run typecheck �?/ npm run test 404 通过 ✅（40 文件，连�?2 次稳定）
  📌 待办登记：无精液高潮的行为口上（p_no_semen_climax）与射精绝顶 p_orgasm 口上/计数（B3 H UI�?

erArk 指令前提自动化更新对齐（2026-08-08，InstructConfig.csv 新增 h_mode_show_type/tired_type 两列）✅
  - 【机制理解】erArk handle_instruct.py:134-152 按类型运行时自动注入前提�?
    h_mode_show_type=1（非H显示）→ NOT_H + NOT_SHOW_NON_H_IN_HIDDEN_SEX�?2（仅H内）�?TARGET_IS_H�?
    tired_type=1（低疲劳）→ TIRED_LE_84 + HP_G_1 + DRUNK_LEVEL_NOT_3�?2（特定疲劳）�?TIRED_LE_74 +
    HP_G_1 + DRUNK_LEVEL_NOT_3。新 CSV premise_set 已精简（chat 仅剩 2 个显式前提）
  - 【对齐决策】不学运行时注入（我�?TOML 显式 premises 更透明、mod 可覆盖）�?迁移时静态展开�?
    SOP §4 新增 4.1「自动注入前提展开」规则；批次清单 §2 更新展开映射
  - 【已注册 3 新前提（premise-h.ts）】TIRED_LE_74（疲劳≤118，erArk :405）�?
    NOT_SHOW_NON_H_IN_HIDDEN_SEX（隐奸全局开关取反，未实�?�?�?true = erArk 默认�?+ TODO）�?
    DRUNK_LEVEL_NOT_3（醉酒等级≠3，醉酒系统未实装 �?�?true = 语义正确降级 + TODO�?
  - 【已更新】chat(1004) TOML premises �?NOT_SHOW_NON_H_IN_HIDDEN_SEX + DRUNK_LEVEL_NOT_3
    （h_mode_show_type=1 + tired_type=1 展开）；batch-01-daily §1.3/§2 同步
  - 【登记待批次】TARGET_IS_H 未注册（h_mode_show_type=2 �?H 内指令迁移时注册�?
  - 新增 1 测试（TIRED_LE_74 边界 118/119 + 新前提恒 true�?
  验收: npm run typecheck �?/ npm run test 405 通过 ✅（40 文件，连�?2 次稳定）

erArk 前提自动化承接机制（2026-08-08，架构决策：不学运行时注入，显式展开 + 追溯字段 + 完整性校验）�?
  - 【决策】erArk"类型字段→运行时注入前提"（handle_instruct.py:134-152）不学——TOML 显式 premises
    更透明（可审计/可测�?mod 可覆盖）；静态展开语义等价
  - 【已加·追溯字段】HInstruction 扩展 erark_h_mode_show_type/erark_tired_type（迁移期字段�?
    �?erark_id 同生命周期，全部批次完成后删除）——chat 已填；未�?diff CSV 可精确定位类型值变�?
  - 【已加·完整性校验】validateInstructionData 新增 validateAutoInjectedPremises：带迁移字段的指�?
    �?AUTO_INJECTED_PREMISES 映射（SOP §4.1）核�?premises 是否包含应展开前提，缺�?�?warning
    （防�?erArk 更新注入集合后已迁移指令漏补——chat 曾漏 NOT_SHOW/DRUNK�?
  - 新增 1 测试（缺展开前提 �?warning；chat 齐全�?warning�?
  验收: npm run typecheck �?/ npm run test 406 通过 ✅（40 文件�?

绝顶附加状态实现（2026-08-08，erArk 二段行为效果——统一通用结算对齐）✅
  - 【背景】erArk 更新"二段结算状态效果统一�?base_chara_state_common_settle"——我们无单独数�?
    结算代码（纯 erArk 内部重构，零直接影响）；但暴露既有缺口：43 个绝顶行为（8 部位×4 程度+射精�?
    的效果链我们只实现了经验/计数�?10），润滑/体力/气力/欲情/快乐/苦痛反感减完全缺�?
  - 【架构重构】settleOneState 及辅助（PART_ABILITY/getFeelExtraAdjust/getFallLevel/mark_debuff/
    settleInnerMind/extra_feel）从 h-core/index.ts 闭包抽到独立模块 settle/state-settle.ts—�?
    settle_state/talk_add_adjust/绝顶附加状态三处共用同一管线（禁止重复实现）�?
    settleOneState 新增 tenthsAdd 参数（erArk 绝顶附加 middle �?True、small/large False�?
    settlement 可选（无结算记录时直接�?base，clamp 0-99999�?
  - 【已实现】settleOrgasmSideEffects：按程度档映射（ORGASM_SIDE_EFFECTS）结�?
    润滑 300/300/900/3000（无能力系数）、体�?10�?20分deg1、气�?20�?25分deg1/30分deg2�?
    欲情 20(tF)/100(tT)/100(tT)/1000(tF)（能�?欲望）、快乐同构（能力=快乐刻印）�?
    苦痛/反感递减�?50-cur/10�?500-cur/5�?2000-cur/3，能�?苦痛/反发刻印�?
  - 【作用对象】部位绝顶附加作用于绝顶者自己（erArk 同）；p_orgasm 射精�?TARGET_润滑/
    射精位置重置/CVE 精液经验 �?B3 射精链路 TODO
  - 【不做】隐奸暴露（h:orgasm 事件已等价接�?h-hidden）、蓄能（人力发电已砍�?
  - 【登�?TODO】群交系数（isGroupSex 需异步查，settleOrgasm 同步——B3 群交核对）；
    附加状态无 settlement 时直接改 base（结算显�?B3 接入�?
  - 新增 5 测试（small/normal/super 档数�?+ middle tenths + 润滑无系�?欲情吃等级）
  验收: npm run typecheck �?/ npm run test 411 通过 ✅（40 文件，连�?2 次稳定）

隐奸/露出持续快感 + 他人存在判定修正�?026-08-08，erArk realtime_settle + instuct_judege 完整对齐）✅
  - 【架构】settleOneState 新增 extraAdjust 参数（erArk extra_adjust 系数，加法进 final_adjust）；
    h-core API 暴露 settleState（其他插件经 API 调统一管线——遵�?插件间禁止直�?import"铁律�?
  - 【已修·静默失效】h-hidden applyHiddenSexTick 重写（统一管线）：
    �?'心理快感' 死键（正确键 '心理'——心理快感从不上涨到可读键）
    �?补外层条件：场景人数>2 �?周围有清醒未睡他人（unconscious_h===0 近似�?
    �?补露出块（exhibitionism_sex_mode �? �?羞�?心理 ×3 × min(他人×0.1,2)）——原完全缺失
    �?补素�?fall/连续减�?max(0) 钳制（原直接�?base 缺全部）
    �?修正误解注释（sqrt(ability[16])——state 16 羞耻走 base 分支�?sqrt，ability_level=露出34�?
  - 【已修·监听器门槛】execution_end 监听�?`if (mode < 1) continue` 跳过露出角色 �?露出块永不触�?
  - 【已实现·他人存在判定修正】judge.ts calcJudge �?8 项（instuct_judege.py:247-260）：
    场景>2 且目标意识正�?�?群交/隐奸 60+60n、S �?40+40n、其�?25+25n × (ability_lv_adjust[露出]-1.6)�?
    V 类（访客）外层条件恒满足（访客系统已砍）
  - 【数值核对�?0×4.1 = 204.999... �?floor/int 204——JS/Python 同为 IEEE 754，与 erArk int() 一�?
  - 新增 9 测试（隐�?3 �?+ 露出 + 人数条件 + 他人修正 4 项）
  验收: npm run typecheck �?/ npm run test 420 通过 ✅（40 文件，连�?2 次稳定）/ dev 冒烟干净
  📌 待办登记：realtime_settle 其余块（群交/内衣/女儿/灌肠/捆绑/初H 持续快感）随各自系统落地�?
    周围清醒他人检查的完整状态语义（睡眠/催眠）随 L1.7 细化

隐奸暴露对象修正 + 审查�?026-08-08，暴露�?成就挂玩家——erArk character_id=0 语义）✅
  - 【已修】h:orgasm 监听：暴露�?发现度结算对象从绝顶者改为玩家（隐奸发起方）—�?
    触发条件保持"绝顶�?mode�?"（玩家发起隐奸中等价），多人隐奸/NPC 发起场景语义正确
  - 【已修·连带】成就记录对象：hidden_sex_record[4]（绝顶）/[3]（射精）原记绝顶者（NPC）→
    成就 912/913"隐藏方绝顶≥3"永不满足（静默）�?改挂玩家
  - 【文档】plugin-author-guide.md h-core API 表补 settleState（铁律：新增 API 同步文档�?
  - 【测试】新增隐奸绝顶暴露测试（暴露�?成就挂玩�?+ NPC 不受影响�?
  验收: npm run typecheck �?/ npm run test 421 通过 ✅（40 文件�?

隐奸/露出最终审查（2026-08-08，跨地点计数/静默路径/稳定性）�?
  - 【已修·跨地点多算】settleHiddenValue 的他人计数原 getAll().length（全角色含其他地点）
    �?改同地点过滤（erArk get_chara_now_scene_all_chara_id_list 同场景语义）
  - 【已修·跨地点目标】settleDiscovered 找隐奸目标原未过滤地�?�?改同地点
    （erArk get_hidden_sex_targets 同场景）
  - 【已修·静默路径】settleState API 无效 charId 原静�?return �?�?errorReporter warning
    （铁律：禁止静默失败�?
  - 【核对通过】applyHiddenSexTick 连续减值语义（NPC �?continuous、玩家不吃）�?
    hasConsciousOthers 含玩家、他人存在修�?S 类判断顺�?露出负修正边界�?
    settleOneState extraAdjust 默认 0 不影响既有调用、h:shoot 成就对象（玩家）
  验收: npm run typecheck �?/ npm run test 421 通过 ✅（40 文件，连�?2 次稳定）/ dev 冒烟干净

erArk 新地文导入补漏（2026-08-08，T9）✅
  - 【发现·修复】action_B1_penis_in_hair.toml 全文件损坏（340 �?context �?U+FFFD）—�?
    旧转换的历史编码问题（CSV 源现已干净）→ 重转修复（parse OK�? U+FFFD�?
  - 【升级】talk-common-data 校验测试：轻量解析（只提�?conditions 行）�?**完整 parseTOML**
    ——description/context 损坏的文件不再静默通过（loadTomlDir �?catch 静默跳过变可检测）
  - 【处理】重转引�?1 �?Dirty CVP（CVP_A2_Dirty|B0_G_1，精液污染，hair 地文）→ �?false + TODO
    （依�?h-ejaculation 精液系统）；eat 反复生成 �?脚本跳过 eat 文件�?
  - 【vitest.config】poolOptions �?vitest 4 已移�?API（DEPRECATED 警告，运行时兼容）—�?
    LSP 报错但不影响 typecheck（vue-tsc 不检查该文件），登记观察
  - 【数据规模实测】talk-common 全量�?65 文件 / 202,181 �?/ 完整 parse ~1.7s（Node）；
    游戏启动�?erArk 全量加载（无超时概念，dev �?165 �??raw 请求是主要延�?~2-5s�?
    生产打包后快）。【可选优化·登记】若 dev 首屏�?�?懒解析（parse 延后到首次访�?
    variable�? dev 请求聚合；先保持现状（与 erArk 一致）
  验收: npm run typecheck �?/ npm run test 376 通过 ✅（37 文件，连�?3 次稳定）
  - 【TODO·L1.7】睡眠完整语义（无意识口上屏蔽的 sleep 分支、T_UNCONSCIOUS_FLAG_1 等前提）
  - 【TODO·随系统�?5 个恒 false 前提（隐�?露出/群交/监禁/助手/女儿/首次/时停解放/精液）补语义�?
    行为地文 daily 数据（erArk 侧新增未构建�?

激�?信息素纠正（2026-08-08，用户指出——擅自加入了被砍的世界观内容）✅
  - 【用户发现·已撤销】博士信息素�?04-306）属**信息素系�?*（方舟世界观专属），粗筛明确砍掉
    （master-list:543"含原砍掉�?46 条：…激素�?�?111/4112 hormone_on/off 延后）—�?
    �?2 批时我见 talents.toml 缺失就擅自补�?3 个定�?修正，第 5 轮又在错误基础上深化（on="initiator"�?
  - 已全部撤销：talents.toml �?3 定义；talent-adjust.ts �?on 机制；calcFavorability/calcTrust 恢复单参数；
    调用点恢复；�?2 个激素测试。talents.toml 现仅含给既有天赋的修正字段，零新增定�?
  - 教训登记：粗�?master-list �?砍掉/延后"的权威依据，补任�?erArk 数据前必须先�?master-list
  验收: npm run typecheck �?/ npm run test 347 通过 ✅（34 文件�?

已知缺口（登�?TODO，批末一并处理）:
  - settle_state/settle_favorability �?erArk �?tenths_add、连续指令减值、无意识门控、系统难�?信物修正（引擎既有近似）
  - resolveValue 不支�?quest.*/inventory.* 根路径（注册表里有、求值恒�?0/false 静默）—�?
    需 gameContext 暴露 quests/inventory 上下文后接入
  - 可用条件属性手�?md 生成（conditionRegistry.generateManual 已有实现）未接线—�?
    浏览器端无法写文件系统，需 dev 工具/脚本方案
  - plugin-manager �?console.warn（铁律要�?errorReporter）——既有代码，随批收敛
  - 扫描脚本自测：scan-attr-refs/scan-erark-defs 已接 vitest（character-contract.test.ts）—�?
    npm run scan:attrs / scan:erark 独立可跑

### 已完成（此前会话�?

L2.11 三项缺口全部完成 �?
  - 群交HP修正: hp-mp.ts 重写 + settle_hp_mp effect注册
  - 精液吸收: calcSemenAbsorb + penis_dirty_dict + H中tick吸收
  - 精液污染追踪: pl_penis_semen_dirty/not 前提注册 + 40处TOML转换

根因修复: condition.ts selected 路径实现 �?
  - GameContext �?selectedCharacterId
  - resolveValue selected stub �?真实实体解析
  - 数组数字索引支持 + talk-common parseConditions 双前缀bug修复

jj_0~3 阴茎大小前提 �?
  - attributes.toml �?"阴茎大小" + actorId入premiseCtx

饥饿系统: hunger-system 插件 �?
  - eat_food effect + 自动增长 + 消化CD + NPC口粮 + h-config配置�?

L2.9 Scene/Event 系统 �?
  - events/统一加载 + start_scene effect + scene step(嵌套)
  - dialogue-system 触发拦截 + completedScenes 存档持久�?
  - ConversationRef 重构: 4种type(character/global/quest/event) + speaker 解�?
  - 内联 dialogue 支持 (lines 字段)
  - 文档重写�?600+ �?

TODO(依赖其他系统):
  - 爱情旅馆/他人存在/助理/体位/处女/时停 +9999（calcJudge 缺）
  - 目标榨精 ability[77] + 精液存量检�?
  - 食物获取方式(商店/烹饪/采集)
```

### 待做优先�?

```
1. L2.10 Combat 系统缺口�?项）
2. L2.11 剩余: 被发现面�?UI) + 食物获取方式
3. 地图系统重构（三层分�?+ 工具）：
   - 引擎�? `docs/plans/map-system-rework.md` Phase 1
   - 工具�? `docs/tools/map-editor-design.md` Phase 2 + 3
4. 移动/离开 effect（`move_to`、`npc_leave`——场景剧情中控制角色位置�?
5. L1.7 睡眠/昼寝/就寝指令
5. L1.9 {{input}} 文本框语�?
6. L1.6 指令复刻（前置改�?✅，下一步：B1 批次清单 �?用户筛�?�?逐条 TOML�?
7. 侧栏面板：特质页�?个人情报/日志统计/作弊
```

### calcJudge 完整公式（erArk精确复刻�?

```
实行�?= 基准需�?+ 以下各项修正�?

1. 好感修正: 好感度查阈值表[0,100,500,1000,2500,5000,10000,50000,100000]
   �?加值[0,10,25,50,75,100,150,225,300]
   信赖修正: 信赖度查阈值表[0,25,50,75,100,150,200,250,300]
   �?加值[0,25,50,75,100,150,200,300,500]

2. 状态修�?欲情+快乐)×5 + (恭顺+屈服)×10 - (羞�?抑郁)×5 - (苦痛+恐�?反感)×10
   等级阈值[0,100,500,1000,2500,6000,12000,30000,50000,75000,100000]

3. 能力修正: 亲密×10 + 欲望×5

4. 刻印修正: 快乐×50 + 屈服×50 + 苦痛×10 + 无觉×25
   - min(恐�?时姦,0)×50 - 反发×100

5. 心情修正: get_angry_level(愤�?×20
   愤怒≤5�?, �?0�?, �?0�?1, >50�?3

6. 陷落修正: 思慕30+恋慕50+恋人80+爱侣100+屈从30+驯服50+宠物80+奴隶100

7. 天赋个�? 淫乱+50, 性好�?30, 性冷�?30, 性无�?100,
   讨厌男�?30, 底线-100, 持有把柄+100, 被持有把�?100, 女儿+100

�?待实现（依赖其他系统�?
   爱情旅馆+25/50/100 | 他人存在+露出修正 | 助理助攻+50
   体位喜欢+30 | 处女-250/-350 | 监禁/睡眠/时停+9999
```

### talk-common 转换状�?

```
全部CVP码已转换为条件表达式。剩余的CVP:
  CVP_A2_Dirty|B0_G_1 �?40�?精液污染，需精液追踪系统)
  
VAR_MAP已处�?
  博士→{player.name}(1005) | 手机→书�?36) | 罗德岛→移除(3)
  兽耳→耳朵(3) | 电脑→书�?1) | 咖啡→茶(2)
  尾巴→腰�?双腿缠绕/臀部等(50+)
  信息素→荷尔�?1)
  
待手动处�? 电视×6�?
```

### 插件默认数据体系

```
h-core/data/default/ 提供全套 erArk 标准数据:
  attributes.toml    �?纯数�?体力/好感�?日重置参�?
  abilities.toml     �?带等级的能力(感觉/ABL/刻印/性技�?
  talents.toml       �?176条通用天赋(排除方舟世界观绑�?
  equipment.toml     �?9个基础装备�?
  status-effects.toml �?中毒/醉意等通用状�?
  relations.toml     �?好感度关系类�?
  bondage/types.toml �?16种捆绑类�?
  h-config.toml      �?settle_state ability_level 映射�?

三层优先�? Layer1(插件默认) �?Layer2(mod插件) �?Layer3(mod定义)
加载: loadMerged deepMerge + expandCharacterAbilities + initializeTalents
```
> - **L2 细节�?*：系统内的具体功能点
> - **L3 推迟�?*：已明确设计但当前不做的

---

## 参考文档索�?

| 文档 | 位置 | 阶段 | 说明 |
|------|------|------|------|
| AGENTS.md | 根目�?| �?| **最高文�?*，所有铁律的源头 |
| map-editor-design.md | docs/tools/ | P1 | 可视化地图编辑器完整设计（技术栈、功能、数据格式） |
| 开发检查清�?md | 根目�?| 全部 | 事前约束 + 事后自审 |
| developer-handbook.md | docs/ | 全部 | 开发者交接手册（86行，�?存在�?|
| mod-author-guide.md | docs/ | 全部 | Mod 作者指南（�?已更新，含自定义前提章节�?|
| plugin-author-guide.md | docs/ | 全部 | 插件作者指南（�?已更新，含完整API速查表） |
| mod-override.md | docs/ | 全部 | Mod override 规范（✅ 已创建） |
| premises.md | docs/ | 全部 | 前提系统文档（✅ 已更新，含架构说�?mod自定义前提） |
| dialogue-format.md | docs/ | 全部 | 口上/叙事格式规范�?55行，✅） |
| talk-common-system.md | docs/ | 全部 | 条件文本片断引擎�?36行，✅） |
| scene-system.md | docs/ | 全部 | 剧情系统（统一scene管理�?18行，✅） |
| premises.md | docs/ | 全部 | 前提系统�?2行，✅） |
| item-system.md | docs/ | P1 | 道具系统�?58行，�?2026-08-12 重写：schema/消耗语�?礼物�?|
| clothing-system.md | docs/ | P1 | 服装系统�?22行，✅） |
| bondage-system.md | docs/ | H�?| 紧缚系统�?38行，✅） |
| entity-namespaces.md | docs/ | 全部 | 命名空间映射�?00行，✅） |
| erark-replication.md | docs/skills/ | 全部 | erArk复刻铁律�?44行，✅） |
| add-instruction.md | docs/skills/ | 全部 | 添加指令工作流（66行，✅） |
| phase-p1-core-era.md | docs/plans/ | P1 | 核心era体验计划�?75行，**当前阶段**�?|
| phase-11-15-mvp-release.md | docs/plans/ | 11-15 | MVP发布计划�?20行，**当前**�?|
| 2026-07-04-instruction-replication.md | docs/plans/ | P1 | 指令复刻方案�?7行，已被下述 spec 取代�?|
| 2026-08-07-instruction-replication-design.md | docs/superpowers/specs/ | P1 | **指令复刻设计 spec（当前权威，�?L1.6 必读�?* |
| migration-workflow.md | docs/instruction-replication/ | P1 | **逐条迁移 SOP（做 L1.6 必读�?* |
| h-hypnosis-design.md | docs/specs/ | H�?| 催眠设计规格�?*做催眠时必读**�?|
| h-hidden-design.md | docs/specs/ | H�?| 隐奸设计规格�?*做隐奸时必读**�?|
| h-group-sex-design.md | docs/specs/ | H�?| 群交设计规格�?*做群交时必读**�?|
| mod-override.md | docs/ | 全部 | **Mod override 规范**，所有系统手册引用此文档 |
| 0003-mod-override-priority-layers.md | docs/adr/ | 全部 | ADR: 三层优先�?ID 匹配 |
| character-schema.md | docs/ | 全部 | **标准角色契约**�?1 节，�?§11 字段分层�?ADR-0007——写角色数据必读�?|
| 0007-character-field-authoring-layers.md | docs/adr/ | 全部 | ADR: 角色字段作者分层（L1/L2/L3 + marks 归一�?+ 处女双源修复�?|
| mod-file-guide.md | docs/ | 全部 | **逐文件字段字�?*（能写什�?形式/区间/默认——mod 作者查字段用） |
| relation-system.md | docs/ | 全部 | **关系系统手册**（v2：有�?三档/端对/称呼/聚合条件/事件——写关系必读�?|
| follow-system.md | docs/ | 全部 | **跟随系统手册**（同行：is_follow 0-4/瞬移同步/疲劳解除/离线归零/口上抑制/前提——写同行相关必读�?|
| example-mod | mods/example-mod/ | 全部 | **教学范例模组**（照猫画虎：每文件带注释、真实可跑、validate 验证�?|

---

## L0 �?架构�?✅（全部完成�?

| L0.x | 任务 | 状�?|
|------|------|------|
| L0.1 | 修复跨插�?import�? 处） | �?`PremiseRegistry`→core、`commonTextsEngine`→API、`getLevel`→entity-utils、talk-common→core |
| L0.2 | core 层具体玩法引�?| �?`registerNoSaveMode` 代替硬编�?`h_scene` |
| L0.3 | API 文档补全 | �?`plugin-author-guide.md` 覆盖全部 20+ namespace |
| L0.4 | 系统使用手册 | �?14 个手册全部创�?|
| L0.5 | 硬编码属性名 | �?`ATTR` 常量建立，key 文件替换完成 |

---

## L1 �?系统层（完整系统/插件实现�?

> 每个 L1 任务是一个完整系统，可独立实施�?

### L1.1 渲染�?step3 �?`_display` + `[styles]` 注册

**来源**：上会话遗留
**参�?*：`docs/dialogue-format.md`（line 格式规范：style/trigger/display/speed 字段�?

- 对话系统�?entry 时注�?`_display` 元数�?
- `[styles]` 注册表实�?
- TypewriterText 组件对接 `display` / `trigger` 字段

### L1.2 纸娃娃兜底地�?

**来源**：上会话遗留
**参�?*：`docs/talk-common-system.md`

- `triggerScene` 无对口上时自动用 talk-common-system 生成通用描述
- 注册 `behaviorId` �?条件文本池的映射

### L1.3 选项面板（P1.0�?

**参�?*：`docs/superpowers/plans/phase-p1-core-era.md`

- 显示设置（主�?深色/组标�?字体/字号�?
- 侧栏设置（模�?overlay/并排、parameter 开关）
- 指令栏设置（编号/收藏/作弊命令开关）
- 小键盘设�?
- 游戏设置（cheat 可见性）
- 存档入口

### L1.4 服装系统扩展（P1.2�?

**参�?*：`docs/clothing-system.md`

- 14 槽位（头/�?项链/上身/外套/内衣/�?戒指/下身/内裤/�?�?腰带/其他�?
- H 中可�?穿回
- 精液污染追踪

### L1.5 道具系统扩展（P1.3�?

**参�?*：`docs/item-system.md`

- consumable/lubricant/condom/toy/drug/material 类型
- `use_item` 指令

### L1.6 指令复刻（Phase A/B/C�?

**参�?*：`docs/superpowers/specs/2026-08-07-instruction-replication-design.md`（权�?spec�? `docs/instruction-replication/migration-workflow.md`（逐条 SOP�? `docs/skills/erark-replication.md`

> **当前进度**：第 0 步粗�?✅（228 保留，见 `docs/instruction-replication/instruction-keep-list.md`）→ 前置改动 ✅（spec §10 全部完成）→ **B1 试点 chat 已复�?�?+ 二段结算/绝顶附加/隐奸露出�?erArk 对齐全部完成** �?**标准角色契约 ✅（spec §10.1�?026-08-09：character-schema.md / 双向扫描 0 违规 / 对账表四类齐�?/ 校验落地�?* �?**下一步：B1 剩余 23 �?*（执行顺序见会话交接摘要"下一�?；迁移时查对账表"这个 erArk 字段我们怎么处理�?�?

- **前置改动** ✅（见会话交接摘要）：loader 收敛 / 接口扩展+judge_check 注入 / calcJudge adjustments �?/ IN_* �?location.tags / 耗时机制 / UI 分类 / _erark_source 归档
- **Phase A**：齐全前提（~80 个），按 A1（身�?体技/体位）→ A2（服�?地点/道具）→ A3（杂项）分批
- **Phase B**：效果补齐，逐条�?erArk `default.py` 读取 base_value
- **Phase C**：指�?TOML 数据�?28 条），分批：B1 daily(24) �?B2 obscenity(37) �?B3-B6 sex(142，H UI 就绪�? �?SYSTEM/ARTS 顺带

### L1.7 睡眠/昼寝/就寝指令

**来源**：上会话遗留

> **已完成（2026-08-11，grill 定案 + 全链实现�?*�?
> - `src/plugins/sleep-system/`：睡觉指令（1014 跨天跳转 advance_to_hour=6 + 14 效果�?+ settle_mode）�?
>   让对方去睡觉�?022）、睡奸系指令数据�?045/5046/5052/6005/6106——安眠药前提�?false TODO�?
> - 睡眠结算对全员（updateSleepAll：daily_reset 清零/愤怒重�?射精欲清�?首射标记/精液转化/
>   H状态重�?素质获得/自动存档）、睡眠等级（sleep.toml 阈�?30/60/80/100）�?
>   睡眠状态（sp_flag.sleeping/unnormal_flag bit5,6/sleep_h_awake�?
> - 前提 12 条族（TIRED_GE_75_OR_SLEEP_TIME_OR_HP_1 四象�?窗口/GAME_TIME_IS_SLEEP_TIME/
>   T_ACTION_SLEEP/T_NORMAL_1/2/6/SCENE_ALL_UNCONSCIOUS_OR_SLEEP 等）+ h-time-stop TIME_STOP_ON/OFF
> - core：realtime-settle 睡眠体力/气力公式恢复（settle_sleep :388-391）、sleepPassSettle 导出�?
>   game-context advanceToHour/minutesUntilHour、HInstruction settle_mode/advance_to_hour 字段
> - h-npc-ai 无意识组 ②④③（settleSleepH/judgeWeakUpInSleepH/recoverFromUnconsciousH/
>   装睡/二段结算/睡奸锁定例外/无意识疲劳退出只�?HP�?
> - 验收：typecheck �?/ test 695 通过（新�?sleep-system 16 �?+ core 恢复公式 + 全流程集成）/
>   文档 docs/sleep-system.md + plugin-author-guide（sleep-system + h-npc-ai recover API�?
>   character-schema（sleeping/unnormal_flag/sleep_h_awake/pretend_sleep/wake_time�?
> - TODO 项（未实装依赖，�?docs/sleep-system.md §11）：~~理智成长/能力升级检测~~�?026-08-11 成长
>   系统已实现：精力成长 + checkUpgrade 结算点，ADR-0009�?妊娠检�?
>   安眠�?body_item[9]/陷落继续H判定三分�?无意识二段行�?睡奸经验映射

### 成长系统完整复刻�?026-08-11，ADR-0009�?

**已完成（�?1 引擎+数据层）**�?
- 双模式升级（mode xp/condition + per-level needs 全类�?A/T/J/E/F/X/ability_sum + 主备�?+
  特殊判定数据�?extra_needs + sex_need）、checkUpgrade API、结算点链（睡眠双分�?+ h:end NPC�?
  mod 三开�?upgrade_on_player_sleep/npc_sleep/npc_h_end�?
- 宝珠系统恢复�?3 种定�?juels.toml + entity.juel + 睡眠转换�?衰减/特殊 17-19/反感抵消 +
  升级扣珠）、gain_type 过滤�? 随时/3 睡觉�? 死代码不实现）、精力成长（�?精神"属�?+
  consume_sanity 消�?+ today 计数 + 精力上限属�?+ 成长公式）�?28 H 结束上限成长
- 数据：提�?AbilityUp/TalentGain/Juel/Ability/Talent/Experience.csv + talent_up_panel.py�?
  转换脚本 scripts/convert-erark-growth.cjs（幂等）；h-core 默认�?ability-upgrades.toml/juels.toml/talent-gains.toml
- 值域约束：max_level 对齐 erArk（感�?ABL/性技 8、刻�?3、无�?6）；upgrades 长度软约�?
- 验收：typecheck �?/ test 716 通过（新�?growth 16 �?+ sleep 集成 5 条）/ 扫描 0 违规
- 文档：ADR-0009 / ability-progression.md / plugin-author-guide（checkUpgrade + consume_sanity�?
  attr-ledger 重对账（juel/理智上限/精神�?

**�?2（UI 层）**�?
- 手动面板（talent_up_panel 复刻：陷落系素质 201-204/211-214 爱情/隶属二选一路线、共通前提�?
  路线前提、needs 显示、gainTalentManual 跳过条件直接获得�?
- 动态失去类素质（精液膨�?6000ml 阈�?未初潮失�?罩杯变化/饮精绝顶——handle_talent.py 硬编码分支）
- 告白/戴上项圈指令迁移（恋�?宠物获得途径——gain_type 2 数据在此消费�?
- 设置面板系统（base_setting 全数组承载，升级三开关并入）

### 能力存储架构�?026-08-11 批：目录拆分 + 按需展开 + display�?

**已完�?*�?
- abilities 目录拆分：`definitions/abilities/*.toml` 与插件默认层 `data/default/abilities/` 合并加载�?
  单文�?`abilities.toml` 兼容（loadAbilityDefs�?
- 按需展开：角色只拥有「数据写�?+ attributes category=ability/mark 落位」的能力——几百技�?× NPC
  存档体积问题消除；未拥有 = 无条�?不显�?条件语义 0 级；旧存档全量条目保留；
  **condition 模式能力全量注入 0 级条�?*（经验→升级联动：checkUpgrade 遍历入口�?026-08-11 联动修复�?
- 刻印落位保证：normalizeMarksToAbilities �?category=mark 全量�?abilities 0 级条�?
  （h-mark 升级写路径需要条目存在）
- `display = false`：拥有但不在面板显示（结�?条件/查询照常�?
- 面板：技能（非卡能力�? 级不显示兜底
- 验收：typecheck �?/ test 717 通过（新增目录拆�?+ 按需展开 2 �?+ 契约/集成断言更新�?
  文档 ability-progression.md + mod-author-guide

**后置**：技能按 tag 分组显示 UI（几百技能单分组优化）、expand 字段（如未来�?无需 attributes
条目也想全员拥有"的场景）

### L1.10 H �?NPC AI 后置项（2026-08-11 h-npc-ai 插件交付后登记）

**本次交付**（`src/plugins/h-npc-ai/`，复�?erArk handle_npc_ai_in_h.py）：�?每时间片 H 状态判�?+ 完整疲劳/HP 退出；�?逆推 AI（部位喜好加�?+ 过滤�?+ 3 配套指令）；⑥⑦ 群交 AI（type 1/2/3�? 群交执行管道。详�?`docs/h-npc-ai.md`�?

**后置�?*（按依赖排序）：

1. **无意识组 ②④�?*（erArk recover_from_unconscious_h / judge_weak_up_in_sleep_h / handle_npc_instruct_condition / settle_unconscious_semen_and_cloth）——三者绑定一起做，依�?L1.7 睡眠系统（`unconscious_h=1`、sleep_point、装睡）�?
   - 睡奸醒来判定（睡眠阈值概�?�?recover�?
   - 无意识恢复结算（继续 H 判定：监禁→继续 / 陷落分流 �? 继续 / >0 降级轻度骚扰 / <0 愤�?100 / 无→高级性骚�?/ 实行值不足→DO_H_FAIL�?
   - 无意识期间精�?服装偷窃二段行为
2. **性爱助手 sex_assist**（监狱长群交自动陪玩 AI，settle_behavior.py:72-84 + handle_npc_ai_in_h.py:137-140）——依赖监禁调教系�?+ 缺失源码 confinement_and_training.py
3. **催眠体控-逆推自动触发 H**（erArk 效果 1228：扣 10 理智 + 自动设置 npc_active_h + 拉入 H）——归 h-hypnosis 插件
4. **群交玩法大改**（用户计划）+ 群交模板编辑�?UI（npcAiType 选择面板�? 群交加入/邀请流程（ask_group_sex/join 指令 TODO�? A/B 轮流（run_all_group_sex_template�? 群交结束指令（group_sex_end）——注：run_group_sex_template 已于 2026-08-11 注册（模板执�?+ type 3 抢占链路接通）
5. **SEX 指令数据批次落地**（B3-B6，内容审�?+ �?part:/flag: tag——逆推/群交 AI 的数据基础；h-npc-ai 自带测试指令可先行验证机制）
6. **h_scene UI 完整�?*（部�?子类分组渲染、逆推面板完整呈现——CommandBar 前提过滤为最小版�?026-08-11 标注�?
7. **逆推前提补全**：change_top_and_bottom �?T_NORMAL_5_6（L1.7 意识异常�? TARGET_NOT_BONDAGE（绳艺）/ GROUP_SEX_MODE_OFF（群交大改时�?

### L1.8 `settle_state` �?ability_level 参数

**来源**：上会话遗留

### L1.9 `{{input}}` 文本框语�?

> 叙事中嵌入输入框，接收玩家开放答案，存到实体属性或临时变量�?
> 用于自定义名字、自定义留言、LLM 口上输入等�?

**语法**�?
```toml
# 存到实体属�?
text = "你叫{{input target='player.name'}}？好名字�?

# 存到临时变量（事件内可用�?
text = "你给这柄剑起了个名字：{{input var='sword_name'}}�?
```

**设计**�?
- `{{input ...}}` 渲染为可编辑输入框，支持默认提示文字
- 玩家输入确认后，输入�?*替换为不可再改的文字**（不�?inline 编辑�?
- 输入值存两处：`target` 写入实体属性，`var` 写入执行上下文（事件内条件引用）
- 输入确认方式：回�?/ 点击日志外区�?
- 异常处理：不输入时给默认�?

**注意**：独立于 L1.1，不一起实现�?

---

## L2 �?细节层（系统内的具体功能�?

> 每个 L2 �?L1 系统内的一个独立子任务�?

### L2.1 @命令调试工具（Phase 11.1�?

```
完成度：已有骨架（native-commands.ts �?8 �?@ 命令入口），需要完善实际逻辑
```

- [x] `@help` 骨架
- [ ] `@attrs` �?显示选中角色完整属�?
- [ ] `@setattr 属性名 值` �?修改属�?
- [ ] `@teleport 地点ID` �?移动
- [ ] `@spawn 模板ID 地点ID` �?生成角色
- [ ] `@startquest 任务ID` �?开始任�?
- [ ] `@additem 物品ID 数量` �?加物�?
- [ ] `@errors` �?查看错误列表
- [ ] 完善骨架 + 接入真实数据

### L2.2 沙箱脚本（Phase 12.1�?

```
参考：phase-11-15-mvp-release.md Task 12.1
文件：src/utils/sandbox.ts 已存在骨�?
```

- new Function() + 冻结只读 context
- 5 秒超时保护（acorn AST�?

### L2.8 Quest/Event 系统未实现功�?

```
参考：src/plugins/quest-system/index.ts + docs/scene-system.md
L2.9 已统一 scene 管理、事件拦截、嵌套、持久化、ConversationRef�?
以下为仍待做的具体功能点�?
```

- [x] mod-loader 加载 quest/event TOML（L2.9 统一扫描 quests/ + events/�?
- [x] 前置任务检查（`prerequisites` 字段——L2.9 completed�?
- [x] `display` 字段（current/log/hidden——L2.9 实现�?
- [x] 已完成任务状态持久化（completedScenes——L2.9 实现�?
- [ ] combat step �?`on_win` / `on_lose` 分支——需 combat-system �?`combat:end` 事件附带胜负信息（`result: 'win' | 'lose'`�?
- [ ] condition step 的条件求值——需�?`executeStep` 中调 `evaluateCondition`，传入当�?GameContext
- [ ] spawn step 的角�?物品创建——需 spawn-system �?inventory API
- [ ] `visible` 字段——任务面�?UI 消费，当�?quest-system 已存字段，UI 未读
- [ ] `scene.has_character()` 条件函数——条件系统扩展，需�?`resolveValue` 中注册特殊函�?
- [ ] 更多 objective 类型：`"use_instruction"`（监听指令执行）、`"character_present"`（检测角色在场）�?

### L2.12 talk-common 天赋条件迁移

> talk-common 纸娃娃数据中引用�?23 �?erArk 天赋 ID（CVP_A2_T|{id}），
> 当前被静默跳过。必须注册为条件捷径才能精准匹配纸娃娃描述�?

**体质类（搬进 talents.toml 插件默认�?*�?

| ID | 含义 | 条件捷径 |
|----|------|---------|
| 0 | 阴道处女 | `selected.阴道处女 == 1` |
| 1 | 肛门处女 | `selected.肛门处女 == 1` |
| 2 | 尿道处女 | `selected.尿道处女 == 1` |
| 3 | 子宫处女 | `selected.子宫处女 == 1` |
| 6 | 未初�?| `selected.未初�?== 1` |
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
| 7 | 未成�?| `selected.未成�?== 1` | A2 |
| 222 | 性无�?| `selected.性无�?== 1` | A2 |

**实现**�?
1. 将体质类（体�?胸围/腿型）定义为 `talents.toml` 插件默认，有 `modifier` 影响公式
2. 状态标记类（处�?妊娠/育儿）不作为天赋，而是注册条件捷径�?`conditionEngine`
3. 两者都注册一�?条件捷径"（shorthand），�?`CVP_A2_T|102_E_1` 等价于对应条件表达式
4. 全部注册完毕后，talk-common �?`pickEntry` 才能在非 strict 模式下正确匹�?

**S（状态）�?A（能力）�?CVP 映射参�?*（转换不需要特殊处理，直接写成条件表达式即可）�?

| CVP 示例 | 等价条件 |
|----------|---------|
| `CVP_A2_S\|0_GE_5000` | `selected.皮肤 >= 5000` |
| `CVP_A2_S\|4_GE_1000` | `selected.阴道 >= 1000` |
| `CVP_A2_S\|5_GE_90000` | `selected.后穴 >= 90000` |
| `CVP_A2_A\|71_GE_3` | `selected.abilities.舌技.level >= 3` |
| `CVP_A2_A\|75_GE_5` | `selected.abilities.肛技.level >= 5` |

### L2.13 技能系列（erArk ability_type=4）参�?

> erArk 的技能系列（话术/指挥/战斗/料理/音乐/学识/医术/农业/制�?绘画）是通用生活技能，
> 但我们的原生通用技能可能与之不同。此条仅做记录，不做实现�?

**erArk 技能列�?*（ability_type=4, ID 40-49）：
```
40=话术技�? 41=指挥技�? 42=战斗技�? 43=料理技�? 44=音乐技�?
45=学识技�? 46=医术技�? 47=农业技�? 48=制造技�? 49=绘画技�?
```

### L2.3 角色创建流程（Phase 13.1�?

```
文件：src/ui/views/CharacterCreation.vue 已存�?
```

- dialogue/choose/input/image 步骤类型
- meta.toml `[creation]` 配置支持

### L2.4 存档迁移链完善（Phase 11.3�?

- rename/default/transform 迁移类型
- 内存执行 + 下个存盘写入

### L2.5 插件化闭环验证（Phase 12.2�?

- test-mod 跑通完整循�?
- 换模组测�?

### L2.6 移动�?PWA（Phase 14.1�?

- manifest.json + 图标
- 离线运行

### L2.7 最终集成测�?+ 发布（Phase 15.1�?

### L2.9 Scene/Event 系统缺口

> scene-system.md 设计了完整的 event 机制，但代码中大量未实现�?

- [x] `events/` 目录加载——mod-loader 统一加载 quests/ + events/，scene ID 重复检�?+ scene_id 引用校验
- [x] `start_scene` effect + `start_quest` 别名——后台激�?scene（不打断当前�?
- [x] scene step 类型——`case 'scene'` + 嵌套场景�?push/pop
- [x] 触发拦截逻辑——dialogue-system 检�?condition 匹配�?scene 并自动开�?
- [x] 嵌套场景进度管理——场景栈实现（子完成→pop 回父），`parent` 字段可�?

### L2.10 Combat 系统缺口

- [ ] 队友系统——回合循环中队友行动 stub（`// TODO: 队友系统`�?
- [ ] `hit_check` 钩子——base 实现被注释掉
- [ ] 动态指令——按角色能力注册指令 stub
- [ ] 阴阳属性——硬编码�?`1.0`（`// TODO: 查角色内功的阴阳属性`�?
- [ ] mod override 系数——硬编码默认值（`// TODO: mod override 机制`�?

### L2.11 H-core 结算缺口

- [x] 状态修正——`calcJudge` 中状态修正完�?
- [x] 陷落修正——完�?
- [x] 群交 HP 修正——`hp-mp.ts` 重写 + `settle_hp_mp` effect
- [x] 射精衰减——`calcSemenAbsorb` + `penis_dirty_dict` + H �?tick
- [ ] 被发现面板——隐奸系�?UI stub（`// TODO: 打开被发现面板`�?
- [x] 精液污染追踪——`pl_penis_semen_dirty` 前提注册 + TOML 转换
- [ ] jj_0/1/2/3 前提——射精后阴茎硬度/状态等级。erArk `jj_0~4`，需�?h-core �?h-ejaculation 中注�?premise handler，检�?`h_state.just_shoot` �?`h_state.shoot_semen_amount`
- [x] 饥饿系统——`hunger-system` 插件完整实现�?
  - `eat_food` effect: 扣背包→减饥饿→消化CD→回HP/MP
  - `game:hour_changed` 自动增长 (erArk 公式) + 消化衰减
  - `game:new_day` NPC 每日口粮
  - NPC 自动进食（背包有食物时）
  - 配置化：h-config.toml `[hunger]` 段，mod �?patch
  - 默认食物：干�?饮水/甜点
  - 条件表达式：`selected.饥饿�?> 190` 等直接可�?
- [ ] 食物获取方式（后续）�?
  - 商店购买
  - 烹饪/制作
  - 采集/打猎
  - NPC 一起吃饭好感加�?
  - 特殊食物效果（加�?毒品/精液等）
- [ ] 目标榨精 ability[77]——`calcSemenAmount` 中因�?6)需目标角色ID�?`abilities.榨精.level`
- [ ] 精液存量检查——`calcSemenAmount` 中因�?7)：射精量不超�?`semen_point + extra_semen_point`
- [ ] 衣物精液追踪（`cloth_semen`）：
  - **涉及**：h-ejaculation（射精时同步追踪衣物精液）、talk-common CVP 检查（`CVP_A2_Dirty|C{槽位ID}_{op}_{val}`）、clothing-system（精液扩�?清洗�?
  - **数据结构**：`ch.cloth_semen[slotId] = [0, current_ml, level, total_ml]`，同 `body_semen` 格式
  - **条件表达�?*：`selected.cloth_semen.{slotName}.{索引} > N`，需�?`condition.ts` 中注�?`cloth_semen` 路径或提供别�?
  - **入口**：射精时按射精部位关联的服装槽位增加精液（如阴道射精→内�?下身），`update_semen_dirty` �?erArk 等价函数
  - **前置依赖**：clothing-system 完整实现�?4 槽位）、服装精液扩散（`settle_semen_flow`�?

  > **背景**：纸娃娃地文口上中有 40 条检查精液污染的 CVP 码（`CVP_A2_Dirty|B0_G_1`），
  > 表示"目标全身皮肤精液�?> 1"。当前无法求值，条件被静默跳过�?
  >
> **CVP_Dirty 格式**：`CVP_A2_Dirty|{前缀}{部位ID}_{比较符}_{值}`
> - `B` = 身体部位（B0=全身皮肤，B1-B8 对应各性感带）
> - `C` = 服装槽位（C0-C8 对应各装备槽�?
> - talk-common 数据�?*只用�?`B0`**（全身皮肤精液污染）
>
> **MVP 设计**：先只做全身污染计数，不在角色上细分到各部位/服装�?
> 在角色上�?`semen` 数字字段�?~100），射精时增加，H 结束/洗澡时清零�?
> 注册前提 handler �?`CVP_A2_Dirty|B0_G_1` 映射�?`selected.semen > 1`�?
>
> **扩展方向**：如果以后要做更细的精液追踪（精液沾到胸�?腿上等部位的纸娃娃描述）�?
> �?`semen` 拆为 `body_semen[部位]` �?`cloth_semen[槽位]` 两个数组�?
> 对齐 erArk �?B（身体部位）�?C（服装槽位）两套索引�?
  >
  > **关联系统**：h-ejaculation（射精时增加）、h-core H 生命周期（结束时清零）�?

---

## L3 �?推迟池（已明确设计但暂不实施�?

### H 子系�?

```
已实现：h-core / ejaculation / pregnancy / first-time / exposure / mark / hypnosis / hidden / group-sex / bondage / time-stop
```

**待实�?*�?
- h-confinement �?监禁调教系统
- h-aromatherapy �?香薰疗愈�?种每日buff�?
- 女儿成长→自订角色入口（h-pregnancy 扩展�?
- 动态体位切换（15 体位 × 5 部位�?
- NPC H AI �?H 内自动行�?
- 二段行为 �?绝顶/射精后连�?
- 宝珠系统 �?23 种宝珠睡眠结�?
- 口上三层加权随机 �?通用/角色/特殊情境

**做以上任一项前必读**�?
- `docs/superpowers/specs/` 下对应设计规格文�?
- `docs/superpowers/plans/` 下对应实施计�?
- `docs/erark-replication.md` 复刻铁律

### 引擎深化

- LLM 口上（流�?上下�?token/降级�?
- 天赋/套装钩子式效果（需沙箱�?
- combat-wuxia 公式 mod override 完整机制
- 战斗外精确分钟级 tick
- NPC 队友 AI 优化
- inventory-system tags 驱动指令完整实现（当前只 stub�?
- scene-system event 完整管线（events/ 目录、start_scene effect、嵌套场景）
- 限时/重复/日常任务
- 日志搜索/过滤
- 自动化脚�?宏（Command ID 链式执行�?
- onDisable/onUnload 插件生命周期
- semver 版本校验
- required_attributes 继承
- 标准事件契约完整发出
- getDefaultValue 类型感知默认�?
- 地图层级文档自动生成
- 深色模式算法反色优化

### UI 剩余�?

- 角色指令栏开�?
- 大事志内容填�?
- 复杂历法（当�?day%7�?
- 多图立绘 variants
- foldStates 存档持久�?
- 侧栏三条杠手柄承载更多简要信�?
- 目标选择菜单（仙剑式�?
- 战斗 UI 美化（仙剑式布局�?
- 全体技�?回复/buff
- 战斗中不可选中队友为攻击目�?
- HP=0 后角色处�?

### 属性面板值域约束（接入升级系统后重新检查）

**背景**：erArk 通过 `AbilityUp.csv` 为每项能力定�?0�?�?→…→7 的升级路径，严格限制了取值范围�?
我们当前**没有运行时约�?*——`"技�? = 99999` 会如实显示，不会报错�?

**问题�?*�?
1. 感觉（皮肤感度等）、能力（技�?顺从等）、刻印、技术、扩张（阴道扩张/后穴扩张/子宫扩张）目前只是原始数字，�?max 限制
2. erArk �?`AbilityUp.csv` 定义了每级的升级需求（XP/宝珠/经验），我们还没�?
3. 接入升级系统后，需要确认：要不要为这些值加 max 约束？约束力度多强（硬限�?vs 约定）？
4. 刻印的合理范围是 0~3 还是 0~5�?
5. 感觉值（皮肤感度）的合理范围——erArk 允许 0~7 级，每级一个阈�?
6. 如果加约束，是在 `attributes.toml` �?`max` 字段，还是由升级系统全权管理�?

**提醒**：回头检查这里的对话记录�?026-07-13 会话后半�?`属性页签值域` 话题）�?

### settle 公式深化

- calcStateChange 追加素质修正/道具修正/extra_adjust
- 素质修正（char.talents 读取 + erArk talent mod 表乘算）
- 道具修正（装�?使用中道具）
- 永久感度（皮肤感�?胸部感度等）�?H 行为增长机制

## �������ϵͳ��confinement-system���ο��ĵ�

| ϵͳ | �ֲ� | ���/���� |
|------|------|-----------|
| ������� | `docs/confinement-system.md` | src/plugins/confinement-system/ |
| ADR��hp/mp �� | `docs/adr/0010-confinement-hpmp-bindings.md` | - |
| ADR�����ݹ��� | `docs/adr/0011-confinement-content-ownership.md` | - |
| ADR������/׷����ʽ | `docs/adr/0012-confinement-escape-and-pursuit.md` | - |

## ���ϵͳ TODO��2026-08-14 ���׶���أ�

- [x] �׶�A��װ��/Ͷ��/�ͷ�/�ų� 4 ָ�� + ����״̬��sp_flag + λ2 + ǿ�ƿ�ӡ��+ ���ѽ��� + ǰ��ע��
- [x] �׶�B��׷��ί�У�quest startDynamicScene + ����� + 3��ʱ�ޣ�
- [x] �׶�C������������/��� + ÿ��ѵ����6 ģʽ����������+ ����ǰ׼�� + �������֣�sex_assist��
- [ ] ���Ʒ��ǣ�������ѵ��ÿ��һ�� �� ͨ�ù���ϵͳ��غ�Ĺ�����Ϊ����warden.ts interval �ֶΣ�
- [ ] ���Ʒ��ǣ������� AI �ƶ� �� ����ϵͳ��غ�Ӧ�ƶ�����Ѻ����ִ��ѵ����Ϊ��
- [ ] TODO�����ѹ�ʽս��/ѧʶ���� tag �ۺ��� erArk Ǩ�ƽ��� �� ���� mod ʱ�����ǵĹ�ʽ�뼼�ܸģ�escape.ts getSkillTotal��
- [ ] TODO������/�������ӣ�clothing ���� 2/3�����װϵͳ��ؾ�ȷ����prisoner.ts applyPrisonerClothing��
- [ ] TODO���������� per-tick ��ΪƵ�ʶ��� erArk����ǰÿʱ��Ƭһ�Σ�erArk ��ÿ��Ϊһ�Σ�
- [ ] TODO��������� UI��settings 7 �� + �����б� + ���߿��أ�����Naive UI ������壬ָ����� manage_confinement
## ���ϵͳ 2026-08-14 ����޸�����Ĭ�����Ų飩

- [x] �޸���engine API ȱ `abilities.getByTag`��AGENTS ��35 ������δʵ�֣��� ���ѹ�ʽ���ܺ� 0��������Զֻ������ 1%����api.ts ��ʵ��
- [x] �޸����ӷ���ʱ�� day ��ֵ���������ã�30��1������������ʱ�����Ĵ� escapedAt �ܷ�����
- [x] �޸���ѵ�� setFields ����ֵ���ǣ�������ӡ��Զ=1���������ۼ�����
- [x] �޸���װ��ǰ�� T_UNCONSCIOUS_FLAG_6��unconscious_h===6 �����ڣ��� װ��������������ע�� TARGET_DEEP_UNCONSCIOUS ������
- [x] �޸���������׷����̬ scene ���ؽ� �� ����������state restore �ؽ���rebuildFugitiveScenes��
- [x] �޸�������������λ�ü�飨ǧ��������������֣�������ͬ�ص�+���߼��
- [x] �޸���������Ϊÿ time_advanced ִ�У�1 ���Ӵ����ܶȱ�ը�������� 5 ���Ӽ������
- [x] �޸���Ͷ��λ�ö� UI store������δͬ������ �� core gameContext Ȩ�� + ��λ�ñ���
- [x] �޸�������ǰ׼���ƶ��� catch����Ĭʧ�ܣ��� ǿ�ƴ��� + �ϱ�
- [x] �޸���getUnusedPrisonCell ���� pre_dormitory ��ռ�� �� ֻ�� current_location
- [x] �޸���charaRelease ˲�ƻ� home ���� API �� �� character moveTo
## ���ϵͳ 2026-08-14 ��������޸�

- [x] �޸���prisoner.ts Ӳ�������Ŀ�ӡ��������Υ����������ֹӲ�������ɣ��� h-mark ���� setLevel API��ֻ�� markId����confinement ���� API
- [x] �޸���assistant onHStart �������������� h_state��ȱ orgasm_count �� �� execution_end ��Ĭ NaN��+ ȱ h_wait �� �� �������ṹ + h-npc-ai enterHBlock API
- [x] �޸���index.ts effect �� execCtx.gameStore.player��NPC ����/����ֱ��ʱȱʧ �� ��Ĭ return true���� ͳһ�� gameContext
- [x] �޸���state.ts �����ؽ�׷�� scene Ϊ fire-and-forget ��̬ import��ʱ���������� ��̬ import + ͬ��ע�� + ���� buildFugitiveScene�������� escape.ts ���ظ����죩
- [x] �޸���warden �����ƶ�ֱ��д current_location�����¼����� �� character moveTo��removeWarden �� async
- [x] �޸���escapeSuccess setOffline ʧ�ܺ��ӷ������ߣ�escaping ��λ�ò�һ�£��� ʧ��ʱֱ���� offline + ��λ��
- [x] API �ĵ�ͬ����h-mark.setLevel / h-npc-ai.enterHBlock/exitHBlock / engine.abilities.getByTag
## ���ϵͳ 2026-08-14 ��������޸�

- [x] �޸���PL_NOT_BAGGING_CHARA �������Я�� A ʱ��װ�� B �� bagging_chara_id ���ǡ�A �������߶�ʧ���� ��Ϊ"δ�ڰ����κ���" + effect �����
- [x] �޸��������¼����ɫ�����ڵ� prisoners/fugitives �м�¼�����������ɫ��ɾʱ���ò������� settlePrisoners/checkFugitiveDeadline ���� + �ϱ�
- [x] �޸����������ֺ�ѡ�ز�����ǰ��/������ѡ��ǰ�᲻�����ָ�� �� ִ�о�Ĭ�������� �� conditionEngine ǰ��+�������ˣ����� h-npc-ai filter.ts��
- [x] �޸���settleTraining ����������״̬������/����/�����ʱѵ�����ܣ��� ������
## ���ϵͳ 2026-08-14 ��������޸�

- [x] �޸���state.ts ? escape.ts ѭ��������state import escape + escape import state���� buildFugitiveScene ��������ļ� fugitive-scene.ts����������
- [x] �޸���settleTraining ������ modify_attribute��bindingResolver.get ����ͬ������ͻ����combat-base Ҳ�� hp ʱ���ܿ۴����ԣ��� �� getForPlugin/setForPlugin��ADR 0010 һ�£�
- [x] �޸���confinement_bagging setOffline ʧ�ܲ��жϣ�be_bagged=true ������ + bagging_chara_id ���� �� ��Ĭ��һ�£��� ʧ�ܻع�װ��״̬
- [x] �޸���confinement_put_into_prison setOnline ʧ������ bagging_chara_id �� ��ʬ������ �� ��������״̬������
- [x] �޸���confinement_release_from_bag �����Ǻ� setOnline��ʧ��ʱ��ʬ���� �����߳ɹ�������
- [x] �޸���Ĭ�� training.toml wardenAbility="����" ���ò����ڵ����� �� settleTraining �ϱ� warning������Ĭ������
## ���ϵͳ 2026-08-14 ��������޸�

- [x] �޸���setSettings ������У�飨training=99/living_condition="��" ��Ĭд�� �� ѵ��ģʽ�Ҳ���/���ѹ�ʽ NaN���� ��ֵö��У�� + δ֪���ϱ���getSettings ������������鲻�����ù�����
- [x] �޸���getHpPercent/getMpPercent �ѵ�ǰֵ���ٷֱȣ�hp ����>100 ʱϵͳ��ƫ�󣩡� ���� hp_max/mp_max ��һ����bindings.toml ���� hp_max/mp_max Լ�����������޻��˾ɽ��ƣ�test-mod ����
- [x] �޸���TARGET_DEEP_UNCONSCIOUS �������ڵ� sleep_level �ֶΣ�sleep-system ��˯�ȼ��Ǻ����Ƶ����� ɾ�����룬unconscious_h��{1,3,5} Ȩ���ж�
- [x] ���ԣ�hp/mp �ٷֱȹ�һ���ع���ԣ��Կ�ֵ·������ɱ棩
## ���ϵͳ 2026-08-14 ��������޸�

- [x] �޸����¼��������ݵ��������ظ� onEnable �� game:new_day ˫�����㣩�� ģ�鼶������h-core hCoreExecutionEndListener ͬ��������ع����
- [x] �޸���Ĭ�� training.toml ģʽ1/2 �� state="���" ���ò����ڵ�״̬������״̬����"����" ATTR.PLEASURE���� ѵ�����㾲Ĭ��Ч������"����" + ɨ��ű���scan-attr-refs.cjs��У��ͨ��
- [x] �Ų�ȷ�������⣺judge_check ��� bonus ��Ŀ�겻�ظ���break����handleNpcInstructCondition �����֧Ϊ˯��·���������ࣨ��ʵ������apiSystem.register �ظ� onEnable �״�Ϊ������б��������� restore ˳��setTime/setPlayer/location ���� provider��