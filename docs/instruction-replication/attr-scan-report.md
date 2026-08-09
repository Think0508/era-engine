# 第1层扫描报告（scan-attr-refs.cjs）

- 定义集合：attributes 92 / abilities 40 / talents 177 / status 3 / relations 1
- VIOLATION：0（属性上下文引用未定义 —— 必须修复到 0）
- ATTR 展开违规：0
- UNMATCHED：1287（非属性上下文中文，人工三审，多为 UI/日志/数据值文本）

## UNMATCHED（人工三审）

| 文件 | 行 | 引用 | 上下文 |
|------|----|------|--------|
| src/core/binding-resolver.ts | 58 | `缺少绑定：插件` | ``模组 '${modName}' 缺少绑定：插件 '${pluginId}' 需要 '${key}'，请检查 bindings.toml`,` |
| src/core/binding-resolver.ts | 58 | `需要` | ``模组 '${modName}' 缺少绑定：插件 '${pluginId}' 需要 '${key}'，请检查 bindings.toml`,` |
| src/core/character-contract.test.ts | 26 | `测试模组` | `name = "测试模组"` |
| src/core/character-contract.test.ts | 50 | `甲` | `name = "甲"` |
| src/core/character-contract.test.ts | 55 | `校验）` | `describe('character-contract（mod-loader 校验）', () => {` |
| src/core/character-contract.test.ts | 62 | `裸字段` | `it('裸字段 → warning（未定义属性键），已定义键不误报', () => {` |
| src/core/character-contract.test.ts | 62 | `warning（未定义属性键），已定义键不误报` | `it('裸字段 → warning（未定义属性键），已定义键不误报', () => {` |
| src/core/character-contract.test.ts | 66 | `甲` | `name = "甲"` |
| src/core/character-contract.test.ts | 67 | `魅力` | `base = { "体力" = 100, "好感度" = 50, "魅力" = 99 }` |
| src/core/character-contract.test.ts | 72 | `魅力` | `const bare = warnings.find(w => w.message.includes('魅力'))` |
| src/core/character-contract.test.ts | 76 | `未定义` | `expect(warnings.some(w => w.message.includes("'体力'") && w.message.includes('未定义'))).toBe(false)` |
| src/core/character-contract.test.ts | 80 | `裸字段（abilities` | `it('裸字段（abilities 命名空间）→ warning', () => {` |
| src/core/character-contract.test.ts | 80 | `命名空间）→` | `it('裸字段（abilities 命名空间）→ warning', () => {` |
| src/core/character-contract.test.ts | 84 | `甲` | `name = "甲"` |
| src/core/character-contract.test.ts | 86 | `降龙十八掌` | `abilities = { "降龙十八掌" = 3 }` |
| src/core/character-contract.test.ts | 89 | `降龙十八掌` | `const bare = errorReporter.getErrors().find(w => w.message.includes('降龙十八掌'))` |
| src/core/character-contract.test.ts | 94 | `未定义状态效果/关系类型` | `it('未定义状态效果/关系类型 → warning', () => {` |
| src/core/character-contract.test.ts | 98 | `甲` | `name = "甲"` |
| src/core/character-contract.test.ts | 105 | `未定义的状态效果` | `expect(msgs).toContain('未定义的状态效果')` |
| src/core/character-contract.test.ts | 106 | `未定义的关系类型` | `expect(msgs).toContain('未定义的关系类型')` |
| src/core/character-contract.test.ts | 109 | `插件注册的必需集校验器：缺必需属性` | `it('插件注册的必需集校验器：缺必需属性 → warning（不阻止加载）', () => {` |
| src/core/character-contract.test.ts | 109 | `warning（不阻止加载）` | `it('插件注册的必需集校验器：缺必需属性 → warning（不阻止加载）', () => {` |
| src/core/character-contract.test.ts | 120 | `缺必需属性` | `message: `角色 '${charId}' 缺必需属性 '体力'`,` |
| src/core/character-contract.test.ts | 128 | `甲` | `name = "甲"` |
| src/core/character-contract.test.ts | 136 | `缺必需属性` | `expect(errorReporter.getErrors().some(e => e.message.includes('缺必需属性'))).toBe(false)` |
| src/core/character-contract.test.ts | 139 | `校验器自身异常不拖垮加载（warning` | `it('校验器自身异常不拖垮加载（warning 化）', () => {` |
| src/core/character-contract.test.ts | 139 | `化）` | `it('校验器自身异常不拖垮加载（warning 化）', () => {` |
| src/core/character-contract.test.ts | 149 | `校验器重复注册` | `it('校验器重复注册 → 后者覆盖', () => {` |
| src/core/character-contract.test.ts | 149 | `后者覆盖` | `it('校验器重复注册 → 后者覆盖', () => {` |
| src/core/character-contract.test.ts | 156 | `character-contract（存档补齐）` | `describe('character-contract（存档补齐）', () => {` |
| src/core/character-contract.test.ts | 162 | `fillMissingAttributes：缺属性/能力` | `it('fillMissingAttributes：缺属性/能力 → attributes default 补齐 + warning', () => {` |
| src/core/character-contract.test.ts | 162 | `补齐` | `it('fillMissingAttributes：缺属性/能力 → attributes default 补齐 + warning', () => {` |
| src/core/character-contract.test.ts | 170 | `读档` | `fillMissingAttributes(char, attrs, '读档 test')` |
| src/core/character-contract.test.ts | 180 | `fillMissingAttributes：契约前存档（base` | `it('fillMissingAttributes：契约前存档（base 写法）不重复补', () => {` |
| src/core/character-contract.test.ts | 180 | `写法）不重复补` | `it('fillMissingAttributes：契约前存档（base 写法）不重复补', () => {` |
| src/core/character-contract.test.ts | 186 | `读档` | `fillMissingAttributes(char, attrs, '读档 test')` |
| src/core/character-contract.test.ts | 195 | `接线：无` | `it('restoreFromSave 接线：无 mod 时不补齐也不报错（既有行为保持）', () => {` |
| src/core/character-contract.test.ts | 195 | `时不补齐也不报错（既有行为保持）` | `it('restoreFromSave 接线：无 mod 时不补齐也不报错（既有行为保持）', () => {` |
| src/core/character-contract.test.ts | 199 | `玩家` | `characters: [{ id: 'player', name: '玩家', base: { hp: 100 } }],` |
| src/core/character-contract.test.ts | 203 | `玩家` | `expect(entitySystem.get('character', 'player')?.name).toBe('玩家')` |
| src/core/character-contract.test.ts | 207 | `character-contract（测试基座一致性）` | `describe('character-contract（测试基座一致性）', () => {` |
| src/core/character-contract.test.ts | 208 | `全部键` | `it('DEFAULT_NPC_BASE / DEFAULT_PLAYER_BASE 全部键 ⊆ attributes.toml 定义', () => {` |
| src/core/character-contract.test.ts | 208 | `定义` | `it('DEFAULT_NPC_BASE / DEFAULT_PLAYER_BASE 全部键 ⊆ attributes.toml 定义', () => {` |
| src/core/character-contract.test.ts | 233 | `全字段重置（含` | `it('resetCharacterEntity 全字段重置（含 marks）——跨测试污染防线', () => {` |
| src/core/character-contract.test.ts | 233 | `marks）——跨测试污染防线` | `it('resetCharacterEntity 全字段重置（含 marks）——跨测试污染防线', () => {` |
| src/core/character-contract.test.ts | 247 | `character-contract（扫描脚本自测）` | `describe('character-contract（扫描脚本自测）', () => {` |
| src/core/character-contract.test.ts | 248 | `退出码` | `it('scan-attr-refs.cjs 退出码 0（第1层 0 违规）', () => {` |
| src/core/character-contract.test.ts | 248 | `0（第1层` | `it('scan-attr-refs.cjs 退出码 0（第1层 0 违规）', () => {` |
| src/core/character-contract.test.ts | 248 | `违规）` | `it('scan-attr-refs.cjs 退出码 0（第1层 0 违规）', () => {` |
| src/core/character-contract.test.ts | 256 | `对账四类齐备` | `it('scan-erark-defs.cjs 对账四类齐备 + 遗漏 0（人工已确认）', () => {` |
| src/core/character-contract.test.ts | 256 | `遗漏` | `it('scan-erark-defs.cjs 对账四类齐备 + 遗漏 0（人工已确认）', () => {` |
| src/core/character-contract.test.ts | 256 | `0（人工已确认）` | `it('scan-erark-defs.cjs 对账四类齐备 + 遗漏 0（人工已确认）', () => {` |
| src/core/character-contract.test.ts | 260 | `已对齐` | `expect(out).toContain('已对齐')` |
| src/core/character-contract.test.ts | 261 | `有意删减` | `expect(out).toContain('有意删减')` |
| src/core/character-contract.test.ts | 262 | `替代处理` | `expect(out).toContain('替代处理')` |
| src/core/character-contract.test.ts | 264 | `[遗漏]` | `const missingLines = out.split('\n').filter((l: string) => l.includes('[遗漏]'))` |
| src/core/command-executor.test.ts | 31 | `指令执行成功` | `it('handler 指令执行成功', async () => {` |
| src/core/command-executor.test.ts | 35 | `测试` | `label: '测试',` |
| src/core/command-executor.test.ts | 49 | `指令不存在时` | `it('指令不存在时 warning 不崩', async () => {` |
| src/core/command-executor.test.ts | 49 | `不崩` | `it('指令不存在时 warning 不崩', async () => {` |
| src/core/command-executor.test.ts | 57 | `不满足时跳过` | `it('condition 不满足时跳过', async () => {` |
| src/core/command-executor.test.ts | 61 | `有条件指令` | `label: '有条件指令',` |
| src/core/command-executor.test.ts | 71 | `条件不满足` | `expect(errors.some(e => e.message.includes('条件不满足'))).toBe(true)` |
| src/core/command-executor.test.ts | 74 | `抛错时仍回` | `it('handler 抛错时仍回 IDLE', async () => {` |
| src/core/command-executor.test.ts | 77 | `会崩的指令` | `label: '会崩的指令',` |
| src/core/command-executor.test.ts | 80 | `崩了` | `handler: () => { throw new Error('handler 崩了') },` |
| src/core/command-executor.test.ts | 87 | `崩了` | `expect(errors.some(e => e.severity === 'error' && e.message.includes('handler 崩了'))).toBe(true)` |
| src/core/command-executor.test.ts | 90 | `类指令` | `it('effects 类指令 effect-system 未注册时 warning', async () => {` |
| src/core/command-executor.test.ts | 90 | `未注册时` | `it('effects 类指令 effect-system 未注册时 warning', async () => {` |
| src/core/command-executor.test.ts | 93 | `效果指令` | `label: '效果指令',` |
| src/core/command-executor.test.ts | 105 | `时` | `it('无 handler 无 effects 时 warning', async () => {` |
| src/core/command-executor.test.ts | 108 | `空指令` | `label: '空指令',` |
| src/core/command-executor.test.ts | 115 | `既无` | `expect(errors.some(e => e.message.includes('既无 handler'))).toBe(true)` |
| src/core/command-executor.test.ts | 118 | `不满足时跳过（L1` | `it('premises 不满足时跳过（L1.6 premises 独立字段）', async () => {` |
| src/core/command-executor.test.ts | 118 | `独立字段）` | `it('premises 不满足时跳过（L1.6 premises 独立字段）', async () => {` |
| src/core/command-executor.test.ts | 122 | `前提指令` | `label: '前提指令',` |
| src/core/command-executor.test.ts | 132 | `前提不满足` | `expect(errors.some(e => e.message.includes('前提不满足'))).toBe(true)` |
| src/core/command-executor.test.ts | 139 | `fail-safe——有` | `it('fail-safe——有 condition/premises 但调用方未提供求值器 → warning + 跳过（禁止静默放行）', async () => {` |
| src/core/command-executor.test.ts | 139 | `但调用方未提供求值器` | `it('fail-safe——有 condition/premises 但调用方未提供求值器 → warning + 跳过（禁止静默放行）', async () => {` |
| src/core/command-executor.test.ts | 139 | `跳过（禁止静默放行）` | `it('fail-safe——有 condition/premises 但调用方未提供求值器 → warning + 跳过（禁止静默放行）', async () => {` |
| src/core/command-executor.test.ts | 143 | `无求值器前提指令` | `label: '无求值器前提指令',` |
| src/core/command-executor.test.ts | 153 | `无求值器条件指令` | `label: '无求值器条件指令',` |
| src/core/command-executor.test.ts | 166 | `未提供` | `expect(errors.some(e => e.message.includes('未提供 evaluatePremises'))).toBe(true)` |
| src/core/command-executor.test.ts | 167 | `未提供` | `expect(errors.some(e => e.message.includes('未提供 evaluateCondition'))).toBe(true)` |
| src/core/command-executor.test.ts | 170 | `前提求值器抛错` | `it('前提求值器抛错 → 捕获 + errorReporter，异常不逃逸 execute()', async () => {` |
| src/core/command-executor.test.ts | 170 | `捕获` | `it('前提求值器抛错 → 捕获 + errorReporter，异常不逃逸 execute()', async () => {` |
| src/core/command-executor.test.ts | 170 | `errorReporter，异常不逃逸` | `it('前提求值器抛错 → 捕获 + errorReporter，异常不逃逸 execute()', async () => {` |
| src/core/command-executor.test.ts | 174 | `前提抛错指令` | `label: '前提抛错指令',` |
| src/core/command-executor.test.ts | 183 | `前提` | `evaluatePremises: () => { throw new Error('前提 handler 崩了') },` |
| src/core/command-executor.test.ts | 183 | `崩了` | `evaluatePremises: () => { throw new Error('前提 handler 崩了') },` |
| src/core/command-executor.test.ts | 187 | `求值抛错` | `expect(errors.some(e => e.severity === 'error' && e.message.includes('求值抛错'))).toBe(true)` |
| src/core/command-executor.test.ts | 192 | `自定义耗时）不自动推进时间、不发负数耗时` | `it('timeCost <= 0（-1 = handler 自定义耗时）不自动推进时间、不发负数耗时', async () => {` |
| src/core/command-executor.test.ts | 196 | `自定义耗时` | `label: 'handler 自定义耗时',` |
| src/core/command-executor.ts | 76 | `检查指令是否已注册到` | `suggestion: '检查指令是否已注册到 CommandRegistry',` |
| src/core/command-executor.ts | 91 | `调用方需注入` | `suggestion: '调用方需注入 evaluatePremises（premiseRegistry 非严格求值），参考 CommandBar/command-eval',` |
| src/core/command-executor.ts | 91 | `非严格求值），参考` | `suggestion: '调用方需注入 evaluatePremises（premiseRegistry 非严格求值），参考 CommandBar/command-eval',` |
| src/core/command-executor.ts | 112 | `调用方需注入` | `suggestion: '调用方需注入 evaluateCondition（条件表达式求值），参考 CommandBar/command-eval',` |
| src/core/command-executor.ts | 112 | `evaluateCondition（条件表达式求值），参考` | `suggestion: '调用方需注入 evaluateCondition（条件表达式求值），参考 CommandBar/command-eval',` |
| src/core/command-executor.ts | 130 | `检查前提` | `suggestion: '检查前提 handler 与条件表达式',` |
| src/core/command-executor.ts | 130 | `与条件表达式` | `suggestion: '检查前提 handler 与条件表达式',` |
| src/core/command-executor.ts | 169 | `检查` | `suggestion: '检查 effect-system 插件是否已加载',` |
| src/core/command-executor.ts | 169 | `插件是否已加载` | `suggestion: '检查 effect-system 插件是否已加载',` |
| src/core/command-registry.test.ts | 13 | `交谈` | `label: '交谈',` |
| src/core/command-registry.test.ts | 26 | `重复` | `it('register 重复 id 报错', () => {` |
| src/core/command-registry.test.ts | 26 | `报错` | `it('register 重复 id 报错', () => {` |
| src/core/command-registry.test.ts | 49 | `按` | `it('getByGroup 按 priority 升序', () => {` |
| src/core/command-registry.test.ts | 49 | `升序` | `it('getByGroup 按 priority 升序', () => {` |
| src/core/command-registry.test.ts | 57 | `过滤模式` | `it('getByMode 过滤模式', () => {` |
| src/core/command-registry.test.ts | 65 | `联合过滤` | `it('getByMode + group 联合过滤', () => {` |
| src/core/condition-registry.test.ts | 60 | `可用条件属性手册` | `expect(manual).toContain('可用条件属性手册')` |
| src/core/condition-registry.test.ts | 66 | `validateExpression——结构路径（location` | `it('validateExpression——结构路径（location.tags.{tag}/talents/first_times/relations）', () => {` |
| src/core/condition-registry.test.ts | 85 | `validateExpression——未知字段返回列表` | `it('validateExpression——未知字段返回列表', () => {` |
| src/core/condition-registry.test.ts | 96 | `validateExpression——插件自定义根字段直接精确校验（无根白名单）` | `it('validateExpression——插件自定义根字段直接精确校验（无根白名单）', () => {` |
| src/core/condition-registry.test.ts | 113 | `否定与比较符边界` | `it('validateExpression——! 否定与比较符边界', () => {` |
| src/core/condition-registry.ts | 30 | `转换输出` | `{ path: 'player.abilities.{ability}.level', type: 'number', description: 'Player ability level (CVP A1 转换输出)',` |
| src/core/condition-registry.ts | 31 | `转换输出` | `{ path: 'player.talents.{talent}', type: 'number', description: 'Player talent (CVP A1 转换输出)', operators: '> <` |
| src/core/condition-registry.ts | 41 | `精液污染追踪` | `{ path: 'character.{id}.body_semen.{part}.{index}', type: 'number', description: 'Character body semen count (` |
| src/core/condition-registry.ts | 114 | `可用条件属性手册\n\n` | `let md = '# 可用条件属性手册\n\n'` |
| src/core/condition.test.ts | 7 | `酒馆` | `location: { id: 'tavern', name: '酒馆', parent: null, type: 'building', tags: ['rest', 'has_drink'] },` |
| src/core/condition.test.ts | 97 | `酒馆-分店` | `expect(() => evaluateCondition('location.name == "酒馆-分店"', ctx)).not.toThrow()` |
| src/core/condition.test.ts | 101 | `酒馆` | `expect(() => evaluateCondition('location.name == "酒馆(分店"', ctx)).not.toThrow()` |
| src/core/condition.test.ts | 101 | `分店` | `expect(() => evaluateCondition('location.name == "酒馆(分店"', ctx)).not.toThrow()` |
| src/core/condition.test.ts | 134 | `根路径与` | `it('target 根路径与 selected 同解（judge adjustments 用）', () => {` |
| src/core/condition.test.ts | 134 | `同解（judge` | `it('target 根路径与 selected 同解（judge adjustments 用）', () => {` |
| src/core/condition.test.ts | 134 | `用）` | `it('target 根路径与 selected 同解（judge adjustments 用）', () => {` |
| src/core/condition.test.ts | 142 | `右值——存在性检查（selected` | `it('null/undefined 右值——存在性检查（selected != null 惯用法）', () => {` |
| src/core/condition.test.ts | 142 | `惯用法）` | `it('null/undefined 右值——存在性检查（selected != null 惯用法）', () => {` |
| src/core/condition.test.ts | 152 | `能力记录终端解包为等级（AGENTS` | `it('能力记录终端解包为等级（AGENTS §36 数据契约）', () => {` |
| src/core/condition.test.ts | 152 | `数据契约）` | `it('能力记录终端解包为等级（AGENTS §36 数据契约）', () => {` |
| src/core/condition.test.ts | 158 | `别名路径（fieldAliases：status→status_effects,` | `it('status 别名路径（fieldAliases：status→status_effects, remaining→remaining_duration）', () => {` |
| src/core/data-dependencies.test.ts | 5 | `无依赖的插件按原顺序返回` | `it('无依赖的插件按原顺序返回', () => {` |
| src/core/data-dependencies.test.ts | 13 | `被依赖的插件排在前面` | `it('被依赖的插件排在前面', () => {` |
| src/core/data-dependencies.test.ts | 22 | `多级依赖链正确排序` | `it('多级依赖链正确排序', () => {` |
| src/core/data-dependencies.test.ts | 33 | `循环依赖不断链` | `it('循环依赖不断链', () => {` |
| src/core/data-dependencies.test.ts | 45 | `指向不存在的` | `it('depends_on 指向不存在的 capability 不崩', () => {` |
| src/core/data-dependencies.test.ts | 45 | `不崩` | `it('depends_on 指向不存在的 capability 不崩', () => {` |
| src/core/entity-system.test.ts | 20 | `ID重复` | `'ID重复',` |
| src/core/entity-system.test.ts | 84 | `血量` | `{ hp: { type: 'number', description: '血量' } },` |
| src/core/entity-system.test.ts | 88 | `缺少绑定` | `expect(errors[0]).toContain('缺少绑定')` |
| src/core/entity-system.test.ts | 98 | `血量` | `hp: { type: 'number', description: '血量' },` |
| src/core/entity-system.test.ts | 118 | `不存在` | `'不存在',` |
| src/core/game-context.test.ts | 85 | `模式栈行为` | `it('enterMode/exitMode 模式栈行为', async () => {` |
| src/core/game-context.test.ts | 107 | `和` | `it('moveTo emit location:leave 和 location:enter', async () => {` |
| src/core/game-context.test.ts | 110 | `城镇` | `id: 'town', name: '城镇', parent: null, type: 'building', tags: [],` |
| src/core/game-context.test.ts | 113 | `森林` | `id: 'forest', name: '森林', parent: null, type: 'field', tags: [],` |
| src/core/game-context.test.ts | 131 | `使用默认` | `it('moveTo 使用默认 timeCost 5 分钟', async () => {` |
| src/core/game-context.test.ts | 131 | `分钟` | `it('moveTo 使用默认 timeCost 5 分钟', async () => {` |
| src/core/game-context.test.ts | 134 | `城镇` | `id: 'town', name: '城镇', parent: null, type: 'building', tags: [],` |
| src/core/game-context.test.ts | 137 | `森林` | `id: 'forest', name: '森林', parent: null, type: 'field', tags: [],` |
| src/core/game-context.test.ts | 146 | `带` | `it('game:new_day payload 带 reason 字段', async () => {` |
| src/core/game-context.test.ts | 146 | `字段` | `it('game:new_day payload 带 reason 字段', async () => {` |
| src/core/game-context.ts | 102 | `失败：当前地点未设置` | `throw new Error('moveTo 失败：当前地点未设置')` |
| src/core/mod-loader.ts | 506 | `缺属性` | `message: `${source}：角色 '${char.id}' 缺属性 '${attrName}'，已用默认值 ${defaultValue} 补齐（命名空间 ${def.category === 'abilit` |
| src/core/mod-loader.ts | 507 | `旧存档缺字段属正常（契约补齐）；如需自定义初始值请更新存档或迁移规则` | `suggestion: '旧存档缺字段属正常（契约补齐）；如需自定义初始值请更新存档或迁移规则',` |
| src/core/mod-loader.ts | 551 | `使用了未定义的属性` | `message: `角色 '${charId}' 使用了未定义的属性 '${key}'（命名空间 ${ns}）`,` |
| src/core/mod-loader.ts | 563 | `使用了未定义的状态效果` | `message: `角色 '${charId}' 使用了未定义的状态效果 '${eff.id}'`,` |
| src/core/mod-loader.ts | 564 | `状态效果需在` | `suggestion: '状态效果需在 definitions/status-effects.toml 定义',` |
| src/core/mod-loader.ts | 564 | `定义` | `suggestion: '状态效果需在 definitions/status-effects.toml 定义',` |
| src/core/mod-loader.ts | 578 | `使用了未定义的关系类型` | `message: `角色 '${charId}' 使用了未定义的关系类型 '${typeName}'`,` |
| src/core/mod-loader.ts | 579 | `关系类型需在` | `suggestion: '关系类型需在 definitions/relations.toml 定义',` |
| src/core/mod-loader.ts | 579 | `定义` | `suggestion: '关系类型需在 definitions/relations.toml 定义',` |
| src/core/mod-loader.ts | 705 | `的模板` | ``${rosterPath}: 角色 '${entry.id}' 的模板 '${entry.template}' 解析失败: ${(e as Error).message}`,` |
| src/core/mod-loader.ts | 737 | `的模板` | ``${path}: 角色 '${charId}' 的模板 '${data.template}' 解析失败: ${(e as Error).message}`,` |
| src/core/mod-loader.ts | 942 | `缺少` | `errorReporter.report({ source: 'mod-loader', severity: 'warning', file: path, message: 'Scene 缺少 id 字段，跳过' })` |
| src/core/mod-loader.ts | 942 | `字段，跳过` | `errorReporter.report({ source: 'mod-loader', severity: 'warning', file: path, message: 'Scene 缺少 id 字段，跳过' })` |
| src/core/mod-loader.ts | 956 | `的` | `source: 'mod-loader', severity: 'error', message: `Scene '${id}' 的 step 引用了不存在的 scene_id '${step.scene_id}'`,` |
| src/core/mod-loader.ts | 956 | `引用了不存在的` | `source: 'mod-loader', severity: 'error', message: `Scene '${id}' 的 step 引用了不存在的 scene_id '${step.scene_id}'`,` |
| src/core/mod-loader.ts | 957 | `或` | `suggestion: `检查 ${scenePrefixes.map(p => p.replace(`/mods/${modName}/`, '')).join(' 或 ')} 下是否有该 id 的文件`,` |
| src/core/mod-loader.ts | 996 | `同层指令` | `suggestion: '同层指令 id 必须唯一；mod 覆盖插件默认请用同 id 但只在 mod 层定义',` |
| src/core/mod-loader.ts | 996 | `必须唯一；mod` | `suggestion: '同层指令 id 必须唯一；mod 覆盖插件默认请用同 id 但只在 mod 层定义',` |
| src/core/mod-loader.ts | 996 | `覆盖插件默认请用同` | `suggestion: '同层指令 id 必须唯一；mod 覆盖插件默认请用同 id 但只在 mod 层定义',` |
| src/core/mod-loader.ts | 996 | `但只在` | `suggestion: '同层指令 id 必须唯一；mod 覆盖插件默认请用同 id 但只在 mod 层定义',` |
| src/core/mod-loader.ts | 996 | `层定义` | `suggestion: '同层指令 id 必须唯一；mod 覆盖插件默认请用同 id 但只在 mod 层定义',` |
| src/core/mod-loader.ts | 1045 | `的` | ``mods/${modName}/maps/locations/: 地点 '${id}' 的 parent '${loc.parent}' 不存在`,` |
| src/core/mod-loader.ts | 1110 | `使用了未定义的天赋` | ``mods/${modName}/characters/: 角色 '${charId}' 使用了未定义的天赋 '${talentId}'（可用：${Object.keys(defs).slice(0, 10).join(` |
| src/core/narrative-log.test.ts | 11 | `返回` | `it('write 返回 entry id 且可读取', () => {` |
| src/core/narrative-log.test.ts | 11 | `且可读取` | `it('write 返回 entry id 且可读取', () => {` |
| src/core/narrative-log.test.ts | 12 | `测试文本` | `const id = log.write('测试文本', 'system', 'test')` |
| src/core/narrative-log.test.ts | 16 | `测试文本` | `expect(entries[0].text).toBe('测试文本')` |
| src/core/narrative-log.test.ts | 21 | `多条生成唯一` | `it('write 多条生成唯一 id', () => {` |
| src/core/narrative-log.test.ts | 22 | `第一条` | `const id1 = log.write('第一条', 'system')` |
| src/core/narrative-log.test.ts | 23 | `第二条` | `const id2 = log.write('第二条', 'dialogue')` |
| src/core/narrative-log.test.ts | 28 | `超过` | `it('超过 limit 淘汰最旧', () => {` |
| src/core/narrative-log.test.ts | 28 | `淘汰最旧` | `it('超过 limit 淘汰最旧', () => {` |
| src/core/narrative-log.test.ts | 39 | `标记` | `it('markConsumed 标记 interactive entry', () => {` |
| src/core/narrative-log.test.ts | 40 | `地图` | `const id = log.write('地图', 'map', 'map-system', true, { location: 'town' })` |
| src/core/narrative-log.test.ts | 46 | `不存在的` | `it('markConsumed 不存在的 id 不报错', () => {` |
| src/core/narrative-log.test.ts | 46 | `不报错` | `it('markConsumed 不存在的 id 不报错', () => {` |
| src/core/narrative-log.test.ts | 50 | `清空` | `it('clear 清空', () => {` |
| src/core/narrative-log.test.ts | 57 | `正确存储` | `it('interactive + payload 正确存储', () => {` |
| src/core/narrative-log.test.ts | 58 | `选择` | `log.write('选择', 'choice', 'dialogue-system', true, {` |
| src/core/narrative-log.test.ts | 59 | `选项A` | `choices: [{ text: '选项A', next: 'a' }, { text: '选项B', next: 'b' }],` |
| src/core/narrative-log.test.ts | 59 | `选项B` | `choices: [{ text: '选项A', next: 'a' }, { text: '选项B', next: 'b' }],` |
| src/core/plugin-manager.ts | 232 | `指令` | ``Plugin '${def.meta.id}': 指令 '${cmd.id}' 是 handler 类（JS 脚本），Phase 6-7 暂不支持（需沙箱 Phase 11）`,` |
| src/core/plugin-manager.ts | 249 | `注册指令` | ``Plugin '${def.meta.id}': 注册指令 '${cmd.id}' 失败: ${(e as Error).message}`,` |
| src/core/save-system.test.ts | 23 | `玩家` | `characters: [{ id: 'player', name: '玩家', base: { hp: 100 } }],` |
| src/core/save-system.test.ts | 30 | `玩家` | `expect(player?.name).toBe('玩家')` |
| src/core/save-system.ts | 66 | `当前模式不可存档` | `throw new Error('当前模式不可存档')` |
| src/core/save-system.ts | 130 | `自动存档` | `await saveGame('autosave', uiState, label ?? '自动存档')` |
| src/core/settle-fidelity.test.ts | 44 | `结算保真补全（tenths_add` | `describe('结算保真补全（tenths_add / 连续减值 / 无意识门控）', () => {` |
| src/core/settle-fidelity.test.ts | 44 | `连续减值` | `describe('结算保真补全（tenths_add / 连续减值 / 无意识门控）', () => {` |
| src/core/settle-fidelity.test.ts | 44 | `无意识门控）` | `describe('结算保真补全（tenths_add / 连续减值 / 无意识门控）', () => {` |
| src/core/settle-fidelity.test.ts | 69 | `测试NPC` | `id: 'npc_1', name: '测试NPC',` |
| src/core/settle-fidelity.test.ts | 73 | `测试NPC2` | `id: 'npc_2', name: '测试NPC2',` |
| src/core/settle-fidelity.test.ts | 90 | `纯函数（erArk` | `describe('getContinuousAdjust 纯函数（erArk common_default.py:210-231）', () => {` |
| src/core/settle-fidelity.test.ts | 91 | `空/单条/连续2次` | `it('空/单条/连续2次 → 1.0（不衰减）', () => {` |
| src/core/settle-fidelity.test.ts | 91 | `0（不衰减）` | `it('空/单条/连续2次 → 1.0（不衰减）', () => {` |
| src/core/settle-fidelity.test.ts | 99 | `第` | `it('第 3 次 0.70 → 第 5 次触底 0.40', () => {` |
| src/core/settle-fidelity.test.ts | 99 | `次` | `it('第 3 次 0.70 → 第 5 次触底 0.40', () => {` |
| src/core/settle-fidelity.test.ts | 99 | `次触底` | `it('第 3 次 0.70 → 第 5 次触底 0.40', () => {` |
| src/core/settle-fidelity.test.ts | 108 | `中间插入其他指令` | `it('中间插入其他指令 → 计数断开', () => {` |
| src/core/settle-fidelity.test.ts | 108 | `计数断开` | `it('中间插入其他指令 → 计数断开', () => {` |
| src/core/settle-fidelity.test.ts | 115 | `一切指令都参与衰减（erArk` | `it('一切指令都参与衰减（erArk [0,1,2] 跳过是死代码——behavior_id 为字符串恒不匹配）', () => {` |
| src/core/settle-fidelity.test.ts | 115 | `跳过是死代码——behavior_id` | `it('一切指令都参与衰减（erArk [0,1,2] 跳过是死代码——behavior_id 为字符串恒不匹配）', () => {` |
| src/core/settle-fidelity.test.ts | 115 | `为字符串恒不匹配）` | `it('一切指令都参与衰减（erArk [0,1,2] 跳过是死代码——behavior_id 为字符串恒不匹配）', () => {` |
| src/core/settle-fidelity.test.ts | 125 | `集成` | `describe('settle_state 集成', () => {` |
| src/core/settle-fidelity.test.ts | 132 | `tenths_add：当前值` | `it('tenths_add：当前值 1000 → 追加 min(3×35, 100) = +135（common_default.py:233-240）', async () => {` |
| src/core/settle-fidelity.test.ts | 132 | `追加` | `it('tenths_add：当前值 1000 → 追加 min(3×35, 100) = +135（common_default.py:233-240）', async () => {` |
| src/core/settle-fidelity.test.ts | 139 | `tenths_add：当前值` | `it('tenths_add：当前值 0 → 无追加', async () => {` |
| src/core/settle-fidelity.test.ts | 139 | `无追加` | `it('tenths_add：当前值 0 → 无追加', async () => {` |
| src/core/settle-fidelity.test.ts | 144 | `连续重复减值：连续` | `it('连续重复减值：连续 3 次 chat → 系数 0.7（floor(35×0.7)=24）', async () => {` |
| src/core/settle-fidelity.test.ts | 144 | `次` | `it('连续重复减值：连续 3 次 chat → 系数 0.7（floor(35×0.7)=24）', async () => {` |
| src/core/settle-fidelity.test.ts | 144 | `系数` | `it('连续重复减值：连续 3 次 chat → 系数 0.7（floor(35×0.7)=24）', async () => {` |
| src/core/settle-fidelity.test.ts | 150 | `负面状态不衰减（恐怖` | `it('负面状态不衰减（恐怖 → 35 不减）', async () => {` |
| src/core/settle-fidelity.test.ts | 150 | `不减）` | `it('负面状态不衰减（恐怖 → 35 不减）', async () => {` |
| src/core/settle-fidelity.test.ts | 156 | `对自己结算不衰减（target` | `it('对自己结算不衰减（target=self 连续 3 次 → 35）', async () => {` |
| src/core/settle-fidelity.test.ts | 156 | `连续` | `it('对自己结算不衰减（target=self 连续 3 次 → 35）', async () => {` |
| src/core/settle-fidelity.test.ts | 156 | `次` | `it('对自己结算不衰减（target=self 连续 3 次 → 35）', async () => {` |
| src/core/settle-fidelity.test.ts | 164 | `无意识门控：时停（unconscious_h` | `it('无意识门控：时停（unconscious_h=3）→ 心智状态不结算，身体快感照常', async () => {` |
| src/core/settle-fidelity.test.ts | 164 | `心智状态不结算，身体快感照常` | `it('无意识门控：时停（unconscious_h=3）→ 心智状态不结算，身体快感照常', async () => {` |
| src/core/settle-fidelity.test.ts | 175 | `门控` | `it('门控 per-id：多目标时各查各的（一个时停一个正常 → 只停时停者）', async () => {` |
| src/core/settle-fidelity.test.ts | 175 | `per-id：多目标时各查各的（一个时停一个正常` | `it('门控 per-id：多目标时各查各的（一个时停一个正常 → 只停时停者）', async () => {` |
| src/core/settle-fidelity.test.ts | 175 | `只停时停者）` | `it('门控 per-id：多目标时各查各的（一个时停一个正常 → 只停时停者）', async () => {` |
| src/core/settle-fidelity.test.ts | 188 | `集成` | `describe('settle_favorability 集成', () => {` |
| src/core/settle-fidelity.test.ts | 189 | `连续` | `it('连续 3 次 → 好感 floor(5×0.7)=3（仅正收益，common_default.py:616-618）', async () => {` |
| src/core/settle-fidelity.test.ts | 189 | `次` | `it('连续 3 次 → 好感 floor(5×0.7)=3（仅正收益，common_default.py:616-618）', async () => {` |
| src/core/settle-fidelity.test.ts | 189 | `好感` | `it('连续 3 次 → 好感 floor(5×0.7)=3（仅正收益，common_default.py:616-618）', async () => {` |
| src/core/settle-fidelity.test.ts | 189 | `3（仅正收益，common_default` | `it('连续 3 次 → 好感 floor(5×0.7)=3（仅正收益，common_default.py:616-618）', async () => {` |
| src/core/settle-fidelity.test.ts | 197 | `时停（unconscious_h` | `it('时停（unconscious_h=3）→ 好感不结算（common_default.py:551-557）', async () => {` |
| src/core/settle-fidelity.test.ts | 197 | `好感不结算（common_default` | `it('时停（unconscious_h=3）→ 好感不结算（common_default.py:551-557）', async () => {` |
| src/core/settle-fidelity.test.ts | 206 | `素质修正（数据化` | `describe('素质修正（数据化 state_adjusts，erArk common_default.py:379-422）', () => {` |
| src/core/settle-fidelity.test.ts | 213 | `热情：好意/快乐` | `it('热情：好意/快乐 +0.3 → floor(35×1.3)=45', async () => {` |
| src/core/settle-fidelity.test.ts | 219 | `孤僻：好意/快乐` | `it('孤僻：好意/快乐 -0.3 → floor(35×0.7)=24', async () => {` |
| src/core/settle-fidelity.test.ts | 225 | `施虐狂：仅先导` | `it('施虐狂：仅先导 +0.4；对好意无影响', async () => {` |
| src/core/settle-fidelity.test.ts | 225 | `4；对好意无影响` | `it('施虐狂：仅先导 +0.4；对好意无影响', async () => {` |
| src/core/settle-fidelity.test.ts | 233 | `感情缺乏：全部状态` | `it('感情缺乏：全部状态 -0.4 → floor(35×0.6)=21（含负面状态）', async () => {` |
| src/core/settle-fidelity.test.ts | 233 | `21（含负面状态）` | `it('感情缺乏：全部状态 -0.4 → floor(35×0.6)=21（含负面状态）', async () => {` |
| src/core/settle-fidelity.test.ts | 242 | `催眠敏感（hypnosis` | `describe('催眠敏感（hypnosis.increase_body_sensitivity）', () => {` |
| src/core/settle-fidelity.test.ts | 243 | `settle_state：欲情/快感` | `it('settle_state：欲情/快感 +2 系数（base 分支 :441 / feel 分支 :304-305）', async () => {` |
| src/core/settle-fidelity.test.ts | 243 | `系数（base` | `it('settle_state：欲情/快感 +2 系数（base 分支 :441 / feel 分支 :304-305）', async () => {` |
| src/core/settle-fidelity.test.ts | 243 | `分支` | `it('settle_state：欲情/快感 +2 系数（base 分支 :441 / feel 分支 :304-305）', async () => {` |
| src/core/settle-fidelity.test.ts | 255 | `tech_adjust：快感` | `it('tech_adjust：快感 floor(55×(sqrt(1.4×1.25)+2))=182；欲情 floor(55×(1.25+2))=178', async () => {` |
| src/core/settle-fidelity.test.ts | 255 | `182；欲情` | `it('tech_adjust：快感 floor(55×(sqrt(1.4×1.25)+2))=182；欲情 floor(55×(1.25+2))=178', async () => {` |
| src/core/settle-fidelity.test.ts | 269 | `好感素质修正（数据化` | `describe('好感素质修正（数据化 favorability_adjusts，erArk :717-748）', () => {` |
| src/core/settle-fidelity.test.ts | 277 | `思慕：+0` | `it('思慕：+0.25 → floor(5×1.25)=6', async () => {` |
| src/core/settle-fidelity.test.ts | 282 | `爱情隶属系同组取最大：恋慕+驯服` | `it('爱情隶属系同组取最大：恋慕+驯服(同组 love2) → +0.5；爱侣+奴隶 → +1.0；累计 → floor(5×2.5)=12', async () => {` |
| src/core/settle-fidelity.test.ts | 282 | `同组` | `it('爱情隶属系同组取最大：恋慕+驯服(同组 love2) → +0.5；爱侣+奴隶 → +1.0；累计 → floor(5×2.5)=12', async () => {` |
| src/core/settle-fidelity.test.ts | 282 | `5；爱侣+奴隶` | `it('爱情隶属系同组取最大：恋慕+驯服(同组 love2) → +0.5；爱侣+奴隶 → +1.0；累计 → floor(5×2.5)=12', async () => {` |
| src/core/settle-fidelity.test.ts | 282 | `0；累计` | `it('爱情隶属系同组取最大：恋慕+驯服(同组 love2) → +0.5；爱侣+奴隶 → +1.0；累计 → floor(5×2.5)=12', async () => {` |
| src/core/settle-fidelity.test.ts | 287 | `受精（preg` | `it('受精（preg 组 0.5）→ floor(5×1.5)=7；感情缺乏+讨厌男性 → floor(5×0.6)=3', async () => {` |
| src/core/settle-fidelity.test.ts | 287 | `组` | `it('受精（preg 组 0.5）→ floor(5×1.5)=7；感情缺乏+讨厌男性 → floor(5×0.6)=3', async () => {` |
| src/core/settle-fidelity.test.ts | 287 | `7；感情缺乏+讨厌男性` | `it('受精（preg 组 0.5）→ floor(5×1.5)=7；感情缺乏+讨厌男性 → floor(5×0.6)=3', async () => {` |
| src/core/settle-fidelity.test.ts | 296 | `门控（连续减值/时停）` | `describe('settle_trust 门控（连续减值/时停）', () => {` |
| src/core/settle-fidelity.test.ts | 303 | `分钟` | `it('60 分钟 → 信赖 1.0；连续 3 次 → ×0.7 = 0.7', async () => {` |
| src/core/settle-fidelity.test.ts | 303 | `信赖` | `it('60 分钟 → 信赖 1.0；连续 3 次 → ×0.7 = 0.7', async () => {` |
| src/core/settle-fidelity.test.ts | 303 | `0；连续` | `it('60 分钟 → 信赖 1.0；连续 3 次 → ×0.7 = 0.7', async () => {` |
| src/core/settle-fidelity.test.ts | 303 | `次` | `it('60 分钟 → 信赖 1.0；连续 3 次 → ×0.7 = 0.7', async () => {` |
| src/core/settle-fidelity.test.ts | 312 | `时停` | `it('时停 → 信赖不结算；封顶 300', async () => {` |
| src/core/settle-fidelity.test.ts | 312 | `信赖不结算；封顶` | `it('时停 → 信赖不结算；封顶 300', async () => {` |
| src/core/settle-fidelity.test.ts | 319 | `快感附加修正（眼罩/无觉刻印/怀孕灌肠，chara_feel_state_adjust:300-347）` | `describe('快感附加修正（眼罩/无觉刻印/怀孕灌肠，chara_feel_state_adjust:300-347）', () => {` |
| src/core/settle-fidelity.test.ts | 326 | `眼罩（body_item` | `it('眼罩（body_item slot 6）：快感 +0.2 → floor(35×1.2)=42', async () => {` |
| src/core/settle-fidelity.test.ts | 326 | `6）：快感` | `it('眼罩（body_item slot 6）：快感 +0.2 → floor(35×1.2)=42', async () => {` |
| src/core/settle-fidelity.test.ts | 327 | `贴片` | `npc().body_items = { '6': { itemId: '贴片', active: true } }` |
| src/core/settle-fidelity.test.ts | 332 | `无意识` | `it('无意识 + 无觉刻印 lv2：+(adj(2)-1)×2=0.5 → floor(35×1.5)=52', async () => {` |
| src/core/settle-fidelity.test.ts | 340 | `怀孕+灌肠（阴道/子宫）：+1+capacity×0` | `it('怀孕+灌肠（阴道/子宫）：+1+capacity×0.2=+3 → 35×4=140', async () => {` |
| src/core/settle-fidelity.test.ts | 350 | `苦痛转化：pain_as_pleasure` | `it('苦痛转化：pain_as_pleasure → 心理 +35×施虐系数，苦痛不变（:242-245）', async () => {` |
| src/core/settle-fidelity.test.ts | 350 | `+35×施虐系数，苦痛不变（:242-245）` | `it('苦痛转化：pain_as_pleasure → 心理 +35×施虐系数，苦痛不变（:242-245）', async () => {` |
| src/core/settle-fidelity.test.ts | 359 | `欲情素质修正` | `describe('tech_adjust 欲情素质修正', () => {` |
| src/core/settle-fidelity.test.ts | 360 | `开放（欲情/羞耻` | `it('开放（欲情/羞耻 -0.3）→ 欲情 floor(55×(1.25-0.3))=52', async () => {` |
| src/core/settle-fidelity.test.ts | 373 | `攻略进度素质` | `describe('攻略进度素质 + extra_feel_settle（:455-477/:484-515）', () => {` |
| src/core/settle-fidelity.test.ts | 380 | `爱侣（fall4）：正面状态` | `it('爱侣（fall4）：正面状态 +0.2 → floor(35×1.2)=42；负面 -0.8 → 6（浮点误差，erArk Python 同值）', async () => {` |
| src/core/settle-fidelity.test.ts | 380 | `42；负面` | `it('爱侣（fall4）：正面状态 +0.2 → floor(35×1.2)=42；负面 -0.8 → 6（浮点误差，erArk Python 同值）', async () => {` |
| src/core/settle-fidelity.test.ts | 380 | `6（浮点误差，erArk` | `it('爱侣（fall4）：正面状态 +0.2 → floor(35×1.2)=42；负面 -0.8 → 6（浮点误差，erArk Python 同值）', async () => {` |
| src/core/settle-fidelity.test.ts | 380 | `同值）` | `it('爱侣（fall4）：正面状态 +0.2 → floor(35×1.2)=42；负面 -0.8 → 6（浮点误差，erArk Python 同值）', async () => {` |
| src/core/settle-fidelity.test.ts | 391 | `屈从（fall1）：正面` | `it('屈从（fall1）：正面 +0.05 → floor(35×1.05)=36', async () => {` |
| src/core/settle-fidelity.test.ts | 397 | `extra_feel_settle：顺从≥5` | `it('extra_feel_settle：顺从≥5 + 恭顺 → 恭顺 35×1.8=63 + 心理 +floor(10×sqrt(1×1.8))=13 + 心理经验(155)', async () => {` |
| src/core/settle-fidelity.test.ts | 397 | `心理经验` | `it('extra_feel_settle：顺从≥5 + 恭顺 → 恭顺 35×1.8=63 + 心理 +floor(10×sqrt(1×1.8))=13 + 心理经验(155)', async () => {` |
| src/core/settle-fidelity.test.ts | 408 | `extra_feel_settle：顺从` | `it('extra_feel_settle：顺从<5 → 无额外快感', async () => {` |
| src/core/settle-fidelity.test.ts | 408 | `无额外快感` | `it('extra_feel_settle：顺从<5 → 无额外快感', async () => {` |
| src/core/settle-fidelity.test.ts | 416 | `快感状态能力修正：皮肤感度` | `it('快感状态能力修正：皮肤感度 lv2 → settle_state(皮肤) 用感度系数 1.25 → floor(35×1.25)=43', async () => {` |
| src/core/settle-fidelity.test.ts | 416 | `用感度系数` | `it('快感状态能力修正：皮肤感度 lv2 → settle_state(皮肤) 用感度系数 1.25 → floor(35×1.25)=43', async () => {` |
| src/core/settle-fidelity.test.ts | 424 | `刻印状态系数表` | `describe('刻印状态系数表 + dead 门控（:374-378/:180-181）', () => {` |
| src/core/settle-fidelity.test.ts | 424 | `门控（:374-378/:180-181）` | `describe('刻印状态系数表 + dead 门控（:374-378/:180-181）', () => {` |
| src/core/settle-fidelity.test.ts | 431 | `mark_debuff：快乐刻印` | `it('mark_debuff：快乐刻印 lv2 → 快乐 35×3=105（非 ability_lv_adjust 表）', async () => {` |
| src/core/settle-fidelity.test.ts | 431 | `105（非` | `it('mark_debuff：快乐刻印 lv2 → 快乐 35×3=105（非 ability_lv_adjust 表）', async () => {` |
| src/core/settle-fidelity.test.ts | 431 | `表）` | `it('mark_debuff：快乐刻印 lv2 → 快乐 35×3=105（非 ability_lv_adjust 表）', async () => {` |
| src/core/settle-fidelity.test.ts | 437 | `mark_debuff：快乐刻印` | `it('mark_debuff：快乐刻印 lv3 → 快乐 35×5=175；lv0 → 35', async () => {` |
| src/core/settle-fidelity.test.ts | 447 | `不影响非刻印状态：亲密` | `it('mark_debuff 不影响非刻印状态：亲密 lv2 + 好意 → 35×1.25=43（ability_lv_adjust 表）', async () => {` |
| src/core/settle-fidelity.test.ts | 447 | `表）` | `it('mark_debuff 不影响非刻印状态：亲密 lv2 + 好意 → 35×1.25=43（ability_lv_adjust 表）', async () => {` |
| src/core/settle-fidelity.test.ts | 453 | `dead：不结算（settle_state` | `it('dead：不结算（settle_state / settle_favorability 均跳过）', async () => {` |
| src/core/settle-fidelity.test.ts | 453 | `均跳过）` | `it('dead：不结算（settle_state / settle_favorability 均跳过）', async () => {` |
| src/core/settle-fidelity.test.ts | 465 | `集成` | `describe('settle_hp_mp 集成', () => {` |
| src/core/settle-fidelity.test.ts | 466 | `时停（unconscious_h` | `it('时停（unconscious_h=3）→ 气力不结算（common_default.py:51-53）', async () => {` |
| src/core/settle-fidelity.test.ts | 466 | `气力不结算（common_default` | `it('时停（unconscious_h=3）→ 气力不结算（common_default.py:51-53）', async () => {` |
| src/core/settle-fidelity.test.ts | 475 | `正常状态` | `it('正常状态 → 气力 -5×3 = -15', async () => {` |
| src/core/settle-fidelity.test.ts | 483 | `集成（体技：快感/欲情` | `describe('tech_adjust 集成（体技：快感/欲情 + 三件套）', () => {` |
| src/core/settle-fidelity.test.ts | 483 | `三件套）` | `describe('tech_adjust 集成（体技：快感/欲情 + 三件套）', () => {` |
| src/core/settle-fidelity.test.ts | 490 | `公式：快感` | `it('公式：快感 = 55×sqrt(1.4×1.25)=72；欲情 = 55×1.25=68（非 sqrt！）', async () => {` |
| src/core/settle-fidelity.test.ts | 490 | `72；欲情` | `it('公式：快感 = 55×sqrt(1.4×1.25)=72；欲情 = 55×1.25=68（非 sqrt！）', async () => {` |
| src/core/settle-fidelity.test.ts | 490 | `68（非` | `it('公式：快感 = 55×sqrt(1.4×1.25)=72；欲情 = 55×1.25=68（非 sqrt！）', async () => {` |
| src/core/settle-fidelity.test.ts | 500 | `tenths_add：当前快感` | `it('tenths_add：当前快感 1000 → 追加 min(3×72.76, 100)=100', async () => {` |
| src/core/settle-fidelity.test.ts | 500 | `追加` | `it('tenths_add：当前快感 1000 → 追加 min(3×72.76, 100)=100', async () => {` |
| src/core/settle-fidelity.test.ts | 511 | `连续重复减值：连续` | `it('连续重复减值：连续 3 次 → 快感/欲情 × 0.7', async () => {` |
| src/core/settle-fidelity.test.ts | 511 | `次` | `it('连续重复减值：连续 3 次 → 快感/欲情 × 0.7', async () => {` |
| src/core/settle-fidelity.test.ts | 511 | `快感/欲情` | `it('连续重复减值：连续 3 次 → 快感/欲情 × 0.7', async () => {` |
| src/core/settle-fidelity.test.ts | 522 | `无意识门控：时停` | `it('无意识门控：时停 → 心理快感跳过，身体快感照常', async () => {` |
| src/core/settle-fidelity.test.ts | 522 | `心理快感跳过，身体快感照常` | `it('无意识门控：时停 → 心理快感跳过，身体快感照常', async () => {` |
| src/core/settle-fidelity.test.ts | 534 | `欲情含攻略进度修正（fall×0` | `it('欲情含攻略进度修正（fall×0.05，chara_base_state_adjust:455-458）——快感不受影响', async () => {` |
| src/core/settle-fidelity.test.ts | 534 | `05，chara_base_state_adjust:455-458）——快感不受影响` | `it('欲情含攻略进度修正（fall×0.05，chara_base_state_adjust:455-458）——快感不受影响', async () => {` |
| src/core/settle-fidelity.test.ts | 550 | `体位修正（chara_feel_state_adjust:314-325）` | `describe('体位修正（chara_feel_state_adjust:314-325）', () => {` |
| src/core/settle-fidelity.test.ts | 557 | `无体位（current_sex_position` | `it('无体位（current_sex_position=-1/缺失）→ 无加成：floor(35×1)=35', async () => {` |
| src/core/settle-fidelity.test.ts | 557 | `-1/缺失）→` | `it('无体位（current_sex_position=-1/缺失）→ 无加成：floor(35×1)=35', async () => {` |
| src/core/settle-fidelity.test.ts | 557 | `无加成：floor` | `it('无体位（current_sex_position=-1/缺失）→ 无加成：floor(35×1)=35', async () => {` |
| src/core/settle-fidelity.test.ts | 563 | `对面立位（pos` | `it('对面立位（pos 7，系数 0.3）→ floor(35×1.3)=45', async () => {` |
| src/core/settle-fidelity.test.ts | 563 | `7，系数` | `it('对面立位（pos 7，系数 0.3）→ floor(35×1.3)=45', async () => {` |
| src/core/settle-fidelity.test.ts | 569 | `喜欢体位` | `it('喜欢体位 +0.5（正常位喜好 + pos 1，系数 0.0）→ floor(35×1.5)=52', async () => {` |
| src/core/settle-fidelity.test.ts | 569 | `5（正常位喜好` | `it('喜欢体位 +0.5（正常位喜好 + pos 1，系数 0.0）→ floor(35×1.5)=52', async () => {` |
| src/core/settle-fidelity.test.ts | 569 | `1，系数` | `it('喜欢体位 +0.5（正常位喜好 + pos 1，系数 0.0）→ floor(35×1.5)=52', async () => {` |
| src/core/settle-fidelity.test.ts | 576 | `体位经验` | `it('体位经验 ≥100 推导喜欢体位（experience 141=100 → pos 1）→ 52', async () => {` |
| src/core/settle-fidelity.test.ts | 576 | `推导喜欢体位（experience` | `it('体位经验 ≥100 推导喜欢体位（experience 141=100 → pos 1）→ 52', async () => {` |
| src/core/settle-fidelity.test.ts | 585 | `懒授予：经验` | `it('懒授予：经验 ≥100 且无天赋 → 授予喜好天赋 + 叙事（position.ts）', async () => {` |
| src/core/settle-fidelity.test.ts | 585 | `且无天赋` | `it('懒授予：经验 ≥100 且无天赋 → 授予喜好天赋 + 叙事（position.ts）', async () => {` |
| src/core/settle-fidelity.test.ts | 585 | `授予喜好天赋` | `it('懒授予：经验 ≥100 且无天赋 → 授予喜好天赋 + 叙事（position.ts）', async () => {` |
| src/core/settle-fidelity.test.ts | 585 | `叙事（position` | `it('懒授予：经验 ≥100 且无天赋 → 授予喜好天赋 + 叙事（position.ts）', async () => {` |
| src/core/settle-fidelity.test.ts | 599 | `子宫奸（玩家` | `it('子宫奸（玩家 current_womb_sex_position==2）→ 子宫 +2 → floor(35×3)=105', async () => {` |
| src/core/settle-fidelity.test.ts | 607 | `非` | `it('非 V/A/U/W 状态不受体位影响（皮肤 + pos 7 → 35）', async () => {` |
| src/core/settle-fidelity.test.ts | 607 | `状态不受体位影响（皮肤` | `it('非 V/A/U/W 状态不受体位影响（皮肤 + pos 7 → 35）', async () => {` |
| src/core/settle-fidelity.test.ts | 614 | `系列（default` | `describe('pain 系列（default.py:8255-8680，独立 effect 类型）', () => {` |
| src/core/settle-fidelity.test.ts | 614 | `py:8255-8680，独立` | `describe('pain 系列（default.py:8255-8680，独立 effect 类型）', () => {` |
| src/core/settle-fidelity.test.ts | 614 | `类型）` | `describe('pain 系列（default.py:8255-8680，独立 effect 类型）', () => {` |
| src/core/settle-fidelity.test.ts | 615 | `：润滑0→3` | `it('pain_by_lubrication (121)：润滑0→3.0，苦痛 floor(35×(1+3))=140', async () => {` |
| src/core/settle-fidelity.test.ts | 615 | `0，苦痛` | `it('pain_by_lubrication (121)：润滑0→3.0，苦痛 floor(35×(1+3))=140', async () => {` |
| src/core/settle-fidelity.test.ts | 623 | `：润滑100→2` | `it('pain_by_part V (122)：润滑100→2.5，腰技0→0，扩张0-阴茎1+1=0→3.0 → 35×(1+7.5)=297', async () => {` |
| src/core/settle-fidelity.test.ts | 623 | `5，腰技0→0，扩张0-阴茎1+1` | `it('pain_by_part V (122)：润滑100→2.5，腰技0→0，扩张0-阴茎1+1=0→3.0 → 35×(1+7.5)=297', async () => {` |
| src/core/settle-fidelity.test.ts | 631 | `子宫奸` | `it('pain_by_part W 子宫奸 (125)：润滑0→3.0，扩张0-1-1=-2→10×3=30 → 105×(1+90)=9555', async () => {` |
| src/core/settle-fidelity.test.ts | 631 | `：润滑0→3` | `it('pain_by_part W 子宫奸 (125)：润滑0→3.0，扩张0-1-1=-2→10×3=30 → 105×(1+90)=9555', async () => {` |
| src/core/settle-fidelity.test.ts | 631 | `0，扩张0-1-1` | `it('pain_by_part W 子宫奸 (125)：润滑0→3.0，扩张0-1-1=-2→10×3=30 → 105×(1+90)=9555', async () => {` |
| src/core/settle-fidelity.test.ts | 641 | `：快感` | `it('feel_by_sex V (131)：快感 55×(sqrt(1×1)+1.05)=112；欲情 55×(1+1.05)=112', async () => {` |
| src/core/settle-fidelity.test.ts | 641 | `112；欲情` | `it('feel_by_sex V (131)：快感 55×(sqrt(1×1)+1.05)=112；欲情 55×(1+1.05)=112', async () => {` |
| src/core/settle-fidelity.test.ts | 650 | `：欲情` | `it('feel_by_sex A (132)：欲情 extra 只用 size_adjust（erArk :8552 源码原样）→ 55×(1+0.55)=85', async () => {` |
| src/core/settle-fidelity.test.ts | 650 | `只用` | `it('feel_by_sex A (132)：欲情 extra 只用 size_adjust（erArk :8552 源码原样）→ 55×(1+0.55)=85', async () => {` |
| src/core/settle-fidelity.test.ts | 650 | `源码原样）→` | `it('feel_by_sex A (132)：欲情 extra 只用 size_adjust（erArk :8552 源码原样）→ 55×(1+0.55)=85', async () => {` |
| src/core/settle-fidelity.test.ts | 658 | `：心理` | `it('pain_to_h (135)：心理 55×(1+1)=110；欲情 55×(1+2)=165；苦痛 55×(1+2)=165', async () => {` |
| src/core/settle-fidelity.test.ts | 658 | `110；欲情` | `it('pain_to_h (135)：心理 55×(1+1)=110；欲情 55×(1+2)=165；苦痛 55×(1+2)=165', async () => {` |
| src/core/settle-fidelity.test.ts | 658 | `165；苦痛` | `it('pain_to_h (135)：心理 55×(1+1)=110；欲情 55×(1+2)=165；苦痛 55×(1+2)=165', async () => {` |
| src/core/settle-fidelity.test.ts | 667 | `未知部位` | `it('未知部位 → warning 不崩溃', async () => {` |
| src/core/settle-fidelity.test.ts | 667 | `不崩溃` | `it('未知部位 → warning 不崩溃', async () => {` |
| src/core/settle-fidelity.test.ts | 669 | `脚` | `{ type: 'pain_by_part', params: { part: '脚' }, target: 'selected' },` |
| src/core/settle-fidelity.test.ts | 671 | `未知部位` | `expect(errorReporter.getErrors().some(e => e.severity === 'warning' && e.message.includes('未知部位'))).toBe(true)` |
| src/core/settle-fidelity.test.ts | 675 | `系列（发起者自己射精欲，default` | `describe('PL_P 系列（发起者自己射精欲，default.py:8239-8252/8683-8725）', () => {` |
| src/core/settle-fidelity.test.ts | 683 | `纯技巧：adjust` | `it('120 纯技巧：adjust=1.0 → eja += floor(55×1.0+0)=55', async () => {` |
| src/core/settle-fidelity.test.ts | 691 | `技巧/2+指技：1` | `it('141 技巧/2+指技：1.0/2+1.0=1.5 → eja += 82', async () => {` |
| src/core/settle-fidelity.test.ts | 699 | `自己当前P快/8：P快` | `it('自己当前P快/8：P快 240 → 55+30=85', async () => {` |
| src/core/settle-fidelity.test.ts | 709 | `射精欲积累（二段结算` | `describe('射精欲积累（二段结算 ADD_SMALL_P_FEEL，Second_effect.py:657-679）', () => {` |
| src/core/settle-fidelity.test.ts | 710 | `P快感产生（pending[3]` | `it('P快感产生（pending[3]>0）→ eja += floor(100 + eja×0.4)', async () => {` |
| src/core/settle-fidelity.test.ts | 728 | `：自己` | `it('eja_add (70)：自己 eja += floor(tc + 10 + eja×0.4)', async () => {` |
| src/core/settle-fidelity.test.ts | 737 | `：目标` | `it('eja_add_target (44)：目标 eja += floor((tc+30)×adj(目标.阴茎感度))', async () => {` |
| src/core/settle-fidelity.test.ts | 737 | `目标` | `it('eja_add_target (44)：目标 eja += floor((tc+30)×adj(目标.阴茎感度))', async () => {` |
| src/core/settle-fidelity.test.ts | 747 | `尿道绝顶（ORGASM_PART_ATTR` | `describe('尿道绝顶（ORGASM_PART_ATTR partId 6，方案A 引擎支持）', () => {` |
| src/core/settle-fidelity.test.ts | 747 | `6，方案A` | `describe('尿道绝顶（ORGASM_PART_ATTR partId 6，方案A 引擎支持）', () => {` |
| src/core/settle-fidelity.test.ts | 747 | `引擎支持）` | `describe('尿道绝顶（ORGASM_PART_ATTR partId 6，方案A 引擎支持）', () => {` |
| src/core/settle-fidelity.test.ts | 748 | `尿道快感等级变化` | `it('尿道快感等级变化 → 触发尿道绝顶（orgasm_count[6] + 绝顶经验 16）', async () => {` |
| src/core/settle-fidelity.test.ts | 748 | `触发尿道绝顶（orgasm_count[6]` | `it('尿道快感等级变化 → 触发尿道绝顶（orgasm_count[6] + 绝顶经验 16）', async () => {` |
| src/core/settle-fidelity.test.ts | 748 | `绝顶经验` | `it('尿道快感等级变化 → 触发尿道绝顶（orgasm_count[6] + 绝顶经验 16）', async () => {` |
| src/core/settle-fidelity.test.ts | 767 | `兽部全砍（warning` | `describe('兽部全砍（warning + 跳过，防静默写死属性）', () => {` |
| src/core/settle-fidelity.test.ts | 767 | `跳过，防静默写死属性）` | `describe('兽部全砍（warning + 跳过，防静默写死属性）', () => {` |
| src/core/settle-fidelity.test.ts | 785 | `整批执行后无` | `it('整批执行后无 error 级错误', () => {` |
| src/core/settle-fidelity.test.ts | 785 | `级错误` | `it('整批执行后无 error 级错误', () => {` |
| src/core/template.test.ts | 109 | `循环继承` | `expect(() => resolveTemplate('a', templates)).toThrow('循环继承')` |
| src/core/template.test.ts | 118 | `循环继承` | `expect(() => resolveTemplate('a', templates)).toThrow('循环继承')` |
| src/core/template.test.ts | 125 | `父模板` | `expect(() => resolveTemplate('hero', templates)).toThrow('父模板')` |
| src/core/template.ts | 55 | `不存在` | ``父模板 '${extendsId}' 不存在 (模板 '${templateId}' 的 extends 指向了不存在的模板)`,` |
| src/core/template.ts | 55 | `模板` | ``父模板 '${extendsId}' 不存在 (模板 '${templateId}' 的 extends 指向了不存在的模板)`,` |
| src/main.ts | 37 | `检查配置文件格式` | `suggestion: '检查配置文件格式',` |
| src/main.ts | 59 | `模组加载失败` | `if (!mod) throw new Error('模组加载失败')` |
| src/main.ts | 137 | `引擎启动失败：` | `console.error('引擎启动失败：', err)` |
| src/plugins/boot-smoke.test.ts | 19 | `引擎` | `describe('引擎 boot 冒烟测试（全插件加载）', () => {` |
| src/plugins/boot-smoke.test.ts | 19 | `冒烟测试（全插件加载）` | `describe('引擎 boot 冒烟测试（全插件加载）', () => {` |
| src/plugins/boot-smoke.test.ts | 30 | `模组加载失败` | `if (!mod) throw new Error('模组加载失败')` |
| src/plugins/boot-smoke.test.ts | 57 | `无插件被禁用（onLoad/onEnable` | `it('无插件被禁用（onLoad/onEnable 无抛错）', () => {` |
| src/plugins/boot-smoke.test.ts | 57 | `无抛错）` | `it('无插件被禁用（onLoad/onEnable 无抛错）', () => {` |
| src/plugins/boot-smoke.test.ts | 61 | `依赖插件的指令全部注册（插件` | `it('依赖插件的指令全部注册（插件 onEnable 实际执行成功）', () => {` |
| src/plugins/boot-smoke.test.ts | 61 | `实际执行成功）` | `it('依赖插件的指令全部注册（插件 onEnable 实际执行成功）', () => {` |
| src/plugins/boot-smoke.test.ts | 70 | `指令加载器注册` | `it('指令加载器注册 test-mod 指令（rest/wait/test_judge_cmd）', () => {` |
| src/plugins/boot-smoke.test.ts | 70 | `指令（rest/wait/test_judge_cmd）` | `it('指令加载器注册 test-mod 指令（rest/wait/test_judge_cmd）', () => {` |
| src/plugins/boot-smoke.test.ts | 78 | `原生指令注册（do_h/end_h）` | `it('h-core 原生指令注册（do_h/end_h）', () => {` |
| src/plugins/boot-smoke.test.ts | 83 | `触发）无误报` | `it('validateInstructionData（game:plugins_loaded 触发）无误报', () => {` |
| src/plugins/boot-smoke.test.ts | 87 | `未注册字段` | `const instructionErrors = errors.filter(e => e.message.includes('未注册字段') || e.message.includes('未注册前提'))` |
| src/plugins/boot-smoke.test.ts | 87 | `未注册前提` | `const instructionErrors = errors.filter(e => e.message.includes('未注册字段') || e.message.includes('未注册前提'))` |
| src/plugins/boot-smoke.test.ts | 91 | `修正条件通过校验` | `it('h-config [judge.adjustments] 修正条件通过校验', () => {` |
| src/plugins/boot-smoke.test.ts | 93 | `修正条件引用了未注册字段` | `expect(errors.some(e => e.message.includes('修正条件引用了未注册字段'))).toBe(false)` |
| src/plugins/boot-smoke.test.ts | 96 | `条件引擎在` | `it('条件引擎在 boot 状态可求值（selected/别名/根路径）', () => {` |
| src/plugins/boot-smoke.test.ts | 96 | `状态可求值（selected/别名/根路径）` | `it('条件引擎在 boot 状态可求值（selected/别名/根路径）', () => {` |
| src/plugins/chain-flow.test.ts | 32 | `指令执行链路冒烟` | `describe('指令执行链路冒烟', () => {` |
| src/plugins/chain-flow.test.ts | 60 | `测试NPC` | `id: 'npc_1', name: '测试NPC',` |
| src/plugins/chain-flow.test.ts | 66 | `链路：时间推进` | `it('rest 链路：时间推进 +60 分钟 + 恢复效果 + 场景口上输出', async () => {` |
| src/plugins/chain-flow.test.ts | 66 | `分钟` | `it('rest 链路：时间推进 +60 分钟 + 恢复效果 + 场景口上输出', async () => {` |
| src/plugins/chain-flow.test.ts | 66 | `恢复效果` | `it('rest 链路：时间推进 +60 分钟 + 恢复效果 + 场景口上输出', async () => {` |
| src/plugins/chain-flow.test.ts | 66 | `场景口上输出` | `it('rest 链路：时间推进 +60 分钟 + 恢复效果 + 场景口上输出', async () => {` |
| src/plugins/chain-flow.test.ts | 79 | `调息` | `expect(narrativeLog.getEntries().some((e: any) => String(e.text).includes('调息'))).toBe(true)` |
| src/plugins/chain-flow.test.ts | 82 | `开始` | `it('do_h → H 开始 → end_h 结束链路', async () => {` |
| src/plugins/chain-flow.test.ts | 82 | `结束链路` | `it('do_h → H 开始 → end_h 结束链路', async () => {` |
| src/plugins/chain-flow.test.ts | 94 | `中执行指令` | `it('H 中执行指令 → execution_end 二段结算监听器运行（body_item_tick + orgasmJudge 不崩）', async () => {` |
| src/plugins/chain-flow.test.ts | 94 | `二段结算监听器运行（body_item_tick` | `it('H 中执行指令 → execution_end 二段结算监听器运行（body_item_tick + orgasmJudge 不崩）', async () => {` |
| src/plugins/chain-flow.test.ts | 94 | `不崩）` | `it('H 中执行指令 → execution_end 二段结算监听器运行（body_item_tick + orgasmJudge 不崩）', async () => {` |
| src/plugins/chain-flow.test.ts | 110 | `链路：选中角色` | `it('talk 链路：选中角色 → 无对话时输出占位（不崩）', async () => {` |
| src/plugins/chain-flow.test.ts | 110 | `无对话时输出占位（不崩）` | `it('talk 链路：选中角色 → 无对话时输出占位（不崩）', async () => {` |
| src/plugins/chain-flow.test.ts | 112 | `无话可说` | `expect(narrativeLog.getEntries().some((e: any) => String(e.text).includes('无话可说'))).toBe(true)` |
| src/plugins/chain-flow.test.ts | 115 | `你是何人` | `it('角色口上分支：{id} 占位替换后条件生效（好感度 50 → 不走"你是何人"）', async () => {` |
| src/plugins/chain-flow.test.ts | 125 | `哦，是你啊` | `expect(texts.some(t => t.includes('哦，是你啊'))).toBe(true)` |
| src/plugins/chain-flow.test.ts | 126 | `你是何人` | `expect(texts.some(t => t.includes('你是何人'))).toBe(false)` |
| src/plugins/chain-flow.test.ts | 132 | `你是何人` | `expect(texts2.some(t => t.includes('你是何人'))).toBe(true)` |
| src/plugins/chain-flow.test.ts | 135 | `整批执行后` | `it('整批执行后 errorReporter 无 error 级错误', () => {` |
| src/plugins/chain-flow.test.ts | 135 | `级错误` | `it('整批执行后 errorReporter 无 error 级错误', () => {` |
| src/plugins/combat-base/index.ts | 93 | `攻击` | `label: '攻击',` |
| src/plugins/combat-base/index.ts | 115 | `逃跑` | `label: '逃跑',` |
| src/plugins/combat-base/index.ts | 158 | `战斗开始！` | `narrativeLog.write('战斗开始！', 'combat', 'combat-base')` |
| src/plugins/dialogue-system/index.ts | 84 | `交谈` | `label: '交谈',` |
| src/plugins/dialogue-system/index.ts | 101 | `（无话可说）` | `narrativeLog.write('（无话可说）', 'system', 'dialogue-system')` |
| src/plugins/dialogue-system/index.ts | 340 | `（对话不存在）` | `narrativeLog.write('（对话不存在）', 'system', 'dialogue-system')` |
| src/plugins/dialogue-system/index.ts | 401 | `选择` | `narrativeLog.write('选择', 'dialogue_choice', 'dialogue-system', true, {` |
| src/plugins/dialogue-weight.test.ts | 25 | `口上权重系统` | `describe('T1 口上权重系统', () => {` |
| src/plugins/dialogue-weight.test.ts | 36 | `测试NPC` | `entitySystem.register('character', 'npc_1', { id: 'npc_1', name: '测试NPC', base: { 体力: 80, 疲劳度: 0 }, current_lo` |
| src/plugins/dialogue-weight.test.ts | 54 | `语义）` | `describe('premiseRegistry.getWeight（erArk weight_all_to_1 语义）', () => {` |
| src/plugins/dialogue-weight.test.ts | 57 | `权重` | `it('high_N → 权重 N', () => {` |
| src/plugins/dialogue-weight.test.ts | 63 | `满足前提` | `it('high_N + 满足前提 → N + 前提数（weight_all_to_1：非 high 前提只加 1）', () => {` |
| src/plugins/dialogue-weight.test.ts | 63 | `前提数（weight_all_to_1：非` | `it('high_N + 满足前提 → N + 前提数（weight_all_to_1：非 high 前提只加 1）', () => {` |
| src/plugins/dialogue-weight.test.ts | 63 | `前提只加` | `it('high_N + 满足前提 → N + 前提数（weight_all_to_1：非 high 前提只加 1）', () => {` |
| src/plugins/dialogue-weight.test.ts | 68 | `任一前提不满足` | `it('任一前提不满足 → 0（整句淘汰）', () => {` |
| src/plugins/dialogue-weight.test.ts | 68 | `0（整句淘汰）` | `it('任一前提不满足 → 0（整句淘汰）', () => {` |
| src/plugins/dialogue-weight.test.ts | 73 | `空前提集` | `it('空前提集 → 1（无条件口上默认权重）', () => {` |
| src/plugins/dialogue-weight.test.ts | 73 | `1（无条件口上默认权重）` | `it('空前提集 → 1（无条件口上默认权重）', () => {` |
| src/plugins/dialogue-weight.test.ts | 78 | `口上同池权重竞争（pickWeightedLine）` | `describe('口上同池权重竞争（pickWeightedLine）', () => {` |
| src/plugins/dialogue-weight.test.ts | 97 | `静态` | `it('静态 weight：1:3 → 边界处切换（total=4，random<0.25 选 A）', async () => {` |
| src/plugins/dialogue-weight.test.ts | 97 | `边界处切换（total` | `it('静态 weight：1:3 → 边界处切换（total=4，random<0.25 选 A）', async () => {` |
| src/plugins/dialogue-weight.test.ts | 97 | `选` | `it('静态 weight：1:3 → 边界处切换（total=4，random<0.25 选 A）', async () => {` |
| src/plugins/dialogue-weight.test.ts | 99 | `权重A` | `{ text: '权重A', weight: 1 },` |
| src/plugins/dialogue-weight.test.ts | 100 | `权重B` | `{ text: '权重B', weight: 3 },` |
| src/plugins/dialogue-weight.test.ts | 105 | `权重A` | `expect(lastTextContaining('权重A')).toContain('权重A')` |
| src/plugins/dialogue-weight.test.ts | 108 | `权重B` | `expect(lastTextContaining('权重B')).toContain('权重B')` |
| src/plugins/dialogue-weight.test.ts | 111 | `前提权重：high_1` | `it('前提权重：high_1 vs high_5 → total=6，random<1/6 选 A', async () => {` |
| src/plugins/dialogue-weight.test.ts | 111 | `选` | `it('前提权重：high_1 vs high_5 → total=6，random<1/6 选 A', async () => {` |
| src/plugins/dialogue-weight.test.ts | 113 | `前提A` | `{ text: '前提A', condition: 'premises:high_1' },` |
| src/plugins/dialogue-weight.test.ts | 114 | `前提B` | `{ text: '前提B', condition: 'premises:high_5' },` |
| src/plugins/dialogue-weight.test.ts | 119 | `前提A` | `expect(lastTextContaining('前提A')).toContain('前提A')` |
| src/plugins/dialogue-weight.test.ts | 122 | `前提B` | `expect(lastTextContaining('前提B')).toContain('前提B')` |
| src/plugins/dialogue-weight.test.ts | 125 | `同池竞争：场景通用` | `it('同池竞争：场景通用(1) vs 角色专属(×10) → total=11，random<1/11 选通用', async () => {` |
| src/plugins/dialogue-weight.test.ts | 125 | `角色专属` | `it('同池竞争：场景通用(1) vs 角色专属(×10) → total=11，random<1/11 选通用', async () => {` |
| src/plugins/dialogue-weight.test.ts | 125 | `选通用` | `it('同池竞争：场景通用(1) vs 角色专属(×10) → total=11，random<1/11 选通用', async () => {` |
| src/plugins/dialogue-weight.test.ts | 127 | `通用行` | `mod.sceneDialogue.push({ scene: 'w_comp', text: '通用行' })` |
| src/plugins/dialogue-weight.test.ts | 128 | `专属行` | `mod.characterSpecificDialogue.set('npc_1', [{ scene: 'w_comp', text: '专属行' }])` |
| src/plugins/dialogue-weight.test.ts | 132 | `通用行` | `expect(lastTextContaining('通用行')).toContain('通用行')` |
| src/plugins/dialogue-weight.test.ts | 135 | `专属行` | `expect(lastTextContaining('专属行')).toContain('专属行')` |
| src/plugins/dialogue-weight.test.ts | 138 | `无条件口上权重默认` | `it('无条件口上权重默认 1（erArk 空前提集语义的等价）', async () => {` |
| src/plugins/dialogue-weight.test.ts | 138 | `空前提集语义的等价）` | `it('无条件口上权重默认 1（erArk 空前提集语义的等价）', async () => {` |
| src/plugins/dialogue-weight.test.ts | 140 | `无条A` | `{ text: '无条A' },` |
| src/plugins/dialogue-weight.test.ts | 141 | `无条B` | `{ text: '无条B' },` |
| src/plugins/dialogue-weight.test.ts | 146 | `无条A` | `expect(lastTextContaining('无条A')).toContain('无条A')` |
| src/plugins/dialogue-weight.test.ts | 149 | `无条B` | `expect(lastTextContaining('无条B')).toContain('无条B')` |
| src/plugins/dialogue-weight.test.ts | 153 | `版本化` | `describe('T4 版本化 + T5 无意识屏蔽', () => {` |
| src/plugins/dialogue-weight.test.ts | 153 | `无意识屏蔽` | `describe('T4 版本化 + T5 无意识屏蔽', () => {` |
| src/plugins/dialogue-weight.test.ts | 167 | `版本过滤：character_text_version` | `it('版本过滤：character_text_version 选对应版本的角色口上；=0 不显示角色口上', async () => {` |
| src/plugins/dialogue-weight.test.ts | 167 | `选对应版本的角色口上；` | `it('版本过滤：character_text_version 选对应版本的角色口上；=0 不显示角色口上', async () => {` |
| src/plugins/dialogue-weight.test.ts | 167 | `不显示角色口上` | `it('版本过滤：character_text_version 选对应版本的角色口上；=0 不显示角色口上', async () => {` |
| src/plugins/dialogue-weight.test.ts | 171 | `版本1台词` | `{ scene: 'v_test', text: '版本1台词', version: 1 },` |
| src/plugins/dialogue-weight.test.ts | 172 | `版本2台词` | `{ scene: 'v_test', text: '版本2台词', version: 2 },` |
| src/plugins/dialogue-weight.test.ts | 177 | `版本1台词` | `expect(lastTextContaining('版本1台词')).toContain('版本1台词')` |
| src/plugins/dialogue-weight.test.ts | 181 | `版本2台词` | `expect(lastTextContaining('版本2台词')).toContain('版本2台词')` |
| src/plugins/dialogue-weight.test.ts | 185 | `版本1台词` | `expect(lastTextContaining('版本1台词')).toBe('')` |
| src/plugins/dialogue-weight.test.ts | 186 | `版本2台词` | `expect(lastTextContaining('版本2台词')).toBe('')` |
| src/plugins/dialogue-weight.test.ts | 190 | `无意识屏蔽：时停目标只出带` | `it('无意识屏蔽：时停目标只出带 unconscious 前提的口上（场景通用无条件也淘汰）', async () => {` |
| src/plugins/dialogue-weight.test.ts | 190 | `前提的口上（场景通用无条件也淘汰）` | `it('无意识屏蔽：时停目标只出带 unconscious 前提的口上（场景通用无条件也淘汰）', async () => {` |
| src/plugins/dialogue-weight.test.ts | 193 | `通用台词` | `mod.sceneDialogue.push({ scene: 'u_test', text: '通用台词' })` |
| src/plugins/dialogue-weight.test.ts | 195 | `普通台词` | `{ scene: 'u_test', text: '普通台词' },` |
| src/plugins/dialogue-weight.test.ts | 196 | `无意识台词` | `{ scene: 'u_test', text: '无意识台词', condition: 'premises:t_unconscious_flag_3' },` |
| src/plugins/dialogue-weight.test.ts | 201 | `无意识台词` | `expect(lastTextContaining('无意识台词')).toContain('无意识台词')` |
| src/plugins/dialogue-weight.test.ts | 202 | `普通台词` | `expect(lastTextContaining('普通台词')).toBe('')` |
| src/plugins/dialogue-weight.test.ts | 203 | `通用台词` | `expect(lastTextContaining('通用台词')).toBe('')` |
| src/plugins/dialogue-weight.test.ts | 208 | `特殊情境加权（hConfig` | `describe('T6 特殊情境加权（hConfig talk.situations，erArk ×5）', () => {` |
| src/plugins/dialogue-weight.test.ts | 222 | `浴室情境：h_in_bathroom` | `it('浴室情境：h_in_bathroom 前提 ×5 → 浴室行权重 10/普通 1，total=11', async () => {` |
| src/plugins/dialogue-weight.test.ts | 222 | `前提` | `it('浴室情境：h_in_bathroom 前提 ×5 → 浴室行权重 10/普通 1，total=11', async () => {` |
| src/plugins/dialogue-weight.test.ts | 222 | `浴室行权重` | `it('浴室情境：h_in_bathroom 前提 ×5 → 浴室行权重 10/普通 1，total=11', async () => {` |
| src/plugins/dialogue-weight.test.ts | 222 | `10/普通` | `it('浴室情境：h_in_bathroom 前提 ×5 → 浴室行权重 10/普通 1，total=11', async () => {` |
| src/plugins/dialogue-weight.test.ts | 224 | `普通台词` | `mod.sceneDialogue.push({ scene: 's_test', text: '普通台词', condition: 'premises:high_1' })` |
| src/plugins/dialogue-weight.test.ts | 225 | `浴室台词` | `mod.sceneDialogue.push({ scene: 's_test', text: '浴室台词', condition: 'premises:high_1&h_in_bathroom' })` |
| src/plugins/dialogue-weight.test.ts | 232 | `普通台词` | `expect(lastTextContaining('普通台词')).toContain('普通台词')` |
| src/plugins/dialogue-weight.test.ts | 235 | `浴室台词` | `expect(lastTextContaining('浴室台词')).toContain('浴室台词')` |
| src/plugins/effect-system/effect-system.test.ts | 59 | `走` | `it('set_attribute 走 binding 系统', async () => {` |
| src/plugins/effect-system/effect-system.test.ts | 59 | `系统` | `it('set_attribute 走 binding 系统', async () => {` |
| src/plugins/effect-system/effect-system.test.ts | 66 | `加减` | `it('modify_attribute 加减', async () => {` |
| src/plugins/effect-system/effect-system.test.ts | 73 | `直接改实体字段` | `it('set_field 直接改实体字段', async () => {` |
| src/plugins/effect-system/effect-system.test.ts | 80 | `写入日志` | `it('narrative_output 写入日志', async () => {` |
| src/plugins/effect-system/effect-system.test.ts | 82 | `测试文本` | `{ type: 'narrative_output', params: { text: '测试文本', type: 'system' } },` |
| src/plugins/effect-system/effect-system.test.ts | 85 | `测试文本` | `expect(narrativeLog.getEntries()[0].text).toBe('测试文本')` |
| src/plugins/effect-system/effect-system.test.ts | 88 | `未知` | `it('未知 type warning + 跳过', async () => {` |
| src/plugins/effect-system/effect-system.test.ts | 88 | `跳过` | `it('未知 type warning + 跳过', async () => {` |
| src/plugins/effect-system/effect-system.test.ts | 96 | `前置失败则跳过` | `it('depends_on 前置失败则跳过', async () => {` |
| src/plugins/effect-system/effect-system.test.ts | 99 | `不应执行` | `{ id: 'dep_effect', depends_on: 'fail_effect', type: 'narrative_output', params: { text: '不应执行' } },` |
| src/plugins/effect-system/effect-system.test.ts | 105 | `抛错时错误隔离继续执行` | `it('handler 抛错时错误隔离继续执行', async () => {` |
| src/plugins/effect-system/effect-system.test.ts | 106 | `崩了` | `effectTypeRegistry.register('crash_type', () => { throw new Error('崩了') })` |
| src/plugins/effect-system/effect-system.test.ts | 109 | `仍执行` | `{ type: 'narrative_output', params: { text: '仍执行' } },` |
| src/plugins/effect-system/effect-system.test.ts | 113 | `仍执行` | `expect(narrativeLog.getEntries()[0].text).toBe('仍执行')` |
| src/plugins/effect-system/effect-system.test.ts | 117 | `无选中角色时` | `it('target=selected 无选中角色时 warning', async () => {` |
| src/plugins/effect-system/effect-system.test.ts | 124 | `推进时间` | `it('advance_time 推进时间', async () => {` |
| src/plugins/effect-system/effect-system.test.ts | 131 | `核心类型已注册` | `it('10 核心类型已注册', () => {` |
| src/plugins/effect-system/index.ts | 109 | `失败：inventory` | `message: `add_item 失败：inventory 未注册或 addItem 调用失败`,` |
| src/plugins/effect-system/index.ts | 109 | `未注册或` | `message: `add_item 失败：inventory 未注册或 addItem 调用失败`,` |
| src/plugins/effect-system/index.ts | 109 | `调用失败` | `message: `add_item 失败：inventory 未注册或 addItem 调用失败`,` |
| src/plugins/effect-system/index.ts | 126 | `失败：inventory` | `message: `remove_item 失败：inventory 未注册`,` |
| src/plugins/effect-system/index.ts | 126 | `未注册` | `message: `remove_item 失败：inventory 未注册`,` |
| src/plugins/effect-system/index.ts | 144 | `失败：character` | `message: `modify_relation 失败：character 未注册`,` |
| src/plugins/effect-system/index.ts | 144 | `未注册` | `message: `modify_relation 失败：character 未注册`,` |
| src/plugins/h-bondage/index.ts | 183 | `绳子` | `return ch?.inventory?.some((i: any) => i.itemId === '绳子' && i.count > 0) ?? false` |
| src/plugins/h-core/index.ts | 64 | `小` | `const degreeName = ['小', '普通', '强', '超强'][degree] ?? '普通'` |
| src/plugins/h-core/index.ts | 64 | `普通` | `const degreeName = ['小', '普通', '强', '超强'][degree] ?? '普通'` |
| src/plugins/h-core/index.ts | 64 | `强` | `const degreeName = ['小', '普通', '强', '超强'][degree] ?? '普通'` |
| src/plugins/h-core/index.ts | 64 | `超强` | `const degreeName = ['小', '普通', '强', '超强'][degree] ?? '普通'` |
| src/plugins/h-core/index.ts | 88 | `无目标角色，判定失败（retreated）` | `message: `judge_check 无目标角色，判定失败（retreated）`,` |
| src/plugins/h-core/index.ts | 89 | `指令的` | `suggestion: '指令的 target 应解析到选中角色；检查 uiStore.selectedCharacterId 是否为空',` |
| src/plugins/h-core/index.ts | 89 | `应解析到选中角色；检查` | `suggestion: '指令的 target 应解析到选中角色；检查 uiStore.selectedCharacterId 是否为空',` |
| src/plugins/h-core/index.ts | 89 | `是否为空` | `suggestion: '指令的 target 应解析到选中角色；检查 uiStore.selectedCharacterId 是否为空',` |
| src/plugins/h-core/index.ts | 102 | `未注册` | `if (!msg.includes('h-time-stop') && !msg.includes('未注册')) {` |
| src/plugins/h-core/index.ts | 167 | `兽部快感` | `if (_p.state === '兽部' || _p.state === '兽部快感') {` |
| src/plugins/h-core/index.ts | 172 | `检查指令` | `suggestion: '检查指令 TOML 是否误用兽部状态；本引擎不支持兽部（方舟世界观专属）',` |
| src/plugins/h-core/index.ts | 172 | `是否误用兽部状态；本引擎不支持兽部（方舟世界观专属）` | `suggestion: '检查指令 TOML 是否误用兽部状态；本引擎不支持兽部（方舟世界观专属）',` |
| src/plugins/h-core/index.ts | 210 | `未注册` | `if (!msg.includes('h-group-sex') && !msg.includes('未注册')) {` |
| src/plugins/h-core/index.ts | 253 | `兽部快感` | `if (_p.part === '兽部' || _p.part === '兽部快感') {` |
| src/plugins/h-core/index.ts | 258 | `检查指令` | `suggestion: '检查指令 TOML 是否误用兽部部位；本引擎不支持兽部（方舟世界观专属）',` |
| src/plugins/h-core/index.ts | 258 | `是否误用兽部部位；本引擎不支持兽部（方舟世界观专属）` | `suggestion: '检查指令 TOML 是否误用兽部部位；本引擎不支持兽部（方舟世界观专属）',` |
| src/plugins/h-core/index.ts | 602 | `未注册` | `if (!msg.includes('h-group-sex') && !msg.includes('未注册')) {` |
| src/plugins/h-core/index.ts | 869 | `玩家射精欲已满但` | `message: `玩家射精欲已满但 eja_climax 未注册（h-ejaculation 插件未启用）`,` |
| src/plugins/h-core/index.ts | 869 | `未注册（h-ejaculation` | `message: `玩家射精欲已满但 eja_climax 未注册（h-ejaculation 插件未启用）`,` |
| src/plugins/h-core/index.ts | 869 | `插件未启用）` | `message: `玩家射精欲已满但 eja_climax 未注册（h-ejaculation 插件未启用）`,` |
| src/plugins/h-core/index.ts | 870 | `检查` | `suggestion: '检查 h-ejaculation 插件是否已加载',` |
| src/plugins/h-core/index.ts | 870 | `插件是否已加载` | `suggestion: '检查 h-ejaculation 插件是否已加载',` |
| src/plugins/h-core/index.ts | 923 | `检查调用方传入的` | `suggestion: '检查调用方传入的 charId 是否正确（跨插件调用经 API 通道）',` |
| src/plugins/h-core/index.ts | 923 | `是否正确（跨插件调用经` | `suggestion: '检查调用方传入的 charId 是否正确（跨插件调用经 API 通道）',` |
| src/plugins/h-core/index.ts | 923 | `通道）` | `suggestion: '检查调用方传入的 charId 是否正确（跨插件调用经 API 通道）',` |
| src/plugins/h-core/index.ts | 978 | `邀请H` | `id: 'do_h', label: '邀请H', group: 'character_commands',` |
| src/plugins/h-core/index.ts | 991 | `结束H` | `id: 'end_h', label: '结束H', group: 'character_commands',` |
| src/plugins/h-core/index.ts | 1013 | `开始` | `narrativeLog.write('开始 H', 'dialogue', 'h-core')` |
| src/plugins/h-core/index.ts | 1056 | `结束` | `narrativeLog.write('结束 H', 'dialogue', 'h-core')` |
| src/plugins/h-core/premise/premise-instruct.ts | 165 | `绳子` | `registry.register('HAVE_BONDAGE', hasItem('绳子'))` |
| src/plugins/h-core/premise/premise-instruct.ts | 166 | `震动棒` | `registry.register('HAVE_VIBRATOR', hasItem('震动棒'))` |
| src/plugins/h-core/premise/premise-instruct.ts | 167 | `媚药` | `registry.register('HAVE_PHILTER', hasItem('媚药'))` |
| src/plugins/h-core/premise/premise-instruct.ts | 168 | `避孕套` | `registry.register('HAVE_CONDOM', hasItem('避孕套'))` |
| src/plugins/h-core/premise/premise-instruct.ts | 169 | `润滑液` | `registry.register('HAVE_BODY_LUBRICANT', hasItem('润滑液'))` |
| src/plugins/h-core/premise/premise-instruct.ts | 170 | `贴片` | `registry.register('HAVE_PATCH', hasItem('贴片'))` |
| src/plugins/h-core/premise/premise-instruct.ts | 171 | `口枷` | `registry.register('HAVE_GAG', hasItem('口枷'))` |
| src/plugins/h-core/premise/premise-instruct.ts | 172 | `鞭子` | `registry.register('HAVE_WHIP', hasItem('鞭子'))` |
| src/plugins/h-core/premise/premise-instruct.ts | 173 | `安全蜡烛` | `registry.register('HAVE_SAFE_CANDLES', hasItem('安全蜡烛'))` |
| src/plugins/h-core/premise/premise-instruct.ts | 174 | `灌肠用具` | `registry.register('HAVE_CLYSTER_TOOLS', hasItem('灌肠用具'))` |
| src/plugins/h-core/premise/premise-instruct.ts | 175 | `挤奶机` | `registry.register('HAVE_MILKING_MACHINE', hasItem('挤奶机'))` |
| src/plugins/h-core/premise/premise-instruct.ts | 176 | `集尿器` | `registry.register('HAVE_URINE_COLLECTOR', hasItem('集尿器'))` |
| src/plugins/h-core/premise/premise-instruct.ts | 177 | `棉棒` | `registry.register('HAVE_COTTON_STICK', hasItem('棉棒'))` |
| src/plugins/h-core/premise/premise-instruct.ts | 178 | `跳蛋` | `registry.register('HAVE_LOVE_EGG', hasItem('跳蛋'))` |
| src/plugins/h-core/premise/premise-instruct.ts | 179 | `乳头夹` | `registry.register('HAVE_NIPPLE_CLAMP', hasItem('乳头夹'))` |
| src/plugins/h-core/premise/premise-instruct.ts | 180 | `阴蒂夹` | `registry.register('HAVE_CLIT_CLAMP', hasItem('阴蒂夹'))` |
| src/plugins/h-core/premise/premise-instruct.ts | 181 | `肛珠` | `registry.register('HAVE_ANAL_BEADS', hasItem('肛珠'))` |
| src/plugins/h-core/premise/premise-instruct.ts | 182 | `灌肠液` | `registry.register('HAVE_ENEMAS', hasItem('灌肠液'))` |
| src/plugins/h-core/premise/premise-instruct.ts | 183 | `安眠药` | `registry.register('HAVE_SLEEPING_PILLS', hasItem('安眠药'))` |
| src/plugins/h-core/premise/premise-instruct.ts | 184 | `利尿剂瞬间` | `registry.register('HAVE_DIURETICS_ONCE', hasItem('利尿剂瞬间'))` |
| src/plugins/h-core/premise/premise-instruct.ts | 185 | `利尿剂持续` | `registry.register('HAVE_DIURETICS_PERSISTENT', hasItem('利尿剂持续'))` |
| src/plugins/h-core/premise/premise-instruct.ts | 186 | `克罗米芬` | `registry.register('HAVE_CLOMID', hasItem('克罗米芬'))` |
| src/plugins/h-core/premise/premise-instruct.ts | 187 | `事前避孕药` | `registry.register('HAVE_BIRTH_CONTROL_PILLS_BEFORE', hasItem('事前避孕药'))` |
| src/plugins/h-core/premise/premise-instruct.ts | 188 | `事后避孕药` | `registry.register('HAVE_BIRTH_CONTROL_PILLS_AFTER', hasItem('事后避孕药'))` |
| src/plugins/h-core/settle/eja.ts | 15 | `未注册` | `return msg.includes('h-ejaculation') || msg.includes('未注册') || msg.includes('does not exist')` |
| src/plugins/h-core/settle/judge.ts | 76 | `检查` | `suggestion: '检查 h-config.toml [judge.adjustments] 中的 condition 表达式，字段路径须存在于条件手册',` |
| src/plugins/h-core/settle/judge.ts | 76 | `中的` | `suggestion: '检查 h-config.toml [judge.adjustments] 中的 condition 表达式，字段路径须存在于条件手册',` |
| src/plugins/h-core/settle/judge.ts | 76 | `表达式，字段路径须存在于条件手册` | `suggestion: '检查 h-config.toml [judge.adjustments] 中的 condition 表达式，字段路径须存在于条件手册',` |
| src/plugins/h-core/settle/judge.ts | 86 | `初级骚扰` | `'初级骚扰', '严重骚扰', '性交', 'A性交', 'W性交', 'U开发', 'U性交',` |
| src/plugins/h-core/settle/judge.ts | 86 | `严重骚扰` | `'初级骚扰', '严重骚扰', '性交', 'A性交', 'W性交', 'U开发', 'U性交',` |
| src/plugins/h-core/settle/judge.ts | 86 | `性交` | `'初级骚扰', '严重骚扰', '性交', 'A性交', 'W性交', 'U开发', 'U性交',` |
| src/plugins/h-core/settle/judge.ts | 86 | `A性交` | `'初级骚扰', '严重骚扰', '性交', 'A性交', 'W性交', 'U开发', 'U性交',` |
| src/plugins/h-core/settle/judge.ts | 86 | `W性交` | `'初级骚扰', '严重骚扰', '性交', 'A性交', 'W性交', 'U开发', 'U性交',` |
| src/plugins/h-core/settle/judge.ts | 86 | `U开发` | `'初级骚扰', '严重骚扰', '性交', 'A性交', 'W性交', 'U开发', 'U性交',` |
| src/plugins/h-core/settle/judge.ts | 86 | `U性交` | `'初级骚扰', '严重骚扰', '性交', 'A性交', 'W性交', 'U开发', 'U性交',` |
| src/plugins/h-core/settle/judge.ts | 87 | `口交` | `'口交', '道具', '药物', 'SM', '群交', '隐奸', '露出',` |
| src/plugins/h-core/settle/judge.ts | 87 | `道具` | `'口交', '道具', '药物', 'SM', '群交', '隐奸', '露出',` |
| src/plugins/h-core/settle/judge.ts | 87 | `药物` | `'口交', '道具', '药物', 'SM', '群交', '隐奸', '露出',` |
| src/plugins/h-core/settle/judge.ts | 87 | `群交` | `'口交', '道具', '药物', 'SM', '群交', '隐奸', '露出',` |
| src/plugins/h-core/settle/judge.ts | 87 | `隐奸` | `'口交', '道具', '药物', 'SM', '群交', '隐奸', '露出',` |
| src/plugins/h-core/settle/judge.ts | 181 | `群交` | `if (judgeClass === '群交' || judgeClass === '隐奸') otherBase = 60 + 60 * otherCount` |
| src/plugins/h-core/settle/judge.ts | 181 | `隐奸` | `if (judgeClass === '群交' || judgeClass === '隐奸') otherBase = 60 + 60 * otherCount` |
| src/plugins/h-core/settle/orgasm.ts | 55 | `尿道感度` | `5: '后穴感度', 6: '尿道感度', 7: '子宫感度', 21: '口喉感度', 23: '心理感度',` |
| src/plugins/h-core/settle/pain-adjust.ts | 44 | `未注册` | `if (!msg.includes('h-group-sex') && !msg.includes('未注册')) {` |
| src/plugins/h-core/settle/pain-adjust.ts | 77 | `尿道扩张` | `'尿道': { dilateAbility: '尿道扩张', baseValue: 1000, levelOffset: -3 },` |
| src/plugins/h-core/settle/state-settle.ts | 48 | `尿道感度` | `'后穴': '后穴感度', '尿道': '尿道感度', '子宫': '子宫感度', '口喉': '口喉感度',` |
| src/plugins/h-ejaculation/body-parts.ts | 7 | `头发` | `'头发': 0,` |
| src/plugins/h-ejaculation/body-parts.ts | 8 | `面` | `'面': 1,` |
| src/plugins/h-ejaculation/body-parts.ts | 9 | `脸` | `'脸': 1,` |
| src/plugins/h-ejaculation/body-parts.ts | 10 | `嘴` | `'嘴': 2,` |
| src/plugins/h-ejaculation/body-parts.ts | 11 | `口腔` | `'口腔': 2,` |
| src/plugins/h-ejaculation/body-parts.ts | 12 | `口` | `'口': 2,` |
| src/plugins/h-ejaculation/body-parts.ts | 13 | `胸` | `'胸': 3,` |
| src/plugins/h-ejaculation/body-parts.ts | 15 | `乳房` | `'乳房': 3,` |
| src/plugins/h-ejaculation/body-parts.ts | 16 | `乳` | `'乳': 3,` |
| src/plugins/h-ejaculation/body-parts.ts | 18 | `蒂` | `'蒂': 4,` |
| src/plugins/h-ejaculation/body-parts.ts | 19 | `手` | `'手': 5,` |
| src/plugins/h-ejaculation/body-parts.ts | 21 | `穴` | `'穴': 6,` |
| src/plugins/h-ejaculation/body-parts.ts | 23 | `宫` | `'宫': 7,` |
| src/plugins/h-ejaculation/body-parts.ts | 24 | `肛` | `'肛': 8,` |
| src/plugins/h-ejaculation/body-parts.ts | 26 | `菊花` | `'菊花': 8,` |
| src/plugins/h-ejaculation/body-parts.ts | 27 | `脚` | `'脚': 9,` |
| src/plugins/h-ejaculation/body-parts.ts | 29 | `腿` | `'腿': 11,` |
| src/plugins/h-ejaculation/body-parts.ts | 30 | `腰` | `'腰': 12,` |
| src/plugins/h-ejaculation/body-parts.ts | 31 | `腰部` | `'腰部': 12,` |
| src/plugins/h-ejaculation/body-parts.ts | 32 | `臀部` | `'臀部': 13,` |
| src/plugins/h-ejaculation/body-parts.ts | 33 | `臀` | `'臀': 13,` |
| src/plugins/h-ejaculation/body-parts.ts | 34 | `屁股` | `'屁股': 13,` |
| src/plugins/h-ejaculation/body-parts.ts | 35 | `背` | `'背': 14,` |
| src/plugins/h-ejaculation/body-parts.ts | 36 | `胃` | `'胃': 15,` |
| src/plugins/h-ejaculation/body-parts.ts | 37 | `肚子` | `'肚子': 15,` |
| src/plugins/h-ejaculation/body-parts.ts | 38 | `腹` | `'腹': 15,` |
| src/plugins/h-ejaculation/body-parts.ts | 39 | `耳` | `'耳': 16,` |
| src/plugins/h-ejaculation/body-parts.ts | 40 | `腋` | `'腋': 17,` |
| src/plugins/h-ejaculation/body-parts.ts | 41 | `腋下` | `'腋下': 17,` |
| src/plugins/h-ejaculation/body-parts.ts | 42 | `全身` | `'全身': 18,` |
| src/plugins/h-ejaculation/body-parts.ts | 43 | `体内` | `'体内': 20,` |
| src/plugins/h-exposure/index.ts | 10 | `室内露出` | `const MODE_NAMES = ['无', '室内露出', '室外露出', '人前露出', '无意识露出']` |
| src/plugins/h-exposure/index.ts | 10 | `室外露出` | `const MODE_NAMES = ['无', '室内露出', '室外露出', '人前露出', '无意识露出']` |
| src/plugins/h-exposure/index.ts | 10 | `人前露出` | `const MODE_NAMES = ['无', '室内露出', '室外露出', '人前露出', '无意识露出']` |
| src/plugins/h-exposure/index.ts | 10 | `无意识露出` | `const MODE_NAMES = ['无', '室内露出', '室外露出', '人前露出', '无意识露出']` |
| src/plugins/h-first-time/index.ts | 164 | `内裤沾上了处女血` | `narrativeLog.write(`${char.name ?? char.id} 的${panties ? '内裤沾上了处女血' : '处女血滴落'}`, 'system', 'h-first-time')` |
| src/plugins/h-first-time/index.ts | 164 | `处女血滴落` | `narrativeLog.write(`${char.name ?? char.id} 的${panties ? '内裤沾上了处女血' : '处女血滴落'}`, 'system', 'h-first-time')` |
| src/plugins/h-group-sex/index.ts | 30 | `什么都不做` | `const NPC_AI_NAMES = ['什么都不做', '自慰', '自动补位', '随机竞争']` |
| src/plugins/h-group-sex/index.ts | 30 | `自慰` | `const NPC_AI_NAMES = ['什么都不做', '自慰', '自动补位', '随机竞争']` |
| src/plugins/h-group-sex/index.ts | 30 | `自动补位` | `const NPC_AI_NAMES = ['什么都不做', '自慰', '自动补位', '随机竞争']` |
| src/plugins/h-group-sex/index.ts | 30 | `随机竞争` | `const NPC_AI_NAMES = ['什么都不做', '自慰', '自动补位', '随机竞争']` |
| src/plugins/h-group-sex/index.ts | 145 | `进入群交模式` | `narrativeLog.write('进入群交模式', 'system', 'h-group-sex')` |
| src/plugins/h-group-sex/index.ts | 152 | `退出群交模式` | `narrativeLog.write('退出群交模式', 'system', 'h-group-sex')` |
| src/plugins/h-group-sex/index.ts | 344 | `未知` | `getNpcAiName: (type: number): string => NPC_AI_NAMES[type] ?? '未知',` |
| src/plugins/h-hidden/index.ts | 32 | `完全隐蔽` | `{ cid: 0, name: '完全隐蔽', threshold: 30 },` |
| src/plugins/h-hidden/index.ts | 34 | `引人注意` | `{ cid: 2, name: '引人注意', threshold: 80 },` |
| src/plugins/h-hidden/index.ts | 35 | `随时暴露` | `{ cid: 3, name: '随时暴露', threshold: 95 },` |
| src/plugins/h-hidden/index.ts | 39 | `双不隐` | `const MODE_NAMES = ['无', '双不隐', '女隐', '男隐', '双隐']` |
| src/plugins/h-hidden/index.ts | 39 | `女隐` | `const MODE_NAMES = ['无', '双不隐', '女隐', '男隐', '双隐']` |
| src/plugins/h-hidden/index.ts | 39 | `男隐` | `const MODE_NAMES = ['无', '双不隐', '女隐', '男隐', '双隐']` |
| src/plugins/h-hidden/index.ts | 39 | `双隐` | `const MODE_NAMES = ['无', '双不隐', '女隐', '男隐', '双隐']` |
| src/plugins/h-hidden/index.ts | 70 | `随时暴露` | `return { cid: 3, name: '随时暴露' }` |
| src/plugins/h-hidden/index.ts | 79 | `道具` | `if (tag === '道具') intensity = Math.max(4, intensity)` |
| src/plugins/h-hidden/index.ts | 80 | `插入` | `else if (tag === '插入') intensity = Math.max(3, intensity)` |
| src/plugins/h-hidden/index.ts | 81 | `侍奉` | `else if (tag === '侍奉') intensity = Math.max(2, intensity)` |
| src/plugins/h-hidden/index.ts | 284 | `场景条件不满足隐奸模式` | `narrativeLog.write('场景条件不满足隐奸模式 ' + mode + '（需仅 2 人或所有人无意识）', 'system', 'h-hidden')` |
| src/plugins/h-hidden/index.ts | 284 | `（需仅` | `narrativeLog.write('场景条件不满足隐奸模式 ' + mode + '（需仅 2 人或所有人无意识）', 'system', 'h-hidden')` |
| src/plugins/h-hidden/index.ts | 284 | `人或所有人无意识）` | `narrativeLog.write('场景条件不满足隐奸模式 ' + mode + '（需仅 2 人或所有人无意识）', 'system', 'h-hidden')` |
| src/plugins/h-hidden/index.ts | 508 | `猥亵` | `const isSexTag = behaviorTags.some((t: string) => t === '猥亵' || t === '性爱')` |
| src/plugins/h-hidden/index.ts | 508 | `性爱` | `const isSexTag = behaviorTags.some((t: string) => t === '猥亵' || t === '性爱')` |
| src/plugins/h-hypnosis/index.ts | 71 | `平然催眠` | `const HYPNOSIS_TYPE_NAMES = ['无', '平然催眠', '空气催眠', '体控催眠', '心控催眠']` |
| src/plugins/h-hypnosis/index.ts | 71 | `空气催眠` | `const HYPNOSIS_TYPE_NAMES = ['无', '平然催眠', '空气催眠', '体控催眠', '心控催眠']` |
| src/plugins/h-hypnosis/index.ts | 71 | `体控催眠` | `const HYPNOSIS_TYPE_NAMES = ['无', '平然催眠', '空气催眠', '体控催眠', '心控催眠']` |
| src/plugins/h-hypnosis/index.ts | 71 | `心控催眠` | `const HYPNOSIS_TYPE_NAMES = ['无', '平然催眠', '空气催眠', '体控催眠', '心控催眠']` |
| src/plugins/h-hypnosis/index.ts | 78 | `不进行角色扮演。` | `{ id: 0,  name: '无',        type: '无',   subType: '无',   info: '不进行角色扮演。' },` |
| src/plugins/h-hypnosis/index.ts | 79 | `对方是自己的妻子，和自己感情十分深厚。` | `{ id: 1,  name: '妻子',      type: '家庭', subType: '无',   info: '对方是自己的妻子，和自己感情十分深厚。' },` |
| src/plugins/h-hypnosis/index.ts | 80 | `对方是自己的亲姐姐，对自己这个弟弟十分照顾。` | `{ id: 2,  name: '姐姐',      type: '家庭', subType: '无',   info: '对方是自己的亲姐姐，对自己这个弟弟十分照顾。' },` |
| src/plugins/h-hypnosis/index.ts | 81 | `对方是自己的亲妹妹，很依赖自己这个哥哥。` | `{ id: 3,  name: '妹妹',      type: '家庭', subType: '无',   info: '对方是自己的亲妹妹，很依赖自己这个哥哥。' },` |
| src/plugins/h-hypnosis/index.ts | 82 | `对方是自己的亲生女儿，天真可爱，非常依赖自己。` | `{ id: 4,  name: '女儿',      type: '家庭', subType: '无',   info: '对方是自己的亲生女儿，天真可爱，非常依赖自己。' },` |
| src/plugins/h-hypnosis/index.ts | 83 | `对方是自己的妈妈，对自己有强烈的保护欲和溺爱。` | `{ id: 5,  name: '妈妈',      type: '家庭', subType: '无',   info: '对方是自己的妈妈，对自己有强烈的保护欲和溺爱。' },` |
| src/plugins/h-hypnosis/index.ts | 84 | `对方是正在上小学的学生，天真无邪，充满好奇心。` | `{ id: 11, name: '小学生',    type: '职业', subType: '校园', info: '对方是正在上小学的学生，天真无邪，充满好奇心。' },` |
| src/plugins/h-hypnosis/index.ts | 85 | `对方是正在上初中的学生，正值叛逆期。` | `{ id: 12, name: '初中生',    type: '职业', subType: '校园', info: '对方是正在上初中的学生，正值叛逆期。' },` |
| src/plugins/h-hypnosis/index.ts | 86 | `对方是正在上高中的学生，青春活泼。` | `{ id: 13, name: '高中生',    type: '职业', subType: '校园', info: '对方是正在上高中的学生，青春活泼。' },` |
| src/plugins/h-hypnosis/index.ts | 87 | `对方是正在上大学的学生，追求梦想。` | `{ id: 14, name: '大学生',    type: '职业', subType: '校园', info: '对方是正在上大学的学生，追求梦想。' },` |
| src/plugins/h-hypnosis/index.ts | 88 | `对方是学校的教师，关心学生的成长与学习。` | `{ id: 15, name: '教师',      type: '职业', subType: '校园', info: '对方是学校的教师，关心学生的成长与学习。' },` |
| src/plugins/h-hypnosis/index.ts | 89 | `对方是照顾病人的护士，温柔体贴。` | `{ id: 21, name: '护士',      type: '职业', subType: '护士', info: '对方是照顾病人的护士，温柔体贴。' },` |
| src/plugins/h-hypnosis/index.ts | 90 | `对方是维护社会秩序的警察。` | `{ id: 22, name: '警察',      type: '职业', subType: '无',   info: '对方是维护社会秩序的警察。' },` |
| src/plugins/h-hypnosis/index.ts | 91 | `对方是公司职员，工作繁忙压力大。` | `{ id: 23, name: '白领',      type: '职业', subType: '无',   info: '对方是公司职员，工作繁忙压力大。' },` |
| src/plugins/h-hypnosis/index.ts | 92 | `对方是国民级的美少女偶像。` | `{ id: 24, name: '偶像',      type: '职业', subType: '偶像', info: '对方是国民级的美少女偶像。' },` |
| src/plugins/h-hypnosis/index.ts | 93 | `对方是自己家雇佣的女仆。` | `{ id: 25, name: '家庭女仆',  type: '职业', subType: '家庭女仆', info: '对方是自己家雇佣的女仆。' },` |
| src/plugins/h-hypnosis/index.ts | 94 | `对方是在女仆咖啡厅工作的女仆。` | `{ id: 26, name: '咖啡厅女仆',type: '职业', subType: '咖啡厅女仆', info: '对方是在女仆咖啡厅工作的女仆。' },` |
| src/plugins/h-hypnosis/index.ts | 95 | `对方是神社的巫女。` | `{ id: 27, name: '巫女',      type: '职业', subType: '巫女', info: '对方是神社的巫女。' },` |
| src/plugins/h-hypnosis/index.ts | 96 | `自己和对方之间没有任何关系。` | `{ id: 31, name: '陌生人',    type: '关系', subType: '非家庭', info: '自己和对方之间没有任何关系。' },` |
| src/plugins/h-hypnosis/index.ts | 97 | `师生` | `{ id: 32, name: '师生',      type: '关系', subType: '校园', info: '对方和自己是教导的师生关系。' },` |
| src/plugins/h-hypnosis/index.ts | 97 | `对方和自己是教导的师生关系。` | `{ id: 32, name: '师生',      type: '关系', subType: '校园', info: '对方和自己是教导的师生关系。' },` |
| src/plugins/h-hypnosis/index.ts | 98 | `同学` | `{ id: 33, name: '同学',      type: '关系', subType: '校园', info: '对方是自己的同班同学。' },` |
| src/plugins/h-hypnosis/index.ts | 98 | `对方是自己的同班同学。` | `{ id: 33, name: '同学',      type: '关系', subType: '校园', info: '对方是自己的同班同学。' },` |
| src/plugins/h-hypnosis/index.ts | 99 | `对方是自己的同事，工作上互相支持。` | `{ id: 34, name: '同事',      type: '关系', subType: '非家庭', info: '对方是自己的同事，工作上互相支持。' },` |
| src/plugins/h-hypnosis/index.ts | 100 | `对方是住在自己隔壁的邻居。` | `{ id: 35, name: '邻居',      type: '关系', subType: '非家庭', info: '对方是住在自己隔壁的邻居。' },` |
| src/plugins/h-hypnosis/index.ts | 101 | `宠物猫` | `{ id: 51, name: '宠物猫',    type: '人外', subType: '特殊', info: '对方以为自己是一只猫，拥有猫的所有特征和习性。' },` |
| src/plugins/h-hypnosis/index.ts | 101 | `人外` | `{ id: 51, name: '宠物猫',    type: '人外', subType: '特殊', info: '对方以为自己是一只猫，拥有猫的所有特征和习性。' },` |
| src/plugins/h-hypnosis/index.ts | 101 | `特殊` | `{ id: 51, name: '宠物猫',    type: '人外', subType: '特殊', info: '对方以为自己是一只猫，拥有猫的所有特征和习性。' },` |
| src/plugins/h-hypnosis/index.ts | 101 | `对方以为自己是一只猫，拥有猫的所有特征和习性。` | `{ id: 51, name: '宠物猫',    type: '人外', subType: '特殊', info: '对方以为自己是一只猫，拥有猫的所有特征和习性。' },` |
| src/plugins/h-hypnosis/index.ts | 102 | `宠物狗` | `{ id: 52, name: '宠物狗',    type: '人外', subType: '特殊', info: '对方以为自己是一只狗，拥有狗的所有特征和习性。' },` |
| src/plugins/h-hypnosis/index.ts | 102 | `人外` | `{ id: 52, name: '宠物狗',    type: '人外', subType: '特殊', info: '对方以为自己是一只狗，拥有狗的所有特征和习性。' },` |
| src/plugins/h-hypnosis/index.ts | 102 | `特殊` | `{ id: 52, name: '宠物狗',    type: '人外', subType: '特殊', info: '对方以为自己是一只狗，拥有狗的所有特征和习性。' },` |
| src/plugins/h-hypnosis/index.ts | 102 | `对方以为自己是一只狗，拥有狗的所有特征和习性。` | `{ id: 52, name: '宠物狗',    type: '人外', subType: '特殊', info: '对方以为自己是一只狗，拥有狗的所有特征和习性。' },` |
| src/plugins/h-hypnosis/index.ts | 103 | `魅魔` | `{ id: 53, name: '魅魔',      type: '人外', subType: '无',   info: '对方以为自己是魅魔，以吸取精气为生。' },` |
| src/plugins/h-hypnosis/index.ts | 103 | `人外` | `{ id: 53, name: '魅魔',      type: '人外', subType: '无',   info: '对方以为自己是魅魔，以吸取精气为生。' },` |
| src/plugins/h-hypnosis/index.ts | 103 | `对方以为自己是魅魔，以吸取精气为生。` | `{ id: 53, name: '魅魔',      type: '人外', subType: '无',   info: '对方以为自己是魅魔，以吸取精气为生。' },` |
| src/plugins/h-hypnosis/index.ts | 104 | `电车痴汉` | `{ id: 101,name: '电车痴汉',  type: '场景', subType: '通用', info: '在拥挤的电车上进行痴汉行为。' },` |
| src/plugins/h-hypnosis/index.ts | 104 | `通用` | `{ id: 101,name: '电车痴汉',  type: '场景', subType: '通用', info: '在拥挤的电车上进行痴汉行为。' },` |
| src/plugins/h-hypnosis/index.ts | 104 | `在拥挤的电车上进行痴汉行为。` | `{ id: 101,name: '电车痴汉',  type: '场景', subType: '通用', info: '在拥挤的电车上进行痴汉行为。' },` |
| src/plugins/h-hypnosis/index.ts | 105 | `户外当众` | `{ id: 102,name: '户外当众',  type: '场景', subType: '通用', info: '在公共场所进行亲密行为。' },` |
| src/plugins/h-hypnosis/index.ts | 105 | `通用` | `{ id: 102,name: '户外当众',  type: '场景', subType: '通用', info: '在公共场所进行亲密行为。' },` |
| src/plugins/h-hypnosis/index.ts | 105 | `在公共场所进行亲密行为。` | `{ id: 102,name: '户外当众',  type: '场景', subType: '通用', info: '在公共场所进行亲密行为。' },` |
| src/plugins/h-hypnosis/index.ts | 106 | `公共厕所（主动）` | `{ id: 103,name: '公共厕所（主动）', type: '场景', subType: '通用', info: '对方把自己捆在公共厕所隔间里。' },` |
| src/plugins/h-hypnosis/index.ts | 106 | `通用` | `{ id: 103,name: '公共厕所（主动）', type: '场景', subType: '通用', info: '对方把自己捆在公共厕所隔间里。' },` |
| src/plugins/h-hypnosis/index.ts | 106 | `对方把自己捆在公共厕所隔间里。` | `{ id: 103,name: '公共厕所（主动）', type: '场景', subType: '通用', info: '对方把自己捆在公共厕所隔间里。' },` |
| src/plugins/h-hypnosis/index.ts | 107 | `公共厕所（被动）` | `{ id: 104,name: '公共厕所（被动）', type: '场景', subType: '通用', info: '对方被自己捆在公共厕所隔间里。' },` |
| src/plugins/h-hypnosis/index.ts | 107 | `通用` | `{ id: 104,name: '公共厕所（被动）', type: '场景', subType: '通用', info: '对方被自己捆在公共厕所隔间里。' },` |
| src/plugins/h-hypnosis/index.ts | 107 | `对方被自己捆在公共厕所隔间里。` | `{ id: 104,name: '公共厕所（被动）', type: '场景', subType: '通用', info: '对方被自己捆在公共厕所隔间里。' },` |
| src/plugins/h-hypnosis/index.ts | 108 | `俘虏拷问` | `{ id: 105,name: '俘虏拷问',  type: '场景', subType: '特殊', info: '对方是被俘虏的敌人，自己是审讯官。' },` |
| src/plugins/h-hypnosis/index.ts | 108 | `特殊` | `{ id: 105,name: '俘虏拷问',  type: '场景', subType: '特殊', info: '对方是被俘虏的敌人，自己是审讯官。' },` |
| src/plugins/h-hypnosis/index.ts | 108 | `对方是被俘虏的敌人，自己是审讯官。` | `{ id: 105,name: '俘虏拷问',  type: '场景', subType: '特殊', info: '对方是被俘虏的敌人，自己是审讯官。' },` |
| src/plugins/h-hypnosis/index.ts | 109 | `榨精护士` | `{ id: 106,name: '榨精护士',  type: '场景', subType: '护士', info: '对方是医院的护士，负责精液采集。' },` |
| src/plugins/h-hypnosis/index.ts | 109 | `对方是医院的护士，负责精液采集。` | `{ id: 106,name: '榨精护士',  type: '场景', subType: '护士', info: '对方是医院的护士，负责精液采集。' },` |
| src/plugins/h-hypnosis/index.ts | 110 | `战败魔法少女` | `{ id: 107,name: '战败魔法少女', type: '场景', subType: '特殊', info: '对方是魔法少女，被自己打败后沦为自己的玩物。' },` |
| src/plugins/h-hypnosis/index.ts | 110 | `特殊` | `{ id: 107,name: '战败魔法少女', type: '场景', subType: '特殊', info: '对方是魔法少女，被自己打败后沦为自己的玩物。' },` |
| src/plugins/h-hypnosis/index.ts | 110 | `对方是魔法少女，被自己打败后沦为自己的玩物。` | `{ id: 107,name: '战败魔法少女', type: '场景', subType: '特殊', info: '对方是魔法少女，被自己打败后沦为自己的玩物。' },` |
| src/plugins/h-hypnosis/index.ts | 111 | `对方是正在直播的VTuber。` | `{ id: 108,name: 'VTuber直播中', type: '场景', subType: '家庭', info: '对方是正在直播的VTuber。' },` |
| src/plugins/h-hypnosis/index.ts | 112 | `向神灵祭祀` | `{ id: 109,name: '向神灵祭祀', type: '场景', subType: '巫女', info: '在神像面前进行交合。' },` |
| src/plugins/h-hypnosis/index.ts | 112 | `在神像面前进行交合。` | `{ id: 109,name: '向神灵祭祀', type: '场景', subType: '巫女', info: '在神像面前进行交合。' },` |
| src/plugins/h-hypnosis/index.ts | 113 | `向自己祭祀` | `{ id: 110,name: '向自己祭祀', type: '场景', subType: '巫女', info: '对方是巫女，自己化身神灵。' },` |
| src/plugins/h-hypnosis/index.ts | 113 | `对方是巫女，自己化身神灵。` | `{ id: 110,name: '向自己祭祀', type: '场景', subType: '巫女', info: '对方是巫女，自己化身神灵。' },` |
| src/plugins/h-hypnosis/index.ts | 114 | `对方做了错事，必须接受主人的惩罚。` | `{ id: 111,name: '女仆惩罚调教', type: '场景', subType: '家庭女仆', info: '对方做了错事，必须接受主人的惩罚。' },` |
| src/plugins/h-hypnosis/index.ts | 115 | `女仆咖啡厅里菜单` | `{ id: 112,name: '女仆咖啡厅里菜单', type: '场景', subType: '咖啡厅女仆', info: '点了特殊的菜单，女仆必须满足要求。' },` |
| src/plugins/h-hypnosis/index.ts | 115 | `点了特殊的菜单，女仆必须满足要求。` | `{ id: 112,name: '女仆咖啡厅里菜单', type: '场景', subType: '咖啡厅女仆', info: '点了特殊的菜单，女仆必须满足要求。' },` |
| src/plugins/h-hypnosis/index.ts | 116 | `偶像台前准备室` | `{ id: 121,name: '偶像台前准备室', type: '场景', subType: '偶像', info: '在准备室里对偶像进行特殊的准备。' },` |
| src/plugins/h-hypnosis/index.ts | 116 | `在准备室里对偶像进行特殊的准备。` | `{ id: 121,name: '偶像台前准备室', type: '场景', subType: '偶像', info: '在准备室里对偶像进行特殊的准备。' },` |
| src/plugins/h-hypnosis/index.ts | 117 | `偶像单人LIVE` | `{ id: 122,name: '偶像单人LIVE', type: '场景', subType: '偶像', info: '对方为自己开了一场私人演出。' },` |
| src/plugins/h-hypnosis/index.ts | 117 | `对方为自己开了一场私人演出。` | `{ id: 122,name: '偶像单人LIVE', type: '场景', subType: '偶像', info: '对方为自己开了一场私人演出。' },` |
| src/plugins/h-hypnosis/index.ts | 118 | `偶像演出后粉丝答谢` | `{ id: 123,name: '偶像演出后粉丝答谢', type: '场景', subType: '偶像', info: '演出结束后进行特殊的粉丝答谢。' },` |
| src/plugins/h-hypnosis/index.ts | 118 | `演出结束后进行特殊的粉丝答谢。` | `{ id: 123,name: '偶像演出后粉丝答谢', type: '场景', subType: '偶像', info: '演出结束后进行特殊的粉丝答谢。' },` |
| src/plugins/h-hypnosis/index.ts | 119 | `偶像枕营业` | `{ id: 124,name: '偶像枕营业', type: '场景', subType: '特殊', info: '为了上台表演必须与自己发生关系。' },` |
| src/plugins/h-hypnosis/index.ts | 119 | `特殊` | `{ id: 124,name: '偶像枕营业', type: '场景', subType: '特殊', info: '为了上台表演必须与自己发生关系。' },` |
| src/plugins/h-hypnosis/index.ts | 119 | `为了上台表演必须与自己发生关系。` | `{ id: 124,name: '偶像枕营业', type: '场景', subType: '特殊', info: '为了上台表演必须与自己发生关系。' },` |
| src/plugins/h-hypnosis/index.ts | 120 | `放学后教室H` | `{ id: 131,name: '放学后教室H', type: '场景', subType: '校园', info: '在空无一人的教室里偷偷进行性行为。' },` |
| src/plugins/h-hypnosis/index.ts | 120 | `在空无一人的教室里偷偷进行性行为。` | `{ id: 131,name: '放学后教室H', type: '场景', subType: '校园', info: '在空无一人的教室里偷偷进行性行为。' },` |
| src/plugins/h-hypnosis/index.ts | 121 | `体育仓库H` | `{ id: 132,name: '体育仓库H',  type: '场景', subType: '校园', info: '在体育器材仓库中偷偷进行性行为。' },` |
| src/plugins/h-hypnosis/index.ts | 121 | `在体育器材仓库中偷偷进行性行为。` | `{ id: 132,name: '体育仓库H',  type: '场景', subType: '校园', info: '在体育器材仓库中偷偷进行性行为。' },` |
| src/plugins/h-hypnosis/index.ts | 122 | `天台H` | `{ id: 133,name: '天台H',     type: '场景', subType: '校园', info: '在学校的天台上进行性行为。' },` |
| src/plugins/h-hypnosis/index.ts | 122 | `在学校的天台上进行性行为。` | `{ id: 133,name: '天台H',     type: '场景', subType: '校园', info: '在学校的天台上进行性行为。' },` |
| src/plugins/h-hypnosis/index.ts | 123 | `学校厕所H` | `{ id: 134,name: '学校厕所H', type: '场景', subType: '校园', info: '在学校的厕所里进行性行为。' },` |
| src/plugins/h-hypnosis/index.ts | 123 | `在学校的厕所里进行性行为。` | `{ id: 134,name: '学校厕所H', type: '场景', subType: '校园', info: '在学校的厕所里进行性行为。' },` |
| src/plugins/h-hypnosis/index.ts | 124 | `保健室H` | `{ id: 135,name: '保健室H',   type: '场景', subType: '校园', info: '藏在保健室的同一张床上进行性行为。' },` |
| src/plugins/h-hypnosis/index.ts | 124 | `藏在保健室的同一张床上进行性行为。` | `{ id: 135,name: '保健室H',   type: '场景', subType: '校园', info: '藏在保健室的同一张床上进行性行为。' },` |
| src/plugins/h-mark/index.ts | 13 | `时姦` | `'快乐': 13, '屈服': 14, '苦痛': 15, '时姦': 16, '恐怖': 17, '反发': 18, '无觉': 19,` |
| src/plugins/h-mark/index.ts | 13 | `反发` | `'快乐': 13, '屈服': 14, '苦痛': 15, '时姦': 16, '恐怖': 17, '反发': 18, '无觉': 19,` |
| src/plugins/h-mark/index.ts | 13 | `无觉` | `'快乐': 13, '屈服': 14, '苦痛': 15, '时姦': 16, '恐怖': 17, '反发': 18, '无觉': 19,` |
| src/plugins/h-mark/index.ts | 31 | `反发` | `'反发': [10000, 30000, 80000],             // 反感×5+抑郁+恐怖+苦痛` |
| src/plugins/h-mark/index.ts | 32 | `无觉` | `'无觉': [[2, 5], [8, 20], [16, 50], [100], [200], [500]],  // 无意识绝顶 6 级` |
| src/plugins/h-mark/index.ts | 33 | `时姦` | `'时姦': [],  // 无自动升级，由其他系统设定` |
| src/plugins/h-mark.test.ts | 27 | `刻印存储（按名键统一）` | `describe('h-mark 刻印存储（按名键统一）', () => {` |
| src/plugins/h-mark.test.ts | 44 | `测试NPC` | `entitySystem.register('character', 'npc_1', { id: 'npc_1', name: '测试NPC', base: {}, current_location: 'town_sq` |
| src/plugins/h-mark.test.ts | 49 | `升级写入按名键（快乐刻印），不再写` | `it('checkOne 升级写入按名键（快乐刻印），不再写 mark_13', async () => {` |
| src/plugins/h-mark.test.ts | 59 | `修正` | `it('快乐刻印 LV2 → settle_favorability 修正 +0.4/级（calcFavorability 按名读）', async () => {` |
| src/plugins/h-mark.test.ts | 59 | `4/级（calcFavorability` | `it('快乐刻印 LV2 → settle_favorability 修正 +0.4/级（calcFavorability 按名读）', async () => {` |
| src/plugins/h-mark.test.ts | 59 | `按名读）` | `it('快乐刻印 LV2 → settle_favorability 修正 +0.4/级（calcFavorability 按名读）', async () => {` |
| src/plugins/h-mark.test.ts | 71 | `修正（calcTrust` | `it('快乐刻印 LV2 → settle_trust 修正（calcTrust 按名读）：60 分 → 1.0 + 0.4 = 1.4', async () => {` |
| src/plugins/h-mark.test.ts | 71 | `按名读）：60` | `it('快乐刻印 LV2 → settle_trust 修正（calcTrust 按名读）：60 分 → 1.0 + 0.4 = 1.4', async () => {` |
| src/plugins/h-mark.test.ts | 71 | `分` | `it('快乐刻印 LV2 → settle_trust 修正（calcTrust 按名读）：60 分 → 1.0 + 0.4 = 1.4', async () => {` |
| src/plugins/h-mark.test.ts | 82 | `快乐刻印系数（MARK_DEBUFF_STATES` | `it('settle_state 快乐刻印系数（MARK_DEBUFF_STATES 按名读）：快乐刻印 LV2 → 35×3=105', async () => {` |
| src/plugins/h-mark.test.ts | 82 | `按名读）：快乐刻印` | `it('settle_state 快乐刻印系数（MARK_DEBUFF_STATES 按名读）：快乐刻印 LV2 → 35×3=105', async () => {` |
| src/plugins/h-mark.test.ts | 93 | `快乐刻印累计分支：orgasm_count[state][1]` | `it('快乐刻印累计分支：orgasm_count[state][1] 合计 ≥5 → LV1（单次 <2 也升级）', async () => {` |
| src/plugins/h-mark.test.ts | 93 | `合计` | `it('快乐刻印累计分支：orgasm_count[state][1] 合计 ≥5 → LV1（单次 <2 也升级）', async () => {` |
| src/plugins/h-mark.test.ts | 93 | `LV1（单次` | `it('快乐刻印累计分支：orgasm_count[state][1] 合计 ≥5 → LV1（单次 <2 也升级）', async () => {` |
| src/plugins/h-mark.test.ts | 93 | `也升级）` | `it('快乐刻印累计分支：orgasm_count[state][1] 合计 ≥5 → LV1（单次 <2 也升级）', async () => {` |
| src/plugins/h-mark.test.ts | 102 | `无觉刻印：experience[78]` | `it('无觉刻印：experience[78] ≥5 且无意识 → LV1；无意识门（清醒时不升级）', async () => {` |
| src/plugins/h-mark.test.ts | 102 | `且无意识` | `it('无觉刻印：experience[78] ≥5 且无意识 → LV1；无意识门（清醒时不升级）', async () => {` |
| src/plugins/h-mark.test.ts | 102 | `LV1；无意识门（清醒时不升级）` | `it('无觉刻印：experience[78] ≥5 且无意识 → LV1；无意识门（清醒时不升级）', async () => {` |
| src/plugins/h-mark.test.ts | 118 | `无觉刻印单次分支：orgasm_count[0]` | `it('无觉刻印单次分支：orgasm_count[0] 合计 ≥2 且无意识 → LV1', async () => {` |
| src/plugins/h-mark.test.ts | 118 | `合计` | `it('无觉刻印单次分支：orgasm_count[0] 合计 ≥2 且无意识 → LV1', async () => {` |
| src/plugins/h-mark.test.ts | 118 | `且无意识` | `it('无觉刻印单次分支：orgasm_count[0] 合计 ≥2 且无意识 → LV1', async () => {` |
| src/plugins/h-time-stop/index.ts | 47 | `时间停止了！` | `narrativeLog.write('时间停止了！', 'system', 'h-time-stop')` |
| src/plugins/h-time-stop/index.ts | 76 | `未注册` | `if (!msg.includes('release_time_stop_orgasm') && !msg.includes('未注册')) {` |
| src/plugins/h-time-stop/index.ts | 87 | `时间重新流动` | `narrativeLog.write('时间重新流动', 'system', 'h-time-stop')` |
| src/plugins/h-time-stop/index.ts | 120 | `停止搬运` | `narrativeLog.write('停止搬运', 'system', 'h-time-stop')` |
| src/plugins/hidden-sex-realtime.test.ts | 34 | `隐奸/露出持续快感` | `describe('隐奸/露出持续快感 + 他人存在判定修正（erArk realtime_settle + instuct_judege 对齐）', () => {` |
| src/plugins/hidden-sex-realtime.test.ts | 34 | `他人存在判定修正（erArk` | `describe('隐奸/露出持续快感 + 他人存在判定修正（erArk realtime_settle + instuct_judege 对齐）', () => {` |
| src/plugins/hidden-sex-realtime.test.ts | 34 | `对齐）` | `describe('隐奸/露出持续快感 + 他人存在判定修正（erArk realtime_settle + instuct_judege 对齐）', () => {` |
| src/plugins/hidden-sex-realtime.test.ts | 51 | `测试NPC` | `entitySystem.register('character', 'npc_1', { id: 'npc_1', name: '测试NPC', base: {}, current_location: 'town_sq` |
| src/plugins/hidden-sex-realtime.test.ts | 54 | `路人` | `entitySystem.register('character', 'passerby', { id: 'passerby', name: '路人', base: {}, current_location: 'town` |
| src/plugins/hidden-sex-realtime.test.ts | 75 | `隐奸持续快感（realtime_settle` | `describe('隐奸持续快感（realtime_settle.py:602-607）', () => {` |
| src/plugins/hidden-sex-realtime.test.ts | 76 | `隐奸` | `it('隐奸 mode1 + 同地点 3 人（他人 1）→ 羞耻/心理 += 50 × (1.0 + 4-1 + 1×0.1) = 204', async () => {` |
| src/plugins/hidden-sex-realtime.test.ts | 76 | `同地点` | `it('隐奸 mode1 + 同地点 3 人（他人 1）→ 羞耻/心理 += 50 × (1.0 + 4-1 + 1×0.1) = 204', async () => {` |
| src/plugins/hidden-sex-realtime.test.ts | 76 | `人（他人` | `it('隐奸 mode1 + 同地点 3 人（他人 1）→ 羞耻/心理 += 50 × (1.0 + 4-1 + 1×0.1) = 204', async () => {` |
| src/plugins/hidden-sex-realtime.test.ts | 76 | `羞耻/心理` | `it('隐奸 mode1 + 同地点 3 人（他人 1）→ 羞耻/心理 += 50 × (1.0 + 4-1 + 1×0.1) = 204', async () => {` |
| src/plugins/hidden-sex-realtime.test.ts | 88 | `隐奸` | `it('隐奸 mode4（半公开）→ 系数 4-4=0 + 他人×0.1 → 50 × 1.1 = 55', async () => {` |
| src/plugins/hidden-sex-realtime.test.ts | 88 | `mode4（半公开）→` | `it('隐奸 mode4（半公开）→ 系数 4-4=0 + 他人×0.1 → 50 × 1.1 = 55', async () => {` |
| src/plugins/hidden-sex-realtime.test.ts | 88 | `系数` | `it('隐奸 mode4（半公开）→ 系数 4-4=0 + 他人×0.1 → 50 × 1.1 = 55', async () => {` |
| src/plugins/hidden-sex-realtime.test.ts | 88 | `他人×0` | `it('隐奸 mode4（半公开）→ 系数 4-4=0 + 他人×0.1 → 50 × 1.1 = 55', async () => {` |
| src/plugins/hidden-sex-realtime.test.ts | 97 | `露出能力等级生效：露出` | `it('露出能力等级生效：露出 lv5（adjust 1.8）→ 50 × (1.8 + 3.1) = 245', async () => {` |
| src/plugins/hidden-sex-realtime.test.ts | 107 | `场景人数` | `it('场景人数 ≤2 → 不结算（无人旁观不刺激）', async () => {` |
| src/plugins/hidden-sex-realtime.test.ts | 107 | `不结算（无人旁观不刺激）` | `it('场景人数 ≤2 → 不结算（无人旁观不刺激）', async () => {` |
| src/plugins/hidden-sex-realtime.test.ts | 119 | `露出持续快感（realtime_settle` | `describe('露出持续快感（realtime_settle.py:610-613）', () => {` |
| src/plugins/hidden-sex-realtime.test.ts | 120 | `露出模式` | `it('露出模式 → 羞耻/心理 += 30 × (1.0 + min(1×0.1,2)) = 33', async () => {` |
| src/plugins/hidden-sex-realtime.test.ts | 120 | `羞耻/心理` | `it('露出模式 → 羞耻/心理 += 30 × (1.0 + min(1×0.1,2)) = 33', async () => {` |
| src/plugins/hidden-sex-realtime.test.ts | 132 | `隐奸绝顶暴露（h:orgasm` | `describe('隐奸绝顶暴露（h:orgasm → 暴露值/成就挂玩家——erArk character_id=0）', () => {` |
| src/plugins/hidden-sex-realtime.test.ts | 132 | `暴露值/成就挂玩家——erArk` | `describe('隐奸绝顶暴露（h:orgasm → 暴露值/成就挂玩家——erArk character_id=0）', () => {` |
| src/plugins/hidden-sex-realtime.test.ts | 133 | `玩家绝顶（隐奸模式）→` | `it('玩家绝顶（隐奸模式）→ 玩家暴露值增加 + 成就记录；NPC 不增加', async () => {` |
| src/plugins/hidden-sex-realtime.test.ts | 133 | `玩家暴露值增加` | `it('玩家绝顶（隐奸模式）→ 玩家暴露值增加 + 成就记录；NPC 不增加', async () => {` |
| src/plugins/hidden-sex-realtime.test.ts | 133 | `成就记录；NPC` | `it('玩家绝顶（隐奸模式）→ 玩家暴露值增加 + 成就记录；NPC 不增加', async () => {` |
| src/plugins/hidden-sex-realtime.test.ts | 133 | `不增加` | `it('玩家绝顶（隐奸模式）→ 玩家暴露值增加 + 成就记录；NPC 不增加', async () => {` |
| src/plugins/hidden-sex-realtime.test.ts | 158 | `他人存在判定修正（instuct_judege` | `describe('他人存在判定修正（instuct_judege.py:247-260）', () => {` |
| src/plugins/hidden-sex-realtime.test.ts | 165 | `类（性交）4` | `it('S 类（性交）4 人场景 + 露出0 → 40+40×2=120 × (1.0-1.6) = -72 → partial', () => {` |
| src/plugins/hidden-sex-realtime.test.ts | 165 | `人场景` | `it('S 类（性交）4 人场景 + 露出0 → 40+40×2=120 × (1.0-1.6) = -72 → partial', () => {` |
| src/plugins/hidden-sex-realtime.test.ts | 165 | `露出0` | `it('S 类（性交）4 人场景 + 露出0 → 40+40×2=120 × (1.0-1.6) = -72 → partial', () => {` |
| src/plugins/hidden-sex-realtime.test.ts | 170 | `性交` | `const result = calcJudge(500, 0, 0, 'npc_1', '性交')` |
| src/plugins/hidden-sex-realtime.test.ts | 176 | `人` | `it('场景 2 人 → 无他人存在修正 → success', () => {` |
| src/plugins/hidden-sex-realtime.test.ts | 176 | `无他人存在修正` | `it('场景 2 人 → 无他人存在修正 → success', () => {` |
| src/plugins/hidden-sex-realtime.test.ts | 180 | `性交` | `const result = calcJudge(500, 0, 0, 'npc_1', '性交')` |
| src/plugins/hidden-sex-realtime.test.ts | 189 | `性交` | `const result = calcJudge(500, 0, 0, 'npc_1', '性交')` |
| src/plugins/hidden-sex-realtime.test.ts | 195 | `群交判定` | `it('群交判定 → 60 档（60+60×2=180 × (1.0-1.6) = -108 → 392 → partial）', () => {` |
| src/plugins/hidden-sex-realtime.test.ts | 195 | `档（60+60×2` | `it('群交判定 → 60 档（60+60×2=180 × (1.0-1.6) = -108 → 392 → partial）', () => {` |
| src/plugins/hidden-sex-realtime.test.ts | 197 | `群交` | `const result = calcJudge(500, 0, 0, 'npc_1', '群交')` |
| src/plugins/instruction-chat.test.ts | 50 | `chat（1004）复刻` | `describe('chat（1004）复刻', () => {` |
| src/plugins/instruction-chat.test.ts | 73 | `测试NPC` | `id: 'npc_1', name: '测试NPC',` |
| src/plugins/instruction-chat.test.ts | 87 | `成功链：全` | `it('成功链：全 7 ID 数值精确（话术0/亲密0/快乐刻印0）', async () => {` |
| src/plugins/instruction-chat.test.ts | 87 | `数值精确（话术0/亲密0/快乐刻印0）` | `it('成功链：全 7 ID 数值精确（话术0/亲密0/快乐刻印0）', async () => {` |
| src/plugins/instruction-chat.test.ts | 117 | `聊了起来` | `expect(narrativeLog.getEntries().some((e: any) => String(e.text).includes('聊了起来'))).toBe(true)` |
| src/plugins/instruction-chat.test.ts | 120 | `失败链：talk_count` | `it('失败链：talk_count > 话术技能+1 → 仅 12 气力扣减，其余不结算', async () => {` |
| src/plugins/instruction-chat.test.ts | 120 | `话术技能+1` | `it('失败链：talk_count > 话术技能+1 → 仅 12 气力扣减，其余不结算', async () => {` |
| src/plugins/instruction-chat.test.ts | 120 | `仅` | `it('失败链：talk_count > 话术技能+1 → 仅 12 气力扣减，其余不结算', async () => {` |
| src/plugins/instruction-chat.test.ts | 120 | `气力扣减，其余不结算` | `it('失败链：talk_count > 话术技能+1 → 仅 12 气力扣减，其余不结算', async () => {` |
| src/plugins/instruction-chat.test.ts | 141 | `时间衰减：同日小时前进` | `it('时间衰减：同日小时前进 → talk_count 减小时差', async () => {` |
| src/plugins/instruction-chat.test.ts | 141 | `减小时差` | `it('时间衰减：同日小时前进 → talk_count 减小时差', async () => {` |
| src/plugins/instruction-chat.test.ts | 155 | `时间衰减：跨天` | `it('时间衰减：跨天 → talk_count 归零', async () => {` |
| src/plugins/instruction-chat.test.ts | 155 | `归零` | `it('时间衰减：跨天 → talk_count 归零', async () => {` |
| src/plugins/instruction-chat.test.ts | 167 | `话术技能门槛：话术5` | `it('话术技能门槛：话术5 → 门槛6 → talk_count=6 仍成功链', async () => {` |
| src/plugins/instruction-chat.test.ts | 167 | `门槛6` | `it('话术技能门槛：话术5 → 门槛6 → talk_count=6 仍成功链', async () => {` |
| src/plugins/instruction-chat.test.ts | 167 | `仍成功链` | `it('话术技能门槛：话术5 → 门槛6 → talk_count=6 仍成功链', async () => {` |
| src/plugins/instruction-chat.test.ts | 183 | `衰减挂整个行动循环：非聊天行动（rest）也衰减` | `it('衰减挂整个行动循环：非聊天行动（rest）也衰减 talk_count（erArk character_behavior.py:413）', async () => {` |
| src/plugins/instruction-chat.test.ts | 196 | `时停中` | `it('时停中 chat：好感/好意/快乐整体冻结，仅对话经验与 talk_count 生效', async () => {` |
| src/plugins/instruction-chat.test.ts | 196 | `chat：好感/好意/快乐整体冻结，仅对话经验与` | `it('时停中 chat：好感/好意/快乐整体冻结，仅对话经验与 talk_count 生效', async () => {` |
| src/plugins/instruction-chat.test.ts | 196 | `生效` | `it('时停中 chat：好感/好意/快乐整体冻结，仅对话经验与 talk_count 生效', async () => {` |
| src/plugins/instruction-chat.test.ts | 214 | `失败链后` | `it('失败链后 talk_time 不更新（501 只在成功链，erArk 同）', async () => {` |
| src/plugins/instruction-chat.test.ts | 214 | `不更新（501` | `it('失败链后 talk_time 不更新（501 只在成功链，erArk 同）', async () => {` |
| src/plugins/instruction-chat.test.ts | 214 | `只在成功链，erArk` | `it('失败链后 talk_time 不更新（501 只在成功链，erArk 同）', async () => {` |
| src/plugins/instruction-chat.test.ts | 214 | `同）` | `it('失败链后 talk_time 不更新（501 只在成功链，erArk 同）', async () => {` |
| src/plugins/instruction-chat.test.ts | 229 | `话术` | `it('话术 1 门槛边界：count=2 成功（2 ≤ 2）、count=3 失败（3 > 2）', async () => {` |
| src/plugins/instruction-chat.test.ts | 229 | `门槛边界：count` | `it('话术 1 门槛边界：count=2 成功（2 ≤ 2）、count=3 失败（3 > 2）', async () => {` |
| src/plugins/instruction-chat.test.ts | 229 | `成功（2` | `it('话术 1 门槛边界：count=2 成功（2 ≤ 2）、count=3 失败（3 > 2）', async () => {` |
| src/plugins/instruction-chat.test.ts | 229 | `失败（3` | `it('话术 1 门槛边界：count=2 成功（2 ≤ 2）、count=3 失败（3 > 2）', async () => {` |
| src/plugins/instruction-chat.test.ts | 245 | `连续` | `it('连续 chat 联动：talk_time 更新后同小时再次 chat 不衰减', async () => {` |
| src/plugins/instruction-chat.test.ts | 245 | `联动：talk_time` | `it('连续 chat 联动：talk_time 更新后同小时再次 chat 不衰减', async () => {` |
| src/plugins/instruction-chat.test.ts | 245 | `更新后同小时再次` | `it('连续 chat 联动：talk_time 更新后同小时再次 chat 不衰减', async () => {` |
| src/plugins/instruction-chat.test.ts | 245 | `不衰减` | `it('连续 chat 联动：talk_time 更新后同小时再次 chat 不衰减', async () => {` |
| src/plugins/instruction-chat.test.ts | 264 | `衰减日回退安全：talk_time` | `it('衰减日回退安全：talk_time.day 异常大于当前 → 归零（存档异常恢复）', async () => {` |
| src/plugins/instruction-chat.test.ts | 264 | `异常大于当前` | `it('衰减日回退安全：talk_time.day 异常大于当前 → 归零（存档异常恢复）', async () => {` |
| src/plugins/instruction-chat.test.ts | 264 | `归零（存档异常恢复）` | `it('衰减日回退安全：talk_time.day 异常大于当前 → 归零（存档异常恢复）', async () => {` |
| src/plugins/instruction-chat.test.ts | 277 | `前提` | `it('前提 NO_TARGET_OR_TARGET_CAN_COOPERATE_OR_IMPRISONMENT_1 行为矩阵', async () => {` |
| src/plugins/instruction-chat.test.ts | 277 | `行为矩阵` | `it('前提 NO_TARGET_OR_TARGET_CAN_COOPERATE_OR_IMPRISONMENT_1 行为矩阵', async () => {` |
| src/plugins/instruction-chat.test.ts | 297 | `自己` | `it('前提查"自己"维度：NOT_H/TIRED_LE_84/HP_G_1 看玩家而非目标（erArk 无 T_ 前缀=自己）', async () => {    const evalPrem = (premises` |
| src/plugins/instruction-chat.test.ts | 323 | `自动注入前提（2026-08-08` | `it('自动注入前提（2026-08-08 erArk 更新）：TIRED_LE_74 边界 + NOT_SHOW/DRUNK 恒 true', () => {` |
| src/plugins/instruction-chat.test.ts | 323 | `更新）：TIRED_LE_74` | `it('自动注入前提（2026-08-08 erArk 更新）：TIRED_LE_74 边界 + NOT_SHOW/DRUNK 恒 true', () => {` |
| src/plugins/instruction-chat.test.ts | 323 | `边界` | `it('自动注入前提（2026-08-08 erArk 更新）：TIRED_LE_74 边界 + NOT_SHOW/DRUNK 恒 true', () => {` |
| src/plugins/instruction-chat.test.ts | 323 | `恒` | `it('自动注入前提（2026-08-08 erArk 更新）：TIRED_LE_74 边界 + NOT_SHOW/DRUNK 恒 true', () => {` |
| src/plugins/instruction-chat.test.ts | 341 | `自动注入前提完整性校验：缺展开前提` | `it('自动注入前提完整性校验：缺展开前提 → warning（SOP §4.1）', () => {` |
| src/plugins/instruction-chat.test.ts | 346 | `测试` | `id: 'auto_prem_check', label: '测试',` |
| src/plugins/instruction-chat.test.ts | 358 | `自动注入前提` | `expect(warnings.some(e => e.message.includes("'chat'") && e.message.includes('自动注入前提'))).toBe(false)` |
| src/plugins/instruction-chat.test.ts | 363 | `整批执行后无` | `it('整批执行后无 error 级错误', () => {` |
| src/plugins/instruction-chat.test.ts | 363 | `级错误` | `it('整批执行后无 error 级错误', () => {` |
| src/plugins/instruction-loader.ts | 34 | `引用了不存在的` | `message: `指令 '${raw.id}' 引用了不存在的 effect_block：'${item}'，该效果被跳过`,` |
| src/plugins/instruction-loader.ts | 35 | `检查` | `suggestion: '检查 [effect_blocks] 中的定义名，或把 effects 写为内联对象',` |
| src/plugins/instruction-loader.ts | 35 | `中的定义名，或把` | `suggestion: '检查 [effect_blocks] 中的定义名，或把 effects 写为内联对象',` |
| src/plugins/instruction-loader.ts | 35 | `写为内联对象` | `suggestion: '检查 [effect_blocks] 中的定义名，或把 effects 写为内联对象',` |
| src/plugins/instruction-loader.ts | 75 | `检查指令` | `suggestion: '检查指令 id 是否与已有指令重复，或字段格式是否正确',` |
| src/plugins/instruction-loader.ts | 75 | `是否与已有指令重复，或字段格式是否正确` | `suggestion: '检查指令 id 是否与已有指令重复，或字段格式是否正确',` |
| src/plugins/instruction-loader.ts | 103 | `对照` | `suggestion: '对照 可用条件属性手册 检查字段路径；location.tags.has_xxx 需要地点定义该 tag',` |
| src/plugins/instruction-loader.ts | 103 | `可用条件属性手册` | `suggestion: '对照 可用条件属性手册 检查字段路径；location.tags.has_xxx 需要地点定义该 tag',` |
| src/plugins/instruction-loader.ts | 103 | `检查字段路径；location` | `suggestion: '对照 可用条件属性手册 检查字段路径；location.tags.has_xxx 需要地点定义该 tag',` |
| src/plugins/instruction-loader.ts | 103 | `需要地点定义该` | `suggestion: '对照 可用条件属性手册 检查字段路径；location.tags.has_xxx 需要地点定义该 tag',` |
| src/plugins/instruction-loader.ts | 124 | `在` | `suggestion: '在 h-core 前提文件注册 handler（语义查 erArk handle_premise_*.py），或移除该前提（SOP §4）',` |
| src/plugins/instruction-loader.ts | 124 | `前提文件注册` | `suggestion: '在 h-core 前提文件注册 handler（语义查 erArk handle_premise_*.py），或移除该前提（SOP §4）',` |
| src/plugins/instruction-loader.ts | 124 | `handler（语义查` | `suggestion: '在 h-core 前提文件注册 handler（语义查 erArk handle_premise_*.py），或移除该前提（SOP §4）',` |
| src/plugins/instruction-loader.ts | 124 | `py），或移除该前提（SOP` | `suggestion: '在 h-core 前提文件注册 handler（语义查 erArk handle_premise_*.py），或移除该前提（SOP §4）',` |
| src/plugins/instruction-loader.ts | 164 | `按` | `suggestion: `按 SOP §4.1 展开 erArk 自动注入的前提（handle_instruct.py:134-152）；erArk 更新后须核对此映射`,` |
| src/plugins/instruction-loader.ts | 164 | `展开` | `suggestion: `按 SOP §4.1 展开 erArk 自动注入的前提（handle_instruct.py:134-152）；erArk 更新后须核对此映射`,` |
| src/plugins/instruction-loader.ts | 164 | `自动注入的前提（handle_instruct` | `suggestion: `按 SOP §4.1 展开 erArk 自动注入的前提（handle_instruct.py:134-152）；erArk 更新后须核对此映射`,` |
| src/plugins/instruction-loader.ts | 164 | `更新后须核对此映射` | `suggestion: `按 SOP §4.1 展开 erArk 自动注入的前提（handle_instruct.py:134-152）；erArk 更新后须核对此映射`,` |
| src/plugins/instruction-loader.ts | 183 | `检查` | `suggestion: '检查 h-config.toml [judge.adjustments]，字段路径须存在于条件手册（含结构路径：talents./first_times./relations. 等）',` |
| src/plugins/instruction-loader.ts | 183 | `adjustments]，字段路径须存在于条件手册（含结构路径：talents` | `suggestion: '检查 h-config.toml [judge.adjustments]，字段路径须存在于条件手册（含结构路径：talents./first_times./relations. 等）',` |
| src/plugins/instruction-loader.ts | 183 | `等）` | `suggestion: '检查 h-config.toml [judge.adjustments]，字段路径须存在于条件手册（含结构路径：talents./first_times./relations. 等）',` |
| src/plugins/instruction-loader.ts | 213 | `写了` | `message: `指令 '${raw.id}' 写了 judge_class='${raw.judge_class}' 但没有 judge_base，judge_class 将被忽略`,` |
| src/plugins/instruction-loader.ts | 214 | `有判定才写` | `suggestion: '有判定才写 judge_base；judge_class 只跟随 judge_base（SOP §6 三问决策）',` |
| src/plugins/instruction-loader.ts | 214 | `只跟随` | `suggestion: '有判定才写 judge_base；judge_class 只跟随 judge_base（SOP §6 三问决策）',` |
| src/plugins/instruction-loader.ts | 214 | `三问决策）` | `suggestion: '有判定才写 judge_base；judge_class 只跟随 judge_base（SOP §6 三问决策）',` |
| src/plugins/instruction-loader.ts | 222 | `必须查` | `suggestion: 'time_cost 必须查 Behavior_Data.csv + handle_instruct.py 后填写（SOP §5），-1 需查 handler 真实值',` |
| src/plugins/instruction-loader.ts | 222 | `后填写（SOP` | `suggestion: 'time_cost 必须查 Behavior_Data.csv + handle_instruct.py 后填写（SOP §5），-1 需查 handler 真实值',` |
| src/plugins/instruction-loader.ts | 222 | `需查` | `suggestion: 'time_cost 必须查 Behavior_Data.csv + handle_instruct.py 后填写（SOP §5），-1 需查 handler 真实值',` |
| src/plugins/instruction-loader.ts | 222 | `真实值` | `suggestion: 'time_cost 必须查 Behavior_Data.csv + handle_instruct.py 后填写（SOP §5），-1 需查 handler 真实值',` |
| src/plugins/inventory-system/index.ts | 109 | `采集` | `label: '采集',` |
| src/plugins/map-system/index.ts | 153 | `无法到达` | `throw new Error(`moveTo 失败：从 '${loc.id}' 无法到达 '${targetLocationId}'`)` |
| src/plugins/map-system/index.ts | 167 | `移动` | `label: '移动',` |
| src/plugins/map-system/index.ts | 185 | `地图` | `narrativeLog.write('地图', 'map', 'map-system', true, {` |
| src/plugins/orgasm-release.test.ts | 40 | `释放与` | `describe('orgasm 释放与 roll_count 压缩（erArk orgasm_settle.py 对齐）', () => {` |
| src/plugins/orgasm-release.test.ts | 40 | `压缩（erArk` | `describe('orgasm 释放与 roll_count 压缩（erArk orgasm_settle.py 对齐）', () => {` |
| src/plugins/orgasm-release.test.ts | 40 | `对齐）` | `describe('orgasm 释放与 roll_count 压缩（erArk orgasm_settle.py 对齐）', () => {` |
| src/plugins/orgasm-release.test.ts | 55 | `测试NPC` | `entitySystem.register('character', 'npc_1', { id: 'npc_1', name: '测试NPC', base: {}, current_location: 'town_sq` |
| src/plugins/orgasm-release.test.ts | 64 | `压缩（解放状态只显示最高程度）` | `describe('roll_count 压缩（解放状态只显示最高程度）', () => {` |
| src/plugins/orgasm-release.test.ts | 79 | `非解放状态：climax` | `it('非解放状态：climax 3 → 3 条事件（每次高潮一条，程度按概率）', () => {` |
| src/plugins/orgasm-release.test.ts | 79 | `条事件（每次高潮一条，程度按概率）` | `it('非解放状态：climax 3 → 3 条事件（每次高潮一条，程度按概率）', () => {` |
| src/plugins/orgasm-release.test.ts | 89 | `解放状态（orgasm_edge` | `it('解放状态（orgasm_edge=2）climax 3 → 仅 1 条超强（感度<6 降为强）', () => {` |
| src/plugins/orgasm-release.test.ts | 89 | `仅` | `it('解放状态（orgasm_edge=2）climax 3 → 仅 1 条超强（感度<6 降为强）', () => {` |
| src/plugins/orgasm-release.test.ts | 89 | `条超强（感度` | `it('解放状态（orgasm_edge=2）climax 3 → 仅 1 条超强（感度<6 降为强）', () => {` |
| src/plugins/orgasm-release.test.ts | 89 | `降为强）` | `it('解放状态（orgasm_edge=2）climax 3 → 仅 1 条超强（感度<6 降为强）', () => {` |
| src/plugins/orgasm-release.test.ts | 98 | `解放状态` | `it('解放状态 climax 3 + 感度 6 → 超强绝顶（degree 3）', () => {` |
| src/plugins/orgasm-release.test.ts | 98 | `感度` | `it('解放状态 climax 3 + 感度 6 → 超强绝顶（degree 3）', () => {` |
| src/plugins/orgasm-release.test.ts | 98 | `超强绝顶（degree` | `it('解放状态 climax 3 + 感度 6 → 超强绝顶（degree 3）', () => {` |
| src/plugins/orgasm-release.test.ts | 105 | `解放状态` | `it('解放状态 climax 2 → 仅 1 条普通程度（roll 1 次，无超强分支）', () => {` |
| src/plugins/orgasm-release.test.ts | 105 | `仅` | `it('解放状态 climax 2 → 仅 1 条普通程度（roll 1 次，无超强分支）', () => {` |
| src/plugins/orgasm-release.test.ts | 105 | `条普通程度（roll` | `it('解放状态 climax 2 → 仅 1 条普通程度（roll 1 次，无超强分支）', () => {` |
| src/plugins/orgasm-release.test.ts | 105 | `次，无超强分支）` | `it('解放状态 climax 2 → 仅 1 条普通程度（roll 1 次，无超强分支）', () => {` |
| src/plugins/orgasm-release.test.ts | 114 | `时停解放（time_stop_release` | `it('时停解放（time_stop_release=true）climax 3 → 1 条超强', () => {` |
| src/plugins/orgasm-release.test.ts | 114 | `条超强` | `it('时停解放（time_stop_release=true）climax 3 → 1 条超强', () => {` |
| src/plugins/orgasm-release.test.ts | 122 | `releaseOrgasmEdge（退出` | `describe('releaseOrgasmEdge（退出 H 释放寸止累计）', () => {` |
| src/plugins/orgasm-release.test.ts | 122 | `释放寸止累计）` | `describe('releaseOrgasmEdge（退出 H 释放寸止累计）', () => {` |
| src/plugins/orgasm-release.test.ts | 123 | `寸止状态` | `it('寸止状态 + 累计 3 → 1 条超强（感度<6 → 强）、计数清空、orgasm_level 不更新', () => {` |
| src/plugins/orgasm-release.test.ts | 123 | `累计` | `it('寸止状态 + 累计 3 → 1 条超强（感度<6 → 强）、计数清空、orgasm_level 不更新', () => {` |
| src/plugins/orgasm-release.test.ts | 123 | `条超强（感度` | `it('寸止状态 + 累计 3 → 1 条超强（感度<6 → 强）、计数清空、orgasm_level 不更新', () => {` |
| src/plugins/orgasm-release.test.ts | 123 | `强）、计数清空、orgasm_level` | `it('寸止状态 + 累计 3 → 1 条超强（感度<6 → 强）、计数清空、orgasm_level 不更新', () => {` |
| src/plugins/orgasm-release.test.ts | 123 | `不更新` | `it('寸止状态 + 累计 3 → 1 条超强（感度<6 → 强）、计数清空、orgasm_level 不更新', () => {` |
| src/plugins/orgasm-release.test.ts | 144 | `未在寸止状态（orgasm_edge` | `it('未在寸止状态（orgasm_edge=0）→ 空结果，无副作用', () => {` |
| src/plugins/orgasm-release.test.ts | 144 | `空结果，无副作用` | `it('未在寸止状态（orgasm_edge=0）→ 空结果，无副作用', () => {` |
| src/plugins/orgasm-release.test.ts | 155 | `集成：end_h` | `it('集成：end_h 退出 H → 寸止累计被释放（日志输出绝顶 + h_state 清理）', async () => {` |
| src/plugins/orgasm-release.test.ts | 155 | `退出` | `it('集成：end_h 退出 H → 寸止累计被释放（日志输出绝顶 + h_state 清理）', async () => {` |
| src/plugins/orgasm-release.test.ts | 155 | `寸止累计被释放（日志输出绝顶` | `it('集成：end_h 退出 H → 寸止累计被释放（日志输出绝顶 + h_state 清理）', async () => {` |
| src/plugins/orgasm-release.test.ts | 155 | `清理）` | `it('集成：end_h 退出 H → 寸止累计被释放（日志输出绝顶 + h_state 清理）', async () => {` |
| src/plugins/orgasm-release.test.ts | 172 | `绝顶` | `expect(logs).toContain('绝顶')` |
| src/plugins/orgasm-release.test.ts | 177 | `releaseTimeStopOrgasm（时停解除释放）` | `describe('releaseTimeStopOrgasm（时停解除释放）', () => {` |
| src/plugins/orgasm-release.test.ts | 178 | `时停累计` | `it('时停累计 3 → 1 条超强、计数清空、time_stop_release 置位', () => {` |
| src/plugins/orgasm-release.test.ts | 178 | `条超强、计数清空、time_stop_release` | `it('时停累计 3 → 1 条超强、计数清空、time_stop_release 置位', () => {` |
| src/plugins/orgasm-release.test.ts | 178 | `置位` | `it('时停累计 3 → 1 条超强、计数清空、time_stop_release 置位', () => {` |
| src/plugins/orgasm-release.test.ts | 197 | `无时停累计` | `it('无时停累计 → 空结果', () => {` |
| src/plugins/orgasm-release.test.ts | 197 | `空结果` | `it('无时停累计 → 空结果', () => {` |
| src/plugins/orgasm-release.test.ts | 207 | `多部位幂修正（erArk` | `describe('judgeOrgasmEdgeSuccess 多部位幂修正（erArk orgasm_settle.py:423-426）', () => {` |
| src/plugins/orgasm-release.test.ts | 208 | `超限` | `it('超限 5：单部位失败率 0.75，四部位失败率 0.9375（success^2 稀释）', () => {` |
| src/plugins/orgasm-release.test.ts | 208 | `5：单部位失败率` | `it('超限 5：单部位失败率 0.75，四部位失败率 0.9375（success^2 稀释）', () => {` |
| src/plugins/orgasm-release.test.ts | 208 | `75，四部位失败率` | `it('超限 5：单部位失败率 0.75，四部位失败率 0.9375（success^2 稀释）', () => {` |
| src/plugins/orgasm-release.test.ts | 208 | `稀释）` | `it('超限 5：单部位失败率 0.75，四部位失败率 0.9375（success^2 稀释）', () => {` |
| src/plugins/orgasm-release.test.ts | 223 | `寸止成功路径` | `describe('寸止成功路径 + orgasm_count 记录（审查补充）', () => {` |
| src/plugins/orgasm-release.test.ts | 223 | `记录（审查补充）` | `describe('寸止成功路径 + orgasm_count 记录（审查补充）', () => {` |
| src/plugins/orgasm-release.test.ts | 238 | `寸止成功：判定一次（快照语义）→` | `it('寸止成功：判定一次（快照语义）→ 计数累计到被结算角色自己', () => {` |
| src/plugins/orgasm-release.test.ts | 238 | `计数累计到被结算角色自己` | `it('寸止成功：判定一次（快照语义）→ 计数累计到被结算角色自己', () => {` |
| src/plugins/orgasm-release.test.ts | 241 | `玩家` | `id: '0', name: '玩家', base: {}, abilities: { 技巧: { level: 5 } },` |
| src/plugins/orgasm-release.test.ts | 254 | `记录：3` | `it('orgasm_count 记录：3 次高潮 → [0]/[1] 各 +3（h-mark/h-group-sex 消费方）', () => {` |
| src/plugins/orgasm-release.test.ts | 254 | `次高潮` | `it('orgasm_count 记录：3 次高潮 → [0]/[1] 各 +3（h-mark/h-group-sex 消费方）', () => {` |
| src/plugins/orgasm-release.test.ts | 254 | `各` | `it('orgasm_count 记录：3 次高潮 → [0]/[1] 各 +3（h-mark/h-group-sex 消费方）', () => {` |
| src/plugins/orgasm-release.test.ts | 254 | `消费方）` | `it('orgasm_count 记录：3 次高潮 → [0]/[1] 各 +3（h-mark/h-group-sex 消费方）', () => {` |
| src/plugins/orgasm-release.test.ts | 264 | `记录：B绝顶喷乳不计入（erArk：独立行为` | `it('orgasm_count 记录：B绝顶喷乳不计入（erArk：独立行为 b_orgasm_to_milk）', () => {` |
| src/plugins/orgasm-release.test.ts | 275 | `分支：preData` | `it('extra 分支：preData>=10 且 extraAdd=0 → 无高潮（不回落等级差）', () => {` |
| src/plugins/orgasm-release.test.ts | 275 | `且` | `it('extra 分支：preData>=10 且 extraAdd=0 → 无高潮（不回落等级差）', () => {` |
| src/plugins/orgasm-release.test.ts | 275 | `无高潮（不回落等级差）` | `it('extra 分支：preData>=10 且 extraAdd=0 → 无高潮（不回落等级差）', () => {` |
| src/plugins/orgasm-release.test.ts | 284 | `分支：pending` | `it('extra 分支：pending 20000 达阈值 → extraAdd 1 → 1 条 extra 高潮', async () => {` |
| src/plugins/orgasm-release.test.ts | 284 | `达阈值` | `it('extra 分支：pending 20000 达阈值 → extraAdd 1 → 1 条 extra 高潮', async () => {` |
| src/plugins/orgasm-release.test.ts | 284 | `条` | `it('extra 分支：pending 20000 达阈值 → extraAdd 1 → 1 条 extra 高潮', async () => {` |
| src/plugins/orgasm-release.test.ts | 284 | `高潮` | `it('extra 分支：pending 20000 达阈值 → extraAdd 1 → 1 条 extra 高潮', async () => {` |
| src/plugins/orgasm-release.test.ts | 297 | `时停释放标志：下一次行动开始重置（对齐` | `it('时停释放标志：下一次行动开始重置（对齐 erArk handle_npc_ai_in_h.py:99）', async () => {` |
| src/plugins/orgasm-release.test.ts | 306 | `日志聚合（h:orgasm` | `describe('handleOrgasmResults 日志聚合（h:orgasm 事件逐条保留）', () => {` |
| src/plugins/orgasm-release.test.ts | 306 | `事件逐条保留）` | `describe('handleOrgasmResults 日志聚合（h:orgasm 事件逐条保留）', () => {` |
| src/plugins/orgasm-release.test.ts | 307 | `同部位` | `it('同部位 3 次小绝顶 → 日志仅 1 条；事件 3 条', async () => {` |
| src/plugins/orgasm-release.test.ts | 307 | `次小绝顶` | `it('同部位 3 次小绝顶 → 日志仅 1 条；事件 3 条', async () => {` |
| src/plugins/orgasm-release.test.ts | 307 | `日志仅` | `it('同部位 3 次小绝顶 → 日志仅 1 条；事件 3 条', async () => {` |
| src/plugins/orgasm-release.test.ts | 307 | `条；事件` | `it('同部位 3 次小绝顶 → 日志仅 1 条；事件 3 条', async () => {` |
| src/plugins/orgasm-release.test.ts | 307 | `条` | `it('同部位 3 次小绝顶 → 日志仅 1 条；事件 3 条', async () => {` |
| src/plugins/orgasm-release.test.ts | 333 | `绝顶附加状态（erArk` | `describe('绝顶附加状态（erArk 二段行为效果：润滑/体力/气力/欲情/快乐/苦痛反感减）', () => {` |
| src/plugins/orgasm-release.test.ts | 333 | `二段行为效果：润滑/体力/气力/欲情/快乐/苦痛反感减）` | `describe('绝顶附加状态（erArk 二段行为效果：润滑/体力/气力/欲情/快乐/苦痛反感减）', () => {` |
| src/plugins/orgasm-release.test.ts | 348 | `档：润滑+300、气力-60、欲情+20、快乐+20（无体力/苦痛减）` | `it('small 档：润滑+300、气力-60、欲情+20、快乐+20（无体力/苦痛减）', () => {` |
| src/plugins/orgasm-release.test.ts | 362 | `档：润滑+300、体力-10、气力-60、欲情+100、快乐+100、苦痛/反感减` | `it('normal 档：润滑+300、体力-10、气力-60、欲情+100、快乐+100、苦痛/反感减', () => {` |
| src/plugins/orgasm-release.test.ts | 379 | `档` | `it('middle 档 tenths=True：欲情当前 100 → +100 基础 + min(300, 10) tenths = +110', () => {` |
| src/plugins/orgasm-release.test.ts | 379 | `True：欲情当前` | `it('middle 档 tenths=True：欲情当前 100 → +100 基础 + min(300, 10) tenths = +110', () => {` |
| src/plugins/orgasm-release.test.ts | 379 | `基础` | `it('middle 档 tenths=True：欲情当前 100 → +100 基础 + min(300, 10) tenths = +110', () => {` |
| src/plugins/orgasm-release.test.ts | 388 | `档（解放≥3` | `it('super 档（解放≥3 + 感度6）：润滑+3000、体力-60、气力-300、欲情/快乐+1000', () => {` |
| src/plugins/orgasm-release.test.ts | 388 | `感度6）：润滑+3000、体力-60、气力-300、欲情/快乐+1000` | `it('super 档（解放≥3 + 感度6）：润滑+3000、体力-60、气力-300、欲情/快乐+1000', () => {` |
| src/plugins/orgasm-release.test.ts | 400 | `润滑无能力系数（欲望等级不影响润滑）+` | `it('润滑无能力系数（欲望等级不影响润滑）+ 欲情吃欲望等级', () => {` |
| src/plugins/orgasm-release.test.ts | 400 | `欲情吃欲望等级` | `it('润滑无能力系数（欲望等级不影响润滑）+ 欲情吃欲望等级', () => {` |
| src/plugins/phase-6-integration.test.ts | 54 | `集成测试` | `describe('Phase 6 集成测试', () => {` |
| src/plugins/phase-6-integration.test.ts | 89 | `初始化角色` | `it('character-system 初始化角色 current_location', () => {` |
| src/plugins/phase-6-integration.test.ts | 96 | `返回正确角色` | `it('character API getCharactersAt 返回正确角色', async () => {` |
| src/plugins/phase-6-integration.test.ts | 101 | `返回当前地点` | `it('map API getCurrentLocation 返回当前地点', async () => {` |
| src/plugins/phase-6-integration.test.ts | 106 | `返回当前地点子区域` | `it('map API getReachable 返回当前地点子区域', async () => {` |
| src/plugins/phase-6-integration.test.ts | 113 | `插件按` | `it('插件按 data_dependencies 顺序加载（character 在 map 之前）', () => {` |
| src/plugins/phase-6-integration.test.ts | 113 | `顺序加载（character` | `it('插件按 data_dependencies 顺序加载（character 在 map 之前）', () => {` |
| src/plugins/phase-6-integration.test.ts | 113 | `在` | `it('插件按 data_dependencies 顺序加载（character 在 map 之前）', () => {` |
| src/plugins/phase-6-integration.test.ts | 113 | `之前）` | `it('插件按 data_dependencies 顺序加载（character 在 map 之前）', () => {` |
| src/plugins/phase-7-integration.test.ts | 7 | `集成测试` | `describe('Phase 7 集成测试', () => {` |
| src/plugins/phase-7-integration.test.ts | 8 | `解析加粗+斜体混合` | `it('text-formatter 解析加粗+斜体混合', () => {` |
| src/plugins/phase-7-integration.test.ts | 9 | `**重要**消息*注意*` | `const result = formatText('**重要**消息*注意*')` |
| src/plugins/phase-7-integration.test.ts | 10 | `重要` | `expect(result.some(s => s.bold && s.text === '重要')).toBe(true)` |
| src/plugins/phase-7-integration.test.ts | 11 | `注意` | `expect(result.some(s => s.italic && s.text === '注意')).toBe(true)` |
| src/plugins/phase-7-integration.test.ts | 14 | `解析` | `it('text-formatter 解析 spoiler（黑框）', () => {` |
| src/plugins/phase-7-integration.test.ts | 14 | `spoiler（黑框）` | `it('text-formatter 解析 spoiler（黑框）', () => {` |
| src/plugins/phase-7-integration.test.ts | 15 | `隐藏内容` | `const result = formatText('||隐藏内容||')` |
| src/plugins/phase-7-integration.test.ts | 17 | `隐藏内容` | `expect(result[0].text).toBe('隐藏内容')` |
| src/plugins/phase-7-integration.test.ts | 20 | `解析颜色` | `it('text-formatter 解析颜色 hex RGB', () => {` |
| src/plugins/phase-7-integration.test.ts | 21 | `红色}}` | `const result = formatText('{{color:#FF0000 红色}}')` |
| src/plugins/phase-7-integration.test.ts | 23 | `红色` | `expect(result[0].text).toBe('红色')` |
| src/plugins/phase-7-integration.test.ts | 26 | `解析颜色含透明度` | `it('text-formatter 解析颜色含透明度', () => {` |
| src/plugins/phase-7-integration.test.ts | 27 | `半透明}}` | `const result = formatText('{{color:#80FF0000 半透明}}')` |
| src/plugins/phase-7-integration.test.ts | 31 | `普通文本无格式标记` | `it('text-formatter 普通文本无格式标记', () => {` |
| src/plugins/phase-7-integration.test.ts | 32 | `这是一段普通文本` | `const result = formatText('这是一段普通文本')` |
| src/plugins/phase-7-integration.test.ts | 34 | `这是一段普通文本` | `expect(result[0].text).toBe('这是一段普通文本')` |
| src/plugins/phase-7-integration.test.ts | 39 | `混合格式分段正确` | `it('text-formatter 混合格式分段正确', () => {` |
| src/plugins/phase-7-integration.test.ts | 40 | `前**中**后` | `const result = formatText('前**中**后')` |
| src/plugins/phase-7-integration.test.ts | 43 | `前` | `expect(result[0].text).toBe('前')` |
| src/plugins/phase-7-integration.test.ts | 45 | `中` | `expect(result[1].text).toBe('中')` |
| src/plugins/phase-h-integration.test.ts | 8 | `集成测试` | `describe('Phase H 集成测试', () => {` |
| src/plugins/phase-h-integration.test.ts | 9 | `查阈值表正确` | `it('getLevel 查阈值表正确', () => {` |
| src/plugins/phase-h-integration.test.ts | 19 | `公式正确` | `it('calcJudge 公式正确', async () => {` |
| src/plugins/phase-h-integration.test.ts | 34 | `基础值返回` | `it('calcFavorability 基础值返回', async () => {` |
| src/plugins/phase-h-integration.test.ts | 41 | `二段结算——状态等级与普通高潮` | `it('orgasm 二段结算——状态等级与普通高潮', async () => {` |
| src/plugins/phase-h-integration.test.ts | 55 | `二段结算——settleOrgasm` | `it('orgasm 二段结算——settleOrgasm 触发绝顶并推进等级', async () => {` |
| src/plugins/phase-h-integration.test.ts | 55 | `触发绝顶并推进等级` | `it('orgasm 二段结算——settleOrgasm 触发绝顶并推进等级', async () => {` |
| src/plugins/phase-h-integration.test.ts | 60 | `测试角色` | `id: 'orgasm_test_1', name: '测试角色',` |
| src/plugins/phase-h-integration.test.ts | 85 | `二段结算——玩家射精欲满触发` | `it('orgasm 二段结算——玩家射精欲满触发 shouldEjaculate 标记', async () => {` |
| src/plugins/phase-h-integration.test.ts | 85 | `标记` | `it('orgasm 二段结算——玩家射精欲满触发 shouldEjaculate 标记', async () => {` |
| src/plugins/phase-h-integration.test.ts | 89 | `玩家` | `id: '0', name: '玩家',` |
| src/plugins/phase-h-integration.test.ts | 99 | `二段结算——射精欲满但精液量≤2` | `it('orgasm 二段结算——射精欲满但精液量≤2 → 无精液高潮（不射精，射精欲归零）', async () => {` |
| src/plugins/phase-h-integration.test.ts | 99 | `无精液高潮（不射精，射精欲归零）` | `it('orgasm 二段结算——射精欲满但精液量≤2 → 无精液高潮（不射精，射精欲归零）', async () => {` |
| src/plugins/phase-h-integration.test.ts | 103 | `玩家` | `id: '0', name: '玩家',` |
| src/plugins/phase-h-integration.test.ts | 116 | `二段结算——pending_orgasm_feel` | `it('orgasm 二段结算——pending_orgasm_feel 累积驱动 extra 高潮', async () => {` |
| src/plugins/phase-h-integration.test.ts | 116 | `累积驱动` | `it('orgasm 二段结算——pending_orgasm_feel 累积驱动 extra 高潮', async () => {` |
| src/plugins/phase-h-integration.test.ts | 116 | `高潮` | `it('orgasm 二段结算——pending_orgasm_feel 累积驱动 extra 高潮', async () => {` |
| src/plugins/phase-h-integration.test.ts | 121 | `测试角色` | `id: 'orgasm_extra_1', name: '测试角色',` |
| src/plugins/phase-h-integration.test.ts | 149 | `二段结算——寸止失败解放重结算` | `it('orgasm 二段结算——寸止失败解放重结算', async () => {` |
| src/plugins/phase-h-integration.test.ts | 155 | `玩家` | `id: '0', name: '玩家',` |
| src/plugins/phase-h-integration.test.ts | 162 | `测试角色` | `id: 'orgasm_edge_1', name: '测试角色',` |
| src/plugins/phase-h-integration.test.ts | 190 | `射精系统——忍耐判定（技巧高时必忍，超出后` | `it('射精系统——忍耐判定（技巧高时必忍，超出后 0.15×超限概率失败）', async () => {` |
| src/plugins/phase-h-integration.test.ts | 190 | `15×超限概率失败）` | `it('射精系统——忍耐判定（技巧高时必忍，超出后 0.15×超限概率失败）', async () => {` |
| src/plugins/phase-h-integration.test.ts | 198 | `射精系统——睡眠额外精液累积（realtime-settle）` | `it('射精系统——睡眠额外精液累积（realtime-settle）', async () => {` |
| src/plugins/phase-h-integration.test.ts | 202 | `玩家` | `id: 'semen_test_1', name: '玩家',` |
| src/plugins/phase-h-integration.test.ts | 216 | `信赖度（复刻` | `it('calcTrust 信赖度（复刻 calculation_trust，common_default.py:752-813）', async () => {` |
| src/plugins/phase-h-integration.test.ts | 232 | `状态值变化` | `it('calcStateChange 状态值变化', async () => {` |
| src/plugins/phase-h-integration.test.ts | 242 | `经验结算` | `it('gainExperience 经验结算', async () => {` |
| src/plugins/phase-h-integration.test.ts | 251 | `射精系统` | `it('射精系统 effect types 注册（需加载插件）', async () => {` |
| src/plugins/phase-h-integration.test.ts | 251 | `注册（需加载插件）` | `it('射精系统 effect types 注册（需加载插件）', async () => {` |
| src/plugins/phase-h-integration.test.ts | 260 | `注册（需加载插件）` | `it('h-core effect types 注册（需加载插件）', async () => {` |
| src/plugins/phase-h-integration.test.ts | 268 | `特殊修正——处女惩罚（L1` | `it('calcJudge judge_class 特殊修正——处女惩罚（L1.6 §10.4）', async () => {` |
| src/plugins/phase-h-integration.test.ts | 277 | `处女测试` | `id: 'judge_test_virgin', name: '处女测试',` |
| src/plugins/phase-h-integration.test.ts | 282 | `已破测试` | `id: 'judge_test_broken', name: '已破测试',` |
| src/plugins/phase-h-integration.test.ts | 288 | `性无知测试` | `id: 'judge_test_ignorant', name: '性无知测试',` |
| src/plugins/phase-h-integration.test.ts | 293 | `性交` | `const virgin = calcJudge(500, 0, 0, 'judge_test_virgin', '性交')` |
| src/plugins/phase-h-integration.test.ts | 299 | `性交` | `expect(calcJudge(500, 0, 0, 'judge_test_broken', '性交').success).toBe(true)` |
| src/plugins/phase-h-integration.test.ts | 301 | `性交` | `expect(calcJudge(500, 0, 0, 'judge_test_ignorant', '性交').success).toBe(true)` |
| src/plugins/phase-h-integration.test.ts | 303 | `亲吻` | `const kiss = calcJudge(250, 0, 0, 'judge_test_virgin', '亲吻')` |
| src/plugins/phase-h-integration.test.ts | 306 | `亲吻` | `expect(calcJudge(250, 0, 0, 'judge_test_virgin', '亲吻').success).toBe(true)` |
| src/plugins/phase-h-integration.test.ts | 311 | `多目标最坏者胜出（retreated` | `it('mergeJudgeResult 多目标最坏者胜出（retreated > partial > success）', async () => {` |
| src/plugins/phase-h-integration.test.ts | 327 | `天赋个性修正只对` | `it('calcJudge 天赋个性修正只对 S 类判定生效（亲吻 D 类不吃，erArk 162-178 行）', async () => {    const { modLoader } = await import` |
| src/plugins/phase-h-integration.test.ts | 327 | `类判定生效（亲吻` | `it('calcJudge 天赋个性修正只对 S 类判定生效（亲吻 D 类不吃，erArk 162-178 行）', async () => {    const { modLoader } = await import` |
| src/plugins/phase-h-integration.test.ts | 327 | `类不吃，erArk` | `it('calcJudge 天赋个性修正只对 S 类判定生效（亲吻 D 类不吃，erArk 162-178 行）', async () => {    const { modLoader } = await import` |
| src/plugins/phase-h-integration.test.ts | 327 | `行）` | `it('calcJudge 天赋个性修正只对 S 类判定生效（亲吻 D 类不吃，erArk 162-178 行）', async () => {    const { modLoader } = await import` |
| src/plugins/phase-h-integration.test.ts | 336 | `D类测试` | `id: 'judge_dtype', name: 'D类测试',` |
| src/plugins/phase-h-integration.test.ts | 339 | `亲吻` | `const kissD = calcJudge(250, 0, 0, 'judge_dtype', '亲吻')` |
| src/plugins/phase-h-integration.test.ts | 347 | `S类测试` | `id: 'judge_stype', name: 'S类测试',` |
| src/plugins/phase-h-integration.test.ts | 350 | `口交` | `const oralS = calcJudge(451, 0, 0, 'judge_stype', '口交')` |
| src/plugins/phase-h-integration.test.ts | 356 | `指令加载器——无` | `it('指令加载器——无 h_ 前缀、premises 独立字段、judge_check 自动注入', async () => {` |
| src/plugins/phase-h-integration.test.ts | 356 | `前缀、premises` | `it('指令加载器——无 h_ 前缀、premises 独立字段、judge_check 自动注入', async () => {` |
| src/plugins/phase-h-integration.test.ts | 356 | `独立字段、judge_check` | `it('指令加载器——无 h_ 前缀、premises 独立字段、judge_check 自动注入', async () => {` |
| src/plugins/phase-h-integration.test.ts | 356 | `自动注入` | `it('指令加载器——无 h_ 前缀、premises 独立字段、judge_check 自动注入', async () => {` |
| src/plugins/phase-h-integration.test.ts | 380 | `性交` | `{ id: 'x', label: 'x', type: 'sex', judge_base: 500, judge_class: '性交' },` |
| src/plugins/phase-h-integration.test.ts | 383 | `性交` | `expect(injected[0]).toEqual({ type: 'judge_check', params: { base: 500, judge_class: '性交' } })` |
| src/plugins/phase-h-integration.test.ts | 395 | `亲吻` | `expect(judgeCmd!.effects?.[0]).toEqual({ type: 'judge_check', params: { base: 200, judge_class: '亲吻' } })` |
| src/plugins/phase-h-integration.test.ts | 401 | `引用未注册字段` | `it('validateInstructionData——condition 引用未注册字段 → error + 注销该指令', async () => {` |
| src/plugins/phase-h-integration.test.ts | 401 | `注销该指令` | `it('validateInstructionData——condition 引用未注册字段 → error + 注销该指令', async () => {` |
| src/plugins/phase-h-integration.test.ts | 418 | `坏条件指令` | `id: 'bad_cond_cmd', label: '坏条件指令', type: 'daily', time_cost: 10,` |
| src/plugins/phase-h-integration.test.ts | 437 | `未注册前提` | `expect(errors.some(e => e.severity === 'warning' && e.message.includes('未注册前提'))).toBe(false)` |
| src/plugins/phase-h-integration.test.ts | 442 | `指令注册单条失败（id` | `it('指令注册单条失败（id 重复）→ 报告 + 跳过该条，不拖垮整批', async () => {` |
| src/plugins/phase-h-integration.test.ts | 442 | `重复）→` | `it('指令注册单条失败（id 重复）→ 报告 + 跳过该条，不拖垮整批', async () => {` |
| src/plugins/phase-h-integration.test.ts | 442 | `报告` | `it('指令注册单条失败（id 重复）→ 报告 + 跳过该条，不拖垮整批', async () => {` |
| src/plugins/phase-h-integration.test.ts | 442 | `跳过该条，不拖垮整批` | `it('指令注册单条失败（id 重复）→ 报告 + 跳过该条，不拖垮整批', async () => {` |
| src/plugins/phase-h-integration.test.ts | 455 | `假` | `id: 'rest', label: '假 rest', group: 'character_commands',` |
| src/plugins/phase-h-integration.test.ts | 461 | `注册失败` | `expect(errors.some(e => e.message.includes('rest') && e.message.includes('注册失败'))).toBe(true)` |
| src/plugins/phase-h-integration.test.ts | 469 | `端到端——judge` | `it('端到端——judge 退缩时 settle_* 跳过（effect-system + h-core 全链路）', async () => {` |
| src/plugins/phase-h-integration.test.ts | 469 | `退缩时` | `it('端到端——judge 退缩时 settle_* 跳过（effect-system + h-core 全链路）', async () => {` |
| src/plugins/phase-h-integration.test.ts | 469 | `跳过（effect-system` | `it('端到端——judge 退缩时 settle_* 跳过（effect-system + h-core 全链路）', async () => {` |
| src/plugins/phase-h-integration.test.ts | 469 | `全链路）` | `it('端到端——judge 退缩时 settle_* 跳过（effect-system + h-core 全链路）', async () => {` |
| src/plugins/phase-h-integration.test.ts | 490 | `E2E目标` | `id: 'e2e_target', name: 'E2E目标',` |
| src/plugins/phase-h-integration.test.ts | 497 | `E2E亲吻` | `id: 'e2e_kiss', label: 'E2E亲吻', group: 'character_commands', modes: ['exploration'],` |
| src/plugins/phase-h-integration.test.ts | 500 | `亲吻` | `{ type: 'judge_check', params: { base: 250, judge_class: '亲吻' } },` |
| src/plugins/phase-h-integration.test.ts | 520 | `退缩` | `expect(narrativeLog.getEntries().some((e: any) => String(e.text).includes('退缩'))).toBe(true)` |
| src/plugins/premise-instruct.test.ts | 24 | `前提语义矩阵` | `describe('premise-instruct 前提语义矩阵', () => {` |
| src/plugins/premise-instruct.test.ts | 36 | `测试NPC` | `entitySystem.register('character', 'npc_1', { id: 'npc_1', name: '测试NPC', base: {}, current_location: 'town_sq` |
| src/plugins/premise-instruct.test.ts | 49 | `档位矩阵：OFF` | `it('SEX_TOY 档位矩阵：OFF=0 / WEAK=1 / MIDDLE=2 / STRONG=3（erArk 精确语义）', () => {` |
| src/plugins/premise-instruct.test.ts | 49 | `精确语义）` | `it('SEX_TOY 档位矩阵：OFF=0 / WEAK=1 / MIDDLE=2 / STRONG=3（erArk 精确语义）', () => {` |
| src/plugins/premise-instruct.test.ts | 72 | `无目标` | `it('无目标 → 全部 false（getTarget 语义）', () => {` |
| src/plugins/premise-instruct.test.ts | 72 | `全部` | `it('无目标 → 全部 false（getTarget 语义）', () => {` |
| src/plugins/premise-instruct.test.ts | 72 | `语义）` | `it('无目标 → 全部 false（getTarget 语义）', () => {` |
| src/plugins/talk-common-behavior.test.ts | 25 | `行为地文（talk_common` | `describe('T3 行为地文（talk_common 组合 + 混合率）', () => {` |
| src/plugins/talk-common-behavior.test.ts | 25 | `组合` | `describe('T3 行为地文（talk_common 组合 + 混合率）', () => {` |
| src/plugins/talk-common-behavior.test.ts | 25 | `混合率）` | `describe('T3 行为地文（talk_common 组合 + 混合率）', () => {` |
| src/plugins/talk-common-behavior.test.ts | 36 | `测试NPC` | `entitySystem.register('character', 'npc_1', { id: 'npc_1', name: '测试NPC', base: { 体力: 80, 疲劳度: 0 }, current_lo` |
| src/plugins/talk-common-behavior.test.ts | 69 | `三段组合（动作段间换行）` | `it('getBehaviorText：A+B+C 三段组合（动作段间换行）', async () => {` |
| src/plugins/talk-common-behavior.test.ts | 79 | `混合率命中：weight` | `it('混合率命中：weight<100 口上按概率替换为行为地文', async () => {` |
| src/plugins/talk-common-behavior.test.ts | 79 | `口上按概率替换为行为地文` | `it('混合率命中：weight<100 口上按概率替换为行为地文', async () => {` |
| src/plugins/talk-common-behavior.test.ts | 81 | `测试口上台词` | `mod.sceneDialogue.push({ scene: 'penis_in_vagina', text: '测试口上台词', weight: 1 })` |
| src/plugins/talk-common-behavior.test.ts | 89 | `测试口上台词` | `expect(texts).not.toContain('测试口上台词')` |
| src/plugins/talk-common-behavior.test.ts | 97 | `混合率不命中：输出口上原文` | `it('混合率不命中：输出口上原文', async () => {` |
| src/plugins/talk-common-behavior.test.ts | 99 | `混合不中台词` | `mod.sceneDialogue.push({ scene: 'penis_in_vagina_miss', text: '混合不中台词' })` |
| src/plugins/talk-common-behavior.test.ts | 105 | `混合不中台词` | `expect(texts).toContain('混合不中台词')` |
| src/plugins/talk-common-behavior.test.ts | 108 | `保护：高权重口上不被地文替换（erArk` | `it('weight≥100 保护：高权重口上不被地文替换（erArk talk.py:246）', async () => {` |
| src/plugins/talk-common-behavior.test.ts | 110 | `重要台词` | `mod.sceneDialogue.push({ scene: 'penis_in_vagina', text: '重要台词', weight: 100 })` |
| src/plugins/talk-common-behavior.test.ts | 116 | `重要台词` | `expect(texts).toContain('重要台词')` |
| src/plugins/talk-common-behavior.test.ts | 119 | `短词池合并：vagina_s` | `it('common_s 短词池合并：vagina_s 的 A 段候选并入 common_s（erArk talk.py:662-665）', async () => {` |
| src/plugins/talk-common-behavior.test.ts | 119 | `的` | `it('common_s 短词池合并：vagina_s 的 A 段候选并入 common_s（erArk talk.py:662-665）', async () => {` |
| src/plugins/talk-common-behavior.test.ts | 119 | `段候选并入` | `it('common_s 短词池合并：vagina_s 的 A 段候选并入 common_s（erArk talk.py:662-665）', async () => {` |
| src/plugins/talk-common-behavior.test.ts | 134 | `无意识过滤：动作类地文被过滤、部位类地文保留（erArk` | `it('无意识过滤：动作类地文被过滤、部位类地文保留（erArk :683-687）', async () => {` |
| src/plugins/talk-common-behavior.test.ts | 146 | `新模块验证（2026-08-08` | `it('新模块验证（2026-08-08 导入）：w_orgasm 组合 + clitoris 部位/短词', async () => {` |
| src/plugins/talk-common-behavior.test.ts | 146 | `导入）：w_orgasm` | `it('新模块验证（2026-08-08 导入）：w_orgasm 组合 + clitoris 部位/短词', async () => {` |
| src/plugins/talk-common-behavior.test.ts | 146 | `组合` | `it('新模块验证（2026-08-08 导入）：w_orgasm 组合 + clitoris 部位/短词', async () => {` |
| src/plugins/talk-common-behavior.test.ts | 146 | `部位/短词` | `it('新模块验证（2026-08-08 导入）：w_orgasm 组合 + clitoris 部位/短词', async () => {` |
| src/plugins/talk-common-system/engine.test.ts | 17 | `阴道描述` | `description: '阴道描述',` |
| src/plugins/talk-common-system/engine.test.ts | 19 | `湿滑的{vagina_s}` | `{ context: '湿滑的{vagina_s}', conditions: 'premises:high_1' },` |
| src/plugins/talk-common-system/engine.test.ts | 20 | `粉嫩的{vagina_s}` | `{ context: '粉嫩的{vagina_s}', conditions: 'premises:high_1' },` |
| src/plugins/talk-common-system/engine.test.ts | 25 | `阴茎描述` | `description: '阴茎描述',` |
| src/plugins/talk-common-system/engine.test.ts | 27 | `粗大的肉棒` | `{ context: '粗大的肉棒', conditions: 'premises:high_1' },` |
| src/plugins/talk-common-system/engine.test.ts | 28 | `坚挺的性器` | `{ context: '坚挺的性器', conditions: 'premises:high_1' },` |
| src/plugins/talk-common-system/engine.test.ts | 33 | `阴道短词` | `description: '阴道短词',` |
| src/plugins/talk-common-system/engine.test.ts | 35 | `温热的` | `{ part: 'A', context: '温热的', conditions: 'premises:high_1' },` |
| src/plugins/talk-common-system/engine.test.ts | 36 | `湿润的` | `{ part: 'A', context: '湿润的', conditions: 'premises:high_1' },` |
| src/plugins/talk-common-system/engine.test.ts | 37 | `小穴` | `{ part: 'B', context: '小穴', conditions: 'premises:high_1' },` |
| src/plugins/talk-common-system/engine.test.ts | 64 | `粗大的肉棒` | `expect(['粗大的肉棒', '坚挺的性器']).toContain(result)` |
| src/plugins/talk-common-system/engine.test.ts | 64 | `坚挺的性器` | `expect(['粗大的肉棒', '坚挺的性器']).toContain(result)` |
| src/plugins/talk-common-system/engine.test.ts | 76 | `她的{penis}插入我的{vagina}` | `const result = engine.replaceAll('她的{penis}插入我的{vagina}', null)` |
| src/plugins/talk-common-system/engine.test.ts | 83 | `她的{vagina}` | `const result = engine.replaceAll('她的{vagina}', null)` |
| src/plugins/talk-common-system/engine.test.ts | 90 | `{penis}和{unknown_var}` | `const result = engine.replaceAll('{penis}和{unknown_var}', null)` |
| src/plugins/talk-common-system/engine.test.ts | 99 | `覆盖阴茎` | `description: 'mod 覆盖阴茎',` |
| src/plugins/talk-common-system/engine.test.ts | 101 | `MOD版肉棒` | `{ context: 'MOD版肉棒', conditions: '' },` |
| src/plugins/talk-common-system/engine.test.ts | 106 | `MOD版肉棒` | `expect(engine.getText('penis', null)).toBe('MOD版肉棒')` |
| src/plugins/talk-common-system/engine.test.ts | 117 | `看不到我` | `{ context: '看不到我', conditions: 'premises:ALWAYS_FALSE' },` |
| src/ui/integration.test.ts | 15 | `集成测试` | `describe('UI 集成测试', () => {` |
| src/ui/integration.test.ts | 23 | `原生指令注册后可查询` | `it('原生指令注册后可查询', () => {` |
| src/ui/integration.test.ts | 35 | `填充` | `it('game-store 填充 mock 数据后状态正确', () => {` |
| src/ui/integration.test.ts | 35 | `数据后状态正确` | `it('game-store 填充 mock 数据后状态正确', () => {` |
| src/ui/integration.test.ts | 44 | `玩家` | `expect(gameStore.player?.name).toBe('玩家')` |
| src/ui/integration.test.ts | 45 | `城镇广场` | `expect(gameStore.location?.name).toBe('城镇广场')` |
| src/ui/integration.test.ts | 51 | `选择角色后` | `it('ui-store 选择角色后 hasSelection 为 true', () => {` |
| src/ui/integration.test.ts | 51 | `为` | `it('ui-store 选择角色后 hasSelection 为 true', () => {` |
| src/ui/integration.test.ts | 60 | `指令执行包裹` | `it('指令执行包裹 EXECUTING 状态', async () => {` |
| src/ui/integration.test.ts | 60 | `状态` | `it('指令执行包裹 EXECUTING 状态', async () => {` |
| src/ui/integration.test.ts | 78 | `模式栈切换——daily_menu` | `it('模式栈切换——daily_menu 触发', () => {` |
| src/ui/integration.test.ts | 78 | `触发` | `it('模式栈切换——daily_menu 触发', () => {` |
| src/ui/integration.test.ts | 87 | `状态切换` | `it('EXECUTING 状态切换', () => {` |
| src/ui/integration.test.ts | 96 | `折叠状态管理` | `it('折叠状态管理', () => {` |
| src/ui/integration.test.ts | 103 | `指令编号映射——getByMode` | `it('指令编号映射——getByMode 返回 Act_COM', () => {` |
| src/ui/integration.test.ts | 103 | `返回` | `it('指令编号映射——getByMode 返回 Act_COM', () => {` |
| src/ui/integration.test.ts | 111 | `流程` | `it('narrativeLog write + addLogEntry 流程', () => {` |
| src/ui/integration.test.ts | 116 | `测试文本` | `text: '测试文本',` |
| src/ui/integration.test.ts | 121 | `测试文本` | `expect(gameStore.narrativeLogEntries[0].text).toBe('测试文本')` |
| src/ui/integration.test.ts | 124 | `叙事链：narrativeLog` | `it('bridge 叙事链：narrativeLog.write → eventBus → bridge → gameStore.addLogEntry', async () => {` |
| src/ui/integration.test.ts | 141 | `叙事测试` | `narrativeLog.write('bridge 叙事测试', 'dialogue', 'test')` |
| src/ui/integration.test.ts | 144 | `叙事测试` | `expect(gameStore.narrativeLogEntries.some(e => e.text === 'bridge 叙事测试')).toBe(true)` |
| src/ui/integration.test.ts | 149 | `清除所有原生指令` | `it('unregisterNativeCommands 清除所有原生指令', () => {` |
| src/ui/native-commands.ts | 14 | `能力显示` | `label: '能力显示(主角)',` |
| src/ui/native-commands.ts | 14 | `主角` | `label: '能力显示(主角)',` |
| src/ui/native-commands.ts | 28 | `能力显示` | `label: '能力显示',` |
| src/ui/native-commands.ts | 48 | `@测试：跳到明天` | `label: '@测试：跳到明天',` |
| src/ui/native-commands.ts | 59 | `时间跳到第二天` | `text: '时间跳到第二天...',` |
| src/ui/native-commands.ts | 80 | `手动存档` | `await saveGame('manual', uiStore.toSaveData(), '手动存档')` |
| src/ui/native-commands.ts | 102 | `无存档可读` | `useGameStore().addLogEntry({ id: `load-${Date.now()}`, text: '无存档可读', type: 'system', source: 'native' })` |
| src/ui/native-commands.ts | 119 | `选项` | `label: '选项',` |
| src/ui/native-commands.ts | 132 | `日志` | `label: '日志',` |
| src/ui/native-commands.ts | 145 | `@查看属性` | `{ id: '@attrs', label: '@查看属性', handler: () => {` |
| src/ui/native-commands.ts | 147 | `属性查看功能开发中` | `gs.addLogEntry({ id: `@attrs-${Date.now()}`, text: `属性查看功能开发中`, type: 'system', source: 'native' })` |
| src/ui/native-commands.ts | 149 | `@设置属性` | `{ id: '@setattr', label: '@设置属性', handler: () => {` |
| src/ui/native-commands.ts | 150 | `属性名` | `useGameStore().addLogEntry({ id: `@set-${Date.now()}`, text: `@setattr 属性名 值`, type: 'system', source: 'native` |
| src/ui/native-commands.ts | 150 | `值` | `useGameStore().addLogEntry({ id: `@set-${Date.now()}`, text: `@setattr 属性名 值`, type: 'system', source: 'native` |
| src/ui/native-commands.ts | 152 | `@传送` | `{ id: '@teleport', label: '@传送', handler: () => {` |
| src/ui/native-commands.ts | 153 | `地点ID` | `useGameStore().addLogEntry({ id: `@tel-${Date.now()}`, text: `@teleport 地点ID`, type: 'system', source: 'native` |
| src/ui/native-commands.ts | 155 | `@生成角色` | `{ id: '@spawn', label: '@生成角色', handler: () => {` |
| src/ui/native-commands.ts | 156 | `模板ID` | `useGameStore().addLogEntry({ id: `@sp-${Date.now()}`, text: `@spawn 模板ID 地点ID`, type: 'system', source: 'nativ` |
| src/ui/native-commands.ts | 156 | `地点ID` | `useGameStore().addLogEntry({ id: `@sp-${Date.now()}`, text: `@spawn 模板ID 地点ID`, type: 'system', source: 'nativ` |
| src/ui/native-commands.ts | 158 | `@添加物品` | `{ id: '@additem', label: '@添加物品', handler: () => {` |
| src/ui/native-commands.ts | 159 | `物品ID` | `useGameStore().addLogEntry({ id: `@ai-${Date.now()}`, text: `@additem 物品ID 数量`, type: 'system', source: 'nativ` |
| src/ui/native-commands.ts | 159 | `数量` | `useGameStore().addLogEntry({ id: `@ai-${Date.now()}`, text: `@additem 物品ID 数量`, type: 'system', source: 'nativ` |
| src/ui/native-commands.ts | 161 | `@开始任务` | `{ id: '@startquest', label: '@开始任务', handler: () => {` |
| src/ui/native-commands.ts | 162 | `任务ID` | `useGameStore().addLogEntry({ id: `@sq-${Date.now()}`, text: `@startquest 任务ID`, type: 'system', source: 'nativ` |
| src/ui/native-commands.ts | 164 | `@查看错误` | `{ id: '@errors', label: '@查看错误', handler: () => {` |
| src/ui/native-commands.ts | 165 | `查看控制台错误` | `useGameStore().addLogEntry({ id: `@err-${Date.now()}`, text: `查看控制台错误`, type: 'system', source: 'native' })` |
| src/ui/native-commands.ts | 167 | `@帮助` | `{ id: '@help', label: '@帮助', handler: () => {` |
| src/ui/native-commands.ts | 168 | `@命令列表:` | `useGameStore().addLogEntry({ id: `@hlp-${Date.now()}`, text: `@命令列表: @attrs/@setattr/@teleport/@spawn/@additem` |
| src/ui/native-commands.ts | 170 | `@测试战斗` | `{ id: '@testcombat', label: '@测试战斗', handler: async () => {` |
| src/ui/native-commands.ts | 173 | `请先选中一个角色` | `useGameStore().addLogEntry({ id: `@tc-${Date.now()}`, text: `请先选中一个角色`, type: 'system', source: 'native' })` |
| src/ui/slots/slot-registry.test.ts | 8 | `城镇` | `location: { id: 'town', name: '城镇', parent: null, type: 'building', tags: ['has_shop'] },` |
| src/ui/slots/slot-registry.test.ts | 30 | `基本注册` | `it('register/getItems 基本注册', () => {` |
| src/ui/slots/slot-registry.test.ts | 37 | `按` | `it('getItems 按 priority 升序', () => {` |
| src/ui/slots/slot-registry.test.ts | 37 | `升序` | `it('getItems 按 priority 升序', () => {` |
| src/ui/slots/slot-registry.test.ts | 45 | `不满足时过滤掉` | `it('condition 不满足时过滤掉', () => {` |
| src/ui/slots/slot-registry.test.ts | 53 | `始终显示` | `it('无 condition 始终显示', () => {` |
| src/ui/slots/slot-registry.test.ts | 59 | `同名` | `it('同名 slot + 同 id 重复注册被拒绝', () => {` |
| src/ui/slots/slot-registry.test.ts | 59 | `同` | `it('同名 slot + 同 id 重复注册被拒绝', () => {` |
| src/ui/slots/slot-registry.test.ts | 59 | `重复注册被拒绝` | `it('同名 slot + 同 id 重复注册被拒绝', () => {` |
| src/ui/slots/slot-registry.test.ts | 64 | `不同` | `it('不同 slot 同 id 允许', () => {` |
| src/ui/slots/slot-registry.test.ts | 64 | `同` | `it('不同 slot 同 id 允许', () => {` |
| src/ui/slots/slot-registry.test.ts | 64 | `允许` | `it('不同 slot 同 id 允许', () => {` |
| src/ui/slots/slot-registry.test.ts | 69 | `移除` | `it('unregister 移除', () => {` |
| src/ui/slots/slot-registry.test.ts | 75 | `清空所有` | `it('clear 清空所有', () => {` |
| src/ui/slots/slot-registry.test.ts | 82 | `返回所有插槽名` | `it('getSlotNames 返回所有插槽名', () => {` |
| src/ui/slots/slot-registry.test.ts | 88 | `不存在的插槽返回空数组` | `it('不存在的插槽返回空数组', () => {` |
| src/ui/slots/slot-registry.ts | 21 | `已有` | ``SlotRegistry: 插槽 '${slotName}' 已有 id='${item.id}' 的项，重复注册被拒绝`,` |
| src/ui/stores/game-store.test.ts | 11 | `栈行为` | `it('pushMode/popMode 栈行为', () => {` |
| src/ui/stores/game-store.test.ts | 25 | `切换` | `it('executionState 切换', () => {` |
| src/ui/stores/game-store.test.ts | 36 | `超过` | `it('addLogEntry 超过 1000 条淘汰最旧', () => {` |
| src/ui/stores/game-store.test.ts | 36 | `条淘汰最旧` | `it('addLogEntry 超过 1000 条淘汰最旧', () => {` |
| src/ui/stores/game-store.test.ts | 49 | `地图` | `store.addLogEntry({ id: 'map-1', text: '地图', type: 'map', interactive: true })` |
| src/ui/stores/game-store.test.ts | 63 | `清空所有状态` | `it('reset 清空所有状态', () => {` |
| src/ui/stores/game-store.test.ts | 65 | `玩家` | `store.setPlayer({ id: 'player', name: '玩家' })` |
| src/ui/stores/game-store.ts | 52 | `晴` | `const DEFAULT_WEATHER: WeatherData = { name: '晴', temperature: 20 }` |
| src/ui/stores/mock-data.ts | 10 | `玩家` | `name: '玩家',` |
| src/ui/stores/mock-data.ts | 13 | `布衣` | `equipment: { upper: '布衣', lower: '长裤' },` |
| src/ui/stores/mock-data.ts | 13 | `长裤` | `equipment: { upper: '布衣', lower: '长裤' },` |
| src/ui/stores/mock-data.ts | 19 | `酒馆老板` | `name: '酒馆老板',` |
| src/ui/stores/mock-data.ts | 24 | `布衣` | `equipment: { upper: '布衣', lower: '长裤' },` |
| src/ui/stores/mock-data.ts | 24 | `长裤` | `equipment: { upper: '布衣', lower: '长裤' },` |
| src/ui/stores/mock-data.ts | 30 | `卫兵` | `name: '卫兵',` |
| src/ui/stores/mock-data.ts | 35 | `布衣` | `equipment: { upper: '布衣', lower: '长裤' },` |
| src/ui/stores/mock-data.ts | 35 | `长裤` | `equipment: { upper: '布衣', lower: '长裤' },` |
| src/ui/stores/mock-data.ts | 41 | `城镇广场` | `name: '城镇广场',` |
| src/ui/stores/mock-data.ts | 49 | `酒馆` | `name: '酒馆',` |
| src/ui/stores/mock-data.ts | 61 | `一月` | `month_names: ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'],` |
| src/ui/stores/mock-data.ts | 61 | `二月` | `month_names: ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'],` |
| src/ui/stores/mock-data.ts | 61 | `三月` | `month_names: ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'],` |
| src/ui/stores/mock-data.ts | 61 | `四月` | `month_names: ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'],` |
| src/ui/stores/mock-data.ts | 61 | `五月` | `month_names: ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'],` |
| src/ui/stores/mock-data.ts | 61 | `六月` | `month_names: ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'],` |
| src/ui/stores/mock-data.ts | 61 | `七月` | `month_names: ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'],` |
| src/ui/stores/mock-data.ts | 61 | `八月` | `month_names: ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'],` |
| src/ui/stores/mock-data.ts | 61 | `九月` | `month_names: ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'],` |
| src/ui/stores/mock-data.ts | 61 | `十月` | `month_names: ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'],` |
| src/ui/stores/mock-data.ts | 61 | `十一月` | `month_names: ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'],` |
| src/ui/stores/mock-data.ts | 61 | `十二月` | `month_names: ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'],` |
| src/ui/stores/mock-data.ts | 62 | `日` | `weekday_names: ['日', '一', '二', '三', '四', '五', '六'],` |
| src/ui/stores/mock-data.ts | 62 | `一` | `weekday_names: ['日', '一', '二', '三', '四', '五', '六'],` |
| src/ui/stores/mock-data.ts | 62 | `二` | `weekday_names: ['日', '一', '二', '三', '四', '五', '六'],` |
| src/ui/stores/mock-data.ts | 62 | `三` | `weekday_names: ['日', '一', '二', '三', '四', '五', '六'],` |
| src/ui/stores/mock-data.ts | 62 | `四` | `weekday_names: ['日', '一', '二', '三', '四', '五', '六'],` |
| src/ui/stores/mock-data.ts | 62 | `五` | `weekday_names: ['日', '一', '二', '三', '四', '五', '六'],` |
| src/ui/stores/mock-data.ts | 62 | `六` | `weekday_names: ['日', '一', '二', '三', '四', '五', '六'],` |
| src/ui/stores/mock-data.ts | 63 | `子` | `hour_names: ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'],` |
| src/ui/stores/mock-data.ts | 63 | `丑` | `hour_names: ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'],` |
| src/ui/stores/mock-data.ts | 63 | `寅` | `hour_names: ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'],` |
| src/ui/stores/mock-data.ts | 63 | `卯` | `hour_names: ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'],` |
| src/ui/stores/mock-data.ts | 63 | `辰` | `hour_names: ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'],` |
| src/ui/stores/mock-data.ts | 63 | `巳` | `hour_names: ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'],` |
| src/ui/stores/mock-data.ts | 63 | `午` | `hour_names: ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'],` |
| src/ui/stores/mock-data.ts | 63 | `未` | `hour_names: ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'],` |
| src/ui/stores/mock-data.ts | 63 | `申` | `hour_names: ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'],` |
| src/ui/stores/mock-data.ts | 63 | `酉` | `hour_names: ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'],` |
| src/ui/stores/mock-data.ts | 63 | `戌` | `hour_names: ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'],` |
| src/ui/stores/mock-data.ts | 63 | `亥` | `hour_names: ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'],` |
| src/ui/stores/mock-data.ts | 67 | `上身` | `{ id: 'upper', name: '上身', category: 'clothing' },` |
| src/ui/stores/mock-data.ts | 68 | `下身` | `{ id: 'lower', name: '下身', category: 'clothing' },` |
| src/ui/stores/mock-data.ts | 69 | `饰品` | `{ id: 'accessory', name: '饰品', category: 'accessory' },` |
| src/ui/stores/ui-store.test.ts | 62 | `不可用时静默跳过` | `it('localStorage 不可用时静默跳过', () => {` |
| src/ui/utils/text-formatter.test.ts | 5 | `普通文本无格式` | `it('普通文本无格式', () => {` |
| src/ui/utils/text-formatter.test.ts | 6 | `你好世界` | `const result = formatText('你好世界')` |
| src/ui/utils/text-formatter.test.ts | 8 | `你好世界` | `expect(result[0].text).toBe('你好世界')` |
| src/ui/utils/text-formatter.test.ts | 12 | `**加粗**` | `it('**加粗**', () => {` |
| src/ui/utils/text-formatter.test.ts | 13 | `**重要**` | `const result = formatText('**重要**')` |
| src/ui/utils/text-formatter.test.ts | 14 | `重要` | `expect(result[0].text).toBe('重要')` |
| src/ui/utils/text-formatter.test.ts | 18 | `*斜体*` | `it('*斜体*', () => {` |
| src/ui/utils/text-formatter.test.ts | 19 | `*注意*` | `const result = formatText('*注意*')` |
| src/ui/utils/text-formatter.test.ts | 20 | `注意` | `expect(result[0].text).toBe('注意')` |
| src/ui/utils/text-formatter.test.ts | 24 | `~~删除线~~` | `it('~~删除线~~', () => {` |
| src/ui/utils/text-formatter.test.ts | 25 | `~~废弃~~` | `const result = formatText('~~废弃~~')` |
| src/ui/utils/text-formatter.test.ts | 26 | `废弃` | `expect(result[0].text).toBe('废弃')` |
| src/ui/utils/text-formatter.test.ts | 30 | `（黑框）` | `it('||spoiler||（黑框）', () => {` |
| src/ui/utils/text-formatter.test.ts | 31 | `隐藏内容` | `const result = formatText('||隐藏内容||')` |
| src/ui/utils/text-formatter.test.ts | 32 | `隐藏内容` | `expect(result[0].text).toBe('隐藏内容')` |
| src/ui/utils/text-formatter.test.ts | 36 | `文字}}` | `it('{{color:#RRGGBB 文字}}', () => {` |
| src/ui/utils/text-formatter.test.ts | 37 | `红色文字}}` | `const result = formatText('{{color:#FF0000 红色文字}}')` |
| src/ui/utils/text-formatter.test.ts | 38 | `红色文字` | `expect(result[0].text).toBe('红色文字')` |
| src/ui/utils/text-formatter.test.ts | 42 | `文字}}（含透明度）` | `it('{{color:#AARRGGBB 文字}}（含透明度）', () => {` |
| src/ui/utils/text-formatter.test.ts | 43 | `半透明红}}` | `const result = formatText('{{color:#80FF0000 半透明红}}')` |
| src/ui/utils/text-formatter.test.ts | 44 | `半透明红` | `expect(result[0].text).toBe('半透明红')` |
| src/ui/utils/text-formatter.test.ts | 48 | `{{font:楷体` | `it('{{font:楷体 文字}}', () => {` |
| src/ui/utils/text-formatter.test.ts | 48 | `文字}}` | `it('{{font:楷体 文字}}', () => {` |
| src/ui/utils/text-formatter.test.ts | 49 | `{{font:楷体` | `const result = formatText('{{font:楷体 楷体文字}}')` |
| src/ui/utils/text-formatter.test.ts | 49 | `楷体文字}}` | `const result = formatText('{{font:楷体 楷体文字}}')` |
| src/ui/utils/text-formatter.test.ts | 50 | `楷体文字` | `expect(result[0].text).toBe('楷体文字')` |
| src/ui/utils/text-formatter.test.ts | 51 | `楷体` | `expect(result[0].font).toBe('楷体')` |
| src/ui/utils/text-formatter.test.ts | 54 | `文字}}` | `it('{{size:large 文字}}', () => {` |
| src/ui/utils/text-formatter.test.ts | 55 | `大字}}` | `const result = formatText('{{size:large 大字}}')` |
| src/ui/utils/text-formatter.test.ts | 56 | `大字` | `expect(result[0].text).toBe('大字')` |
| src/ui/utils/text-formatter.test.ts | 60 | `混合格式` | `it('混合格式', () => {` |
| src/ui/utils/text-formatter.test.ts | 61 | `普通**加粗**普通*斜体*普通` | `const result = formatText('普通**加粗**普通*斜体*普通')` |
| src/ui/utils/text-formatter.test.ts | 63 | `普通` | `expect(result[0].text).toBe('普通')` |
| src/ui/utils/text-formatter.test.ts | 65 | `普通` | `expect(result[2].text).toBe('普通')` |
| src/utils/weighted-random.ts | 5 | `空列表` | `if (items.length === 0) throw new Error('weightedRandom: 空列表')` |
