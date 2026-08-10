import { describe, it, expect } from 'vitest'
import { getLevel } from '../core/entity-utils'
import { entitySystem } from '../core/entity-system'

// 注释：Phase H 集成测试——核心公式 + h-state 生命周期
// 完整的端到端 H 流程测试需要 browser 环境，这里测可独立验证的部分

describe('Phase H 集成测试', () => {
  it('G1 饥饿行动级结算：erArk 系数公式（2-hp/max × 2-mp/max），仅行动级增长', async () => {
    // G1 决策 2026-08-09：饥饿增长收敛到行动级（hunger-system hour_changed 增长已删——
    // 双轨=双倍）。公式对齐 erArk realtime_settle.py:126-135
    const { realtimeSettle } = await import('../core/realtime-settle')
    // 满血角色（系数 2-1=1 × 2-1=1）→ 10 分钟：floor(10×rand(0.8~1.2)×1×1) ∈ [8,12]
    entitySystem.register('character', 'hunger_test_full', {
      id: 'hunger_test_full', name: '满血',
      base: { 体力: 100, 体力上限: 100, 气力: 100, 气力上限: 100, 饥饿值: 0 },
    })
    realtimeSettle(entitySystem.get('character', 'hunger_test_full') as any, 10)
    const full = entitySystem.get('character', 'hunger_test_full') as any
    expect(full.base['饥饿值']).toBeGreaterThanOrEqual(8)
    expect(full.base['饥饿值']).toBeLessThanOrEqual(12)
    // 濒死角色（hp=0 → 系数 2-0=2，mp=0 → 2）→ 10 分钟：floor(10×rand×4) ∈ [32,48]
    entitySystem.register('character', 'hunger_test_low', {
      id: 'hunger_test_low', name: '濒死',
      base: { 体力: 0, 体力上限: 100, 气力: 0, 气力上限: 100, 饥饿值: 0 },
    })
    realtimeSettle(entitySystem.get('character', 'hunger_test_low') as any, 10)
    const low = entitySystem.get('character', 'hunger_test_low') as any
    expect(low.base['饥饿值']).toBeGreaterThanOrEqual(32)
    expect(low.base['饥饿值']).toBeLessThanOrEqual(48)
    // 上限 240 钳制
    entitySystem.register('character', 'hunger_test_cap', {
      id: 'hunger_test_cap', name: '封顶',
      base: { 体力: 100, 体力上限: 100, 气力: 100, 气力上限: 100, 饥饿值: 235 },
    })
    realtimeSettle(entitySystem.get('character', 'hunger_test_cap') as any, 600)
    expect((entitySystem.get('character', 'hunger_test_cap') as any).base['饥饿值']).toBe(240)
    entitySystem.clear()
  })

  it('getLevel 查阈值表正确', () => {
    const thresholds = [0, 100, 500, 1000, 2500]
    expect(getLevel(0, thresholds)).toBe(0)
    expect(getLevel(99, thresholds)).toBe(0)
    expect(getLevel(100, thresholds)).toBe(1)
    expect(getLevel(500, thresholds)).toBe(2)
    expect(getLevel(2500, thresholds)).toBe(4)
    expect(getLevel(99999, thresholds)).toBe(4)
  })

  it('calcJudge 公式正确', async () => {
    const { calcJudge } = await import('../plugins/h-core/settle/judge')
    const r1 = calcJudge(100, 5000, 100)
    // 注释：好感LV5(→+100)，信赖LV4(→+100)，total=100+100+100=300>100 → success
    expect(r1.success).toBe(true)

    const r2 = calcJudge(100, 30, 0)
    // 注释：好感LV0(+0)信赖LV0(+0) total=100 → success
    expect(r2.success).toBe(true)

    const r3 = calcJudge(500, 0, 0)
    // 注释：total=500 >= 500 → success（基准越高越难失败）
    expect(r3.success).toBe(true)
  })

  it('calcFavorability 基础值返回', async () => {
    const { calcFavorability } = await import('../plugins/h-core/settle/favorability')
    // TODO: 需要角色实体测试完整公式
    expect(calcFavorability('player', 10)).toBe(10)
    expect(calcFavorability('player', 0)).toBe(0)
  })

  it('orgasm 二段结算——状态等级与普通高潮', async () => {
    const { getStatusLevel, ORGASM_PART_ATTR } = await import('../plugins/h-core/settle/orgasm')
    // 状态等级阈值（Character_State_Level.csv）
    expect(getStatusLevel(0)).toBe(0)
    expect(getStatusLevel(99)).toBe(0)
    expect(getStatusLevel(100)).toBe(1)
    expect(getStatusLevel(499)).toBe(1)
    expect(getStatusLevel(100000)).toBe(10)
    // 部位映射完整性（属性名以 attributes.toml 为准）
    expect(ORGASM_PART_ATTR[0]).toBe('皮肤')
    expect(ORGASM_PART_ATTR[5]).toBe('后穴')
    expect(ORGASM_PART_ATTR[23]).toBe('心理')
  })

  it('orgasm 二段结算——settleOrgasm 触发绝顶并推进等级', async () => {
    const { settleOrgasm } = await import('../plugins/h-core/settle/orgasm')
    const { entitySystem } = await import('../core/entity-system')
    // 注册测试角色：h_state 就绪，阴道快感等级已到 3（前记录 2）
    entitySystem.register('character', 'orgasm_test_1', {
      id: 'orgasm_test_1', name: '测试角色',
      h_state: {
        is_h: true,
        orgasm_level: { 4: 2 },  // 阴道前等级 2
        orgasm_edge: 0,
        extra_orgasm_feel: {},
        extra_orgasm_count: 0,
        orgasm_edge_count: {},
        time_stop_orgasm_count: {},
        plural_orgasm_set: [],
      },
      params: { 阴道: 2500 },  // 等级 3（阈值 2500）
      abilities: { 阴道感度: { level: 3 } },
    })
    const result = settleOrgasm('orgasm_test_1', { 4: 1 }, {}, {})
    // 阴道等级 2→3 → 触发 1 次普通高潮
    expect(result.orgasms.length).toBeGreaterThanOrEqual(1)
    const org = result.orgasms.find(e => e.partId === 4)
    expect(org).toBeDefined()
    // 等级推进：orgasm_level[4] 应为 3
    const char = entitySystem.get('character', 'orgasm_test_1') as any
    expect(char.h_state.orgasm_level[4]).toBe(3)
    entitySystem.clear()
  })

  it('orgasm 二段结算——玩家射精欲满触发 shouldEjaculate 标记', async () => {
    const { orgasmJudge } = await import('../plugins/h-core/settle/orgasm')
    const { entitySystem } = await import('../core/entity-system')
    entitySystem.register('character', '0', {
      id: '0', name: '玩家',
      base: { 射精欲: 1500, 射精欲上限: 1000, 精液量: 100 },
      h_state: { is_h: true, orgasm_level: {}, orgasm_edge: 0 },
      params: {},
    })
    const result = await orgasmJudge('0')
    expect(result.shouldEjaculate).toBe(true)
    entitySystem.clear()
  })

  it('orgasm 二段结算——射精欲满但精液量≤2 → 无精液高潮（不射精，射精欲归零）', async () => {
    const { orgasmJudge } = await import('../plugins/h-core/settle/orgasm')
    const { entitySystem } = await import('../core/entity-system')
    entitySystem.register('character', '0', {
      id: '0', name: '玩家',
      base: { 射精欲: 1500, 射精欲上限: 1000, 精液量: 0, 额外精液量: 2 },
      h_state: { is_h: true, orgasm_level: {}, orgasm_edge: 0, endure_not_shoot_count: 3 },
      params: {},
    })
    const result = await orgasmJudge('0')
    expect(result.shouldEjaculate).toBe(false)
    const char = entitySystem.get('character', '0') as any
    expect(char.base['射精欲']).toBe(0)
    expect(char.h_state.endure_not_shoot_count).toBe(0)
    entitySystem.clear()
  })

  it('orgasm 二段结算——pending_orgasm_feel 累积驱动 extra 高潮', async () => {
    const { orgasmJudge, accumulateOrgasmFeel } = await import('../plugins/h-core/settle/orgasm')
    const { entitySystem } = await import('../core/entity-system')
    // 阴道已 10 级，preData=10 → extra 分支；pending 累积 20000+ 触发额外高潮
    entitySystem.register('character', 'orgasm_extra_1', {
      id: 'orgasm_extra_1', name: '测试角色',
      h_state: {
        is_h: true,
        orgasm_level: { 4: 10 },
        orgasm_edge: 0,
        extra_orgasm_feel: {},
        extra_orgasm_count: 0,
        orgasm_edge_count: {},
        time_stop_orgasm_count: {},
        plural_orgasm_set: [],
        pending_orgasm_feel: {},
      },
      params: { 阴道: 100000 },
      abilities: { 阴道感度: { level: 3 } },
    })
    const char = entitySystem.get('character', 'orgasm_extra_1') as any
    // 模拟 settle_state 写入 25000 快感变化
    accumulateOrgasmFeel(char, 4, 25000)
    const result = await orgasmJudge('orgasm_extra_1')
    // 25000 ≥ 20000×0.9^0 → extraAdd=1，触发额外高潮
    const extraOrg = result.orgasms.find(e => e.extra)
    expect(extraOrg).toBeDefined()
    expect(char.h_state.extra_orgasm_count).toBeGreaterThanOrEqual(1)
    // pending 已消耗
    expect(char.h_state.pending_orgasm_feel?.[4] ?? 0).toBe(0)
    entitySystem.clear()
  })

  it('orgasm 二段结算——寸止失败解放重结算', async () => {
    const { orgasmJudge } = await import('../plugins/h-core/settle/orgasm')
    const { entitySystem } = await import('../core/entity-system')
    // 玩家技巧低 + 被结算角色自己寸止计数高 → 必定失败 → 解放
    // 2026-08-08 对齐：寸止计数归属 = 被结算角色自己（原误用玩家计数）
    entitySystem.register('character', '0', {
      id: '0', name: '玩家',
      base: { 射精欲: 500, 射精欲上限: 1000 },
      abilities: { 技巧: { level: 1 } },
      h_state: { is_h: true, orgasm_level: {}, orgasm_edge: 1, orgasm_edge_count: {} },
      params: {},
    })
    entitySystem.register('character', 'orgasm_edge_1', {
      id: 'orgasm_edge_1', name: '测试角色',
      h_state: {
        is_h: true,
        orgasm_level: { 4: 2 },
        orgasm_edge: 1,           // 寸止中
        orgasm_edge_count: { 4: 3 },  // 自己累计 3 → 平方和 9 > 技巧1×3 → 必失败
        extra_orgasm_feel: {},
        extra_orgasm_count: 0,
        time_stop_orgasm_count: {},
        plural_orgasm_set: [],
      },
      params: { 阴道: 2500 },
      abilities: { 阴道感度: { level: 3 } },
    })
    const result = await orgasmJudge('orgasm_edge_1')
    // 重结算：历史累计 3 → 解放路径 roll_count 压缩 → 1 条超强（感度 3 < 6 → 强）
    expect(result.orgasms.length).toBe(1)
    expect(result.orgasms[0].degree).toBe(2)
    const char = entitySystem.get('character', 'orgasm_edge_1') as any
    // 解放后 edge 应为 2（重结算完成）
    expect(char.h_state.orgasm_edge).toBe(2)
    // 2026-08-08 审查加强：失败重结算后累计计数清空（原残留 → 退出 H 二次释放双倍结算）
    expect(char.h_state.orgasm_edge_count[4]).toBe(0)
    // 本次 normal 丢弃（orgasm_level 未更新——erArk 失败时本次等级差不入账，下次补算）
    expect(char.h_state.orgasm_level[4]).toBe(2)
    entitySystem.clear()
  })

  it('射精系统——忍耐判定（技巧高时必忍，超出后 0.15×超限概率失败）', async () => {
    const { judgeOrgasmEdgeSuccess } = await import('../plugins/h-core/settle/orgasm')
    // 技巧3×3=9 ≥ 计数平方和4 → 必成功
    expect(judgeOrgasmEdgeSuccess({ 4: 2 }, 3)).toBe(true)
    // 技巧0×3=0 < 计数平方和9 → 0.15×9=1.35 → 成功率 0 → 必失败（2026-08-08 对齐 0.15）
    expect(judgeOrgasmEdgeSuccess({ 4: 3 }, 0)).toBe(false)
  })

  it('射精系统——睡眠额外精液累积（realtime-settle）', async () => {
    const { realtimeSettle } = await import('../core/realtime-settle')
    const { entitySystem } = await import('../core/entity-system')
    entitySystem.register('character', 'semen_test_1', {
      id: 'semen_test_1', name: '玩家',
      base: { 精液量: 80, 精液量上限: 100, 额外精液量: 0 },
      h_state: { is_h: false },
    })
    // 睡 8 小时（480分钟 ≥ 360）
    realtimeSettle(entitySystem.get('character', 'semen_test_1') as any, 480, { isSleep: true })
    const char = entitySystem.get('character', 'semen_test_1') as any
    // 额外精液 = 0 + 80/2 = 40
    expect(char.base['额外精液量']).toBe(40)
    // 今日首射标记已重置
    expect(char.action_info?.day_first_shoot_semen).toBe(true)
    entitySystem.clear()
  })

  it('calcTrust 信赖度（复刻 calculation_trust，common_default.py:752-813）', async () => {
    const { calcTrust } = await import('../plugins/h-core/settle/trust')
    // 注释：素质修正读 mod.talentDefs——先加载 mod（测试环境无 h-core onEnable 的索引重建）
    const { modLoader } = await import('../core/mod-loader')
    await modLoader.loadMod('test-mod')
    entitySystem.register('character', 'trust_npc', { id: 'trust_npc', base: {}, talents: {} })
    // 注释：10 分钟行为 → 10/60×1.0（float，erArk 同）
    expect(calcTrust('trust_npc', 10)).toBeCloseTo(10 / 60)
    // 注释：60 分钟行为 → 1
    expect(calcTrust('trust_npc', 60)).toBeCloseTo(1)
    // 注释：思慕 +0.25 → 60/60×1.25
    ;(entitySystem.get('character', 'trust_npc') as any).talents = { 思慕: 1 }
    expect(calcTrust('trust_npc', 60)).toBeCloseTo(1.25)
    entitySystem.clear()
  })

  it('calcStateChange 状态值变化', async () => {
    const { calcStateChange } = await import('../plugins/h-core/settle/state')
    // 注释：能力LV0→系数1.0
    expect(calcStateChange(100, 0, [1.0, 1.1, 1.25])).toBe(100)
    // 注释：能力LV1→系数1.1
    expect(calcStateChange(100, 1, [1.0, 1.1, 1.25])).toBe(110)
    // 注释：能力LV2→系数1.25
    expect(calcStateChange(100, 2, [1.0, 1.1, 1.25])).toBe(125)
  })

  it('gainExperience 经验结算', async () => {
    const { gainExperience } = await import('../plugins/h-core/settle/experience')
    expect(gainExperience(100, 0, 0)).toBe(100)
    // 注释：加成 50%
    expect(gainExperience(100, 0.5, 0)).toBe(150)
    // 注释：双重加成
    expect(gainExperience(100, 0.5, 0.2)).toBe(170)
  })

  it('射精系统 effect types 注册（需加载插件）', async () => {
    const { effectTypeRegistry } = await import('../core/effect-type-registry')
    // 注释：effect types 由插件 onLoad 注册——测试不加载插件时默认 false
    // TODO: 集成测试改为加载插件后验证
    expect(effectTypeRegistry.has('eja_add')).toBe(false)
    expect(effectTypeRegistry.has('eja_climax')).toBe(false)
    expect(effectTypeRegistry.has('eja_shoot')).toBe(false)
  })

  it('h-core effect types 注册（需加载插件）', async () => {
    const { effectTypeRegistry } = await import('../core/effect-type-registry')
    expect(effectTypeRegistry.has('h_state_change')).toBe(false)
    expect(effectTypeRegistry.has('h_favorability')).toBe(false)
    expect(effectTypeRegistry.has('h_start_h')).toBe(false)
    expect(effectTypeRegistry.has('h_end_h')).toBe(false)
  })

  it('calcJudge judge_class 特殊修正——处女惩罚（L1.6 §10.4）', async () => {
    const { modLoader } = await import('../core/mod-loader')
    const { entitySystem } = await import('../core/entity-system')
    const { calcJudge } = await import('../plugins/h-core/settle/judge')
    entitySystem.clear()
    await modLoader.loadMod('test-mod')

    // 注册测试角色：仍处（无 first_times 记录）、无性无知
    entitySystem.register('character', 'judge_test_virgin', {
      id: 'judge_test_virgin', name: '处女测试',
      base: {}, talents: { 性无知: 0 },
    })
    // 已破处角色（first_times.virgin_V = true）
    entitySystem.register('character', 'judge_test_broken', {
      id: 'judge_test_broken', name: '已破测试',
      base: {}, talents: { 性无知: 0 },
      first_times: { virgin_V: true },
    })
    // 性无知角色
    entitySystem.register('character', 'judge_test_ignorant', {
      id: 'judge_test_ignorant', name: '性无知测试',
      base: {}, talents: { 性无知: 1 },
    })

    // 基准 500（性交类）+ 处女惩罚 -250 → 250 < 500 → 判定失败
    const virgin = calcJudge(500, 0, 0, 'judge_test_virgin', '性交')
    expect(virgin.success).toBe(false)
    expect(virgin.retreated).toBe(true)
    // 无 judge_class → 不查修正表 → 500 >= 500 → 成功
    expect(calcJudge(500, 0, 0, 'judge_test_virgin').success).toBe(true)
    // 已破处 → 无惩罚 → 成功
    expect(calcJudge(500, 0, 0, 'judge_test_broken', '性交').success).toBe(true)
    // 性无知 → 免罚（erArk handle_self_sexual_ignorance_0 语义）→ 成功
    expect(calcJudge(500, 0, 0, 'judge_test_ignorant', '性交').success).toBe(true)
    // 亲吻类：基准 250 - 初吻惩罚 125 = 125 < 250 → 失败；已吻（virgin_KISS=true）→ 成功
    const kiss = calcJudge(250, 0, 0, 'judge_test_virgin', '亲吻')
    expect(kiss.success).toBe(false)
    entitySystem.get('character', 'judge_test_virgin')!.first_times = { virgin_KISS: true }
    expect(calcJudge(250, 0, 0, 'judge_test_virgin', '亲吻').success).toBe(true)

    entitySystem.clear()
  })

  it('mergeJudgeResult 多目标最坏者胜出（retreated > partial > success）', async () => {
    const { mergeJudgeResult } = await import('../plugins/h-core/settle/judge')
    const S = { success: true, partial: false, retreated: false }
    const P = { success: false, partial: true, retreated: false }
    const R = { success: false, partial: false, retreated: true }
    // success 不覆盖 partial/retreated
    expect(mergeJudgeResult(S, P)).toBe(P)
    expect(mergeJudgeResult(P, S)).toBe(P)
    expect(mergeJudgeResult(S, R)).toBe(R)
    expect(mergeJudgeResult(P, R)).toBe(R)
    expect(mergeJudgeResult(R, S)).toBe(R)
    expect(mergeJudgeResult(R, P)).toBe(R)
    // success 保持
    expect(mergeJudgeResult(S, S)).toBe(S)
  })

  it('calcJudge 天赋个性修正只对 S 类判定生效（亲吻 D 类不吃，erArk 162-178 行）', async () => {    const { modLoader } = await import('../core/mod-loader')
    const { entitySystem } = await import('../core/entity-system')
    const { calcJudge } = await import('../plugins/h-core/settle/judge')
    entitySystem.clear()
    await modLoader.loadMod('test-mod')

    // 亲吻(D 类)：仍处 + 淫乱/性好奇 → 正确行为 total=250-125=125 < 150(60%) → retreated
    // 若误吃天赋修正：125+50+30=205 → partial（判别点）
    entitySystem.register('character', 'judge_dtype', {
      id: 'judge_dtype', name: 'D类测试',
      base: {}, talents: { 性无知: 0, 淫乱: 1, 性好奇: 1 },
    })
    const kissD = calcJudge(250, 0, 0, 'judge_dtype', '亲吻')
    expect(kissD.success).toBe(false)
    expect(kissD.retreated).toBe(true)
    expect(kissD.partial).toBe(false)

    // 口交(S 类)：讨厌男性 -30 + 淫乱 +50 → total=451-30+50=471 ≥ 451 → success
    // 若 S 门控丢失：421 → retreated
    entitySystem.register('character', 'judge_stype', {
      id: 'judge_stype', name: 'S类测试',
      base: {}, talents: { 讨厌男性: 1, 淫乱: 1 },
    })
    const oralS = calcJudge(451, 0, 0, 'judge_stype', '口交')
    expect(oralS.success).toBe(true)

    entitySystem.clear()
  })

  it('指令加载器——无 h_ 前缀、premises 独立字段、judge_check 自动注入', async () => {
    const { modLoader } = await import('../core/mod-loader')
    const { entitySystem } = await import('../core/entity-system')
    const { commandRegistry } = await import('../core/command-registry')
    const { loadInstructions } = await import('../plugins/instruction-loader')
    const { injectJudgeCheck } = await import('../plugins/instruction-loader')
    entitySystem.clear()
    await modLoader.loadMod('test-mod')
    commandRegistry.clear()
    loadInstructions()

    // 无 h_ 前缀（h-instructions 已收敛，test-mod rest/wait 直接注册）
    const rest = commandRegistry.getById('rest')
    expect(rest).toBeDefined()
    expect(rest!.id.startsWith('h_')).toBe(false)
    // premises 独立字段（不再拼接 premises: 字符串）
    expect(rest!.premises).toEqual(['NOT_H', 'TIRED_LE_84'])
    expect(rest!.condition).toBeUndefined()
    expect(rest!.category).toBe('daily')
    // effects 保持原样 + 无 judge 注入
    expect(rest!.effects?.some((e: any) => e.type === 'judge_check')).toBe(false)

    // judge_check 注入纯函数：有 judge_base → 置顶注入；无 → 原样
    const injected = injectJudgeCheck(
      { id: 'x', label: 'x', type: 'sex', judge_base: 500, judge_class: '性交' },
      [{ type: 'settle_state', params: { state: '快乐', baseValue: 30 } }],
    )
    expect(injected[0]).toEqual({ type: 'judge_check', params: { base: 500, judge_class: '性交' } })
    expect(injected[1].type).toBe('settle_state')
    const noJudge = injectJudgeCheck({ id: 'y', label: 'y', type: 'sex' }, [])
    expect(noJudge).toEqual([])

    // 端到端：spec schema 字段（category/judge_base/judge_class）+ judge_check 注入
    const judgeCmd = commandRegistry.getById('test_judge_cmd')
    expect(judgeCmd).toBeDefined()
    expect(judgeCmd!.category).toBe('obscenity')
    expect(judgeCmd!.modes).toEqual(['exploration'])
    expect(judgeCmd!.premises).toEqual(['HAVE_TARGET', 'NOT_H'])
    expect(judgeCmd!.condition).toBe('location.tags.has_bedroom == true')
    expect(judgeCmd!.effects?.[0]).toEqual({ type: 'judge_check', params: { base: 200, judge_class: '亲吻' } })
    expect(judgeCmd!.effects?.[1].type).toBe('nop')

    commandRegistry.clear()
  })

  it('validateInstructionData——condition 引用未注册字段 → error + 注销该指令', async () => {
    const { modLoader } = await import('../core/mod-loader')
    const { entitySystem } = await import('../core/entity-system')
    const { commandRegistry } = await import('../core/command-registry')
    const { errorReporter } = await import('../core/error-reporter')
    const { loadInstructions, validateInstructionData } = await import('../plugins/instruction-loader')
    const { conditionRegistry } = await import('../core/condition-registry')
    entitySystem.clear()
    await modLoader.loadMod('test-mod')
    // 注释：补齐 main.ts 会做的 condition 注册（属性/绑定）
    const mod = modLoader.getMod()!
    conditionRegistry.clear()
    conditionRegistry.registerFromAttributes(mod.attributes)
    conditionRegistry.registerFromBindings(mod.bindings)

    // 注入一条引用未注册字段的坏指令
    ;(mod.instructions as any[]).push({
      id: 'bad_cond_cmd', label: '坏条件指令', type: 'daily', time_cost: 10,
      condition: 'location.bogus_field == 1',
    })
    // 注释：注册 h-core 前提（镜像 onEnable 行为，NOT_H/HAVE_TARGET/TIRED_LE_84；
    // 2026-08-11 补 registerInstructPremises——h-npc-ai 逆推指令的 T_NPC_ACTIVE_H 域）
    const { premiseRegistry } = await import('../core/premise-registry')
    const { registerHPremises } = await import('../plugins/h-core/premise/premise-h')
    const { registerInstructPremises } = await import('../plugins/h-core/premise/premise-instruct')
    registerHPremises(premiseRegistry)
    registerInstructPremises(premiseRegistry)
    commandRegistry.clear()
    errorReporter.clear()
    loadInstructions()
    expect(commandRegistry.getById('bad_cond_cmd')).toBeDefined()

    validateInstructionData()
    const errors = errorReporter.getErrors()
    expect(errors.some(e => e.severity === 'error' && e.message.includes('bad_cond_cmd') && e.message.includes('bogus_field'))).toBe(true)
    // 坏指令被注销，好指令保留
    expect(commandRegistry.getById('bad_cond_cmd')).toBeUndefined()
    expect(commandRegistry.getById('rest')).toBeDefined()
    // 无未注册前提警告（test-mod 指令前提均已注册）
    expect(errors.some(e => e.severity === 'warning' && e.message.includes('未注册前提'))).toBe(false)

    commandRegistry.clear()
  })

  it('指令注册单条失败（id 重复）→ 报告 + 跳过该条，不拖垮整批', async () => {
    const { modLoader } = await import('../core/mod-loader')
    const { entitySystem } = await import('../core/entity-system')
    const { commandRegistry } = await import('../core/command-registry')
    const { errorReporter } = await import('../core/error-reporter')
    const { loadInstructions } = await import('../plugins/instruction-loader')
    entitySystem.clear()
    await modLoader.loadMod('test-mod')
    errorReporter.clear()

    // 预注册同名指令制造重复
    commandRegistry.clear()
    commandRegistry.register({
      id: 'rest', label: '假 rest', group: 'character_commands',
      modes: ['exploration'], source: 'test',
    })
    loadInstructions()

    const errors = errorReporter.getErrors()
    expect(errors.some(e => e.message.includes('rest') && e.message.includes('注册失败'))).toBe(true)
    // 其余指令仍注册成功（rest 被占位，wait/test_judge_cmd 不受影响）
    expect(commandRegistry.getById('wait')).toBeDefined()
    expect(commandRegistry.getById('test_judge_cmd')).toBeDefined()

    commandRegistry.clear()
  })

  it('端到端——judge 退缩时 settle_* 跳过（effect-system + h-core 全链路）', async () => {
    const { modLoader } = await import('../core/mod-loader')
    const { entitySystem } = await import('../core/entity-system')
    const { commandRegistry } = await import('../core/command-registry')
    const { commandExecutor } = await import('../core/command-executor')
    const { apiSystem } = await import('../core/api')
    const { narrativeLog } = await import('../core/narrative-log')
    const { onLoad: hCoreOnLoad } = await import('../plugins/h-core/index')
    const { onLoad: effectOnLoad, onEnable: effectOnEnable } = await import('../plugins/effect-system/index')
    entitySystem.clear()
    narrativeLog.clear()
    await modLoader.loadMod('test-mod')

    // 注释：镜像 boot——effect-system/h-core 的 effect type 注册进全局 registry + apiSystem
    const stubCtx: any = { api: apiSystem, events: { on: () => {}, off: () => {} }, commands: { register: () => {} }, ui: { registerSlot: () => {} } }
    effectOnLoad(stubCtx)
    effectOnEnable(stubCtx)
    hCoreOnLoad(stubCtx)

    // 目标角色：仍处（无 first_times）、无性无知（base 按 attributes.toml 默认初始化，镜像 applyAttributeDefaults）
    entitySystem.register('character', 'e2e_target', {
      id: 'e2e_target', name: 'E2E目标',
      base: { 好感度: 0, 快乐: 0 },
      talents: { 性无知: 0 },
    })

    commandRegistry.clear()
    commandRegistry.register({
      id: 'e2e_kiss', label: 'E2E亲吻', group: 'character_commands', modes: ['exploration'],
      category: 'obscenity', timeCost: 10, source: 'instructions',
      effects: [
        { type: 'judge_check', params: { base: 250, judge_class: '亲吻' } },
        { type: 'settle_state', params: { state: '快乐', baseValue: 30 } },
        { type: 'nop' },
      ],
    })

    const execCtx = {
      uiStore: { selectedCharacterId: 'e2e_target' },
      gameStore: {},
      api: apiSystem,
      engine: { setExecutionState: () => {}, emit: async () => {} },
      evaluateCondition: () => true,
      evaluatePremises: () => true,
      sourceId: 'player',
    }

    // 注释：仍处 → 初吻惩罚 -125 → 250-125=125 < 250 → 退缩 → settle_state 跳过
    await commandExecutor.execute('e2e_kiss', execCtx)
    const char1 = entitySystem.get('character', 'e2e_target') as any
    expect(char1.base['快乐'] ?? 0).toBe(0)
    expect(narrativeLog.getEntries().some((e: any) => String(e.text).includes('退缩'))).toBe(true)

    // 注释：已吻（virgin_KISS=true）→ 无惩罚 → 250 >= 250 → 成功 → settle_state 生效（tc10+bv30=40 × 系数1.0）
    ;(char1 as any).first_times = { virgin_KISS: true }
    await commandExecutor.execute('e2e_kiss', execCtx)
    const char2 = entitySystem.get('character', 'e2e_target') as any
    expect(char2.base['快乐']).toBe(40)

    commandRegistry.clear()
    entitySystem.clear()
  })

  it('eja_shoot 直接射精链路：精液扣减 + just_shoot/day_first/last_eaj 写入（2026-08-09 审查修复）', async () => {
    // 2026-08-09 审查发现：eja_shoot 原缺精液扣减/标记（与 eja_climax 不一致）——
    // 未来 B3 指令用上时射精不扣精液 + G3 射精欲消退永不触发 = 静默失效
    const { effectTypeRegistry } = await import('../core/effect-type-registry')
    const { onLoad: ejOnLoad } = await import('../plugins/h-ejaculation/index')
    const { gameContext, gameTimeToTotalMinutes } = await import('../core/game-context')
    effectTypeRegistry.clear()
    ejOnLoad({} as any)
    entitySystem.register('character', 'shooter', {
      id: 'shooter', base: { 精液量: 80, 精液量上限: 100 },
      action_info: { day_first_shoot_semen: true },
      h_state: { is_h: true, target_character_id: 'shooter', insert_position: 0 },
    })
    await effectTypeRegistry.getHandler('eja_shoot')!(
      { level: 'normal', positionId: 6 },
      { _targetIds: ['shooter'] } as any,
    )
    const ch = entitySystem.get('character', 'shooter') as any
    expect(ch.base['精液量']).toBeLessThan(80) // 精液扣减
    expect(ch.h_state.just_shoot).toBe(1)
    expect(ch.action_info.day_first_shoot_semen).toBe(false)
    expect(ch.action_info.last_eaj_add_time).toBe(gameTimeToTotalMinutes(gameContext.getContext().time))
    // 插入位置重置（射精后）
    expect(ch.h_state.insert_position).toBe(-1)
    effectTypeRegistry.clear()
    entitySystem.clear()
  })
})
