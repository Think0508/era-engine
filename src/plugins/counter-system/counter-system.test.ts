// counter-system 单元测试——声明加载 / 惰性存储 / 事件驱动 / 初始值（__meta 去重）/
// 视图求值 / 条件路径（代理域 + count()）/ 半成品 pending
// 案例对齐 grill 定稿：荡妇（初始 10 无名 + 实际 1）= 11、黄蓉（初始具名郭靖去重）语义

import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { modLoader } from '../../core/mod-loader'
import { gameContext } from '../../core/game-context'
import { entitySystem } from '../../core/entity-system'
import { conditionEngine } from '../../core/condition-engine'
import { conditionRegistry } from '../../core/condition-registry'
import { apiSystem } from '../../core/api'
import { eventBus } from '../../core/event-bus'
import { errorReporter } from '../../core/error-reporter'
import { narrativeLog } from '../../core/narrative-log'
import { onLoad, onEnable } from './index'
import { resolvePath, relationList } from './queries'
import { getByPath } from './store'
import { registerConditionFields, buildRegistry } from './register'
import { setBindings, registerEventListeners } from './events'
import { effectTypeRegistry } from '../../core/effect-type-registry'
import { onLoad as ejacOnLoad } from '../h-ejaculation/index'
import { onLoad as hCoreOnLoad, onEnable as hCoreOnEnable } from '../h-core/index'
import { compileRules, invalidateRules, getCompiledRules } from '../gain-rule-system/rule-engine'

const stubCtx: any = {
  api: apiSystem,
  events: { on: () => {}, off: () => {}, emit: () => {} },
  commands: { register: () => {}, unregister: () => {} },
  ui: { registerSlot: () => {} },
}

function getChar(id: string): any {
  return entitySystem.get('character', id) as any
}

/** 重置受测角色（清 counters 与初始字段，防跨测试污染） */
function resetChars(): void {
  for (const id of ['player', 'girl', 'guy', 'guojing']) {
    const ch = getChar(id)
    if (!ch) continue
    delete ch.counters
    if (ch.base) {
      delete ch.base['初始H过男人数']
      delete ch.base['初始H过男人']
      delete ch.base['初始被插入男人数']
      delete ch.base['初始被插入男人']
      delete ch.base['初始体内精液量']
      delete ch.base['初始射精次数']
    }
    if (ch.experience) delete ch.experience['14']
  }
}

describe('counter-system', () => {
  beforeAll(async () => {
    entitySystem.clear()
    conditionEngine.clear()
    errorReporter.clear()
    narrativeLog.clear()
    await modLoader.loadMod('test-mod')
    const mod = modLoader.getMod()!
    gameContext.setPlayer('player')
    gameContext.setLocation(mod.locations.values().next().value as any)
    onLoad(stubCtx)
    await onEnable(stubCtx)
    ejacOnLoad(stubCtx)   // 注册 eja_shoot/eja_climax（真实链路测试用；effect 重复注册会抛错，只调一次）
    hCoreOnLoad(stubCtx)  // 注册 sex_insert/sex_position_set 等插入效果（h:insert 发射点）
    hCoreOnEnable(stubCtx) // 注册插体位前提；真实触发 sex_insert 需要 h-core 效果域
    entitySystem.register('character', 'girl', { id: 'girl', name: '测试女孩', base: { 性别: 2 } })
    entitySystem.register('character', 'guy', { id: 'guy', name: '测试男', base: { 性别: 1 } })
    entitySystem.register('character', 'guojing', { id: 'guojing', name: '郭靖', base: { 性别: 1 } })
  })

  beforeEach(() => {
    resetChars()
  })

  // ============ 声明加载 ============
  it('声明加载——插件默认层 counters.toml 进 mod.counterDefs/counterViews（键 = scope:id）', () => {
    const mod = modLoader.getMod()!
    expect(mod.counterDefs['character:male_stats']).toBeDefined()
    expect(mod.counterDefs['character:male_stats'].type).toBe('group_table')
    expect(mod.counterDefs['character:male_stats'].fields?.map(f => f.id)).toContain('semen')
    expect(mod.counterDefs['character:h_partners']).toBeDefined()
    expect(mod.counterDefs['player:h_partners']).toBeDefined()
    expect(mod.counterViews['semen_total']).toBeDefined()
    expect(mod.counterViews['orgasm_count'].map?.table?.['6']).toBe('14')
    // test-mod 追加层（lovers 视图）
    expect(mod.counterViews['lovers']).toBeDefined()
  })

  // ============ 惰性创建 ============
  it('惰性创建——无 counters 字段角色事件计数后才创建', async () => {
    const girl = getChar('girl')
    expect(girl.counters).toBeUndefined()
    await eventBus.emit('h:start', { ally: 'player', target: 'girl' })
    expect(girl.counters).toBeDefined()
    expect(girl.counters.h_partners).toEqual({ initial: 0, named: [], list: ['player'] })
  })

  // ============ 未建档初始回退（B2 修复：初始值在"从未被计数"时也要体现）============
  it('未建档回退——仅设初始、从未 H/从未被射，list/分组表视图也返回初始（非 0）', () => {
    const girl = getChar('girl')
    girl.base['初始H过男人数'] = 3
    girl.base['初始被插入男人数'] = 10
    girl.base['初始体内精液量'] = 30
    // list（从未 H → 无条目）→ count = 初始 3
    expect(resolvePath(['girl', 'h_partners', 'count'], null)).toBe(3)
    expect(resolvePath(['girl', 'h_partners', 'real'], null)).toBe(0)
    // 分组表部位（从未被射 → 无 meta）→ 视图回退读初始
    expect(resolvePath(['girl', 'male_count', '6'], null)).toBe(10)
    expect(resolvePath(['girl', 'male_count', 'real', '6'], null)).toBe(0)
    expect(resolvePath(['girl', 'semen_total', '6'], null)).toBe(30)
    expect(resolvePath(['girl', 'semen_total', 'real', '6'], null)).toBe(0)
  })

  it('未建档回退——插入一次后 meta 快照固化，与未建档回退值一致', async () => {
    const girl = getChar('girl')
    girl.base['初始被插入男人数'] = 10
    girl.base['初始体内精液量'] = 30
    await eventBus.emit('h:shoot', { character: 'guy', target: 'girl', amount: 20, position: 6 })
    // 建 meta 后：10 + 1 + 0 = 11（快照与回退同源，数值一致）
    expect(resolvePath(['girl', 'male_count', '6'], null)).toBe(11)
    expect(resolvePath(['girl', 'semen_total', '6'], null)).toBe(50)
    expect(resolvePath(['girl', 'semen_total', 'real', '6'], null)).toBe(20)
  })

  // ============ list 具名初始去重（B3 修复）============
  it('list 具名初始——named 算总数但不进新增名单（郭靖初始已有，游戏内再 H 不重复计）', async () => {
    const girl = getChar('girl')
    girl.base['初始H过男人'] = ['guojing']
    await eventBus.emit('h:start', { ally: 'guojing', target: 'girl' })   // 郭靖游戏内再 H
    await eventBus.emit('h:start', { ally: 'guy', target: 'girl' })
    expect(girl.counters.h_partners).toEqual({ initial: 0, named: ['guojing'], list: ['guy'] })
    expect(resolvePath(['girl', 'h_partners', 'count'], null)).toBe(2)   // 郭靖(named) + guy = 2
    expect(resolvePath(['girl', 'h_partners', 'real'], null)).toBe(1)    // 新增 = guy
  })

  // ============ 事件驱动 ============
  it('h:start → 女角色 h_partners 记发起者（去重）', async () => {
    await eventBus.emit('h:start', { ally: 'player', target: 'girl' })
    await eventBus.emit('h:start', { ally: 'player', target: 'girl' })
    const girl = getChar('girl')
    expect(girl.counters.h_partners.list).toEqual(['player'])
  })

  it('h:start → 玩家 h_partners 记被 H 者（性别过滤：只记女性）', async () => {
    await eventBus.emit('h:start', { ally: 'player', target: 'guy' })   // 男性 target → 不记
    await eventBus.emit('h:start', { ally: 'player', target: 'girl' })  // 女性 target → 记
    const player = getChar('player')
    expect(player.counters.h_partners.list).toEqual(['girl'])
  })

  it('h:shoot → male_stats 分组表（部位→射精者→semen/shoots）', async () => {
    await eventBus.emit('h:shoot', { character: 'guy', target: 'girl', amount: 30, position: 6 })
    await eventBus.emit('h:shoot', { character: 'guy', target: 'girl', amount: 15, position: 6 })
    const girl = getChar('girl')
    expect(girl.counters.male_stats['6']['guy'].semen).toBe(45)
    expect(girl.counters.male_stats['6']['guy'].shoots).toBe(2)
  })

  // ============ 初始值 ============
  it('list 初始值——initial_from 快照，count=初始+新增 / real=新增', async () => {
    const girl = getChar('girl')
    girl.base['初始H过男人数'] = 3
    await eventBus.emit('h:start', { ally: 'player', target: 'girl' })
    const entry = girl.counters.h_partners
    expect(entry.initial).toBe(3)
    expect(entry.list).toEqual(['player'])
    expect(resolvePath(['girl', 'h_partners', 'count'], null)).toBe(4)
    expect(resolvePath(['girl', 'h_partners', 'real'], null)).toBe(1)
  })

  it('分组表初始——荡妇案：初始 10 无名 + 实际 1 = 11，real=1', async () => {
    const girl = getChar('girl')
    girl.base['初始被插入男人数'] = 10
    await eventBus.emit('h:shoot', { character: 'guy', target: 'girl', amount: 10, position: 6 })
    expect(resolvePath(['girl', 'male_count', '6'], null)).toBe(11)
    expect(resolvePath(['girl', 'male_count', 'real', '6'], null)).toBe(1)
  })

  it('初始组合——数字与具名正交相加（郭靖不在数字里，是额外 +1）', async () => {
    const girl = getChar('girl')
    girl.base['初始被插入男人数'] = 3      // 3 个无名背景男
    girl.base['初始被插入男人'] = ['guojing'] // 郭靖 = 第 4 个（具名真实个体，与数字正交）
    await eventBus.emit('h:shoot', { character: 'guy', target: 'girl', amount: 10, position: 6 })
    // 总数 = 3(count) + 1(郭靖 named) + 1(guy 新增) = 5；真实值 = 1（仅 guy，郭靖已含在 named 不去重）
    expect(resolvePath(['girl', 'male_count', '6'], null)).toBe(5)
    expect(resolvePath(['girl', 'male_count', 'real', '6'], null)).toBe(1)
  })

  it('分组表初始——黄蓉案：初始具名郭靖去重，郭靖游戏内 H 不重复计', async () => {
    const girl = getChar('girl')
    girl.base['初始被插入男人'] = ['guojing']
    // 郭靖游戏内继续 H（条目照记，数值累计）
    await eventBus.emit('h:shoot', { character: 'guojing', target: 'girl', amount: 20, position: 6 })
    await eventBus.emit('h:shoot', { character: 'guy', target: 'girl', amount: 10, position: 6 })
    const girlData = getChar('girl')
    expect(girlData.counters.male_stats['6']['guojing'].semen).toBe(20)   // 郭靖继续累计
    expect(resolvePath(['girl', 'male_count', '6'], null)).toBe(2)     // 郭靖(named)+guy = 2 总数
    expect(resolvePath(['girl', 'male_count', 'real', '6'], null)).toBe(1) // 游戏内新增 = guy
  })

  it('分组表字段初始——field_init 参与总数，real 不含', async () => {
    const girl = getChar('girl')
    girl.base['初始被插入男人数'] = 0
    girl.base['初始体内精液量'] = 30
    await eventBus.emit('h:shoot', { character: 'guy', target: 'girl', amount: 20, position: 6 })
    expect(resolvePath(['girl', 'semen_total', '6'], null)).toBe(50)       // 30(init) + 20
    expect(resolvePath(['girl', 'semen_total', 'real', '6'], null)).toBe(20)
  })

  // ============ 视图 ============
  it('orgasm_count 视图（map）——部位 cid → experience 绝顶 id', () => {
    const girl = getChar('girl')
    girl.experience = { '14': 5 }   // 阴道绝顶经验
    expect(resolvePath(['girl', 'orgasm_count', '6'], null)).toBe(5)
    expect(resolvePath(['girl', 'orgasm_count', '8'], null)).toBe(0)       // 肛未计数
  })

  it('orgasm_total 视图（source）——experience.20 总绝顶', () => {
    const girl = getChar('girl')
    girl.experience = { '20': 8 }
    expect(resolvePath(['girl', 'orgasm_total'], null)).toBe(8)
  })

  it('lovers 关系视图——relation 视图数与 relationList 名单', () => {
    const girl = getChar('girl')
    girl.relations = { '郭靖': { '恋人': 1 }, 'guy': { '仇人': 1 } }
    expect(resolvePath(['girl', 'lovers'], null)).toBe(1)
    expect(relationList('girl', '恋人')).toEqual(['郭靖'])
  })

  // ============ 条件路径（代理域）============
  it('条件路径——counters 代理域：分组表深层取值 + count() 数条目', async () => {
    await eventBus.emit('h:start', { ally: 'player', target: 'girl' })
    await eventBus.emit('h:shoot', { character: 'guy', target: 'girl', amount: 30, position: 6 })
    const ctx = gameContext.getContext()
    expect(conditionEngine.evaluate('counters.girl.male_stats.6.guy.semen > 20', ctx)).toBe(true)
    expect(conditionEngine.evaluate('count(counters.girl.male_stats.6) > 0', ctx)).toBe(true)
    expect(conditionEngine.evaluate('count(counters.girl.male_stats.8) > 0', ctx)).toBe(false)
    expect(conditionEngine.evaluate('counters.girl.h_partners.count >= 1', ctx)).toBe(true)
  })

  it('条件路径——真实值段 .real', async () => {
    const girl = getChar('girl')
    girl.base['初始被插入男人数'] = 5
    await eventBus.emit('h:shoot', { character: 'guy', target: 'girl', amount: 10, position: 6 })
    const ctx = gameContext.getContext()
    expect(conditionEngine.evaluate('counters.girl.male_count.real.6 == 1', ctx)).toBe(true)
    expect(conditionEngine.evaluate('counters.girl.male_count.6 == 6', ctx)).toBe(true)
  })

  // ============ 半成品 pending ============
  it('半成品——pending 字段 warning + 监听跳过（h:future 不累计）', async () => {
    // pendingItems 时上报 warning（errorReporter severity=warning）
    const warnings = errorReporter.getErrors().filter(e => e.severity === 'warning')
    expect(warnings.some(w => w.message.includes('test_pending'))).toBe(true)
    // 触发 h:future → 无监听 → 不累计
    await eventBus.emit('h:future', { character: 'guy', target: 'girl', position: 6 })
    const girl = getChar('girl')
    expect(girl.counters?.test_pending).toBeUndefined()
  })

  // ============ 实体直读（不经代理）============
  it('实体直读——character.{id}.counters 原生导航（condition-engine 内置）', async () => {
    await eventBus.emit('h:shoot', { character: 'guy', target: 'girl', amount: 30, position: 6 })
    const ctx = gameContext.getContext()
    expect(conditionEngine.evaluate('character.girl.counters.male_stats.6.guy.semen == 30', ctx)).toBe(true)
  })

  // ============ 热更新重建 + 消费方校验时序 ============
  it('条件字段注册——onLoad 后消费方 validateExpression 可校验 counters 条件（时序修复）', () => {
    // 时序契约（ADR-0016）：counter-system 在 onLoad 注册条件字段，早于一切消费方
    // onEnable 的条件校验（gain-rule/quest/talk/random-event）。这里模拟"仅注册完成、
    // 消费方校验"的场景：clear 后重注册即可校验 counters 条件（含 count() 参数路径）
    conditionRegistry.clear()
    registerConditionFields()
    expect(conditionRegistry.validateExpression('counters.player.h_partners.count >= 3').ok).toBe(true)
    expect(conditionRegistry.validateExpression('counters.girl.male_count.6 > 5').ok).toBe(true)
    expect(conditionRegistry.validateExpression('counters.girl.semen_total.real.6 > 10').ok).toBe(true)
    // 跨计数器组合（纯 counters 域——不依赖 attributes 字段，避免 clear 后 attrs 缺失的测试假象）
    expect(conditionRegistry.validateExpression('counters.girl.semen_total.real.6 > 10 && counters.player.h_partners.count >= 1').ok).toBe(true)
    expect(conditionRegistry.validateExpression('count(counters.girl.male_stats.6) > 0').ok).toBe(true)
    // 未知 key 仍会被拦截（防静默失效）
    expect(conditionRegistry.validateExpression('counters.girl.不存在的计数器.6 > 1').ok).toBe(false)
    expect(conditionRegistry.validateField('counters.girl.male_stats.6.guy.semen')).toBe(true)
  })

  // ============ 扩展便利性（实测：加字段/加计数器 = 纯 TOML，零代码）============
  it('扩展性——mod 加分组表字段 + 新计数器，重建后纯声明生效（零代码）', async () => {
    const mod = modLoader.getMod()!
    // 模拟作者编辑 counters.toml：
    // ① male_stats 加一个"内射次数"字段（复用已存在的 h:shoot 事件）
    const male = mod.counterDefs['character:male_stats']
    male.fields!.push({ id: 'inside', label: '内射次数', event: 'h:shoot', add: 1 })
    // ② 新增一个 number 计数器
    mod.counterDefs['character:test_ext'] = {
      id: 'test_ext', label: '扩展测试', scope: 'character', type: 'number',
      event: 'h:shoot', add: 'payload.amount',
    }
    // 模拟 game:mod_loaded 重建流程（counters.toml 变更后触发的三条）
    setBindings(buildRegistry().bindingsByEvent)
    registerEventListeners()
    registerConditionFields()

    await eventBus.emit('h:shoot', { character: 'guy', target: 'girl', amount: 10, position: 6 })
    const girl = getChar('girl')
    expect(girl.counters.male_stats['6']['guy'].inside).toBe(1)      // 新字段累计
    expect(girl.counters.test_ext).toBe(10)                           // 新计数器累计
    const ctx = gameContext.getContext()
    expect(conditionEngine.evaluate('counters.girl.test_ext >= 10', ctx)).toBe(true)  // 新条件路径可用
    expect(resolvePath(['girl', 'male_stats', '6', 'guy', 'inside'], null)).toBe(1)

    // 还原（防污染后续用例）
    male.fields!.pop()
    delete mod.counterDefs['character:test_ext']
    setBindings(buildRegistry().bindingsByEvent)
    registerEventListeners()
  })

  // ============ 端到端（核心用途）：成就系统引用 counters ============
  it('端到端——gain-rule 规则引用 counters 条件：编译无未知字段 warning + 事件达成后为真', async () => {
    const mod = modLoader.getMod()!
    const ruleId = '计数器成就测试'
    mod.gainRules[ruleId] = {
      id: ruleId, scope: 'player', when: 'auto',
      condition: 'counters.girl.male_count.6 >= 1',   // 武侠 mod 未来写法：某女角色阴道被 ≥1 男射过
    }
    // 恢复 attributes/bindings 条件注册（前一用例 conditionRegistry.clear() 只重注册了
    // counters——真实模组状态是两者都在；否则 test-mod 既有规则会误报未知字段噪音）
    conditionRegistry.registerFromAttributes(mod.attributes)
    conditionRegistry.registerFromBindings(mod.bindings)
    errorReporter.clear()
    invalidateRules()
    compileRules()   // 校验引用 counters 的条件（时序契约：counter 条件已在 onLoad 注册）
    const compiled = getCompiledRules().find(r => r.id === ruleId)
    expect(compiled).toBeDefined()
    // 无"未知字段"warning（counter 条件被正常接受）
    const warnings = errorReporter.getErrors().filter(e => e.severity === 'warning')
    expect(warnings.some(w => w.message.includes(ruleId) && w.message.includes('未知字段'))).toBe(false)
    // 事件达成后条件求值为真（gain-rule auto 检查的同一求值路径）
    await eventBus.emit('h:shoot', { character: 'guy', target: 'girl', amount: 20, position: 6 })
    const ctx = gameContext.getContext()
    expect(conditionEngine.evaluate(compiled!.condition!, ctx)).toBe(true)
    delete mod.gainRules[ruleId]   // 还原
  })

  // ============ mod 新内容字段（用户担忧：原生无"武功"，mod 引入后计数器引用它）============
  it('mod 新字段——计数器引用 mod 独有的属性（非原生），加载无 error、运行时读取得值', async () => {
    const mod = modLoader.getMod()!
    // 模拟 mod 作者：① attributes.toml 定义新内容"武功"（test-mod 已静态定义，原生系统没有）；
    // ② counters.toml 声明一个引用它做初始值的计数器——担忧"加载时该字段不在原生 → 报错"
    // （id 用英文 kebab 遵循项目惯例，label 才是中文显示名）
    const girl = getChar('girl')
    girl.base['武功'] = 5
    mod.counterDefs['character:wugong_stats'] = {
      id: 'wugong_stats', label: '武功统计', scope: 'character', type: 'list',
      event: 'h:start', add: 'payload.ally', initial_from: 'base.武功',
    }
    // 模拟 mod 加载完成的正常装配（counters.toml 与 mod 内容同批加载，无先后——见 docs §引用语义）
    setBindings(buildRegistry().bindingsByEvent)
    registerEventListeners()
    registerConditionFields()
    errorReporter.clear()

    await eventBus.emit('h:start', { ally: 'guy', target: 'girl' })
    // 1. 加载无 error（引用 mod 独有字段不卡加载）
    expect(errorReporter.getErrors().filter(e => e.severity === 'error')).toHaveLength(0)
    // 2. 运行时读取得值：初始值快照自 base.武功 = 5，名单新增 guy
    const entry = girl.counters['wugong_stats']
    expect(entry.initial).toBe(5)
    expect(entry.list).toEqual(['guy'])
    // 3. 条件路径可用（5 初始 + 1 新增 = 6）
    const ctx = gameContext.getContext()
    expect(conditionEngine.evaluate('counters.girl.wugong_stats.count >= 6', ctx)).toBe(true)

    // 还原（防污染）
    delete mod.counterDefs['character:wugong_stats']
    setBindings(buildRegistry().bindingsByEvent)
    registerEventListeners()
  })

  // ============ 存档与新增计数器（旧档兼容）============
  it('旧存档——只读视图立即反映历史值（非 0）；新事件计数器惰性 0 起', () => {
    const girl = getChar('girl')
    // 模拟"引入新计数器前的旧存档"：角色有机制字段历史（experience/relations），但
    // counters 一个条目都没有（新计数器引入前从未建过）
    delete girl.counters
    girl.experience = { '14': 7, '20': 9 }
    girl.relations = { 'guy': { '恋人': 1 } }

    // ① 只读视图（map/source/relation）实时映射数据源 → 立即有历史，绝不是 0
    expect(resolvePath(['girl', 'orgasm_count', '6'], null)).toBe(7)   // 阴道绝顶 7 次（读 experience.14）
    expect(resolvePath(['girl', 'orgasm_total'], null)).toBe(9)        // 总绝顶 9 次（读 experience.20）
    expect(resolvePath(['girl', 'lovers'], null)).toBe(1)              // 恋人 1 人（读 relations）

    // ② 新事件驱动的存储型计数器 → 惰性缺省（0/false），触发后才开始累计
    const ctx = gameContext.getContext()
    expect(conditionEngine.evaluate('counters.girl.h_partners.count >= 1', ctx)).toBe(false)
    expect(girl.counters).toBeUndefined()   // 仍未创建（惰性）

    // ③ 回填路线：迁移脚本可写 counters（save-system applyDefault 任意字段路径，
    //    如 default = { field = "counters.某某", value = N }）——新计数器可设常量起始值
    //    （transform 按逻辑计算回填待沙箱 phase-12.1）

    // 还原（防污染）
    delete girl.experience['20']
    delete girl.relations
  })

  // ============ 真实链路（接线验证：effect 执行 → emit → counter 累计）============
  it('真实链路——h-ejaculation 射精 effect 执行 → emit h:shoot → male_stats 累计', async () => {
    const guy = getChar('guy')
    guy.base['精液量'] = 100
    guy.h_state = { target_character_id: 'girl', insert_position: 6 }
    // 走真实 eja_shoot effect（h-ejaculation 注册；内部 trackSemen + emit h:shoot 的同一代码路径）
    const handler = effectTypeRegistry.getHandler('eja_shoot')!
    expect(handler).toBeDefined()
    await handler({ positionId: 6 }, { _targetIds: ['guy'], _timeCost: 10 })
    const girl = getChar('girl')
    expect(girl.counters.male_stats['6']['guy'].shoots).toBe(1)
    expect(girl.counters.male_stats['6']['guy'].semen).toBeGreaterThan(0)
    // 还原
    delete guy.base['精液量']
    delete guy.h_state
  })

  it('真实链路——eja_climax 忍住射精（技巧0/忍耐0 → 必忍住）→ 不发 h:shoot → 不计数（正确语义）', async () => {
    const guy = getChar('guy')
    guy.base['精液量'] = 100
    guy.base['射精欲'] = 1000
    guy.base['射精欲上限'] = 1000
    guy.h_state = { target_character_id: 'girl', insert_position: 6, endure_not_shoot_count: 0 }
    const handler = effectTypeRegistry.getHandler('eja_climax')!
    expect(handler).toBeDefined()
    await handler({ positionId: 6 }, { _targetIds: ['guy'], _timeCost: 10 })
    const girl = getChar('girl')
    // 忍住 → 无 h:shoot → male_stats 不被污染（"只记真实射出"的正确性）
    expect(girl.counters?.male_stats?.['6']?.['guy']).toBeUndefined()
    // 还原
    delete guy.base['精液量']
    delete guy.base['射精欲']
    delete guy.base['射精欲上限']
    delete guy.h_state
  })

  it('真实链路——eja_climax 射出（endure>技巧 → 必射）→ emit h:shoot → 计数（主路径）', async () => {
    const guy = getChar('guy')
    guy.base['精液量'] = 100
    guy.base['射精欲'] = 1000
    guy.base['射精欲上限'] = 1000
    // endure(2) > 技N(0) → 超限 rate = 100 - 2×(50-0) = 0 → 必射
    guy.h_state = { target_character_id: 'girl', insert_position: 6, endure_not_shoot_count: 2 }
    const handler = effectTypeRegistry.getHandler('eja_climax')!
    await handler({ positionId: 6 }, { _targetIds: ['guy'], _timeCost: 10 })
    // eja_climax 的 emit 未 await（非 async handler）——让派发链完成后再断言
    await new Promise(r => setTimeout(r, 0))
    const girl = getChar('girl')
    expect(girl.counters.male_stats['6']['guy'].shoots).toBe(1)
    expect(girl.counters.male_stats['6']['guy'].semen).toBeGreaterThan(0)
    // 还原
    delete guy.base['精液量']
    delete guy.base['射精欲']
    delete guy.base['射精欲上限']
    delete guy.h_state
  })

  it('真实链路——h-core startHScene → emit h:start → 玩家/女角色 h_partners 双侧累计（主入口）', async () => {
    const { startHScene, endHScene } = await import('../h-core/index')
    const player = getChar('player')
    const girl = getChar('girl')
    player.base['性别'] = 1   // 玩家为男（h_partners 双 filter 判定依赖）
    // 真实 H 开始（do_h 指令走的同一入口）→ emit h:start { ally: player, target: girl }
    await startHScene('player', 'girl')
    expect(player.counters.h_partners.list).toEqual(['girl'])   // 玩家记被 H 者（filter 女 → girl）
    expect(girl.counters.h_partners.list).toEqual(['player'])   // 女角色记发起者（filter 男 → player）
    await endHScene('player')   // 还原模式栈 + 会话
    delete player.h_state
    delete girl.h_state
  })

  it('真实链路——sex_insert 执行 → emit h:insert → male_stats.inserts 累计（含射精重置后重插）', async () => {
    const guy = getChar('guy')
    const girl = getChar('girl')
    guy.h_state = { target_character_id: 'girl', current_sex_position: 1, current_womb_sex_position: 0, is_h: true }
    girl.h_state = { target_character_id: 'guy', insert_position: -1, is_h: true }

    // 第一次进入（-1→V）：计数 1
    const handler = effectTypeRegistry.getHandler('sex_insert')!
    expect(handler).toBeDefined()
    await handler({ part: 'vagina', position: 1 }, { sourceId: 'guy', _targetIds: ['girl'], _timeCost: 10 })
    expect(girl.h_state.insert_position).toBe(0)
    expect(guy.h_state.current_sex_position).toBe(1)
    expect(resolvePath(['girl', 'male_stats', '6', 'guy', 'inserts'], null)).toBe(1)
    expect(conditionEngine.evaluate('counters.girl.male_stats.6.guy.inserts > 0', gameContext.getContext())).toBe(true)

    // 同一体位继续动作（已是 V）：不重复计
    await handler({ part: 'vagina', position: 1 }, { sourceId: 'guy', _targetIds: ['girl'], _timeCost: 10 })
    expect(girl.counters.male_stats['6']['guy'].inserts).toBe(1)

    // 射精重置插入位后重插（-1→V）：再计 1
    girl.h_state.insert_position = -1
    await handler({ part: 'vagina', position: 1 }, { sourceId: 'guy', _targetIds: ['girl'], _timeCost: 10 })
    expect(resolvePath(['girl', 'male_stats', '6', 'guy', 'inserts'], null)).toBe(2)

    // 换体位（V→A 迁移属于“进入另一部位”，按“每次进入动作”也计 1）
    girl.h_state.insert_position = 0
    await handler({ part: 'anal', position: 2 }, { sourceId: 'guy', _targetIds: ['girl'], _timeCost: 10 })
    expect(girl.h_state.insert_position).toBe(1)
    expect(resolvePath(['girl', 'male_stats', '8', 'guy', 'inserts'], null)).toBe(1)

    // 还原
    delete girl.h_state
    delete guy.h_state
  })

  // ============ counter_add effect（显式计数通道——事件表达不了时用）============
  it('counter_add——number 累加 / 分组表 dims+field / list 加名单项(item)', async () => {
    const mod = modLoader.getMod()!
    mod.counterDefs['character:cadd_num'] = { id: 'cadd_num', label: '', scope: 'character', type: 'number', event: 'h:shoot', add: 1 }
    const handler = effectTypeRegistry.getHandler('counter_add')!
    expect(handler).toBeDefined()

    // number：value 增量
    handler({ counterId: 'cadd_num', value: 5 }, { _targetIds: ['girl'] })
    expect(getChar('girl').counters.cadd_num).toBe(5)

    // 分组表：dims + field + value
    handler({ counterId: 'male_stats', dims: ['6', 'guy'], field: 'shoots', value: 2 }, { _targetIds: ['girl'] })
    expect(getChar('girl').counters.male_stats['6']['guy'].shoots).toBe(2)

    // list：item 加入名单
    handler({ counterId: 'h_partners', item: 'guy' }, { _targetIds: ['girl'] })
    expect(getChar('girl').counters.h_partners.list).toContain('guy')

    // 还原
    delete mod.counterDefs['character:cadd_num']
    resetChars()
  })

  it('counter_add——非法用法有 warning 且不污染（value 非法 / 名单缺 item / 分组表缺 dims）', async () => {
    const handler = effectTypeRegistry.getHandler('counter_add')!
    const girl = getChar('girl')
    errorReporter.clear()
    // 名单用 value（数字）→ 拒绝，名单不被 '0' 污染
    handler({ counterId: 'h_partners', value: 0 }, { _targetIds: ['girl'] })
    expect(girl.counters?.h_partners?.list ?? []).toHaveLength(0)
    // 分组表缺 dims → warning + 不写
    handler({ counterId: 'male_stats', field: 'shoots', value: 1 }, { _targetIds: ['girl'] })
    expect(girl.counters?.male_stats).toBeUndefined()
    // 分组表缺 field → warning
    handler({ counterId: 'male_stats', dims: ['6', 'guy'], value: 1 }, { _targetIds: ['girl'] })
    // number value 非法（NaN）→ warning + 不写
    const mod = modLoader.getMod()!
    mod.counterDefs['character:cadd_num'] = { id: 'cadd_num', label: '', scope: 'character', type: 'number', event: 'h:shoot', add: 1 }
    handler({ counterId: 'cadd_num', value: 'abc' }, { _targetIds: ['girl'] })
    expect(girl.counters?.cadd_num).toBeUndefined()
    delete mod.counterDefs['character:cadd_num']

    const warns = errorReporter.getErrors().filter(e => e.severity === 'warning' && e.message.includes('counter_add'))
    expect(warns.length).toBeGreaterThanOrEqual(3)   // 至少 名单缺item/分组缺dims/分组缺field/NaN
  })

  // ============ 喜欢的体位/部位学习源（2026-08-25）============
  it('声明加载——female_stats / position_stats / male_stats.count 就位', () => {
    const mod = modLoader.getMod()!
    expect(mod.counterDefs['character:female_stats']).toBeDefined()
    expect(mod.counterDefs['character:position_stats']).toBeDefined()
    expect(mod.counterDefs['character:male_stats'].fields?.map(f => f.id)).toContain('count')
  })

  it('h:part_use——女角 male_stats.count + 男角 female_stats.count 同步累计', async () => {
    const girl = getChar('girl')
    const guy = getChar('guy')
    resetChars()
    await eventBus.emit('h:part_use', { target: 'girl', character: 'guy', part: 6, position: 6 })
    expect(girl.counters.male_stats['6']['guy'].count).toBe(1)
    await eventBus.emit('h:part_use', { target: 'girl', character: 'guy', part: 6, position: 6 })
    expect(girl.counters.male_stats['6']['guy'].count).toBe(2)

    await eventBus.emit('h:part_use', { target: 'guy', partner: 'girl', part: 6, position: 6 })
    expect(guy.counters.female_stats['6']['girl'].count).toBe(1)
  })

  it('h:position_use——双方 position_stats.count 各自累计', async () => {
    const girl = getChar('girl')
    const guy = getChar('guy')
    resetChars()
    await eventBus.emit('h:position_use', { target: 'girl', partner: 'guy', position: 1 })
    await eventBus.emit('h:position_use', { target: 'guy', partner: 'girl', position: 1 })
    expect(girl.counters.position_stats['1']['guy'].count).toBe(1)
    expect(guy.counters.position_stats['1']['girl'].count).toBe(1)
  })

  // ============ 工具 ============
  it('getByPath——实体字段导航', () => {
    const girl = getChar('girl')
    girl.base = { ...(girl.base ?? {}), '初始H过男人数': 7 }
    expect(getByPath(girl, 'base.初始H过男人数')).toBe(7)
    expect(getByPath(girl, 'base.不存在字段')).toBeUndefined()
  })
})